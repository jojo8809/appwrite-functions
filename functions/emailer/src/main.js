import nodemailer from 'nodemailer';
import process from "node:process";
import { Client, Databases } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
    log('Processing request...');
    try {
        // Get payload from request
        const payload = req.payload
            ? (typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload)
            : (req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : null);

        if (!payload) {
            return res.json({ success: false, message: "No payload provided" });
        }

        // Log the entire payload to help with debugging
        log(`Received payload: ${JSON.stringify(payload)}`);

        // Destructure all expected properties from the payload
        const { to, subject, html, text, serveId, imageData, notes } = payload;

        if (!to || !subject || (!html && !text)) {
            return res.json({ success: false, message: "Missing required fields (to, subject, and either html or text)" });
        }

        const appwriteClient = new Client()
            .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
            .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
            .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

        const databases = new Databases(appwriteClient);

        // --- FIX: Proactively remove any placeholder map links from the template ---
        let emailHtml = html.replace(/<a[^>]*href="https?:\/\/www\.google\.com\/maps[^>]*>.*?<\/a>/gi, '');

        const emailData = {
            from: process.env.SMTP_FROM || 'no-reply@example.com',
            to: Array.isArray(to) ? to : [to],
            subject,
            html: emailHtml, // Use the cleaned HTML
            text,
            attachments: []
        };

        let coordinates = null;

        if (serveId) {
            log(`Fetching serve attempt with ID: ${serveId}`);
            try {
                const serve = await databases.getDocument(
                    process.env.APPWRITE_FUNCTION_DATABASE_ID,
                    process.env.APPWRITE_FUNCTION_SERVE_ATTEMPTS_COLLECTION_ID,
                    serveId
                );
                
                // Log the entire fetched document for debugging
                log(`Fetched document: ${JSON.stringify(serve)}`);

                if (serve.coordinates) {
                    coordinates = serve.coordinates;
                    log(`Found coordinates: ${coordinates}`);
                } else {
                    log('No coordinates found in serve attempt document');
                }

                if (serve.image_data) {
                    let base64Content = serve.image_data;
                    if (serve.image_data.includes('base64,')) {
                        base64Content = serve.image_data.split('base64,')[1];
                    }
                    emailData.attachments.push({
                        filename: 'serve_evidence.jpeg',
                        content: base64Content,
                        encoding: 'base64'
                    });
                }
            } catch (fetchError) {
                error(fetchError);
                return res.json({ success: false, message: 'Failed to fetch serve attempt document' }, 500);
            }
        } else if (imageData) {
            let base64Content = imageData;
            if (imageData.includes("base64,")) {
                base64Content = imageData.split("base64,")[1];
            }
            emailData.attachments.push({
                filename: 'serve_evidence.jpeg',
                content: base64Content,
                encoding: 'base64'
            });
        }

        let detailsHtml = '';
        let detailsText = '';

        if (coordinates || notes) {
            detailsHtml += `<hr><p><strong>Additional Details:</strong></p>`;
            detailsText += `\n\n---\nAdditional Details:\n`;
        }
        
        // --- FIX: Reordered to put GPS before Notes ---
        // GPS Block
        if (coordinates) {
            if (typeof coordinates === 'string' && coordinates.includes(',')) {
                const coordParts = coordinates.split(',');
                const lat = coordParts[0] ? coordParts[0].trim() : '';
                const lon = coordParts[1] ? coordParts[1].trim() : '';

                if (lat && lon) {
                    detailsHtml += `<p><strong>Serve Attempt Coordinates:</strong> <a href="https://www.google.com/maps?q=${lat},${lon}">${coordinates}</a></p>`;
                    detailsText += `Serve Attempt Coordinates: ${coordinates}\nView on Map: https://www.google.com/maps?q=${lat},${lon}\n`;
                } else {
                    detailsHtml += `<p><strong>Serve Attempt Coordinates:</strong> ${coordinates}</p>`;
                    detailsText += `Serve Attempt Coordinates: ${coordinates}\n`;
                }
            } else {
                detailsHtml += `<p><strong>Serve Attempt Coordinates:</strong> ${coordinates}</p>`;
                detailsText += `Serve Attempt Coordinates: ${coordinates}\n`;
            }
        }

        // Notes Block
        if (notes) {
            detailsHtml += `<p><strong>Notes:</strong> ${notes}</p>`;
            detailsText += `Notes: ${notes}\n`;
        }

        // Inject the new HTML and text into the email body
        if (emailData.html.includes('</body>')) {
            emailData.html = emailData.html.replace('</body>', `${detailsHtml}</body>`);
        } else {
            emailData.html += detailsHtml;
        }
        emailData.text = (emailData.text || '') + detailsText;

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        log("Sending email...");
        const response = await transporter.sendMail(emailData);
        log("Email sent successfully.");
        return res.json({ success: true, message: "Email sent successfully", data: response });

    } catch (err) {
        error(err);
        return res.json({ success: false, message: `Error: ${err.message}` });
    }
};
