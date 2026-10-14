"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, MapPin, Megaphone, Search, X } from "@/components/icons";
import type { LeaseOffer } from "@/lib/business";
import { REGIONS } from "@/lib/world";
import type { RegionMap } from "@/lib/world/compile";
import { LEASE_MAX, LEASE_MIN } from "@/lib/world/business";
import { ownedSpot } from "@/lib/world/owned";
import { findBuildings, findBuildingsByPrice, offerFor } from "../../business/actions";
import { LeaseForm } from "../../business/lease-form";
import { Billboard } from "../../advertise/billboard";
import { usePicture } from "../../advertise/use-picture";
import { blank, snapshotScene } from "../city/snapshot";
import { searchable, type SearchHit } from "./map-search";
import { BILLBOARD_STEPS, BillboardWizard } from "./billboard-wizard";

// Advertising, right on the map (docs/BUSINESS.md, docs/ADS.md). First a choice:
//   - Billboard ads: your picture on the city's billboards, a weekly budget for 1 to 8 weeks
//     (./billboard-wizard.tsx). It goes up on the billboards round you as you make it.
//   - A building of your own, by the month: choose the state, find a building (search an area, tap
//     a monthly amount and step through buildings at that price, or tap one on the map), add your
//     pictures and see it lit up on the real 3D city, then your details, how many months, and pay.
//     It comes with your design on the billboards too.
// The map behind stays live the whole time: the camera flies to each building.

/** Opens the advertising panel from anywhere in the game (a billboard, a building, a menu). */
export function openAdvertise(building?: string) {
  window.dispatchEvent(new CustomEvent("nt-advertise", { detail: { building: building ?? null } }));
}

/** What the map shows while you choose: your name lit up on the building, your design on the billboards. */
export type AdPreview = { building: string; name: string; line: string; logo: string | null; billboard: string | null };

/** Every state in Nigeria: ads show in the state you choose, to the people living there. */
const STATES = [
  "Lagos", "FCT Abuja", "Rivers", "Oyo", "Kano", "Ogun", "Enugu", "Delta", "Edo", "Kaduna", "Anambra", "Akwa Ibom", "Cross River", "Imo", "Abia", "Kwara",
  "Osun", "Ondo", "Ekiti", "Plateau", "Bauchi", "Benue", "Borno", "Ebonyi", "Gombe", "Jigawa", "Katsina", "Kebbi", "Kogi", "Nasarawa", "Niger", "Sokoto",
  "Taraba", "Yobe", "Zamfara", "Adamawa", "Bayelsa",
];
const stateRegion = (name: string) => Object.keys(REGIONS).find((id) => REGIONS[id].name.toLowerCase() === name.toLowerCase()) ?? null;

/** Amounts to tap: the map takes you to a free building at that price a month. */
const AMOUNTS = [60_000, 100_000, 150_000, 250_000, 400_000, 750_000, 1_500_000, 3_000_000];
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const shortNaira = (n: number) => (n >= 1_000_000 ? `₦${n / 1_000_000}m` : `₦${Math.round(n / 1000)}k`);

type Mode = "choose" | "billboard" | "building";

const BUILDING_STEPS = ["Pick a building", "Your pictures", "Details & pay"];

/**
 * A building drawn in 3D (a little isometric block), bigger the dearer it is: a ₦20k shopfront is
 * a low box, a ₦1m glass tower stands tall and wide.
 */
export function BuildingBlock({ price, what, lit }: { price: number; what: string; lit?: boolean }) {
  const t = Math.min(1, Math.max(0, Math.log(price / LEASE_MIN) / Math.log(LEASE_MAX / LEASE_MIN)));
  const h = 18 + t * 62;
  const w = 20 + t * 14;
  const glass = /glass|tower/i.test(what);
  const front = glass ? "#4dabf7" : /office/i.test(what) ? "#4c6ef5" : /shop|plaza/i.test(what) ? "#f08c00" : /flat|apartment/i.test(what) ? "#7950f2" : "#868e96";
  const side = glass ? "#1c7ed6" : "#495057";
  const top = glass ? "#a5d8ff" : "#ced4da";
  const base = 92;
  const x0 = 50 - w;
  const floors = Math.max(1, Math.round(h / 9));
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      {lit && <ellipse cx="50" cy={base - h / 2} rx={w + 14} ry={h / 2 + 12} fill="#ffd43b" opacity=".28" />}
      <ellipse cx="50" cy={base + 2} rx={w + 6} ry="5" fill="#000" opacity=".12" />
      {/* Left face, right face, roof. */}
      <polygon points={`${x0},${base - w / 2} 50,${base} 50,${base - h} ${x0},${base - w / 2 - h}`} fill={front} />
      <polygon points={`50,${base} ${100 - x0},${base - w / 2} ${100 - x0},${base - w / 2 - h} 50,${base - h}`} fill={side} />
      <polygon points={`${x0},${base - w / 2 - h} 50,${base - h} ${100 - x0},${base - w / 2 - h} 50,${base - w - h}`} fill={top} />
      {Array.from({ length: floors }, (_, f) => {
        const y = base - 6 - f * (h / floors);
        return (
          <g key={f} opacity=".8">
            <line x1={x0 + 3} y1={y - w / 2 + 2} x2={47} y2={y - 1} stroke={lit ? "#ffe066" : "#e9ecef"} strokeWidth="2" strokeDasharray="3 2" />
            <line x1={53} y1={y - 1} x2={100 - x0 - 3} y2={y - w / 2 + 2} stroke={lit ? "#ffe066" : "#adb5bd"} strokeWidth="2" strokeDasharray="3 2" />
          </g>
        );
      })}
    </svg>
  );
}

export function AdvertisePanel({
  regionId,
  region,
  centre,
  fly,
  picked,
  onPreview,
  onClose,
}: {
  regionId: string;
  region: RegionMap;
  /** Where the map is looking now (tiles). */
  centre: () => { x: number; z: number };
  fly: (x: number, z: number) => void;
  /** A building tapped on the map while the panel is open (and when it was tapped). */
  picked: { id: string; at: number } | null;
  onPreview: (p: AdPreview | null) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  /** First, what kind of advertising (then its steps). */
  const [mode, setMode] = useState<Mode>("choose");
  const STEPS = mode === "billboard" ? BILLBOARD_STEPS : BUILDING_STEPS;
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [small, setSmall] = useState(false);
  const [state, setState] = useState(region.region.name);
  const [q, setQ] = useState("");
  const [list, setList] = useState<LeaseOffer[] | null>(null);
  const [listNote, setListNote] = useState("");
  const [index, setIndex] = useState(0);
  const [amount, setAmount] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each step (and any problem) starts at the top of the panel.
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [mode, step, error]);
  const [chosen, setChosen] = useState<LeaseOffer | null>(null);
  const logo = usePicture();
  const board = usePicture();
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);

  const current = chosen ?? list?.[index] ?? null;
  const all = useMemo(() => searchable(region, []), [region]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const seen = new Set<string>();
    return all.filter((h) => h.label.toLowerCase().includes(t) && !seen.has(h.label) && seen.add(h.label)).slice(0, 6);
  }, [q, all]);

  const flyToOffer = (o: LeaseOffer | null) => {
    const s = o ? ownedSpot(o.building) : null;
    if (s) fly(s.x, s.z);
  };

  // The map shows the building you're looking at lit up with your name, and your design on the billboards.
  useEffect(() => {
    if (mode !== "building") return;
    onPreview(current ? { building: current.building, name: name.trim() || "YOUR NAME", line: line.trim(), logo: logo.url, billboard: board.url ?? logo.url } : null);
  }, [mode, current, name, line, logo.url, board.url, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  // A building tapped on the map: that one, if it's free to lease.
  const lastPick = useRef(0);
  useEffect(() => {
    if (!picked || picked.at === lastPick.current) return;
    lastPick.current = picked.at;
    // Making a billboard ad: a tap on the map is just looking round.
    if (modeRef.current === "billboard") return;
    let alive = true;
    void offerFor(picked.id).then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.error);
      setError(null);
      setChosen(r.offer);
      setSmall(false);
      // A building tapped (or the panel opened from one): remembered. On the first screen you still
      // choose what kind of ad (it's waiting if you choose a building); already choosing a building, it's this one.
      if (modeRef.current === "building") setStep((s) => (s === 2 ? 1 : s));
    });
    return () => {
      alive = false;
    };
  }, [picked]);

  async function byAmount(n: number) {
    const v = Math.min(LEASE_MAX, Math.max(LEASE_MIN, Math.round(n)));
    setAmount(v);
    setChosen(null);
    setBusy(true);
    setError(null);
    const c = centre();
    const found = await findBuildingsByPrice(regionId, v, c.x, c.z);
    setBusy(false);
    setList(found);
    setIndex(0);
    setListNote(found.length ? `Free buildings at about ${naira(v)} a month` : "");
    if (!found.length) setError(`No free building at about ${naira(v)} right now. Try another amount.`);
    flyToOffer(found[0] ?? null);
  }
  async function near(h: SearchHit) {
    setQ(h.label);
    setChosen(null);
    setAmount(null);
    fly(h.x, h.z);
    setBusy(true);
    setError(null);
    const found = await findBuildings(regionId, h.x, h.z);
    setBusy(false);
    setList(found);
    setIndex(0);
    setListNote(found.length ? `Free buildings near ${h.label}` : "");
    if (!found.length) setError(`No free buildings near ${h.label}. Try a nearby area.`);
    // Stay on the area for a moment, then go to the first building.
    if (found[0]) setTimeout(() => flyToOffer(found[0]), 900);
  }
  const step1 = (d: number) => {
    if (!list?.length) return;
    setChosen(null);
    const i = (index + d + list.length) % list.length;
    setIndex(i);
    flyToOffer(list[i]);
  };

  // The preview picture: the 3D view as it is right now, with your building lit.
  async function takeShot() {
    if (!current) return;
    setShooting(true);
    flyToOffer(current);
    await new Promise((r) => setTimeout(r, 1600));
    const c = snapshotScene();
    setShooting(false);
    if (!c || blank(c)) return setError("This phone won't share a picture of the map. Look at the map behind instead: your building is lit.");
    try {
      setShot(c.toDataURL("image/jpeg", 0.82));
      setError(null);
    } catch {
      setError("Couldn't take the picture. Look at the map behind instead.");
    }
  }

  const live = stateRegion(state);
  const go = (n: number) => {
    setStep(n);
    setError(null);
    setSmall(false);
    if (mode === "building" && n === 1 && !shot) setTimeout(() => void takeShot(), 300);
  };
  /** Back: a step back, or (from the first step) to the choice. */
  const back = () => {
    if (step > 0) return go(step - 1);
    setMode("choose");
    setChosen(null);
    setError(null);
    onPreview(null);
  };

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-2 sm:bottom-3 sm:px-3">
      <div className="flex max-h-[min(62vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-panel shadow-2xl ring-1 ring-line">
        {/* The top: where you are in the steps; tap the arrow to see more of the map. */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          {mode !== "choose" ? (
            <button onClick={back} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5" aria-label="Back">
              <ArrowLeft className="size-4" />
            </button>
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-dark">
              <Megaphone className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {mode === "choose" ? "Advertise on the map" : `${mode === "billboard" ? "Billboard ad" : "Your building"} · ${STEPS[step]}`}
            </p>
            {mode !== "choose" && (
              <div className="mt-1 flex gap-1">
                {STEPS.map((s, i) => (
                  <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-gold" : "bg-ink/10"}`} />
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setSmall((v) => !v)} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5" aria-label={small ? "Show the panel" : "See the map"}>
            {small ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {small ? (
          mode === "building" &&
          current && (
            <button onClick={() => setSmall(false)} className="flex items-center gap-2 px-3 py-2 text-left text-sm">
              <MapPin className="size-4 shrink-0 text-gold-dark" />
              <span className="min-w-0 flex-1 truncate">
                {current.what}, {current.area}
              </span>
              <b className="shrink-0">{naira(current.priceNaira)}/month</b>
            </button>
          )
        ) : (
          <div ref={scroller} className="overflow-y-auto overscroll-contain px-3 pb-4 pt-3">
            {error && mode !== "billboard" && <p className="mb-3 rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}

            {mode === "choose" && (
              <div className="space-y-2.5">
                <p className="text-sm text-muted">Everyone playing in {region.region.name} sees it. What would you like?</p>
                <button
                  onClick={() => {
                    setMode("billboard");
                    setStep(0);
                    setError(null);
                  }}
                  className="flex w-full items-start gap-3 rounded-2xl bg-ink/[0.04] p-3 text-left ring-1 ring-line hover:bg-ink/[0.07]"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f5ff] text-2xl">📺</span>
                  <span className="min-w-0 flex-1">
                    <b className="block">Billboard ads</b>
                    <span className="block text-xs text-muted">Your picture on the city&apos;s billboards. You choose how much a week and for how many weeks (from ₦5,000 a week).</span>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMode("building");
                    setStep(0);
                    setError(null);
                  }}
                  className="flex w-full items-start gap-3 rounded-2xl bg-gold/15 p-3 text-left ring-1 ring-gold/40 hover:bg-gold/25"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/30 text-2xl">🏢</span>
                  <span className="min-w-0 flex-1">
                    <b className="block">A building of your own</b>
                    <span className="block text-xs text-muted">
                      Your name lit up on a real building, and your picture on the billboards too. Paid by the month ({naira(LEASE_MIN)} to {naira(LEASE_MAX)} a month, by size and area).
                    </span>
                    {chosen && (
                      <span className="mt-1.5 block rounded-lg bg-white/70 px-2 py-1 text-xs">
                        <b>The one you tapped:</b> {chosen.what}, {chosen.area} · {naira(chosen.priceNaira)} a month
                      </span>
                    )}
                  </span>
                </button>
                <p className="text-[11px] text-muted">You see it on the map before you pay. You can go back at any time.</p>
              </div>
            )}

            {mode === "billboard" && <BillboardWizard step={step} go={go} regionId={regionId} onPreview={onPreview} />}

            {mode === "building" && step === 0 && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted">Which state should your ad show in?</p>
                  <div className="-mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {STATES.map((s) => {
                      const open = !!stateRegion(s);
                      return (
                        <button
                          key={s}
                          onClick={() => setState(s)}
                          className={`h-9 shrink-0 rounded-full px-3 text-sm font-semibold ${state === s ? "bg-ink text-white" : open ? "bg-ink/[0.06]" : "bg-ink/[0.03] text-muted"}`}
                        >
                          {s}
                          {!open && <span className="ml-1 text-[10px] font-normal opacity-70">soon</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {live
                      ? `Your building and billboards show to everyone living their life in ${state}.`
                      : `${state} isn't on the map yet. Ads there open when it is; for now you can advertise in ${Object.values(REGIONS)
                          .map((r) => r.name)
                          .join(", ")}.`}
                  </p>
                </div>

                {live === regionId && (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={`Search an area or landmark in ${state}`}
                        className="h-11 w-full rounded-full bg-ink/[0.05] pl-10 pr-9 text-base outline-none ring-gold focus:ring-2"
                      />
                      {q && (
                        <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-ink/10" aria-label="Clear">
                          <X className="size-3.5" />
                        </button>
                      )}
                      {hits.length > 0 && hits[0].label !== q && (
                        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl bg-panel shadow-xl ring-1 ring-line">
                          {hits.map((h) => (
                            <li key={h.label + h.note}>
                              <button onClick={() => void near(h)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-ink/5">
                                <MapPin className="size-4 shrink-0 text-muted" /> <b className="truncate">{h.label}</b>
                                <span className="ml-auto shrink-0 text-xs text-muted">{h.note}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted">Or tap an amount a month: the map takes you to a building at that price</p>
                      <div className="-mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
                        {AMOUNTS.map((a) => (
                          <button
                            key={a}
                            onClick={() => void byAmount(a)}
                            className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold tabular-nums ${amount === a ? "bg-gold text-ink" : "bg-ink/[0.06]"}`}
                          >
                            {shortNaira(a)}
                          </button>
                        ))}
                      </div>
                      <form
                        className="mt-1.5 flex gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const n = Number(typed.replace(/[^\d]/g, ""));
                          if (n > 0) void byAmount(n);
                        }}
                      >
                        <input
                          value={typed}
                          onChange={(e) => setTyped(e.target.value)}
                          inputMode="numeric"
                          placeholder="Your own amount a month, e.g. 200000"
                          className="h-10 min-w-0 flex-1 rounded-full bg-ink/[0.05] px-4 text-base outline-none ring-gold focus:ring-2"
                        />
                        <button className="h-10 shrink-0 rounded-full bg-ink px-4 text-sm font-semibold text-white">Go</button>
                      </form>
                    </div>

                    <p className="text-[11px] text-muted">You can also tap any building on the map behind.</p>

                    {busy ? (
                      <div className="h-28 animate-pulse rounded-2xl bg-ink/5" />
                    ) : (
                      current && (
                        <div className="rounded-2xl bg-ink/[0.04] p-3">
                          {listNote && !chosen && <p className="mb-2 text-xs font-semibold text-muted">{listNote}</p>}
                          <div className="flex items-center gap-3">
                            <div className="size-20 shrink-0">
                              <BuildingBlock price={current.priceNaira} what={current.what} lit />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold leading-tight">{current.what}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                                {current.address}, {current.area}
                              </p>
                              <p className="mt-1">
                                <b className="font-display text-lg font-extrabold">{naira(current.priceNaira)}</b>
                                <span className="text-xs text-muted"> a month</span>
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            {!chosen && list && list.length > 1 && (
                              <>
                                <button onClick={() => step1(-1)} className="grid size-10 shrink-0 place-items-center rounded-full bg-panel ring-1 ring-line" aria-label="Previous building">
                                  <ChevronLeft className="size-4" />
                                </button>
                                <span className="shrink-0 text-xs tabular-nums text-muted">
                                  {index + 1} of {list.length}
                                </span>
                                <button onClick={() => step1(1)} className="grid size-10 shrink-0 place-items-center rounded-full bg-panel ring-1 ring-line" aria-label="Next building">
                                  <ChevronRight className="size-4" />
                                </button>
                              </>
                            )}
                            <button onClick={() => go(1)} className="ml-auto h-10 rounded-full bg-gold px-4 text-sm font-semibold text-ink">
                              Use this building
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            )}

            {mode === "building" && step === 1 && current && (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Upload the pictures for your ad. Your logo goes on <b className="text-ink">{current.what.toLowerCase()}</b> in {current.area}; your billboard picture goes round the city&apos;s billboards.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <PicturePick label="Logo" hint="Square works best" pic={logo} square />
                  <PicturePick label="Billboard picture" hint="Wide, 2:1" pic={board} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Business name" className="h-11 rounded-xl bg-ink/[0.05] px-4 text-base outline-none ring-gold focus:ring-2" />
                  <input value={line} onChange={(e) => setLine(e.target.value)} maxLength={60} placeholder="A line (e.g. Fresh bread daily)" className="h-11 rounded-xl bg-ink/[0.05] px-4 text-base outline-none ring-gold focus:ring-2" />
                </div>
                <Billboard image={board.url ?? logo.url} brand={name} headline={line} />
                <div className="overflow-hidden rounded-2xl bg-ink/[0.04]">
                  {shot ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a picture of the 3D map taken here
                    <img src={shot} alt="Your building lit up on the map" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center gap-2 text-sm text-muted">{shooting ? "Taking a picture of the map…" : "Your building, lit up on the map"}</div>
                  )}
                  <button onClick={() => void takeShot()} disabled={shooting} className="flex h-10 w-full items-center justify-center gap-2 border-t border-line text-sm font-semibold disabled:opacity-50">
                    <Camera className="size-4" /> {shot ? "Take the picture again (with your name)" : "Take a preview picture"}
                  </button>
                </div>
                <p className="text-[11px] text-muted">
                  The map behind shows it live: your building glows with your name, and your picture is on the billboards near you. Tap the arrow at the top to see more of the map.
                </p>
                <button onClick={() => go(2)} className="h-11 w-full rounded-full bg-ink font-semibold text-white">
                  Next: your details
                </button>
              </div>
            )}

            {mode === "building" && step === 2 && current && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-2xl bg-ink/[0.04] p-3">
                  <div className="size-14 shrink-0">
                    <BuildingBlock price={current.priceNaira} what={current.what} lit />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {current.what}, {current.area}
                    </p>
                    <p className="text-xs text-muted">
                      {logo.file ? "Logo" : "No logo"} · {board.file ? "billboard picture" : "no billboard picture"} ready to upload
                    </p>
                  </div>
                  <b className="shrink-0">{naira(current.priceNaira)}/month</b>
                </div>
                <p className="flex items-start gap-2 rounded-xl bg-gold/15 px-3 py-2 text-xs">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-gold-dark" />
                  After paying you&apos;re signed in to your ad page straight away, to see your numbers and change your design. Sign in again any time with your email.
                </p>
                <LeaseForm offer={current} logo={logo} billboard={board} name={name} onName={setName} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PicturePick({ label, hint, pic, square }: { label: string; hint: string; pic: ReturnType<typeof usePicture>; square?: boolean }) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl bg-ink/[0.04] p-2 text-center ring-1 ring-line">
      <span className={`grid w-full place-items-center overflow-hidden rounded-xl bg-panel ${square ? "aspect-square max-h-24" : "aspect-[2/1]"}`}>
        {pic.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview
          <img src={pic.url} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-6 text-muted" />
        )}
      </span>
      <span className="text-xs font-semibold">{pic.url ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</span>
      <span className="text-[10px] text-muted">{pic.error ?? hint}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pic.pick(e.target.files?.[0])} />
    </label>
  );
}
