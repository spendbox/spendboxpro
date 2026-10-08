"use client";

import { useState } from "react";
import {
  Beef,
  CakeSlice,
  ChefHat,
  Cherry,
  Citrus,
  Cookie,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  GlassWater,
  Leaf,
  Martini,
  Milk,
  Soup,
  Star,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { orderSomething } from "../activity-actions";
import { playSfx } from "../sound";
import { useActivityRoom } from "./hub";
import { questEvent, refreshQuest } from "./quest-store";
import { BigButton, GameHeader, type GameProps, nowMs, rand } from "./ui";

// The restaurant menu and the mocktail bar. Everything's on the house: order something and you
// get a little card about it (and the room hears what you're having). Now and then the waiter
// slips you a side quest.

type Item = { name: string; blurb: string; icon: React.ComponentType<{ className?: string }>; color: string };

const MENU: Item[] = [
  { name: "Party jollof rice", blurb: "Smoky, peppery, with fried plantain on the side.", icon: Soup, color: "#e5484d" },
  { name: "Pounded yam & egusi", blurb: "Soft, stretchy yam and a rich melon-seed soup.", icon: Soup, color: "#f5a524" },
  { name: "Suya platter", blurb: "Spicy grilled beef with onions and yaji pepper.", icon: Beef, color: "#a0522d" },
  { name: "Pepper soup", blurb: "Hot, spicy and comforting. Mind your tongue!", icon: Soup, color: "#d9480f" },
  { name: "Moi moi & pap", blurb: "Steamed bean pudding with smooth, warm pap.", icon: Egg, color: "#e8590c" },
  { name: "Ofada rice & ayamase", blurb: "Local rice with a green pepper stew that bites back.", icon: Leaf, color: "#2b8a3e" },
  { name: "Asun", blurb: "Peppered goat meat, smoky and sticky.", icon: Drumstick, color: "#c92a2a" },
  { name: "Grilled fish & chips", blurb: "Whole croaker, grilled with pepper sauce.", icon: Fish, color: "#1971c2" },
  { name: "Akara & bread", blurb: "Crispy bean fritters in a soft roll.", icon: Wheat, color: "#e67700" },
  { name: "Efo riro & semo", blurb: "Leafy vegetable soup packed with goodies.", icon: Leaf, color: "#2f9e44" },
  { name: "Puff-puff", blurb: "Warm, sugary dough balls. Nobody can eat just one.", icon: Cookie, color: "#f59f00" },
  { name: "Chin chin & cake", blurb: "Crunchy chin chin and a slice of birthday cake.", icon: CakeSlice, color: "#e64980" },
];

const BAR: Item[] = [
  { name: "Chapman", blurb: "The classic: fizzy, fruity, with cucumber and a cherry.", icon: Cherry, color: "#e03131" },
  { name: "Zobo cooler", blurb: "Hibiscus, ginger and pineapple over ice.", icon: GlassWater, color: "#a61e4d" },
  { name: "Kunun aya", blurb: "Creamy tiger-nut milk with a hint of dates.", icon: Milk, color: "#d9a441" },
  { name: "Pineapple-ginger fizz", blurb: "Sweet, spicy and very cold.", icon: Citrus, color: "#f59f00" },
  { name: "Virgin mojito", blurb: "Lime, mint and soda. Zero drama.", icon: Martini, color: "#2f9e44" },
  { name: "Sunset mocktail", blurb: "Orange, grenadine and a little umbrella.", icon: Martini, color: "#f76707" },
  { name: "Coconut breeze", blurb: "Coconut water, lime and crushed ice.", icon: CupSoda, color: "#0c8599" },
  { name: "Fura smoothie", blurb: "Millet balls blended with cold fresh milk.", icon: Milk, color: "#868e96" },
];

const CHEF_LINES = [
  "The chef says it's their grandmother's recipe.",
  "Served piping hot. Blow before you bite!",
  "The table next to you is staring. They want some.",
  "The waiter winks. Extra portion, on the house.",
  "Perfect fuel for a long night of hiding.",
  "Hunters can't search on an empty stomach either.",
];

export function Order({ where, ...props }: GameProps & { where: "restaurant" | "bar" }) {
  const items = where === "bar" ? BAR : MENU;
  const [served, setServed] = useState<{ item: Item; stars: number; line: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyUntil, setBusyUntil] = useState(0);
  const room = useActivityRoom(props.roundId, props.roomId, props.me);

  async function order(item: Item) {
    if (nowMs() < busyUntil) return;
    setBusyUntil(nowMs() + 8000);
    setNote(null);
    setServed({ item, stars: 4 + Math.round(rand()), line: CHEF_LINES[Math.floor(rand() * CHEF_LINES.length)] });
    playSfx("pop");
    questEvent({ type: "order", where, room: props.roomId });
    if (props.me) {
      room.send({ t: "toast", icon: where === "bar" ? "drink" : "food", from: props.me.id, text: `${props.me.name} is having ${item.name}.` });
      const res = await orderSomething();
      if (res.ok && res.quest) {
        setNote(`The waiter slipped you a note: a side quest! "${res.quest.title}"`);
        refreshQuest();
        playSfx("levelup");
      }
    }
  }

  return (
    <div className="space-y-3">
      <GameHeader
        icon={where === "bar" ? Martini : UtensilsCrossed}
        title={where === "bar" ? "Mocktail bar" : "Menu"}
        sub={props.label}
        onClose={props.onClose}
        color={where === "bar" ? "#0c8599" : "#e8590c"}
      />
      {served ? (
        <div className="act-pop space-y-3 rounded-3xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${served.item.color}, #18202b)` }}>
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-white/15">
              <served.item.icon className="size-8" />
            </span>
            <div>
              <p className="font-display text-xl font-bold">{served.item.name}</p>
              <p className="flex gap-0.5 text-gold">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="size-4" fill={i < served.stars ? "currentColor" : "none"} />
                ))}
              </p>
            </div>
          </div>
          <p className="text-sm text-white/85">{served.item.blurb}</p>
          <p className="flex items-center gap-2 text-sm italic text-white/75">
            <ChefHat className="size-4 shrink-0" /> {served.line}
          </p>
          {note && <p className="act-pop rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-ink">{note}</p>}
          <BigButton tone="soft" onClick={() => setServed(null)}>
            Order something else
          </BigButton>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">Everything is on the house. Tap to order.</p>
          <ul className="grid gap-2">
            {items.map((it) => (
              <li key={it.name}>
                <button onClick={() => void order(it)} className="flex w-full items-center gap-3 rounded-2xl bg-panel-2 px-3 py-2.5 text-left hover:bg-gold/15">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: it.color }}>
                    <it.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{it.name}</span>
                    <span className={cn("block truncate text-xs text-muted")}>{it.blurb}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
