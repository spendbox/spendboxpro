"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "../sheet";
import { cash } from "@/lib/world/value";
import { COMMUTE_LABEL, type Commute } from "@/lib/world/work";
import { pickEncounter, type Encounter } from "@/lib/world/encounters";
import { resolveEncounter } from "../encounter-actions";

// Getting about on foot (docs/ENCOUNTERS.md): hail a keke, an okada or a danfo to where you're
// going, ride there (a little animated scene), and now and then something happens on the way or
// out walking (an encounter card: you choose, the game's server says how it went).

const RIDE_BLURB: Partial<Record<Commute, string>> = {
  keke: "Three wheels, a canopy and a driver who knows every back street.",
  okada: "Fastest through traffic. Hold on tight.",
  danfo: "The yellow bus. Cheapest the further you go, if you don't mind the squeeze.",
};

/** Pick a ride on foot: each one that goes that far, with its fare. */
export function RidePicker({ choices, where, onPick, onClose }: { choices: { mode: Commute; mint: number }[]; where: string; onPick: (mode: Commute) => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title={`How are you getting to ${where}?`}>
      <div className="space-y-2">
        {choices.map((c) => (
          <button key={c.mode} onClick={() => onPick(c.mode)} className="flex w-full items-center gap-3 rounded-2xl bg-ink/[0.04] p-3 text-left hover:bg-ink/[0.08]">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#ffd43b]/30">
              <svg viewBox="0 0 120 70" className="h-10 w-16" aria-hidden>
                <Vehicle mode={c.mode} t={0} />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm">{COMMUTE_LABEL[c.mode]}</b>
              <span className="block text-xs text-muted">{RIDE_BLURB[c.mode]}</span>
            </span>
            <b className="shrink-0 text-sm tabular-nums">{cash(c.mint)}</b>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** The ride there: the street going by, and maybe something happening on the way. */
export function RideScene({ mode, to, region, onDone }: { mode: Commute; to: string; region: string; onDone: () => void }) {
  const [t, setT] = useState(0);
  const [event, setEvent] = useState<Encounter | null>(null);
  const [arrived, setArrived] = useState(false);
  const paused = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  // About a third of rides, something happens halfway.
  const [eventAt] = useState(() => (Math.random() < 0.35 ? 0.45 + Math.random() * 0.2 : 2));
  const fired = useRef(false);
  const total = mode === "danfo" ? 6.5 : 5;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let time = 0;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused.current) time += dt;
      setT(time);
      if (!fired.current && time / total >= eventAt) {
        fired.current = true;
        const e = pickEncounter("ride", mode, recentEncounters());
        if (e) {
          paused.current = true;
          setEvent(e);
        }
      }
      if (time >= total) {
        setArrived(true);
        setTimeout(() => done.current(), 900);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [eventAt, mode, total]);
  const k = Math.min(1, t / total);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gradient-to-b from-[#5fa8e0] to-[#9fd3f5]">
      <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax meet" className="mt-auto h-full max-h-[80vh] w-full" aria-hidden>
        <Street t={t} />
        <g transform={`translate(140 ${mode === "danfo" ? 132 : 146})`}>
          <g transform={`translate(0 ${Math.abs(Math.sin(t * (mode === "okada" ? 14 : 9))) * -2.5})`}>
            <Vehicle mode={mode} t={t} />
          </g>
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="glass rounded-full px-4 py-1.5 text-sm font-semibold">
          {arrived ? `You've arrived at ${to}` : `By ${COMMUTE_LABEL[mode].toLowerCase()} to ${to}`}
        </p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/50">
          <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${k * 100}%` }} />
        </div>
      </div>
      {event && (
        <EncounterCard
          encounter={event}
          region={region}
          onDone={() => {
            setEvent(null);
            paused.current = false;
          }}
        />
      )}
    </div>
  );
}

/** The last few encounters had (on this phone), so the same one doesn't come up twice running. */
export function recentEncounters(): string[] {
  try {
    return JSON.parse(localStorage.getItem("nt-encounters") ?? "[]") as string[];
  } catch {
    return [];
  }
}
function rememberEncounter(id: string) {
  try {
    localStorage.setItem("nt-encounters", JSON.stringify([id, ...recentEncounters().filter((x) => x !== id)].slice(0, 8)));
  } catch {}
}

/** Something happening: the story, your choices, then how it went (and any money that changed hands). */
export function EncounterCard({ encounter, region, onDone }: { encounter: Encounter; region: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; mint: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = async (i: number) => {
    setBusy(true);
    setError(null);
    rememberEncounter(encounter.id);
    const r = await resolveEncounter(encounter.id, i, region).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResult({ text: r.text, mint: r.mint });
  };
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <div className="start-pop w-full max-w-sm rounded-3xl bg-panel p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-2xl" aria-hidden>
            {encounter.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{encounter.title}</p>
            <p className="mt-0.5 text-sm text-muted">{encounter.text}</p>
          </div>
        </div>
        {result ? (
          <>
            <p className="mt-3 rounded-2xl bg-ink/5 p-3 text-sm">{result.text}</p>
            {result.mint !== 0 && (
              <p className={`mt-2 text-center text-sm font-bold ${result.mint > 0 ? "text-[#2f9e44]" : "text-hit"}`}>
                {result.mint > 0 ? `+${cash(result.mint)}` : `−${cash(-result.mint)}`}
              </p>
            )}
            <button onClick={onDone} className="mt-3 h-11 w-full rounded-full bg-ink text-sm font-semibold text-white">
              Carry on
            </button>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            {encounter.choices.map((c, i) => (
              <button key={c.label} disabled={busy} onClick={() => void choose(i)} className="h-11 w-full rounded-full bg-ink/5 px-4 text-sm font-semibold hover:bg-ink/10 disabled:opacity-50">
                {c.label}
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-center text-sm text-hit">{error}</p>}
      </div>
    </div>
  );
}

/** The street scrolling by: sky, a skyline far off, buildings and palms nearer, the road. */
function Street({ t }: { t: number }) {
  const far = -((t * 12) % 200);
  const near = -((t * 60) % 160);
  const road = -((t * 140) % 40);
  return (
    <g>
      <rect width="400" height="240" fill="#9fd3f5" />
      <circle cx="330" cy="40" r="16" fill="#fff3b0" />
      {[0, 200, 400].map((o) => (
        <g key={o} transform={`translate(${far + o} 0)`} fill="#7aa6c2">
          <rect x="10" y="95" width="22" height="55" />
          <rect x="36" y="80" width="16" height="70" />
          <rect x="58" y="105" width="30" height="45" />
          <rect x="95" y="70" width="14" height="80" />
          <rect x="115" y="100" width="26" height="50" />
          <rect x="150" y="88" width="20" height="62" />
          <rect x="176" y="110" width="22" height="40" />
        </g>
      ))}
      {[0, 160, 320, 480].map((o) => (
        <g key={o} transform={`translate(${near + o} 0)`}>
          <rect x="0" y="118" width="46" height="42" fill="#f4a261" />
          <rect x="6" y="126" width="10" height="10" fill="#fff" opacity="0.7" />
          <rect x="28" y="126" width="10" height="10" fill="#fff" opacity="0.7" />
          <rect x="0" y="114" width="46" height="5" fill="#c1121f" />
          <rect x="58" y="128" width="40" height="32" fill="#e9c46a" />
          <rect x="62" y="122" width="32" height="7" fill="#2a9d8f" />
          <rect x="120" y="128" width="4" height="32" fill="#6b4f2a" />
          <path d="M122 128 q-14 -6 -20 4 M122 128 q14 -6 20 4 M122 128 q-8 -12 -16 -10 M122 128 q8 -12 16 -10" stroke="#2b9348" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      ))}
      <rect y="160" width="400" height="10" fill="#bdbdbd" />
      {Array.from({ length: 22 }, (_, i) => (
        <rect key={i} x={road + i * 20} y="168" width="10" height="2" fill={i % 2 ? "#222" : "#fff"} />
      ))}
      <rect y="170" width="400" height="70" fill="#3d3d3d" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={road * 1 + i * 40} y="203" width="22" height="3" fill="#ffd43b" />
      ))}
    </g>
  );
}

/** A Lagos ride, side on (about 120 wide, standing on y = 70): wheels turn with t. */
function Vehicle({ mode, t }: { mode: Commute; t: number }) {
  const spin = (t * 720) % 360;
  const wheel = (x: number, y: number, r: number) => (
    <g transform={`translate(${x} ${y}) rotate(${spin})`}>
      <circle r={r} fill="#222" />
      <circle r={r * 0.45} fill="#aaa" />
      <rect x={-r * 0.1} y={-r * 0.8} width={r * 0.2} height={r * 1.6} fill="#666" />
    </g>
  );
  if (mode === "danfo")
    return (
      <g>
        {/* A yellow danfo: two black stripes, a roof rack, the conductor hanging out of the door. */}
        <rect x="4" y="18" width="112" height="44" rx="8" fill="#ffd43b" />
        <rect x="4" y="40" width="112" height="4" fill="#111" />
        <rect x="4" y="48" width="112" height="3" fill="#111" />
        <rect x="12" y="22" width="18" height="14" rx="2" fill="#bde0fe" />
        <rect x="34" y="22" width="18" height="14" rx="2" fill="#bde0fe" />
        <rect x="56" y="22" width="18" height="14" rx="2" fill="#bde0fe" />
        <rect x="78" y="22" width="14" height="30" rx="2" fill="#333" />
        <rect x="96" y="22" width="16" height="14" rx="2" fill="#bde0fe" />
        <rect x="14" y="12" width="70" height="4" fill="#555" />
        <rect x="20" y="4" width="16" height="9" rx="1" fill="#8d5524" />
        <rect x="40" y="6" width="12" height="7" rx="1" fill="#2a9d8f" />
        <circle cx="85" cy="30" r="4" fill="#5c3a1e" />
        <rect x="82" y="34" width="6" height="12" rx="2" fill="#e5484d" />
        {wheel(26, 62, 8)}
        {wheel(96, 62, 8)}
      </g>
    );
  if (mode === "okada")
    return (
      <g>
        {/* An okada: the bike, the rider in front and you behind. */}
        <path d="M28 52 L58 52 L72 38 L86 38" stroke="#c1121f" strokeWidth="7" fill="none" strokeLinecap="round" />
        <rect x="38" y="42" width="30" height="8" rx="3" fill="#222" />
        <path d="M86 38 L94 56" stroke="#555" strokeWidth="3" />
        <circle cx="60" cy="18" r="6" fill="#5c3a1e" />
        <rect x="55" y="24" width="12" height="18" rx="4" fill="#ffd43b" />
        <circle cx="46" cy="20" r="6" fill="#8d5524" />
        <rect x="41" y="26" width="12" height="17" rx="4" fill="#4dabf7" />
        {wheel(28, 60, 10)}
        {wheel(94, 60, 10)}
      </g>
    );
  return (
    <g>
      {/* A keke: yellow and green, a canopy, three wheels (two seen side on). */}
      <path d="M20 58 L20 24 Q20 10 40 10 L86 10 Q100 10 100 24 L100 58 Z" fill="#ffd43b" />
      <rect x="20" y="10" width="80" height="8" rx="3" fill="#2f9e44" />
      <rect x="28" y="22" width="30" height="18" rx="2" fill="#bde0fe" opacity="0.8" />
      <rect x="62" y="22" width="30" height="18" rx="2" fill="#333" opacity="0.25" />
      <rect x="20" y="46" width="80" height="5" fill="#2f9e44" />
      <circle cx="78" cy="30" r="4" fill="#5c3a1e" />
      {wheel(32, 62, 8)}
      {wheel(94, 62, 7)}
    </g>
  );
}
