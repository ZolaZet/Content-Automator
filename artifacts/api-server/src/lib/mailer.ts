import nodemailer from "nodemailer";
import { logger } from "./logger";

function createTransport() {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env["SMTP_PORT"] ?? 587),
    secure: Number(process.env["SMTP_PORT"] ?? 587) === 465,
    auth: { user, pass },
  });
}

function fromAddress() {
  return process.env["SMTP_FROM"] ?? process.env["SMTP_USER"] ?? "SA Content Hub <noreply@localhost>";
}

export function isMailerConfigured(): boolean {
  return !!(process.env["SMTP_HOST"] && process.env["SMTP_USER"] && process.env["SMTP_PASS"]);
}

export async function sendContentReadyEmail({
  to,
  businessName,
  contentId,
  appUrl,
}: {
  to: string;
  businessName: string;
  contentId: number;
  appUrl: string;
}) {
  const transport = createTransport();
  if (!transport) {
    logger.warn("Email notification skipped — SMTP_HOST, SMTP_USER, and SMTP_PASS env vars are not set");
    return false;
  }

  const reviewUrl = `${appUrl}/content/${contentId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#c17b2e;padding:20px 32px;">
            <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.5px;">SA Content Hub</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:20px;">New content ready for review</h2>
            <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.5;">
              AI-generated content for <strong>${businessName}</strong> is waiting in your queue.
              Review it, make any edits, then approve to publish or reject with a note.
            </p>
            <a href="${reviewUrl}"
               style="display:inline-block;background:#c17b2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">
              Review Content →
            </a>
            <p style="margin:28px 0 0;color:#999;font-size:12px;">
              You're receiving this because email notifications are enabled in your SA Content Hub settings.
              To stop, turn off <em>Enable email notifications</em> in Settings.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: fromAddress(),
      to,
      subject: `New content ready: ${businessName}`,
      html,
      text: `New content for "${businessName}" is ready for review.\n\nReview it here: ${reviewUrl}`,
    });
    logger.info({ to, businessName, contentId }, "Content-ready notification email sent");
    return true;
  } catch (err) {
    logger.error({ err, to, businessName }, "Failed to send content-ready email");
    return false;
  }
}

export async function sendTestEmail(to: string, appUrl: string) {
  const transport = createTransport();
  if (!transport) {
    return { ok: false, error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your environment secrets." };
  }

  try {
    await transport.sendMail({
      from: fromAddress(),
      to,
      subject: "SA Content Hub — email notifications are working ✓",
      html: `<p style="font-family:sans-serif;">Your SA Content Hub email notifications are set up correctly. You'll receive an alert at this address whenever new content is ready for review.</p><p style="font-family:sans-serif;color:#888;font-size:13px;">Sent from: ${appUrl}</p>`,
      text: `Your SA Content Hub email notifications are set up correctly. You'll receive alerts when new content is ready for review.`,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, to }, "Test email failed");
    return { ok: false, error: msg };
  }
}
