"use client";

import { AvatarFace } from "@/components/avatar";
import {
  Bomb,
  Coins,
  Drama,
  Drone,
  Fish,
  Footprints,
  Hammer,
  Info,
  Megaphone,
  Radar,
  RotateCcw,
  Shield,
  Siren,
  Target,
  ToyBrick,
  Whale,
  X,
} from "@/components/icons";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";

/** Which little picture a feed item shows (set by whoever builds the feed). */
export type FeedIcon =
  | "catch"
  | "fish"
  | "whale"
  | "move"
  | "decoy"
  | "boom"
  | "toy"
  | "respawn"
  | "shield"
  | "trap"
  | "drone"
  | "coin"
  | "build"
  | "ad"
  | "info";

export type FeedItem = {
  key: string;
  at: string;
  text: string;
  tone: "alarm" | "move" | "info" | "mine";
  avatar?: Avatar | null;
  icon?: FeedIcon;
  /** A world event this item is about (tap to fly there). */
  eventId?: number;
};

type IconLike = { size?: number | string; strokeWidth?: number; className?: string };

// Each feed icon and its tint: hunting news in red, ghosts' powers in green, decoys in
// purple, drones in blue, coins and moves in gold.
const FEED_ICONS: Record<FeedIcon, { Icon: React.ComponentType<IconLike>; tint: string }> = {
  catch: { Icon: Target, tint: "bg-hit/15 text-hit" },
  fish: { Icon: Fish, tint: "bg-[#4dabf7]/20 text-[#1c7ed6]" },
  whale: { Icon: Whale, tint: "bg-[#7048e8]/15 text-[#7048e8]" },
  move: { Icon: Footprints, tint: "bg-gold/25 text-gold-dark" },
  decoy: { Icon: Drama, tint: "bg-[#7048e8]/15 text-[#7048e8]" },
  boom: { Icon: Bomb, tint: "bg-hit/15 text-hit" },
  toy: { Icon: ToyBrick, tint: "bg-[#7048e8]/15 text-[#7048e8]" },
  respawn: { Icon: RotateCcw, tint: "bg-me/15 text-me" },
  shield: { Icon: Shield, tint: "bg-me/15 text-me" },
  trap: { Icon: Radar, tint: "bg-[#4dabf7]/20 text-[#1c7ed6]" },
  drone: { Icon: Drone, tint: "bg-[#4dabf7]/20 text-[#1c7ed6]" },
  coin: { Icon: Coins, tint: "bg-gold/25 text-gold-dark" },
  build: { Icon: Hammer, tint: "bg-[#f08c00]/15 text-[#e8590c]" },
  ad: { Icon: Megaphone, tint: "bg-gold/25 text-gold-dark" },
  info: { Icon: Info, tint: "bg-panel-2 text-muted" },
};

// What an item without its own icon shows, by tone.
const TONE_ICON: Record<FeedItem["tone"], { Icon: React.ComponentType<IconLike>; tint: string }> = {
  alarm: { Icon: Siren, tint: "bg-hit/15 text-hit" },
  move: { Icon: Footprints, tint: "bg-gold/25 text-gold-dark" },
  mine: { Icon: Radar, tint: "bg-[#4dabf7]/20 text-[#1c7ed6]" },
  info: { Icon: Info, tint: "bg-panel-2 text-muted" },
};

const pick = (icon: FeedIcon | undefined, tone: FeedItem["tone"] = "info") => (icon ? FEED_ICONS[icon] : null) ?? TONE_ICON[tone];

/**
 * A feed icon in a small round tinted badge. Size it with a class (default 34px); the icon
 * scales with it. Pass `tone` to pick a fallback when there's no icon.
 */
export function FeedIconView({ icon, tone, className }: { icon?: FeedIcon; tone?: FeedItem["tone"]; className?: string }) {
  const { Icon, tint } = pick(icon, tone);
  return (
    <span className={cn("grid size-[34px] shrink-0 place-items-center rounded-full", tint, className)} aria-hidden>
      <Icon className="size-[55%]" strokeWidth={2.25} />
    </span>
  );
}

export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function FeedRow({ item, now, compact }: { item: FeedItem; now: number; compact?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5", compact ? "" : "rounded-2xl px-2.5 py-2", !compact && item.tone === "mine" && "bg-[#4dabf7]/10")}>
      {item.avatar ? (
        <span className="relative shrink-0">
          <AvatarFace avatar={item.avatar} size={34} className="rounded-full" />
          <FeedIconView icon={item.icon} tone={item.tone} className="absolute -bottom-1 -right-1 size-5 bg-panel ring-2 ring-panel" />
        </span>
      ) : (
        <FeedIconView icon={item.icon} tone={item.tone} />
      )}
      <span className="min-w-0 flex-1 text-[13px] leading-snug">
        {item.text}
        <span className="mt-0.5 block text-[11px] text-muted">{ago(item.at, now)}</span>
      </span>
    </div>
  );
}

/** The bell's panel: the latest five in view, scroll for the rest. */
export function NotificationsPanel({
  feed,
  now,
  onClose,
  onPick,
}: {
  feed: FeedItem[];
  now: number;
  onClose: () => void;
  /** Tapping a row that leads somewhere (e.g. a world event on the map). */
  onPick?: (item: FeedItem) => void;
}) {
  return (
    <div className="glass absolute right-3 top-16 z-30 w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl sm:right-4">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div>
          <h2 className="font-display text-base font-bold">What&apos;s happening</h2>
          <p className="text-[11px] text-muted">{feed.length ? `${feed.length} this round` : "Quiet so far"}</p>
        </div>
        <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close notifications">
          <X className="size-5" />
        </button>
      </div>
      {feed.length === 0 ? (
        <p className="px-4 pb-5 pt-2 text-center text-sm text-muted">Nothing yet. Catches, moves and your drone alerts will show up here.</p>
      ) : (
        <ul className="max-h-[19.5rem] space-y-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {feed.map((f) => (
            <li key={f.key}>
              {f.eventId && onPick ? (
                <button onClick={() => onPick(f)} className="block w-full rounded-2xl text-left hover:bg-panel-2" title="Show me on the map">
                  <FeedRow item={f} now={now} />
                </button>
              ) : (
                <FeedRow item={f} now={now} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
