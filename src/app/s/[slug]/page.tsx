import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { readTheme } from "@/lib/store-theme";
import { createClient } from "@/lib/supabase/server";
import { SharedStore, type SharedStoreData } from "./shared-store";

// A business's 3D shop, from a shared link. Anyone can walk in; joining is one tap.

const loadStore = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_store", { p_slug: slug.slice(0, 80) });
  return (data as SharedStoreData | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) return { title: "Shop not found" };
  return {
    title: `${store.name}'s shop`,
    description: `Walk into ${store.name} on Spendbox, look around and join for member perks.`,
    openGraph: { title: `Walk into ${store.name}`, description: "Look around their 3D shop on Spendbox.", images: store.logo_url ? [store.logo_url] : undefined },
  };
}

export default async function SharedStorePage({ params, searchParams }: PageProps<"/s/[slug]">) {
  const [{ slug }, { ref }] = await Promise.all([params, searchParams]);
  // A customer's invite code, so the friend who joins here counts for their invite perk.
  const refCode = typeof ref === "string" ? ref.slice(0, 20) : null;
  const store = await loadStore(slug);
  if (!store) notFound();

  // Where the visitor stands with this business, for the Join button.
  const user = await getUser();
  let state: "signed-out" | "signed-in" | "member" | "owner" = user ? "signed-in" : "signed-out";
  if (user) {
    const supabase = await createClient();
    const [{ data: owned }, { data: membership }] = await Promise.all([
      supabase.from("businesses").select("id").eq("id", store.id).eq("owner_id", user.id).maybeSingle(),
      supabase.from("memberships").select("id").eq("business_id", store.id).eq("customer_id", user.id).maybeSingle(),
    ]);
    if (owned) state = "owner";
    else if (membership) state = "member";
  }
  const closed = !(await getSettings()).joinsOpen;

  return <SharedStore store={{ ...store, store_theme: readTheme(store.store_theme) }} shareUrl={`${siteUrl()}/s/${store.slug}`} join={{ state, closed, refCode }} />;
}
