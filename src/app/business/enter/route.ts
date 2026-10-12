import { NextResponse, type NextRequest } from "next/server";
import { confirmBusinessPayment } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { advertiserCookie } from "../../advertiser/session";

/**
 * GET /business/enter?ref=bz-…: where Paystack sends a business after paying for its lease. The
 * payment is checked with Paystack (and the lease goes live), then the business is signed in to its
 * ad page on this device, so it sees its numbers straight away. A paid reference only signs in for a
 * few days after the lease was taken; after that, the email sign-in on /advertiser.
 */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref") ?? request.nextUrl.searchParams.get("reference") ?? "";
  const done = new URL(`/business/done?ref=${encodeURIComponent(ref)}`, request.nextUrl.origin);
  if (!/^bz-[a-z0-9]{8,60}$/.test(ref)) return NextResponse.redirect(done, 303);
  const r = await confirmBusinessPayment(ref).catch(() => ({ ok: false, state: "unknown" as const }));
  if (r.state !== "live") return NextResponse.redirect(done, 303);
  const { data } = await createAdminClient().from("business_leases").select("advertiser_id, created_at").eq("reference", ref).maybeSingle();
  const fresh = data && Date.now() - Date.parse(String(data.created_at)) < 3 * 86_400_000;
  if (!fresh) return NextResponse.redirect(done, 303);
  const res = NextResponse.redirect(new URL("/advertiser?welcome=1", request.nextUrl.origin), 303);
  const c = await advertiserCookie(String(data.advertiser_id));
  res.cookies.set(c.name, c.value, c.options);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
