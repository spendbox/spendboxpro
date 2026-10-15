import "server-only";

// The robot check on sign-up (Cloudflare Turnstile: free, and most people never see a puzzle).
// The sign-in form gets a token from Cloudflare's widget; the server asks Cloudflare whether it's
// genuine before making an account. Switched on by TURNSTILE_SECRET_KEY (and
// NEXT_PUBLIC_TURNSTILE_SITE_KEY for the widget); without them sign-up works with no check.

const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileOn = () => !!process.env.TURNSTILE_SECRET_KEY;

/** Whether a token from the widget is genuine (true when the check is switched off). */
export async function passedTurnstile(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!j.success) console.warn("Robot check failed", j["error-codes"]?.join(", "));
    return !!j.success;
  } catch (e) {
    // Cloudflare not answering: let people in rather than lock everyone out.
    console.error("Robot check unreachable", e);
    return true;
  }
}
