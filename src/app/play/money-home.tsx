"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Gift, House, TrendingUp } from "lucide-react";
import { cash } from "@/lib/world/value";
import type { GiftParts } from "@/lib/world/daily-gift";
import type { MoneyView } from "@/lib/world/money-view";
import { PAID_PACKS } from "@/lib/world/packs";
import { TOPUPS } from "@/lib/world/topups";
import { payInPopup } from "./paystack-popup";
import { Sheet } from "./sheet";
import { useIncome } from "./income";
import { confirmTopUp, myPackStatus, startTopUp, startTransferTopUp, toppedUpBefore, type TopUpRow } from "./topup-actions";
import type { TransferAccount } from "@/lib/paystack";
import { whileHere } from "./activity";

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

/** Copy something (an account number, an amount) with one tap. */
function CopyRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[11px] text-muted">{label}</span>
        <b className="block truncate text-base tabular-nums">{value}</b>
      </span>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(copyValue ?? value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
        className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-ink/5 px-3 text-xs font-semibold"
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Paying by bank transfer, in the game: the account to pay into, and a check every few seconds until it's in. */
function TransferBox({ reference, account, onPaid, onCancel }: { reference: string; account: TransferAccount; onPaid: (mint: number, doubled: boolean, pack?: string) => void; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ends = account.expiresAt ? Date.parse(account.expiresAt) : Date.now() + 30 * 60_000;
  const left = Math.max(0, Math.round((ends - now) / 1000));
  const check = async (byHand: boolean) => {
    if (byHand) setChecking(true);
    const r = await confirmTopUp(reference).catch(() => null);
    if (byHand) setChecking(false);
    if (r?.ok) return onPaid(r.mint ?? 0, !!r.doubled, r.pack);
    if (byHand) setNote("Not in yet. Transfers can take a minute or two: we keep checking, and it lands by itself.");
  };
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const c = setInterval(() => document.visibilityState === "visible" && void check(false), 8000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
    // check only reads the reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);
  const naira = `₦${Math.round(account.amountKobo / 100).toLocaleString("en-GB")}`;
  return (
    <div className="mt-2 rounded-2xl bg-[#e7f5ff] p-3">
      <p className="text-sm font-bold">🏦 Transfer exactly {naira} to:</p>
      <div className="mt-2 space-y-1.5">
        <CopyRow label="Account number" value={account.accountNumber} />
        <CopyRow label="Amount" value={naira} copyValue={String(Math.round(account.amountKobo / 100))} />
        <div className="rounded-xl bg-white px-3 py-2 text-sm">
          <span className="block text-[11px] text-muted">Bank · account name</span>
          <b>{account.bank}</b> · {account.accountName}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        {left > 0 ? `This account works for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} more. ` : "This account has run out of time: start again. "}
        Your game money arrives by itself once the transfer lands.
      </p>
      {note && <p className="mt-1 text-xs font-semibold text-[#1864ab]">{note}</p>}
      <div className="mt-2 flex gap-2">
        <button disabled={checking} onClick={() => void check(true)} className="h-10 flex-1 rounded-full bg-ink text-sm font-bold text-white disabled:opacity-50">
          {checking ? "Checking…" : "I've sent it"}
        </button>
        <button onClick={onCancel} className="h-10 rounded-full bg-white px-4 text-sm font-semibold">
          Close
        </button>
      </div>
    </div>
  );
}

/** Paying for a top-up or a starter pack ("pack_<id>"): by bank transfer (right here) or by card and more (Paystack's box). */
function usePay(region: string, onPaid: (mint: number, doubled: boolean, pack?: string) => void) {
  const [busy, setBusy] = useState<"transfer" | "card" | null>(null);
  const [transfer, setTransfer] = useState<{ reference: string; account: TransferAccount } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paid = (mint: number, doubled: boolean, pack?: string) => {
    setTransfer(null);
    onPaid(mint, doubled, pack);
  };
  const byTransfer = async (id: string) => {
    setBusy("transfer");
    setError(null);
    const r = await startTransferTopUp(id, region).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(null);
    if (!r.ok) return setError(/switched on soon|had a starter|starting out/.test(r.error) ? r.error : `${r.error} You can pay by card instead.`);
    setTransfer({ reference: r.reference, account: r.account });
  };
  const byCard = async (id: string) => {
    setBusy("card");
    setError(null);
    const r = await startTopUp(id, region).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    if (!r.ok) {
      setBusy(null);
      return setError(r.error);
    }
    const how = r.accessCode ? await payInPopup(r.accessCode) : "unavailable";
    // The pop-up couldn't open (an old browser...): Paystack's own page, then back to the game.
    if (how === "unavailable") return window.location.assign(r.url);
    if (how === "closed") {
      setBusy(null);
      return setError("Closed before paying. If you did pay, it shows under Your payments and arrives by itself.");
    }
    const done = await confirmTopUp(r.reference).catch(() => ({ ok: false as const, error: "The connection blinked." }));
    setBusy(null);
    if (!done.ok) return setError("Paystack is still confirming it. It arrives by itself: see Your payments below.");
    paid(done.mint ?? 0, !!done.doubled, "pack" in done ? done.pack : undefined);
  };
  /** The two ways to pay for the picked option, or the transfer under way. */
  const ways = (id: string | null) => (
    <>
      {id && !transfer && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button disabled={!!busy} onClick={() => void byTransfer(id)} className="flex h-12 flex-col items-center justify-center rounded-2xl bg-[#1c7ed6] text-white shadow disabled:opacity-50">
            <span className="text-sm font-bold">{busy === "transfer" ? "Getting account…" : "🏦 Bank transfer"}</span>
            <span className="text-[10px] text-white/80">Right here in the game</span>
          </button>
          <button disabled={!!busy} onClick={() => void byCard(id)} className="flex h-12 flex-col items-center justify-center rounded-2xl bg-ink text-white shadow disabled:opacity-50">
            <span className="text-sm font-bold">{busy === "card" ? "Opening…" : "💳 Card & more"}</span>
            <span className="text-[10px] text-white/70">Card, USSD, bank app</span>
          </button>
        </div>
      )}
      {transfer && <TransferBox reference={transfer.reference} account={transfer.account} onPaid={(mint, doubled, pack) => paid(mint, doubled, pack)} onCancel={() => setTransfer(null)} />}
      {error && <p className="mt-1 text-xs text-hit">{error}</p>}
    </>
  );
  return { busy, transfer, setError, ways };
}

/** Top up: pick an amount, then pay by bank transfer (right here) or by card and more (Paystack's box). */
function TopUps({ region, perMint, onToppedUp }: { region: string; perMint: number; onToppedUp: (mint: number, doubled: boolean, pack?: string) => void }) {
  const [before, setBefore] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void toppedUpBefore()
      .then((b) => alive && setBefore(b))
      .catch(() => alive && setBefore(true));
    return () => {
      alive = false;
    };
  }, []);
  const pay = usePay(region, (mint, doubled, pack) => {
    setPicked(null);
    if (!pack) setBefore(true);
    onToppedUp(mint, doubled, pack);
  });
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between text-xs">
        <b className="uppercase tracking-wide text-muted">Top up</b>
        {before === false && <span className="font-semibold text-[#2b8a3e]">Your first top-up is doubled!</span>}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {TOPUPS.map((t) => (
          <button
            key={t.id}
            disabled={!!pay.busy || !!pay.transfer}
            onClick={() => {
              setPicked(picked === t.id ? null : t.id);
              pay.setError(null);
            }}
            className={`relative rounded-xl px-1.5 py-2 text-center shadow-sm ring-1 disabled:opacity-50 ${picked === t.id ? "bg-ink text-white ring-ink" : "bg-white ring-ink/10"}`}
          >
            {t.bonus > 0 && <span className="absolute -top-1.5 right-1 rounded-full bg-gold px-1 text-[9px] font-bold text-ink">+{t.bonus}%</span>}
            <span className="block text-sm font-extrabold tabular-nums">{cash(t.game / perMint)}</span>
            <span className={`block text-[11px] ${picked === t.id ? "text-white/75" : "text-muted"}`}>₦{t.naira.toLocaleString("en-GB")}</span>
          </button>
        ))}
      </div>
      {pay.ways(picked)}
    </div>
  );
}

/** "Offer ends in 2 days 5 hours" (to the minute in the last hour), ticking down. */
function PackCountdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, endsAt - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.ceil((left % 3_600_000) / 60_000);
  const words = h >= 24 ? `${Math.floor(h / 24)} day${h >= 48 ? "s" : ""} ${h % 24} hour${h % 24 === 1 ? "" : "s"}` : h >= 1 ? `${h} hour${h === 1 ? "" : "s"} ${m} min` : `${m} min`;
  return <b>Offer ends in {words}.</b>;
}

/**
 * Starter packs (docs/PACKS.md): once, in your first 72 hours (game-db/105), start with ₦20m, ₦80m or
 * ₦300m instead of ₦2m (and the pack's gifts). Paid like a top-up, so it can't get lost.
 */
function StarterPacks({ region, perMint, open, onPaid }: { region: string; perMint: number; open?: boolean; onPaid: (mint: number, doubled: boolean, pack?: string) => void }) {
  const [status, setStatus] = useState<"open" | "had" | "too_late" | null | undefined>(undefined);
  /** When the offer ends (72 hours after joining), for the countdown. */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState(!!open);
  useEffect(() => {
    let alive = true;
    void myPackStatus()
      .then((s) => {
        if (!alive) return;
        setStatus(s?.status ?? null);
        setEndsAt(s?.endsAt ? Date.parse(s.endsAt) : null);
      })
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, []);
  const pay = usePay(region, (mint, doubled, pack) => {
    setPicked(null);
    setStatus("had");
    onPaid(mint, doubled, pack);
  });
  if (status !== "open") return null;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#fff9db] to-[#ffe8cc] p-3 ring-1 ring-[#f59f00]/30">
      <button onClick={() => setShown((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span>
          <b className="block text-sm">🎁 Starter packs</b>
          <span className="block text-xs text-[#5c4400]">Start richer, once. {endsAt ? <PackCountdown endsAt={endsAt} /> : "Only for your first 72 hours."}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 transition ${shown ? "rotate-180" : ""}`} />
      </button>
      {shown && (
        <>
          <div className="mt-2 space-y-1.5">
            {PAID_PACKS.map((p) => (
              <button
                key={p.id}
                disabled={!!pay.busy || !!pay.transfer}
                onClick={() => {
                  setPicked(picked === p.id ? null : p.id);
                  pay.setError(null);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left shadow-sm ring-1 disabled:opacity-50 ${picked === p.id ? "bg-ink text-white ring-ink" : "bg-white ring-ink/10"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold opacity-70">
                    {p.label} · {p.story}
                  </span>
                  <span className="block font-display text-lg font-extrabold leading-tight tabular-nums">Start with {cash(p.game / perMint)}</span>
                  {p.perks.length > 0 && <span className="block truncate text-[11px] opacity-70">+ {p.perks.join(" · ")}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${picked === p.id ? "bg-gold text-ink" : "bg-ink/5"}`}>₦{p.naira.toLocaleString("en-GB")}</span>
              </button>
            ))}
          </div>
          {pay.ways(picked ? `pack_${picked}` : null)}
        </>
      )}
    </div>
  );
}

const STATUS: Record<TopUpRow["status"], { label: string; cls: string }> = {
  paid: { label: "Paid ✓", cls: "bg-[#ebfbee] text-[#2b8a3e]" },
  waiting: { label: "Waiting for Paystack", cls: "bg-gold/20 text-gold-dark" },
  failed: { label: "Not paid", cls: "bg-ink/5 text-muted" },
};

/** Your payments: every top-up and where it's got to (any stuck one is checked again and given when it went through). */
function Payments({ list, onCheck, checking }: { list: TopUpRow[] | null; onCheck: () => void; checking: boolean }) {
  const [open, setOpen] = useState(false);
  if (!list || list.length === 0) return null;
  const waiting = list.filter((p) => p.status === "waiting").length;
  return (
    <div className="mt-3 rounded-2xl ring-1 ring-ink/10">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm">
        <b>🧾 Your payments</b>
        <span className="flex items-center gap-1 text-xs text-muted">
          {waiting > 0 && <span className="rounded-full bg-gold/20 px-1.5 font-semibold text-gold-dark">{waiting} waiting</span>}
          <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-ink/5 px-3 pb-3">
          <ul className="divide-y divide-ink/5">
            {list.map((p) => (
              <li key={p.reference} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="block">₦{p.naira.toLocaleString("en-GB")} → {cash(p.mint)}</b>
                  <span className="block truncate text-[11px] text-muted">
                    {new Date(p.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {p.reference}
                    {p.doubled ? " · doubled" : ""}
                    {p.pack ? " · starter pack" : ""}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
              </li>
            ))}
          </ul>
          {waiting > 0 && (
            <button disabled={checking} onClick={onCheck} className="mt-2 h-9 w-full rounded-full bg-ink text-xs font-bold text-white disabled:opacity-50">
              {checking ? "Checking with Paystack…" : "Check again"}
            </button>
          )}
          <p className="mt-2 text-[11px] text-muted">Paid but not showing? It&apos;s checked with Paystack every time you open your Wallet. Still stuck after an hour? Send us the reference.</p>
        </div>
      )}
    </div>
  );
}

/** The World Bank: everything players pay the city (fares, bills, taxes, shopping, games…). Stealing from it is coming soon. */
function WorldBank() {
  const [bank, setBank] = useState<{ balance: number; today: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void fetch("/api/world-bank", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ balance: number; today: number } | null>) : null))
        .then((b) => alive && b && setBank(b))
        .catch(() => {});
    load();
    const stop = whileHere(load, 15_000);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  if (!bank) return null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#343a40] to-[#212529] p-3 text-white">
      <span className="text-3xl">🏦</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/70">World Bank</span>
        <b className="block font-display text-xl tabular-nums">{cash(bank.balance)}</b>
        <span className="block text-[11px] text-white/70">From everything spent in town{bank.today > 0 ? ` · +${cash(bank.today)} today` : ""}</span>
      </span>
      <button disabled className="shrink-0 rounded-full bg-hit/90 px-3 py-2 text-xs font-bold" title="Coming soon">
        🦹 Steal <span className="block text-[9px] font-semibold opacity-80">Coming soon</span>
      </button>
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
  packsOpen,
  inline,
}: {
  coins: number;
  perMint: number;
  /** The map you're on (top-ups are bought for it). */
  region: string;
  onClose: () => void;
  /** The gift was taken (the cash at the top goes up). */
  onTaken: () => void;
  /** A top-up (or a starter pack) arrived. */
  onToppedUp: (mint: number, doubled: boolean, pack?: string) => void;
  /** Your assets: your property and what it earns. */
  onProperty: () => void;
  /** Opened to buy a starter pack: show the packs unfolded. */
  packsOpen?: boolean;
  /** Lite's Wallet tab (docs/LITE.md): drawn on the page, under Lite's own balance, not as a pop-up. */
  inline?: boolean;
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
  // Your payments: any stuck one is checked with Paystack again (and given) each time the Wallet opens.
  const [payments, setPayments] = useState<TopUpRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const checkPayments = async () => {
    setChecking(true);
    const r = await fetch("/api/topups", { cache: "no-store" })
      .then((x) => (x.ok ? (x.json() as Promise<{ list: TopUpRow[]; credited: number } | null>) : null))
      .catch(() => null);
    setChecking(false);
    if (!r) return;
    setPayments(r.list);
    if (r.credited > 0) onToppedUp(r.credited, false);
  };
  useEffect(() => {
    void checkPayments();
    // Once, when the Wallet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const body = (
    <>
      {inline ? (
        today > 0 && <p className="mb-2 text-center text-sm font-semibold text-me">+{cash(today / perMint)} today</p>
      ) : (
        <div className="flex items-end justify-between rounded-2xl bg-ink px-4 py-3 text-white">
          <p className="font-display text-3xl font-extrabold tabular-nums">{cash(coins, { exact: true, full: true })}</p>
          {today > 0 && <p className="text-xs font-semibold text-[#8ce99a]">+{cash(today / perMint)} today</p>}
        </div>
      )}
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
            Your property earns <b className="text-[#2b8a3e]">{cash(income.perDay)} a day</b>, even if you&apos;re offline.
          </span>
        ) : (
          <span className="min-w-0 flex-1">Buy property and it pays you every day, by itself.</span>
        )}
        <span className="shrink-0 text-xs font-semibold text-[#2b8a3e]">Assets →</span>
      </button>
      {/* Investing (stocks, savings that grow, funds): not built yet, shown so people know it's coming. */}
      <div aria-disabled className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-ink/5 px-3 py-2 text-left text-sm text-muted">
        <TrendingUp className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <b className="text-ink">Invest</b> your money and watch it grow.
        </span>
        <span className="shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-bold text-gold-dark">Coming soon</span>
      </div>
      <div className="mt-3">
        {view === undefined ? (
          <div className="h-16 animate-pulse rounded-2xl bg-ink/5" />
        ) : view?.gift ? (
          <GiftBox view={view.gift} perMint={perMint} onTaken={onTaken} />
        ) : null}
      </div>
      <div className="mt-3">
        <StarterPacks
          region={region}
          perMint={perMint}
          open={packsOpen}
          onPaid={(mint, doubled, pack) => {
            onToppedUp(mint, doubled, pack);
            void checkPayments();
          }}
        />
      </div>
      <div className="mt-3" id="nt-topups">
        <TopUps
          region={region}
          perMint={perMint}
          onToppedUp={(mint, doubled, pack) => {
            onToppedUp(mint, doubled, pack);
            void checkPayments();
          }}
        />
      </div>
      <Payments list={payments} onCheck={() => void checkPayments()} checking={checking} />
      <WorldBank />
    </>
  );
  if (inline) return body;
  return (
    <Sheet onClose={onClose} title="Wallet" above>
      {body}
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
