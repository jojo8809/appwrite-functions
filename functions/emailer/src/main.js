import { Resend } from 'resend';
import process from "node:process";

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

    const { to, subject, html, text } = payload;

    if (!to || !subject || (!html && !text)) {
      return res.json({ success: false, message: "Missing required fields (to, subject, and either html or text)" });
    }

    // Get API key from environment variables
    const resendApiKey = process.env.RESEND_KEY;
            if (!resendApiKey) {
      return res.json({ success: false, message: "API key is missing" });
    }

    const resend = new Resend(resendApiKey);

    // Send email
    const { data, error: sendError } = await resend.emails.send({
      from: 'no-reply@justlegalsolutions.tech',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    });

    if (sendError) {
      return res.json({ success: false, message: `Failed to send email: ${sendError.message}` });
    }

    return res.json({ success: true, message: "Email sent successfully", data });

  } catch (err) {
    error(err);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
};