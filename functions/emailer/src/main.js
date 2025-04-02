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

    const { to, subject, html, text, serveId } = payload;

    if (!to || !subject || (!html && !text)) {
      return res.json({ success: false, message: "Missing required fields (to, subject, and either html or text)" });
    }

    // Get API key from environment variables
    const resendApiKey = process.env.RESEND_KEY;
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

    // Retrieve stored image_data by serveId and attach it
    if (serveId) {
      try {
        const serve = await databases.getDocument(
          process.env.APPWRITE_FUNCTION_DATABASE_ID,
          process.env.APPWRITE_FUNCTION_SERVE_ATTEMPTS_COLLECTION_ID,
          serveId
        );
        if (serve.image_data) {
          emailData.attachments.push({
            filename: 'serve_evidence.jpeg',
            content: serve.image_data.split('base64,')[1],
            encoding: 'base64'
          });
          log('Image attached to email');
        } else {
          log('No image_data found in serve record');
        }
      } catch (fetchError) {
        error('Error fetching serve document:', fetchError.message);
        return res.json({ success: false, message: "Failed to fetch serve document" });
      }
    }

    // Send email
    const response = await resend.emails.send(emailData);

    return res.json({ success: true, message: "Email sent successfully", data: response });

  } catch (err) {
    error(err);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
};
