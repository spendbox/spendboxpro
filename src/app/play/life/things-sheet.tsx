"use client";

import { useCallback, useEffect, useState } from "react";
import { cachedThings, loadThings } from "./things-cache";
import { Car, Gem, Hammer, ShoppingBag, Store } from "lucide-react";
import {
  BENEFIT_LABEL,
  CATEGORY_LABEL,
  CRAFT_STAGES,
  CRAFT_TIERS,
  craftHours,
  effectWords,
  KNOW_HOW,
  LIST_FEE,
  MATERIALS,
  mintOf,
  QUICK_SALE,
  SALE_TAX,
  SHOP,
  STEAL_MAX,
  CAUGHT_CHANCE,
  type CraftBenefit,
  type CraftTier,
  type ItemCategory,
} from "@/lib/world/items";
import type { Prices } from "@/lib/world/region";
import { cash } from "@/lib/world/value";
import * as items from "../item-actions";
import type { MarketItem, MyItem, MyThings } from "../item-actions";
import { Sheet } from "../sheet";

// Your things (docs/ITEMS.md): what you own and what it does for you, the city's shops and car
// dealers, the market where players sell to each other, and making new things of your own.

export type ThingsTab = "mine" | "shops" | "cars" | "market" | "craft";

const TABS: { id: ThingsTab; label: string; icon: typeof Gem }[] = [
  { id: "mine", label: "Mine", icon: Gem },
  { id: "shops", label: "Shops", icon: ShoppingBag },
  { id: "cars", label: "Cars", icon: Car },
  { id: "market", label: "Market", icon: Store },
  { id: "craft", label: "Craft", icon: Hammer },
];

export function ThingsSheet({ tab: start, prices, onClose, onChanged }: { tab: ThingsTab; prices: Prices; onClose: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<ThingsTab>(start);
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
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-full text-[11px] font-semibold sm:text-xs ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}>
            <t.icon className="size-3.5 max-[380px]:hidden" /> {t.label}
          </button>
        ))}
      </div>
      {note && <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${note.good ? "bg-me/10 text-me" : "bg-hit/10 text-hit"}`}>{note.text}</p>}
      {tab === "mine" && <Mine me={me} busy={busy} run={run} />}
      {(tab === "shops" || tab === "cars") && <Shops cars={tab === "cars"} prices={prices} busy={busy} run={run} />}
      {tab === "market" && <Market busy={busy} run={run} />}
      {tab === "craft" && <Craft me={me} prices={prices} busy={busy} run={run} />}
    </Sheet>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string | ((r: Record<string, unknown>) => string)) => Promise<boolean>;

/** Your things: what each is worth and does, and sell, gift or put it on the market. */
function Mine({ me, busy, run }: { me: MyThings | null; busy: boolean; run: Run }) {
  const [open, setOpen] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [to, setTo] = useState("");
  if (!me) return <div className="mt-3 h-40 animate-pulse rounded-2xl bg-ink/5" />;
  const worth = me.items.reduce((t, i) => t + i.worth, 0);
  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Worth" value={cash(worth)} />
        <Stat label="Mind / 2h" value={`+${me.effects.mind}`} />
        <Stat label="Body / 2h" value={`+${me.effects.body}`} />
      </div>
      {me.items.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-ink/[0.04] px-4 py-6 text-center text-sm text-muted">Nothing yet. Buy from the shops, find things as you go about, make your own, or get a gift.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {me.items.map((i) => (
            <li key={i.id} className="px-3 py-2.5">
              <button onClick={() => setOpen(open === i.id ? null : i.id)} className="flex w-full items-center gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {i.name}
                    {i.listPrice != null && <span className="ml-1.5 rounded-full bg-gold/15 px-1.5 py-px text-[10px] font-bold text-gold-dark">for sale {cash(i.listPrice)}</span>}
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
                  price={price}
                  setPrice={setPrice}
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

function ItemActions({ item, busy, price, setPrice, to, setTo, run, done }: { item: MyItem; busy: boolean; price: string; setPrice: (s: string) => void; to: string; setTo: (s: string) => void; run: Run; done: () => void }) {
  const ask = Number(price) || 0;
  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-ink/[0.03] p-2.5">
      {item.listPrice != null ? (
        <button disabled={busy} onClick={() => void run(() => items.unlistItem(item.id), "Taken off the market.").then((ok) => ok && done())} className="h-9 w-full rounded-full bg-ink/5 text-xs font-semibold">
          Take it off the market
        </button>
      ) : (
        <div className="flex gap-1.5">
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={`Price (mint), worth ${Math.round(item.worth)}`}
            className="h-9 min-w-0 flex-1 rounded-full bg-panel px-3 text-xs outline-none ring-1 ring-ink/10"
          />
          <button disabled={busy || ask <= 0} onClick={() => void run(() => items.listItem(item.id, ask), `On the market at ${cash(ask)}.`).then((ok) => ok && done())} className="h-9 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
            Sell on market
          </button>
        </div>
      )}
      {item.listPrice == null && ask > 0 && <p className="text-[11px] text-muted">Listing costs {cash(Math.max(0.1, ask * LIST_FEE))}; when it sells you get {cash(ask * (1 - SALE_TAX))} after {Math.round(SALE_TAX * 100)}% tax.</p>}
      <div className="flex gap-1.5">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Give to (player's name)" className="h-9 min-w-0 flex-1 rounded-full bg-panel px-3 text-xs outline-none ring-1 ring-ink/10" />
        <button disabled={busy || to.trim().length < 2} onClick={() => void run(() => items.giftItem(item.id, to), (r) => `You gave ${item.name} to ${String(r.to ?? to)}.`).then((ok) => ok && done())} className="h-9 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold disabled:opacity-40">
          Give
        </button>
      </div>
      <button disabled={busy} onClick={() => void run(() => items.sellToCity(item.id), (r) => `Sold to a shop for ${cash(Number(r.coins ?? 0))}.`).then((ok) => ok && done())} className="h-9 w-full rounded-full bg-gold/15 text-xs font-semibold text-gold-dark disabled:opacity-40">
        Sell to a shop now for {cash(item.worth * QUICK_SALE)}
      </button>
    </div>
  );
}

/** The city's shops (or car dealers): buy new, or try to steal something small. */
function Shops({ cars, prices, busy, run }: { cars: boolean; prices: Prices; busy: boolean; run: Run }) {
  const [cat, setCat] = useState<ItemCategory | "all">("all");
  const [risky, setRisky] = useState<string | null>(null);
  const list = SHOP.filter((k) => (cars ? k.category === "car" : k.category !== "car" && (cat === "all" || k.category === cat)));
  return (
    <div className="mt-3">
      {!cars && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {(["all", "jewellery", "clothing", "book", "gadget", "home", "art", "fitness"] as const).map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${cat === c ? "bg-ink text-white" : "bg-ink/5"}`}>
              {c === "all" ? "All" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      {cars && <p className="text-xs text-muted">Cars lose a little value every month and can be sold on. Own one and you can drive to work (Income → Details → Getting to work).</p>}
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
            <button disabled={busy} onClick={() => void run(() => items.buyFromShop(k.id), `${k.name} is yours.`)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
              {cash(mintOf(k.price, prices))}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The market: what players are selling, cheapest first. */
function Market({ busy, run }: { busy: boolean; run: Run }) {
  const [cat, setCat] = useState<ItemCategory | "all">("all");
  const [list, setList] = useState<MarketItem[] | null>(null);
  const load = useCallback(() => void items.marketItems(cat).then(setList), [cat]);
  useEffect(() => {
    setList(null);
    load();
  }, [load]);
  return (
    <div className="mt-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(["all", "jewellery", "clothing", "book", "gadget", "home", "art", "fitness", "car"] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${cat === c ? "bg-ink text-white" : "bg-ink/5"}`}>
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {list === null ? (
        <div className="mt-2 h-32 animate-pulse rounded-2xl bg-ink/5" />
      ) : list.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-ink/[0.04] px-4 py-6 text-center text-sm text-muted">Nothing for sale here yet. Put something of yours up from Mine.</p>
      ) : (
        <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {list.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.name}</p>
                <p className="truncate text-xs text-muted">
                  {effectWords(i.effect)} · by {i.seller}
                  {i.maker ? ` · made by ${i.maker}` : ""} · worth {cash(i.worth)}
                </p>
              </div>
              <button
                disabled={busy || i.mine}
                onClick={() => void run(() => items.buyItem(i.id, i.price), `${i.name} is yours.`).then(() => load())}
                className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40"
              >
                {i.mine ? "Yours" : cash(i.price)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Make something new: name it, pick its kind, size and what it does; watch it go through its stages. */
function Craft({ me, prices, busy, run }: { me: MyThings | null; prices: Prices; busy: boolean; run: Run }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<keyof typeof KNOW_HOW>("jewellery");
  const [tier, setTier] = useState<CraftTier>("small");
  const [benefit, setBenefit] = useState<CraftBenefit>("mind");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  if (!me) return <div className="mt-3 h-40 animate-pulse rounded-2xl bg-ink/5" />;
  const t = CRAFT_TIERS.find((x) => x.id === tier)!;
  const skill = me.craftSkill[category] ?? 0.15;
  const hours = craftHours(tier, me.crafted);
  const cost = mintOf(t.value * t.copies * MATERIALS, prices);
  return (
    <div className="mt-3">
      {me.crafts.map((c) => {
        const start = Date.parse(c.startedAt);
        const end = Date.parse(c.endsAt);
        const f = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
        return (
          <div key={c.id} className="mb-2 rounded-2xl bg-ink/[0.04] p-3">
            <p className="text-sm font-semibold">{c.name}</p>
            <div className="mt-2 flex gap-1">
              {CRAFT_STAGES.map((s, k) => {
                const from = CRAFT_STAGES.slice(0, k).reduce((a, x) => a + x.share, 0);
                const fill = Math.max(0, Math.min(1, (f - from) / s.share));
                return (
                  <div key={s.id} className="flex-1" style={{ flexGrow: s.share }}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${fill * 100}%` }} />
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-muted">{s.label}</p>
                  </div>
                );
              })}
            </div>
            {now >= end ? (
              <button disabled={busy} onClick={() => void run(() => items.finishCraft(c.id), (r) => `${String(r.name ?? c.name)} is ready: a new kind of thing in Lagos, and the copies are yours.`)} className="mt-2 h-9 w-full rounded-full bg-gold text-sm font-semibold text-ink disabled:opacity-40">
                Collect it
              </button>
            ) : (
              <p className="mt-1 text-xs text-muted">Ready in {left(end - now)}</p>
            )}
          </div>
        );
      })}
      <div className="rounded-2xl ring-1 ring-ink/5 p-3">
        <p className="text-sm font-semibold">Make something new</p>
        <p className="text-xs text-muted">It becomes a new kind of thing in the game: keep it, sell it, and the more people buy it, the better your reputation.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Its name: Calm Beads, Lagos Hustle (a book)…" className="mt-2 h-10 w-full rounded-full bg-ink/5 px-4 text-sm outline-none ring-ink/20 focus:ring-2" />
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
          <select value={category} onChange={(e) => setCategory(e.target.value as keyof typeof KNOW_HOW)} className="h-9 rounded-full bg-ink/5 px-3 font-semibold" aria-label="Kind of thing">
            {(Object.keys(KNOW_HOW) as (keyof typeof KNOW_HOW)[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select value={benefit} onChange={(e) => setBenefit(e.target.value as CraftBenefit)} className="h-9 rounded-full bg-ink/5 px-3 font-semibold" aria-label="What it does">
            {(Object.keys(BENEFIT_LABEL) as CraftBenefit[]).map((b) => (
              <option key={b} value={b}>
                {BENEFIT_LABEL[b]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {CRAFT_TIERS.map((x) => (
            <button key={x.id} onClick={() => setTier(x.id)} className={`rounded-xl px-1 py-1.5 text-[11px] font-semibold ${tier === x.id ? "bg-ink text-white" : "bg-ink/5"}`}>
              {x.label}
              <span className="block font-normal opacity-70">×{x.copies}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Your skill at this: <b className="text-ink">{Math.round(skill * 100)}%</b> (from your education, your know-how in {KNOW_HOW[category].join(" and ")}, and {me.crafted} thing{me.crafted === 1 ? "" : "s"} made). Takes about {hours}h; materials {cash(cost)}; {t.copies} cop{t.copies === 1 ? "y" : "ies"}, each worth about {cash(mintOf(t.value * (0.5 + skill), prices))}.
        </p>
        <button
          disabled={busy || name.trim().length < 3 || me.crafts.length >= 2}
          onClick={() => void run(() => items.startCraft({ name, category, tier, benefit }), `Started: market research for ${name.trim()}.`).then((ok) => ok && setName(""))}
          className="mt-2 h-11 w-full rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-40"
        >
          {me.crafts.length >= 2 ? "Two under way already" : `Start making it · ${cash(cost)}`}
        </button>
      </div>
    </div>
  );
}

function left(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.04] px-2 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-display text-sm font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
