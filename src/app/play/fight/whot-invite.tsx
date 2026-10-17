"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { STAKES_NAIRA, TABLE_GAMES, WINNER_SHARE, challengeGame, minPlayers, type TableGame } from "@/lib/world/challenges";
import { cash, cashSymbol, fromShown } from "@/lib/world/value";
import { CardFace } from "../games/whot-cards";
import { Sheet } from "../sheet";
import { challengeQuote, type ChallengeQuote } from "./challenge-actions";

// Challenge one player to a game at a table (docs/GAME_TABLES.md, docs/PARTY_GAMES.md): Whot!,
// Truth or Dare or Impostor. Pick the game and a stake, send the challenge. They're asked to
// accept; the table opens straight away for you.

export type GameTarget = { id: string; name: string; avatar: unknown };

/** How each table game looks on its invitations. */
const LOOKS: Record<TableGame, { bg: string; ring: string; button: string; left: ReactNode; right: ReactNode }> = {
  whot: { bg: "radial-gradient(ellipse at 50% 40%, #23915a, #0a4127)", ring: "#ffd43b", button: "#7048e8", left: <CardFace c={520} style={{ transform: "rotate(-12deg)" }} />, right: <CardFace c={214} style={{ transform: "rotate(12deg)" }} /> },
  truth_dare: {
    bg: "radial-gradient(ellipse at 50% 120%, rgba(255,45,149,0.6), transparent 60%), radial-gradient(ellipse at 50% 0%, #4c1d95, #12051f)",
    ring: "#ff2d95",
    button: "#ff2d95",
    left: <span className="grid h-16 w-12 -rotate-12 place-items-center rounded-xl bg-gradient-to-br from-[#22d3ee] to-[#1d4ed8] text-[10px] font-black uppercase shadow-lg ring-2 ring-white/70">Truth</span>,
    right: <span className="grid h-16 w-12 rotate-12 place-items-center rounded-xl bg-gradient-to-br from-[#ff2d95] to-[#7c3aed] text-[10px] font-black uppercase shadow-lg ring-2 ring-white/70">Dare</span>,
  },
  impostor: {
    bg: "radial-gradient(ellipse at 50% 0%, #1e2a44, #050810)",
    ring: "#ef4444",
    button: "#ef4444",
    left: <span className="-rotate-12 text-4xl drop-shadow">🕵️</span>,
    right: <span className="rotate-12 rounded-lg bg-[#d6c7a1] px-1.5 py-1 font-mono text-[10px] font-black text-[#1c1917] shadow">TOP SECRET</span>,
  },
};
const lookOf = (game: string) => LOOKS[(TABLE_GAMES as readonly string[]).includes(game) ? (game as TableGame) : "whot"];

export function GameInvite({ region, target, game, onGame, onClose, onSend }: { region: string; target: GameTarget; game: TableGame; onGame: (g: TableGame) => void; onClose: () => void; onSend: (stakeMint: number) => Promise<string | null> }) {
  const [quote, setQuote] = useState<ChallengeQuote | null>(null);
  const [stake, setStake] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void challengeQuote(region).then((q) => {
      if (!live) return;
      setQuote(q);
      // No stake to start with: playing for money is a choice (docs/GAME_TABLES.md).
      setStake((s) => s ?? 0);
    });
    return () => {
      live = false;
    };
  }, [region]);

  const g = challengeGame(game);
  const look = lookOf(game);
  const amount = typed ? Math.round(fromShown(Number(typed)) * 100) / 100 : stake;
  const ok = !!quote && amount != null && (amount === 0 || (amount >= quote.minStake && amount <= quote.maxStake)) && (quote.canSpend == null || amount <= quote.canSpend + 0.005);
  const send = async () => {
    if (!ok || amount == null) return;
    setBusy(true);
    setError(null);
    const e = await onSend(amount);
    setBusy(false);
    if (e) setError(e);
  };

  return (
    <Sheet onClose={onClose} title={`Play ${g?.title ?? "a game"}`} above>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Game">
          {TABLE_GAMES.map((id) => {
            const t = challengeGame(id);
            return (
              <button key={id} role="tab" aria-selected={id === game} onClick={() => onGame(id)} className={cn("flex h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold transition", id === game ? "text-white shadow-lg" : "bg-panel-2 text-muted")} style={id === game ? { background: LOOKS[id].button } : undefined}>
                <span className="text-lg leading-none">{t?.icon}</span>
                {t?.title}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-4 rounded-3xl p-4 text-white" style={{ background: look.bg, ["--cw" as string]: "44px" }}>
          {look.left}
          <div className="flex flex-col items-center">
            <AvatarFace avatar={cleanAvatar(target.avatar, target.name)} size={56} className="rounded-full ring-4 ring-white/80" />
            <p className="mt-1 max-w-32 truncate text-sm font-bold">You vs {target.name}</p>
          </div>
          {look.right}
        </div>
        <p className="-mt-2 text-center text-xs text-muted">{g?.blurb}</p>
        <div>
          <p className="text-sm font-semibold">Stake (optional: each of you puts in)</p>
          {/* Roomy: "None" across the top, the amounts two a row below. */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {quote &&
              STAKES_NAIRA.map((nv) => {
                const m = Math.round((nv / quote.perMint) * 100) / 100;
                const on = !typed && stake === m;
                return (
                  <button key={nv} onClick={() => (setTyped(""), setStake(m))} className={cn("h-12 min-w-0 rounded-2xl px-3 text-base font-bold tabular-nums", nv === 0 && "col-span-2", on ? "bg-gold text-ink" : "bg-panel-2 text-muted")}>
                    {nv === 0 ? "None" : cash(m)}
                  </button>
                );
              })}
          </div>
          <label className="mt-2 flex items-center gap-2 rounded-2xl border border-line px-3">
            <span className="font-bold text-muted">{cashSymbol()}</span>
            <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="Or type an amount" className="h-11 min-w-0 flex-1 bg-transparent font-semibold outline-none" />
          </label>
          {quote && (
            <p className="mt-1.5 text-xs text-muted">
              {cash(quote.minStake)} to {cash(quote.maxStake)}.{quote.canSpend != null && ` You have ${cash(quote.canSpend)}.`}
              {amount === 0 ? " No stake: just for fun." : amount != null && ` Winner takes ${cash(amount * 2 * WINNER_SHARE)} (more if others join).`}
            </p>
          )}
          {quote && amount != null && quote.canSpend != null && amount > quote.canSpend + 0.005 && <p className="mt-1 text-sm text-hit">That&apos;s more than you have.</p>}
        </div>
        <button onClick={() => void send()} disabled={!ok || busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full font-bold text-white disabled:opacity-40" style={{ background: look.button }}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {amount != null && quote ? (amount === 0 ? `Challenge ${target.name} for fun` : `Challenge ${target.name} for ${cash(amount)}`) : "Challenge"}
        </button>
        <p className="text-center text-xs text-muted">
          {minPlayers(game) > 2
            ? `They have three minutes to accept. ${g?.title} needs ${minPlayers(game)} players: anyone nearby can join, and you can start once there are ${minPlayers(game)}. Too few, and the stakes come back.`
            : "They have three minutes to accept. Anyone nearby can join or watch. If they say no, your stake comes back."}
        </p>
        {error && <p className="text-center text-sm text-hit">{error}</p>}
      </div>
    </Sheet>
  );
}

/** "Tolu challenges you to Whot!": accept or decline, with the time left. */
export function InviteCard({ game, host, stake, pool, secsLeft, busy, onAccept, onDecline }: { game: string; host: GameTarget; stake: number; pool: number; secsLeft: number; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  const look = lookOf(game);
  const g = challengeGame(game);
  return (
    <div className="toast-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl text-white shadow-2xl ring-2" style={{ background: look.bg, ["--cw" as string]: "34px", ["--tw-ring-color" as string]: look.ring }}>
      <div className="flex items-center gap-3 p-3">
        <span className="relative shrink-0">
          <AvatarFace avatar={cleanAvatar(host.avatar, host.name)} size={48} className="rounded-full ring-2 ring-white" />
          <span className="absolute -bottom-2 -right-3 rotate-12 text-2xl">{game === "whot" ? <CardFace c={520} /> : g?.icon}</span>
        </span>
        <div className="min-w-0 flex-1 pl-2">
          <p className="text-sm font-bold leading-tight">
            {host.name} challenges you to <span style={{ color: look.ring }}>{g?.title ?? "a game"}</span>
          </p>
          <p className="text-xs text-white/75">
            {stake > 0 ? `Stake ${cash(stake)} · winner takes ${cash((pool + stake) * WINNER_SHARE)}` : "Just for fun, no stake"} · <b className="tabular-nums text-[#ffd43b]">{Math.floor(secsLeft / 60)}:{String(Math.max(0, Math.floor(secsLeft) % 60)).padStart(2, "0")}</b>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        <button onClick={onDecline} disabled={busy} className="h-10 rounded-full bg-white/15 text-sm font-semibold disabled:opacity-50">
          Not now
        </button>
        <button onClick={onAccept} disabled={busy} className="h-10 rounded-full text-sm font-black text-ink shadow-[0_3px_0_rgba(0,0,0,0.35)] disabled:opacity-50" style={{ background: game === "whot" ? "#ffd43b" : "#ffffff" }}>
          {stake > 0 ? `Accept ${cash(stake)}` : "Accept"}
        </button>
      </div>
    </div>
  );
}
