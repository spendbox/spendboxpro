"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronRight, KeyRound, Smartphone } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import {
  Award,
  ChartColumn,
  CircleHelp,
  Coins,
  Gamepad2,
  Gift,
  House,
  LogOut,
  Pencil,
  ShoppingBag,
  Star,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "@/components/icons";
import { LogoMark } from "@/components/logo";
import type { Avatar } from "@/lib/avatar";
import { CONTACT_EMAIL, SITE_DOMAIN } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { leadersStore, levelStore, recordStore, useStore } from "./menu/data";
import { useEscape } from "./menu/escape";
import { MenuSheet } from "./menu/menu-sheet";
import { BadgesSkeleton, LeadersSkeleton, LevelSkeleton } from "./menu/skeletons";

// The menu itself is small and opens instantly. The heavy parts (all the badges, the
// leaderboard, the level card) are separate downloads, fetched the first time you open one,
// or already as your finger lands on its button. Their numbers are fetched only then too.
const loadBadges = () => import("./menu/badges-sheet");
const loadLeaders = () => import("./menu/leaderboard-sheet");
const loadLevelCard = () => import("./menu/level-sheet");
const BadgesSheet = lazy(() => loadBadges().then((m) => ({ default: m.BadgesSheet })));
const LeaderboardSheet = lazy(() => loadLeaders().then((m) => ({ default: m.LeaderboardSheet })));
const LevelSheet = lazy(() => loadLevelCard().then((m) => ({ default: m.LevelSheet })));

type SheetName = "level" | "badges" | "leaders";

const SHEETS: Record<SheetName, { title: string; icon: LucideIcon; tint: string; tall?: boolean; preload: () => Promise<unknown> }> = {
  level: { title: "Your level", icon: Star, tint: "bg-gold/25 text-gold-dark", preload: loadLevelCard },
  badges: { title: "My badges", icon: Award, tint: "bg-[#ffe8d6] text-[#d9480f]", tall: true, preload: loadBadges },
  leaders: { title: "Leaderboard", icon: Trophy, tint: "bg-[#ece6ff] text-[#6d3fd6]", preload: loadLeaders },
};

/** Start downloading a sheet's code (when a finger or pointer lands on its button). */
const warm = (name: SheetName) => () => void SHEETS[name].preload().catch(() => {});

type Entry = {
  key: string;
  label: string;
  icon: LucideIcon;
  tint: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
  warm?: () => void;
  /** A little red number on the icon (e.g. friend requests waiting). */
  badge?: number;
};

/**
 * The menu: you (tap your picture to change your look), your level, and a tidy set of places
 * to go. Opening it fetches nothing but your level (one tiny call, remembered for a minute).
 */
export function Menu({
  me,
  city,
  hasResults,
  onClose,
  onHowItWorks,
  onEditAvatar,
  onResults,
  onChangePin,
  onSignOut,
  onMyStyle,
  onMyHouse,
  onFriends,
  onPhone,
  friendRequests = 0,
  onMyGifts,
  newGifts = 0,
  coins,
  level,
}: {
  me: { id: string; name: string | null; avatar: Avatar };
  city: string;
  hasResults: boolean;
  onClose: () => void;
  onHowItWorks: () => void;
  onEditAvatar: () => void;
  onResults: () => void;
  onChangePin: () => void;
  onSignOut: () => void;
  /** Opens your play style. Left out: the entry is hidden. */
  onMyStyle?: () => void;
  /** Opens your house. Left out: the entry is hidden. */
  onMyHouse?: () => void;
  /** Opens your friends. Left out: the entry is hidden. */
  onFriends?: () => void;
  /** Opens your phone (camera and gallery). */
  onPhone?: () => void;
  /** Friend requests waiting for you (a red number on Friends). */
  friendRequests?: number;
  /** Opens My gifts. Left out: the entry is hidden. */
  onMyGifts?: () => void;
  /** Hugs, handshakes and gifts since you last looked (a red number on My gifts). */
  newGifts?: number;
  /** Your mint balance, shown under your name. */
  coins?: number;
  /** Your level, shown straight away (the progress bar fills in a moment later). */
  level?: number;
}) {
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { value: info, failed: levelFailed } = useStore(levelStore, me.id);
  useEscape(onClose);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    void levelStore.refresh(me.id);
  }, [me.id]);

  const open = (name: SheetName) => {
    warm(name)();
    // Fetch the numbers at the same time as the code, not one after the other.
    if (name === "badges") void recordStore.refresh(me.id);
    if (name === "leaders") void leadersStore.refresh(me.id);
    setSheet(name);
  };

  // Levels only go up, so the higher of the two is the fresher.
  const lvl = Math.max(level ?? 0, info?.level ?? 0) || null;
  const next = info ? info.level + 1 : null;
  // XP towards the next level (rounds played before game-db/027 is run).
  const xpMode = info?.xp != null && info.nextXp != null;
  const have = info ? (xpMode ? info.xp! : info.roundsPlayed) : 0;
  const need = info ? (xpMode ? info.nextXp! : info.nextRounds) : 1;
  const left = info ? Math.max(0, need - have) : 0;
  const ready = info !== null && left === 0 && !info.max;
  const canUpgrade = ready && info.coins >= info.nextCost;
  const progress = info ? (info.max ? 100 : Math.min(100, (have / Math.max(1, need)) * 100)) : 0;

  const all: (Entry | undefined)[] = [
    onPhone && { key: "phone", label: "Phone", icon: Smartphone, tint: "bg-[#1f2328] text-white", onClick: onPhone },
    { key: "how", label: "How it works", icon: CircleHelp, tint: "bg-[#e3edff] text-[#2d6bff]", onClick: onHowItWorks },
    {
      key: "result",
      label: "Last result",
      icon: ChartColumn,
      tint: "bg-[#fff1c7] text-gold-dark",
      onClick: onResults,
      disabled: !hasResults,
      hint: hasResults ? undefined : "Shows up after your first round",
    },
    onFriends && { key: "friends", label: "Friends", icon: Users, tint: "bg-[#ffe3f1] text-[#c2255c]", onClick: onFriends, badge: friendRequests },
    onMyGifts && { key: "gifts", label: "My gifts", icon: Gift, tint: "bg-[#ffe3ec] text-[#d6336c]", onClick: onMyGifts, badge: newGifts },
    onMyStyle && { key: "style", label: "My style", icon: Gamepad2, tint: "bg-[#fbe3f6] text-[#b8268f]", onClick: onMyStyle },
    onMyHouse && { key: "house", label: "My house", icon: House, tint: "bg-[#d7f6ea] text-[#0f8f6a]", onClick: onMyHouse },
    { key: "badges", label: "Badges", icon: Award, tint: SHEETS.badges.tint, onClick: () => open("badges"), warm: warm("badges") },
    { key: "leaders", label: "Leaderboard", icon: Trophy, tint: SHEETS.leaders.tint, onClick: () => open("leaders"), warm: warm("leaders") },
  ];
  // Entries whose screen wasn't passed in (My style, My house) are left out.
  const entries = all.filter((e): e is Entry => e !== undefined);

  const current = sheet ? SHEETS[sheet] : null;

  return (
    <>
      <div
        ref={panel}
        role="dialog"
        aria-label="Menu"
        tabIndex={-1}
        className={cn(
          "glass absolute right-3 top-16 z-30 flex max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl text-sm outline-none sm:right-4",
          "origin-top-right transition-[opacity,scale] duration-150 ease-out starting:scale-95 starting:opacity-0 motion-reduce:transition-none",
        )}
      >
        <div className="overflow-y-auto overscroll-contain p-3">
          {/* You */}
          <div className="flex items-center gap-3 pl-1">
            <button onClick={onEditAvatar} className="relative shrink-0 rounded-full" aria-label="Change your look" title="Change your look">
              <AvatarFace avatar={me.avatar} size={48} className="rounded-full shadow" />
              <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-ink text-white ring-2 ring-white">
                <Pencil className="size-2.5" strokeWidth={2.75} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-bold leading-tight">{me.name ?? "Player"}</p>
              <div className="mt-1 flex h-6 items-center gap-1.5">
                {lvl !== null && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white" title={`Level ${lvl}`}>
                    Lv {lvl}
                  </span>
                )}
                {coins !== undefined && (
                  <span className="flex min-w-0 items-center gap-1 rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-bold text-ink" title={`${coins} mint`}>
                    <Coins className="size-3 shrink-0 text-gold-dark" strokeWidth={2.5} />
                    <span className="truncate">{short(coins)} mint</span>
                  </span>
                )}
                {lvl === null && coins === undefined && (
                  <button onClick={onEditAvatar} className="text-xs font-semibold text-gold-dark">
                    Change your look
                  </button>
                )}
              </div>
            </div>
            <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>

          {/* Level: the bar fills in once the tiny level call answers; the full card opens on tap. */}
          <button
            onClick={() => open("level")}
            onPointerEnter={warm("level")}
            onPointerDown={warm("level")}
            onFocus={warm("level")}
            className="mt-3 flex w-full items-center gap-2.5 rounded-2xl bg-gradient-to-br from-[#18202b] to-[#3b2f6b] p-2.5 text-left text-white shadow-sm"
            aria-label={`Level ${lvl ?? ""}. ${ready ? "Ready to level up" : "See what the next level takes"}`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold font-display text-lg font-extrabold text-ink shadow">
              {lvl ?? <Star className="size-4" fill="currentColor" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex h-4 items-baseline justify-between gap-2 text-xs">
                {info ? (
                  <>
                    <span className="truncate font-semibold">
                      {info.max
                        ? "Top level!"
                        : !ready
                          ? xpMode
                            ? `${left} more XP to level ${next}`
                            : `${left} more round${left === 1 ? "" : "s"} to level ${next}`
                          : canUpgrade
                            ? `Level ${next} is ready!`
                            : `Level ${next}: ${short(info.nextCost)} mint`}
                    </span>
                    {!ready && !info.max && (
                      <span className="shrink-0 tabular-nums text-white/60">
                        {have}/{need}
                      </span>
                    )}
                  </>
                ) : levelFailed ? (
                  <span className="truncate font-semibold">Perks and levelling up</span>
                ) : (
                  <span className="mt-0.5 block h-3 w-32 animate-pulse rounded bg-white/20" />
                )}
              </span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-gold transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${progress}%` }}
                />
              </span>
            </span>
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded-full py-1 pl-2.5 pr-1.5 text-xs font-bold",
                canUpgrade ? "bg-gold text-ink shadow-[0_0_0_3px_rgb(255_197_61/0.35)]" : "bg-white/15",
              )}
            >
              Level up
              <ChevronRight className="size-3.5" strokeWidth={2.75} />
            </span>
          </button>

          {/* Places to go */}
          <nav aria-label="Menu" className="mt-2 flex flex-wrap justify-center gap-1.5">
            {entries.map((e) => {
              const Icon = e.icon;
              return (
                <button
                  key={e.key}
                  onClick={e.onClick}
                  onPointerEnter={e.warm}
                  onPointerDown={e.warm}
                  onFocus={e.warm}
                  disabled={e.disabled}
                  title={e.hint}
                  className="flex w-[calc((100%-0.75rem)/3)] flex-col items-center gap-1.5 rounded-2xl bg-white/70 px-1 pb-2 pt-2.5 text-xs font-semibold ring-1 ring-ink/5 hover:bg-white disabled:opacity-45"
                >
                  <span className={cn("relative grid size-9 place-items-center rounded-xl", e.tint)}>
                    <Icon className="size-[18px]" strokeWidth={2.25} />
                    {!!e.badge && (
                      <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-hit px-1 text-[10px] font-bold text-white" aria-label={`${e.badge} waiting`}>
                        {e.badge > 9 ? "9+" : e.badge}
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate">{e.label}</span>
                </button>
              );
            })}
          </nav>

          {/* A peek at the shop that's on its way. */}
          <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-[#ffe27a] via-[#ffb86b] to-[#ff7ab6] py-2 pl-2.5 pr-3 text-ink">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/55">
              <ShoppingBag className="size-[18px]" strokeWidth={2.25} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs font-bold">
                Marketplace
                <span className="rounded-full bg-ink px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">Soon</span>
              </span>
              <span className="block truncate text-[11px] text-ink/75">Swap mint for tees, tickets, vouchers and gadgets.</span>
            </span>
          </div>

          {/* Account */}
          <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-line/80 pt-3">
            <button onClick={onChangePin} className="flex items-center justify-center gap-1.5 rounded-xl bg-panel-2/80 px-3 py-2 text-xs font-semibold hover:bg-panel-2">
              <KeyRound className="size-3.5" strokeWidth={2.25} />
              Change PIN
            </button>
            <button onClick={onSignOut} className="flex items-center justify-center gap-1.5 rounded-xl bg-panel-2/80 px-3 py-2 text-xs font-semibold text-muted hover:bg-panel-2">
              <LogOut className="size-3.5" strokeWidth={2.25} />
              Sign out
            </button>
          </div>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
            Questions or ideas?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ink underline">
              {CONTACT_EMAIL}
            </a>
            <br />
            <LogoMark size={13} className="mr-1 inline align-[-0.15em]" />
            Newtown · {SITE_DOMAIN}
          </p>
        </div>
      </div>

      {sheet && current && (
        <MenuSheet title={current.title} icon={current.icon} tint={current.tint} tall={current.tall} onClose={() => setSheet(null)}>
          {sheet === "badges" ? (
            <Suspense fallback={<BadgesSkeleton />}>
              <BadgesSheet me={me} city={city} />
            </Suspense>
          ) : sheet === "leaders" ? (
            <Suspense fallback={<LeadersSkeleton />}>
              <LeaderboardSheet me={me} />
            </Suspense>
          ) : (
            <Suspense fallback={<LevelSkeleton />}>
              <LevelSheet me={me} />
            </Suspense>
          )}
        </MenuSheet>
      )}
    </>
  );
}
