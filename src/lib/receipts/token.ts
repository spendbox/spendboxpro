import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseSecretKey } from "@/lib/env";

// When a receipt can't be matched automatically, the customer picks the
// business. This signed token carries what Claude read, so the browser can
// hand it back without being able to change the amount or date.

function sign(payload: string) {
  return createHmac("sha256", `receipt-token:${supabaseSecretKey()}`).update(payload).digest("base64url");
}

export function createToken(data: object, ttlMinutes = 30) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMinutes * 60_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken<T>(token: string): T | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as T & { exp: number };
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
