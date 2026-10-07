import "server-only";

// Sends email through Resend (https://resend.com). Needs RESEND_API_KEY.
// Without a verified domain, Resend only delivers to your own Resend account
// email, so add a domain in Resend and set EMAIL_FROM to an address on it.

const API = "https://api.resend.com";

/** Sends one email. Returns Resend's own error text when it refuses, so problems are visible. */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Email is not set up (RESEND_API_KEY is missing)." };
  try {
    const res = await fetch(`${API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Hide & Seek <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    console.error("Email failed", res.status, body);
    let message = "";
    try {
      message = JSON.parse(body).message ?? "";
    } catch {}
    return { ok: false, error: message || `Resend said no (status ${res.status}).` };
  } catch (error) {
    console.error("Email failed", error);
    return { ok: false, error: "Couldn't reach the email service." };
  }
}

/** The sign-in email. `code` is the 4-digit code. */
export function codeEmail(code: string) {
  return {
    subject: `${code} is your Hide & Seek code`,
    text: `Your Hide & Seek sign-in code is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#eef2f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18202b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:420px;background:#ffffff;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<div style="font-size:20px;font-weight:800">Hide &amp; Seek</div>
<p style="font-size:15px;color:#64707d;margin:16px 0 8px">Your sign-in code:</p>
<div style="font-size:36px;font-weight:800;letter-spacing:12px;text-indent:12px;background:#f1f4f8;border-radius:12px;padding:16px;text-align:center">${code}</div>
<p style="font-size:13px;color:#64707d;margin:16px 0 0">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
