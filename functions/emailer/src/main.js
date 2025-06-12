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

        // This will hold the final email content
        const emailData = {
            from: process.env.SMTP_FROM || 'no-reply@example.com',
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            text,
            attachments: []
        };

        // This will store the coordinates after we fetch them
        let coordinates = null; 

        // If serveId is provided, fetch the document
        if (serveId) {
            log(`Fetching serve attempt with ID: ${serveId}`);
            try {
                const serve = await databases.getDocument(
                    process.env.APPWRITE_FUNCTION_DATABASE_ID,
                    process.env.APPWRITE_FUNCTION_SERVE_ATTEMPTS_COLLECTION_ID,
                    serveId
                );

                // **FIX 1: Get coordinates from the fetched document**
                if (serve.coordinates) {
                    coordinates = serve.coordinates;
                    log(`Found coordinates: ${coordinates}`);
                } else {
                    log('No coordinates found in serve attempt document');
                }

                // Attach the image if it exists
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
                    log('Image successfully attached from serve document');
                } else {
                    log('No image_data found in serve attempt document');
                }
            } catch (fetchError) {
                error('Failed to fetch serve attempt document:', fetchError.message);
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
            log('Image successfully attached using provided imageData');
        }

        // **FIX 2: Format the coordinates and notes to be inserted into the email**
        let coordsHtml = '';
        let coordsText = '';
        if (coordinates) {
            const [lat, lon] = String(coordinates).split(',').map(s => s.trim());
            coordsHtml = `<p><strong>GPS Coordinates:</strong> <a href="https://www.google.com/maps?q=${lat},${lon}">${coordinates}</a></p><p><strong>Latitude:</strong> ${lat}<br><strong>Longitude:</strong> ${lon}</p>`;
            coordsText = `\nGPS Coordinates: ${coordinates}\nLatitude: ${lat}\nLongitude: ${lon}\n`;
        }
        
        let notesHtml = '';
        let notesText = '';
        if (notes) {
            notesHtml = `<p><strong>Notes:</strong> ${notes}</p>`;
            notesText = `\nNotes: ${notes}\n`;
        }

        // **FIX 3: Inject the new HTML and text into the email body**
        if (emailData.html) {
             if (emailData.html.includes('</body>')) {
                 emailData.html = emailData.html.replace('</body>', `${coordsHtml}${notesHtml}</body>`);
             } else {
                 emailData.html += coordsHtml + notesHtml;
             }
        } else {
            emailData.html = coordsHtml + notesHtml;
        }

        emailData.text = (emailData.text || '') + coordsText + notesText;

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
        error(err.message);
        return res.json({ success: false, message: `Error: ${err.message}` });
    }
};
```

### Summary of the Fixes:

1.  **Read Coordinates:** After fetching the `serve` document, the code now explicitly checks for `serve.coordinates` and stores the value.
2.  **Format Content:** It creates new HTML and plain text snippets for the GPS coordinates (including a proper Google Maps link) and any notes you passed in the payload.
3.  **Inject Content:** It intelligently adds this new information to the end of your email's HTML and text content before sending.

Deploy this updated function, and it should now correctly include the GPS data in your emai
