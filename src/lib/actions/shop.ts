"use server";

import { createClient } from "@/lib/supabase/server";
import type { PerkKind } from "@/lib/types";

// What a 3D shop shows in its gift: the business's perks, from its public shop.

export interface ShopPerk {
  id: string;
  kind: PerkKind;
  title: string;
  details: string | null;
  threshold: number | null;
  valid_days: number | null;
}

export async function getShopPerks(slug: string): Promise<{ perks: ShopPerk[]; currency: string }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_store", { p_slug: slug.slice(0, 80) });
  const store = data as { perks?: ShopPerk[]; currency?: string } | null;
  return { perks: store?.perks ?? [], currency: store?.currency ?? "NGN" };
}
