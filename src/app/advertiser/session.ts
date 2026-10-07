import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Advertisers stay signed in with a small cookie: their advertiser id and an expiry time,
// signed with a server secret so nobody can make one up. It can't be read by page scripts
// (httpOnly). This is separate from the players' login.

const COOKIE = "hs_adv";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret() {
  const s = process.env.ADVERTISER_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Missing ADVERTISER_SECRET (or CRON_SECRET).");
  return s;
}

const sign = (body: string) => createHmac("sha256", secret()).update(`advertiser:${body}`).digest("base64url");

async function sessionDays() {
  try {
    const { data } = await createAdminClient().from("game_settings").select("value").eq("key", "ad_session_days").maybeSingle();
    const v = Number(data?.value);
    if (Number.isFinite(v) && v >= 1) return Math.min(v, 365);
  } catch {}
  return 30;
}

/** The cookie that signs an advertiser in (name, value and options). */
export async function advertiserCookie(advertiserId: string) {
  const days = await sessionDays();
  const exp = Math.floor(Date.now() / 1000) + days * 86_400;
  const body = `${advertiserId}.${exp}`;
  return {
    name: COOKIE,
    value: `${body}.${sign(body)}`,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: days * 86_400,
    },
  };
}

/** Signs an advertiser in on this device. Only call from a Server Action. */
export async function setAdvertiserSession(advertiserId: string) {
  const c = await advertiserCookie(advertiserId);
  (await cookies()).set(c.name, c.value, c.options);
}

export async function clearAdvertiserSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in advertiser's id, or null. */
export async function currentAdvertiserId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig || !UUID.test(id)) return null;
  if (!(Number(exp) * 1000 > Date.now())) return null;
  let expected: string;
  try {
    expected = sign(`${id}.${exp}`);
  } catch {
    return null;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b) ? id.toLowerCase() : null;
}
