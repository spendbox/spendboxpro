"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, PiggyBank, Trash2, Zap } from "@/components/icons";
import type { RegionMap } from "@/lib/world/compile";
import { BUDGET_PRESETS, groupOf, MONEY_GROUP, POT_INFO, POTS, type Budget, type MoneyGroup, type Pot } from "@/lib/world/living";
import type { OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, AssetUnit, LifeStatus, MoneyFlow } from "@/lib/world/property-api";
import { mintLocal } from "@/lib/world/value";
import { Sheet } from "../sheet";
import { AssetsBody, unitValueNow } from "./assets-sheet";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const fmt2 = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

type Tab = "overview" | "budget" | "spending" | "property";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "budget", label: "Budget" },
  { id: "spending", label: "Spending" },
  { id: "property", label: "Property" },
];

/** Your money: what you're worth, your pots, your budget, where money went (and the tax), your property. */
export function MoneySheet({
  status,
  assets,
  owned,
  region,
  busy,
  loadMoney,
  onBudget,
  onMove,
  onCollect,
  onShow,
  onClose,
}: {
  status: LifeStatus | null;
  assets: AssetsData;
  owned: OwnedProperty[];
  region: RegionMap;
  busy: boolean;
  loadMoney: (hours: number) => Promise<MoneyFlow>;
  onBudget: (b: Budget) => void;
  onMove: (from: Pot | "wallet", to: Pot | "wallet", amount: number) => void;
  onCollect: () => void;
  onShow: (u: AssetUnit) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const prices = region.region.prices;
  const property = assets.units.reduce((t, u) => t + unitValueNow(u, owned, region), 0);
  const pots = POTS.reduce((t, p) => t + (status?.pots[p] ?? 0), 0);
  const wallet = status?.wallet ?? assets.coins;
  const worth = wallet + pots + property;
  return (
    <Sheet onClose={onClose} wide title="Money">
      <div className="mt-3 flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`h-8 flex-1 rounded-full text-xs font-semibold transition ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "overview" && (
          <Overview status={status} wallet={wallet} pots={pots} property={property} worth={worth} prices={prices} busy={busy} onMove={onMove} onTab={setTab} />
        )}
        {tab === "budget" && status && <BudgetTab budget={status.budget} busy={busy} onSave={onBudget} />}
        {tab === "spending" && <Spending load={loadMoney} prices={prices} />}
        {tab === "property" && <AssetsBody assets={assets} owned={owned} region={region} busy={busy} onCollect={onCollect} onShow={onShow} />}
      </div>
    </Sheet>
  );
}

function Overview({
  status,
  wallet,
  pots,
  property,
  worth,
  prices,
  busy,
  onMove,
  onTab,
}: {
  status: LifeStatus | null;
  wallet: number;
  pots: number;
  property: number;
  worth: number;
  prices: RegionMap["region"]["prices"];
  busy: boolean;
  onMove: (from: Pot | "wallet", to: Pot | "wallet", amount: number) => void;
  onTab: (t: Tab) => void;
}) {
  const [moving, setMoving] = useState<Pot | "wallet" | null>(null);
  const [to, setTo] = useState<Pot | "wallet">("wallet");
  const [amount, setAmount] = useState("");
  const jars: (Pot | "wallet")[] = ["wallet", ...POTS];
  const balance = (p: Pot | "wallet") => (p === "wallet" ? wallet : (status?.pots[p] ?? 0));
  const owed = (status?.powerOwed ?? 0) + (status?.wasteOwed ?? 0);
  return (
    <div>
      <div className="rounded-3xl bg-gradient-to-br from-gold/25 to-me/10 p-4">
        <p className="text-sm text-muted">You&apos;re worth</p>
        <p className="font-display text-3xl font-extrabold tabular-nums">₥{fmt(worth)}</p>
        <p className="text-sm text-muted">about {mintLocal(worth, prices)}</p>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink/5">
          {[
            { v: wallet, c: POT_INFO.wallet.colour },
            { v: pots, c: POT_INFO.savings.colour },
            { v: property, c: "#e8590c" },
          ].map((x, k) => (
            <div key={k} style={{ width: `${worth > 0 ? (Math.max(0, x.v) / worth) * 100 : 0}%`, background: x.c }} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>Wallet ₥{fmt(wallet)}</span>
          <span>Pots ₥{fmt(pots)}</span>
          <span>Property ₥{fmt(property)}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {jars.map((p) => {
          const info = POT_INFO[p];
          const share = p === "wallet" ? 100 - POTS.reduce((t, q) => t + (status?.budget[q] ?? 0), 0) : (status?.budget[p] ?? 0);
          return (
            <button
              key={p}
              onClick={() => {
                setMoving(moving === p ? null : p);
                setTo(p === "wallet" ? "savings" : "wallet");
                setAmount("");
              }}
              className={`relative overflow-hidden rounded-2xl bg-ink/[0.04] px-1 pb-2 pt-3 text-center ring-2 transition ${moving === p ? "ring-ink/30" : "ring-transparent"}`}
              title={info.what}
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: info.colour }} />
              <span className="block text-[11px] text-muted">{info.label}</span>
              <span className="block text-sm font-bold tabular-nums">₥{fmt(balance(p))}</span>
              <span className="block text-[10px] text-muted">{share}% of income</span>
            </button>
          );
        })}
      </div>
      {moving ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-ink/[0.04] p-2.5 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(amount);
            if (v > 0) onMove(moving, to, v);
            setMoving(null);
          }}
        >
          <span>Move ₥</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={fmt2(balance(moving))}
            className="h-8 w-20 rounded-full bg-panel px-3 tabular-nums outline-none ring-1 ring-ink/10"
            autoFocus
          />
          <span>to</span>
          <select value={to} onChange={(e) => setTo(e.target.value as Pot | "wallet")} className="h-8 rounded-full bg-panel px-2 ring-1 ring-ink/10">
            {jars
              .filter((p) => p !== moving)
              .map((p) => (
                <option key={p} value={p}>
                  {POT_INFO[p].label}
                </option>
              ))}
          </select>
          <button disabled={busy || !(Number(amount) > 0)} className="ml-auto h-8 rounded-full bg-ink px-3 font-semibold text-white disabled:opacity-40">
            Move
          </button>
        </form>
      ) : (
        <p className="mt-2 text-center text-[11px] text-muted">
          Everything you earn is shared out by your{" "}
          <button onClick={() => onTab("budget")} className="font-semibold text-gold-dark underline-offset-2 hover:underline">
            budget
          </button>
          . Tap a pot to move money.
        </p>
      )}

      {status?.bills && (
        <div className="mt-4 rounded-2xl ring-1 ring-ink/5">
          <p className="px-3 pt-3 text-sm font-semibold">Bills for your home</p>
          <p className="px-3 text-[11px] text-muted">Paid by themselves from Essentials, then your wallet.</p>
          <div className="mt-2 divide-y divide-ink/5">
            <BillRow icon={<Zap className="size-4 text-gold-dark" />} label="Electricity" day={status.bills.power} owed={status.powerOwed} prices={prices} note={status.powerCut ? "Power cut: pay what you owe to get it back" : undefined} />
            <BillRow icon={<Trash2 className="size-4 text-me" />} label="Waste collection" day={status.bills.waste} owed={status.wasteOwed} prices={prices} note="Goes to Lagos State" />
          </div>
          {owed > 0 && <p className="px-3 pb-3 text-xs text-hit">You owe ₥{fmt2(owed)}. It&apos;s paid as soon as money comes into Essentials or your wallet.</p>}
        </div>
      )}
      {(status?.payOwed ?? 0) > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-ink/[0.04] p-3 text-xs">
          <Landmark className="size-4 shrink-0 text-muted" />
          The state owes you ₥{fmt2(status!.payOwed)} in pay. It&apos;s paid when the treasury has the money.
        </p>
      )}
    </div>
  );
}

function BillRow({ icon, label, day, owed, prices, note }: { icon: React.ReactNode; label: string; day: number; owed: number; prices: RegionMap["region"]["prices"]; note?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {note && <p className={`truncate text-[11px] ${owed > 0 && label === "Electricity" ? "text-hit" : "text-muted"}`}>{note}</p>}
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">₥{fmt2(day)}/day</p>
        <p className="text-[11px] text-muted">{mintLocal(day * 30, prices)}/month</p>
      </div>
    </div>
  );
}

function BudgetTab({ budget, busy, onSave }: { budget: Budget; busy: boolean; onSave: (b: Budget) => void }) {
  const [b, setB] = useState<Budget>(budget);
  const used = POTS.reduce((t, p) => t + b[p], 0);
  const wallet = 100 - used;
  const changed = POTS.some((p) => b[p] !== budget[p]);
  const set = (p: Pot, v: number) => {
    const others = used - b[p];
    setB({ ...b, [p]: Math.max(0, Math.min(100 - others, Math.round(v))) });
  };
  return (
    <div>
      <p className="text-sm text-muted">Set it once: every time you&apos;re paid or collect rent, it&apos;s shared out by itself.</p>
      <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-ink/5">
        {POTS.map((p) => (
          <div key={p} style={{ width: `${b[p]}%`, background: POT_INFO[p].colour }} className="transition-all" />
        ))}
        <div style={{ width: `${wallet}%`, background: POT_INFO.wallet.colour }} className="opacity-60 transition-all" />
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
          <li key={p}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-full" style={{ background: POT_INFO[p].colour }} />
                {POT_INFO[p].label}
              </span>
              <span className="font-semibold tabular-nums">{b[p]}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={b[p]}
              onChange={(e) => set(p, Number(e.target.value))}
              className="mt-1 w-full"
              style={{ accentColor: POT_INFO[p].colour }}
              aria-label={POT_INFO[p].label}
            />
            <p className="text-[11px] text-muted">{POT_INFO[p].what}</p>
          </li>
        ))}
        <li className="flex items-baseline justify-between text-sm">
          <span className="flex items-center gap-2 font-medium">
            <span className="size-2.5 rounded-full" style={{ background: POT_INFO.wallet.colour }} />
            Wallet (the rest)
          </span>
          <span className="font-semibold tabular-nums">{wallet}%</span>
        </li>
      </ul>
      <p className="mt-3 rounded-2xl bg-ink/[0.04] p-3 text-xs text-muted">
        <PiggyBank className="mr-1 inline size-3.5" /> From every ₥100 you earn: {POTS.filter((p) => b[p] > 0).map((p) => `₥${b[p]} ${POT_INFO[p].label.toLowerCase()}`).join(", ") || "nothing set aside"}
        {wallet > 0 ? `, ₥${wallet} to spend.` : "."} Short somewhere? Bills, fares and fees take from your wallet too, and buying property takes from Savings.
      </p>
      <button disabled={busy || !changed} onClick={() => onSave(b)} className="mt-3 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40">
        Save budget
      </button>
    </div>
  );
}

const PERIODS = [
  { hours: 2, label: "Game day" },
  { hours: 24, label: "Today" },
  { hours: 168, label: "This week" },
];

function Spending({ load, prices }: { load: (hours: number) => Promise<MoneyFlow>; prices: RegionMap["region"]["prices"] }) {
  const [hours, setHours] = useState(24);
  const [flow, setFlow] = useState<{ hours: number; data: MoneyFlow } | null>(null);
  useEffect(() => {
    let alive = true;
    void load(hours).then((data) => alive && setFlow({ hours, data }));
    return () => {
      alive = false;
    };
  }, [load, hours]);
  const groups = useMemo(() => {
    const g = new Map<MoneyGroup, number>();
    for (const [kind, v] of Object.entries(flow?.data ?? {})) {
      if (kind === "start_grant") continue;
      g.set(groupOf(kind), (g.get(groupOf(kind)) ?? 0) + v);
    }
    return g;
  }, [flow]);
  // Buying property isn't spending: the money's still yours, as property.
  const bought = -(groups.get("property") ?? 0);
  const ins = [...groups].filter(([g, v]) => g !== "property" && v > 0.004).sort((a, b) => b[1] - a[1]);
  const outs = [...groups].filter(([g, v]) => g !== "property" && v < -0.004).sort((a, b) => a[1] - b[1]);
  const totalIn = ins.reduce((t, [, v]) => t + v, 0);
  const totalOut = -outs.reduce((t, [, v]) => t + v, 0);
  const biggest = Math.max(1e-9, ...outs.map(([, v]) => -v), ...ins.map(([, v]) => v));
  const tax = -(groups.get("tax") ?? 0);
  const loading = !flow || flow.hours !== hours;
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
        <p className="mt-6 text-center text-sm text-muted">Adding it up…</p>
      ) : ins.length + outs.length === 0 && bought <= 0 ? (
        <p className="mt-6 text-center text-sm text-muted">Nothing in or out yet in this time.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Total label="In" value={totalIn} prices={prices} tone="text-me" />
            <Total label="Out" value={-totalOut} prices={prices} tone="text-hit" />
            <Total label="Left" value={totalIn - totalOut} prices={prices} tone={totalIn - totalOut >= 0 ? "text-me" : "text-hit"} />
          </div>
          {ins.length > 0 && <Bars title="Money in" rows={ins} biggest={biggest} />}
          {outs.length > 0 && <Bars title="Money out" rows={outs.map(([g, v]) => [g, -v] as [MoneyGroup, number])} biggest={biggest} />}
          {bought > 0.004 && (
            <p className="mt-4 rounded-2xl bg-ink/[0.04] p-3 text-xs text-muted">
              You also put <b className="text-ink">₥{fmt2(bought)}</b> into property ({mintLocal(bought, prices)}). That isn&apos;t spent: it&apos;s yours, under Property.
            </p>
          )}
          {tax > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl p-3 text-xs" style={{ background: "#7048e81a" }}>
              <Landmark className="mt-0.5 size-4 shrink-0" style={{ color: MONEY_GROUP.tax.colour }} />
              <span>
                You paid <b>₥{fmt2(tax)}</b> in tax ({mintLocal(tax, prices)}): income tax, tax on rent and property, and VAT. It goes to Lagos State (70%) and Nigeria (30%), who pay
                for public services like hospitals, schools and waste collection.
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Total({ label, value, prices, tone }: { label: string; value: number; prices: RegionMap["region"]["prices"]; tone: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.04] px-2 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-display text-base font-extrabold tabular-nums ${tone}`}>
        {value < 0 ? "−" : ""}₥{fmt2(Math.abs(value))}
      </p>
      <p className="text-[11px] text-muted">{mintLocal(Math.abs(value), prices)}</p>
    </div>
  );
}

function Bars({ title, rows, biggest }: { title: string; rows: [MoneyGroup, number][]; biggest: number }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-2 space-y-2">
        {rows.map(([g, v]) => (
          <li key={g} className="text-sm">
            <div className="flex justify-between">
              <span>{MONEY_GROUP[g].label}</span>
              <span className="font-semibold tabular-nums">₥{fmt2(v)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/5">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (v / biggest) * 100)}%`, background: MONEY_GROUP[g].colour }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
