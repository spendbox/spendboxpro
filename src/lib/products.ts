import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BusinessProduct, FeedProduct, ProductAudienceRow } from "@/lib/types";

const num = (v: unknown) => Number(v ?? 0);

/** A business's products and services with their numbers, newest first. */
export const getBusinessProducts = cache(async (bizId: string): Promise<BusinessProduct[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_products", { p_business_id: bizId });
  return ((data ?? []) as BusinessProduct[]).map((p) => ({
    ...p,
    price: p.price === null ? null : num(p.price),
    views: num(p.views),
    viewers: num(p.viewers),
    partner_viewers: num(p.partner_viewers),
    likes: num(p.likes),
    contacts: num(p.contacts),
  }));
});

/** Who looked at, liked or asked about one product. */
export async function getProductAudience(bizId: string, productId: string): Promise<ProductAudienceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("product_audience", { p_business_id: bizId, p_product_id: productId });
  return (data ?? []) as ProductAudienceRow[];
}

/** The signed-in customer's Explore feed, newest first, optionally searched. */
export const getExplore = cache(async (query: string | null): Promise<FeedProduct[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("explore_products", { p_query: query?.trim().slice(0, 60) || null });
  return ((data ?? []) as FeedProduct[]).map((p) => ({ ...p, price: p.price === null ? null : num(p.price) }));
});

/** What the signed-in customer liked. */
export const getMyBox = cache(async (): Promise<FeedProduct[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_box");
  return ((data ?? []) as FeedProduct[]).map((p) => ({ ...p, price: p.price === null ? null : num(p.price) }));
});
