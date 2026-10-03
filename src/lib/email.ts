import "server-only";
import { getSettings } from "@/lib/settings";

// Sends email through Resend (https://resend.com). Needs RESEND_API_KEY.
// Without a verified domain, Resend only delivers to your own Resend account
// email, so add a domain in Resend and set EMAIL_FROM to an address on it.

const API = process.env.RESEND_API_URL ?? "https://api.resend.com";
export const SUPPORT_EMAIL = "spendbox@gmail.com";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  if (!emailConfigured() || !(await getSettings()).emailsEnabled) return;
  try {
    const res = await fetch(`${API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Spendbox <onboarding@resend.dev>",
        to: [to],
        reply_to: SUPPORT_EMAIL,
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text().catch(() => ""));
  } catch (error) {
    console.error("Email failed", error);
  }
}

/** A plain, friendly email: heading, a few lines and one button. */
export function emailBody({
  heading,
  lines,
  button,
  footer,
}: {
  heading: string;
  lines: string[];
  button?: { label: string; url: string };
  footer: string;
}) {
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f4;font-family:Arial,Helvetica,sans-serif;color:#14201a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;padding:28px">
<tr><td style="font-size:20px;font-weight:800;color:#236425;padding-bottom:20px">spendbox</td></tr>
<tr><td style="font-size:22px;font-weight:700;line-height:1.3;padding-bottom:12px">${escape(heading)}</td></tr>
${lines.map((l) => `<tr><td style="font-size:16px;line-height:1.55;color:#33403a;padding-bottom:10px">${escape(l)}</td></tr>`).join("")}
${
  button
    ? `<tr><td style="padding:14px 0 6px"><a href="${escape(button.url)}" style="display:inline-block;background:#2a772c;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:12px">${escape(button.label)}</a></td></tr>`
    : ""
}
<tr><td style="font-size:13px;line-height:1.5;color:#56615b;padding-top:22px;border-top:1px solid #e4e8e3">${escape(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, "", ...lines, button ? `\n${button.label}: ${button.url}` : "", "", footer].join("\n");
  return { html, text };
}
