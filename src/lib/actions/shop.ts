"use server";

import { createClient } from "@/lib/supabase/server";
import type { PerkKind, StoreProduct } from "@/lib/types";

// What a 3D shop shows from its public page: the perks in its gift, and every
// product for its hall (the Explore feed only has the newest).

export interface ShopPerk {
  id: string;
  kind: PerkKind;
  title: string;
  details: string | null;
  threshold: number | null;
  valid_days: number | null;
}

export async function getShopPerks(slug: string): Promise<{ perks: ShopPerk[]; currency: string; products: StoreProduct[] }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_store", { p_slug: slug.slice(0, 80) });
  const store = data as { perks?: ShopPerk[]; currency?: string; products?: StoreProduct[] } | null;
  return { perks: store?.perks ?? [], currency: store?.currency ?? "NGN", products: store?.products ?? [] };
}
