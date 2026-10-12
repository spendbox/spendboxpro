"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Check, MapPin, Search } from "lucide-react";
import type { AdPlace, LeaseOffer } from "@/lib/business";
import { LEASE_MIN } from "@/lib/world/business";
import { findBuildings } from "../../business/actions";
import { LeaseForm } from "../../business/lease-form";

// Advertising, step by step (docs/BUSINESS.md): 1 how it works, with pictures; 2 find a building
// that's free (search an area, set a budget); 3 your business and pay (the lease form, Paystack).

const STEPS = ["How it works", "Find a building", "Your business & pay"];
const BUDGETS = [
  { label: "Any price", max: 0 },
  { label: "Up to ₦50k", max: 50_000 },
  { label: "Up to ₦100k", max: 100_000 },
  { label: "Up to ₦250k", max: 250_000 },
];
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function AdWizard({ places, start, startError, canPay }: { places: AdPlace[]; start: LeaseOffer | null; startError: string | null; canPay: boolean }) {
  const [step, setStep] = useState(start ? 2 : 0);
  const [chosen, setChosen] = useState<LeaseOffer | null>(start);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-5 px-4 py-6">
      <Link href="/play" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
        <ArrowLeft className="size-4" /> Back to the map
      </Link>
      <h1 className="font-display text-3xl font-bold">Put your business on the map</h1>
      {/* Where you are in the steps. */}
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => (i < step || (i === 2 && chosen) ? setStep(i) : undefined)}
              className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${i < step ? "bg-me text-white" : i === step ? "bg-ink text-white" : "bg-ink/10 text-muted"}`}
              aria-label={`Step ${i + 1}: ${s}`}
            >
              {i < step ? <Check className="size-4" /> : i + 1}
            </button>
            <span className={`truncate text-xs font-semibold ${i === step ? "" : "text-muted"} max-sm:hidden`}>{s}</span>
          </li>
        ))}
      </ol>
      {startError && step < 2 && <p className="rounded-2xl bg-hit/10 p-3 text-sm text-hit">{startError} Pick another below.</p>}

      {step === 0 && <HowItWorks onNext={() => setStep(1)} />}
      {step === 1 && (
        <FindBuilding
          places={places}
          onPick={(o) => {
            setChosen(o);
            setStep(2);
          }}
        />
      )}
      {step === 2 && chosen && (
        <>
          <section className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-panel p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your building</p>
              <p className="font-semibold">{chosen.what}</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{chosen.address} · {chosen.area}</span>
              </p>
              <button onClick={() => setStep(1)} className="mt-1 text-xs font-semibold text-gold-dark">
                Choose another
              </button>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-2xl font-extrabold">{naira(chosen.priceNaira)}</p>
              <p className="text-xs text-muted">a year, paid once</p>
            </div>
          </section>
          {canPay ? <LeaseForm offer={chosen} /> : <p className="text-sm text-muted">Payments aren&apos;t switched on yet. Please check back soon.</p>}
        </>
      )}
      <p className="text-center text-sm text-muted">
        Already advertising?{" "}
        <Link href="/advertiser" className="font-medium text-ink underline">
          See your numbers and change your design
        </Link>
      </p>
    </main>
  );
}

/** Step 1: what owning a building for adverts means, in pictures. */
function HowItWorks({ onNext }: { onNext: () => void }) {
  const cards: { pic: React.ReactNode; title: string; text: string }[] = [
    { pic: <PicBuilding />, title: "You own a building for a year", text: `Pick a real building on the Lagos map that nobody owns. For a year it's yours: your name and logo on it, lit up for every player. From ${naira(LEASE_MIN)}, paid once.` },
    { pic: <PicCard />, title: "Players tap it and find you", text: "Tapping your building opens your card: what you do, your real address, and buttons to call, WhatsApp or get directions." },
    { pic: <PicBillboard />, title: "Your design on the billboards", text: "Your picture also goes round the city's billboards. Swap it any time, free, from your advertiser page." },
    { pic: <PicChart />, title: "You see what it brings", text: "See how many people tapped, called and asked for directions. It runs a year, or until it's been tapped as many times as you paid for (one tap for every ₦20)." },
  ];
  return (
    <section className="space-y-3">
      {cards.map((c, i) => (
        <div key={c.title} className="flex items-center gap-4 rounded-2xl border border-line bg-panel p-4">
          <div className="w-24 shrink-0">{c.pic}</div>
          <div>
            <p className="text-xs font-bold text-gold-dark">{i + 1}</p>
            <p className="font-semibold">{c.title}</p>
            <p className="mt-0.5 text-sm text-muted">{c.text}</p>
          </div>
        </div>
      ))}
      <button onClick={onNext} className="h-12 w-full rounded-full bg-gold font-semibold text-ink shadow-sm">
        Find a building →
      </button>
    </section>
  );
}

/** Step 2: search an area, set a budget, see the free buildings there (nearest first). */
function FindBuilding({ places, onPick }: { places: AdPlace[]; onPick: (o: LeaseOffer) => void }) {
  const [q, setQ] = useState("");
  const [place, setPlace] = useState<AdPlace | null>(null);
  const [max, setMax] = useState(0);
  const [list, setList] = useState<LeaseOffer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || (place && place.label === q)) return [];
    return places.filter((p) => p.label.toLowerCase().includes(t)).slice(0, 8);
  }, [q, places, place]);
  const look = async (p: AdPlace, m: number) => {
    setBusy(true);
    setList(await findBuildings("lagos", p.x, p.z, m || undefined));
    setBusy(false);
  };
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">Where should your business be? Search a neighbourhood, district or landmark. We&apos;ll show the buildings nobody owns there, nearest first.</p>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPlace(null);
          }}
          placeholder="e.g. Yaba, Lekki, Ikeja, Surulere…"
          className="h-12 w-full rounded-full border border-line bg-panel pl-11 pr-4 text-base outline-none focus:border-gold"
        />
        {hits.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-line bg-panel shadow-lg">
            {hits.map((h) => (
              <li key={h.label}>
                <button
                  onClick={() => {
                    setQ(h.label);
                    setPlace(h);
                    void look(h, max);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-ink/5"
                >
                  <MapPin className="size-4 shrink-0 text-muted" /> <b className="truncate">{h.label}</b> <span className="ml-auto shrink-0 text-xs text-muted">{h.note}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {BUDGETS.map((b) => (
          <button
            key={b.label}
            onClick={() => {
              setMax(b.max);
              if (place) void look(place, b.max);
            }}
            className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold ${max === b.max ? "bg-ink text-white" : "bg-ink/5"}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {busy ? (
        <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      ) : list === null ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          <PicMap />
          Search an area to see the free buildings there.
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl bg-ink/[0.04] p-4 text-sm text-muted">No free buildings there{max ? " in that budget" : ""}. Try a nearby area{max ? " or a bigger budget" : ""}.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
          {list.map((o) => (
            <li key={o.building} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-dark">
                <Building2 className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{o.what}</b>
                <span className="block truncate text-xs text-muted">
                  {o.address} · {o.area}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <b className="block text-sm">{naira(o.priceNaira)}</b>
                <button onClick={() => onPick(o)} className="mt-1 h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white">
                  Choose
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- little pictures

function PicBuilding() {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="0" y="66" width="96" height="14" rx="3" fill="#cfe3c4" />
      <circle cx="48" cy="30" r="30" fill="#ffd43b" opacity=".25" />
      <rect x="26" y="18" width="44" height="50" rx="3" fill="#495057" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={31 + c * 13} y={38 + r * 9} width="8" height="5" rx="1" fill="#ffe066" />))}
      <rect x="30" y="22" width="36" height="12" rx="2" fill="#f59f00" />
      <text x="48" y="31" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">YOU</text>
    </svg>
  );
}
function PicCard() {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="22" y="4" width="52" height="72" rx="8" fill="#212529" />
      <rect x="26" y="10" width="44" height="60" rx="4" fill="#fff" />
      <circle cx="36" cy="20" r="6" fill="#f59f00" />
      <rect x="45" y="16" width="20" height="4" rx="2" fill="#495057" />
      <rect x="45" y="22" width="14" height="3" rx="1.5" fill="#adb5bd" />
      <rect x="30" y="32" width="36" height="3" rx="1.5" fill="#ced4da" />
      <rect x="30" y="38" width="30" height="3" rx="1.5" fill="#ced4da" />
      <rect x="30" y="50" width="16" height="9" rx="4.5" fill="#2f9e44" />
      <rect x="50" y="50" width="16" height="9" rx="4.5" fill="#1971c2" />
    </svg>
  );
}
function PicBillboard() {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="0" y="0" width="96" height="66" fill="#d0ebff" />
      <rect x="0" y="66" width="96" height="14" fill="#cfe3c4" />
      <rect x="10" y="10" width="76" height="38" rx="3" fill="#343a40" />
      <rect x="13" y="13" width="70" height="32" rx="2" fill="#f59f00" />
      <text x="48" y="33" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">YOUR AD</text>
      <rect x="28" y="48" width="4" height="20" fill="#343a40" />
      <rect x="64" y="48" width="4" height="20" fill="#343a40" />
    </svg>
  );
}
function PicChart() {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="6" y="6" width="84" height="68" rx="8" fill="#f1f3f5" />
      {[18, 30, 26, 44, 52].map((h, i) => (
        <rect key={i} x={16 + i * 14} y={64 - h} width="9" height={h} rx="2" fill={i === 4 ? "#2f9e44" : "#adb5bd"} />
      ))}
      <path d="M18 44 L32 36 L46 38 L60 24 L74 14" fill="none" stroke="#f59f00" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function PicMap() {
  return (
    <svg viewBox="0 0 120 60" className="mx-auto mb-2 w-32" aria-hidden>
      <rect width="120" height="60" rx="8" fill="#e9ecef" />
      <path d="M0 40 H120 M40 0 V60 M84 0 V60" stroke="#fff" strokeWidth="6" />
      <rect x="10" y="8" width="22" height="24" rx="2" fill="#adb5bd" />
      <rect x="50" y="8" width="26" height="24" rx="2" fill="#f59f00" />
      <rect x="92" y="8" width="20" height="24" rx="2" fill="#adb5bd" />
      <circle cx="63" cy="20" r="5" fill="#fff" />
    </svg>
  );
}
