"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Globe, MessageCircle, SquarePen, Users, Wallet } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import type { LiteTab } from "./lite-pref";

// Lite's frame (docs/LITE.md): a big title with the world and your face on the right, the page in
// the middle, and four tabs at the bottom. It sits over where the city would be (the city isn't
// drawn at all in Lite); pop-ups, invitations and game tables still open over it as usual.

const TITLES: Record<LiteTab, string> = { chats: "Chats", events: "Events", people: "People", wallet: "Wallet" };

export function LiteShell({
  tab,
  onTab,
  me,
  onProfile,
  onWorld,
  onNewChat,
  unread,
  eventsLive,
  onFrame,
  above,
  message,
  children,
}: {
  tab: LiteTab;
  onTab: (t: LiteTab) => void;
  me: { name: string; avatar: Avatar };
  onProfile: () => void;
  onWorld: () => void;
  onNewChat: () => void;
  /** New messages and notices (the Chats tab's number). */
  unread: number;
  /** Something's on now (a dot on Events). */
  eventsLive: boolean;
  /** Where the page starts and ends (px from the top and bottom): the chat panel fits itself there. */
  onFrame: (top: number, bottom: number) => void;
  /** Under the title, above the page (Chats: one sponsored row). */
  above?: React.ReactNode;
  message: { text: string; tone: "good" | "bad" | "info" } | null;
  children?: React.ReactNode;
}) {
  const head = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLElement>(null);
  const frame = useRef(onFrame);
  useLayoutEffect(() => {
    frame.current = onFrame;
  });
  useLayoutEffect(() => {
    const report = () => frame.current(Math.round(head.current?.getBoundingClientRect().bottom ?? 0), Math.round(foot.current?.getBoundingClientRect().height ?? 0));
    report();
    const ro = new ResizeObserver(report);
    if (head.current) ro.observe(head.current);
    if (foot.current) ro.observe(foot.current);
    window.addEventListener("resize", report);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
    };
  }, []);

  const tabs: { id: LiteTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; dot?: boolean }[] = [
    { id: "chats", label: "Chats", icon: MessageCircle, badge: unread },
    { id: "events", label: "Events", icon: CalendarDays, dot: eventsLive },
    { id: "people", label: "People", icon: Users },
    { id: "wallet", label: "Wallet", icon: Wallet },
  ];

  return (
    <div className="pointer-events-auto fixed inset-0 z-[35] flex flex-col bg-white text-ink">
      <div ref={head} className="mx-auto w-full max-w-xl shrink-0">
        <header className="flex items-center gap-3 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <h1 className="min-w-0 flex-1 truncate text-[30px] font-extrabold leading-tight tracking-tight">{TITLES[tab]}</h1>
          {tab === "chats" && (
            <button onClick={onNewChat} className="grid size-11 shrink-0 place-items-center rounded-full bg-panel-2" aria-label="New chat">
              <SquarePen className="size-5" />
            </button>
          )}
          <button onClick={onWorld} className="grid size-11 shrink-0 place-items-center rounded-full bg-panel-2" aria-label="Open the world" title="The world">
            <Globe className="size-[22px]" />
          </button>
          <button onClick={onProfile} className="shrink-0 rounded-full" aria-label="Your profile">
            <AvatarFace avatar={me.avatar} size={44} className="rounded-full" />
          </button>
        </header>
        {above}
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">{children}</main>

      <nav ref={foot} aria-label="Sections" className="shrink-0 border-t border-line/70 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid h-[4.5rem] max-w-xl grid-cols-4 px-2">
          {tabs.map((t) => {
            const on = t.id === tab;
            return (
              <button key={t.id} onClick={() => onTab(t.id)} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 text-xs", on ? "font-extrabold text-ink" : "font-bold text-muted")}>
                <span className={cn("relative grid h-8 w-14 place-items-center rounded-full", on && "bg-[#ece6ff] text-[#5b3cc4]")}>
                  <t.icon className="size-[22px]" />
                  {!!t.badge && t.badge > 0 && (
                    <span className="absolute -top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-hit px-1 text-[11px] font-bold text-white ring-2 ring-white">{t.badge > 99 ? "99+" : t.badge}</span>
                  )}
                  {t.dot && <span className="absolute right-2.5 top-0.5 size-2.5 rounded-full bg-hit ring-2 ring-white" />}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <LiteWelcome />
      {/* On the page itself, so it shows over the chats too (they're drawn there, above the game's layer). */}
      {message &&
        createPortal(
        <div className="pointer-events-none fixed inset-x-0 z-[1000] flex justify-center px-4" style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
          <p
            role="status"
            className={cn(
              "max-w-md rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-lg",
              message.tone === "good" && "bg-ink text-white",
              message.tone === "bad" && "bg-hit text-white",
              message.tone === "info" && "bg-white text-ink ring-1 ring-line",
            )}
          >
            {message.text}
          </p>
        </div>,
          document.body,
        )}
    </div>
  );
}

/** The world's way back to Lite: a pill above the chat bubble, and once, a note offering it. */
export function LiteButton({ onClick, className, glow }: { onClick: () => void; className?: string; glow?: boolean }) {
  return (
    <button onClick={onClick} className={cn("pointer-events-auto relative flex h-12 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-ink shadow-[0_4px_14px_rgba(0,0,0,0.18)]", className)} aria-label="Switch to Lite: chats, events, people and your wallet">
      {glow && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-full ring-4 ring-gold/70" />}
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
      Lite
    </button>
  );
}

export function LiteOffer({ onTry, onNo }: { onTry: () => void; onNo: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[5.5rem] z-[36] flex justify-center px-4 sm:top-24">
      <div className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-white shadow-2xl">
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <b>New: Lite mode.</b> Just chats, events, people and your wallet. Quicker, and kinder to your data.
        </p>
        <button onClick={onTry} className="h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-extrabold text-ink">
          Try it
        </button>
        <button onClick={onNo} className="grid size-9 shrink-0 place-items-center rounded-full text-white/70" aria-label="Not now">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** The first time in Lite: a few cards on what's where (once on each phone). */
const WELCOME_KEY = "nt-lite-welcome";
const WELCOME: { emoji: string; title: string; text: string }[] = [
  { emoji: "📱", title: "Welcome to Lite", text: "Everything in Newtown, without the 3D map: quicker, quiet, and kinder to your data." },
  { emoji: "🧭", title: "Four tabs", text: "Chats, Events, People and Wallet, at the bottom. Tap your face (top right) for your profile, photos and the menu." },
  { emoji: "🎭", title: "Masquerade", text: "At the top of your chats: 5 minutes with someone new, both masked. Unmask only if you both say yes." },
  { emoji: "🌍", title: "The city is one tap away", text: "The globe (top right) takes you to the 3D map, and the Lite button there brings you back." },
];

function LiteWelcome() {
  const [at, setAt] = useState<number | null>(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) ? null : 0;
    } catch {
      return null;
    }
  });
  if (at === null || typeof document === "undefined") return null;
  const done = () => {
    try {
      localStorage.setItem(WELCOME_KEY, "1");
    } catch {}
    setAt(null);
  };
  const card = WELCOME[at];
  const last = at >= WELCOME.length - 1;
  return createPortal(
    <div className="fixed inset-x-0 z-[1000] flex justify-center px-4" style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
      <div role="dialog" aria-label="Welcome to Lite" className="w-full max-w-sm rounded-3xl bg-ink p-4 text-white shadow-2xl ring-2 ring-gold/40">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none" aria-hidden>
            {card.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-gold">{card.title}</p>
            <p className="mt-1 text-sm leading-snug text-white/85">{card.text}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {WELCOME.map((_, n) => (
              <span key={n} className={cn("h-1.5 rounded-full", n === at ? "w-4 bg-gold" : "w-1.5 bg-white/30")} />
            ))}
          </div>
          <div className="flex gap-2">
            {!last && (
              <button onClick={done} className="h-11 rounded-full px-3 text-sm font-semibold text-white/70">
                Skip
              </button>
            )}
            <button onClick={() => (last ? done() : setAt(at + 1))} className="h-11 rounded-full bg-gold px-5 text-sm font-extrabold text-ink">
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
