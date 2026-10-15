"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { STAKES_NAIRA, WINNER_SHARE } from "@/lib/world/challenges";
import { cash, cashSymbol, fromShown } from "@/lib/world/value";
import { CardFace } from "../games/whot-cards";
import { Sheet } from "../sheet";
import { challengeQuote, type ChallengeQuote } from "./challenge-actions";

// Challenge one player to Whot! (docs/GAME_TABLES.md): pick a stake, send the challenge. They're
// asked to accept; the table opens straight away for you.

export type GameTarget = { id: string; name: string; avatar: unknown };

export function WhotInvite({ region, target, onClose, onSend }: { region: string; target: GameTarget; onClose: () => void; onSend: (stakeMint: number) => Promise<string | null> }) {
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
      setStake((s) => s ?? Math.round((STAKES_NAIRA[1] / q.perMint) * 100) / 100);
    });
    return () => {
      live = false;
    };
  }, [region]);

  const amount = typed ? Math.round(fromShown(Number(typed)) * 100) / 100 : stake;
  const ok = !!quote && amount != null && amount >= quote.minStake && amount <= quote.maxStake && (quote.canSpend == null || amount <= quote.canSpend + 0.005);
  const send = async () => {
    if (!ok || amount == null) return;
    setBusy(true);
    setError(null);
    const e = await onSend(amount);
    setBusy(false);
    if (e) setError(e);
  };

  return (
    <Sheet onClose={onClose} title="Play Whot!">
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-4 rounded-3xl p-4 text-white" style={{ background: "radial-gradient(ellipse at 50% 40%, #23915a, #0a4127)", ["--cw" as string]: "44px" }}>
          <CardFace c={520} style={{ transform: "rotate(-12deg)" }} />
          <div className="flex flex-col items-center">
            <AvatarFace avatar={cleanAvatar(target.avatar, target.name)} size={56} className="rounded-full ring-4 ring-white/80" />
            <p className="mt-1 max-w-32 truncate text-sm font-bold">You vs {target.name}</p>
          </div>
          <CardFace c={214} style={{ transform: "rotate(12deg)" }} />
        </div>
        <div>
          <p className="text-sm font-semibold">Stake (each of you puts in)</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {quote &&
              STAKES_NAIRA.map((nv) => {
                const m = Math.round((nv / quote.perMint) * 100) / 100;
                const on = !typed && stake === m;
                return (
                  <button key={nv} onClick={() => (setTyped(""), setStake(m))} className={cn("h-11 rounded-xl text-sm font-bold", on ? "bg-gold text-ink" : "bg-panel-2 text-muted")}>
                    {cash(m)}
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
              {amount != null && ` Winner takes ${cash(amount * 2 * WINNER_SHARE)} (more if others join).`}
            </p>
          )}
          {quote && amount != null && quote.canSpend != null && amount > quote.canSpend + 0.005 && <p className="mt-1 text-sm text-hit">That&apos;s more than you have.</p>}
        </div>
        <button onClick={() => void send()} disabled={!ok || busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7048e8] font-bold text-white disabled:opacity-40">
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {amount != null && quote ? `Challenge ${target.name} for ${cash(amount)}` : "Challenge"}
        </button>
        <p className="text-center text-xs text-muted">They have three minutes to accept. Anyone nearby can join or watch. If they say no, your stake comes back.</p>
        {error && <p className="text-center text-sm text-hit">{error}</p>}
      </div>
    </Sheet>
  );
}

/** "Tolu challenges you to Whot!": accept or decline, with the time left. */
export function InviteCard({ host, stake, pool, secsLeft, busy, onAccept, onDecline }: { host: GameTarget; stake: number; pool: number; secsLeft: number; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="toast-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl text-white shadow-2xl ring-2 ring-[#ffd43b]" style={{ background: "radial-gradient(ellipse at 30% 30%, #23915a, #0a4127)", ["--cw" as string]: "34px" }}>
      <div className="flex items-center gap-3 p-3">
        <span className="relative shrink-0">
          <AvatarFace avatar={cleanAvatar(host.avatar, host.name)} size={48} className="rounded-full ring-2 ring-white" />
          <span className="absolute -bottom-2 -right-3 rotate-12">
            <CardFace c={520} />
          </span>
        </span>
        <div className="min-w-0 flex-1 pl-2">
          <p className="text-sm font-bold leading-tight">
            {host.name} challenges you to <span className="text-[#ffd43b]">Whot!</span>
          </p>
          <p className="text-xs text-white/75">
            Stake {cash(stake)} · winner takes {cash((pool + stake) * WINNER_SHARE)} · <b className="tabular-nums text-[#ffd43b]">{Math.floor(secsLeft / 60)}:{String(Math.max(0, Math.floor(secsLeft) % 60)).padStart(2, "0")}</b>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        <button onClick={onDecline} disabled={busy} className="h-10 rounded-full bg-white/15 text-sm font-semibold disabled:opacity-50">
          Not now
        </button>
        <button onClick={onAccept} disabled={busy} className="h-10 rounded-full bg-[#ffd43b] text-sm font-black text-ink shadow-[0_3px_0_#c99a00] disabled:opacity-50">
          Accept {cash(stake)}
        </button>
      </div>
    </div>
  );
}
