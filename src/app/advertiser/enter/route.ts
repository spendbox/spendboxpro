import { NextResponse } from "next/server";
import { hashToken } from "@/lib/ad-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { advertiserCookie } from "../session";

/**
 * GET /advertiser/enter?token=… : the "Manage your ad" button in our emails (sent via
 * /advertiser?token=…). Checks the link, signs the advertiser in, and opens their ads.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const target = new URL("/advertiser", url.origin);
  let id: string | null = null;
  if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    const { data, error } = await createAdminClient().rpc("advertiser_link_check", { p_hash: hashToken(token) });
    if (error) console.error("Checking a manage link failed", error);
    id = typeof data === "string" ? data : null;
  }
  if (!id) target.searchParams.set("link", "expired");
  const res = NextResponse.redirect(target, 303);
  if (id) {
    const c = await advertiserCookie(id);
    res.cookies.set(c.name, c.value, c.options);
  }
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
