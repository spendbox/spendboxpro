import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Sealed notes the game hands to a phone and reads back later (an interview in progress, a pass,
// a breakthrough): the phone can carry them but can't change them. Signed with the server's secret.

function secret() {
  const s = process.env.GAME_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("GAME_SECRET is not set");
  return "newtown-dev-only";
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

/** Secret random bytes for a label: the same label always gives the same bytes, and nobody can work them out without the server's secret (who the impostor is). */
export function secretBytes(label: string): Uint8Array {
  return new Uint8Array(createHmac("sha256", secret()).update(`bytes:${label}`).digest());
}

/** Seal a note that stops being valid after `minutes`. */
export function seal(data: Record<string, unknown>, minutes: number): string {
  const body = b64(JSON.stringify({ ...data, exp: Date.now() + minutes * 60_000 }));
  return `${body}.${mac(body)}`;
}

/** Open a sealed note: null if it was changed or has run out. */
export function unseal<T extends Record<string, unknown>>(token: string): (T & { exp: number }) | null {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
