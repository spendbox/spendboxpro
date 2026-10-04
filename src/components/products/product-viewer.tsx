"use client";

import { Heart, Mail, Phone, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { contactProduct, likeProduct, viewProduct } from "@/app/me/product-actions";
import { BusinessAvatar } from "@/components/ui/avatar";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { formatMoney, whatsappLink } from "@/lib/format";
import type { FeedProduct } from "@/lib/types";

/**
 * Full-screen, swipe up and down through products (like TikTok or Reels).
 * Videos play when they're on screen. Each product counts as viewed once it's
 * mostly on screen. In `guest` mode (a shared shop, before joining), nothing
 * is counted, and liking or tapping the business asks them to join.
 */
export function ProductViewer({
  products,
  startId,
  backHref = "/me",
  onClose,
  guest,
}: {
  products: FeedProduct[];
  startId: string;
  backHref?: string;
  onClose?: () => void;
  guest?: { onJoin: () => void };
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const counted = useRef(new Set<string>());
  const [active, setActive] = useState(startId);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState<Record<string, boolean>>(() => Object.fromEntries(products.map((p) => [p.id, p.liked])));

  const close = useCallback(() => (onClose ? onClose() : router.push(backHref)), [router, backHref, onClose]);

  // Start at the product that was tapped, and keep the page behind from scrolling.
  useEffect(() => {
    document.getElementById(`slide-${startId}`)?.scrollIntoView({ block: "start" });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [startId]);

  // Which product is on screen.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.id!);
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-slide]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Count the view, and play only the video on screen.
  useEffect(() => {
    if (!guest && !counted.current.has(active)) {
      counted.current.add(active);
      void viewProduct(active);
    }
    scroller.current?.querySelectorAll<HTMLVideoElement>("video[data-id]").forEach((v) => {
      if (v.dataset.id === active) void v.play().catch(() => {});
      else v.pause();
    });
  }, [active, guest]);

  // Arrow keys and Escape on computers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        scroller.current?.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * window.innerHeight, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const toggleLike = (p: FeedProduct) => {
    if (guest) return guest.onJoin();
    const next = !liked[p.id];
    setLiked((l) => ({ ...l, [p.id]: next }));
    void likeProduct(p.id, next).then((r) => {
      if (!r.ok) setLiked((l) => ({ ...l, [p.id]: !next }));
    });
  };

  return (
    <div
      ref={scroller}
      role="dialog"
      aria-modal="true"
      aria-label="Products"
      className="fixed inset-0 z-[80] h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain bg-black text-white [scrollbar-width:none]"
    >
      {products.map((p) => {
        const message = `Hi ${p.business_name}, I saw “${p.title}” on Spendbox. Is it available?`;
        return (
          <section key={p.id} id={`slide-${p.id}`} data-slide data-id={p.id} aria-label={p.title} className="relative h-dvh w-full snap-start snap-always overflow-hidden">
            {p.media_type === "video" ? (
              <video
                data-id={p.id}
                src={p.media_url}
                poster={p.poster_url ?? undefined}
                loop
                playsInline
                muted={muted}
                preload={p.id === active ? "auto" : "metadata"}
                onClick={() => setMuted((m) => !m)}
                className="absolute inset-0 size-full object-contain"
              />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- blurred backdrop */}
                <img src={p.media_url} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />
                {/* eslint-disable-next-line @next/next/no-img-element -- product media comes from Supabase Storage */}
                <img src={p.media_url} alt={p.title} className="absolute inset-0 size-full object-contain" />
              </>
            )}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

            {/* Top: close, and sound for videos */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <button type="button" onClick={close} aria-label="Close" className="flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur">
                <X className="size-5" aria-hidden />
              </button>
              {p.media_type === "video" && (
                <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Sound on" : "Sound off"} className="flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur">
                  {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
                </button>
              )}
            </div>

            {/* Bottom: who and what */}
            <div className="absolute bottom-0 left-0 flex max-w-[calc(100%-5.5rem)] flex-col gap-2 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {guest ? (
                <button type="button" onClick={guest.onJoin} className="flex w-fit items-center gap-2">
                  <BusinessAvatar name={p.business_name} color={p.business_color} logoUrl={p.business_logo_url} size="sm" />
                  <span className="font-semibold drop-shadow">{p.business_name}</span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink">Join</span>
                </button>
              ) : (
                <Link href={p.is_member ? `/me/b/${p.business_slug}` : `/j/${p.business_slug}`} className="flex w-fit items-center gap-2">
                  <BusinessAvatar name={p.business_name} color={p.business_color} logoUrl={p.business_logo_url} size="sm" />
                  <span className="font-semibold drop-shadow">{p.business_name}</span>
                  {!p.is_member && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">Join</span>}
                </Link>
              )}
              <h2 className="font-display text-xl leading-tight font-bold drop-shadow">{p.title}</h2>
              {p.price !== null && <p className="w-fit rounded-full bg-white px-3 py-1 text-sm font-bold text-ink">{formatMoney(p.price, p.currency)}</p>}
              {p.description && <Description text={p.description} />}
            </div>

            {/* Right: like and get in touch */}
            <div className="absolute right-3 bottom-0 flex flex-col items-center gap-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <RailButton label={liked[p.id] ? "Liked" : "Like"} onClick={() => toggleLike(p)} pressed={liked[p.id]}>
                <Heart className={cn("size-6", liked[p.id] && "fill-red-500 text-red-500")} aria-hidden />
              </RailButton>
              {p.business_whatsapp && (
                <RailButton label="Chat" href={whatsappLink(p.business_whatsapp, message)} onClick={() => !guest && void contactProduct(p.id, "whatsapp")} className="bg-[#25D366]">
                  <WhatsAppIcon className="size-6" />
                </RailButton>
              )}
              {p.business_whatsapp && (
                <RailButton label="Call" href={`tel:+${p.business_whatsapp.replace(/\D/g, "")}`} onClick={() => !guest && void contactProduct(p.id, "call")}>
                  <Phone className="size-5" aria-hidden />
                </RailButton>
              )}
              {p.business_email && (
                <RailButton label="Email" href={`mailto:${p.business_email}?subject=${encodeURIComponent(p.title)}&body=${encodeURIComponent(message)}`} onClick={() => !guest && void contactProduct(p.id, "email")}>
                  <Mail className="size-5" aria-hidden />
                </RailButton>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RailButton({
  label,
  children,
  onClick,
  href,
  pressed,
  className,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  pressed?: boolean;
  className?: string;
}) {
  const circle = cn("flex size-12 items-center justify-center rounded-full bg-white/20 backdrop-blur transition active:scale-90", className);
  const content = (
    <>
      <span className={circle}>{children}</span>
      <span className="text-xs font-semibold drop-shadow">{label}</span>
    </>
  );
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={onClick} className="flex flex-col items-center gap-1" aria-label={label}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="flex flex-col items-center gap-1" aria-label={label}>
      {content}
    </button>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} className={cn("text-left text-sm text-white/90 drop-shadow", !open && "line-clamp-2")}>
      {text}
    </button>
  );
}
