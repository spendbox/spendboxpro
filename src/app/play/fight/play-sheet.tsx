"use client";

import { useEffect, useState } from "react";
import { Check, Eye, ListPlus, LoaderCircle, MapPin, Play, Radio, Users, Wallet } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { cash } from "@/lib/world/value";
import { HOST_JOIN_SECS, PLAY_GAMES, STAKES_NAIRA, WINNER_SHARE, challengeGame, hostFeeNaira, minPlayers, playersText, type TableGame } from "@/lib/world/challenges";
import { Sheet } from "../sheet";
import { challengeQuote, type ChallengeQuote, type ChallengeView } from "./challenge-actions";
import { GAME_LOOKS } from "./whot-invite";

// Play (the button beside Events): host one of the full-screen games right where you are, now
// (Whot!, chess, draughts, paintball, Truth or Dare, Impostor; more to come). Hosting costs a fee
// (₦20,000 for a two-player game, ₦100,000 for more players); everyone nearby is told, your spot
// lights up and they have 3 minutes to join. Below: the games near you, to join, watch, or get in
// line for the next one. docs/CHALLENGES.md, "Play: host a game".

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, "0")}`;

export function PlaySheet({
  region,
  meId,
  list,
  mine,
  now,
  onClose,
  onHost,
  onJoin,
  onWatch,
  onQueue,
  onOpenMine,
  onLeaveMine,
  onFly,
}: {
  region: string;
  meId: string;
  /** Games near you (open and being played). */
  list: ChallengeView[];
  /** The one you're in. */
  mine: number | null;
  now: number;
  onClose: () => void;
  /** Host it: an error to show (and the game you're still in, if that's why), or null when it's on. */
  onHost: (game: TableGame, stakeMint: number) => Promise<{ error: string; busyId?: number } | null>;
  onJoin: (c: ChallengeView) => void;
  onWatch: (c: ChallengeView) => void;
  /** In line for the next game (or out of it): an error, or null. */
  onQueue: (c: ChallengeView, on: boolean) => Promise<string | null>;
  onOpenMine: (id: number) => void;
  /** Leave the game you're in (from here, wherever it is): an error, or null. */
  onLeaveMine: (id: number) => Promise<string | null>;
  onFly: (x: number, z: number) => void;
}) {
  const [game, setGame] = useState<TableGame>("whot");
  const [stakeNaira, setStakeNaira] = useState(0);
  const [quote, setQuote] = useState<ChallengeQuote | null>(null);
  const [going, setGoing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lining, setLining] = useState<number | null>(null);
  // The game you're still in (the host button says why it can't be used), to open or leave.
  const [busyId, setBusyId] = useState<number | null>(null);
  const stuck = mine ?? busyId;
  const [leaving, setLeaving] = useState(false);
  async function leaveStuck() {
    if (stuck === null) return;
    setLeaving(true);
    const err = await onLeaveMine(stuck);
    setLeaving(false);
    if (err) return setProblem(err);
    setBusyId(null);
    setProblem(null);
  }
  useEffect(() => {
    void challengeQuote(region).then(setQuote).catch(() => setQuote(null));
  }, [region]);

  const perMint = quote?.perMint ?? 1_500;
  const g = challengeGame(game)!;
  const fee = Math.round((hostFeeNaira(game) / perMint) * 100) / 100;
  const stake = Math.round((stakeNaira / perMint) * 100) / 100;
  const need = fee + stake;
  const canSpend = quote?.canSpend ?? null;
  const short = canSpend !== null && need > canSpend + 0.001;
  const near = [...list].sort((a, b) => Number(b.id === mine) - Number(a.id === mine) || Number(a.status === "playing") - Number(b.status === "playing"));

  async function host() {
    setGoing(true);
    setProblem(null);
    const err = await onHost(game, stake);
    setGoing(false);
    if (err) {
      setProblem(err.error);
      if (err.busyId !== undefined) setBusyId(err.busyId);
    }
  }

  return (
    <Sheet onClose={onClose} title="Play" wide>
      {/* What it is, up front. */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0d1117] p-4 text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_0%,rgba(112,72,232,.55),transparent_55%),radial-gradient(ellipse_at_100%_100%,rgba(240,140,0,.45),transparent_55%)]" />
        <div className="relative">
          <p className="text-[11px] font-black tracking-[0.25em] text-[#ffd43b]">HOST A GAME · NOW</p>
          <p className="mt-1 font-display text-2xl font-black leading-tight">Play where you are</p>
          <p className="mt-1 text-sm text-white/75">Everyone nearby is told and your spot lights up on the map. They have {HOST_JOIN_SECS / 60} minutes to join, watch, or get in line for the next one.</p>
        </div>
      </div>

      {/* The games near you. */}
      <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Radio className="size-3.5" /> Games near you
      </p>
      {near.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-ink/5 px-3 py-4 text-center text-sm text-muted">Nothing on near you right now. Host one below!</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {near.map((c) => {
            const cg = challengeGame(c.game);
            const look = GAME_LOOKS[(PLAY_GAMES as readonly string[]).includes(c.game) ? (c.game as TableGame) : "whot"];
            const host = c.players[0];
            const left = (Date.parse(c.startsAt) - now) / 1000;
            const open = c.status === "open" && left > 0;
            const inIt = c.players.some((p) => p.id === meId);
            const full = c.players.length >= c.seats;
            const lined = c.next.some((p) => p.id === meId);
            return (
              <li key={c.id} className="overflow-hidden rounded-3xl bg-ink/5">
                <div className="flex items-center gap-2.5 p-2.5">
                  <button onClick={() => onFly(c.x, c.z)} className="relative shrink-0" aria-label="See it on the map">
                    {host && <AvatarFace avatar={cleanAvatar(host.avatar, host.name)} size={44} className="rounded-full ring-2 ring-white" />}
                    <span className="absolute -bottom-1 -right-1 text-lg">{cg?.icon}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {host?.id === meId ? "You" : (host?.name ?? "Someone")} · {cg?.title}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {open ? (
                        <span className="font-semibold text-[#2f9e44]">
                          Taking players <b className="tabular-nums">{mmss(left)}</b>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-[#e03131]">
                          <span className="size-1.5 animate-pulse rounded-full bg-[#e03131]" /> Playing now
                        </span>
                      )}
                      <span>
                        {c.players.length}/{c.seats} players
                      </span>
                      {c.stake > 0 && <span>{cash(c.stake)} each</span>}
                    </p>
                  </div>
                  <button onClick={() => onFly(c.x, c.z)} className="grid size-9 shrink-0 place-items-center rounded-full bg-panel text-muted" aria-label="Show on the map">
                    <MapPin className="size-4" />
                  </button>
                </div>
                <div className="flex gap-1.5 px-2.5 pb-2.5">
                  {c.id === mine ? (
                    <button onClick={() => onOpenMine(c.id)} className="h-10 flex-1 rounded-full text-sm font-bold text-white" style={{ background: look.button }}>
                      Open your game
                    </button>
                  ) : (
                    <>
                      {open && !inIt && !full && (
                        <button onClick={() => onJoin(c)} disabled={mine !== null} className="h-10 flex-1 rounded-full text-sm font-bold text-white disabled:opacity-50" style={{ background: look.button }}>
                          {c.stake > 0 ? `Join · ${cash(c.stake)}` : "Join"}
                        </button>
                      )}
                      {!open && (
                        <button onClick={() => onWatch(c)} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-sm font-bold text-white">
                          <Eye className="size-4" /> Watch
                        </button>
                      )}
                      {(!open || full) && !inIt && (
                        <button
                          disabled={lining === c.id}
                          onClick={async () => {
                            setLining(c.id);
                            const err = await onQueue(c, !lined);
                            setLining(null);
                            if (err) setProblem(err);
                          }}
                          className={cn("flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold", lined ? "bg-[#2f9e44] text-white" : "bg-panel text-ink ring-1 ring-ink/15")}
                        >
                          {lining === c.id ? <LoaderCircle className="size-4 animate-spin" /> : lined ? <Check className="size-4" /> : <ListPlus className="size-4" />}
                          {lined ? "You're in line" : "I'm next"}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {c.next.length > 0 && (
                  <p className="border-t border-ink/5 px-3 py-1.5 text-[11px] text-muted">
                    Next in line: <b className="text-ink">{c.next.map((p) => (p.id === meId ? "you" : p.name)).join(", ")}</b>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Host a game</p>
      {/* The six games, big. */}
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        {PLAY_GAMES.map((id) => {
          const c = challengeGame(id)!;
          const look = GAME_LOOKS[id];
          const on = id === game;
          return (
            <button
              key={id}
              onClick={() => setGame(id)}
              aria-pressed={on}
              className={cn("relative flex h-36 flex-col overflow-hidden rounded-3xl p-3 text-left text-white shadow-md transition active:scale-[0.97]", on ? "ring-4" : "ring-1 ring-black/10")}
              style={{ background: look.bg, ...(on ? { ["--tw-ring-color" as string]: look.ring } : {}) } as React.CSSProperties}
            >
              <span className="pointer-events-none absolute right-2 top-2.5 flex origin-top-right scale-[0.8] items-center gap-2 opacity-95">
                {look.left}
                {look.right}
              </span>
              {on && (
                <span className="absolute left-2.5 top-2.5 grid size-6 place-items-center rounded-full text-ink shadow" style={{ background: look.ring }}>
                  <Check className="size-4" strokeWidth={3} />
                </span>
              )}
              <b className="mt-auto font-display text-lg font-black leading-tight drop-shadow">{c.title}</b>
              <span className="flex items-center gap-1 text-[11px] text-white/80">
                <Users className="size-3" /> {id === "impostor" ? "3 to 6 players" : playersText(c)}
              </span>
              <span className="mt-1 w-fit rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold">Host {cash(hostFeeNaira(id) / perMint)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{g.blurb}</p>

      {/* The stake: roomy, two a row. */}
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Stake (optional)</p>
        {canSpend !== null && (
          <p className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted">
            <Wallet className="size-3.5" /> You have <b className="text-ink">{cash(canSpend)}</b>
          </p>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {STAKES_NAIRA.map((s) => (
          <button key={s} onClick={() => setStakeNaira(s)} className={cn("h-12 rounded-2xl px-3 text-base font-bold tabular-nums transition", s === 0 && "col-span-2", stakeNaira === s ? "bg-ink text-white shadow" : "bg-ink/5")}>
            {s === 0 ? "No stake: just for fun" : cash(s / perMint)}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {stake > 0 ? `Everyone puts in ${cash(stake)}: the winner takes up to ${cash(stake * g.seats * WINNER_SHARE)} with ${g.seats} players.` : "Nobody puts money in: play for the win and the reputation."}
      </p>

      {/* Host it: always in reach. */}
      <div className="sticky -bottom-5 z-10 -mx-5 mt-3 bg-panel/95 px-5 pb-5 pt-2 backdrop-blur">
        <div className="mb-2 flex items-center justify-between rounded-2xl bg-gold/15 px-3 py-2 text-xs">
          <span>
            Hosting {cash(fee)}
            {stake > 0 && <> + your stake {cash(stake)}</>}
          </span>
          <b className="tabular-nums">{cash(need)}</b>
        </div>
        {(problem || short) && <p className="mb-2 rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">{problem ?? `Not enough: you need ${cash(need)}.`}</p>}
        {/* Still in another game: open it, or leave it, right here. */}
        {stuck !== null && (
          <div className="mb-2 rounded-2xl bg-ink/5 p-2.5">
            <p className="text-xs font-semibold">You&apos;re still in another game. Finish it, or leave it to host a new one.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => onOpenMine(stuck)} className="h-10 rounded-full bg-ink text-xs font-bold text-white">
                Open it
              </button>
              <button disabled={leaving} onClick={() => void leaveStuck()} className="h-10 rounded-full bg-hit text-xs font-bold text-white disabled:opacity-50">
                {leaving ? "Leaving…" : "Leave it"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">Leaving before it starts gives your stake back; leaving a game being played gives it up.</p>
          </div>
        )}
        <button
          disabled={going || short || mine !== null}
          onClick={() => void host()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full font-display text-lg font-black text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: GAME_LOOKS[game].button }}
        >
          {going ? <LoaderCircle className="size-5 animate-spin" /> : <Play className="size-5" fill="currentColor" />}
          {mine !== null ? "You're in a game already" : `Host ${g.title} now · ${cash(need)}`}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-muted">
          {minPlayers(game) > 2 ? `Needs ${minPlayers(game)} players. ` : ""}Starts when the time&apos;s up, or tap Start once enough are in. If nobody joins, your stake comes back; the hosting fee doesn&apos;t.
        </p>
      </div>

    </Sheet>
  );
}
