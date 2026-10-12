"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, ImagePlus, MapPin, Search, Sparkles, X } from "lucide-react";
import type { AdPlace, LeaseOffer } from "@/lib/business";
import { LEASE_MIN } from "@/lib/world/business";
import { findBuildings, findBuildingsAnywhere } from "../../business/actions";
import { LeaseForm } from "../../business/lease-form";
import { Billboard } from "../billboard";
import { PicBillboard, PicBuilding, PicCard, PicChart } from "../pictures";
import { usePicture } from "../use-picture";

// Advertising, step by step (docs/BUSINESS.md): 1 how it works, with pictures; 2 find a building
// (an area if you like, a budget) and see your ad on a billboard; 3 your business and pay.

const STEPS = ["How it works", "Pick a building", "Your business & pay"];
const BUDGETS = [
  { label: "Any price", max: 0 },
  { label: "Up to ₦50k", max: 50_000 },
  { label: "Up to ₦100k", max: 100_000 },
  { label: "Up to ₦250k", max: 250_000 },
];
const TINT: Record<string, string> = { Shops: "#e8590c", Offices: "#1971c2", "Office tower": "#1864ab", Flats: "#7048e8", Houses: "#2f9e44" };
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function LightsUp() {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-gold/15 px-4 py-3 text-sm">
      <Clock className="mt-0.5 size-4 shrink-0 text-gold-dark" />
      <span>
        Your building <b>lights up with your name within 24 hours</b> of paying, and your design goes on the billboards as soon as you upload it.
      </span>
    </p>
  );
}

export function AdWizard({ places, start, startError, canPay }: { places: AdPlace[]; start: LeaseOffer | null; startError: string | null; canPay: boolean }) {
  const [step, setStep] = useState(start ? 2 : 0);
  const [chosen, setChosen] = useState<LeaseOffer | null>(start);
  const go = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <main className="min-h-screen bg-bg">
      <div className="bg-gradient-to-b from-gold/25 to-transparent">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-2 pt-6">
          <Link href="/advertise" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
            <ArrowLeft className="size-4" /> Advertising
          </Link>
          <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">Put your business on the map</h1>
          {/* Where you are in the steps. */}
          <ol className="flex items-center gap-1.5 rounded-2xl bg-panel p-1.5 shadow-sm ring-1 ring-line">
            {STEPS.map((s, i) => {
              const can = i < step || (i === 2 && !!chosen) || i === 1;
              return (
                <li key={s} className="min-w-0 flex-1">
                  <button
                    disabled={!can}
                    onClick={() => go(i)}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm ${i === step ? "bg-ink text-white" : i < step ? "text-me" : "text-muted"}`}
                  >
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${i === step ? "bg-gold text-ink" : i < step ? "bg-me text-white" : "bg-ink/10"}`}>
                      {i < step ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className="truncate">{s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 pt-3">
        {startError && step < 2 && <p className="rounded-2xl bg-hit/10 p-3 text-sm text-hit">{startError} Pick another below.</p>}

        {step === 0 && <HowItWorks onNext={() => go(1)} />}
        {step === 1 && (
          <FindBuilding
            places={places}
            onPick={(o) => {
              setChosen(o);
              go(2);
            }}
          />
        )}
        {step === 2 && chosen && (
          <>
            <section className="overflow-hidden rounded-3xl bg-panel shadow-sm ring-1 ring-line">
              <div className="flex items-center gap-4 p-4">
                <div className="w-20 shrink-0">
                  <PicBuilding tint={TINT[chosen.what] ?? "#495057"} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your building</p>
                  <p className="font-display text-lg font-bold">{chosen.what}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                    <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{chosen.area}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-2xl font-extrabold">{naira(chosen.priceNaira)}</p>
                  <p className="text-xs text-muted">a year, once</p>
                </div>
              </div>
              <button onClick={() => go(1)} className="w-full border-t border-line py-2.5 text-sm font-semibold text-gold-dark">
                Choose another building
              </button>
            </section>
            <LightsUp />
            {canPay ? <LeaseForm offer={chosen} /> : <p className="text-sm text-muted">Payments aren&apos;t switched on yet. Please check back soon.</p>}
          </>
        )}
        <p className="text-center text-sm text-muted">
          Already advertising?{" "}
          <Link href="/advertiser" className="font-medium text-ink underline">
            See your numbers and change your design
          </Link>
        </p>
      </div>
    </main>
  );
}

/** Step 1: what owning a building for adverts means, in pictures. */
function HowItWorks({ onNext }: { onNext: () => void }) {
  const cards: { pic: React.ReactNode; title: string; text: string }[] = [
    { pic: <PicBuilding />, title: "You own a building for a year", text: `Pick a real building on the Lagos map that nobody owns. For a year it's yours: your name and logo on it, lit up for every player within 24 hours. From ${naira(LEASE_MIN)}, paid once.` },
    { pic: <PicCard />, title: "Players tap it and find you", text: "Tapping your building opens your card: what you do, your real address, and buttons to call, WhatsApp or get directions." },
    { pic: <PicBillboard />, title: "Your design on the billboards", text: "Your picture also goes round the city's billboards. Swap it any time, free." },
    { pic: <PicChart />, title: "You see what it brings", text: "Taps, calls and directions, all counted. It runs a year, or until it's been tapped as many times as you paid for (one tap for every ₦20)." },
  ];
  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c, i) => (
          <div key={c.title} className="rounded-3xl bg-panel p-4 shadow-sm ring-1 ring-line">
            <div className="mx-auto mb-3 w-28">{c.pic}</div>
            <p className="text-xs font-bold text-gold-dark">Step {i + 1}</p>
            <p className="font-display text-lg font-bold leading-tight">{c.title}</p>
            <p className="mt-1 text-sm text-muted">{c.text}</p>
          </div>
        ))}
      </div>
      <button onClick={onNext} className="h-12 w-full rounded-full bg-ink font-semibold text-white shadow-sm">
        Pick a building →
      </button>
    </section>
  );
}

/** Step 2: free buildings (anywhere, or near an area you search), a budget, and your ad on a billboard. */
function FindBuilding({ places, onPick }: { places: AdPlace[]; onPick: (o: LeaseOffer) => void }) {
  const [q, setQ] = useState("");
  const [place, setPlace] = useState<AdPlace | null>(null);
  const [max, setMax] = useState(0);
  const [list, setList] = useState<LeaseOffer[] | null>(null);
  const [busy, setBusy] = useState(true);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || (place && place.label === q)) return [];
    return places.filter((p) => p.label.toLowerCase().includes(t)).slice(0, 8);
  }, [q, places, place]);
  const look = async (p: AdPlace | null, m: number) => {
    setBusy(true);
    setList(p ? await findBuildings("lagos", p.x, p.z, m || undefined) : await findBuildingsAnywhere("lagos", m || undefined));
    setBusy(false);
  };
  // Good picks across the city straight away: an area is optional.
  useEffect(() => {
    let alive = true;
    void findBuildingsAnywhere("lagos").then((l) => {
      if (!alive) return;
      setList(l);
      setBusy(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className="space-y-4">
      <AdPreview />
      <div className="rounded-3xl bg-panel p-4 shadow-sm ring-1 ring-line">
        <p className="font-display text-lg font-bold">Pick your building</p>
        <p className="text-sm text-muted">Buildings nobody owns yet. Search an area if you have one in mind (you don&apos;t have to).</p>
        <div className="relative mt-3">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPlace(null);
            }}
            placeholder="Area (optional): Yaba, Lekki, Ikeja…"
            className="h-12 w-full rounded-full bg-ink/[0.05] pl-11 pr-10 text-base outline-none ring-gold focus:ring-2"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                setPlace(null);
                void look(null, max);
              }}
              className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-ink/10"
              aria-label="Clear the area"
            >
              <X className="size-4" />
            </button>
          )}
          {hits.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl bg-panel shadow-xl ring-1 ring-line">
              {hits.map((h) => (
                <li key={h.label}>
                  <button
                    onClick={() => {
                      setQ(h.label);
                      setPlace(h);
                      void look(h, max);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-ink/5"
                  >
                    <MapPin className="size-4 shrink-0 text-muted" /> <b className="truncate">{h.label}</b> <span className="ml-auto shrink-0 text-xs text-muted">{h.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {BUDGETS.map((b) => (
            <button
              key={b.label}
              onClick={() => {
                setMax(b.max);
                void look(place, b.max);
              }}
              className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold ${max === b.max ? "bg-ink text-white" : "bg-ink/[0.06]"}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <p className="px-1 text-sm font-semibold text-muted">{place ? `Free buildings near ${place.label}` : "Good picks across Lagos"}</p>
      {busy ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl bg-ink/5" />
          ))}
        </div>
      ) : !list || list.length === 0 ? (
        <p className="rounded-3xl bg-ink/[0.04] p-5 text-center text-sm text-muted">No free buildings {place ? "there" : "right now"}{max ? " in that budget" : ""}. Try {place ? "a nearby area" : "another budget"}.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((o) => (
            <li key={o.building} className="flex flex-col rounded-3xl bg-panel p-4 shadow-sm ring-1 ring-line">
              <div className="flex items-start gap-3">
                <div className="w-16 shrink-0">
                  <PicBuilding tint={TINT[o.what] ?? "#495057"} lit={false} name="FREE" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{o.what}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{o.area}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p>
                  <b className="font-display text-xl font-extrabold">{naira(o.priceNaira)}</b>
                  <span className="text-xs text-muted"> / year</span>
                </p>
                <button onClick={() => onPick(o)} className="h-10 rounded-full bg-gold px-4 text-sm font-semibold text-ink">
                  Choose
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** See your ad before you buy: your picture on a billboard, and your name lit up on a building. */
function AdPreview() {
  const pic = usePicture();
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  return (
    <div className="overflow-hidden rounded-3xl bg-panel shadow-sm ring-1 ring-line">
      <Billboard image={pic.url} brand={name} headline={headline} />
      <div className="space-y-2 p-4">
        <p className="flex items-center gap-1.5 font-display text-lg font-bold">
          <Sparkles className="size-5 text-gold-dark" /> See your ad on a billboard
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Business name" className="h-11 rounded-xl bg-ink/[0.05] px-4 text-base outline-none ring-gold focus:ring-2" />
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={60} placeholder="A line (e.g. Fresh bread daily)" className="h-11 rounded-xl bg-ink/[0.05] px-4 text-base outline-none ring-gold focus:ring-2" />
        </div>
        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink/[0.05] text-sm font-semibold">
          <ImagePlus className="size-4" /> {pic.url ? "Try another picture" : "Try your picture (JPG, PNG)"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pic.pick(e.target.files?.[0])} />
        </label>
        {pic.error && <p className="text-xs text-hit">{pic.error}</p>}
        <p className="text-xs text-muted">Just a preview. After paying you upload your design on your business page, and you can change it any time, free.</p>
      </div>
    </div>
  );
}
