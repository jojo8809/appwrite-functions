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

    log(req.bodyText);
    log(JSON.stringify(req.bodyJson));
    log(JSON.stringify(req.headers));

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
      log(`Fetching serve attempt with ID: ${serveId}`);
      try {
        const serve = await databases.getDocument(
          process.env.APPWRITE_FUNCTION_DATABASE_ID,
          process.env.APPWRITE_FUNCTION_SERVE_ATTEMPTS_COLLECTION_ID,
          serveId
        );

        // Handle coordinates
        if (serve.coordinates) {
          coordinates = serve.coordinates;
          log(`Found coordinates: ${coordinates}`);
        } else {
          log('No coordinates found in serve attempt document');
        }

        // Handle image data
        if (serve.image_data) {
          log('Found image_data in serve attempt document');
          let base64Content = serve.image_data;
          if (serve.image_data.includes('base64,')) {
            base64Content = serve.image_data.split('base64,')[1];
          }
          log(`Extracted base64 content length: ${base64Content.length}`);
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
      log("Using imageData provided in payload");
      let base64Content = imageData;
      if (imageData.includes("base64,")) {
        base64Content = imageData.split("base64,")[1];
      }
      log(`Extracted base64 content length: ${base64Content.length}`);
      emailData.attachments.push({
        filename: 'serve_evidence.jpeg',
        content: base64Content,
        encoding: 'base64'
      });
      log('Image successfully attached using provided imageData');
    } else {
      log("No serveId or imageData provided; no image will be attached");
    }

    // Add Google Maps link if coordinates exist
    if (coordinates) {
      const cleanedCoords = coordinates.replace(/\s/g, '');
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${cleanedCoords}`;
      const mapsHtml = `<p>Location: <a href="${mapsLink}">${cleanedCoords}</a></p>`;
      const mapsText = `Location: ${mapsLink}\n`;

      emailData.html = (emailData.html || '') + mapsHtml;
      emailData.text = (emailData.text || '') + mapsText;
      log('Google Maps link added to email content');
    }

    // Add notes if present
    if (notes) {
      const notesHtml = `<p><strong>Notes:</strong> ${notes}</p>`;
      const notesText = `Notes: ${notes}\n`;
      emailData.html = (emailData.html || '') + notesHtml;
      emailData.text = (emailData.text || '') + notesText;
    }

    // Read SMTP vars
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    // Send via Nodemailer
    const response = await transporter.sendMail(emailData);

    return res.json({ success: true, message: "Email sent successfully", data: response });

  } catch (err) {
    error(err);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
};
