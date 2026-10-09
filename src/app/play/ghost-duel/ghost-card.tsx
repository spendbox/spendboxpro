"use client";

import { useEffect, useState } from "react";
import { Crown, Ghost, LoaderCircle, MessageCircle, Sparkles, Swords, Trophy, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cn } from "@/lib/cn";
import type { Avatar } from "@/lib/avatar";
import type { DuelRules, DuelView } from "@/lib/ghost-duels";
import { challengeGhost, ghostCard, type GhostCard } from "../ghost-duel-actions";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";
import { Dots, GLOW } from "./parts";

// A ghost's card, opened by tapping their light: who they are, how they're doing this game,
// their record, and buttons to chat or challenge them. It checks every couple of seconds, so
// the Challenge button follows along live (busy in a duel, gone golden, out).

const WHY: Record<string, string> = {
  self: "That's you! Hunters come to you: stay ready.",
  no_hunt: "Duels start when the hunt does.",
  out: "This ghost is out of the game.",
  golden: "Golden: safe for the rest of this game.",
  you_are_ghost: "You're a ghost this game, so you can't challenge other ghosts. Chat with them instead!",
  busy: "In a duel right now. The button comes back when they're free.",
  you_busy: "Finish your own duel first.",
  cooldown: "Catching your breath after your last duel…",
  not_enough: "You don't have enough mint for a challenge.",
};

// Cheers for a golden ghost (one picked per ghost, so it doesn't change while the card is open).
const HYPE = [
  "Untouchable! Three duels, three wins. Nobody's catching this one.",
  "Pure gold. Beat every hunter who dared, and now safe till the hour's up.",
  "Legend status! In the prize pool and out of reach.",
  "The hunters tried. The hunters failed. All hail the golden ghost!",
  "Shining bright! Safe for the rest of the game, and sharing the prize pool.",
];

export function GhostCardSheet({
  ghost,
  rules,
  guest,
  onChat,
  onChallenged,
  onSignIn,
  onClose,
}: {
  /** What the map already knows (shown straight away). */
  ghost: { id: string; name: string; avatar: Avatar; level: number; status: "free" | "playing" | "golden"; wins: number; losses: number };
  rules: DuelRules;
  guest: boolean;
  onChat: (g: { id: string; name: string }) => void;
  onChallenged: (duel: DuelView) => void;
  onSignIn: () => void;
  onClose: () => void;
}) {
  const [card, setCard] = useState<GhostCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coolLeft, setCoolLeft] = useState(0);

  // Live: ask again every 2 seconds while the card is open.
  useEffect(() => {
    if (guest) return;
    let live = true;
    const load = () =>
      ghostCard(ghost.id)
        .then((r) => {
          if (!live || !r.ok) return;
          setCard(r.card);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 2000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [ghost.id, guest]);
  // The cooldown, counting down.
  const coolUntil = card?.cooldownUntil ?? null;
  useEffect(() => {
    if (!coolUntil) return;
    const tick = () => setCoolLeft(Math.max(0, Math.ceil((Date.parse(coolUntil) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [coolUntil]);

  const status = card?.status ?? ghost.status;
  const golden = status === "golden";
  // A fanfare when you open a golden ghost's card (or they turn golden while it's open).
  useEffect(() => {
    if (golden) playSfx("levelup");
  }, [golden]);
  const glow = GLOW[status];
  const wins = card?.wins ?? ghost.wins;
  const losses = card?.losses ?? ghost.losses;
  const can = !guest && !!card?.can;
  const why = card && !card.can && card.why ? (card.why === "cooldown" && coolLeft > 0 ? `Catching your breath: ${coolLeft}s` : WHY[card.why] ?? null) : null;

  async function challenge() {
    if (guest) return onSignIn();
    setBusy(true);
    setError(null);
    const res = await challengeGhost(ghost.id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!res.ok) {
      playSfx("denied");
      return setError(res.error);
    }
    playSfx("start");
    onChallenged(res.duel);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          <span className="block rounded-full p-1" style={{ boxShadow: `0 0 0 3px ${glow.ring}, 0 0 22px 6px ${glow.ring}66` }}>
            <AvatarFace avatar={card?.avatar ?? ghost.avatar} size={64} className="rounded-full" />
          </span>
          {golden && (
            <span className="golden-bob absolute -right-1 -top-2 grid size-8 place-items-center rounded-full bg-[#fcc419] text-white ring-2 ring-white">
              <Crown className="size-4.5" />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-extrabold leading-tight">{card?.name ?? ghost.name}</h2>
          <p className="text-xs text-muted">
            <Ghost className="mr-1 inline size-3.5 align-[-0.15em]" />
            Ghost · level {card?.level ?? ghost.level}
          </p>
          <span className={cn("mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold", glow.chip)}>{glow.label}</span>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      {/* A golden ghost: a badge and some cheering */}
      {golden && (
        <div className="golden-shine mt-3 rounded-2xl p-[2px] shadow-[0_0_24px_-4px_#fcc419]">
          <div className="flex items-center gap-3 rounded-[14px] bg-[#fffbea] px-3 py-2.5">
            <span className="golden-shine grid size-12 shrink-0 place-items-center rounded-full text-white ring-2 ring-[#fff3bf]">
              <Crown className="golden-bob size-6 drop-shadow" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-display text-base font-extrabold uppercase tracking-wide text-[#a37500]">
                <Sparkles className="size-4" />
                Golden ghost
                <Sparkles className="size-4" />
              </p>
              <p className="text-sm font-semibold text-[#7a5800]">{HYPE[(ghost.id.charCodeAt(0) + ghost.id.charCodeAt(ghost.id.length - 1)) % HYPE.length]}</p>
            </div>
          </div>
        </div>
      )}

      {/* This game */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-panel-2 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Wins this game</p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <b className="font-display text-xl">{wins}</b>
            <Dots n={wins} max={rules.goldenWins} tone="win" />
          </p>
          <p className="text-[11px] text-muted">{rules.goldenWins} wins: golden</p>
        </div>
        <div className="rounded-xl bg-panel-2 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Losses this game</p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <b className="font-display text-xl">{losses}</b>
            <Dots n={losses} max={rules.outLosses} tone="loss" />
          </p>
          <p className="text-[11px] text-muted">{rules.outLosses} losses: out</p>
        </div>
      </div>

      {/* Their record */}
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">Record</h3>
      {card ? (
        <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <li className="flex justify-between"><span className="text-muted">Duels won as a ghost</span><b>{card.record.ghostWins}</b></li>
          <li className="flex justify-between"><span className="text-muted">Lost as a ghost</span><b>{card.record.ghostLosses}</b></li>
          <li className="flex justify-between"><span className="text-muted">Won as a hunter</span><b>{card.record.hunterWins}</b></li>
          <li className="flex justify-between"><span className="text-muted">Golden games</span><b>{card.record.goldenGames}</b></li>
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{guest ? "Sign in to see their record and challenge them." : "Loading…"}</p>
      )}

      {error && <p className="mt-3 rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => (guest ? onSignIn() : onChat({ id: ghost.id, name: card?.name ?? ghost.name }))}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-panel-2 px-4 py-3 font-semibold"
        >
          <MessageCircle className="size-4" />
          Chat
        </button>
        <button
          onClick={() => void challenge()}
          disabled={busy || (!guest && !can)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Swords className="size-4" />}
          Challenge · {card?.fee ?? rules.fee} mint
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        {why ?? (
          <>
            <Trophy className="mr-1 inline size-3.5 align-[-0.15em] text-gold-dark" />
            One quick game, first to {rules.firstTo}, a minute at most. Win: your {rules.fee} back plus a slice of their stake. Lose: the{" "}
            {rules.fee} goes into the prize pool. A draw when time runs out goes to the ghost.
          </>
        )}
      </p>
    </Sheet>
  );
}
