"use client";

import { useEffect, useMemo, useState } from "react";
import type { RegionMap } from "@/lib/world/compile";
import { BUDGET_PRESETS, POT_INFO, POTS, type Budget, type Pot } from "@/lib/world/living";
import type { OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, AssetUnit, LifeStatus, MoneyFlow } from "@/lib/world/property-api";
import { cash, CURRENCIES, shownCurrency } from "@/lib/world/value";
import { Sheet } from "../sheet";
import { AssetsBody, unitValueNow, type Owning } from "./assets-sheet";

export type Tab = "home" | "budget" | "property";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Overview" },
  { id: "budget", label: "Budget" },
  { id: "property", label: "Property" },
];

/** Where money came from, by the ledger's kinds. */
const INCOME: { label: string; kinds: string[]; colour: string }[] = [
  { label: "Job", kinds: ["work_pay", "public_pay", "bonus"], colour: "#2f9e44" },
  { label: "Side hustle", kinds: ["hustle_pay"], colour: "#d6336c" },
  { label: "Rent", kinds: ["rent"], colour: "#37b24d" },
  { label: "Property sold", kinds: ["property_sale"], colour: "#495057" },
];
/** Where it went. */
const EXPENSES: { label: string; kinds: string[]; colour: string }[] = [
  { label: "Tax", kinds: ["income_tax", "rent_tax", "vat", "sale_tax"], colour: "#7048e8" },
  { label: "Bills", kinds: ["power_bill", "waste_bill"], colour: "#f59f00" },
  { label: "Getting to work", kinds: ["commute"], colour: "#f08c00" },
  { label: "Health", kinds: ["health_care", "gym"], colour: "#e03131" },
  { label: "Education", kinds: ["school_fees"], colour: "#1971c2" },
  { label: "Looks", kinds: ["procedure"], colour: "#d6336c" },
  { label: "Loan", kinds: ["loan_repay"], colour: "#0c8599" },
  { label: "Side hustle", kinds: ["hustle_start"], colour: "#868e96" },
  { label: "Property bought", kinds: ["property_buy", "property_tax"], colour: "#495057" },
];

/** Finance: what you're worth, what came in and went out, your budget, your property, your currency. */
export function MoneySheet({
  status,
  assets,
  owned,
  region,
  busy,
  loadMoney,
  onBudget,
  onCollect,
  onShow,
  onClose,
  owning,
  startTab,
  glowBudget,
  currency,
  onCurrency,
}: {
  status: LifeStatus | null;
  assets: AssetsData;
  owned: OwnedProperty[];
  region: RegionMap;
  busy: boolean;
  loadMoney: (hours: number) => Promise<MoneyFlow>;
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
}) {
  const [tab, setTab] = useState<Tab>(startTab ?? "home");
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
            <Flow loadMoney={loadMoney} />
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

const PERIODS = [
  { hours: 24, label: "Today" },
  { hours: 168, label: "This week" },
];

/** Income and expenses over a period, each in its own tab with its total. */
/** The last income and expenses seen for each period: shown at once next time while fresh ones load. */
const flowSeen = new Map<number, MoneyFlow>();

function Flow({ loadMoney }: { loadMoney: (hours: number) => Promise<MoneyFlow> }) {
  const [hours, setHours] = useState(24);
  const [side, setSide] = useState<"in" | "out">("in");
  const [got, setGot] = useState<{ hours: number; money: MoneyFlow } | null>(() => (flowSeen.has(24) ? { hours: 24, money: flowSeen.get(24)! } : null));
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
  const pick = (h: number) => {
    setHours(h);
    // What we saw last time for that period, straight away.
    const seen = flowSeen.get(h);
    if (seen) setGot({ hours: h, money: seen });
  };
  const sum = (kinds: string[]) => kinds.reduce((t, k) => t + (got?.money[k] ?? 0), 0);
  const ins = useMemo(() => INCOME.map((g) => ({ ...g, v: sum(g.kinds) })).filter((g) => g.v > 0.004), [got]); // eslint-disable-line react-hooks/exhaustive-deps
  const outs = useMemo(() => EXPENSES.map((g) => ({ ...g, v: -sum(g.kinds) })).filter((g) => g.v > 0.004), [got]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalIn = ins.reduce((t, g) => t + g.v, 0);
  const totalOut = outs.reduce((t, g) => t + g.v, 0);
  const rows = side === "in" ? ins : outs;
  const total = side === "in" ? totalIn : totalOut;
  const loading = !got || got.hours !== hours;
  return (
    <div className="mt-4">
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button key={p.hours} onClick={() => pick(p.hours)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${hours === p.hours ? "bg-ink text-white" : "bg-ink/5"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
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
