"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// What customers do with products: look, like, and get in touch. The database
// checks that they can see the product.

export async function viewProduct(productId: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("view_product", { p_product_id: productId });
}

export async function likeProduct(productId: string, like: boolean): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("like_product", { p_product_id: productId, p_like: like });
  return { ok: !error };
}

export async function contactProduct(productId: string, method: "whatsapp" | "call" | "email") {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("contact_product", { p_product_id: productId, p_method: method });
}
