"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Trophy } from "@/components/icons";
import { cn } from "@/lib/cn";
import { ARENA_R, Battle, DT, gateDir, gateLabel, squadAlive, type BattleArmy } from "@/lib/realm/battle";
import { FIGHTERS } from "@/lib/realm/fighters";
import { GATES } from "@/lib/realm/schedule";
import { cash } from "@/lib/world/value";
import { armyColour, drawFighter } from "./draw";

// The battle, played on the phone from the armies and the seed (src/lib/realm/battle.ts): live
// while it's being fought (in step with the clock, so everyone watching sees the same moment),
// and again afterwards as often as you like.

export type ArenaData = {
  at: number;
  seed: number;
  arena: number;
  arenas: number;
  armies: BattleArmy[];
  results: { id: string; rank: number; prize: number }[] | null;
};

type Standing = { id: string; name: string; colour: string; pct: number; out: boolean; mine: boolean };

/** The world's edge, a little past the arena's, so the gates fit. */
const VIEW_R = 112;
/** How tall a fighter is drawn, in arena units. */
const FIGURE = 6;
/** At most this many of a squad are drawn (its number is written beside it). */
const SHOW_MAX = 10;
const GOLDEN = 2.399963229728653;

export function ArenaView({ data, mySeq, onArena }: { data: ArenaData; mySeq: number | null; onArena: (n: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(340);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [done, setDone] = useState(false);
  // Live (in step with the clock) or a replay started on this phone (its start time and speed).
  const [replay, setReplay] = useState<{ start: number; speed: number } | null>(null);
  const [clockSecs, setClockSecs] = useState(0);
  const input = useMemo(() => ({ seed: data.seed, armies: data.armies }), [data.seed, data.armies]);
  const colours = useMemo(() => data.armies.map((a) => armyColour(Number(a.id))), [data.armies]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.max(240, Math.min(620, Math.floor(el.clientWidth)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || !input.armies.length) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const battle = new Battle(input);
    let prevX = Float64Array.from(battle.squads, (s) => s.x);
    let prevY = Float64Array.from(battle.squads, (s) => s.y);
    const k = size / (VIEW_R * 2);
    const sx = (x: number) => size / 2 + x * k;
    const sy = (y: number) => size / 2 + y * k;
    let raf = 0;
    let lastUi = 0;
    let wasDone = false;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = Date.now();
      const target = replay ? ((now - replay.start) * replay.speed) / (DT * 1000) : (now - data.at) / (DT * 1000);
      // Catch up to the clock (all at once when opened mid-battle), keeping where everyone was a step ago.
      while (battle.step < Math.floor(target) && !battle.done) {
        if (battle.step === Math.floor(target) - 1) {
          prevX = Float64Array.from(battle.squads, (s) => s.x);
          prevY = Float64Array.from(battle.squads, (s) => s.y);
        }
        battle.advance();
      }
      // Drawn between the last two steps, so it moves smoothly between them.
      const t = battle.done ? 1 : Math.max(0, Math.min(1, target - battle.step));
      draw(ctx, dpr, battle, prevX, prevY, t, now);
      if (now - lastUi > 250 || battle.done !== wasDone) {
        lastUi = now;
        wasDone = battle.done;
        setClockSecs(Math.max(0, Math.floor(battle.step * DT)));
        setDone(battle.done);
        const row = (i: number): Standing => {
          const a = battle.armies[i];
          return { id: a.id, name: a.name, colour: colours[i], pct: a.start ? a.now / a.start : 0, out: a.outAt !== null, mine: Number(a.id) === mySeq };
        };
        // Over: in the battle's own order (the last to fall above those who fell first).
        setStandings(
          battle.done
            ? battle.ranking().map(row)
            : battle.armies.map((_, i) => row(i)).sort((a, b) => Number(a.out) - Number(b.out) || b.pct - a.pct),
        );
      }
    };

    function draw(c: CanvasRenderingContext2D, dpr: number, b: Battle, px: Float64Array, py: Float64Array, t: number, now: number) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      bg.addColorStop(0, "#2a1650");
      bg.addColorStop(0.7, "#140a2e");
      bg.addColorStop(1, "#06030f");
      c.fillStyle = bg;
      c.fillRect(0, 0, size, size);
      // Mist drifting round the realm.
      for (let i = 0; i < 5; i++) {
        const a = now / 9000 + i * 1.3;
        c.beginPath();
        c.arc(sx(Math.cos(a) * 45 * (1 + i * 0.15)), sy(Math.sin(a * 1.2) * 40), (30 + i * 8) * k, 0, Math.PI * 2);
        c.fillStyle = "rgba(160,130,255,0.05)";
        c.fill();
      }
      // The arena's ring and the gates.
      c.beginPath();
      c.arc(sx(0), sy(0), ARENA_R * k, 0, Math.PI * 2);
      c.strokeStyle = "rgba(167,139,250,0.55)";
      c.lineWidth = 2;
      c.shadowColor = "#a78bfa";
      c.shadowBlur = 12;
      c.stroke();
      c.shadowBlur = 0;
      c.font = `600 ${Math.max(9, Math.round(size / 34))}px system-ui, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      for (let g = 0; g < GATES; g++) {
        const [ux, uy] = gateDir(g);
        c.fillStyle = "rgba(221,214,254,0.6)";
        c.fillText(gateLabel(g), sx(ux * 106), sy(uy * 106));
      }
      // The heart of the realm, where everyone meets.
      const pulse = 0.5 + 0.5 * Math.sin(now / 500);
      c.beginPath();
      c.arc(sx(0), sy(0), (6 + pulse * 2) * k, 0, Math.PI * 2);
      c.fillStyle = `rgba(250,204,21,${0.12 + pulse * 0.1})`;
      c.fill();

      const sq = b.squads;
      const xs = sq.map((s, i) => px[i] + (s.x - px[i]) * t);
      const ys = sq.map((s, i) => py[i] + (s.y - py[i]) * t);
      // Shots and blows under the fighters.
      for (let i = 0; i < sq.length; i++) {
        const s = sq[i];
        if (!s.hitting || s.target < 0 || s.hp <= 0) continue;
        const j = s.target;
        const f = FIGHTERS[s.kind];
        if (f.range >= 8) {
          const phase = ((now + i * 97) % 500) / 500;
          const x0 = sx(xs[i]);
          const y0 = sy(ys[i] - FIGURE * 0.6);
          const x1 = sx(xs[j]);
          const y1 = sy(ys[j] - FIGURE * 0.5);
          const hx = x0 + (x1 - x0) * phase;
          const hy = y0 + (y1 - y0) * phase;
          const tx = x0 + (x1 - x0) * Math.max(0, phase - 0.18);
          const ty = y0 + (y1 - y0) * Math.max(0, phase - 0.18);
          const shot = f.id === "dragon" ? "#ff8a3d" : f.id === "angel" ? "#fff3b0" : "#f1e3c8";
          c.strokeStyle = shot;
          c.lineWidth = f.id === "dragon" ? 3.2 : 1.6;
          c.shadowColor = shot;
          c.shadowBlur = f.id === "archer" ? 0 : 8;
          c.beginPath();
          c.moveTo(tx, ty);
          c.lineTo(hx, hy);
          c.stroke();
          c.shadowBlur = 0;
        } else if ((now + i * 131) % 300 < 120) {
          const mx = sx((xs[i] + xs[j]) / 2);
          const my = sy((ys[i] + ys[j]) / 2 - FIGURE * 0.5);
          c.fillStyle = f.nature === "dark" ? "#ff6b3d" : f.nature === "spirit" ? "#c7d2fe" : "#fff7d6";
          for (let p = 0; p < 3; p++) c.fillRect(mx + Math.sin(now / 40 + p * 2 + i) * 3, my + Math.cos(now / 50 + p * 3 + i) * 3, 2, 2);
        }
      }
      // The fighters, back to front.
      const order = sq.map((_, i) => i).filter((i) => sq[i].hp > 0).sort((a, z) => ys[a] - ys[z]);
      const fig = FIGURE * k;
      for (const i of order) {
        const s = sq[i];
        const f = FIGHTERS[s.kind];
        const n = squadAlive(s);
        const shown = Math.min(SHOW_MAX, n);
        const spread = 1.3 + (f.id === "giant" || f.id === "dragon" ? 1.6 : 0);
        const flip = s.target >= 0 ? xs[s.target] < xs[i] : xs[i] > 0;
        const flash = s.took > 0 && (now + i * 53) % 220 < 110;
        const mine = Number(b.armies[s.army].id) === mySeq;
        if (mine) {
          c.beginPath();
          c.arc(sx(xs[i]), sy(ys[i]), (2.5 + Math.sqrt(shown) * spread) * k, 0, Math.PI * 2);
          c.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(now / 250)})`;
          c.lineWidth = 1.5;
          c.stroke();
        }
        for (let m = 0; m < shown; m++) {
          const r = spread * Math.sqrt(m);
          const a = m * GOLDEN;
          const bob = s.hitting ? 0 : Math.sin(now / 90 + m + i) * 0.35;
          drawFighter(c, f.id, sx(xs[i] + Math.cos(a) * r), sy(ys[i] + Math.sin(a) * r * 0.6 + bob), fig, { team: colours[s.army], flip, flash });
        }
        if (n > SHOW_MAX) {
          c.font = `700 ${Math.max(9, Math.round(fig * 1.4))}px system-ui, sans-serif`;
          c.fillStyle = colours[s.army];
          c.fillText(`×${n}`, sx(xs[i]), sy(ys[i] - FIGURE * 2.4));
        }
      }
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [input, size, data.at, replay, colours, mySeq]);

  // Who won: the paid-out result once there is one, else what this phone worked out.
  const winner = useMemo(() => {
    if (!done) return null;
    if (data.results) {
      const first = data.results.find((r) => r.rank === 1);
      const a = first && data.armies.find((x) => x.id === first.id);
      return a ? { name: a.name, prize: first.prize, mine: Number(a.id) === mySeq } : null;
    }
    const top = standings[0];
    return top ? { name: top.name, prize: null, mine: top.mine } : null;
  }, [done, data.results, data.armies, standings, mySeq]);
  const myRank = mySeq === null ? null : data.results?.find((r) => r.id === String(mySeq))?.rank ?? null;

  return (
    <div className="space-y-3">
      {data.arenas > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {Array.from({ length: data.arenas }, (_, n) => (
            <button
              key={n}
              onClick={() => onArena(n)}
              className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", n === data.arena ? "bg-violet-400 text-[#140a2e]" : "bg-white/10 text-violet-100")}
            >
              Arena {n + 1}
            </button>
          ))}
        </div>
      )}
      <div ref={wrap} className="relative w-full">
        <canvas ref={canvas} style={{ width: size, height: size }} className="mx-auto block rounded-3xl shadow-[0_0_40px_rgba(139,92,246,0.35)]" />
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold tabular-nums text-violet-100">
          {done ? "Over" : `${Math.floor(clockSecs / 60)}:${String(clockSecs % 60).padStart(2, "0")}`} · {data.armies.length} armies
        </div>
        {done && winner && (
          <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/65 p-3 text-center text-white backdrop-blur">
            <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-gold">
              <Trophy className="size-4" /> {winner.mine ? "Your army won!" : `${winner.name} won`}
            </div>
            <div className="mt-0.5 text-xs text-violet-100">
              {winner.prize != null ? (winner.prize > 0 ? `Prize: ${cash(winner.prize)}` : "Nobody else to fight here: money back.") : "Working out the prize…"}
              {myRank && myRank > 1 ? ` · You were number ${myRank}` : ""}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {done && (
          <button onClick={() => setReplay({ start: Date.now(), speed: 1 })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-sm font-semibold text-violet-100">
            <RotateCcw className="size-4" /> Watch again
          </button>
        )}
        {replay && !done && (
          <button onClick={() => {
              const speed = replay.speed === 1 ? 2 : 1;
              setReplay({ start: Date.now() - (clockSecs * 1000) / speed, speed });
            }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-sm font-semibold text-violet-100">
            <Play className="size-4" /> {replay.speed === 1 ? "Faster (2×)" : "Normal speed"}
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {standings.map((s) => (
          <li key={s.id} className={cn("flex items-center gap-2 rounded-xl px-2.5 py-1.5", s.mine ? "bg-white/15" : "bg-white/5", s.out && "opacity-50")}>
            <span className="size-3 shrink-0 rounded-full" style={{ background: s.colour }} />
            <span className="min-w-0 flex-1 truncate text-sm text-white">
              {s.name}
              {s.mine && <span className="ml-1 text-xs text-violet-200">(you)</span>}
            </span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full" style={{ width: `${Math.round(s.pct * 100)}%`, background: s.colour }} />
            </span>
            <span className="w-10 text-right text-xs tabular-nums text-violet-100">{s.out ? "Out" : `${Math.round(s.pct * 100)}%`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
