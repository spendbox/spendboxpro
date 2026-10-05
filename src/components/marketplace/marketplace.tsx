"use client";

import { LayoutGrid, Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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

// A quick check only (making a test 3D context would slow the page down); if 3D
// then fails to start, the map falls back to the grid (see MapBoundary).
const webglAvailable = () => typeof window !== "undefined" && "WebGLRenderingContext" in window;

const noop = () => () => {};

/** Shows the grid instead if the 3D map can't start on this device. */
class MapBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Starts the 3D map only once the page has painted, the browser is free and
 * the map is on screen; then pauses it whenever it's scrolled away or the tab
 * is hidden. The page stays quick to open, and the computer stays cool.
 */
function useMapLifecycle(box: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [started, setStarted] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    const el = box.current;
    if (!el) return;
    let idle: number | undefined;
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const observer = new IntersectionObserver(([entry]) => {
      const seen = Boolean(entry?.isIntersecting);
      setOnScreen(seen);
      if (seen && idle === undefined) idle = ric(() => setStarted(true), { timeout: 1200 });
    });
    observer.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (idle !== undefined) cancel(idle);
    };
  }, [box, enabled]);
  return { started, paused: !onScreen || !visible };
}

/**
 * Explore: the customer's products as a grid of circles (the default), or a 3D
 * map of their shops (tap one to walk in). The choice is remembered on this device.
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
        return (localStorage.getItem(VIEW_KEY) as View | null) ?? "grid";
      } catch {
        return "grid";
      }
    },
    () => "grid" as View,
  );
  const [chosen, setChosen] = useState<View | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const view: View = !canMap || mapFailed ? "grid" : (chosen ?? saved);
  const [expanded, setExpanded] = useState(false);
  const mapBox = useRef<HTMLDivElement>(null);
  const map = useMapLifecycle(mapBox, view === "map");

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
            .map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, media_type: p.media_type, media_url: p.media_url, poster_url: p.poster_url, description: p.description, viewed: p.viewed }))
        : [],
    [products, store],
  );

  // The shop's perks, for the gift on its counter (fetched when the shop opens).
  const [gift, setGift] = useState<{ slug: string; perks: ShopPerk[]; currency: string; products: StoreProduct[] } | null>(null);
  useEffect(() => {
    if (!storeSlug) return;
    let alive = true;
    void getShopPerks(storeSlug).then((r) => alive && setGift({ slug: storeSlug, ...r }));
    return () => {
      alive = false;
    };
  }, [storeSlug]);
  const shopGift = gift && gift.slug === storeSlug ? gift : null;
  // Once the whole shop has loaded, its hall shows every product (keeping which ones they've seen).
  const hallProducts = useMemo(() => {
    if (!shopGift || shopGift.products.length <= storeProducts.length) return storeProducts;
    const seen = new Map(storeProducts.map((p) => [p.id, p.viewed]));
    return shopGift.products.map((p) => ({ ...p, viewed: seen.get(p.id) ?? false }));
  }, [shopGift, storeProducts]);

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
                ["grid", "Grid", LayoutGrid],
                ["map", "Map", MapIcon],
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
          ref={mapBox}
          className={cn(
            "overflow-hidden bg-[#dcefe4]",
            expanded ? "fixed inset-0 z-[70] h-dvh" : "relative -mx-4 h-[calc(100dvh-19rem)] min-h-[26rem] sm:mx-0 sm:h-[34rem] sm:rounded-3xl sm:ring-1 sm:ring-line",
          )}
        >
          {map.started ? (
            <MapBoundary onFail={() => setMapFailed(true)}>
              <CityMap businesses={businesses} onOpen={openStore} paused={Boolean(store) || (map.paused && !expanded)} expanded={expanded} onToggleExpanded={() => setExpanded((e) => !e)} />
            </MapBoundary>
          ) : (
            <MapLoading />
          )}
        </div>
      ) : (
        <ProductCircles products={products} hrefFor={(p) => `/me/p/${p.id}`} />
      )}

      {storeBusiness && storeTheme && (
        <StoreView
          business={storeBusiness}
          theme={storeTheme}
          products={hallProducts}
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
