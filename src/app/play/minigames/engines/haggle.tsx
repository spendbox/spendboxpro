"use client";

import { useState } from "react";
import { Footprints, Handshake, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, pick, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Market Haggle: five things to buy. The seller asks a price; you make an offer. Offer at or
// above their secret lowest price and it's a deal (the less you pay, the more you save). Too low
// and they counter, and lose patience; lowball them and they lose it fast. When their patience
// is gone they walk away (you save nothing). Score: total saved.

const ITEMS = ["Ankara shirt", "Pair of trainers", "Woven basket", "Phone case", "Bag of rice", "Bluetooth speaker", "Wristwatch", "Leather sandals", "Wall clock", "Football", "Sunglasses", "Tote bag", "Head wrap", "Cooking pot"];
const SELLERS = ["Mama Nkechi", "Uncle Kwesi", "Aunty Bisi", "Mr Otieno", "Sister Ama", "Baba Tunde"];
const TIPS = ["Start low, but not too low.", "Every counter-offer is closer to their real price.", "Lowballing loses patience twice as fast."];
const MOODS = ["Ah, you want to finish me!", "My customer, add something.", "This one is original o!", "Ehen? You're joking.", "I'll make small reduction for you."];

type Deal = { item: string; seller: string; ask: number; floor: number; patience: number; counter: number; offers: number };

function makeDeal(r: Rng): Deal {
  const ask = Math.round((120 + r() * 300) / 5) * 5;
  const floor = Math.round((ask * (0.55 + r() * 0.25)) / 5) * 5;
  return { item: pick(r, ITEMS), seller: pick(r, SELLERS), ask, floor, patience: 3, counter: ask, offers: 0 };
}

export default function Haggle({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const rounds = Number(cfg.rounds ?? 5);
  const [r] = useState(() => makeRng(seed));
  const [n, setN] = useState(0);
  const [deal, setDeal] = useState(() => makeDeal(r));
  const [offer, setOffer] = useState(() => Math.round((deal.ask * 0.6) / 5) * 5);
  const [saved, setSaved] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [closed, setClosed] = useState<"deal" | "walked" | null>(null);

  function next(total: number) {
    window.setTimeout(() => {
      if (n + 1 >= rounds) return finish(total);
      const d = makeDeal(r);
      setN(n + 1);
      setDeal(d);
      setOffer(Math.round((d.ask * 0.6) / 5) * 5);
      setLog([]);
      setClosed(null);
    }, 1600);
  }

  function make() {
    if (closed) return;
    const d = { ...deal, offers: deal.offers + 1 };
    if (offer >= d.floor || offer >= d.counter) {
      const paid = Math.min(offer, d.counter);
      const s = d.ask - paid;
      setSaved(saved + s);
      setLog((l) => [...l, `You: ₥${offer}`, `${d.seller}: Deal! ₥${paid}. You saved ₥${s}.`]);
      setClosed("deal");
      playSfx("found");
      setDeal(d);
      return next(saved + s);
    }
    // Too low: they lose patience (a lot, for a lowball) and counter.
    d.patience -= offer < d.floor * 0.6 ? 2 : 1;
    if (d.patience <= 0) {
      setLog((l) => [...l, `You: ₥${offer}`, `${d.seller}: No. Go and buy somewhere else!`]);
      setClosed("walked");
      playSfx("denied");
      setDeal(d);
      return next(saved);
    }
    const gap = d.counter - d.floor;
    d.counter = Math.max(d.floor, Math.round((d.counter - gap * (0.3 + r() * 0.35)) / 5) * 5);
    setLog((l) => [...l, `You: ₥${offer}`, `${d.seller}: ${pick(r, MOODS)} Last price ₥${d.counter}.`]);
    playSfx("tick");
    setDeal(d);
  }

  const bump = (k: number) => setOffer((o) => Math.max(5, Math.min(deal.ask, o + k)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>
          Item {n + 1} of {rounds}
        </span>
        <span className="text-[#69db7c]">Saved ₥{saved}</span>
      </div>
      <div className="rounded-2xl bg-[#fff3bf] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{deal.seller} is selling</p>
        <p className="font-display text-xl font-bold">{deal.item}</p>
        <p className="text-sm">
          Asking <b>₥{deal.ask}</b> · now <b>₥{deal.counter}</b>
        </p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          Patience:
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={cn("size-2.5 rounded-full", i < deal.patience ? "bg-[#f08c00]" : "bg-line")} />
          ))}
        </div>
      </div>
      <div className="max-h-32 space-y-1 overflow-y-auto text-sm">
        {log.map((l, i) => (
          <p key={i} className={cn("rounded-xl px-3 py-1.5", l.startsWith("You") ? "ml-8 bg-[#d0ebff]" : "mr-8 bg-panel-2")}>
            {l}
          </p>
        ))}
      </div>
      {!closed ? (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => bump(-10)} className="grid size-11 place-items-center rounded-xl bg-panel-2" aria-label="Offer less">
              <Minus className="size-5" />
            </button>
            <input type="range" min={5} max={deal.counter} step={5} value={Math.min(offer, deal.counter)} onChange={(e) => setOffer(Number(e.target.value))} className="flex-1" aria-label="Your offer" />
            <button onClick={() => bump(10)} className="grid size-11 place-items-center rounded-xl bg-panel-2" aria-label="Offer more">
              <Plus className="size-5" />
            </button>
          </div>
          <button onClick={make} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-me py-3 font-bold text-white">
            <Handshake className="size-5" /> Offer ₥{Math.min(offer, deal.counter)}
          </button>
        </>
      ) : (
        <p className={cn("flex items-center justify-center gap-2 rounded-2xl py-3 font-bold", closed === "deal" ? "bg-[#d3f9d8] text-[#2b8a3e]" : "bg-[#ffe3e3] text-[#c92a2a]")}>
          {closed === "deal" ? <Handshake className="size-5" /> : <Footprints className="size-5" />}
          {closed === "deal" ? "Deal!" : "They walked away"}
        </p>
      )}
      <p className="text-center text-xs text-muted">{TIPS[n % TIPS.length]}</p>
    </div>
  );
}
