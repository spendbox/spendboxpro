"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Gift, House } from "lucide-react";
import { cash } from "@/lib/world/value";
import type { GiftParts } from "@/lib/world/daily-gift";
import type { MoneyView } from "@/lib/world/money-view";
import { TOPUPS } from "@/lib/world/topups";
import { payInPopup } from "./paystack-popup";
import { Sheet } from "./sheet";
import { useIncome } from "./income";
import { confirmTopUp, startTopUp, toppedUpBefore } from "./topup-actions";

// Your wallet (docs/MONEY.md): tap your cash. Kept short: what you have, today's gift, top up.
// Amounts come in naira and show in your currency. Paying happens in Paystack's pop-up, over the game.

async function loadMoney(): Promise<MoneyView | null> {
  const r = await fetch("/api/money", { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as MoneyView | null) : null;
}

async function claimGift(): Promise<{ naira?: number; streak?: number; already?: boolean; error?: string }> {
  const r = await fetch("/api/daily-gift", { method: "POST", cache: "no-store" }).catch(() => null);
  return r?.ok ? await r.json() : { error: "The connection blinked. Try again." };
}

/** What the gift is made of, one short line each (folded away until asked). */
function GiftParts({ parts, streak, show }: { parts: GiftParts; streak: number; show: (naira: number) => string }) {
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-[#5c4400]">
      <li>Every day: {show(parts.base)}</li>
      <li>Time you played yesterday: {show(parts.active)}</li>
      <li>
        {streak} day{streak === 1 ? "" : "s"} in a row: {show(parts.streak)}
      </li>
      {parts.playing > 0 && <li>Weeks playing: {show(parts.playing)}</li>}
      {parts.repTimes > 1 && <li>Your reputation: × {parts.repTimes.toFixed(2)}</li>}
    </ul>
  );
}

/** Today's gift, in one box: open it, or come back tomorrow. */
function GiftBox({ view, perMint, onTaken }: { view: NonNullable<MoneyView["gift"]>; perMint: number; onTaken: (naira: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<number | null>(null);
  const [why, setWhy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = (naira: number) => cash(naira / perMint);
  const taken = got !== null || view.claimed;
  return (
    <div className="rounded-2xl bg-[#fff3bf] p-3">
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-[#f59f00] text-white ${taken ? "" : "animate-bounce"}`}>
          <Gift className="size-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          {taken ? (
            <>
              <b>+{show(got ?? view.amountNaira ?? 0)} today</b>
              <span className="block text-xs text-[#5c4400]">Next gift tomorrow. Play more today, get more tomorrow.</span>
            </>
          ) : (
            <>
              <b>Daily gift: {show(view.parts?.total ?? 0)}</b>
              <button onClick={() => setWhy((v) => !v)} className="flex items-center gap-0.5 text-xs text-[#5c4400]">
                Day {view.streak} in a row <ChevronDown className={`size-3 transition ${why ? "rotate-180" : ""}`} />
              </button>
            </>
          )}
        </p>
        {!taken && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await claimGift();
              setBusy(false);
              if (r.error) return setError(r.error);
              const naira = r.naira ?? view.parts?.total ?? 0;
              setGot(naira);
              onTaken(naira);
            }}
            className="h-10 shrink-0 rounded-full bg-ink px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Open"}
          </button>
        )}
      </div>
      {why && !taken && view.parts && <GiftParts parts={view.parts} streak={view.streak} show={show} />}
      {error && <p className="mt-1 text-xs text-hit">{error}</p>}
    </div>
  );
}

/** Top up: game money for real money, paid in Paystack's pop-up (the first one doubled). */
function TopUps({ region, perMint, onToppedUp }: { region: string; perMint: number; onToppedUp: (mint: number, doubled: boolean) => void }) {
  const [before, setBefore] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void toppedUpBefore()
      .then((b) => alive && setBefore(b))
      .catch(() => alive && setBefore(true));
    return () => {
      alive = false;
    };
  }, []);
  const go = async (id: string) => {
    setBusy(id);
    setError(null);
    const r = await startTopUp(id, region).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    if (!r.ok) {
      setBusy(null);
      return setError(r.error);
    }
    const how = r.accessCode ? await payInPopup(r.accessCode) : "unavailable";
    // The pop-up couldn't open (an old browser...): Paystack's own page, then back to the game.
    if (how === "unavailable") return window.location.assign(r.url);
    if (how === "closed") return setBusy(null);
    const done = await confirmTopUp(r.reference).catch(() => ({ ok: false as const, error: "The connection blinked." }));
    setBusy(null);
    if (!done.ok) return setError(done.error ?? "That payment hasn't gone through yet. It'll arrive as soon as it does.");
    setBefore(true);
    onToppedUp(done.mint ?? 0, !!done.doubled);
  };
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between text-xs">
        <b className="uppercase tracking-wide text-muted">Top up</b>
        {before === false && <span className="font-semibold text-[#2b8a3e]">Your first top-up is doubled!</span>}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {TOPUPS.map((t) => (
          <button key={t.id} disabled={!!busy} onClick={() => void go(t.id)} className="relative rounded-xl bg-white px-1.5 py-2 text-center shadow-sm ring-1 ring-ink/10 disabled:opacity-50">
            {t.bonus > 0 && <span className="absolute -top-1.5 right-1 rounded-full bg-gold px-1 text-[9px] font-bold text-ink">+{t.bonus}%</span>}
            <span className="block text-sm font-extrabold tabular-nums">{cash(t.game / perMint)}</span>
            <span className="block text-[11px] text-muted">{busy === t.id ? "Opening…" : `₦${t.naira.toLocaleString("en-GB")}`}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-hit">{error}</p>}
    </div>
  );
}

/** Your wallet: tap your cash. */
export function MoneyHome({
  coins,
  perMint,
  region,
  onClose,
  onTaken,
  onToppedUp,
  onProperty,
}: {
  coins: number;
  perMint: number;
  /** The map you're on (top-ups are bought for it). */
  region: string;
  onClose: () => void;
  /** The gift was taken (the cash at the top goes up). */
  onTaken: () => void;
  /** A top-up arrived. */
  onToppedUp: (mint: number, doubled: boolean) => void;
  /** Your assets: your property and what it earns. */
  onProperty: () => void;
}) {
  const [view, setView] = useState<MoneyView | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadMoney().then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, []);
  const today = view ? view.inToday.reduce((t, r) => t + r.naira, 0) : 0;
  const income = useIncome();
  return (
    <Sheet onClose={onClose} title="Wallet" above>
      <div className="flex items-end justify-between rounded-2xl bg-ink px-4 py-3 text-white">
        <p className="font-display text-3xl font-extrabold tabular-nums">{cash(coins, { exact: true, full: true })}</p>
        {today > 0 && <p className="text-xs font-semibold text-[#8ce99a]">+{cash(today / perMint)} today</p>}
      </div>
      <button
        onClick={() => {
          onClose();
          onProperty();
        }}
        className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-[#ebfbee] px-3 py-2 text-left text-sm"
      >
        <House className="size-4 shrink-0 text-[#2b8a3e]" />
        {income.perDay > 0 ? (
          <span className="min-w-0 flex-1">
            Your property earns <b className="text-[#2b8a3e]">{cash(income.perDay)} a day</b>, paid by itself.
          </span>
        ) : (
          <span className="min-w-0 flex-1">Buy property and it pays you every day, by itself.</span>
        )}
        <span className="shrink-0 text-xs font-semibold text-[#2b8a3e]">Assets →</span>
      </button>
      <div className="mt-3">
        {view === undefined ? (
          <div className="h-16 animate-pulse rounded-2xl bg-ink/5" />
        ) : view?.gift ? (
          <GiftBox view={view.gift} perMint={perMint} onTaken={onTaken} />
        ) : null}
      </div>
      <div className="mt-3">
        <TopUps region={region} perMint={perMint} onToppedUp={onToppedUp} />
      </div>
    </Sheet>
  );
}

/** The daily gift on its own, popping up once a day when you open the game (if you haven't opened it yet). */
export function DailyGiftPop({ perMint, onClose, onTaken }: { perMint: number; onClose: () => void; onTaken: () => void }) {
  const [view, setView] = useState<MoneyView | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadMoney().then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, []);
  // Nothing to show (taken already, or not switched on yet): go away quietly.
  useEffect(() => {
    if (view === undefined) return;
    if (!view?.gift || view.gift.claimed) {
      const t = setTimeout(onClose, 0);
      return () => clearTimeout(t);
    }
  }, [view, onClose]);
  if (!view?.gift || view.gift.claimed) return null;
  return (
    <Sheet onClose={onClose} above centred title="Your daily gift">
      <GiftBox view={view.gift} perMint={perMint} onTaken={onTaken} />
      <button onClick={onClose} className="mt-2 h-10 w-full rounded-full text-sm font-semibold text-muted">
        Close
      </button>
    </Sheet>
  );
}
