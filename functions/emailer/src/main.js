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

        const emailData = {
            from: process.env.SMTP_FROM || 'no-reply@example.com',
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
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

                if (serve.coordinates) {
                    coordinates = serve.coordinates;
                    log(`Found coordinates: ${coordinates}`);
                } else {
                    log('No coordinates found in serve attempt document');
                }

                if (serve.image_data) {
                    log('Found image_data in serve attempt document');
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
            log("Using imageData provided in payload for attachment");
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

        // --- NEW: Create a dedicated section for GPS and Notes ---
        let detailsHtml = '';
        let detailsText = '';

        if (coordinates || notes) {
            detailsHtml += `<hr><p><strong>Additional Details:</strong></p>`;
            detailsText += `\n\n---\nAdditional Details:\n`;
        }
        
        // GPS Block
        if (coordinates) {
            // Defensive check to ensure coordinates is a string with a comma
            if (typeof coordinates === 'string' && coordinates.includes(',')) {
                const coordParts = coordinates.split(',');
                const lat = coordParts[0] ? coordParts[0].trim() : '';
                const lon = coordParts[1] ? coordParts[1].trim() : '';

                if (lat && lon) {
                    // If parsing is successful, show the raw coordinates and a link
                    detailsHtml += `<p><strong>GPS Coordinates:</strong> ${coordinates}</p>`;
                    detailsHtml += `<p><strong>View on Map:</strong> <a href="https://www.google.com/maps?q=${lat},${lon}">Click Here</a></p>`;
                    detailsText += `GPS Coordinates: ${coordinates}\nView on Map: https://www.google.com/maps?q=${lat},${lon}\n`;
                } else {
                    // Fallback if parsing gives empty lat/lon
                    detailsHtml += `<p><strong>GPS Coordinates:</strong> ${coordinates}</p>`;
                    detailsText += `GPS Coordinates: ${coordinates}\n`;
                }
            } else {
                 // Fallback if coordinates is not a string or has no comma
                detailsHtml += `<p><strong>GPS Coordinates:</strong> ${coordinates}</p>`;
                detailsText += `GPS Coordinates: ${coordinates}\n`;
            }
        }

        // Notes Block
        if (notes) {
            detailsHtml += `<p><strong>Notes:</strong> ${notes}</p>`;
            detailsText += `Notes: ${notes}\n`;
        }

        // Inject the new HTML and text into the email body
        if (emailData.html) {
             if (emailData.html.includes('</body>')) {
                 emailData.html = emailData.html.replace('</body>', `${detailsHtml}</body>`);
             } else {
                 emailData.html += detailsHtml;
             }
        } else {
            emailData.html = detailsHtml;
        }

        emailData.text = (emailData.text || '') + detailsText;

        // Configure Nodemailer transporter
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        // Send the email
        log("Sending email...");
        const response = await transporter.sendMail(emailData);
        log("Email sent successfully.");
        return res.json({ success: true, message: "Email sent successfully", data: response });

    } catch (err) {
        error(err);
        return res.json({ success: false, message: `Error: ${err.message}` });
    }
};
