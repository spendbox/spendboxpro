"use client";

import { ChevronLeft, ChevronRight, DoorOpen, Gift, Info, LayoutGrid, Mail, MapPin, Maximize2, Phone, Share2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { JoinWizard } from "@/components/join/join-wizard";
import { PerkCard } from "@/components/perks/perk-card";
import { ProductViewer } from "@/components/products/product-viewer";
import { BusinessAvatar } from "@/components/ui/avatar";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import type { ShopPerk } from "@/lib/actions/shop";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/format";
import type { StoreTheme } from "@/lib/store-theme";
import type { FeedProduct, StoreProduct } from "@/lib/types";
import type { StoreApi } from "./three/store/look-controls";
import type { StoreBusiness, StoreTarget } from "./three/store/pieces";
import StoreCanvas from "./three/store/store-canvas";

export interface StoreViewBusiness extends StoreBusiness {
  slug: string;
  email: string | null;
  is_member?: boolean;
}

export type SharedProduct = StoreProduct & { description?: string | null; created_at?: string };

/** A partner business, behind the door at the back of the shop. */
export interface StorePartner {
  id: string;
  name: string;
  slug: string;
  categories: string[];
  logo_url: string | null;
  brand_color: string;
  is_member: boolean;
  welcome: string | null;
}

/** Where the person stands with this business, for the Join button on a shared shop. */
export interface JoinInfo {
  state: "signed-out" | "signed-in" | "member" | "owner";
  /** Joining is paused (for everyone, or this business). */
  closed: boolean;
}

/**
 * A business's 3D store, to look around (only the business can change it,
 * in its editor).
 * - "visit": full screen for customers; products open the swipe viewer.
 * - "public": the shared link, for anyone; products open the swipe viewer
 *   too, and Join asks one question at a time.
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
  perks = [],
  currency = "NGN",
  join,
  partners = [],
  inline = false,
  onExpand,
}: {
  business: StoreViewBusiness;
  theme: StoreTheme;
  products: SharedProduct[];
  mode: "visit" | "public" | "preview";
  onClose?: () => void;
  onOpenProduct?: (productId: string) => void;
  shareUrl?: string;
  perks?: ShopPerk[];
  currency?: string;
  join?: JoinInfo;
  /** Partners: a door at the back opens onto them. */
  partners?: StorePartner[];
  /** Sit inside the page (with a full-screen button) instead of covering it. */
  inline?: boolean;
  onExpand?: () => void;
}) {
  const api = useRef<StoreApi | null>(null);
  const [sheet, setSheet] = useState<"contact" | "about" | "gift" | "partners" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [hint, setHint] = useState(true);
  const member = business.is_member || join?.state === "member";

  const openProduct = (id: string) => {
    if (mode === "public") setViewing(id);
    else onOpenProduct?.(id);
  };
  const startJoin = () => {
    setViewing(null);
    setSheet(null);
    setJoining(true);
  };
  const select = (target: StoreTarget) => {
    if (mode === "preview") return;
    setHint(false);
    if (target.kind === "product") openProduct(target.id);
    else if (target.kind === "more") {
      if (products[0]) openProduct(products[0].id);
    } else if (target.kind === "bell") setSheet("contact");
    else if (target.kind === "board") setSheet("about");
    else if (target.kind === "gift") setSheet("gift");
    else if (target.kind === "partners") setSheet("partners");
  };

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  // Escape closes; arrow keys look around.
  const full = mode !== "preview";
  useEffect(() => {
    if (!full || inline || viewing || joining) return;
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
  }, [full, inline, sheet, viewing, joining, onClose]);

  const share = async () => {
    if (!shareUrl) return;
    const text = `Walk into ${business.name} on Spendbox:`;
    if (typeof navigator.share === "function") {
      await navigator.share({ title: business.name, text, url: shareUrl }).catch(() => {});
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`, "_blank", "noreferrer");
  };

  const message = `Hi ${business.name}, I'm in your Spendbox shop.`;
  const canJoin = mode === "public" && join && (join.state === "signed-out" || join.state === "signed-in") && !join.closed;

  // The shared shop's products, in the shape the swipe viewer uses.
  const feed: FeedProduct[] = products.map((p) => ({
    id: p.id,
    business_id: business.id,
    business_name: business.name,
    business_slug: business.slug,
    business_logo_url: business.logo_url,
    business_color: business.brand_color,
    business_whatsapp: business.whatsapp,
    business_email: business.email,
    kind: "product",
    title: p.title,
    description: p.description ?? null,
    price: p.price,
    currency: p.currency,
    media_type: p.media_type,
    media_url: p.media_url,
    poster_url: p.poster_url,
    created_at: p.created_at ?? "",
    viewed: true,
    liked: false,
    is_member: Boolean(member),
  }));

  const joinButton =
    mode !== "public" || !join ? null : member ? (
      <Link href={`/me/b/${business.slug}`} className="flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-lift active:scale-95">
        Open {business.name}
      </Link>
    ) : canJoin ? (
      <button type="button" onClick={startJoin} className="flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-lift active:scale-95">
        <UserPlus className="size-4" aria-hidden /> Join {business.name}
      </button>
    ) : join.closed && join.state !== "owner" ? (
      <span className="flex h-11 items-center rounded-full bg-white/90 px-4 text-sm font-semibold text-ink">Not taking new members right now</span>
    ) : null;

  return (
    <div
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={`${business.name} store`}
      className={cn("overflow-hidden bg-ink text-white", full && !inline ? "fixed inset-0 z-[75] h-dvh" : "relative size-full rounded-3xl")}
    >
      <div className="absolute inset-0">
        <StoreCanvas business={business} theme={theme} products={products} onSelect={select} apiRef={api} hasGift={perks.length > 0} partners={partners.length} />
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
            <div className="ml-auto flex gap-2">
              {shareUrl && (
                <button type="button" onClick={share} aria-label="Share this shop" className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                  <Share2 className="size-5" aria-hidden />
                </button>
              )}
              {inline && onExpand && (
                <button type="button" onClick={onExpand} aria-label="Full screen" className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                  <Maximize2 className="size-5" aria-hidden />
                </button>
              )}
            </div>
          </div>

          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold whitespace-nowrap backdrop-blur transition-opacity duration-500",
              hint ? "opacity-100" : "opacity-0",
            )}
          >
            {perks.length ? "Tap a product on the screen, or the gift" : "Drag to look around · tap a product on the screen"}
          </div>

          <button type="button" aria-label="Look left" onClick={() => api.current?.look(-1)} className="absolute top-1/2 left-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur hover:bg-black/50 sm:flex">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" aria-label="Look right" onClick={() => api.current?.look(1)} className="absolute top-1/2 right-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur hover:bg-black/50 sm:flex">
            <ChevronRight className="size-5" aria-hidden />
          </button>

          {/* Bottom actions */}
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {joinButton}
            {mode !== "public" && products.length > 0 && (
              <ActionButton onClick={() => openProduct(products[0]!.id)}>
                <LayoutGrid className="size-4" aria-hidden /> All products
              </ActionButton>
            )}
            {partners.length > 0 && (
              <ActionButton onClick={() => setSheet("partners")}>
                <DoorOpen className="size-4" aria-hidden /> Partners
              </ActionButton>
            )}
            {perks.length > 0 && (
              <ActionButton onClick={() => setSheet("gift")}>
                <Gift className="size-4" aria-hidden /> Gift
              </ActionButton>
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

      {viewing && <ProductViewer products={feed} startId={viewing} onClose={() => setViewing(null)} guest={member ? undefined : { onJoin: canJoin ? startJoin : () => setViewing(null) }} />}

      {join && canJoin && (
        <JoinWizard open={joining} onClose={() => setJoining(false)} signedIn={join.state === "signed-in"} slug={business.slug} business={business} />
      )}

      {sheet === "gift" && (
        <Sheet label={`A gift from ${business.name}`} onClose={() => setSheet(null)}>
          <GiftReveal
            business={business}
            perks={perks}
            currency={currency}
            action={
              member ? (
                <Link href={`/me/b/${business.slug}`} className="flex h-12 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  See your perks
                </Link>
              ) : canJoin ? (
                <button type="button" onClick={startJoin} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white">
                  <UserPlus className="size-4" aria-hidden /> Join to get these
                </button>
              ) : (
                <Link href={`/j/${business.slug}`} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white">
                  <UserPlus className="size-4" aria-hidden /> Join to get these
                </Link>
              )
            }
          />
        </Sheet>
      )}

      {sheet === "partners" && (
        <Sheet label={`${business.name}'s partners`} onClose={() => setSheet(null)}>
          <div className="mb-4 flex items-center gap-3 pr-8">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <DoorOpen className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-lg font-bold">Through the door</p>
              <p className="text-sm text-muted">Businesses {business.name} partners with</p>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {partners.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-line">
                <BusinessAvatar name={p.name} color={p.brand_color} logoUrl={p.logo_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-sm text-muted">{p.welcome ? `Join and get ${p.welcome.toLowerCase()}` : p.categories.slice(0, 2).join(" · ") || "On Spendbox"}</p>
                </div>
                <Link href={`/s/${p.slug}`} className="flex h-10 shrink-0 items-center rounded-full bg-brand-600 px-4 text-sm font-semibold text-white">
                  Walk in
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {(sheet === "contact" || sheet === "about") && (
        <Sheet label={sheet === "contact" ? `Contact ${business.name}` : `About ${business.name}`} onClose={() => setSheet(null)}>
          <div className="mb-4 flex items-center gap-3 pr-8">
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
              {member ? (
                <Link href={`/me/b/${business.slug}`} className="mt-1 flex h-12 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  Perks and more
                </Link>
              ) : canJoin ? (
                <button type="button" onClick={startJoin} className="mt-1 flex h-12 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  Join {business.name}
                </button>
              ) : (
                <Link href={`/j/${business.slug}`} className="mt-1 flex h-12 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  Join {business.name}
                </Link>
              )}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

/** A wrapped gift: tap it, it shakes open, and the business's perks come out. */
function GiftReveal({ business, perks, currency, action }: { business: StoreBusiness; perks: ShopPerk[]; currency: string; action: React.ReactNode }) {
  const [stage, setStage] = useState<"closed" | "opening" | "open">("closed");
  useEffect(() => {
    if (stage !== "opening") return;
    const t = setTimeout(() => setStage("open"), 650);
    return () => clearTimeout(t);
  }, [stage]);

  if (stage !== "open") {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <button
          type="button"
          onClick={() => setStage("opening")}
          aria-label="Open the gift"
          className={cn("relative flex size-36 items-center justify-center rounded-[2rem] text-white shadow-lift transition", stage === "closed" ? "animate-bounce-soft" : "animate-gift-open")}
          style={{ background: `linear-gradient(145deg, ${business.brand_color}, color-mix(in oklab, ${business.brand_color} 70%, black))` }}
        >
          <Gift className="size-16" strokeWidth={1.6} aria-hidden />
          <span aria-hidden className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-red-500 text-sm font-bold">
            {perks.length}
          </span>
        </button>
        <div>
          <p className="font-display text-xl font-bold">A gift from {business.name}</p>
          <p className="text-sm text-muted">Tap it to open</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 pr-8">
        <span className="flex size-11 items-center justify-center rounded-2xl text-white" style={{ background: business.brand_color }}>
          <Gift className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-display text-lg font-bold">What members get</p>
          <p className="text-sm text-muted">From {business.name}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {perks.map((p, i) => (
          <div key={p.id} className="animate-fade-up" style={{ animationDelay: `${i * 90}ms`, animationFillMode: "backwards" }}>
            <PerkCard size="sm" audience="customer" kind={p.kind} title={p.title} threshold={p.threshold} details={p.details} validDays={p.valid_days ?? undefined} currency={currency} />
          </div>
        ))}
      </div>
      {action}
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
