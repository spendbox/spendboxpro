"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, shuffle, type Rng } from "../rng";
import { tone } from "../sfx";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Bingo against three bots: numbers are called every few seconds. Tap them on your card to mark
// them (+5 each), and tap BINGO when you have a line (+100) or later a full house (+200). The
// bots mark theirs too and shout when they can: be first! A false BINGO costs 30. Over at a
// full house (anyone's) or 2 minutes.

const CALL_MS = 2600;
const LETTERS = "BINGO";

function card(r: Rng) {
  const cols = [0, 1, 2, 3, 4].map((c) => shuffle(r, Array.from({ length: 15 }, (_, i) => c * 15 + i + 1)).slice(0, 5));
  const cells: number[] = [];
  for (let row = 0; row < 5; row++) for (let c = 0; c < 5; c++) cells.push(row === 2 && c === 2 ? 0 : cols[c][row]);
  return cells;
}
const LINES: number[][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];
const hasLine = (marks: Set<number>, cells: number[]) => LINES.some((l) => l.every((i) => cells[i] === 0 || marks.has(cells[i])));
const full = (marks: Set<number>, cells: number[]) => cells.every((n) => n === 0 || marks.has(n));

export default function Bingo({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const seconds = Number(cfg.seconds ?? 120);
  const [r] = useState(() => makeRng(seed));
  const [mine] = useState(() => card(r));
  const [bots] = useState(() => ["Mama Ngozi", "Uncle Kofi", "Grandpa Joe"].map((name) => ({ name, cells: card(r) })));
  const [order] = useState(() => shuffle(r, Array.from({ length: 75 }, (_, i) => i + 1)));
  const [called, setCalled] = useState(0);
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [stage, setStage] = useState<"line" | "full" | "done">("line");
  const [msg, setMsg] = useState("Eyes down…");
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = score;
  });

  const calledSet = new Set(order.slice(0, called));
  const last = called ? order[called - 1] : null;

  // The caller.
  useEffect(() => {
    if (stage === "done") return;
    const id = window.setInterval(() => {
      if (Date.now() - started.current > seconds * 1000) {
        setStage("done");
        setMsg("Time's up!");
        window.setTimeout(() => finish(scoreRef.current), 900);
        return;
      }
      setCalled((c) => Math.min(75, c + 1));
      tone(660, 0.1);
    }, CALL_MS);
    return () => window.clearInterval(id);
  }, [stage, seconds, finish]);

  // The bots shout a moment after they've got it.
  useEffect(() => {
    if (stage === "done" || !called) return;
    const now = new Set(order.slice(0, called));
    const win = bots.find((b) => (stage === "line" ? hasLine(now, b.cells) : full(now, b.cells)));
    if (!win) return;
    const id = window.setTimeout(() => {
      setMsg(`${win.name}: BINGO! ${stage === "line" ? "(a line)" : "(full house)"}`);
      playSfx("denied");
      if (stage === "line") setStage("full");
      else {
        setStage("done");
        window.setTimeout(() => finish(scoreRef.current), 900);
      }
    }, 1200 + r() * 1300);
    return () => window.clearTimeout(id);
  }, [called, stage, bots, order, r, finish]);

  function mark(n: number) {
    if (!n || marks.has(n) || stage === "done") return;
    if (!calledSet.has(n)) return playSfx("denied");
    playSfx("pop");
    setMarks(new Set(marks).add(n));
    setScore((s) => s + 5);
  }
  function shout() {
    if (stage === "done") return;
    const ok = stage === "line" ? hasLine(marks, mine) : full(marks, mine);
    if (!ok) {
      setScore((s) => Math.max(0, s - 30));
      setMsg("That's not a bingo! −30");
      return playSfx("denied");
    }
    playSfx("levelup");
    if (stage === "line") {
      setScore((s) => s + 100);
      setMsg("BINGO! A line: +100. Now for a full house…");
      setStage("full");
    } else {
      const total = score + 200;
      setScore(total);
      setMsg("FULL HOUSE! +200");
      setStage("done");
      window.setTimeout(() => finish(total), 900);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>{score} pts</span>
        <span>Playing for: {stage === "line" ? "a line" : stage === "full" ? "full house" : "done"}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-[#f08c00] font-display text-2xl font-extrabold text-white" key={last ?? 0}>
          <span className="act-pop">{last ? `${LETTERS[Math.floor((last - 1) / 15)]}${last}` : "–"}</span>
        </div>
        <p className="min-w-0 flex-1 text-sm font-semibold">{msg}</p>
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-5 gap-1 rounded-2xl bg-[#fff4e6] p-2">
        {LETTERS.split("").map((l) => (
          <span key={l} className="text-center font-display text-lg font-extrabold text-[#e8590c]">
            {l}
          </span>
        ))}
        {mine.map((n, i) => (
          <button
            key={i}
            onClick={() => mark(n)}
            className={cn("grid aspect-square place-items-center rounded-lg text-sm font-bold", n === 0 ? "bg-[#f08c00] text-white" : marks.has(n) ? "bg-[#e64980] text-white" : "bg-white")}
          >
            {n === 0 ? "FREE" : n}
          </button>
        ))}
      </div>
      <button onClick={shout} disabled={stage === "done"} className="w-full rounded-2xl bg-[#e64980] py-3 font-display text-xl font-extrabold text-white disabled:opacity-50">
        BINGO!
      </button>
      <p className="text-center text-xs text-muted">Called so far: {order.slice(Math.max(0, called - 6), called).join(", ") || "none"}</p>
    </div>
  );
}
