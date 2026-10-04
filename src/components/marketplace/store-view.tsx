"use client";

import { ChevronLeft, ChevronRight, Info, LayoutGrid, Mail, MapPin, Phone, Share2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BusinessAvatar } from "@/components/ui/avatar";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { formatMoney, whatsappLink } from "@/lib/format";
import type { StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import type { StoreApi } from "./three/store/look-controls";
import type { StoreBusiness, StoreTarget } from "./three/store/pieces";
import StoreCanvas from "./three/store/store-canvas";

export interface StoreViewBusiness extends StoreBusiness {
  slug: string;
  email: string | null;
  is_member?: boolean;
}

export type SharedProduct = StoreProduct & { description?: string | null };

/**
 * A business's 3D store, to look around (only the business can change it,
 * in its editor).
 * - "visit": full screen for customers; products open the swipe viewer.
 * - "public": the shared link, for anyone; with a Join button.
 * - "preview": a small, look-only preview for the business's settings page.
 */
export default function StoreView({
  business,
  theme,
  products,
  mode,
  onClose,
  onOpenProduct,
  shareUrl,
}: {
  business: StoreViewBusiness;
  theme: StoreTheme;
  products: SharedProduct[];
  mode: "visit" | "public" | "preview";
  onClose?: () => void;
  onOpenProduct?: (productId: string) => void;
  shareUrl?: string;
}) {
  const api = useRef<StoreApi | null>(null);
  const [sheet, setSheet] = useState<"contact" | "about" | null>(null);
  const [product, setProduct] = useState<SharedProduct | null>(null);
  const [hint, setHint] = useState(true);
  const joinHref = `/j/${business.slug}`;

  const openProduct = (id: string) => {
    if (mode === "public") setProduct(products.find((p) => p.id === id) ?? null);
    else onOpenProduct?.(id);
  };
  const select = (target: StoreTarget) => {
    if (mode === "preview") return;
    setHint(false);
    if (target.kind === "product") openProduct(target.id);
    else if (target.kind === "more") {
      if (products[0]) openProduct(products[0].id);
    } else if (target.kind === "bell") setSheet("contact");
    else if (target.kind === "board") setSheet("about");
  };

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  // Escape closes; arrow keys look around.
  const full = mode !== "preview";
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (product) setProduct(null);
        else if (sheet) setSheet(null);
        else onClose?.();
      }
      if (e.key === "ArrowLeft") api.current?.look(-1);
      if (e.key === "ArrowRight") api.current?.look(1);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [full, sheet, product, onClose]);

  const share = async () => {
    if (!shareUrl) return;
    const text = `Walk into ${business.name} on Spendbox:`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: business.name, text, url: shareUrl });
        return;
      } catch {
        // Cancelled: fall back to WhatsApp below only if sharing isn't possible.
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`, "_blank", "noreferrer");
  };

  const message = `Hi ${business.name}, I'm in your Spendbox shop.`;

  return (
    <div
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={`${business.name} store`}
      className={cn("overflow-hidden bg-ink text-white", full ? "fixed inset-0 z-[75] h-dvh" : "relative size-full rounded-3xl")}
    >
      <div className="absolute inset-0">
        <StoreCanvas business={business} theme={theme} products={products} onSelect={select} apiRef={api} />
      </div>

      {full && (
        <>
          {/* Top bar */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/45 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Leave the store" className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <X className="size-5" aria-hidden />
              </button>
            )}
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/35 py-1 pr-3 pl-1 backdrop-blur">
              <BusinessAvatar name={business.name} color={business.brand_color} logoUrl={business.logo_url} size="sm" className="rounded-full" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{business.name}</span>
                <span className="block truncate text-[11px] text-white/80">{business.categories.slice(0, 2).join(" · ") || "Open now"}</span>
              </span>
            </div>
            {shareUrl && (
              <button type="button" onClick={share} aria-label="Share this shop" className="pointer-events-auto ml-auto flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <Share2 className="size-5" aria-hidden />
              </button>
            )}
          </div>

          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold whitespace-nowrap backdrop-blur transition-opacity duration-500",
              hint ? "opacity-100" : "opacity-0",
            )}
          >
            Drag to look around · tap a product on the screen
          </div>

          <button type="button" aria-label="Look left" onClick={() => api.current?.look(-1)} className="absolute top-1/2 left-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur hover:bg-black/50 sm:flex">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" aria-label="Look right" onClick={() => api.current?.look(1)} className="absolute top-1/2 right-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur hover:bg-black/50 sm:flex">
            <ChevronRight className="size-5" aria-hidden />
          </button>

          {/* Bottom actions */}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {mode === "public" ? (
              <Link href={joinHref} className="flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-lift active:scale-95">
                <UserPlus className="size-4" aria-hidden /> Join {business.name}
              </Link>
            ) : (
              products.length > 0 && (
                <ActionButton onClick={() => openProduct(products[0]!.id)}>
                  <LayoutGrid className="size-4" aria-hidden /> All products
                </ActionButton>
              )
            )}
            <ActionButton onClick={() => setSheet("contact")}>
              <WhatsAppIcon className="size-4" /> Chat
            </ActionButton>
            {mode !== "public" && (
              <ActionButton onClick={() => setSheet("about")}>
                <Info className="size-4" aria-hidden /> About
              </ActionButton>
            )}
          </div>

          {/* Products, for screen readers and keyboards */}
          <ul className="sr-only" aria-label={`${business.name} products`}>
            {products.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => openProduct(p.id)}>
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {product && (
        <Sheet label={product.title} onClose={() => setProduct(null)}>
          <div className="-mx-5 -mt-5 mb-4 aspect-square overflow-hidden bg-canvas sm:rounded-t-3xl">
            {product.media_type === "video" ? (
              <video src={product.media_url} poster={product.poster_url ?? undefined} controls playsInline className="size-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.media_url} alt={product.title} className="size-full object-cover" />
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-bold">{product.title}</h2>
            {product.price !== null && <p className="shrink-0 font-semibold">{formatMoney(product.price, product.currency)}</p>}
          </div>
          {product.description && <p className="mt-1 text-sm text-ink-2">{product.description}</p>}
          <Link href={joinHref} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white">
            <UserPlus className="size-4" aria-hidden /> Join {business.name} to see more
          </Link>
        </Sheet>
      )}

      {sheet && (
        <Sheet label={sheet === "contact" ? `Contact ${business.name}` : `About ${business.name}`} onClose={() => setSheet(null)}>
          <div className="mb-4 flex items-center gap-3">
            <BusinessAvatar name={business.name} color={business.brand_color} logoUrl={business.logo_url} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-bold">{business.name}</p>
              <p className="truncate text-sm text-muted">{business.categories.join(", ") || "On Spendbox"}</p>
            </div>
          </div>
          {sheet === "contact" ? (
            <div className="flex flex-col gap-2">
              {business.whatsapp && (
                <a href={whatsappLink(business.whatsapp, message)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#107A42] font-semibold text-white">
                  <WhatsAppIcon className="size-5" /> Chat on WhatsApp
                </a>
              )}
              {business.whatsapp && (
                <a href={`tel:+${business.whatsapp.replace(/\D/g, "")}`} className="flex h-12 items-center justify-center gap-2 rounded-xl font-semibold ring-1 ring-line-strong">
                  <Phone className="size-4" aria-hidden /> Call
                </a>
              )}
              {business.email && (
                <a href={`mailto:${business.email}`} className="flex h-12 items-center justify-center gap-2 rounded-xl font-semibold ring-1 ring-line-strong">
                  <Mail className="size-4" aria-hidden /> Email
                </a>
              )}
              {!business.whatsapp && !business.email && <p className="text-sm text-muted">This business hasn&apos;t added a way to reach them yet.</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              {business.about && <p className="text-ink-2">{business.about}</p>}
              {business.location && (
                <p className="flex items-center gap-2 text-ink-2">
                  <MapPin className="size-4 text-brand-700" aria-hidden /> {business.location}
                </p>
              )}
              <Link href={business.is_member ? `/me/b/${business.slug}` : joinHref} className="mt-1 flex h-12 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                {business.is_member ? "Perks and more" : `Join ${business.name}`}
              </Link>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92dvh] w-full max-w-md animate-fade-up overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink sm:rounded-3xl"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 shadow-card hover:bg-white">
          <X className="size-4" aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-lift active:scale-95">
      {children}
    </button>
  );
}
