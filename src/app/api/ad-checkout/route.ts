import { NextResponse } from "next/server";
import { startAdCheckout } from "@/lib/ads";
import { startLeaseCheckout } from "@/lib/business";

/**
 * POST /api/ad-checkout: the ad wizard's last step, sent as a form with its pictures (`kind` is
 * "billboard" or "lease"). The same checks and Paystack start as the forms always had; a plain
 * request (not a server action) so the page can show how much of the upload has gone up.
 * Answers { ok, url } or { ok: false, error }.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "That didn't arrive. Please try again." });
  try {
    const kind = form.get("kind");
    const r = kind === "lease" ? await startLeaseCheckout(form) : kind === "billboard" ? await startAdCheckout(form) : { ok: false as const, error: "Unknown ad." };
    return NextResponse.json(r);
  } catch (error) {
    console.error("Ad checkout failed", error);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." });
  }
}
