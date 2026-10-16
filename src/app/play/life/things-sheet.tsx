"use client";

import { announceGiftSent } from "../people/gift-pop";
import { useCallback, useEffect, useState } from "react";
import { cachedThings, loadThings } from "./things-cache";
import { Building2, Check, Gem, House, MapPin, Pencil, ShoppingBag, Store, TrendingUp, X } from "lucide-react";
import { renameUnit } from "../property-actions";
import { CATEGORY_LABEL, effectWords, LUXURY_FROM, MARKET_GOODS, MUSEUM_ART, mintOf, QUICK_SALE, SHOP, STEAL_MAX, CAUGHT_CHANCE, type ItemCategory, type ItemKind } from "@/lib/world/items";
import { ItemArt } from "./item-art";
import { PurchasePop } from "./purchase-pop";
import { INCOME_DAY, type AssetUnit } from "@/lib/world/property-api";
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

/** A shop at a place: a market's stalls, or a museum's art. */
export type Stall = "market" | "museum";
const STALLS: Record<Stall, { title: string; note: string; ids: string[] }> = {
  market: { title: "The market stalls", note: "Food, fabric, pots and everyday things, from the traders here. Bargain hard!", ids: MARKET_GOODS },
  museum: { title: "The museum's art", note: "From the gift shop up to Nigeria's modern masters. Art tends to gain value, and the masters bring a lot of reputation.", ids: MUSEUM_ART },
};

export function ThingsSheet({
  tab: start,
  stall,
  prices,
  coins,
  units,
  whereIs,
  onShow,
  onClose,
  onChanged,
}: {
  tab: ThingsTab;
  prices: Prices;
  /** Your cash (prices you can afford show green, the rest red). */
  coins: number;
  /** The property you own (Assets). */
  units: AssetUnit[];
  /** Where a building stands ("Akoka · Yaba"), for Assets. */
  whereIs?: (building: string) => string | null;
  /** Show one of your properties on the map (the sheet closes and the camera flies there). */
  onShow?: (u: AssetUnit) => void;
  onClose: () => void;
  onChanged?: () => void;
  /** Opened at a market or a museum: only what's sold there. */
  stall?: Stall;
}) {
  const [tab, setTab] = useState<ThingsTab>(start === "cars" ? "shops" : start);
  const [me, setMe] = useState<MyThings | null>(() => cachedThings());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const load = useCallback(() => void loadThings().then((t) => t && setMe(t)), []);
  useEffect(() => load(), [load]);
  /** Just bought from the shop: the "It's yours!" pop-up. */
  const [bought, setBought] = useState<{ kind: ItemKind; paid: number } | null>(null);
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
    <>
      <Sheet
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Gem className="size-5" /> {stall ? STALLS[stall].title : "Things"}
        </span>
      }
    >
      <div className={`flex gap-1 rounded-full bg-ink/5 p-1 ${stall ? "hidden" : ""}`}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-full text-xs font-semibold ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}>
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>
      {note && <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${note.good ? "bg-me/10 text-me" : "bg-hit/10 text-hit"}`}>{note.text}</p>}
      {tab === "mine" && <Mine me={me} busy={busy} run={run} />}
      {tab === "shops" && <Shops startCars={start === "cars"} stall={stall} prices={prices} coins={coins} busy={busy} run={run} onBought={(k, paid) => setBought({ kind: k, paid })} />}
      {tab === "assets" && (
        <Assets
          units={units}
          whereIs={whereIs}
          onShow={onShow}
          onRename={async (u, name) => {
            const r = await renameUnit(u.unit, name);
            if (!r.ok) return r.error;
            onChanged?.();
            return null;
          }}
        />
      )}
      </Sheet>
      {/* What you just bought, popping up big and shiny (outside the sheet, over everything). */}
      {bought && <PurchasePop kind={bought.kind} paid={bought.paid} onClose={() => setBought(null)} />}
    </>
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
                <ItemArt kind={i.kind} category={i.category} size={40} />
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
function Shops({ startCars, stall, prices, coins, busy, run, onBought }: { startCars: boolean; stall?: Stall; prices: Prices; coins: number; busy: boolean; run: Run; onBought: (k: ItemKind, paid: number) => void }) {
  const [cat, setCat] = useState<ItemCategory | "all" | "luxury">(startCars ? "car" : "all");
  const [risky, setRisky] = useState<string | null>(null);
  const cars = cat === "car";
  // Luxury: the ₦10m-and-up watches, bags, art and cars together, cheapest first.
  const list = stall
    ? STALLS[stall].ids.map((id) => SHOP.find((k) => k.id === id)).filter((k): k is ItemKind => !!k).sort((a, b) => a.price - b.price)
    : cat === "luxury"
      ? SHOP.filter((k) => k.price >= LUXURY_FROM).sort((a, b) => a.price - b.price)
      : SHOP.filter((k) => cat === "all" || k.category === cat);
  return (
    <div className="mt-3">
      {stall && <p className="text-xs text-muted">{STALLS[stall].note}</p>}
      <div className={`-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 ${stall ? "hidden" : ""}`}>
        {(["all", "luxury", "car", "jewellery", "clothing", "gadget", "home", "art", "book", "fitness"] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${cat === c ? "bg-ink text-white" : c === "luxury" ? "bg-gold/25 text-gold-dark" : "bg-ink/5"}`}>
            {c === "all" ? "All" : c === "luxury" ? "Luxury ✨" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {cars && <p className="text-xs text-muted">A good car turns heads (reputation), and you can drive it round the city.</p>}
      {cat === "luxury" && <p className="text-xs text-muted">The finest watches, jewellery, art and cars in Lagos. The dearer it is, the more reputation it brings, for as long as you own it. Watches, jewellery and art also tend to gain value over time.</p>}
      <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
        {list.map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
            <ItemArt kind={k.id} category={k.category} size={44} />
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
                  onClick={() => void run(() => items.buyFromShop(k.id), `${k.name} is yours!${k.effect.rep ? ` +${k.effect.rep} reputation.` : ""}`).then((ok) => ok && onBought(k, price))}
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
function Assets({
  units,
  whereIs,
  onShow,
  onRename,
}: {
  units: AssetUnit[];
  whereIs?: (building: string) => string | null;
  onShow?: (u: AssetUnit) => void;
  /** Name one of them (null when it worked, or what went wrong). */
  onRename?: (u: AssetUnit, name: string) => Promise<string | null>;
}) {
  const income = useIncome();
  const earned = useLiveEarned();
  const owned = units.filter((u) => u.price > 0.01);
  // Your free room earns nothing, but it's yours to find on the map too.
  const freeRooms = units.filter((u) => u.price <= 0.01);
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
          {owned.map((u) => (
            <AssetRow key={u.unit} u={u} where={whereIs?.(u.building) ?? null} onShow={onShow} onRename={onRename} right={<span className="shrink-0 text-sm font-bold text-[#2b8a3e] tabular-nums">+{cash(u.price * INCOME_DAY)}/day</span>} note={`Worth ${cash(u.price)}`} />
          ))}
        </ul>
      )}
      {freeRooms.length > 0 && (
        <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {freeRooms.map((u) => (
            <AssetRow key={u.unit} u={u} where={whereIs?.(u.building) ?? null} onShow={onShow} onRename={onRename} note="Your free room" />
          ))}
        </ul>
      )}
      {onShow && (owned.length > 0 || freeRooms.length > 0) && <p className="mt-1.5 text-[11px] text-muted">Tap one to see where it is on the map.</p>}
      {(() => {
        // Landmarks you own earn too (they're not in this list): the rest of the day's earnings.
        const fromUnits = owned.reduce((t, u) => t + u.price * INCOME_DAY, 0);
        const fromLandmarks = perDay - fromUnits;
        return fromLandmarks > 1 ? (
          <p className="mt-2 flex items-center justify-between rounded-2xl bg-gold/15 px-3 py-2 text-sm">
            <span>🏛️ Your landmarks</span>
            <b className="text-[#2b8a3e]">+{cash(fromLandmarks)}/day</b>
          </p>
        ) : null;
      })()}
    </div>
  );
}

/** One of your properties: what it is, where it stands (tap to see it on the map), what it earns, and a pencil to name it. */
function AssetRow({
  u,
  where,
  note,
  right,
  onShow,
  onRename,
}: {
  u: AssetUnit;
  where: string | null;
  note: string;
  right?: React.ReactNode;
  onShow?: (u: AssetUnit) => void;
  onRename?: (u: AssetUnit, name: string) => Promise<string | null>;
}) {
  const Icon = u.use === "home" ? House : u.use === "shop" ? Store : Building2;
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState(u.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (naming && onRename)
    return (
      <li className="px-3 py-2.5">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const err = await onRename(u, draft);
            setBusy(false);
            if (err) return setError(err);
            setNaming(false);
          }}
          className="flex items-center gap-1.5"
        >
          <Icon className="size-4 shrink-0 text-muted" />
          <input
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Give it a name"
            className="h-9 min-w-0 flex-1 rounded-full bg-ink/5 px-3 text-base outline-none focus:ring-2 focus:ring-me"
            aria-label={`A name for ${u.label}`}
          />
          <button disabled={busy} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-50" aria-label="Save the name">
            <Check className="size-4" />
          </button>
          <button type="button" onClick={() => setNaming(false)} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5" aria-label="Don't rename">
            <X className="size-4" />
          </button>
        </form>
        <p className="mt-1 text-[11px] text-muted">{error ?? "Leave it empty to put back its plain name."}</p>
      </li>
    );
  const body = (
    <>
      <Icon className="size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{[u.label, u.name].filter(Boolean).join(", ")}</p>
        {where && (
          <p className="flex items-center gap-1 truncate text-xs font-semibold text-gold-dark">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{where}</span>
          </p>
        )}
        <p className="text-xs text-muted">{note}</p>
      </div>
      {right}
    </>
  );
  return (
    <li className="flex items-center">
      {onShow ? (
        <button onClick={() => onShow(u)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1 text-left hover:bg-ink/[0.03]" aria-label={`Show ${u.label} on the map`}>
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1">{body}</div>
      )}
      {onRename && (
        <button
          onClick={() => {
            setDraft(u.label);
            setNaming(true);
          }}
          className="mr-2 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5"
          aria-label={`Rename ${u.label}`}
          title="Rename"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </li>
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
