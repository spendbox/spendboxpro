"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedBusiness } from "@/lib/auth";
import { readTheme } from "@/lib/store-theme";
import { createClient } from "@/lib/supabase/server";

/** Saves how the business's 3D store looks (anything unknown is reset to the defaults). */
export async function saveStoreTheme(bizId: string, theme: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireOwnedBusiness(bizId);
  const clean = readTheme(theme);
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ store_theme: clean }).eq("id", bizId);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  revalidatePath(`/dashboard/${bizId}`, "layout");
  revalidatePath("/me", "layout");
  return { ok: true };
}
