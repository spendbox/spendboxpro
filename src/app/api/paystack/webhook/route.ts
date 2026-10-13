import { after, NextResponse } from "next/server";
import { confirmPack } from "@/app/play/pack-actions";
import { confirmTopUp } from "@/app/play/topup-actions";
import { confirmPayment } from "@/lib/ads";
import { confirmBusinessPayment } from "@/lib/business";
import { webhookIsGenuine } from "@/lib/paystack";

// Gives the follow-up (emails) time to finish after we've answered Paystack.
export const maxDuration = 30;

/**
 * POST /api/paystack/webhook: Paystack tells us a payment went through. Set this address in
 * Paystack → Settings → API Keys & Webhooks → Webhook URL. We check the signature, answer
 * straight away, then confirm the payment with Paystack ourselves (the same steps as the page
 * people return to after paying, so it doesn't matter which one happens first).
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!webhookIsGenuine(raw, request.headers.get("x-paystack-signature"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string } } = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad body", { status: 400 });
  }
  const reference = event.data?.reference;
  if (event.event === "charge.success" && typeof reference === "string" && /^(ad|sp|at)-/.test(reference)) {
    after(async () => {
      try {
        await confirmPayment(reference);
      } catch (error) {
        console.error("Webhook payment confirmation failed", reference, error);
      }
    });
  }
  // Business leases and their upgrades (src/lib/business.ts).
  if (event.event === "charge.success" && typeof reference === "string" && /^bz-/.test(reference)) {
    after(async () => {
      try {
        await confirmBusinessPayment(reference);
      } catch (error) {
        console.error("Webhook business confirmation failed", reference, error);
      }
    });
  }
  // Starter packs (src/app/play/pack-actions.ts).
  if (event.event === "charge.success" && typeof reference === "string" && /^pk-/.test(reference)) {
    after(async () => {
      try {
        await confirmPack(reference);
      } catch (error) {
        console.error("Webhook pack confirmation failed", reference, error);
      }
    });
  }
  // Top-ups (src/app/play/topup-actions.ts).
  if (event.event === "charge.success" && typeof reference === "string" && /^tu-/.test(reference)) {
    after(async () => {
      try {
        await confirmTopUp(reference);
      } catch (error) {
        console.error("Webhook top-up confirmation failed", reference, error);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
