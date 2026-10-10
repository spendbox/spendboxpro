"use client";

import { useEffect, useState } from "react";
import {
  Anchor,
  Apple,
  Banana,
  Bell,
  Bike,
  Bird,
  Bone,
  Book,
  Bus,
  Cake,
  Camera,
  Car,
  Carrot,
  Castle,
  Cat,
  Cherry,
  Clock,
  Cloud,
  Coffee,
  Crown,
  Dog,
  Drum,
  Feather,
  Fish,
  Flag,
  Flower2,
  Ghost,
  Gift,
  Glasses,
  Guitar,
  Hammer,
  Headphones,
  Heart,
  House,
  IceCreamCone,
  Key,
  Laptop,
  Leaf,
  Lightbulb,
  Lollipop,
  Moon,
  Mountain,
  Pencil,
  Pizza,
  Plane,
  Rabbit,
  Rocket,
  Scissors,
  Shell,
  Ship,
  Shirt,
  Smartphone,
  Snail,
  Snowflake,
  Star,
  Sun,
  Tent,
  TrainFront,
  TreePine,
  Trophy,
  Turtle,
  Tv,
  Umbrella,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, shuffle, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Draw and Guess: a picture is drawn line by line in front of you. Pick what it is before it's
// finished (the sooner, the better: a guess while it's still being drawn counts double). A
// wrong guess moves on. 75 seconds. Score: drawings guessed (early guesses count 2).

const THINGS: [string, LucideIcon][] = [
  ["Fish", Fish], ["Bird", Bird], ["Cat", Cat], ["Dog", Dog], ["Car", Car], ["Bus", Bus], ["Plane", Plane], ["Rocket", Rocket],
  ["House", House], ["Umbrella", Umbrella], ["Sun", Sun], ["Moon", Moon], ["Star", Star], ["Heart", Heart], ["Key", Key], ["Bell", Bell],
  ["Clock", Clock], ["Crown", Crown], ["Gift", Gift], ["Cake", Cake], ["Apple", Apple], ["Banana", Banana], ["Cherry", Cherry], ["Carrot", Carrot],
  ["Guitar", Guitar], ["Drum", Drum], ["Camera", Camera], ["Phone", Smartphone], ["Laptop", Laptop], ["Television", Tv], ["Book", Book], ["Pencil", Pencil],
  ["Scissors", Scissors], ["Anchor", Anchor], ["Mountain", Mountain], ["Tree", TreePine], ["Flower", Flower2], ["Leaf", Leaf], ["Tent", Tent], ["Flag", Flag],
  ["Hammer", Hammer], ["Ship", Ship], ["Train", TrainFront], ["Bicycle", Bike], ["Trophy", Trophy], ["Glasses", Glasses], ["T-shirt", Shirt], ["Ice cream", IceCreamCone],
  ["Pizza", Pizza], ["Coffee", Coffee], ["Light bulb", Lightbulb], ["Snowflake", Snowflake], ["Cloud", Cloud], ["Turtle", Turtle], ["Rabbit", Rabbit], ["Snail", Snail],
  ["Ghost", Ghost], ["Castle", Castle], ["Headphones", Headphones], ["Watch", Watch], ["Bone", Bone], ["Feather", Feather], ["Shell", Shell], ["Lollipop", Lollipop],
];
const SECS = 75;
const DRAW_S = 6;

function nextThing(r: Rng) {
  const i = Math.floor(r() * THINGS.length);
  const others = shuffle(r, THINGS.map((_, j) => j).filter((j) => j !== i)).slice(0, 3);
  return { i, options: shuffle(r, [i, ...others]), at: Date.now() };
}

export default function DrawGuess({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const [r] = useState(() => makeRng(seed));
  const [t, setT] = useState(() => nextThing(r));
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(SECS);
  const [picked, setPicked] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) finish(score);
  }, [left, score, finish]);
  useEffect(() => {
    const id = window.setTimeout(() => setDrawn(true), DRAW_S * 1000);
    return () => window.clearTimeout(id);
  }, [t]);

  function guess(j: number) {
    if (picked !== null) return;
    setPicked(j);
    const ok = j === t.i;
    if (ok) setScore((s) => s + (drawn ? 1 : 2));
    playSfx(ok ? "chime" : "denied");
    window.setTimeout(() => {
      setT(nextThing(r));
      setPicked(null);
      setDrawn(false);
    }, 700);
  }

  const Icon = THINGS[t.i][1];
  return (
    <div className="space-y-3">
      <style>{`.mg-draw svg * { stroke-dasharray: 80; stroke-dashoffset: 80; animation: mg-draw ${DRAW_S}s linear forwards; }
.mg-draw svg *:nth-child(2) { animation-delay: .8s } .mg-draw svg *:nth-child(3) { animation-delay: 1.6s } .mg-draw svg *:nth-child(4) { animation-delay: 2.4s } .mg-draw svg *:nth-child(5) { animation-delay: 3.2s }
@keyframes mg-draw { to { stroke-dashoffset: 0 } }`}</style>
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>{score} points</span>
        <span className="text-xs text-white/70">{drawn ? "Finished: 1 point" : "Still drawing: 2 points"}</span>
        <span className="tabular-nums">{Math.max(0, left)}s</span>
      </div>
      <div className="mg-draw grid h-48 place-items-center rounded-3xl bg-white shadow-inner" key={t.at}>
        <Icon className="size-36 text-[#343a40]" strokeWidth={1.5} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {t.options.map((j) => (
          <button
            key={j}
            onClick={() => guess(j)}
            className={cn("rounded-2xl bg-panel-2 px-3 py-3 text-sm font-semibold", picked !== null && j === t.i && "bg-[#d3f9d8] ring-2 ring-me", picked === j && j !== t.i && "bg-[#ffe3e3]")}
          >
            {THINGS[j][0]}
          </button>
        ))}
      </div>
    </div>
  );
}
