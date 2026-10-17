"use client";

import { OnTop } from "../on-top";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { prankOf } from "@/lib/world/street";
import { myDoorstep, openDoorstep, type DoorstepEntry } from "../people-actions";
import { playSfx, type Sfx } from "../sound";
import { cleanPrank } from "../street-actions";

// Coming home to a prank (docs/STREET.md): the prank plays out on the screen (eggs splat on your
// door, toilet paper rains down, glitter bursts, the fake parcel pops, stickers slap on, the air
// horn shakes everything), then who did it, their note, and Clean it up or Prank them back.

/** Pranks at your door you haven't seen yet (newest first), shown one at a time when you come back. */
export function usePrankReveal(on: boolean) {
  const [queue, setQueue] = useState<DoorstepEntry[]>([]);
  const look = useCallback(() => {
    void myDoorstep()
      .then((list) => {
        const fresh = list.filter((d) => d.kind === "prank" && !d.opened && !d.cleaned && Date.now() - Date.parse(d.at) < 7 * 86_400_000);
        setQueue(fresh.slice(0, 3));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(look, 2500);
    // Back after a while away (the phone was locked, another app): look again.
    let hiddenAt = 0;
    const vis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) look();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [on, look]);
  const done = useCallback((id: number) => {
    void openDoorstep(id);
    setQueue((q) => q.filter((d) => d.id !== id));
  }, []);
  return { prank: queue[0] ?? null, done };
}

const SOUND: Record<string, Sfx> = { eggs: "splash", toilet_paper: "rustle", glitter: "chime", fake_parcel: "pop", stickers: "pop", air_horn: "honk" };

/** A steady random number for piece i (so the animation doesn't change between renders). */
const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 91.7 + salt * 12.3) * 43758.5453;
  return v - Math.floor(v);
};

export function PrankReveal({ prank, onDone, onPerson, onMessage }: { prank: DoorstepEntry; onDone: () => void; onPerson: (id: string) => void; onMessage: (text: string, ok: boolean) => void }) {
  const kind = prank.prank ?? "eggs";
  const p = prankOf(kind);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    playSfx(SOUND[kind] ?? "pop");
    if (kind === "air_horn") playSfx("honk", { delay: 0.35 });
    const t = setTimeout(() => setReady(true), 1800);
    return () => clearTimeout(t);
  }, [kind]);
  const pieces = useMemo(() => Array.from({ length: kind === "glitter" ? 60 : kind === "toilet_paper" ? 9 : kind === "fake_parcel" ? 36 : kind === "stickers" ? 12 : 7 }, (_, i) => i), [kind]);

  return (
    <OnTop className={`fixed inset-0 flex flex-col items-center justify-end overflow-hidden bg-black/70 ${kind === "air_horn" ? "prank-shake" : ""}`} role="dialog" aria-label="Someone pranked your door">
      <style>{CSS}</style>
      {/* Your front door. */}
      <div className="pointer-events-none absolute inset-x-0 top-[8%] flex justify-center">
        <svg viewBox="0 0 200 220" className="h-[46vh] max-h-80 w-auto drop-shadow-2xl" aria-hidden>
          <rect x="0" y="0" width="200" height="220" rx="8" fill="#e9d8a6" />
          <rect x="50" y="40" width="100" height="180" rx="4" fill="#8d5524" />
          <rect x="60" y="52" width="80" height="70" rx="3" fill="#a0672e" />
          <rect x="60" y="132" width="80" height="78" rx="3" fill="#a0672e" />
          <circle cx="132" cy="140" r="5" fill="#ffd43b" />
          <rect x="20" y="210" width="160" height="10" fill="#6c757d" />
          {kind === "eggs" &&
            pieces.map((i) => (
              <g key={i} className="prank-splat" style={{ animationDelay: `${0.25 + i * 0.18}s` }} transform={`translate(${60 + rnd(i, 1) * 80} ${55 + rnd(i, 2) * 140})`}>
                <path d="M-14 0 C-14 -10 -4 -13 0 -12 C8 -14 15 -6 13 2 C16 9 6 14 0 12 C-8 15 -16 8 -14 0Z" fill="#fff8e1" />
                <circle r="5" fill="#fcc419" />
              </g>
            ))}
          {kind === "stickers" &&
            pieces.map((i) => (
              <text
                key={i}
                className="prank-slap"
                style={{ animationDelay: `${0.2 + i * 0.12}s` }}
                x={25 + rnd(i, 1) * 150}
                y={30 + rnd(i, 2) * 180}
                fontSize="26"
                transform={`rotate(${rnd(i, 3) * 60 - 30} ${25 + rnd(i, 1) * 150} ${30 + rnd(i, 2) * 180})`}
              >
                {["⭐", "😜", "🦄", "🍕", "💩", "🌈"][i % 6]}
              </text>
            ))}
        </svg>
      </div>

      {/* What flies about. */}
      {kind === "eggs" &&
        pieces.map((i) => (
          <span key={i} className="prank-throw absolute text-4xl" style={{ left: `${30 + rnd(i, 1) * 40}%`, top: "60%", animationDelay: `${i * 0.18}s` }}>
            🥚
          </span>
        ))}
      {kind === "toilet_paper" &&
        pieces.map((i) => (
          <span
            key={i}
            className="prank-fall absolute top-0 w-5 rounded-b-full bg-white shadow"
            style={{ left: `${5 + i * 11}%`, height: `${40 + rnd(i, 2) * 40}vh`, animationDelay: `${rnd(i, 3) * 0.8}s` }}
          />
        ))}
      {kind === "glitter" &&
        pieces.map((i) => {
          const a = rnd(i, 1) * Math.PI * 2;
          const d = 30 + rnd(i, 2) * 45;
          return (
            <span
              key={i}
              className="prank-burst absolute left-1/2 top-[35%] size-2.5 rounded-full"
              style={{ background: ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2", "#fff"][i % 6], ["--dx" as string]: `${Math.cos(a) * d}vw`, ["--dy" as string]: `${Math.sin(a) * d}vh`, animationDelay: `${rnd(i, 3) * 0.3}s` }}
            />
          );
        })}
      {kind === "fake_parcel" && (
        <>
          <span className="prank-parcel absolute left-1/2 top-[38%] -translate-x-1/2 text-7xl">📦</span>
          {pieces.map((i) => {
            const a = -Math.PI / 2 + (rnd(i, 1) - 0.5) * 2.4;
            const d = 25 + rnd(i, 2) * 40;
            return (
              <span
                key={i}
                className="prank-burst absolute left-1/2 top-[40%] h-2 w-3.5 rounded-full bg-[#fff3bf]"
                style={{ ["--dx" as string]: `${Math.cos(a) * d}vw`, ["--dy" as string]: `${Math.sin(a) * d + 30}vh`, animationDelay: `${0.9 + rnd(i, 3) * 0.3}s` }}
              />
            );
          })}
        </>
      )}
      {kind === "air_horn" && <span className="prank-honk absolute left-1/2 top-[30%] -translate-x-1/2 font-display text-6xl font-black text-white">HOOONK!</span>}

      {/* Who did it, their note, and what to do. */}
      <div className={`relative m-3 w-full max-w-sm rounded-3xl bg-panel p-4 shadow-2xl transition duration-500 ${ready ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
        <div className="flex items-center gap-3">
          <AvatarFace avatar={cleanAvatar(prank.fromAvatar, prank.fromName)} size={44} />
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
            {p?.emoji} {prank.fromName} {p?.did ?? "pranked your door"}!
          </p>
        </div>
        {prank.body && (
          <p className="mt-3 rounded-2xl rounded-tl-sm bg-gold/15 px-3 py-2 text-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-gold-dark">They left a note</span>
            &ldquo;{prank.body}&rdquo;
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void cleanPrank(prank.id).then((r) => {
                onMessage(r.ok ? r.text : r.error, r.ok);
                onDone();
              });
            }}
            className="h-11 rounded-full bg-ink/[0.06] text-sm font-semibold disabled:opacity-40"
          >
            Clean it up
          </button>
          {prank.from ? (
            <button
              onClick={() => {
                onDone();
                onPerson(prank.from!);
              }}
              className="h-11 rounded-full bg-[#e8590c] text-sm font-semibold text-white"
            >
              Prank them back
            </button>
          ) : (
            <button onClick={onDone} className="h-11 rounded-full bg-ink text-sm font-semibold text-white">
              OK
            </button>
          )}
        </div>
        <button onClick={onDone} className="mt-2 w-full text-center text-xs font-semibold text-muted">
          Leave it for now
        </button>
      </div>
    </OnTop>
  );
}

const CSS = `
@keyframes prank-throw { 0% { transform: translateY(40vh) scale(.6) rotate(0); opacity: 0 } 15% { opacity: 1 } 100% { transform: translateY(-30vh) scale(1.1) rotate(540deg); opacity: 0 } }
.prank-throw { animation: prank-throw .7s ease-out both }
@keyframes prank-splat { 0% { transform: scale(0); opacity: 0 } 60% { opacity: 1 } 100% { opacity: 1 } }
.prank-splat { animation: prank-splat .25s cubic-bezier(.2,2,.4,1) both; transform-box: fill-box; transform-origin: center }
@keyframes prank-fall { 0% { transform: translateY(-100%) skewX(0) } 60% { transform: translateY(0) skewX(6deg) } 100% { transform: translateY(0) skewX(-4deg) } }
.prank-fall { animation: prank-fall 1.4s ease-out both }
@keyframes prank-burst { 0% { transform: translate(0,0) scale(.4); opacity: 0 } 10% { opacity: 1 } 100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: .9 } }
.prank-burst { animation: prank-burst 1.3s cubic-bezier(.1,.8,.3,1) both }
@keyframes prank-parcel { 0%,100% { transform: translateX(-50%) rotate(0) } 10%,30%,50%,70% { transform: translateX(-50%) rotate(-12deg) } 20%,40%,60% { transform: translateX(-50%) rotate(12deg) } 85% { transform: translateX(-50%) scale(1.3) } }
.prank-parcel { animation: prank-parcel 1.1s ease-in-out both }
@keyframes prank-slap { 0% { opacity: 0; font-size: 70px } 100% { opacity: 1 } }
.prank-slap { animation: prank-slap .18s ease-in both }
@keyframes prank-shake { 0%,100% { transform: translate(0,0) } 20% { transform: translate(-8px,4px) } 40% { transform: translate(7px,-5px) } 60% { transform: translate(-6px,-3px) } 80% { transform: translate(5px,6px) } }
.prank-shake { animation: prank-shake .12s linear 8 }
@keyframes prank-honk { 0% { transform: translateX(-50%) scale(.2); opacity: 0 } 30% { transform: translateX(-50%) scale(1.25); opacity: 1 } 60% { transform: translateX(-50%) scale(.95) } 80% { transform: translateX(-50%) scale(1.1) } 100% { transform: translateX(-50%) scale(1); opacity: 1 } }
.prank-honk { animation: prank-honk .9s ease-out both }
@media (prefers-reduced-motion: reduce) { .prank-throw, .prank-splat, .prank-fall, .prank-burst, .prank-parcel, .prank-slap, .prank-shake, .prank-honk { animation-duration: .01s !important; animation-iteration-count: 1 !important } }
`;
