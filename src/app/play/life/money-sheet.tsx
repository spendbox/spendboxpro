"use client";

import { useEffect, useMemo, useState } from "react";
import type { RegionMap } from "@/lib/world/compile";
import { TIME_KIND } from "@/lib/world/day";
import { BUDGET_PRESETS, groupOf, MONEY_GROUP, POT_INFO, POTS, type Budget, type MoneyGroup, type Pot } from "@/lib/world/living";
import type { OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, AssetUnit, LifeStatus, MoneyFlow } from "@/lib/world/property-api";
import { mintLocal } from "@/lib/world/value";
import { Sheet } from "../sheet";
import { AssetsBody, unitValueNow, type Owning } from "./assets-sheet";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const fmt2 = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
type Prices = RegionMap["region"]["prices"];

export type Tab = "home" | "flow" | "budget" | "property";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Overview" },
  { id: "flow", label: "In & out" },
  { id: "budget", label: "Budget" },
  { id: "property", label: "Property" },
];

/** Money, kept simple: what you have, what came in and went out, your budget, your property. */
export function MoneySheet({
  status,
  assets,
  owned,
  region,
  busy,
  loadMoney,
  loadTime,
  onBudget,
  onMove,
  onCollect,
  onShow,
  onClose,
  owning,
  startTab,
  glowBudget,
}: {
  status: LifeStatus | null;
  assets: AssetsData;
  owned: OwnedProperty[];
  region: RegionMap;
  busy: boolean;
  loadMoney: (hours: number) => Promise<MoneyFlow>;
  loadTime: (hours: number) => Promise<Record<string, number>>;
  onBudget: (b: Budget) => void;
  onMove: (from: Pot | "wallet", to: Pot | "wallet", amount: number) => void;
  onCollect: () => void;
  onShow: (u: AssetUnit) => void;
  onClose: () => void;
  owning: Owning;
  /** Open on this tab (the Property tab when there are offers to answer). */
  startTab?: Tab;
  /** The guide's next step: set your budget (the Save button glows, and works without a change). */
  glowBudget?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(startTab ?? "home");
  const prices = region.region.prices;
  const property = assets.units.reduce((t, u) => t + unitValueNow(u, owned, region), 0);
  const wallet = status?.wallet ?? assets.coins;
  const pots = POTS.reduce((t, p) => t + (status?.pots[p] ?? 0), 0);
  return (
    <Sheet onClose={onClose} wide title="Money">
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`relative h-8 flex-1 rounded-full text-xs font-semibold transition ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}>
            {t.label}
            {t.id === "property" && (owning.board?.received.some((o) => o.status === "open") ?? false) && <span className="absolute right-2 top-1.5 size-2 rounded-full bg-hit" />}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "home" && <Home status={status} wallet={wallet} pots={pots} property={property} prices={prices} busy={busy} onMove={onMove} />}
        {tab === "flow" && <Flow loadMoney={loadMoney} loadTime={loadTime} prices={prices} />}
        {tab === "budget" && status && <BudgetTab budget={status.budget} busy={busy} onSave={onBudget} first={glowBudget} />}
        {tab === "property" && <AssetsBody assets={assets} owned={owned} region={region} busy={busy} owning={owning} onCollect={onCollect} onShow={onShow} />}
      </div>
    </Sheet>
  );
}

function Home({
  status,
  wallet,
  pots,
  property,
  prices,
  busy,
  onMove,
}: {
  status: LifeStatus | null;
  wallet: number;
  pots: number;
  property: number;
  prices: Prices;
  busy: boolean;
  onMove: (from: Pot | "wallet", to: Pot | "wallet", amount: number) => void;
}) {
  const worth = wallet + pots + property;
  const [moving, setMoving] = useState<Pot | "wallet" | null>(null);
  const [to, setTo] = useState<Pot | "wallet">("wallet");
  const [amount, setAmount] = useState("");
  const jars: (Pot | "wallet")[] = ["wallet", ...POTS];
  const balance = (p: Pot | "wallet") => (p === "wallet" ? wallet : (status?.pots[p] ?? 0));
  const owed = (status?.powerOwed ?? 0) + (status?.wasteOwed ?? 0);
  const bills = status?.bills ? status.bills.power + status.bills.waste : 0;
  return (
    <div>
      <div className="rounded-3xl bg-gradient-to-br from-gold/25 to-me/10 p-4 text-center">
        <p className="text-sm text-muted">You&apos;re worth</p>
        <p className="font-display text-4xl font-extrabold tabular-nums">₥{fmt(worth)}</p>
        <p className="text-sm text-muted">{mintLocal(worth, prices)}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <span>
            <b className="block text-sm tabular-nums">₥{fmt(wallet)}</b>
            <span className="text-muted">Cash</span>
          </span>
          <span>
            <b className="block text-sm tabular-nums">₥{fmt(pots)}</b>
            <span className="text-muted">In pots</span>
          </span>
          <span>
            <b className="block text-sm tabular-nums">₥{fmt(property)}</b>
            <span className="text-muted">Property</span>
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold">Pots</p>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {jars.map((p) => (
          <button
            key={p}
            onClick={() => {
              setMoving(moving === p ? null : p);
              setTo(p === "wallet" ? "savings" : "wallet");
              setAmount("");
            }}
            className={`relative overflow-hidden rounded-2xl bg-ink/[0.04] px-1 pb-2 pt-3 text-center ring-2 ${moving === p ? "ring-ink/30" : "ring-transparent"}`}
          >
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: POT_INFO[p].colour }} />
            <span className="block text-[11px] text-muted">{p === "wallet" ? "Cash" : POT_INFO[p].label}</span>
            <span className="block text-sm font-bold tabular-nums">₥{fmt(balance(p))}</span>
          </button>
        ))}
      </div>
      {moving && (
        <form
          className="mt-2 flex items-center gap-2 rounded-2xl bg-ink/[0.04] p-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(amount);
            if (v > 0) onMove(moving, to, v);
            setMoving(null);
          }}
        >
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="₥"
            className="h-8 w-20 rounded-full bg-panel px-3 tabular-nums outline-none ring-1 ring-ink/10"
            autoFocus
          />
          <span className="text-muted">to</span>
          <select value={to} onChange={(e) => setTo(e.target.value as Pot | "wallet")} className="h-8 min-w-0 flex-1 rounded-full bg-panel px-2 ring-1 ring-ink/10">
            {jars
              .filter((p) => p !== moving)
              .map((p) => (
                <option key={p} value={p}>
                  {p === "wallet" ? "Cash" : POT_INFO[p].label}
                </option>
              ))}
          </select>
          <button disabled={busy || !(Number(amount) > 0)} className="h-8 rounded-full bg-ink px-3 font-semibold text-white disabled:opacity-40">
            Move
          </button>
        </form>
      )}

      {status?.bills && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm">
          <span>Bills</span>
          <span className="text-right">
            <b className="tabular-nums">₥{fmt2(bills)}</b> <span className="text-muted">a day</span>
            {owed > 0 && <span className="block text-xs font-semibold text-hit">{status.powerCut ? "Power cut · " : ""}You owe ₥{fmt2(owed)}</span>}
          </span>
        </div>
      )}
      {(status?.payOwed ?? 0) > 0 && (
        <p className="mt-2 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm">
          The state owes you <b>₥{fmt2(status!.payOwed)}</b>
        </p>
      )}
    </div>
  );
}

const PERIODS = [
  { hours: 24, label: "Today" },
  { hours: 168, label: "This week" },
];
const IN: MoneyGroup[] = ["pay", "rent"];

function Flow({ loadMoney, loadTime, prices }: { loadMoney: (hours: number) => Promise<MoneyFlow>; loadTime: (hours: number) => Promise<Record<string, number>>; prices: Prices }) {
  const [hours, setHours] = useState(24);
  const [got, setGot] = useState<{ hours: number; money: MoneyFlow; time: Record<string, number> } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadMoney(hours), loadTime(hours)]).then(([money, time]) => alive && setGot({ hours, money, time }));
    return () => {
      alive = false;
    };
  }, [loadMoney, loadTime, hours]);
  const groups = useMemo(() => {
    const g = new Map<MoneyGroup, number>();
    for (const [kind, v] of Object.entries(got?.money ?? {})) {
      if (kind === "start_grant") continue;
      // The tax on buying property belongs with the purchase (it isn't money lost).
      const group = kind === "property_tax" ? "property" : groupOf(kind);
      g.set(group, (g.get(group) ?? 0) + v);
    }
    return g;
  }, [got]);
  const ins = IN.map((k) => [k, groups.get(k) ?? 0] as const).filter(([, v]) => v > 0.004);
  const outs = [...groups]
    .filter(([k, v]) => !IN.includes(k) && k !== "property" && k !== "borrowed" && v < -0.004)
    .map(([k, v]) => [k, -v] as const)
    .sort((a, b) => b[1] - a[1]);
  const totalIn = ins.reduce((t, [, v]) => t + v, 0);
  const totalOut = outs.reduce((t, [, v]) => t + v, 0);
  const left = totalIn - totalOut;
  const bought = -(groups.get("property") ?? 0);
  const time = Object.entries(got?.time ?? {})
    .filter(([, h]) => h >= 0.1)
    .sort((a, b) => b[1] - a[1]);
  const loading = !got || got.hours !== hours;
  return (
    <div>
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button key={p.hours} onClick={() => setHours(p.hours)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${hours === p.hours ? "bg-ink text-white" : "bg-ink/5"}`}>
            {p.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Adding it up…</p>
      ) : (
        <>
          <div className="mt-4 rounded-3xl bg-ink/[0.04] p-4 text-center">
            <p className="text-sm text-muted">{left >= 0 ? "You made" : "You lost"}</p>
            <p className={`font-display text-3xl font-extrabold tabular-nums ${left >= 0 ? "text-me" : "text-hit"}`}>₥{fmt2(Math.abs(left))}</p>
            <p className="text-sm text-muted">{mintLocal(Math.abs(left), prices)}</p>
          </div>
          <Rows title="In" total={totalIn} rows={ins.map(([k, v]) => [MONEY_GROUP[k].label, v, MONEY_GROUP[k].colour] as const)} empty="Nothing came in" />
          <Rows title="Out" total={totalOut} rows={outs.map(([k, v]) => [MONEY_GROUP[k].label, v, MONEY_GROUP[k].colour] as const)} empty="Nothing went out" />
          {bought > 0.004 && <p className="mt-3 text-xs text-muted">Also bought property: ₥{fmt2(bought)} with tax (still yours)</p>}
          {bought < -0.004 && <p className="mt-3 text-xs text-muted">Also sold property: ₥{fmt2(-bought)} after tax</p>}
          {(groups.get("borrowed") ?? 0) > 0.004 && <p className="mt-1 text-xs text-muted">Borrowed from the World Bank: ₥{fmt2(groups.get("borrowed") ?? 0)}</p>}
          {time.length > 0 && (
            <>
              <p className="mt-5 text-sm font-semibold">Your time</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {time.map(([k, h]) => (
                  <span key={k} className="flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-1 text-xs">
                    <span className="size-2 rounded-full" style={{ background: TIME_KIND[k]?.colour ?? "#868e96" }} />
                    {TIME_KIND[k]?.label ?? k} <b>{fmt(h)}h</b>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Rows({ title, total, rows, empty }: { title: string; total: number; rows: (readonly [string, number, string])[]; empty: string }) {
  return (
    <div className="mt-4">
      <div className="flex justify-between text-sm font-semibold">
        <span>{title}</span>
        <span className="tabular-nums">₥{fmt2(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map(([label, v, colour]) => (
            <li key={label} className="flex items-center gap-2 text-sm">
              <span className="w-20 shrink-0 text-muted">{label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (v / Math.max(total, 1e-9)) * 100)}%`, background: colour }} />
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums">₥{fmt2(v)}</span>
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
      <p className="text-sm text-muted">Where each ₥100 you earn goes.</p>
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
            Cash
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
