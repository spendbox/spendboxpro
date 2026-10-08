"use client";

import { useRef, useState } from "react";
import { Lightbulb, Music, Piano as PianoIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { questEvent } from "./quest-store";
import { pianoNote } from "./synth";
import { GameHeader, type GameProps, nowMs, rand } from "./ui";

// A little piano: tap (or slide across) the keys, with several fingers if you like. "Teach me"
// lights up the keys for a simple tune.

const WHITE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77]; // C4 … F5
const BLACK: { m: number; after: number }[] = [
  { m: 61, after: 0 },
  { m: 63, after: 1 },
  { m: 66, after: 3 },
  { m: 68, after: 4 },
  { m: 70, after: 5 },
  { m: 73, after: 7 },
  { m: 75, after: 8 },
];
const NAMES: Record<number, string> = { 60: "C", 62: "D", 64: "E", 65: "F", 67: "G", 69: "A", 71: "B", 72: "C", 74: "D", 76: "E", 77: "F" };
// "Ode to Joy" (Beethoven, public domain), the opening line.
const TUNE = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];

export function Piano(props: GameProps) {
  const [down, setDown] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState<{ id: number; x: number }[]>([]);
  const [lesson, setLesson] = useState<number | null>(null);
  const played = useRef(0);
  const pointerKey = useRef(new Map<number, number>());

  function play(m: number, x: number) {
    pianoNote(m);
    setDown((d) => new Set(d).add(m));
    window.setTimeout(() => setDown((d) => {
      const n = new Set(d);
      n.delete(m);
      return n;
    }), 180);
    const id = nowMs() + rand();
    setNotes((ns) => [...ns.slice(-8), { id, x }]);
    played.current += 1;
    if (played.current === 8) questEvent({ type: "play", game: "piano" });
    if (lesson !== null && TUNE[lesson] === m) setLesson(lesson + 1 >= TUNE.length ? null : lesson + 1);
  }

  function keyAt(e: React.PointerEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const k = el?.closest<HTMLElement>("[data-key]");
    return k ? Number(k.dataset.key) : null;
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const m = keyAt(e);
    if (m === null) return;
    pointerKey.current.set(e.pointerId, m);
    const r = e.currentTarget.getBoundingClientRect();
    play(m, ((e.clientX - r.left) / r.width) * 100);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerKey.current.has(e.pointerId)) return;
    const m = keyAt(e);
    if (m === null || pointerKey.current.get(e.pointerId) === m) return;
    pointerKey.current.set(e.pointerId, m);
    const r = e.currentTarget.getBoundingClientRect();
    play(m, ((e.clientX - r.left) / r.width) * 100);
  }
  const onUp = (e: React.PointerEvent) => pointerKey.current.delete(e.pointerId);

  const next = lesson !== null ? TUNE[lesson] : null;
  const keyW = 100 / WHITE.length;

  return (
    <div className="space-y-3">
      <GameHeader icon={PianoIcon} title="Piano" sub={props.label} onClose={props.onClose} color="#18202b" />
      <div className="relative h-20 overflow-hidden rounded-2xl bg-panel-2">
        {notes.map((n) => (
          <Music key={n.id} className="absolute bottom-1 size-6 text-[#7048e8]" style={{ left: `calc(${n.x}% - 12px)`, animation: "act-note 1.2s ease-out both" }} />
        ))}
        <p className="absolute inset-x-0 top-2 text-center text-sm text-muted">
          {lesson !== null ? `Play the glowing key (${lesson + 1}/${TUNE.length})` : "Tap or slide across the keys"}
        </p>
      </div>
      <div
        className="relative h-44 touch-none select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="group"
        aria-label="Piano keys"
      >
        {WHITE.map((m, i) => (
          <div
            key={m}
            data-key={m}
            className={cn(
              "absolute top-0 flex h-full items-end justify-center rounded-b-xl border border-[#ced4da] pb-2 text-xs font-semibold text-muted transition-colors",
              down.has(m) ? "bg-[#e5dbff]" : next === m ? "act-glow bg-gold/60" : "bg-white",
            )}
            style={{ left: `${i * keyW}%`, width: `${keyW}%` }}
          >
            {NAMES[m]}
          </div>
        ))}
        {BLACK.map((b) => (
          <div
            key={b.m}
            data-key={b.m}
            className={cn("absolute top-0 z-10 h-[60%] rounded-b-lg", down.has(b.m) ? "bg-[#7048e8]" : next === b.m ? "bg-gold" : "bg-ink")}
            style={{ left: `${(b.after + 1) * keyW - keyW * 0.3}%`, width: `${keyW * 0.6}%` }}
          />
        ))}
      </div>
      <button
        onClick={() => setLesson(lesson === null ? 0 : null)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-panel-2 py-3 text-sm font-semibold"
      >
        <Lightbulb className="size-4 text-gold-dark" /> {lesson === null ? "Teach me a tune" : "Stop the lesson"}
      </button>
    </div>
  );
}
