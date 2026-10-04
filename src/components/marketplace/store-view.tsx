"use client";

import { Check, ChevronLeft, ChevronRight, Info, LayoutGrid, Mail, MapPin, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BusinessAvatar } from "@/components/ui/avatar";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/format";
import { TABLES, type StoreTheme, type TableStyle } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import type { StoreApi } from "./three/store/look-controls";
import type { StoreBusiness, StoreTarget } from "./three/store/pieces";
import StoreCanvas from "./three/store/store-canvas";

export interface StoreViewBusiness extends StoreBusiness {
  slug: string;
  email: string | null;
  is_member?: boolean;
}

/**
 * A business's 3D store. Full screen for customers; "embedded" for the
 * business's own designer preview. Products on the shelves open the swipe viewer.
 */
export default function StoreView({
  business,
  theme,
  products,
  mode,
  onClose,
  onOpenProduct,
  onTableChange,
}: {
  business: StoreViewBusiness;
  theme: StoreTheme;
  products: StoreProduct[];
  mode: "fullscreen" | "embedded";
  onClose?: () => void;
  onOpenProduct?: (productId: string) => void;
  /** The designer saves the table style; shoppers just try styles out (remembered on their phone). */
  onTableChange?: (table: TableStyle) => void;
}) {
  const api = useRef<StoreApi | null>(null);
  const [sheet, setSheet] = useState<"contact" | "about" | "table" | null>(null);
  const tableKey = `spendbox-table-${business.id}`;
  const [tried, setTried] = useState<TableStyle | null>(() => {
    if (onTableChange) return null;
    try {
      const saved = localStorage.getItem(tableKey);
      return TABLES.some((t) => t.id === saved) ? (saved as TableStyle) : null;
    } catch {
      return null;
    }
  });
  const shown = useMemo(() => (tried ? { ...theme, table: tried } : theme), [theme, tried]);
  const chooseTable = (table: TableStyle) => {
    if (onTableChange) return onTableChange(table);
    setTried(table);
    try {
      localStorage.setItem(tableKey, table);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  };
  const [hint, setHint] = useState(true);
  const select = (target: StoreTarget) => {
    setHint(false);
    if (target.kind === "product") onOpenProduct?.(target.id);
    else if (target.kind === "more") {
      if (products[0]) onOpenProduct?.(products[0].id);
    } else if (target.kind === "bell") setSheet("contact");
    else if (target.kind === "table") setSheet("table");
    else setSheet("about");
  };

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  // Escape closes; arrow keys look around.
  useEffect(() => {
    if (mode !== "fullscreen") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sheet) setSheet(null);
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
  }, [mode, sheet, onClose]);

  const message = `Hi ${business.name}, I'm in your Spendbox store.`;

  return (
    <div
      role={mode === "fullscreen" ? "dialog" : undefined}
      aria-modal={mode === "fullscreen" ? true : undefined}
      aria-label={`${business.name} store`}
      className={cn("overflow-hidden bg-ink text-white", mode === "fullscreen" ? "fixed inset-0 z-[75] h-dvh" : "relative size-full rounded-3xl")}
    >
      <div className="absolute inset-0">
        <StoreCanvas business={business} theme={shown} products={products} onSelect={select} apiRef={api} />
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/45 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
        {mode === "fullscreen" && (
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
      </div>

      {/* Hint */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold whitespace-nowrap backdrop-blur transition-opacity duration-500",
          hint ? "opacity-100" : "opacity-0",
        )}
      >
        {theme.lounge ? "Drag to look around · tap a product or the table" : "Drag to look around · tap a product"}
      </div>

      {products.length === 0 && (
        <p className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold backdrop-blur">
          Nothing on the shelves yet
        </p>
      )}

      {/* Look buttons (desktop) */}
      <button type="button" aria-label="Look left" onClick={() => api.current?.look(-1)} className="absolute top-1/2 left-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur hover:bg-black/50 sm:flex">
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button type="button" aria-label="Look right" onClick={() => api.current?.look(1)} className="absolute top-1/2 right-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur hover:bg-black/50 sm:flex">
        <ChevronRight className="size-5" aria-hidden />
      </button>

      {/* Bottom actions */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {products.length > 0 && (
          <ActionButton onClick={() => onOpenProduct?.(products[0]!.id)}>
            <LayoutGrid className="size-4" aria-hidden /> All products
          </ActionButton>
        )}
        <ActionButton onClick={() => setSheet("contact")}>
          <WhatsAppIcon className="size-4" /> Chat
        </ActionButton>
        <ActionButton onClick={() => setSheet("about")}>
          <Info className="size-4" aria-hidden /> About
        </ActionButton>
      </div>

      {/* Products, for screen readers and keyboards */}
      <ul className="sr-only" aria-label={`${business.name} products`}>
        {products.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onOpenProduct?.(p.id)}>
              {p.title}
            </button>
          </li>
        ))}
      </ul>

      {sheet && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSheet(null)}>
          <div
            role="dialog"
            aria-label={sheet === "contact" ? `Contact ${business.name}` : sheet === "table" ? "Table style" : `About ${business.name}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md animate-fade-up rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink sm:rounded-3xl"
          >
            <div className="mb-4 flex items-center gap-3">
              <BusinessAvatar name={business.name} color={business.brand_color} logoUrl={business.logo_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold">{business.name}</p>
                <p className="truncate text-sm text-muted">{business.categories.join(", ") || "On Spendbox"}</p>
              </div>
              <button type="button" onClick={() => setSheet(null)} aria-label="Close" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {sheet === "table" ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{onTableChange ? "Pick the table set for your lounge corner." : "Try a different table set. Only you see the change."}</p>
                <div role="radiogroup" aria-label="Table style" className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto">
                  {TABLES.map((t) => {
                    const on = shown.table === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => chooseTable(t.id)}
                        className={cn("flex items-center gap-3 rounded-2xl p-3 text-left ring-2 transition", on ? "bg-brand-50 ring-brand-600" : "bg-white ring-line hover:ring-line-strong")}
                      >
                        <span aria-hidden className="relative size-11 shrink-0 overflow-hidden rounded-full shadow-inner" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{t.label}</span>
                          <span className="block text-xs text-muted">{t.description}</span>
                        </span>
                        {on && <Check className="size-4 shrink-0 text-brand-700" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : sheet === "contact" ? (
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
                <Link
                  href={business.is_member ? `/me/b/${business.slug}` : `/j/${business.slug}`}
                  className="mt-1 flex h-12 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white"
                >
                  {business.is_member ? "Perks and more" : `Join ${business.name}`}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
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
