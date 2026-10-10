"use client";

import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { Act, Die, SEAT_COLOURS, die, rnd } from "./common";

// Ludo for 2-4. Roll; a six brings a token out of the yard (and rolls again; three sixes in a
// row lose the turn). Tokens race 51 squares round the board, then 6 up their home column; the
// last step must be exact. Landing on a lone rival token (not on a star or start square) sends it
// back to its yard. First with all four home wins.

// The 52 squares of the track (x, y on a 15 × 15 board), starting at red's start square.
const TRACK: [number, number][] = [
  ...[1, 2, 3, 4, 5].map((x) => [x, 6] as [number, number]),
  ...[5, 4, 3, 2, 1, 0].map((y) => [6, y] as [number, number]),
  [7, 0],
  ...[0, 1, 2, 3, 4, 5].map((y) => [8, y] as [number, number]),
  ...[9, 10, 11, 12, 13, 14].map((x) => [x, 6] as [number, number]),
  [14, 7],
  ...[14, 13, 12, 11, 10, 9].map((x) => [x, 8] as [number, number]),
  ...[9, 10, 11, 12, 13, 14].map((y) => [8, y] as [number, number]),
  [7, 14],
  ...[14, 13, 12, 11, 10, 9].map((y) => [6, y] as [number, number]),
  ...[5, 4, 3, 2, 1, 0].map((x) => [x, 8] as [number, number]),
  [0, 7],
  [0, 6],
];
// Each colour's home column (steps 51-55) and the middle (56: home).
const HOME: [number, number][][] = [
  [1, 2, 3, 4, 5].map((x) => [x, 7]),
  [1, 2, 3, 4, 5].map((y) => [7, y]),
  [13, 12, 11, 10, 9].map((x) => [x, 7]),
  [13, 12, 11, 10, 9].map((y) => [7, y]),
];
const YARD: [number, number][] = [[1.5, 1.5], [10.5, 1.5], [10.5, 10.5], [1.5, 10.5]];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const FINISH = 56;

/** Board colour index for each seat (two players sit opposite each other). */
const COLOURS_FOR = (n: number) => (n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]);

type S = { seats: number; tokens: number[][]; turn: number; dice: number | null; sixes: number; n: number; seed: number; won: number; log: string };
type M = { roll: true } | { token: number } | { pass: true };

const trackIndex = (colour: number, step: number) => (colour * 13 + step) % 52;

function legal(s: S): number[] {
  if (s.dice === null) return [];
  const out: number[] = [];
  s.tokens[s.turn].forEach((p, k) => {
    if (p === FINISH) return;
    if (p < 0) {
      if (s.dice === 6) out.push(k);
      return;
    }
    if (p + s.dice! <= FINISH) out.push(k);
  });
  return out;
}

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => ({ seats, tokens: Array.from({ length: seats }, () => [-1, -1, -1, -1]), turn: 0, dice: null, sixes: 0, n: 0, seed, won: -1, log: "" }),
  turn: (s) => (s.won >= 0 ? -1 : s.turn),
  moves: (s) => {
    if (s.dice === null) return [{ roll: true }];
    const l = legal(s);
    return l.length ? l.map((token) => ({ token })) : [{ pass: true }];
  },
  play: (s, m) => {
    const next = (t: S): S => ({ ...t, dice: null, sixes: 0, turn: (t.turn + 1) % t.seats });
    if ("roll" in m) {
      const d = die(s);
      const sixes = d === 6 ? s.sixes + 1 : 0;
      if (sixes === 3) return { ...next(s), n: s.n + 1, log: "Three sixes: turn lost" };
      return { ...s, dice: d, sixes, n: s.n + 1, log: `Rolled ${d}` };
    }
    if ("pass" in m) return { ...next(s), n: s.n + 1, log: "No move" };
    const colours = COLOURS_FOR(s.seats);
    const tokens = s.tokens.map((t) => [...t]);
    const p = tokens[s.turn][m.token];
    const to = p < 0 ? 0 : p + s.dice!;
    tokens[s.turn][m.token] = to;
    let log = p < 0 ? "A token comes out" : to === FINISH ? "A token reaches home!" : `Moved ${s.dice}`;
    let captured = false;
    if (to <= 50) {
      const sq = trackIndex(colours[s.turn], to);
      if (!SAFE.has(sq)) {
        tokens.forEach((ts, seat) => {
          if (seat === s.turn) return;
          const here = ts.map((q, k) => (q >= 0 && q <= 50 && trackIndex(colours[seat], q) === sq ? k : -1)).filter((k) => k >= 0);
          if (here.length === 1) {
            ts[here[0]] = -1;
            captured = true;
            log = "Captured! Sent back to the yard";
          }
        });
      }
    }
    const won = tokens[s.turn].every((q) => q === FINISH) ? s.turn : -1;
    const again = s.dice === 6 || captured || to === FINISH;
    const t: S = { ...s, tokens, n: s.n + 1, won, log };
    return won >= 0 ? { ...t, dice: null } : again ? { ...t, dice: null } : next(t);
  },
  winners: (s) => (s.won >= 0 ? [s.won] : null),
  bot: (s) => {
    const ms = rules.moves(s);
    if (ms.length === 1) return ms[0];
    const colours = COLOURS_FOR(s.seats);
    let best = ms[0];
    let bestV = -Infinity;
    for (const m of ms) {
      if (!("token" in m)) continue;
      const p = s.tokens[s.turn][m.token];
      const to = p < 0 ? 0 : p + s.dice!;
      let v = rnd(s, m.token) * 2;
      if (p < 0) v += 30;
      if (to === FINISH) v += 40;
      if (to > 50) v += 15;
      if (to <= 50) {
        const sq = trackIndex(colours[s.turn], to);
        if (SAFE.has(sq)) v += 12;
        for (let seat = 0; seat < s.seats; seat++) {
          if (seat === s.turn) continue;
          for (const q of s.tokens[seat]) {
            if (q < 0 || q > 50) continue;
            const their = trackIndex(colours[seat], q);
            if (their === sq && !SAFE.has(sq)) v += 50;
            // In danger: a rival up to 6 behind.
            const behind = (sq - their + 52) % 52;
            if (behind >= 1 && behind <= 6 && !SAFE.has(sq)) v -= 10;
          }
        }
      }
      v += to * 0.3;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    }
    return best;
  },
};

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const colours = COLOURS_FOR(s.seats);
  const playable = canMove && s.dice !== null ? legal(s) : [];
  const pos = (colour: number, p: number, k: number): [number, number] => {
    if (p < 0) return [YARD[colour][0] + (k % 2) * 2 + 0.5, YARD[colour][1] + Math.floor(k / 2) * 2 + 0.5];
    if (p === FINISH) return [7 + (k % 2) * 0.6 - 0.3 + 0.5, 7 + Math.floor(k / 2) * 0.6 - 0.3 + 0.5];
    if (p > 50) {
      const [x, y] = HOME[colour][p - 51];
      return [x + 0.5, y + 0.5];
    }
    const [x, y] = TRACK[trackIndex(colour, p)];
    return [x + 0.5, y + 0.5];
  };
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 15 15" className="mx-auto w-full max-w-sm rounded-2xl bg-white">
        {[0, 1, 2, 3].map((c) => (
          <g key={c}>
            <rect x={YARD[c][0] - 1.5} y={YARD[c][1] - 1.5} width={6} height={6} fill={SEAT_COLOURS[c]} opacity={colours.includes(c) ? 0.85 : 0.25} />
            <rect x={YARD[c][0] - 0.5} y={YARD[c][1] - 0.5} width={4} height={4} rx={0.4} fill="#fff" />
            {HOME[c].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width={1} height={1} fill={SEAT_COLOURS[c]} opacity={0.6} stroke="#ced4da" strokeWidth={0.04} />
            ))}
          </g>
        ))}
        {TRACK.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={1} height={1} fill={i % 13 === 0 ? SEAT_COLOURS[i / 13] : SAFE.has(i) ? "#e9ecef" : "#fff"} opacity={i % 13 === 0 ? 0.7 : 1} stroke="#ced4da" strokeWidth={0.04} />
        ))}
        {[...SAFE].filter((i) => i % 13).map((i) => (
          <text key={i} x={TRACK[i][0] + 0.5} y={TRACK[i][1] + 0.75} fontSize={0.7} textAnchor="middle" fill="#868e96">
            ★
          </text>
        ))}
        <polygon points="6,6 9,6 7.5,7.5" fill={SEAT_COLOURS[1]} />
        <polygon points="9,6 9,9 7.5,7.5" fill={SEAT_COLOURS[2]} />
        <polygon points="9,9 6,9 7.5,7.5" fill={SEAT_COLOURS[3]} />
        <polygon points="6,9 6,6 7.5,7.5" fill={SEAT_COLOURS[0]} />
        {s.tokens.map((ts, st) =>
          ts.map((p, k) => {
            const [x, y] = pos(colours[st], p, k);
            const can = st === s.turn && playable.includes(k);
            return (
              <g key={`${st}-${k}`} onClick={() => can && onMove({ token: k })} style={{ cursor: can ? "pointer" : undefined }}>
                {can && <circle cx={x} cy={y} r={0.55} fill="none" stroke="#212529" strokeWidth={0.12} className="act-pulse" />}
                <circle cx={x} cy={y} r={0.38} fill={SEAT_COLOURS[colours[st]]} stroke="#fff" strokeWidth={0.1} />
              </g>
            );
          }),
        )}
      </svg>
      <div className="flex items-center gap-3">
        <Die n={s.dice} className="size-11" />
        <p className="min-w-0 flex-1 text-sm">
          <b style={{ color: SEAT_COLOURS[colours[s.turn]] }}>{names[s.turn]}</b> {s.log ? `· ${s.log}` : ""}
          {canMove && s.dice !== null && playable.length > 0 && <span className="block text-xs text-muted">Tap a glowing token to move it.</span>}
        </p>
        <div className="w-28">
          {canMove && s.dice === null ? (
            <Act onClick={() => onMove({ roll: true })} tone="green">
              Roll
            </Act>
          ) : canMove && !playable.length ? (
            <Act onClick={() => onMove({ pass: true })}>No move</Act>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {s.tokens.map((ts, i) => (
          <span key={i} className={cn("flex items-center gap-1", i === seat && "font-bold")}>
            <span className="size-3 rounded-full" style={{ background: SEAT_COLOURS[colours[i]] }} /> {names[i]}: {ts.filter((q) => q === FINISH).length}/4 home
          </span>
        ))}
      </div>
    </div>
  );
}
