// Remove nodemailer import - we'll use Resend API instead
// import nodemailer from 'nodemailer';
import process from "node:process";

export default async ({ req, res, log, error }) => {
    log('Processing email request...');
    try {
        const payload = req.payload
            ? (typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload)
            : (req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : null);

        if (!payload) {
            return res.json({ success: false, message: "No payload provided" });
        }

        const { to, subject, html, text, imageData, imageUrl, coordinates, notes } = payload;

        if (!to || !subject || !html) {
            return res.json({ success: false, message: "Missing required fields (to, subject, html)" });
        }
        
        let emailHtml = html.replace(/<a[^>]*href="https?:\/\/www\.google\.com\/maps[^>]*>.*?<\/a>/gi, '');

        // Handle recipients array/string
        const recipients = Array.isArray(to) ? to : [to];
        
        // Build email data for Resend API
        const emailData = {
            from: process.env.SMTP_FROM || 'no-reply@example.com',
            to: recipients,
            subject,
            html: emailHtml,
            text,
            attachments: []
        };
        
        // Handle image attachment - Priority: imageUrl (new) > imageData (legacy)
        if (imageUrl && imageUrl.startsWith('http')) {
            log(`Downloading image from URL: ${imageUrl}`);
            try {
                const response = await fetch(imageUrl);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const base64Content = buffer.toString('base64');
                    emailData.attachments.push({
                        filename: 'serve_evidence.jpg',
                        content: base64Content
                    });
                    log(`Image downloaded and attached (${buffer.length} bytes)`);
                } else {
                    error(`Failed to download image: ${response.status} ${response.statusText}`);
                }
            } catch (downloadError) {
                error('Error downloading image from URL: ' + downloadError.message);
            }
        } else if (imageData) {
            log('Using legacy base64 imageData');
            let base64Content = imageData;
            if (imageData.includes("base64,")) {
                base64Content = imageData.split("base64,")[1];
            }
            emailData.attachments.push({
                filename: 'serve_evidence.jpeg',
                content: base64Content
            });
        }
        
        // Add coordinates and notes
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

        if (emailData.html.includes('</body>')) {
            emailData.html = emailData.html.replace('</body>', `${detailsHtml}</body>`);
        } else {
            emailData.html += detailsHtml;
        }

        // SEND EMAIL VIA RESEND API (instead of nodemailer)
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        if (!resendResponse.ok) {
            const errorData = await resendResponse.text();
            throw new Error(`Resend API error: ${errorData}`);
        }

        const result = await resendResponse.json();
        log("Email sent successfully via Resend: " + JSON.stringify(result));
        
        return res.json({ success: true, message: "Email sent successfully", messageId: result.id });

    } catch (err) {
        error('Email sending failed: ' + err.message);
        return res.json({ success: false, message: `Error: ${err.message}` }, 500);
    }
};
