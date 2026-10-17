"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { Coins, LoaderCircle, Play } from "lucide-react";
import { gameFeeMint } from "@/lib/fees";
import { cash } from "@/lib/world/value";
import { payToPlay } from "../fee-actions";
import { FullScreen } from "./fullscreen";

// Every go at a game costs money (src/lib/fees.ts, gameFeeMint); games never pay out. pay()
// takes the fee (the server decides how much) and says whether you can play.

export function usePlayFee(game: string, signedIn: boolean) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function pay(): Promise<boolean> {
    if (!signedIn) {
      setError("Sign in to play: each game costs a small fee.");
      return false;
    }
    setBusy(true);
    setError(null);
    const res = await payToPlay(game).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    if (res.paid > 0) startTransition(() => router.refresh());
    return true;
  }
  return { fee: gameFeeMint(game), pay, busy, error, clear: () => setError(null) };
}

/** "₦1,000 a game" for a Play button. */
export function feeLabel(game: string) {
  return cash(gameFeeMint(game));
}

/** While the fee is being paid: a small card, then on to the game (or back, if it didn't go through). */
export function Paying({ fee, pay, onPaid, onFailed, full }: { fee: number; pay: () => Promise<boolean>; onPaid: () => void; onFailed: () => void; full?: { title: string; colour: string; icon: React.ReactNode } }) {
  const started = useRef(false);
  const cb = useRef({ onPaid, onFailed });
  useEffect(() => {
    cb.current = { onPaid, onFailed };
  });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void pay().then((ok) => (ok ? cb.current.onPaid() : cb.current.onFailed()));
  }, [pay]);
  // A full-screen game: its loading screen fills the screen too, in the game's own colours.
  if (full) {
    return (
      <FullScreen onQuit={() => cb.current.onFailed()} quitLabel="Back" className="bg-[#14171c]">
        <div className="relative grid flex-1 place-items-center overflow-hidden">
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 35%, ${full.colour}55, transparent 60%), linear-gradient(180deg, #1b1f26, #0b0d11)` }} />
          <div className="relative text-center">
            <span className="mx-auto grid size-20 place-items-center rounded-3xl text-white shadow-2xl" style={{ background: full.colour }}>
              {full.icon}
            </span>
            <p className="mt-4 font-display text-3xl font-black tracking-tight">{full.title}</p>
            <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-white/75">
              <LoaderCircle className="size-4 animate-spin" /> Paying {cash(fee)} and getting it ready…
            </p>
          </div>
        </div>
      </FullScreen>
    );
  }
  return (
    <div className="grid aspect-[3/4] max-h-[62dvh] w-full place-items-center rounded-3xl bg-[#10161f] text-white">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LoaderCircle className="size-4 animate-spin" /> Paying {cash(fee)} to play…
      </p>
    </div>
  );
}

/** What a game costs, and why it didn't start (not enough money...). */
export function FeeLine({ fee, error }: { fee: number; error: string | null }) {
  return (
    <>
      {error && <p className="rounded-2xl bg-[#ffe3e3] px-3 py-2 text-center text-sm font-semibold text-[#c92a2a]">{error}</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Coins className="size-3.5 text-gold-dark" /> Each game costs {cash(fee)}, from your Fun money. Games don&apos;t pay out money: play for the glory and the leaderboard.
      </p>
    </>
  );
}

/** A game tapped inside a place (darts, the pool table...): pay once to play, then it opens. */
export function FeeGate({ game, title, signedIn, children }: { game: string; title: string; signedIn: boolean; children: React.ReactNode }) {
  const fee = usePlayFee(game, signedIn);
  const [paid, setPaid] = useState(false);
  if (paid) return <>{children}</>;
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold leading-tight">{title}</h2>
      <button disabled={fee.busy} onClick={() => void fee.pay().then((ok) => ok && setPaid(true))} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-me py-3 font-semibold text-white disabled:opacity-60">
        {fee.busy ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} Play · {cash(fee.fee)}
      </button>
      <FeeLine fee={fee.fee} error={fee.error} />
    </div>
  );
}
