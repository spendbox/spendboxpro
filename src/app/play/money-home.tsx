"use client";

import { useEffect, useState } from "react";
import { Clock, CreditCard, Flame, Gift, House, Star, Trophy, Wallet } from "lucide-react";
import { cash } from "@/lib/world/value";
import type { GiftParts } from "@/lib/world/daily-gift";
import type { MoneyView } from "@/lib/world/money-view";
import { TOPUPS } from "@/lib/world/topups";
import { Sheet } from "./sheet";
import { startTopUp, toppedUpBefore } from "./topup-actions";

// Your money (docs/MONEY.md): tap your cash. What you have, today's daily gift, where today's
// money came from, and what to spend it on. Amounts come in naira and show in your currency.

async function loadMoney(): Promise<MoneyView | null> {
  const r = await fetch("/api/money", { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as MoneyView | null) : null;
}

async function claimGift(): Promise<{ naira?: number; streak?: number; already?: boolean; error?: string }> {
  const r = await fetch("/api/daily-gift", { method: "POST", cache: "no-store" }).catch(() => null);
  return r?.ok ? await r.json() : { error: "The connection blinked. Try again." };
}

/** The gift's parts, line by line. */
function GiftLines({ parts, streak, show }: { parts: GiftParts; streak: number; show: (naira: number) => string }) {
  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Gift className="size-4 text-[#f08c00]" />, label: "Every day", value: show(parts.base) },
    { icon: <Clock className="size-4 text-[#2f9e44]" />, label: "Your time in the city yesterday", value: show(parts.active) },
    { icon: <Flame className="size-4 text-[#e8590c]" />, label: `${streak} day${streak === 1 ? "" : "s"} in a row`, value: show(parts.streak) },
    { icon: <Star className="size-4 text-[#7048e8]" />, label: "Weeks playing", value: show(parts.playing) },
  ];
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          {r.icon}
          <span className="min-w-0 flex-1">{r.label}</span>
          <b className="tabular-nums">{r.value}</b>
        </li>
      ))}
      {parts.repTimes > 1 && (
        <li className="flex items-center gap-2">
          <Star className="size-4 text-gold-dark" />
          <span className="min-w-0 flex-1">Your reputation</span>
          <b className="tabular-nums">× {parts.repTimes.toFixed(2)}</b>
        </li>
      )}
    </ul>
  );
}

/** Today's gift: open it (or what it was, and come back tomorrow). */
function GiftBox({ view, perMint, onTaken }: { view: NonNullable<MoneyView["gift"]>; perMint: number; onTaken: (naira: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const show = (naira: number) => cash(naira / perMint);
  if (got !== null || view.claimed)
    return (
      <div className="rounded-3xl bg-[#fff3bf] p-4 text-center">
        <Gift className="mx-auto size-8 text-[#f08c00]" />
        <p className="mt-1 font-display text-2xl font-extrabold">+{show(got ?? view.amountNaira ?? 0)}</p>
        <p className="text-sm">Today&apos;s gift is yours. Come back tomorrow for another{view.streak ? `: day ${view.streak + 1} in a row` : ""}.</p>
        <p className="mt-1 text-xs text-muted">The more time you spend in the city today, the bigger tomorrow&apos;s gift ({view.activeToday} min so far, up to 120).</p>
      </div>
    );
  return (
    <div className="rounded-3xl bg-[#fff3bf] p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-12 shrink-0 animate-bounce place-items-center rounded-2xl bg-[#f59f00] text-white">
          <Gift className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold">Your daily gift is ready</p>
          <p className="text-xs text-[#5c4400]">Day {view.streak} in a row</p>
        </div>
      </div>
      {view.parts && <GiftLines parts={view.parts} streak={view.streak} show={show} />}
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
        className="mt-3 h-12 w-full rounded-full bg-ink text-base font-bold text-white disabled:opacity-50"
      >
        {busy ? "Opening…" : `Open it: ${show(view.parts?.total ?? 0)}`}
      </button>
      {error && <p className="mt-2 text-center text-xs text-hit">{error}</p>}
    </div>
  );
}

/** Top up: game money for real money, through Paystack (the first one doubled). */
function TopUps({ region, perMint }: { region: string; perMint: number }) {
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
    window.location.assign(r.url);
  };
  return (
    <div>
      {before === false && (
        <p className="mb-2 rounded-2xl bg-[#d3f9d8] px-3 py-2 text-xs font-semibold text-[#2b8a3e]">Your first top-up is doubled!</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {TOPUPS.map((t) => (
          <button
            key={t.id}
            disabled={!!busy}
            onClick={() => void go(t.id)}
            className="relative flex flex-col items-start rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-ink/10 disabled:opacity-50"
          >
            {t.bonus > 0 && <span className="absolute right-2 top-2 rounded-full bg-gold/30 px-1.5 text-[10px] font-bold text-gold-dark">+{t.bonus}%</span>}
            <span className="font-display text-base font-extrabold tabular-nums">{cash(t.game / perMint)}</span>
            {before === false && <span className="text-[11px] font-semibold text-[#2b8a3e]">× 2 = {cash((t.game * 2) / perMint)}</span>}
            <span className="mt-1 text-xs font-semibold text-muted">{busy === t.id ? "Opening Paystack…" : `Pay ₦${t.naira.toLocaleString("en-GB")}`}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">Paid through Paystack. Game money can&apos;t be turned back into real money.</p>
      {error && <p className="mt-1 text-xs text-hit">{error}</p>}
    </div>
  );
}

/** Your money: tap your cash. */
export function MoneyHome({
  coins,
  perMint,
  region,
  onClose,
  onTaken,
  onProperty,
  onShops,
}: {
  coins: number;
  perMint: number;
  /** The map you're on (top-ups are bought for it). */
  region: string;
  onClose: () => void;
  /** The gift was taken (the cash at the top goes up). */
  onTaken: () => void;
  /** Your places, rent and budget (until they're simplified). */
  onProperty: () => void;
  onShops: () => void;
}) {
  const [view, setView] = useState<MoneyView | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadMoney().then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, []);
  const show = (naira: number) => cash(naira / perMint);
  return (
    <Sheet onClose={onClose} title="Your money" above>
      <div className="rounded-3xl bg-ink p-4 text-white">
        <p className="text-xs font-semibold text-white/70">You have</p>
        <p className="font-display text-3xl font-extrabold tabular-nums">{cash(coins)}</p>
        {view && view.inToday.length > 0 && <p className="text-xs font-semibold text-[#8ce99a]">+{show(view.inToday.reduce((t, r) => t + r.naira, 0))} today</p>}
      </div>
      <div className="mt-3">
        {view === undefined ? (
          <div className="h-32 animate-pulse rounded-3xl bg-ink/5" />
        ) : view?.gift ? (
          <GiftBox view={view.gift} perMint={perMint} onTaken={onTaken} />
        ) : (
          <p className="rounded-3xl bg-ink/5 p-4 text-center text-sm text-muted">The daily gift is switched on soon.</p>
        )}
      </div>
      <h3 className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        <CreditCard className="size-3.5" /> Top up
      </h3>
      <TopUps region={region} perMint={perMint} />
      <h3 className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">Where today&apos;s money came from</h3>
      {view && view.inToday.length > 0 ? (
        <ul className="divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {view.inToday.map((r) => (
            <li key={r.label} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span>{r.label}</span>
              <b className="tabular-nums text-[#2b8a3e]">+{show(r.naira)}</b>
            </li>
          ))}
          {view.outToday > 0 && (
            <li className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="text-muted">Spent today</span>
              <b className="tabular-nums text-muted">−{show(view.outToday)}</b>
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing yet today. Open your gift, win a challenge, or just spend time in the city.</p>
      )}
      <h3 className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">Ways to earn</h3>
      <ul className="space-y-1.5 text-sm">
        <li className="flex items-center gap-2">
          <Gift className="size-4 shrink-0 text-[#f08c00]" /> A gift every day: bigger with time in the city, days in a row and reputation.
        </li>
        <li className="flex items-center gap-2">
          <Trophy className="size-4 shrink-0 text-[#e8590c]" /> Win challenges: the pot, plus a prize from Newtown.
        </li>
        <li className="flex items-center gap-2">
          <House className="size-4 shrink-0 text-[#7048e8]" /> Own places and let them out: they pay you rent.
        </li>
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            onClose();
            onShops();
          }}
          className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-ink/5 text-sm font-semibold"
        >
          <Gift className="size-4" /> Gifts for friends
        </button>
        <button
          onClick={() => {
            onClose();
            onProperty();
          }}
          className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-ink/5 text-sm font-semibold"
        >
          <Wallet className="size-4" /> Your places
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-2xl bg-ink/5 px-3 py-2.5 text-sm opacity-60" aria-disabled="true">
        <span className="flex items-center gap-1.5 font-semibold">
          <House className="size-4" /> Upgrade your home
        </span>
        <span className="text-xs font-semibold text-muted">Coming soon</span>
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
    <Sheet onClose={onClose} above centred>
      <GiftBox view={view.gift} perMint={perMint} onTaken={onTaken} />
      <button onClick={onClose} className="mt-2 h-10 w-full rounded-full text-sm font-semibold text-muted">
        Close
      </button>
    </Sheet>
  );
}
