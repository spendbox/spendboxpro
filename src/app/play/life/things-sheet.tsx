"use client";

import { announceGiftSent } from "../people/gift-pop";
import { useCallback, useEffect, useState } from "react";
import { cachedThings, loadThings } from "./things-cache";
import { Building2, Gem, House, ShoppingBag, Store, TrendingUp } from "lucide-react";
import { CATEGORY_LABEL, effectWords, mintOf, QUICK_SALE, SHOP, STEAL_MAX, CAUGHT_CHANCE, type ItemCategory } from "@/lib/world/items";
import type { AssetUnit } from "@/lib/world/property-api";
import type { Prices } from "@/lib/world/region";
import { cash } from "@/lib/world/value";
import * as items from "../item-actions";
import type { MyItem, MyThings } from "../item-actions";
import { useIncome, useLiveEarned } from "../income";
import type { Earnings } from "@/app/api/earnings/route";
import { Sheet } from "../sheet";

// Your things (docs/ITEMS.md): what you own and the reputation it brings, the city's shop (cars
// too), and your assets: the property you own and what it earns you, by itself (game-db/079).

export type ThingsTab = "mine" | "shops" | "cars" | "assets";

const TABS: { id: ThingsTab; label: string; icon: typeof Gem }[] = [
  { id: "mine", label: "Mine", icon: Gem },
  { id: "shops", label: "Shop", icon: ShoppingBag },
  { id: "assets", label: "Assets", icon: TrendingUp },
];

export function ThingsSheet({
  tab: start,
  prices,
  coins,
  units,
  onClose,
  onChanged,
}: {
  tab: ThingsTab;
  prices: Prices;
  /** Your cash (prices you can afford show green, the rest red). */
  coins: number;
  /** The property you own (Assets). */
  units: AssetUnit[];
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<ThingsTab>(start === "cars" ? "shops" : start);
  const [me, setMe] = useState<MyThings | null>(() => cachedThings());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const load = useCallback(() => void loadThings().then((t) => t && setMe(t)), []);
  useEffect(() => load(), [load]);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string | ((r: Record<string, unknown>) => string)) => {
    setBusy(true);
    const r = (await fn()) as { ok: boolean; error?: string } & Record<string, unknown>;
    setBusy(false);
    setNote(r.ok ? { text: typeof done === "string" ? done : done(r), good: true } : { text: r.error ?? "That didn't work.", good: false });
    load();
    onChanged?.();
    return r.ok;
  };
  return (
    <Sheet
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Gem className="size-5" /> Things
        </span>
      }
    >
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-full text-xs font-semibold ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}>
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>
      {note && <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${note.good ? "bg-me/10 text-me" : "bg-hit/10 text-hit"}`}>{note.text}</p>}
      {tab === "mine" && <Mine me={me} busy={busy} run={run} />}
      {tab === "shops" && <Shops startCars={start === "cars"} prices={prices} coins={coins} busy={busy} run={run} />}
      {tab === "assets" && <Assets units={units} />}
    </Sheet>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string | ((r: Record<string, unknown>) => string)) => Promise<boolean>;

/** Your things: what each is worth and the reputation it brings; give it away or sell it to a shop. */
function Mine({ me, busy, run }: { me: MyThings | null; busy: boolean; run: Run }) {
  const [open, setOpen] = useState<number | null>(null);
  const [to, setTo] = useState("");
  if (!me) return <div className="mt-3 h-40 animate-pulse rounded-2xl bg-ink/5" />;
  const worth = me.items.reduce((t, i) => t + i.worth, 0);
  const rep = me.items.reduce((t, i) => t + (i.effect.rep ?? 0), 0);
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Worth" value={cash(worth)} />
        <Stat label="Reputation from them" value={`+${Math.round(rep * 10) / 10}`} />
      </div>
      {me.items.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-ink/[0.04] px-4 py-6 text-center text-sm text-muted">Nothing yet. Buy from the Shop (fine things raise your reputation), find things as you go about, or get a gift.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {me.items.map((i) => (
            <li key={i.id} className="px-3 py-2.5">
              <button onClick={() => setOpen(open === i.id ? null : i.id)} className="flex w-full items-center gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {i.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {CATEGORY_LABEL[i.category]} · {effectWords(i.effect)} · {HOW[i.how] ?? i.how}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{cash(i.worth)}</span>
              </button>
              {open === i.id && (
                <ItemActions
                  item={i}
                  busy={busy}
                  to={to}
                  setTo={setTo}
                  run={run}
                  done={() => setOpen(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const HOW: Record<string, string> = { bought: "bought", found: "found", stolen: "stolen", gift: "a gift", crafted: "made by you", market: "from the market" };

function ItemActions({ item, busy, to, setTo, run, done }: { item: MyItem; busy: boolean; to: string; setTo: (s: string) => void; run: Run; done: () => void }) {
  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-ink/[0.03] p-2.5">
      {/* Something put on the old market before it closed: take it back. */}
      {item.listPrice != null ? (
        <button disabled={busy} onClick={() => void run(() => items.unlistItem(item.id), "Taken off the market.").then((ok) => ok && done())} className="h-9 w-full rounded-full bg-ink/5 text-xs font-semibold">
          Take it off the market
        </button>
      ) : null}
      <div className="flex gap-1.5">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Give to (player's name)" className="h-9 min-w-0 flex-1 rounded-full bg-panel px-3 text-xs outline-none ring-1 ring-ink/10" />
        <button disabled={busy || to.trim().length < 2} onClick={() =>
            void run(() => items.giftItem(item.id, to), (r) => {
              announceGiftSent(String(r.to ?? to), item.name);
              return `You gave ${item.name} to ${String(r.to ?? to)}.`;
            }).then((ok) => ok && done())
          } className="h-9 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold disabled:opacity-40">
          Give
        </button>
      </div>
      <button disabled={busy} onClick={() => void run(() => items.sellToCity(item.id), (r) => `Sold to a shop for ${cash(Number(r.coins ?? 0))}.`).then((ok) => ok && done())} className="h-9 w-full rounded-full bg-gold/15 text-xs font-semibold text-gold-dark disabled:opacity-40">
        Sell to a shop now for {cash(item.worth * QUICK_SALE)}
      </button>
    </div>
  );
}

/** The city's shop, cars included: buy new (reputation for fine things), or try to steal something small. */
function Shops({ startCars, prices, coins, busy, run }: { startCars: boolean; prices: Prices; coins: number; busy: boolean; run: Run }) {
  const [cat, setCat] = useState<ItemCategory | "all">(startCars ? "car" : "all");
  const [risky, setRisky] = useState<string | null>(null);
  const cars = cat === "car";
  const list = SHOP.filter((k) => cat === "all" || k.category === cat);
  return (
    <div className="mt-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(["all", "car", "jewellery", "clothing", "gadget", "home", "art", "book", "fitness"] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${cat === c ? "bg-ink text-white" : "bg-ink/5"}`}>
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {cars && <p className="text-xs text-muted">A good car turns heads (reputation), and you can drive it round the city.</p>}
      <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
        {list.map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{k.name}</p>
              <p className="truncate text-xs text-muted">{effectWords(k.effect)}</p>
            </div>
            {k.price <= STEAL_MAX && (
              // Two taps: the first says the risk, the second steals.
              <button
                disabled={busy}
                onClick={() => {
                  if (risky !== k.id) return setRisky(k.id);
                  setRisky(null);
                  void run(
                    () => items.steal(k.id),
                    (r) => (r.caught ? `Caught! A fine of ${cash(Number(r.fare ?? 0))}, and people talk: reputation down.${r.jailed ? " And the police took you in: 2 hours in jail." : ""}` : `You got away with ${k.name}.`),
                  );
                }}
                className={`h-8 shrink-0 rounded-full px-2.5 text-[11px] font-semibold disabled:opacity-40 ${risky === k.id ? "bg-hit text-white" : "bg-ink/5 text-muted"}`}
                title="Risky: you might be caught, fined, or jailed"
              >
                {risky === k.id ? `Sure? ${Math.round(CAUGHT_CHANCE * 10)} in 10 get caught` : "Steal"}
              </button>
            )}
            {(() => {
              const price = mintOf(k.price, prices);
              const can = coins >= price;
              return (
                <button
                  disabled={busy || !can}
                  onClick={() => void run(() => items.buyFromShop(k.id), `${k.name} is yours!${k.effect.rep ? ` +${k.effect.rep} reputation.` : ""}`)}
                  title={can ? `Buy for ${cash(price)}` : `You need ${cash(price)}`}
                  className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold tabular-nums ${can ? "bg-[#2b8a3e] text-white" : "bg-[#e03131]/10 text-[#e03131]"} disabled:cursor-not-allowed`}
                >
                  {cash(price)}
                </button>
              );
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Your assets: the property you own and what it earns you, by itself, going up as you watch. */
function Assets({ units }: { units: AssetUnit[] }) {
  const income = useIncome();
  const earned = useLiveEarned();
  const owned = units.filter((u) => u.price > 0.01);
  const [play, setPlay] = useState<Earnings | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetch("/api/earnings", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Earnings | null>) : null))
      .then((e) => alive && setPlay(e))
      .catch(() => alive && setPlay(null));
    return () => {
      alive = false;
    };
  }, []);
  const rooms = units.length - owned.length;
  const perDay = income.perDay;
  return (
    <div className="mt-3">
      <div className="rounded-3xl bg-gradient-to-br from-[#2b8a3e] to-[#37b24d] p-4 text-white shadow">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Your property has earned</p>
        <p className="font-display text-3xl font-extrabold tabular-nums">{cash(earned, { exact: true, full: true })}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-white/15 px-2 py-2">
            <p className="text-lg font-extrabold tabular-nums">{cash(perDay / 144)}</p>
            <p className="text-[11px] text-white/80">every 10 minutes</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-2 py-2">
            <p className="text-lg font-extrabold tabular-nums">{cash(perDay)}</p>
            <p className="text-[11px] text-white/80">a day</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-white/85">Paid straight into your cash, by itself. It keeps earning while you&apos;re away (up to 2 days).</p>
      </div>
      {/* Rewards for showing up: just being here pays. */}
      <div className="mt-3 rounded-3xl bg-gold/15 p-4">
        <p className="text-sm font-bold">🎉 Rewards for showing up</p>
        <p className="text-[11px] text-muted">Free money for being here and having fun: a daily gift, pay for every minute you&apos;re online, wins and missions.</p>
        {play === undefined ? (
          <div className="mt-2 h-16 animate-pulse rounded-2xl bg-ink/5" />
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {(
              [
                ["🎁", "Daily gifts", "gift"],
                ["🟢", "Being online", "online"],
                ["🏆", "Challenge wins", "wins"],
                ["🎯", "Missions and rewards", "missions"],
              ] as const
            ).map(([emoji, label, k]) => (
              <li key={k} className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
                <span className="text-lg">{emoji}</span>
                <span className="min-w-0 flex-1 font-medium">{label}</span>
                <span className="text-right">
                  <b className="block tabular-nums">{cash(play?.[k].total ?? 0)}</b>
                  {(play?.[k].today ?? 0) > 0 && <span className="block text-[10px] font-semibold text-[#2b8a3e]">+{cash(play![k].today)} today</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {owned.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-6 text-center text-sm text-muted">
          No property yet{rooms ? " (your free room doesn't earn)" : ""}. Tap any building on the map and Buy: homes, shops and offices all pay you every day, by themselves.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {owned.map((u) => {
            const Icon = u.use === "home" ? House : u.use === "shop" ? Store : Building2;
            const share = income.perDay > 0 && owned.length ? u.price / owned.reduce((t, x) => t + x.price, 0) : 0;
            return (
              <li key={u.unit} className="flex items-center gap-3 px-3 py-2.5">
                <Icon className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{[u.label, u.name].filter(Boolean).join(", ")}</p>
                  <p className="text-xs text-muted">Worth {cash(u.price)}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-[#2b8a3e] tabular-nums">+{cash(perDay * share)}/day</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.04] px-2 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-display text-sm font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
