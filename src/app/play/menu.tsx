"use client";

import { useEffect, useState } from "react";
import { AvatarFace } from "@/components/avatar";
import { BADGE_GROUPS, BADGE_INFO, BadgeTile, type EarnedBadge } from "@/components/badges";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { loadLevel, loadMyStats, upgradeLevel, type Badge, type Leader, type LevelInfo } from "./profile-actions";

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
  useEffect(() => {
    loadMyStats()
      .then((res) => res.ok && setStats(res))
      .catch(() => {});
  }, []);

  // Newest first, so the first one we see of each badge is the latest win.
  const earned = new Map<string, EarnedBadge>();
  for (const b of stats?.badges ?? []) {
    const prev = earned.get(b.badge);
    earned.set(b.badge, { count: (prev?.count ?? 0) + 1, detail: prev?.detail ?? b.detail, at: prev?.at ?? b.at, firstAt: b.at });
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

        <LevelCard />

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
                {stats && <span className="text-muted">Tap any badge to see how</span>}
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
              return (
                <section key={group} className="mt-3">
                  <h3
                    className={cn(
                      "flex items-baseline justify-between px-1 text-[11px] font-bold uppercase tracking-wide text-muted",
                      group === "Legendary" && "text-[#9b3fd6]",
                    )}
                  >
                    <span>{group === "Legendary" ? "★ Legendary" : group}</span>
                    <span className="tabular-nums">
                      {mine.length}/{keys.length}
                    </span>
                  </h3>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {mine.map((badge) => {
                      const info = earned.get(badge)!;
                      return (
                        <div key={badge} className="relative flex min-w-0 justify-center">
                          <BadgeTile
                            badge={badge}
                            player={me.name ?? "Me"}
                            city={city}
                            detail={info.detail}
                            count={info.count}
                            at={info.at}
                            firstAt={info.firstAt}
                            size={52}
                          />
                          {info.count > 1 && (
                            <span className="pointer-events-none absolute right-0 top-0.5 rounded-full bg-ink px-1.5 text-[10px] font-bold text-white">
                              ×{info.count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {locked.map((badge) => (
                      <div key={badge} className="flex min-w-0 justify-center">
                        <BadgeTile badge={badge} player={me.name ?? "Me"} city={city} size={44} locked />
                      </div>
                    ))}
                  </div>
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

        <Marketplace />

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

/** The power-ups each level unlocks. */
const PERKS = [
  { level: 3, icon: "🎭", name: "Decoy", what: "As a ghost, drop a fake you anywhere to fool the hunters." },
  { level: 5, icon: "🛡️", name: "Shield", what: "As a ghost, raise a shield that saves you from one find." },
  { level: 10, icon: "🔎", name: "Big search", what: "Hunters search a 3×3 area at once, for the price of 7 searches." },
  { level: 20, icon: "🔁", name: "Respawn", what: "Caught in the first 30 minutes? Pay 300 coins to jump back in." },
];

/** Your level, what the next one takes, and the power-ups it unlocks. Hidden if it can't load. */
function LevelCard() {
  const [info, setInfo] = useState<LevelInfo | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () =>
    loadLevel()
      .then((res) => setInfo(res.ok ? res.info : null))
      .catch(() => setInfo(null));
  useEffect(() => {
    refresh();
  }, []);

  if (!info) return null;
  const next = info.level + 1;
  const roundsLeft = Math.max(0, info.nextRounds - info.roundsPlayed);
  const enoughCoins = info.coins >= info.nextCost;

  const upgrade = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await upgradeLevel();
      if (res.ok) {
        setNote({ ok: true, text: `🎉 You're level ${res.level}! (${short(res.cost)} coins spent)` });
        await refresh();
      } else {
        setNote({ ok: false, text: res.error || "Couldn't level up. Try again." });
      }
    } catch {
      setNote({ ok: false, text: "Couldn't level up. Try again." });
    }
    setConfirm(false);
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#18202b] to-[#3b2f6b] p-3 text-white">
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold font-display text-xl font-extrabold text-ink shadow">
          {info.level}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold">Level {info.level}</p>
          <p className="text-xs text-white/70">
            {short(info.roundsPlayed)} round{info.roundsPlayed === 1 ? "" : "s"} played
          </p>
        </div>
      </div>

      {/* What the next level needs */}
      <div className="mt-2.5">
        {roundsLeft > 0 ? (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span>
                Play <b>{roundsLeft}</b> more round{roundsLeft === 1 ? "" : "s"} to unlock level {next}
              </span>
              <span className="tabular-nums text-white/60">
                {info.roundsPlayed}/{info.nextRounds}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (info.roundsPlayed / Math.max(1, info.nextRounds)) * 100)}%` }} />
            </div>
          </>
        ) : confirm ? (
          <div className="rounded-xl bg-white/10 p-2 text-xs">
            <p>
              Spend <b>{short(info.nextCost)} coins</b> to reach level {next}? The coins are used up.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirm(false)} disabled={busy} className="rounded-lg bg-white/15 py-2 font-semibold">
                Not now
              </button>
              <button onClick={upgrade} disabled={busy} className="rounded-lg bg-gold py-2 font-semibold text-ink disabled:opacity-60">
                {busy ? "Levelling up…" : "Yes, level up"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                setNote(null);
                setConfirm(true);
              }}
              disabled={!enoughCoins}
              className="w-full rounded-xl bg-gold py-2 text-sm font-semibold text-ink disabled:opacity-50"
            >
              Upgrade to level {next} for {short(info.nextCost)} coins
            </button>
            {!enoughCoins && (
              <p className="mt-1 text-center text-[11px] text-white/70">
                You need {short(info.nextCost - info.coins)} more coins (you have {short(info.coins)}).
              </p>
            )}
          </>
        )}
        {note && <p className={cn("mt-1.5 text-center text-xs font-semibold", note.ok ? "text-gold" : "text-[#ffb4b6]")}>{note.text}</p>}
      </div>

      {/* Power-ups */}
      <ul className="mt-3 grid grid-cols-2 gap-1.5">
        {PERKS.map((p) => {
          const open = info.level >= p.level;
          return (
            <li key={p.level} className={cn("rounded-xl px-2 py-1.5", open ? "bg-white/15" : "bg-white/5")} title={p.what}>
              <p className="flex items-center gap-1 text-xs font-semibold">
                <span className={open ? undefined : "opacity-50 grayscale"}>{p.icon}</span>
                <span className="truncate">{p.name}</span>
                <span className="ml-auto shrink-0 text-[10px] font-bold">{open ? "✓" : `🔒 L${p.level}`}</span>
              </p>
              <p className={cn("mt-0.5 text-[10px] leading-snug", open ? "text-white/80" : "text-white/50")}>{p.what}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-white/75">
        ⭐ Every 5 levels, whoever catches you earns a bigger bonus. It never stops growing, so high levels are prized targets!
      </p>
    </div>
  );
}

/** A peek at the coin shop that's on its way. */
function Marketplace() {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#ffe27a] via-[#ffb86b] to-[#ff7ab6] p-3 text-ink">
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-extrabold">🛍️ Marketplace</p>
        <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Coming soon</span>
      </div>
      <p className="mt-1 text-xs leading-snug">
        Soon you&apos;ll swap your coins for real rewards from brands: custom tees, event tickets, vouchers, gadgets and more. Keep
        stacking those coins!
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
        {[
          ["👕", "Tees"],
          ["🎟️", "Tickets"],
          ["🎁", "Vouchers"],
          ["🎧", "Gadgets"],
        ].map(([icon, label]) => (
          <div key={label} className="rounded-xl bg-white/45 py-1.5">
            <div className="text-xl leading-none">{icon}</div>
            <div className="mt-0.5 text-[10px] font-semibold">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
