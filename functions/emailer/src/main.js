
import { Resend } from 'resend';
import process from "node:process";
import { Client, Databases } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  log('Processing request...');

  try {
    // Get payload from request with improved error handling using bodyText if available
    let payload = null;
    try {
      // Prefer using req.bodyText which should contain the raw JSON payload
      let rawPayload = req.bodyText;
      if (!rawPayload && req.body) {
        rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
      if (!rawPayload) {
        throw new Error("No valid payload found in request");
      }
      payload = JSON.parse(rawPayload);
    } catch (parseError) {
      error(`Error parsing payload: ${parseError.message}`);
      log("Payload content (truncated):", req.bodyText ? req.bodyText.substring(0, 100) : (typeof req.body === 'string' ? req.body.substring(0, 100) : ""));
      return res.json({ success: false, message: `Failed to parse payload: ${parseError.message}` });
    }

    log("Payload extracted successfully:", JSON.stringify(payload));

    const { to, subject, html, text, serveId, imageData } = payload;

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
          let base64Content = serve.image_data.includes('base64,')
            ? serve.image_data.split('base64,')[1]
            : serve.image_data;
          log(`Extracted base64 content length: ${base64Content.length}`);
          emailData.attachments.push({
            filename: 'serve_evidence.jpeg',
            content: base64Content,
            encoding: 'base64'
          });
        } else {
          log('No image_data found in serve attempt document');
        }
      } catch (fetchError) {
        error('Failed to fetch serve attempt document:', fetchError.message);
        return res.json({ success: false, message: 'Failed to fetch serve attempt document' });
      }
    } else if (imageData) {
      log("Using imageData provided in payload");
      let base64Content = imageData.includes("base64,")
        ? imageData.split("base64,")[1]
        : imageData;
      log(`Extracted base64 content length: ${base64Content.length}`);
      emailData.attachments.push({
        filename: 'serve_evidence.jpeg',
        content: base64Content,
        encoding: 'base64'
      });
    } else {
      log("No serveId or imageData provided; no image will be attached");
    }

    // Attempt to send the email and log response details
    log("About to send email with Resend");
    try {
      const response = await resend.emails.send(emailData);
      log("Resend response:", JSON.stringify(response));
      return res.json({ success: true, message: "Email sent successfully", data: response });
    } catch (sendError) {
      error("Error sending email with Resend:", sendError.message);
      return res.json({ success: false, message: `Failed to send email: ${sendError.message}` });
    }

  } catch (err) {
    error("Error in emailer function:", err);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
};
