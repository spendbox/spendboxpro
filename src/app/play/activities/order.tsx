"use client";

import { useState } from "react";
import { Armchair, ChefHat, GlassWater, LoaderCircle, Minus, Plus, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/cn";
import { MENU, ORDER_MAX, priceLevel, type MenuItem } from "@/lib/world/menu";
import { cash } from "@/lib/world/value";
import { orderSomething } from "../activity-actions";
import { orderMeal } from "../food-actions";
import { playSfx } from "../sound";
import { useActivityRoom } from "./hub";
import { questEvent, refreshQuest } from "./quest-store";
import { BigButton, GameHeader, type GameProps } from "./ui";

// Ordering at a table (docs/FOOD.md): food and drinks at real Lagos prices (dearer at a hotel or a
// club than at a buka). Sit down first, pick up to six things, pay, and a waiter brings them to
// your table and sets them down in front of you. The room hears what you're having, and now and
// then the waiter slips you a side quest.

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
};

const TAB_ICON = { food: UtensilsCrossed, drink: GlassWater } as const;

export function Order({ where, ordering, ...props }: GameProps & { where: "restaurant" | "bar"; ordering?: Ordering }) {
  const [tab, setTab] = useState<"food" | "drink">(where === "bar" ? "drink" : "food");
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
        {(["food", "drink"] as const).map((t) => {
          const Icon = TAB_ICON[t];
          return (
            <button key={t} onClick={() => setTab(t)} className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold", tab === t ? "bg-panel shadow-sm" : "text-muted")}>
              <Icon className="size-4" /> {t === "food" ? "Food" : "Drinks"}
            </button>
          );
        })}
      </div>
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
    </div>
  );
}
