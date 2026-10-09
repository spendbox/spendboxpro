"use client";

import { useEffect, useMemo, useState } from "react";
import { BADGE_GROUPS, BADGE_INFO, BadgeMedal, BadgeSheet, type EarnedBadge } from "@/components/badges";
import { Star } from "@/components/icons";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { recordStore, useStore } from "./data";
import { useEscape } from "./escape";
import { BadgesSkeleton, LoadFailed } from "./skeletons";

// All the badges and their medals live in this file's download, which the menu only fetches
// when you open "Badges".

const ALL = Object.keys(BADGE_INFO);
const GROUPS = BADGE_GROUPS.map((group) => ({ group, keys: ALL.filter((k) => BADGE_INFO[k].group === group) }));

/** Your record, then every badge by group: yours first, the rest faded. Tap one for how to earn it (and Share). */
export function BadgesSheet({ me, city }: { me: { id: string; name: string | null }; city: string }) {
  const { value: rec, failed } = useStore(recordStore, me.id);
  const [open, setOpen] = useState<string | null>(null);
  // Escape closes a badge's pop-up before the sheet behind it.
  useEscape(() => setOpen(null), open !== null);

  useEffect(() => {
    void recordStore.refresh(me.id);
  }, [me.id]);

  // Newest first, so the first one we see of each badge is the latest win.
  const earned = useMemo(() => {
    const map = new Map<string, EarnedBadge>();
    for (const b of rec?.badges ?? []) {
      const prev = map.get(b.badge);
      map.set(b.badge, { count: (prev?.count ?? 0) + 1, detail: prev?.detail ?? b.detail, at: prev?.at ?? b.at, firstAt: b.at });
    }
    return map;
  }, [rec]);

  if (!rec) {
    return failed ? (
      <LoadFailed text="Couldn't load your badges." onRetry={() => void recordStore.refresh(me.id, true)} />
    ) : (
      <BadgesSkeleton />
    );
  }

  const collected = ALL.filter((k) => earned.has(k)).length;
  const player = me.name ?? "Me";

  return (
    <div>
      {/* Your record */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {(
          [
            ["Won", short(rec.won)],
            ["Rounds", short(rec.rounds)],
            ["Catches", short(rec.catches)],
            ["Survived", short(rec.survived)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl bg-panel-2 px-1 py-2">
            <div className="min-w-0 truncate font-display text-base font-bold tabular-nums">{value}</div>
            <div className="truncate text-[10px] uppercase tracking-wide text-muted">{label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold">
            {collected} of {ALL.length} collected
          </span>
          <span className="text-muted">Tap a badge to see how</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div className="h-full rounded-full bg-gold" style={{ width: `${(collected / ALL.length) * 100}%` }} />
        </div>
      </div>

      {GROUPS.map(({ group, keys }) => {
        const mine = keys.filter((k) => earned.has(k));
        const locked = keys.filter((k) => !earned.has(k));
        const legendary = group === "Legendary";
        return (
          // Off-screen groups skip drawing until you scroll to them.
          <section key={group} className="mt-4 [contain-intrinsic-size:auto_14rem] [content-visibility:auto]">
            <h3
              className={cn(
                "flex items-baseline justify-between px-1 text-[11px] font-bold uppercase tracking-wide text-muted",
                legendary && "text-[#9b3fd6]",
              )}
            >
              <span className="flex items-center gap-1">
                {legendary && <Star className="size-3" fill="currentColor" />}
                {group}
              </span>
              <span className="tabular-nums">
                {mine.length}/{keys.length}
              </span>
            </h3>
            <div
              className={cn(
                "mt-1 grid grid-cols-4 gap-1",
                legendary && "rounded-2xl bg-gradient-to-br from-[#ffe27a]/25 via-[#ff6ad5]/15 to-[#7b5cff]/20 p-1",
              )}
            >
              {mine.map((badge) => (
                <Tile key={badge} badge={badge} count={earned.get(badge)!.count} onOpen={setOpen} />
              ))}
              {locked.map((badge) => (
                <Tile key={badge} badge={badge} locked onOpen={setOpen} />
              ))}
            </div>
          </section>
        );
      })}

      {open && <BadgeSheet badge={open} player={player} city={city} earned={earned.get(open) ?? null} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One badge: its medal and name, a ×N chip if you've won it more than once. */
function Tile({ badge, count = 0, locked, onOpen }: { badge: string; count?: number; locked?: boolean; onOpen: (badge: string) => void }) {
  const b = BADGE_INFO[badge];
  return (
    <button
      onClick={() => onOpen(badge)}
      className="relative flex min-w-0 flex-col items-center gap-1 rounded-2xl p-1.5 text-center hover:bg-panel-2"
      title={b.blurb}
      aria-label={`${b.title}${locked ? " (not earned yet)" : count > 1 ? ` (earned ${count} times)` : ""}: ${b.blurb}`}
    >
      <span className="grid h-[3.25rem] place-items-center">
        <BadgeMedal badge={badge} size={locked ? 44 : 52} dim={locked} />
      </span>
      <span className={locked ? "text-[10px] leading-tight text-muted" : "text-xs font-semibold leading-tight"}>{b.title}</span>
      {count > 1 && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 rounded-full bg-ink px-1.5 text-[10px] font-bold text-white">×{count}</span>
      )}
    </button>
  );
}
