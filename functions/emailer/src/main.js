import { createTransport } from 'nodemailer';
import process from "node:process";

export default async ({ req, res, log, error }) => {
    log('Processing email request...');
    
    try {
        // Parse payload
        const payload = req.payload
            ? (typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload)
            : (req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : null);

        if (!payload) {
            error("No payload provided");
            return res.json({ success: false, message: "No payload provided" }, 400);
        }

        log('Payload received: ' + JSON.stringify(payload));

        const { to, subject, html, text, imageData, coordinates, notes } = payload;

        if (!to || !subject || !html) {
            error("Missing required fields");
            return res.json({ success: false, message: "Missing required fields (to, subject, html)" }, 400);
        }

        // Check environment variables
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
            error("Missing SMTP configuration");
            return res.json({ success: false, message: "SMTP not configured" }, 500);
        }

        // Remove Google Maps links from HTML
        let emailHtml = html.replace(/<a[^>]*href="https?:\/\/www\.google\.com\/maps[^>]*>.*?<\/a>/gi, '');

        // Prepare email data
        const emailData = {
            from: process.env.SMTP_FROM || 'no-reply@example.com',
            to: Array.isArray(to) ? to : [to],
            subject,
            html: emailHtml,
            text,
            attachments: []
        };

        // Add image attachment if provided
        if (imageData) {
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

        // Add additional details
        let detailsHtml = '';
        if (coordinates || notes) {
            detailsHtml += `<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;"><p><strong>Additional Details:</strong></p>`;
        }

        if (coordinates) {
            if (typeof coordinates === 'string' && coordinates.includes(',')) {
                const [lat, lon] = coordinates.split(',').map(s => s.trim());
                if (lat && lon) {
                    detailsHtml += `<p><strong>Serve Attempt Coordinates:</strong> <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank">${coordinates}</a></p>`;
                }
            }
        }

        if (notes) {
            detailsHtml += `<p><strong>Notes:</strong> ${notes}</p>`;
        }

        // Append details to HTML
        if (emailData.html.includes('</body>')) {
            emailData.html = emailData.html.replace('</body>', `${detailsHtml}</body>`);
        } else {
            emailData.html += detailsHtml;
        }

        // Create transporter
        const transporter = createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        log('Sending email...');
        const result = await transporter.sendMail(emailData);
        log('Email sent successfully: ' + JSON.stringify(result));
        
        return res.json({ success: true, message: "Email sent successfully", messageId: result.messageId });

    } catch (err) {
        error('Email function error: ' + err.message);
        log('Full error: ' + JSON.stringify(err));
        return res.json({ success: false, message: `Error: ${err.message}` }, 500);
    }
};
