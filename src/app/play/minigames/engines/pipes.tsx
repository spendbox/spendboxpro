"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Hacker Grid: tap tiles to turn them a quarter. Get power from the green socket on the left
// to the red one on the right. Each grid solved is one point; the grids grow. Score: grids.

const N = 1;
const E = 2;
const S = 4;
const Wd = 8;
const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: Wd },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: Wd, dx: -1, dy: 0, opp: E },
];
const rot = (m: number, k: number) => {
  let x = m;
  for (let i = 0; i < k; i++) x = ((x << 1) | (x >> 3)) & 15;
  return x;
};

type Grid = { size: number; tiles: number[]; start: number; end: number };

function makeGrid(r: Rng, size: number): Grid {
  const start = Math.floor(r() * size);
  const end = Math.floor(r() * size);
  const tiles = Array(size * size).fill(0);
  // A winding path from the left edge to the right edge (random depth-first search).
  const seen = new Set<number>();
  const path: number[] = [];
  const dfs = (x: number, y: number): boolean => {
    const i = y * size + x;
    seen.add(i);
    path.push(i);
    if (x === size - 1 && y === end) return true;
    const order = [...DIRS].sort(() => r() - 0.5);
    for (const d of order) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen.has(ny * size + nx)) continue;
      if (dfs(nx, ny)) return true;
    }
    path.pop();
    return false;
  };
  dfs(0, start);
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    const x = i % size;
    const y = Math.floor(i / size);
    for (const nb of [path[k - 1], path[k + 1]]) {
      if (nb === undefined) continue;
      const d = DIRS.find((dd) => (y + dd.dy) * size + (x + dd.dx) === nb && x + dd.dx >= 0 && x + dd.dx < size)!;
      tiles[i] |= d.bit;
    }
  }
  tiles[path[0]] |= Wd;
  tiles[path[path.length - 1]] |= E;
  // Other squares get random pipes, so the path isn't obvious.
  const shapes = [N | S, N | E, N | E | S, N | E, N | S];
  for (let i = 0; i < tiles.length; i++) if (!tiles[i]) tiles[i] = rot(shapes[Math.floor(r() * shapes.length)], Math.floor(r() * 4));
  // Scramble every tile.
  for (let i = 0; i < tiles.length; i++) tiles[i] = rot(tiles[i], 1 + Math.floor(r() * 3));
  return { size, tiles, start, end };
}

/** Which tiles have power (flowing in from the start socket). */
function powered(g: Grid) {
  const on = new Set<number>();
  const first = g.start * g.size;
  if (!(g.tiles[first] & Wd)) return on;
  const stack = [first];
  on.add(first);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % g.size;
    const y = Math.floor(i / g.size);
    for (const d of DIRS) {
      if (!(g.tiles[i] & d.bit)) continue;
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= g.size || ny >= g.size) continue;
      const j = ny * g.size + nx;
      if (on.has(j) || !(g.tiles[j] & d.opp)) continue;
      on.add(j);
      stack.push(j);
    }
  }
  return on;
}

export default function Pipes({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const seconds = Number(cfg.seconds ?? 75);
  const [r] = useState(() => makeRng(seed));
  const [solved, setSolved] = useState(0);
  const [grid, setGrid] = useState(() => makeGrid(r, 4));
  const [left, setLeft] = useState(seconds);
  const on = useMemo(() => powered(grid), [grid]);
  const lastTile = grid.end * grid.size + grid.size - 1;
  const done = on.has(lastTile) && (grid.tiles[lastTile] & E) !== 0;

  useEffect(() => {
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) finish(solved);
  }, [left, solved, finish]);
  useEffect(() => {
    if (!done) return;
    playSfx("found");
    const id = window.setTimeout(() => {
      setSolved((n) => n + 1);
      setGrid(makeGrid(r, Math.min(7, 4 + Math.floor((solved + 1) / 2))));
    }, 700);
    return () => window.clearTimeout(id);
  }, [done, r, solved]);

  function turn(i: number) {
    if (done) return;
    playSfx("tick");
    setGrid((g) => ({ ...g, tiles: g.tiles.map((t, j) => (j === i ? rot(t, 1) : t)) }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-[#0b2e24] px-4 py-2 font-bold text-[#69db7c]">
        <span>{solved} hacked</span>
        <span className="tabular-nums">{Math.max(0, left)}s</span>
      </div>
      <div className={cn("relative mx-auto aspect-square w-full max-w-sm rounded-3xl bg-[#062018] p-3", done && "ring-4 ring-[#69db7c]")}>
        <svg viewBox={`-3 0 ${grid.size * 10 + 6} ${grid.size * 10}`} className="h-full w-full">
          <circle cx={-0.5} cy={grid.start * 10 + 5} r={2.2} fill="#69db7c" />
          <circle cx={grid.size * 10 + 0.5} cy={grid.end * 10 + 5} r={2.2} fill={done ? "#69db7c" : "#ff6b6b"} />
          {grid.tiles.map((t, i) => {
            const x = (i % grid.size) * 10;
            const y = Math.floor(i / grid.size) * 10;
            const live = on.has(i);
            const colour = live ? "#69db7c" : "#2b8a3e";
            return (
              <g key={i} onClick={() => turn(i)} style={{ cursor: "pointer" }}>
                <rect x={x + 0.3} y={y + 0.3} width={9.4} height={9.4} rx={1.2} fill={live ? "#0b3d2c" : "#0a2a20"} stroke="#0f5132" strokeWidth={0.3} />
                {t & N ? <rect x={x + 4} y={y} width={2} height={5.5} fill={colour} /> : null}
                {t & S ? <rect x={x + 4} y={y + 4.5} width={2} height={5.5} fill={colour} /> : null}
                {t & E ? <rect x={x + 4.5} y={y + 4} width={5.5} height={2} fill={colour} /> : null}
                {t & Wd ? <rect x={x} y={y + 4} width={5.5} height={2} fill={colour} /> : null}
                <circle cx={x + 5} cy={y + 5} r={1.5} fill={colour} />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-center text-xs text-muted">Tap a tile to turn it. Light a path from the green socket to the red one.</p>
    </div>
  );
}
