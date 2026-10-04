"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import type { JoinInfo, SharedProduct } from "@/components/marketplace/store-view";
import type { ShopPerk } from "@/lib/actions/shop";
import { BusinessAvatar } from "@/components/ui/avatar";
import type { StoreTheme } from "@/lib/store-theme";

const StoreView = dynamic(() => import("@/components/marketplace/store-view"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-ink text-white">
      <p className="animate-pulse-soft text-sm font-semibold">Walking in…</p>
    </div>
  ),
});

export interface SharedStoreData {
  id: string;
  name: string;
  slug: string;
  categories: string[];
  location: string | null;
  about: string | null;
  logo_url: string | null;
  brand_color: string;
  whatsapp: string | null;
  store_theme: unknown;
  currency: string;
  products: SharedProduct[];
  perks: ShopPerk[];
}

const noop = () => () => {};
// A quick check (a test 3D context would slow the page down).
const webgl = () => "WebGLRenderingContext" in window;

export function SharedStore({ store, shareUrl, join }: { store: SharedStoreData & { store_theme: StoreTheme }; shareUrl: string; join: JoinInfo }) {
  const canShow = useSyncExternalStore(noop, webgl, () => true);
  if (!canShow) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <BusinessAvatar name={store.name} color={store.brand_color} logoUrl={store.logo_url} size="lg" />
        <h1 className="font-display text-2xl font-bold">{store.name}</h1>
        <p className="text-muted">This phone can&apos;t show 3D shops, but you can still join.</p>
        <a href={`/j/${store.slug}`} className="flex h-12 items-center rounded-xl bg-brand-600 px-6 font-semibold text-white">
          Join {store.name}
        </a>
      </main>
    );
  }
  return (
    <StoreView
      business={{ ...store, email: null, is_member: join.state === "member" }}
      theme={store.store_theme}
      products={store.products.map((p) => ({ ...p, price: p.price === null ? null : Number(p.price) }))}
      mode="public"
      shareUrl={shareUrl}
      perks={store.perks ?? []}
      currency={store.currency}
      join={join}
    />
  );
}
