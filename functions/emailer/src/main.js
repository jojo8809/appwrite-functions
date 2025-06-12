import nodemailer from 'nodemailer';
import process from "node:process";

// We no longer need the Appwrite SDK here because we are not accessing the database.
// import { Client, Databases } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
    log('Processing request...');
    try {
        const payload = req.payload
            ? (typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload)
            : (req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : null);

        if (!payload) {
            return res.json({ success: false, message: "No payload provided" });
        }

        // We get everything we need directly from the payload now.
        const { to, subject, html, text, imageData, coordinates, notes } = payload;

        if (!to || !subject || !html) {
            return res.json({ success: false, message: "Missing required fields (to, subject, html)" });
        }
        
        // Remove placeholder links from the template.
        let emailHtml = html.replace(/<a[^>]*href="https?:\/\/www\.google\.com\/maps[^>]*>.*?<\/a>/gi, '');

        const emailData = {
            from: process.env.SMTP_FROM || 'no-reply@example.com',
            to: Array.isArray(to) ? to : [to],
            subject,
            html: emailHtml,
            text,
            attachments: []
        };
        
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
        
        let detailsHtml = '';

        if (coordinates || notes) {
            detailsHtml += `<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;"><p><strong>Additional Details:</strong></p>`;
        }
        
        if (coordinates) {
             if (typeof coordinates === 'string' && coordinates.includes(',')) {
                const [lat, lon] = coordinates.split(',').map(s => s.trim());
                if (lat && lon) {
                    detailsHtml += `<p><strong>Serve Attempt Coordinates:</strong> <a href="https://www.google.com/maps?q=${lat},${lon}">${coordinates}</a></p>`;
                }
            }
        }

        if (notes) {
            detailsHtml += `<p><strong>Notes:</strong> ${notes}</p>`;
        }

        if (emailData.html.includes('</body>')) {
            emailData.html = emailData.html.replace('</body>', `${detailsHtml}</body>`);
        } else {
            emailData.html += detailsHtml;
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        await transporter.sendMail(emailData);
        log("Email sent successfully.");
        return res.json({ success: true, message: "Email sent successfully" });

    } catch (err) {
        error(err.message);
        return res.json({ success: false, message: `Error: ${err.message}` }, 500);
    }
};
