"use client";

import { useEffect, useState } from "react";
import { AvatarFace } from "@/components/avatar";
import { BADGE_GROUPS, BADGE_INFO, BadgeMedal, BadgeTile } from "@/components/badges";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { loadMyStats, type Badge, type Leader } from "./profile-actions";

type Stats = { won: number; rounds: number; catches: number; survived: number; badges: Badge[]; leaders: Leader[]; myRank: number | null };

/** The menu: you, your record, your badges, the leaderboard, and the odd setting. */
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
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"badges" | "leaders">("badges");
  const [peek, setPeek] = useState<string | null>(null);
  useEffect(() => {
    loadMyStats().then((res) => res.ok && setStats(res));
  }, []);

  const earned = new Map<string, { count: number; detail: string | null }>();
  for (const b of stats?.badges ?? []) {
    const prev = earned.get(b.badge);
    earned.set(b.badge, { count: (prev?.count ?? 0) + 1, detail: prev?.detail ?? b.detail });
  }
  const allBadges = Object.keys(BADGE_INFO);
  const collected = allBadges.filter((k) => earned.has(k)).length;

  return (
    <div className="glass absolute right-3 top-16 z-30 flex max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl text-sm sm:right-4">
      <div className="overflow-y-auto p-4">
        {/* You */}
        <div className="flex items-center gap-3">
          <button onClick={onEditAvatar} className="relative shrink-0" aria-label="Change your look">
            <AvatarFace avatar={me.avatar} size={56} className="rounded-full shadow" />
            <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] text-white">✎</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold">{me.name}</p>
            <button onClick={onEditAvatar} className="text-xs font-medium text-gold-dark">
              Change your look
            </button>
          </div>
          <button onClick={onClose} className="rounded-full px-2 text-xl text-muted" aria-label="Close menu">
            ×
          </button>
        </div>

        {/* Your record */}
        <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
          {[
            ["Won", stats ? short(stats.won) : "…"],
            ["Rounds", stats ? short(stats.rounds) : "…"],
            ["Catches", stats ? short(stats.catches) : "…"],
            ["Survived", stats ? short(stats.survived) : "…"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl bg-panel-2 px-1 py-2">
              <div className="min-w-0 truncate font-display text-base font-bold tabular-nums">{value}</div>
              <div className="truncate text-[10px] uppercase tracking-wide text-muted">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onHowItWorks} className="rounded-xl bg-ink px-3 py-2.5 font-semibold text-white">
            How it works
          </button>
          <button
            onClick={onResults}
            disabled={!hasResults}
            className="rounded-xl bg-panel-2 px-3 py-2.5 font-semibold disabled:opacity-40"
          >
            Last result
          </button>
        </div>

        {/* Badges and leaderboard */}
        <div className="mt-4 grid grid-cols-2 rounded-xl bg-panel-2 p-1 text-xs font-semibold">
          {(["badges", "leaders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg py-1.5", tab === t ? "bg-panel shadow-sm" : "text-muted")}>
              {t === "badges" ? `My badges${stats ? ` (${collected})` : ""}` : "Leaderboard"}
            </button>
          ))}
        </div>

        {tab === "badges" ? (
          <div className="mt-2">
            {/* Progress */}
            <div className="px-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold">
                  {stats ? `${collected} of ${allBadges.length} collected` : "Loading your badges…"}
                </span>
                {stats && earned.size === 0 && <span className="text-muted">Tap one to see how</span>}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${(collected / allBadges.length) * 100}%` }}
                />
              </div>
            </div>

            {BADGE_GROUPS.map((group) => {
              const keys = allBadges.filter((k) => BADGE_INFO[k].group === group);
              const mine = keys.filter((k) => earned.has(k));
              const locked = keys.filter((k) => !earned.has(k));
              const peeked = peek && locked.includes(peek) ? BADGE_INFO[peek] : null;
              return (
                <section key={group} className="mt-3">
                  <h3 className="flex items-baseline justify-between px-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                    <span>{group}</span>
                    <span className="tabular-nums">
                      {mine.length}/{keys.length}
                    </span>
                  </h3>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {mine.map((badge) => {
                      const info = earned.get(badge)!;
                      return (
                        <div key={badge} className="relative flex min-w-0 justify-center">
                          <BadgeTile badge={badge} player={me.name ?? "Me"} city={city} detail={info.detail} size={52} />
                          {info.count > 1 && (
                            <span className="absolute right-0 top-0.5 rounded-full bg-ink px-1.5 text-[10px] font-bold text-white">
                              ×{info.count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {locked.map((badge) => (
                      <button
                        key={badge}
                        onClick={() => setPeek(peek === badge ? null : badge)}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-1 rounded-2xl p-2 text-center transition",
                          peek === badge && "bg-panel-2",
                        )}
                        aria-label={`${BADGE_INFO[badge].title}: ${BADGE_INFO[badge].blurb}`}
                      >
                        <BadgeMedal badge={badge} size={44} dim />
                        <span className="text-[10px] leading-tight text-muted">{BADGE_INFO[badge].title}</span>
                      </button>
                    ))}
                  </div>
                  {peeked && (
                    <p className="mx-1 mt-1 rounded-lg bg-panel-2 px-2 py-1.5 text-xs">
                      <span className="mr-1">🔒</span>
                      <span className="font-semibold">{peeked.title}:</span> {peeked.blurb}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-2">
            <p className="px-1 pb-1 text-xs text-muted">Most coins won in the last 7 days{stats?.myRank ? ` · you're #${stats.myRank}` : ""}</p>
            {!stats ? (
              <p className="p-3 text-center text-muted">Loading…</p>
            ) : stats.leaders.length === 0 ? (
              <p className="p-3 text-center text-muted">No winners yet this week. Be the first!</p>
            ) : (
              <ol className="space-y-1">
                {stats.leaders.map((l, i) => (
                  <li key={l.id} className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5", l.id === me.id ? "bg-gold/25" : "bg-panel-2")}>
                    <span className={cn("w-5 text-center font-display font-bold", i < 3 ? "text-gold-dark" : "text-muted")}>
                      {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                    </span>
                    <AvatarFace avatar={l.avatar} size={30} className="rounded-full" />
                    <span className="flex-1 truncate font-medium">{l.name}</span>
                    <span className="font-display font-bold tabular-nums">{short(l.won)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
          <button onClick={onChangePin} className="rounded-xl bg-panel-2 px-3 py-2 font-medium">
            Change PIN
          </button>
          <button onClick={onSignOut} className="rounded-xl bg-panel-2 px-3 py-2 font-medium text-muted">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
