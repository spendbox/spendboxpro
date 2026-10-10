"use client";

import { useEffect, useRef, useState } from "react";
import { Beef, Carrot, Drumstick, Egg, Fish, Flame, Leaf, Sandwich, Soup, Trash2, Wheat, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, pick, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Order Up: tickets come in. Tap the ingredients the first ticket needs (any order), then
// Serve. Wrong plates go in the bin. Tickets that wait too long walk out. 90 seconds. Score:
// orders served.

type Ing = { id: string; label: string; icon: LucideIcon; colour: string };
const ING: Ing[] = [
  { id: "rice", label: "Rice", icon: Wheat, colour: "#f8f9fa" },
  { id: "tomato", label: "Tomato", icon: Leaf, colour: "#e03131" },
  { id: "pepper", label: "Pepper", icon: Flame, colour: "#e8590c" },
  { id: "chicken", label: "Chicken", icon: Drumstick, colour: "#f59f00" },
  { id: "beef", label: "Beef", icon: Beef, colour: "#a61e4d" },
  { id: "fish", label: "Fish", icon: Fish, colour: "#1c7ed6" },
  { id: "egg", label: "Egg", icon: Egg, colour: "#fab005" },
  { id: "plantain", label: "Plantain", icon: Carrot, colour: "#fcc419" },
  { id: "bread", label: "Bread", icon: Sandwich, colour: "#c0793d" },
  { id: "soup", label: "Soup", icon: Soup, colour: "#2f9e44" },
];
const DISHES: { name: string; needs: string[] }[] = [
  { name: "Jollof rice", needs: ["rice", "tomato", "pepper"] },
  { name: "Jollof and chicken", needs: ["rice", "tomato", "pepper", "chicken"] },
  { name: "Fried rice and fish", needs: ["rice", "fish", "egg"] },
  { name: "Dodo and egg", needs: ["plantain", "egg"] },
  { name: "Suya wrap", needs: ["beef", "pepper", "bread"] },
  { name: "Pepper soup", needs: ["soup", "pepper", "fish"] },
  { name: "Egg sandwich", needs: ["bread", "egg", "tomato"] },
  { name: "Chicken and chips", needs: ["chicken", "plantain"] },
  { name: "Burger", needs: ["bread", "beef", "tomato"] },
  { name: "Egusi soup", needs: ["soup", "beef", "pepper"] },
];
const SECS = 90;

type Ticket = { id: number; dish: (typeof DISHES)[number]; at: number; patience: number };

export default function Orders({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const r = useRef<Rng>(makeRng(seed));
  const nextId = useRef(1);
  const [now, setNow] = useState(0);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [plate, setPlate] = useState<string[]>([]);
  const [served, setServed] = useState(0);
  const [lost, setLost] = useState(0);
  const [note, setNote] = useState("");
  const done = useRef(false);

  // The clock and new tickets.
  useEffect(() => {
    const id = window.setInterval(() => setNow((t) => t + 0.25), 250);
    return () => window.clearInterval(id);
  }, []);
  const ticketsRef = useRef<Ticket[]>([]);
  useEffect(() => {
    ticketsRef.current = tickets;
  });
  useEffect(() => {
    if (done.current) return;
    if (now >= SECS) {
      done.current = true;
      finish(served);
      return;
    }
    const ts = ticketsRef.current;
    let next = ts.filter((t) => now - t.at < t.patience);
    const gone = ts.length - next.length;
    const gap = Math.max(4, 9 - now / 15);
    const last = next.length ? Math.max(...next.map((t) => t.at)) : -99;
    if (next.length < 4 && (now - last >= gap || next.length === 0)) {
      next = [...next, { id: nextId.current++, dish: pick(r.current, DISHES.slice(0, 4 + Math.min(6, Math.floor(now / 10)))), at: now, patience: Math.max(16, 30 - now / 8) }];
    }
    if (next.length === ts.length && !gone) return;
    const id = window.setTimeout(() => {
      setTickets(next);
      if (gone) {
        setLost((l) => l + gone);
        setNote("A customer walked out!");
        playSfx("denied");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [now, served, finish]);

  const first = tickets[0];
  function add(id: string) {
    if (plate.includes(id) || plate.length >= 5) return;
    playSfx("tick");
    setPlate([...plate, id]);
  }
  function serve() {
    if (!first) return;
    const ok = first.dish.needs.length === plate.length && first.dish.needs.every((n) => plate.includes(n));
    if (ok) {
      setServed((s) => s + 1);
      setTickets((ts) => ts.slice(1));
      const quick = now - first.at < first.patience / 2;
      setNote(quick ? "Served hot! Great tip." : "Served!");
      playSfx("found");
    } else {
      setNote("That's not what they ordered. Binned!");
      playSfx("denied");
    }
    setPlate([]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>{served} served</span>
        <span className="text-[#ff8787]">{lost} walked out</span>
        <span className="tabular-nums">{Math.max(0, Math.ceil(SECS - now))}s</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tickets.map((t, i) => {
          const left = 1 - (now - t.at) / t.patience;
          return (
            <div key={t.id} className={cn("w-32 shrink-0 rounded-2xl border-2 bg-[#fff9db] p-2 text-xs", i === 0 ? "border-[#e8590c]" : "border-transparent opacity-80")}>
              <p className="font-bold">{t.dish.name}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {t.dish.needs.map((n) => {
                  const ing = ING.find((x) => x.id === n)!;
                  return (
                    <span key={n} className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", i === 0 && plate.includes(n) ? "bg-me text-white" : "bg-white")}>
                      {ing.label}
                    </span>
                  );
                })}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, left) * 100}%`, background: left > 0.4 ? "#2f9e44" : "#e03131" }} />
              </div>
            </div>
          );
        })}
        {!tickets.length && <p className="p-3 text-sm text-muted">Waiting for orders…</p>}
      </div>
      <div className="flex min-h-14 items-center gap-2 rounded-2xl bg-[#343a40] p-2">
        <span className="pl-2 text-xs font-bold text-white/60">Plate:</span>
        {plate.map((p) => {
          const ing = ING.find((x) => x.id === p)!;
          return (
            <span key={p} className="act-pop grid size-9 place-items-center rounded-full bg-white">
              <ing.icon className="size-5" style={{ color: ing.colour === "#f8f9fa" ? "#868e96" : ing.colour }} />
            </span>
          );
        })}
        <span className="flex-1" />
        <button onClick={() => setPlate([])} className="grid size-10 place-items-center rounded-xl bg-white/10 text-white" aria-label="Bin the plate">
          <Trash2 className="size-5" />
        </button>
        <button onClick={serve} disabled={!plate.length} className="rounded-xl bg-me px-4 py-2 font-bold text-white disabled:opacity-40">
          Serve
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {ING.map((ing) => (
          <button key={ing.id} onClick={() => add(ing.id)} className={cn("flex flex-col items-center gap-0.5 rounded-2xl bg-panel-2 py-2 text-[10px] font-semibold", plate.includes(ing.id) && "opacity-40")}>
            <ing.icon className="size-6" style={{ color: ing.colour === "#f8f9fa" ? "#868e96" : ing.colour }} />
            {ing.label}
          </button>
        ))}
      </div>
      <p className="h-5 text-center text-sm font-semibold text-muted">{note}</p>
    </div>
  );
}
