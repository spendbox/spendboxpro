import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Paystack (https://paystack.com) takes the card / bank / USSD payment for ads and sponsored
// pools. Needs PAYSTACK_SECRET_KEY (Paystack → Settings → API Keys & Webhooks).

const API = "https://api.paystack.co";

export function paystackEnabled() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function key() {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("Payments aren't switched on yet (PAYSTACK_SECRET_KEY is missing).");
  return k;
}

/** Starts a payment. Returns the Paystack page to send the payer to. */
export async function startPayment(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string | number>;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: "NGN",
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { status?: boolean; message?: string; data?: { authorization_url?: string } }
      | null;
    const url = body?.data?.authorization_url;
    if (res.ok && body?.status && url) return { ok: true, url };
    console.error("Paystack initialize failed", res.status, body);
    return { ok: false, error: body?.message || "The payment page didn't open. Please try again." };
  } catch (error) {
    console.error("Paystack initialize failed", error);
    return { ok: false, error: "We couldn't reach the payment service. Please try again." };
  }
}

export type VerifiedPayment = {
  /** True only when Paystack says the charge succeeded, in naira. */
  paid: boolean;
  amountKobo: number;
  currency: string;
  status: string;
};

/** Asks Paystack whether this payment really went through. Never trust the browser for this. */
export async function checkPayment(reference: string): Promise<VerifiedPayment | null> {
  try {
    const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${key()}` },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { status?: boolean; data?: { status?: string; amount?: number; currency?: string; reference?: string } }
      | null;
    if (!res.ok || !body?.status || !body.data) return null;
    const d = body.data;
    const amountKobo = Number(d.amount ?? 0);
    const currency = String(d.currency ?? "");
    const status = String(d.status ?? "");
    return {
      paid: status === "success" && currency === "NGN" && d.reference === reference && amountKobo > 0,
      amountKobo,
      currency,
      status,
    };
  } catch (error) {
    console.error("Paystack verify failed", error);
    return null;
  }
}

/** True when a webhook really came from Paystack (HMAC-SHA512 of the raw body with our secret key). */
export function webhookIsGenuine(rawBody: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
