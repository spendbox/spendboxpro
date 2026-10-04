// The proxy checks who is signed in once per request and passes the result to
// pages in a signed header, so pages don't have to check again. The signature
// (HMAC with the server's secret key) means a visitor can't fake the header.

export const SESSION_HEADER = "x-spendbox-session";
const MAX_AGE_MS = 60_000;

export interface SessionClaims {
  id: string;
  phone: string | null;
  email: string | null;
}

function secret() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

let keyPromise: Promise<CryptoKey> | null = null;
function key() {
  keyPromise ??= crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return keyPromise;
}

/** Signed header value for a signed-in person, or null if no secret is set up. */
export async function signSession(claims: SessionClaims): Promise<string | null> {
  if (!secret()) return null;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ ...claims, t: Date.now() })));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/** The person in a signed header, or null if it's missing, fake or stale. */
export async function readSession(value: string | null | undefined): Promise<SessionClaims | null> {
  if (!value || !secret()) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromBase64Url(signature), encoder.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as SessionClaims & { t: number };
    if (typeof data.id !== "string" || !(Date.now() - data.t < MAX_AGE_MS)) return null;
    return { id: data.id, phone: data.phone ?? null, email: data.email ?? null };
  } catch {
    return null;
  }
}
