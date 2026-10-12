// Where things are at an international airport of any size (tiles, from the airport's first tile),
// shared by the drawing (megas.ts) and what moves there (aircraft.ts: jets taking off and landing on
// the runways, helicopters lifting off the helipads). A big airport has two runways side by side.

export type AirportPlan = {
  cx: number;
  cz: number;
  /** Runways (along x): middle z, length, width. The first is the one jets use. */
  runways: { z: number; len: number; w: number }[];
  taxiway: number;
  apron: number;
  terminal: { z: number; len: number };
  /** Gates where parked jets sit (x along the terminal). */
  gates: number[];
  tower: { x: number; z: number; h: number };
  hangars: { x: number; z: number }[];
  helipads: { x: number; z: number }[];
  carPark: { z: number; len: number };
};

export function airportPlan(w: number, d: number): AirportPlan {
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const big = w >= 12 && d >= 8;
  const len = w - 0.6;
  const runways = big
    ? [
        { z: cz - d * 0.36, len, w: 0.75 },
        { z: cz - d * 0.18, len: len * 0.82, w: 0.65 },
      ]
    : [{ z: cz - d * 0.28, len, w: 0.62 }];
  const taxiway = big ? cz - d * 0.05 : cz - d * 0.14;
  const apron = big ? cz + d * 0.07 : cz - 0.05;
  const tLen = Math.min(w * 0.55, Math.max(3.9, w - 3));
  const terminal = { z: big ? cz + d * 0.2 : cz + 0.6, len: tLen };
  const count = Math.max(3, Math.floor(tLen / 1.25));
  const gates = Array.from({ length: count }, (_, k) => cx - tLen / 2 + (tLen / count) * (k + 0.5));
  const tower = { x: cx + tLen / 2 + (big ? 1.4 : 0.65), z: terminal.z + 0.35, h: big ? 2.6 : 1.5 };
  const hangarX = cx - tLen / 2 - (big ? 1.9 : 0.75);
  const hangars = Array.from({ length: big ? 4 : 2 }, (_, k) => ({ x: hangarX - (k % 2) * 1.1, z: apron - 0.2 + Math.floor(k / 2) * 0.7 + (k % 2) * 0.1 }));
  const helipads = big
    ? [
        { x: cx - w * 0.42, z: cz + d * 0.3 },
        { x: cx - w * 0.42 + 0.9, z: cz + d * 0.3 },
      ]
    : [{ x: cx - 2.4, z: cz + 1.45 }];
  return { cx, cz, runways, taxiway, apron, terminal, gates, tower, hangars, helipads, carPark: { z: cz + d / 2 - (big ? 0.7 : 0.4), len: Math.min(w - 2, tLen + 1) } };
}
