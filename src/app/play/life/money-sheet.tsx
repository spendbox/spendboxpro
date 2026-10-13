"use client";

import { useEffect, useMemo, useState } from "react";
import type { RegionMap } from "@/lib/world/compile";
import { BUDGET_PRESETS, POT_INFO, POTS, type Budget, type Pot } from "@/lib/world/living";
import type { OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, AssetUnit, LifeStatus, MoneyDay, MoneyFlow } from "@/lib/world/property-api";
import { cash, CURRENCIES, shownCurrency } from "@/lib/world/value";
import { Sheet } from "../sheet";
import { AssetsBody, unitValueNow, type Owning } from "./assets-sheet";
import { MoneyChart, UpOrDown, useMoneyDays } from "./money-chart";
import { earnings as loadEarnings, spending as loadSpending, type Earnings, type Earning } from "../living-actions";

export type Tab = "home" | "stats" | "budget" | "property";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Overview" },
  { id: "stats", label: "Stats" },
  { id: "budget", label: "Budget" },
  { id: "property", label: "Property" },
];

/** Where money came from, by the ledger's kinds. */
const INCOME: { label: string; kinds: string[]; colour: string }[] = [
  { label: "Job", kinds: ["work_pay", "public_pay", "bonus"], colour: "#2f9e44" },
  { label: "Side hustle", kinds: ["hustle_pay"], colour: "#d6336c" },
  { label: "Rent", kinds: ["rent"], colour: "#37b24d" },
  { label: "Property sold", kinds: ["property_sale"], colour: "#495057" },
  { label: "Things and cars sold", kinds: ["item_sale", "car_sale"], colour: "#7048e8" },
  { label: "Services", kinds: ["service_pay"], colour: "#1971c2" },
];
/** Where it went. */
const EXPENSES: { label: string; kinds: string[]; colour: string }[] = [
  { label: "Tax", kinds: ["income_tax", "rent_tax", "vat", "sale_tax"], colour: "#7048e8" },
  { label: "Bills and food", kinds: ["power_bill", "waste_bill", "food"], colour: "#f59f00" },
  { label: "Getting to work", kinds: ["commute"], colour: "#f08c00" },
  { label: "Health", kinds: ["health_care", "gym"], colour: "#e03131" },
  { label: "Education", kinds: ["school_fees"], colour: "#1971c2" },
  { label: "Looks", kinds: ["procedure"], colour: "#d6336c" },
  { label: "Loan", kinds: ["loan_repay"], colour: "#0c8599" },
  { label: "Side hustle", kinds: ["hustle_start"], colour: "#868e96" },
  { label: "Property bought", kinds: ["property_buy", "property_tax"], colour: "#495057" },
  { label: "Things and cars bought", kinds: ["item_buy", "car_buy", "craft_cost"], colour: "#7048e8" },
  { label: "Market fees and fines", kinds: ["market_fee", "item_tax", "fine"], colour: "#868e96" },
];

/** Finance: what you're worth, what came in and went out, your budget, your property, your currency. */
export function MoneySheet({
  status,
  assets,
  owned,
  region,
  busy,
  loadMoney,
  loadDays,
  onBudget,
  onCollect,
  onShow,
  onClose,
  owning,
  startTab,
  glowBudget,
  currency,
  onCurrency,
  payday,
}: {
  status: LifeStatus | null;
  assets: AssetsData;
  owned: OwnedProperty[];
  region: RegionMap;
  busy: boolean;
  loadMoney: (hours: number) => Promise<MoneyFlow>;
  /** Your money day by day, for "am I up or down?" and its chart. */
  loadDays: (days: number) => Promise<MoneyDay[]>;
  onBudget: (b: Budget) => void;
  onCollect: () => void;
  onShow: (u: AssetUnit) => void;
  onClose: () => void;
  owning: Owning;
  /** Open on this tab (the Property tab when there are offers to answer). */
  startTab?: Tab;
  /** The guide's next step: set your budget (the Save button glows, and works without a change). */
  glowBudget?: boolean;
  /** The currency money is shown in, and choosing it. */
  currency: string;
  onCurrency: (code: string) => void;
  /** Your next pay: when (null: no job, only hustles), and about how much from the job and hustles. */
  payday?: { at: number | null; job: number; hustles: number; title: string | null } | null;
}) {
  const [tab, setTab] = useState<Tab>(startTab ?? "home");
  const [side, setSide] = useState<"in" | "out">("in");
  // Real days (not the 2-hour days of your life): the last week or month.
  const [period, setPeriod] = useState<7 | 30>(7);
  const days = useMoneyDays(loadDays, period);
  const property = assets.units.reduce((t, u) => t + unitValueNow(u, owned, region), 0);
  const wallet = status?.wallet ?? assets.coins;
  // Money set aside by the budget counts as cash: it's yours to spend on what it's for.
  const aside = POTS.reduce((t, p) => t + (status?.pots[p] ?? 0), 0);
  const cashNow = wallet + aside;
  const worth = cashNow + property;
  const owed = (status?.powerOwed ?? 0) + (status?.wasteOwed ?? 0);
  return (
    <Sheet onClose={onClose} wide title="Finance">
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`relative h-8 flex-1 rounded-full text-xs font-semibold transition ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}>
            {t.label}
            {t.id === "property" && (owning.board?.received.some((o) => o.status === "open") ?? false) && <span className="absolute right-2 top-1.5 size-2 rounded-full bg-hit" />}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "home" && (
          <>
            <Payday payday={payday ?? null} />
            <div className="mb-3 flex gap-1 rounded-full bg-ink/5 p-1">
              {(
                [
                  ["in", "Money in"],
                  ["out", "Money out"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} onClick={() => setSide(id)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${side === id ? "bg-panel shadow-sm" : "text-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
            {side === "in" ? <Earned /> : <Spent onStats={() => setTab("stats")} />}
          </>
        )}
        {tab === "stats" && (
          <div>
            <div className="rounded-3xl bg-gradient-to-br from-gold/25 to-me/10 p-4 text-center">
              <p className="text-sm text-muted">Net worth</p>
              <p className="font-display text-3xl font-extrabold tabular-nums sm:text-4xl">{cash(worth, { full: true })}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span>
                  <b className="block text-sm tabular-nums">{cash(cashNow, { full: true })}</b>
                  <span className="text-muted">Cash</span>
                </span>
                <span>
                  <b className="block text-sm tabular-nums">{cash(property, { full: true })}</b>
                  <span className="text-muted">Assets</span>
                </span>
              </div>
            </div>
            {(owed > 0.004 || status?.powerCut) && (
              <p className="mt-3 rounded-xl bg-hit/10 px-3 py-2 text-xs font-semibold text-hit">
                {status?.powerCut ? "Power cut: pay your bills to get the lights back. " : ""}
                {owed > 0.004 ? `${cash(owed)} in bills unpaid.` : ""}
              </p>
            )}
            <div className="mt-5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Are you up or down?</span>
              <div className="flex gap-1 rounded-full bg-ink/5 p-1">
                {([7, 30] as const).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className={`h-7 rounded-full px-3 text-xs font-semibold ${period === p ? "bg-panel shadow-sm" : "text-muted"}`}>
                    {p === 7 ? "7 days" : "30 days"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2">
              <UpOrDown days={days} label={period === 7 ? "this week" : "this month"} />
            </div>
            <MoneyChart days={days} />
            <Flow loadMoney={loadMoney} hours={period * 24} />
            <div className="mt-5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Show money in</span>
              <select value={currency} onChange={(e) => onCurrency(e.target.value)} className="h-9 rounded-full bg-ink/5 px-3 text-sm font-semibold" aria-label="Currency">
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.name}
                  </option>
                ))}
              </select>
            </div>
            {shownCurrency() !== "NGN" && shownCurrency() !== "MINT" && <p className="mt-1 text-right text-[11px] text-muted">Rates are rough. Payments are in naira.</p>}
          </div>
        )}
        {tab === "budget" && status && <BudgetTab budget={status.budget} busy={busy} onSave={onBudget} first={glowBudget} />}
        {tab === "property" && <AssetsBody assets={assets} owned={owned} region={region} busy={busy} owning={owning} onCollect={onCollect} onShow={onShow} />}
      </div>
    </Sheet>
  );
}

/** The next pay into your wallet: a live countdown and what's coming. */
function Payday({ payday }: { payday: { at: number | null; job: number; hustles: number; title: string | null } | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!payday) return <p className="mb-3 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-muted">No payday yet: get a job or start a side hustle from Income.</p>;
  const left = payday.at === null ? null : payday.at - now;
  const clock = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
  };
  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">Next payday</p>
        <p className="font-display text-xl font-extrabold tabular-nums">{left === null ? "Every 14 hours" : left > 0 ? clock(left) : "Any moment now"}</p>
        {payday.title && <p className="truncate text-[11px] text-white/60">{payday.title}</p>}
      </div>
      <div className="text-right">
        <p className="text-[11px] text-white/60">Expecting about</p>
        <p className="font-display text-lg font-extrabold tabular-nums text-gold">{cash(payday.job + payday.hustles)}</p>
        <p className="text-[10px] text-white/50">after tax and fares{payday.hustles > 0 && payday.job > 0 ? ", hustles included" : ""}</p>
      </div>
    </div>
  );
}

/** Earnings seen for each period: shown at once next time while fresh ones load. */
const earnedSeen = new Map<number, Earnings>();
const EARN_PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 3650, label: "All" },
] as const;
const kindLabel = (kind: string) => INCOME.find((g) => g.kinds.includes(kind));

/** What you've earned: the total, and each payment in like a pay slip, filtered by where it came from. */
function Earned() {
  const [days, setDays] = useState<number>(30);
  const [filter, setFilter] = useState<string>("all");
  const [got, setGot] = useState<{ days: number; e: Earnings } | null>(() => (earnedSeen.has(30) ? { days: 30, e: earnedSeen.get(30)! } : null));
  useEffect(() => {
    let alive = true;
    void loadEarnings(days).then((e) => {
      if (!e) return;
      earnedSeen.set(days, e);
      if (alive) setGot({ days, e });
    });
    return () => {
      alive = false;
    };
  }, [days]);
  const shown = got && got.days === days ? got.e : (earnedSeen.get(days) ?? null);
  const entries = (shown?.entries ?? []).filter((x) => filter === "all" || kindLabel(x.kind)?.label === filter);
  const kinds = INCOME.filter((g) => (shown?.entries ?? []).some((x) => g.kinds.includes(x.kind)));
  const filtered = entries.reduce((t, x) => t + x.amount, 0);
  return (
    <div>
      <div className="rounded-3xl bg-gradient-to-br from-me/20 to-gold/20 p-4 text-center">
        <p className="text-sm text-muted">You&apos;ve earned</p>
        <p className="font-display text-3xl font-extrabold tabular-nums text-me sm:text-4xl">{shown ? cash(shown.total, { full: true }) : "…"}</p>
        <p className="mt-1 text-xs text-muted">in all since you started, before tax{shown && days < 3650 ? ` · ${cash(shown.period)} in the last ${days} days` : ""}</p>
        {shown && shown.tax > 0 && (
          <p className="mt-1 text-xs">
            Tax paid {cash(shown.tax)} · <b>you kept {cash(Math.max(0, shown.total - shown.tax))}</b>
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Money in</span>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1">
          {EARN_PERIODS.map((p) => (
            <button key={p.days} onClick={() => setDays(p.days)} className={`h-7 rounded-full px-3 text-xs font-semibold ${days === p.days ? "bg-panel shadow-sm" : "text-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {kinds.length > 1 && (
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ label: "all", colour: "#212529" }, ...kinds].map((g) => (
            <button key={g.label} onClick={() => setFilter(g.label)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${filter === g.label ? "bg-ink text-white" : "bg-ink/5"}`}>
              {g.label !== "all" && <span className="size-2 rounded-full" style={{ background: g.colour }} />}
              {g.label === "all" ? "All" : g.label}
            </button>
          ))}
        </div>
      )}
      {!shown ? (
        <p className="mt-3 text-xs text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-muted">Nothing came in {days < 3650 ? `in the last ${days} days` : "yet"}. Get a job or a side hustle from Income, or let a flat.</p>
      ) : (
        <>
          {filter !== "all" && <p className="mt-2 text-xs text-muted">{entries.length} payment{entries.length === 1 ? "" : "s"} · {cash(filtered)}</p>}
          <ul className="mt-2 divide-y divide-ink/5 rounded-2xl bg-ink/[0.03]">
            {entries.map((x) => {
              const g = kindLabel(x.kind);
              return (
                <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: g?.colour ?? "#868e96" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{x.note || g?.label || "Money in"}</span>
                    <span className="block text-[11px] text-muted">
                      {g?.label ?? "Other"} · {new Date(x.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-me">+{cash(x.amount)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** What went out: the total, and each payment, filtered by what it was for. Stats one tap away. */
const spentSeen = new Map<number, { total: number; entries: Earning[] }>();
const spentKind = (kind: string) => EXPENSES.find((g) => g.kinds.includes(kind));
function Spent({ onStats }: { onStats: () => void }) {
  const [days, setDays] = useState<number>(30);
  const [filter, setFilter] = useState<string>("all");
  const [got, setGot] = useState<{ days: number; s: { total: number; entries: Earning[] } } | null>(() => (spentSeen.has(30) ? { days: 30, s: spentSeen.get(30)! } : null));
  useEffect(() => {
    let alive = true;
    void loadSpending(days).then((s) => {
      if (!s) return;
      spentSeen.set(days, s);
      if (alive) setGot({ days, s });
    });
    return () => {
      alive = false;
    };
  }, [days]);
  const shown = got && got.days === days ? got.s : (spentSeen.get(days) ?? null);
  const label = (kind: string) => spentKind(kind)?.label ?? (kind === "fine" ? "Fines" : kind === "mark" ? "Marks on the map" : kind === "prank" ? "Pranks" : kind === "stolen" ? "Stolen from you" : "Other");
  const entries = (shown?.entries ?? []).filter((x) => filter === "all" || label(x.kind) === filter);
  const groups = [...new Set((shown?.entries ?? []).map((x) => label(x.kind)))];
  return (
    <div>
      <div className="rounded-3xl bg-gradient-to-br from-hit/15 to-gold/10 p-4 text-center">
        <p className="text-sm text-muted">Money out</p>
        <p className="font-display text-3xl font-extrabold tabular-nums text-hit sm:text-4xl">{shown ? cash(shown.total, { full: true }) : "…"}</p>
        <p className="mt-1 text-xs text-muted">{days < 3650 ? `in the last ${days} days` : "since you started"} · tax, bills, fares, things you bought</p>
        <button onClick={onStats} className="mt-2 text-xs font-semibold text-gold-dark underline">
          See your stats: are you up or down?
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Each payment</span>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1">
          {EARN_PERIODS.map((p) => (
            <button key={p.days} onClick={() => setDays(p.days)} className={`h-7 rounded-full px-3 text-xs font-semibold ${days === p.days ? "bg-panel shadow-sm" : "text-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {groups.length > 1 && (
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {["all", ...groups].map((g) => (
            <button key={g} onClick={() => setFilter(g)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${filter === g ? "bg-ink text-white" : "bg-ink/5"}`}>
              {g === "all" ? "All" : g}
            </button>
          ))}
        </div>
      )}
      {!shown ? (
        <p className="mt-3 text-xs text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-muted">Nothing went out {days < 3650 ? `in the last ${days} days` : "yet"}.</p>
      ) : (
        <ul className="mt-2 divide-y divide-ink/5 rounded-2xl bg-ink/[0.03]">
          {entries.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: spentKind(x.kind)?.colour ?? "#868e96" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{x.note || label(x.kind)}</span>
                <span className="block text-[11px] text-muted">
                  {label(x.kind)} · {new Date(x.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-hit">−{cash(x.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Income and expenses over a period, each in its own tab with its total. */
/** The last income and expenses seen for each period: shown at once next time while fresh ones load. */
const flowSeen = new Map<number, MoneyFlow>();

function Flow({ loadMoney, hours }: { loadMoney: (hours: number) => Promise<MoneyFlow>; hours: number }) {
  const [side, setSide] = useState<"in" | "out">("in");
  const [got, setGot] = useState<{ hours: number; money: MoneyFlow } | null>(() => (flowSeen.has(hours) ? { hours, money: flowSeen.get(hours)! } : null));
  useEffect(() => {
    let alive = true;
    void loadMoney(hours).then((money) => {
      flowSeen.set(hours, money);
      if (alive) setGot({ hours, money });
    });
    return () => {
      alive = false;
    };
  }, [loadMoney, hours]);
  const shownNow = got && got.hours === hours ? got : flowSeen.has(hours) ? { hours, money: flowSeen.get(hours)! } : null;
  const loading = !shownNow;
  const sum = (kinds: string[]) => kinds.reduce((t, k) => t + (shownNow?.money[k] ?? 0), 0);
  const ins = useMemo(() => INCOME.map((g) => ({ ...g, v: sum(g.kinds) })).filter((g) => g.v > 0.004), [shownNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const outs = useMemo(() => EXPENSES.map((g) => ({ ...g, v: -sum(g.kinds) })).filter((g) => g.v > 0.004), [shownNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalIn = ins.reduce((t, g) => t + g.v, 0);
  const totalOut = outs.reduce((t, g) => t + g.v, 0);
  const rows = side === "in" ? ins : outs;
  const total = side === "in" ? totalIn : totalOut;
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-semibold">Where it came from, where it went</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["in", "Income", totalIn, "text-me"],
            ["out", "Expenses", totalOut, "text-hit"],
          ] as const
        ).map(([id, label, v, tone]) => (
          <button key={id} onClick={() => setSide(id)} className={`rounded-2xl p-3 text-left ring-2 ${side === id ? "bg-panel ring-ink/20" : "bg-ink/[0.04] ring-transparent"}`}>
            <span className="block text-xs text-muted">{label}</span>
            <span className={`block font-display text-lg font-extrabold tabular-nums ${tone}`}>{loading ? "…" : cash(v)}</span>
          </button>
        ))}
      </div>
      {!loading && (
        <ul className="mt-3 space-y-1.5">
          {rows.length === 0 && <li className="text-xs text-muted">{side === "in" ? "Nothing came in yet." : "Nothing went out yet."}</li>}
          {rows.map((g) => (
            <li key={g.label} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-muted">{g.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (g.v / Math.max(total, 1e-9)) * 100)}%`, background: g.colour }} />
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums">{cash(g.v)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BudgetTab({ budget, busy, onSave, first }: { budget: Budget; busy: boolean; onSave: (b: Budget) => void; first?: boolean }) {
  const [b, setB] = useState<Budget>(budget);
  const used = POTS.reduce((t, p) => t + b[p], 0);
  const changed = POTS.some((p) => b[p] !== budget[p]);
  const set = (p: Pot, v: number) => setB({ ...b, [p]: Math.max(0, Math.min(100 - (used - b[p]), Math.round(v))) });
  return (
    <div>
      <p className="text-sm text-muted">How each pay is shared out: set aside for bills, fares, savings and treats, the rest to spend.</p>
      <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-ink/5">
        {POTS.map((p) => (
          <div key={p} style={{ width: `${b[p]}%`, background: POT_INFO[p].colour }} />
        ))}
        <div style={{ width: `${100 - used}%`, background: POT_INFO.wallet.colour }} className="opacity-60" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {BUDGET_PRESETS.map((pr) => (
          <button key={pr.id} onClick={() => setB(pr.budget)} className="h-8 rounded-full bg-ink/5 px-3 text-xs font-semibold hover:bg-ink/10">
            {pr.label}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {POTS.map((p) => (
          <li key={p} className="flex items-center gap-3 text-sm">
            <span className="flex w-24 shrink-0 items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: POT_INFO[p].colour }} />
              {POT_INFO[p].label}
            </span>
            <input type="range" min={0} max={100} value={b[p]} onChange={(e) => set(p, Number(e.target.value))} className="flex-1" style={{ accentColor: POT_INFO[p].colour }} aria-label={POT_INFO[p].label} />
            <span className="w-10 text-right font-semibold tabular-nums">{b[p]}%</span>
          </li>
        ))}
        <li className="flex items-center gap-3 text-sm">
          <span className="flex w-24 shrink-0 items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: POT_INFO.wallet.colour }} />
            To spend
          </span>
          <span className="flex-1 text-xs text-muted">the rest</span>
          <span className="w-10 text-right font-semibold tabular-nums">{100 - used}%</span>
        </li>
      </ul>
      <button
        disabled={busy || (!changed && !first)}
        onClick={() => onSave(b)}
        className={`relative mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40 ${first ? "ring-2 ring-gold" : ""}`}
      >
        {first && !changed ? "Keep this budget" : "Save"}
        {first && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-full ring-4 ring-gold/60" />}
      </button>
    </div>
  );
}
