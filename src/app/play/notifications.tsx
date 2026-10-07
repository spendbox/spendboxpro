"use client";

import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";

export type FeedItem = {
  key: string;
  at: string;
  text: string;
  tone: "alarm" | "move" | "info" | "mine";
  avatar?: Avatar | null;
};

const ICON: Record<FeedItem["tone"], { emoji: string; bg: string }> = {
  alarm: { emoji: "🚨", bg: "bg-hit/15" },
  move: { emoji: "👣", bg: "bg-gold/25" },
  mine: { emoji: "📡", bg: "bg-[#4dabf7]/20" },
  info: { emoji: "ℹ️", bg: "bg-panel-2" },
};

export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function FeedRow({ item, now, compact }: { item: FeedItem; now: number; compact?: boolean }) {
  const icon = ICON[item.tone];
  return (
    <div className={cn("flex items-start gap-2.5", compact ? "" : "rounded-2xl px-2.5 py-2", !compact && item.tone === "mine" && "bg-[#4dabf7]/10")}>
      {item.avatar ? (
        <span className="relative shrink-0">
          <AvatarFace avatar={item.avatar} size={34} className="rounded-full" />
          <span className="absolute -bottom-1 -right-1 text-xs">{icon.emoji}</span>
        </span>
      ) : (
        <span className={cn("grid size-[34px] shrink-0 place-items-center rounded-full text-base", icon.bg)}>{icon.emoji}</span>
      )}
      <span className="min-w-0 flex-1 text-[13px] leading-snug">
        {item.text}
        <span className="mt-0.5 block text-[11px] text-muted">{ago(item.at, now)}</span>
      </span>
    </div>
  );
}

/** The bell's panel: the latest five in view, scroll for the rest. */
export function NotificationsPanel({ feed, now, onClose }: { feed: FeedItem[]; now: number; onClose: () => void }) {
  return (
    <div className="glass absolute right-3 top-16 z-30 w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl sm:right-4">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div>
          <h2 className="font-display text-base font-bold">What&apos;s happening</h2>
          <p className="text-[11px] text-muted">{feed.length ? `${feed.length} this round` : "Quiet so far"}</p>
        </div>
        <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-lg text-muted hover:bg-panel-2" aria-label="Close notifications">
          ×
        </button>
      </div>
      {feed.length === 0 ? (
        <p className="px-4 pb-5 pt-2 text-center text-sm text-muted">Nothing yet. Catches, moves and your drone alerts will show up here.</p>
      ) : (
        <ul className="max-h-[19.5rem] space-y-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {feed.map((f) => (
            <li key={f.key}>
              <FeedRow item={f} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
