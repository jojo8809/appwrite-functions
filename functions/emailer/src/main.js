import { Resend } from 'resend';
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

    const { to, subject, html, text, serveId, imageData } = payload;

    const resendApiKey = process.env.RESEND_KEY;
    log("Resend API key (partial):", resendApiKey ? resendApiKey.slice(0, 5) + "..." : "Not set");
    if (!resendApiKey) {
      return res.json({ success: false, message: "API key is missing" });
    }

    const resend = new Resend(resendApiKey);

    const emailData = {
      from: 'no-reply@justlegalsolutions.tech',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      attachments: []
    };

    if (imageData) {
      let base64Content = imageData.includes("base64,") ? imageData.split("base64,")[1] : imageData;
      emailData.attachments.push({
        filename: 'serve_evidence.jpeg',
        content: base64Content,
        encoding: 'base64'
      });
    }

    log("Final emailData payload:", JSON.stringify(emailData));

    const sendEmailWithRetry = async (emailData, retries = 3) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await resend.emails.send(emailData);
          log(`Email sent successfully on attempt ${attempt}`);
          return response;
        } catch (error) {
          log(`Attempt ${attempt} failed:`, error.message);
          if (attempt === retries) throw error;
        }
      }
    };

    const responseData = await sendEmailWithRetry(emailData);
    log("Resend email response:", JSON.stringify(responseData));

    return res.json({ success: true, message: "Email sent successfully", data: responseData });

  } catch (err) {
    error("Error in email function:", err);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
};
