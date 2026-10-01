import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

export interface SessionUser {
  id: string;
  phone: string | null;
}

/** The signed-in person, or null. Cached for the duration of one request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, phone: (claims.phone as string | undefined) ?? null };
});

export async function requireUser(next = "/me") {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Businesses the signed-in person owns, oldest first. */
export const getOwnedBusinesses = cache(async (): Promise<Business[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  return (data ?? []) as Business[];
});

/** Loads a business the signed-in person owns, or shows "not found". */
export const requireOwnedBusiness = cache(async (businessId: string) => {
  const user = await requireUser(`/dashboard/${businessId}`);
  const businesses = await getOwnedBusinesses();
  const business = businesses.find((b) => b.id === businessId);
  if (!business) notFound();
  return { user, business, businesses };
});

/** Where to send someone right after they sign in. */
export async function homePathFor(userId: string) {
  const supabase = await createClient();
  const [{ count: memberships }, owned] = await Promise.all([
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("customer_id", userId),
    getOwnedBusinesses(),
  ]);
  if (owned.length > 0 && !memberships) return `/dashboard/${owned[0].id}`;
  return "/me";
}
