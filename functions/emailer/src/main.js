import nodemailer from 'nodemailer';
import process from "node:process";
import { Client, Databases } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  log('Processing request...');

  try {
    const payload = req.payload
      ? (typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload)
      : (req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : null);

    if (!payload) {
      return res.json({ success: false, message: "No payload provided" });
    }

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

    // Fetch serve document if serveId is provided
    let coordinates = null;
    if (serveId) {
      try {
        const serve = await databases.getDocument(
          process.env.APPWRITE_FUNCTION_DATABASE_ID,
          process.env.APPWRITE_FUNCTION_SERVE_ATTEMPTS_COLLECTION_ID,
          serveId
        );

        if (serve && serve.coordinates) {
          coordinates = serve.coordinates;
        }

        if (serve && serve.image_data) {
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
        error('Failed to fetch serve attempt document:', fetchError.message);
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

    // Remove any Google Maps link from the HTML before inserting coordinates
    if (emailData.html) {
      emailData.html = emailData.html.replace(/<a[^>]*href="https:\/\/www\.google\.com\/maps[^>]*>.*?<\/a>/gi, '');
    }

    // --- GPS COORDINATES INSERTION ---
    let coordsHtml = '';
    let coordsText = '';
    if (coordinates) {
      let lat = '';
      let lon = '';
      if (coordinates.includes(',')) {
        [lat, lon] = coordinates.split(',').map(s => s.trim());
        coordsHtml = `<p><strong>GPS Coordinates:</strong> ${coordinates}</p><p><strong>Latitude:</strong> ${lat}<br><strong>Longitude:</strong> ${lon}</p>`;
        coordsText = `GPS Coordinates: ${coordinates}\nLatitude: ${lat}\nLongitude: ${lon}\n`;
      } else {
        coordsHtml = `<p><strong>GPS Coordinates:</strong> ${coordinates}</p>`;
        coordsText = `GPS Coordinates: ${coordinates}\n`;
      }
    }

    // Add notes if present
    let notesHtml = '';
    let notesText = '';
    if (notes) {
      notesHtml = `<p><strong>Notes:</strong> ${notes}</p>`;
      notesText = `Notes: ${notes}\n`;
    }

    // --- INSERT COORDINATES & NOTES INTO THE HTML TEMPLATE ---
    if (emailData.html) {
      if (emailData.html.includes('</body>')) {
        emailData.html = emailData.html.replace('</body>', `${coordsHtml}${notesHtml}</body>`);
      } else if (emailData.html.includes('</html>')) {
        emailData.html = emailData.html.replace('</html>', `${coordsHtml}${notesHtml}</html>`);
      } else {
        emailData.html += coordsHtml + notesHtml;
      }
    } else {
      emailData.html = coordsHtml + notesHtml;
    }

    emailData.text = (emailData.text || '') + coordsText + notesText;

    // Send the email
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const response = await transporter.sendMail(emailData);

    return res.json({ success: true, message: "Email sent successfully", data: response });

  } catch (err) {
    error(err);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
};
