import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// The owner's dashboard (src/app/[gate]/): it lives at a secret address, ADMIN_PATH (for example
// "hq-7f3k29xq", so the dashboard is newtown.world/hq-7f3k29xq), and signs in with ADMIN_EMAIL and
// ADMIN_PASSWORD. All three are set in Vercel → Settings → Environment Variables. Any one missing:
// there is no dashboard (the address is just "not found").

const COOKIE = "nt_hq";
const HOURS = 12;

const path = () => (process.env.ADMIN_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
const email = () => (process.env.ADMIN_EMAIL ?? "").split(",")[0].trim().toLowerCase();
const password = () => process.env.ADMIN_PASSWORD ?? "";

/** True when this is the dashboard's secret address and the dashboard is set up. */
export function isAdminGate(slug: string) {
  const p = path();
  // Short addresses are too easy to guess: at least 8 characters.
  if (p.length < 8 || !email() || password().length < 8) return false;
  return same(decodeURIComponent(slug), p);
}

function same(a: string, b: string) {
  const x = createHmac("sha256", "cmp").update(a).digest();
  const y = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(x, y);
}

const sign = (body: string) => createHmac("sha256", `${password()}|${path()}`).update(`hq:${body}`).digest("base64url");

/** Checks the email and password; on a match, signs this browser in for 12 hours. */
export async function adminSignIn(e: string, p: string): Promise<boolean> {
  const ok = email().length > 0 && password().length >= 8 && same(e.trim().toLowerCase(), email()) && same(p, password());
  if (!ok) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 1200));
    return false;
  }
  const exp = Math.floor(Date.now() / 1000) + HOURS * 3600;
  const body = `${exp}`;
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: HOURS * 3600 });
  return true;
}

export async function adminSignOut() {
  (await cookies()).delete(COOKIE);
}

/** Is this browser signed in to the dashboard? */
export async function isAdmin(): Promise<boolean> {
  if (!path() || !email() || password().length < 8) return false;
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || !(Number(exp) * 1000 > Date.now())) return false;
  return same(sig, sign(exp));
}
