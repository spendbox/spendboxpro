"use client";

import { useState } from "react";
import { Armchair, ChefHat, GlassWater, LoaderCircle, Minus, Plus, Sparkles, UtensilsCrossed, Wine } from "lucide-react";
import { cn } from "@/lib/cn";
import { MENU, ORDER_MAX, priceLevel, type MenuItem } from "@/lib/world/menu";
import { BOTTLES, BOTTLES_MAX, bottleLevel, bottleWords } from "@/lib/world/bottles";
import { cash } from "@/lib/world/value";
import { orderSomething } from "../activity-actions";
import { orderBottles, orderMeal } from "../food-actions";
import { playSfx } from "../sound";
import { useActivityRoom } from "./hub";
import { questEvent, refreshQuest } from "./quest-store";
import { BigButton, GameHeader, type GameProps } from "./ui";

// Ordering at a table (docs/FOOD.md): food and drinks at real Lagos prices (dearer at a hotel or a
// club than at a buka). Sit down first, pick up to six things, pay, and a waiter brings them to
// your table and sets them down in front of you. The room hears what you're having, and now and
// then the waiter slips you a side quest. In a club, bottle service too: a line of hostesses brings
// the bottles with sparklers and your name on a light-up sign, and the whole club sees it.

/** Where you're ordering: the map, the place, what stands there, whether you're sitting, and what happens once it's paid. */
export type Ordering = {
  region: string | null;
  place: string | null;
  /** What stands there (a hotel, a club, a restaurant...), for the price level. */
  where: string | null;
  seated: boolean;
  perMint: number;
  /** Paid: the waiter brings these (menu ids). */
  onServed: (ids: string[]) => void;
  onPaid?: () => void;
  /** Your seat ("<room>:seat:<n>"), for the bottle parade. */
  seat?: string | null;
  /** In a club: its price at the door (naira), which sets the bottle prices. */
  door?: number;
  /** Bottles paid for: the hostesses bring them to your seat (bottle ids). */
  onBottles?: (ids: string[]) => void;
};

const TAB_ICON = { food: UtensilsCrossed, drink: GlassWater, bottles: Wine } as const;
const TAB_LABEL = { food: "Food", drink: "Drinks", bottles: "Bottles" } as const;

export function Order({ where, ordering, ...props }: GameProps & { where: "restaurant" | "bar"; ordering?: Ordering }) {
  const club = ordering?.where === "club";
  const [tab, setTab] = useState<"food" | "drink" | "bottles">(club ? "bottles" : where === "bar" ? "drink" : "food");
  const [bottles, setBottles] = useState<string[]>([]);
  const [basket, setBasket] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const room = useActivityRoom(props.roundId, props.roomId, props.me);
  const level = priceLevel(ordering?.where);
  const perMint = ordering?.perMint ?? 1_500;
  const priceOf = (m: MenuItem) => (m.naira * level) / perMint;
  const total = basket.reduce((t, id) => t + priceOf(MENU.find((m) => m.id === id)!), 0);
  const seated = ordering?.seated ?? false;
  const count = (id: string) => basket.filter((b) => b === id).length;
  const add = (id: string) => setBasket((b) => (b.length >= ORDER_MAX ? b : [...b, id]));
  const remove = (id: string) =>
    setBasket((b) => {
      const k = b.lastIndexOf(id);
      return k < 0 ? b : [...b.slice(0, k), ...b.slice(k + 1)];
    });

  const bLevel = bottleLevel(ordering?.door ?? 0);
  const bottleTotal = bottles.reduce((t, id) => t + (BOTTLES.find((b) => b.id === id)!.naira * bLevel) / perMint, 0);
  const bCount = (id: string) => bottles.filter((b) => b === id).length;

  async function orderTheBottles() {
    if (!bottles.length || busy) return;
    if (!seated || !ordering?.seat) return setNote({ text: "Sit at a table first (tap a glowing seat in a booth), then order: the bottles come to you.", good: false });
    if (!ordering.region || !ordering.place) return setNote({ text: "Bottle service is on the real map.", good: false });
    setBusy(true);
    setNote(null);
    const r = await orderBottles(ordering.region, ordering.place, bottles).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!r.ok) return setNote({ text: r.error, good: false });
    ordering.onPaid?.();
    playSfx("levelup");
    if (props.me) {
      room.send({ t: "bottles", from: props.me, seat: ordering.seat, ids: bottles, naira: r.naira });
      room.send({ t: "toast", icon: "drink", from: props.me.id, text: `🍾 ${props.me.name} ordered ${bottleWords(bottles)}!` });
    }
    // Here they come: close the menu so you can watch.
    ordering.onBottles?.(bottles);
    props.onClose();
  }

  async function order() {
    if (!basket.length || busy) return;
    if (!seated) return setNote({ text: "Sit down first: tap a glowing chair at a table, then order.", good: false });
    setBusy(true);
    setNote(null);
    // On the real map it's paid for; elsewhere (the old hourly game) it's on the house.
    if (ordering?.region && ordering.place) {
      const r = await orderMeal(ordering.region, ordering.place, basket).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
      if (!r.ok) {
        setBusy(false);
        return setNote({ text: r.error, good: false });
      }
      ordering.onPaid?.();
    }
    playSfx("pop");
    questEvent({ type: "order", where, room: props.roomId });
    const names = basket.map((id) => MENU.find((m) => m.id === id)!.name);
    if (props.me) {
      room.send({ t: "toast", icon: tab === "drink" ? "drink" : "food", from: props.me.id, text: `${props.me.name} ordered ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}.` });
      const res = await orderSomething().catch(() => null);
      if (res?.ok && res.quest) {
        refreshQuest();
        playSfx("levelup");
      }
    }
    setBusy(false);
    // The waiter's on the way: close the menu so you can watch him come.
    ordering?.onServed(basket);
    props.onClose();
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={UtensilsCrossed} title="Order food & drinks" sub={props.label} onClose={props.onClose} color="#e8590c" />
      {!seated && (
        <p className="flex items-center gap-2 rounded-2xl bg-gold/15 px-3 py-2 text-sm">
          <Armchair className="size-4 shrink-0 text-gold-dark" /> Sit at a table first (tap a glowing chair), then order. The waiter brings it to you.
        </p>
      )}
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {(club ? (["bottles", "drink", "food"] as const) : (["food", "drink"] as const)).map((t) => {
          const Icon = TAB_ICON[t];
          return (
            <button key={t} onClick={() => setTab(t)} className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold", tab === t ? "bg-panel shadow-sm" : "text-muted")}>
              <Icon className="size-4" /> {TAB_LABEL[t]}
            </button>
          );
        })}
      </div>
      {tab === "bottles" ? (
        <>
          <p className="flex items-center gap-2 rounded-2xl bg-[#1a1022] px-3 py-2 text-xs text-white">
            <Sparkles className="size-4 shrink-0 text-[#ffd43b]" /> Bottle service: the hostesses bring them to your table with sparklers and your name in lights, for the whole club to see.
          </p>
          <ul className="grid max-h-[42vh] gap-2 overflow-y-auto">
            {BOTTLES.map((b) => {
              const k = bCount(b.id);
              return (
                <li key={b.id} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5", k ? "bg-gold/15" : "bg-panel-2")}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: `#${b.look.glass.toString(16).padStart(6, "0")}`, boxShadow: `inset 0 -10px 0 #${b.look.label.toString(16).padStart(6, "0")}` }}>
                    <Wine className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{b.name}</span>
                    <span className="block truncate text-xs text-muted">{b.blurb}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums">{cash((b.naira * bLevel) / perMint)}</span>
                  {k > 0 && (
                    <button onClick={() => setBottles((list) => { const i = list.lastIndexOf(b.id); return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)]; })} className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/10" aria-label={`One less ${b.name}`}>
                      <Minus className="size-4" />
                    </button>
                  )}
                  {k > 0 && <span className="w-4 shrink-0 text-center text-sm font-bold">{k}</span>}
                  <button onClick={() => setBottles((list) => (list.length >= BOTTLES_MAX ? list : [...list, b.id]))} disabled={bottles.length >= BOTTLES_MAX} className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-30" aria-label={`Add ${b.name}`}>
                    <Plus className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {note && <p className={cn("rounded-xl px-3 py-2 text-sm font-semibold", note.good ? "bg-me/10 text-me" : "bg-hit/10 text-hit")}>{note.text}</p>}
          <BigButton onClick={() => void orderTheBottles()} disabled={!bottles.length || busy || !seated}>
            {busy ? <LoaderCircle className="size-5 animate-spin" /> : bottles.length ? `Bring ${bottles.length} bottle${bottles.length > 1 ? "s" : ""} · ${cash(bottleTotal)}` : "Pick your bottles"}
          </BigButton>
          {bLevel > 1 && <p className="text-center text-xs text-muted">Prices here are {bLevel}× an ordinary club&apos;s: it&apos;s that kind of club.</p>}
        </>
      ) : (
        <>
      <ul className="grid max-h-[46vh] gap-2 overflow-y-auto">
        {MENU.filter((m) => m.kind === tab).map((m) => {
          const n = count(m.id);
          return (
            <li key={m.id} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5", n ? "bg-gold/15" : "bg-panel-2")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: `#${m.dish.color.toString(16).padStart(6, "0")}` }}>
                {m.kind === "drink" ? <GlassWater className="size-5" /> : <ChefHat className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{m.name}</span>
                <span className="block truncate text-xs text-muted">{m.blurb}</span>
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums">{cash(priceOf(m))}</span>
              {n > 0 && (
                <button onClick={() => remove(m.id)} className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/10" aria-label={`One less ${m.name}`}>
                  <Minus className="size-4" />
                </button>
              )}
              {n > 0 && <span className="w-4 shrink-0 text-center text-sm font-bold">{n}</span>}
              <button onClick={() => add(m.id)} disabled={basket.length >= ORDER_MAX} className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-30" aria-label={`Add ${m.name}`}>
                <Plus className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {note && <p className={cn("rounded-xl px-3 py-2 text-sm font-semibold", note.good ? "bg-me/10 text-me" : "bg-hit/10 text-hit")}>{note.text}</p>}
      <BigButton onClick={() => void order()} disabled={!basket.length || busy || !seated}>
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : basket.length ? `Order ${basket.length} for ${cash(total)}` : "Pick something to order"}
      </BigButton>
      {level > 1 && <p className="text-center text-xs text-muted">Prices here are {level}× a buka&apos;s: it&apos;s that kind of place.</p>}
        </>
      )}
    </div>
  );
}
