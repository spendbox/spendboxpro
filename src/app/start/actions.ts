"use server";

import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizeWhatsapp } from "@/lib/phone";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { cleanCategories } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export interface NewBusiness {
  name: string;
  categories: string[];
  location: string;
  whatsapp: string;
}

/** Returns an error message, or redirects to the new dashboard. */
export async function createBusiness(input: NewBusiness): Promise<string | void> {
  const name = input.name?.trim() ?? "";
  if (name.length < 2 || name.length > 80) return "Please enter your business name.";
  if (!(await getUser())) return "Please sign in first.";

  const categories = cleanCategories(input.categories);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_business", {
    p_name: name,
    p_category: categories[0] ?? null,
    p_location: input.location?.trim().slice(0, 80) || null,
    p_whatsapp: normalizeWhatsapp(input.whatsapp, DEFAULT_COUNTRY_CODE),
  });
  if (error || !data) return error?.message ?? "Could not create your business. Please try again.";
  // The owner's email is the business's contact email until they change it in Settings.
  const { data: owner } = await supabase.from("profiles").select("email").eq("id", (await getUser())!.id).maybeSingle();
  const extra = { ...(categories.length ? { categories } : {}), ...(owner?.email ? { email: owner.email } : {}) };
  if (Object.keys(extra).length) await supabase.from("businesses").update(extra).eq("id", data);
  redirect(`/dashboard/${data}?welcome=1`);
}
