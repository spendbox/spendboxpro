"use client";

import { useEffect, useState } from "react";
import {
  Anchor,
  Apple,
  Armchair,
  Baby,
  Banknote,
  Bell,
  Bird,
  Book,
  Briefcase,
  Building2,
  Cake,
  Calendar,
  Camera,
  Candy,
  Car,
  Castle,
  ChefHat,
  Church,
  Clock,
  CloudRain,
  Coffee,
  Compass,
  Croissant,
  Crown,
  Dice5,
  Droplets,
  Dumbbell,
  Egg,
  Film,
  Fish,
  Flame,
  Flower2,
  Gamepad2,
  Gavel,
  Gem,
  Ghost,
  Gift,
  Goal,
  GraduationCap,
  Guitar,
  Headphones,
  Heart,
  IceCreamCone,
  Leaf,
  Lock,
  Map as MapIcon,
  Mic,
  Moon,
  Mountain,
  Music,
  Pencil,
  Pill,
  Pizza,
  Plane,
  Popcorn,
  Rabbit,
  Radio,
  Rocket,
  Sailboat,
  Scale,
  School,
  Scissors,
  Shirt,
  ShoppingCart,
  Shovel,
  Siren,
  Skull,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  Sun,
  Tent,
  Ticket,
  TrainFront,
  TreePine,
  Trees,
  Trophy,
  Turtle,
  Tv,
  Umbrella,
  Users,
  Utensils,
  Wallet,
  Waves,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, shuffle, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Picture Charades: picture clues appear one at a time (like someone acting it out). Guess the
// word from four. A wrong guess skips to the next word. 60 seconds. Score: words guessed.

const WORDS: [string, LucideIcon[]][] = [
  ["Wedding", [Heart, Church, Cake]],
  ["Birthday party", [Cake, Gift, Calendar]],
  ["Football match", [Goal, Trophy, Users]],
  ["Day at the beach", [Sun, Waves, Umbrella]],
  ["Rainy season", [CloudRain, Umbrella, Droplets]],
  ["Christmas", [Gift, TreePine, Bell]],
  ["Concert", [Music, Mic, Ticket]],
  ["Cinema", [Film, Popcorn, Ticket]],
  ["Hospital", [Stethoscope, Pill, Siren]],
  ["Airport", [Plane, Briefcase, Clock]],
  ["School", [Book, Pencil, School]],
  ["Bank", [Banknote, Lock, Building2]],
  ["Fishing trip", [Fish, Anchor, Sailboat]],
  ["Camping", [Tent, Flame, Mountain]],
  ["Cooking", [ChefHat, Utensils, Flame]],
  ["Pizza night", [Pizza, Tv, Users]],
  ["Space trip", [Rocket, Moon, Star]],
  ["Court case", [Gavel, Scale, Briefcase]],
  ["Shopping", [ShoppingCart, Wallet, Store]],
  ["Gym session", [Dumbbell, Clock, Trophy]],
  ["Road trip", [Car, MapIcon, Compass]],
  ["Gardening", [Flower2, Leaf, Shovel]],
  ["Baby shower", [Baby, Gift, Heart]],
  ["Breakfast", [Egg, Coffee, Croissant]],
  ["Picnic", [Apple, Sun, Trees]],
  ["Game night", [Dice5, Gamepad2, Users]],
  ["Royal palace", [Crown, Gem, Castle]],
  ["Treasure hunt", [MapIcon, Gem, Shovel]],
  ["Photo shoot", [Camera, Sparkles, Shirt]],
  ["Train journey", [TrainFront, Ticket, MapIcon]],
  ["Ice cream van", [IceCreamCone, Sun, Bell]],
  ["Fire station", [Flame, Siren, Building2]],
  ["Music lesson", [Guitar, Book, Music]],
  ["Market day", [Store, Banknote, Apple]],
  ["Graduation", [GraduationCap, School, Camera]],
  ["Halloween", [Ghost, Skull, Candy]],
  ["Radio show", [Radio, Mic, Headphones]],
  ["Zoo", [Turtle, Rabbit, Bird]],
  ["Haircut", [Scissors, Armchair, Sparkles]],
  ["Night out", [Moon, Music, Wine]],
];
const SECS = 60;
const CLUE_MS = 2200;

function nextWord(r: Rng, used: Set<number>) {
  let i = Math.floor(r() * WORDS.length);
  for (let k = 0; k < WORDS.length && used.has(i); k++) i = (i + 1) % WORDS.length;
  used.add(i);
  const others = shuffle(r, WORDS.map((_, j) => j).filter((j) => j !== i)).slice(0, 3);
  return { i, options: shuffle(r, [i, ...others]) };
}

export default function Charades({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const [r] = useState(() => makeRng(seed));
  const [used] = useState(() => new Set<number>());
  const [w, setW] = useState(() => nextWord(r, used));
  const [clues, setClues] = useState(1);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(SECS);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) finish(score);
  }, [left, score, finish]);
  useEffect(() => {
    if (clues >= 3 || picked !== null) return;
    const id = window.setTimeout(() => setClues((c) => c + 1), CLUE_MS);
    return () => window.clearTimeout(id);
  }, [clues, picked]);

  function guess(j: number) {
    if (picked !== null) return;
    setPicked(j);
    const ok = j === w.i;
    if (ok) setScore((s) => s + 1);
    playSfx(ok ? "chime" : "denied");
    window.setTimeout(() => {
      setW(nextWord(r, used));
      setClues(1);
      setPicked(null);
    }, 700);
  }

  const [, icons] = WORDS[w.i];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>{score} guessed</span>
        <span className="tabular-nums">{Math.max(0, left)}s</span>
      </div>
      <div className="flex h-36 items-center justify-center gap-4 rounded-3xl bg-[#fff4e6]">
        {icons.slice(0, clues).map((Icon, k) => (
          <span key={`${w.i}-${k}`} className="act-pop grid size-20 place-items-center rounded-2xl bg-white shadow">
            <Icon className="size-12 text-[#e8590c]" />
          </span>
        ))}
        {clues < 3 && <span className="grid size-20 place-items-center rounded-2xl border-2 border-dashed border-[#ffc078] text-2xl font-bold text-[#ffc078]">?</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {w.options.map((j) => (
          <button
            key={j}
            onClick={() => guess(j)}
            className={cn("rounded-2xl bg-panel-2 px-3 py-3 text-sm font-semibold", picked !== null && j === w.i && "bg-[#d3f9d8] ring-2 ring-me", picked === j && j !== w.i && "bg-[#ffe3e3]")}
          >
            {WORDS[j][0]}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-muted">A new clue every couple of seconds. Guess as early as you dare.</p>
    </div>
  );
}
