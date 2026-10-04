"use client";

import { LayoutGrid, Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ProductCircles } from "@/components/products/product-circles";
import { getShopPerks, type ShopPerk } from "@/lib/actions/shop";
import { cn } from "@/lib/cn";
import { readTheme } from "@/lib/store-theme";
import type { ExploreBusiness, FeedProduct, StoreProduct } from "@/lib/types";

// The 3D parts load only when they're shown, so the page itself stays light.
const CityMap = dynamic(() => import("./city-map"), { ssr: false, loading: () => <MapLoading /> });
const StoreView = dynamic(() => import("./store-view"), { ssr: false, loading: () => <StoreLoading /> });

type View = "map" | "grid";
const VIEW_KEY = "spendbox-explore-view";

// Checked once per visit: creating a test 3D context isn't free.
let webglCache: boolean | null = null;
function webglAvailable() {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    webglCache = Boolean(gl);
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

const noop = () => () => {};

/**
 * Explore: a 3D map of the customer's shops (tap one to walk in), or the same
 * products as a grid of circles. The choice is remembered on this device.
 */
export function Marketplace({ businesses, products }: { businesses: ExploreBusiness[]; products: FeedProduct[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const storeSlug = params.get("store");
  const canMap = useSyncExternalStore(noop, webglAvailable, () => true);
  const saved = useSyncExternalStore(
    noop,
    () => {
      try {
        return (localStorage.getItem(VIEW_KEY) as View | null) ?? "map";
      } catch {
        return "map";
      }
    },
    () => "map" as View,
  );
  const [chosen, setChosen] = useState<View | null>(null);
  const view: View = !canMap ? "grid" : (chosen ?? saved);
  const [expanded, setExpanded] = useState(false);

  const choose = (v: View) => {
    setChosen(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };

  const store = useMemo(() => businesses.find((b) => b.slug === storeSlug) ?? null, [businesses, storeSlug]);
  const storeBusiness = useMemo(
    () =>
      store && {
        id: store.id,
        slug: store.slug,
        name: store.name,
        categories: store.categories,
        location: store.location,
        about: store.about,
        logo_url: store.logo_url,
        brand_color: store.brand_color,
        whatsapp: store.whatsapp,
        email: store.email,
        is_member: store.is_member,
      },
    [store],
  );
  const storeTheme = useMemo(() => (store ? readTheme(store.store_theme) : null), [store]);
  const storeProducts = useMemo<StoreProduct[]>(
    () =>
      store
        ? products
            .filter((p) => p.business_id === store.id)
            .map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, media_type: p.media_type, media_url: p.media_url, poster_url: p.poster_url, viewed: p.viewed }))
        : [],
    [products, store],
  );

  // The shop's perks, for the gift on its counter (fetched when the shop opens).
  const [gift, setGift] = useState<{ slug: string; perks: ShopPerk[]; currency: string } | null>(null);
  useEffect(() => {
    if (!storeSlug) return;
    let alive = true;
    void getShopPerks(storeSlug).then((r) => alive && setGift({ slug: storeSlug, ...r }));
    return () => {
      alive = false;
    };
  }, [storeSlug]);
  const shopGift = gift && gift.slug === storeSlug ? gift : null;

  const openStore = useCallback((b: ExploreBusiness) => router.push(`${pathname}?store=${encodeURIComponent(b.slug)}`, { scroll: false }), [router, pathname]);
  const closeStore = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);
  const openProduct = useCallback((id: string) => store && router.push(`/me/p/${id}?b=${store.id}`), [router, store]);

  // Leaving full-screen map with Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !store && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, store]);

  const unseen = products.filter((p) => !p.viewed).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {view === "map"
            ? `${businesses.length} ${businesses.length === 1 ? "shop" : "shops"} · ${unseen ? `${unseen} new` : "all seen"}`
            : unseen
              ? `${unseen} new to see`
              : "You've seen everything. Check back soon."}
        </p>
        {canMap && (
          <div role="radiogroup" aria-label="View" className="flex rounded-full bg-black/[0.05] p-1">
            {(
              [
                ["map", "Map", MapIcon],
                ["grid", "Grid", LayoutGrid],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => choose(v)}
                className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition", view === v ? "bg-white text-ink shadow-card" : "text-ink-2")}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "map" ? (
        <div
          className={cn(
            "overflow-hidden bg-[#dcefe4]",
            expanded ? "fixed inset-0 z-[70] h-dvh" : "relative -mx-4 h-[calc(100dvh-19rem)] min-h-[26rem] sm:mx-0 sm:h-[34rem] sm:rounded-3xl sm:ring-1 sm:ring-line",
          )}
        >
          <CityMap businesses={businesses} onOpen={openStore} paused={Boolean(store)} expanded={expanded} onToggleExpanded={() => setExpanded((e) => !e)} />
        </div>
      ) : (
        <ProductCircles products={products} hrefFor={(p) => `/me/p/${p.id}`} />
      )}

      {storeBusiness && storeTheme && (
        <StoreView
          business={storeBusiness}
          theme={storeTheme}
          products={storeProducts}
          mode="visit"
          onClose={closeStore}
          onOpenProduct={openProduct}
          shareUrl={typeof window === "undefined" ? undefined : `${window.location.origin}/s/${storeBusiness.slug}`}
          perks={shopGift?.perks}
          currency={shopGift?.currency}
        />
      )}
    </div>
  );
}

function MapLoading() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#dcefe4] to-[#c6e4cf] text-brand-800">
      <div className="grid animate-pulse-soft grid-cols-3 gap-2 [transform:rotateX(55deg)_rotateZ(45deg)]">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={cn("size-7 rounded-md", i % 3 === 1 ? "bg-white/80" : "bg-brand-600/70")} />
        ))}
      </div>
      <p className="text-sm font-semibold">Opening the market…</p>
    </div>
  );
}

function StoreLoading() {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink text-white">
      <p className="animate-pulse-soft text-sm font-semibold">Walking in…</p>
    </div>
  );
}
