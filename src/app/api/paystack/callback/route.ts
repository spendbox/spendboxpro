import { NextResponse } from "next/server";
import { confirmPaystackPayment } from "@/lib/billing-server";
import { siteUrl } from "@/lib/env";

// Paystack sends the owner back here after paying.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  const result = await confirmPaystackPayment(reference).catch((e) => {
    console.error("Confirming payment failed", e);
    return null;
  });
  if (!result) return NextResponse.redirect(`${siteUrl()}/dashboard`);
  return NextResponse.redirect(`${siteUrl()}/dashboard/${result.businessId}/settings/billing?${result.paid ? "paid=1" : "failed=1"}`);
}
