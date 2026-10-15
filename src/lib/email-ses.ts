// Sending email through Amazon SES (docs/COSTS.md: about $0.10 a thousand emails, a fraction of
// Resend's price), used by src/lib/email.ts when AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY
// and AWS_SES_REGION are set (and the sending domain is verified in SES, out of its sandbox).
// No SDK: one signed request (AWS Signature Version 4) with Node's own crypto.

import { createHash, createHmac } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s, "utf8").digest();

/**
 * The Authorization header for a request (AWS Signature Version 4), for `service` in `region`, at
 * `amzDate` (YYYYMMDDTHHMMSSZ). `headers` are the ones signed (lower-case names), host included.
 */
export function sigV4(o: {
  method: string;
  path: string;
  query?: string;
  headers: Record<string, string>;
  body: string;
  service: string;
  region: string;
  amzDate: string;
  accessKey: string;
  secretKey: string;
}) {
  const day = o.amzDate.slice(0, 8);
  const names = Object.keys(o.headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names.map((h) => `${h}:${String(o.headers[h]).trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const request = [o.method, o.path, o.query ?? "", canonicalHeaders, signedHeaders, sha256(o.body)].join("\n");
  const scope = `${day}/${o.region}/${o.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", o.amzDate, scope, sha256(request)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${o.secretKey}`, day), o.region), o.service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${o.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** Is SES set up (its keys and region)? */
export const sesReady = () => !!(process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY && process.env.AWS_SES_REGION);

/** Sends one email through SES (v2 API). Returns SES's own error text when it refuses. */
export async function sendViaSes(m: { from: string; replyTo: string; to: string; subject: string; html: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const region = process.env.AWS_SES_REGION!;
  const host = `email.${region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify({
    FromEmailAddress: m.from,
    ReplyToAddresses: [m.replyTo],
    Destination: { ToAddresses: [m.to] },
    Content: { Simple: { Subject: { Data: m.subject, Charset: "UTF-8" }, Body: { Html: { Data: m.html, Charset: "UTF-8" }, Text: { Data: m.text, Charset: "UTF-8" } } } },
  });
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const headers = { host, "content-type": "application/json", "x-amz-date": amzDate };
  const authorization = sigV4({
    method: "POST",
    path,
    headers,
    body,
    service: "ses",
    region,
    amzDate,
    accessKey: process.env.AWS_SES_ACCESS_KEY_ID!,
    secretKey: process.env.AWS_SES_SECRET_ACCESS_KEY!,
  });
  try {
    const res = await fetch(`https://${host}${path}`, { method: "POST", headers: { ...headers, authorization }, body });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    console.error("SES email failed", res.status, text);
    let message = "";
    try {
      message = JSON.parse(text).message ?? "";
    } catch {}
    return { ok: false, error: message || `SES said no (status ${res.status}).` };
  } catch (error) {
    console.error("SES email failed", error);
    return { ok: false, error: "Couldn't reach the email service." };
  }
}
