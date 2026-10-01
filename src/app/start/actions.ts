"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface NewBusiness {
  name: string;
  category: string;
  location: string;
  whatsapp: string;
}

/** Returns an error message, or redirects to the new dashboard. */
export async function createBusiness(input: NewBusiness): Promise<string | void> {
  const name = input.name?.trim() ?? "";
  if (name.length < 2 || name.length > 80) return "Please enter your business name.";
  if (!(await getUser())) return "Please verify your phone number first.";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_business", {
    p_name: name,
    p_category: input.category?.slice(0, 40) || null,
    p_location: input.location?.trim().slice(0, 80) || null,
    p_whatsapp: input.whatsapp?.replace(/[^\d+]/g, "").slice(0, 20) || null,
  });
  if (error || !data) return error?.message ?? "Could not create your business. Please try again.";
  redirect(`/dashboard/${data}?welcome=1`);
}
