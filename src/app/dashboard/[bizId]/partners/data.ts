import "server-only";
import { requireOwnedBusiness } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { PartnerListing } from "@/lib/types";

/** Everything both partner pages need: the business, the directory, categories and the invite link. */
export async function loadPartners(bizId: string) {
  const supabase = await createClient();
  const [{ business }, { data }] = await Promise.all([
    requireOwnedBusiness(bizId),
    supabase.rpc("partner_directory", { p_business_id: bizId, p_query: null, p_category: null }),
  ]);
  const directory = (data ?? []) as PartnerListing[];

  // Categories of businesses taking partners, most common first.
  const counts = new Map<string, number>();
  for (const b of directory) for (const c of b.categories ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
  const categories = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c).slice(0, 14);

  const invite = {
    url: `${siteUrl()}/start?partner=${business.slug}`,
    message: `Let's partner on Spendbox and share customers. Sign up with this link and we're connected straight away (${business.name}):`,
  };
  return { business, directory, categories, invite };
}
