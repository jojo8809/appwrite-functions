import { Resend } from 'resend';
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

    const { to, subject, html, text, serveId, imageData } = payload;

    if (!to || !subject || (!html && !text)) {
      return res.json({ success: false, message: "Missing required fields (to, subject, and either html or text)" });
    }

    // Get API key from environment variables
    const resendApiKey = process.env.RESEND_KEY;
    // Log just first 4 chars of API key for verification
    log("API key starts with:", resendApiKey ? resendApiKey.substring(0, 4) : "missing");
    if (!resendApiKey) {
      return res.json({ success: false, message: "API key is missing" });
    }

    const resend = new Resend(resendApiKey);

    const appwriteClient = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY);
    const databases = new Databases(appwriteClient);

    const emailData = {
      from: 'no-reply@justlegalsolutions.tech',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      attachments: []
    };

    // If serveId is provided, fetch the document to get image_data,
    // otherwise, if imageData is provided, use it directly.
    if (serveId) {
      log(`Fetching serve attempt with ID: ${serveId}`);
      try {
        const serve = await databases.getDocument(
          process.env.APPWRITE_FUNCTION_DATABASE_ID,
          process.env.APPWRITE_FUNCTION_SERVE_ATTEMPTS_COLLECTION_ID,
          serveId
        );
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

    // Attempt to send the email and log response details
    log("About to send email with Resend");
    const response = await resend.emails.send(emailData);
    log("Resend response:", JSON.stringify(response));

    return res.json({ success: true, message: "Email sent successfully", data: response });

  } catch (err) {
    error("Error in emailer function:", err);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
};
