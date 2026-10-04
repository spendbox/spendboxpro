import { NextResponse } from "next/server";
import { confirmPaystackPayment, paystackSignatureOk } from "@/lib/billing-server";

// Paystack tells us about payments here too, in case the owner closed the page
// before coming back. Set this URL in Paystack → Settings → API Keys & Webhooks.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!paystackSignatureOk(raw, request.headers.get("x-paystack-signature"))) {
    return new NextResponse("Bad signature", { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad body", { status: 400 });
  }
  if (event.event === "charge.success" && event.data?.reference) {
    await confirmPaystackPayment(event.data.reference).catch((e) => console.error("Webhook payment failed", e));
  }
  return NextResponse.json({ ok: true });
}
