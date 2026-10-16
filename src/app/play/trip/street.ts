// The streets of the trip film (docs/TRIPS.md): straight roads crossing at junctions along the
// route, lined with Lagos buildings (storey blocks with burglar-proof windows and black water tanks
// on the roof, shops with painted signs and awnings, bungalows behind compound walls with a mango
// tree inside, office blocks in glass), a mosque, a church, a filling station, a market, a building
// site, electric poles and their wires, lamps, palms, parked cars, a bus stop, a welcome arch, a
// pedestrian bridge, billboards, towers on the skyline, and the place you're going with its name
// across the front. All drawn with the Kit and one picture sheet, so it's a few meshes in all.

import * as THREE from "three";
import { Kit } from "../city/kit";
import type { Atlas } from "./atlas";
import { ahead, type Route } from "./road-path";
import type { SkyLook } from "./sky";

/** Half the road's width, the pavement's outer edge, and where the lanes run (from the middle). */
export const ROAD_HALF = 5.6;
export const PAVE_OUT = 9;
export const LANE = 2.2;
/** The middle of the pavement (where people walk). */
export const PAVE_MID = (ROAD_HALF + PAVE_OUT) / 2;

type Street = { ox: number; oz: number; yaw: number; len: number; junctions: number[]; s0: number; uAtS0: number };

export type StreetPlan = {
  route: Route;
  /** Where you get in, where the ride stops (the place), and where a moment would stop it. */
  boardS: number;
  stopS: number;
  eventS: number;
  walking: boolean;
  look: SkyLook;
  seed: number;
};

const WALLS = [0xf3e3c3, 0xffd8b5, 0xcfe3f5, 0xd3f0dc, 0xf1c6b0, 0xe9ecef, 0xfff3bf, 0xf8c8dc, 0xc5f6fa, 0xe6d5b8, 0xb9d4a8, 0xf4b183, 0xdcc8f0];
const ROOFS = [0x8c2f1e, 0x2b5d8a, 0x2f6f3e, 0x6b4f3a, 0x9aa3ab, 0xa33c2a];
const TRIMS = [0xffffff, 0xf8f9fa, 0x495057, 0x8d6e63];
const AWNINGS = [0xe03131, 0x1971c2, 0xf59f00, 0x2f9e44, 0x7048e8, 0xd6336c, 0x0b7285];
const CARS = [0xf8f9fa, 0x212529, 0xc92a2a, 0x1c3faa, 0x868e96, 0x2b8a3e, 0xadb5bd, 0x7c2d12, 0xe9ecef];
const SHIRTS = [0xe5484d, 0x4dabf7, 0xffd43b, 0x69db7c, 0xf783ac, 0xffffff, 0x845ef7, 0xff922b, 0x20c997, 0x343a40, 0x1864ab];
const SKIN = [0x8d5524, 0x5c3a1e, 0x6f4422, 0xa0662f, 0x7a4a26];

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A simple standing person (from a distance: crowds at the bus stop, the market, on the bridge). */
export function kitPerson(k: Kit, x: number, z: number, ry: number, r: () => number, opts: { wrapper?: boolean; tray?: boolean } = {}) {
  const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const legs = opts.wrapper ? SHIRTS[Math.floor(r() * SHIRTS.length)] : [0x343a40, 0x1c3f6e, 0x495057, 0x5c4033][Math.floor(r() * 4)];
  const h = 0.92 + r() * 0.12;
  k.at(x, 0, z, ry, () => {
    if (opts.wrapper) k.cyl(0, 0, 0, 0.2 * h, 0.24 * h, 0.85 * h, legs, 8);
    else for (const s of [-1, 1]) k.box(0.1 * s * h, 0, 0, 0.13 * h, 0.84 * h, 0.15 * h, legs);
    k.soft(0, 0.82 * h, 0, 0.44 * h, 0.62 * h, 0.26 * h, shirt, 0.08);
    for (const s of [-1, 1]) k.box(0.27 * s * h, 0.86 * h, 0, 0.1 * h, 0.55 * h, 0.12 * h, shirt);
    k.cyl(0, 1.42 * h, 0, 0.06 * h, 0.06 * h, 0.1 * h, skin, 6);
    k.ball(0, 1.62 * h, 0, 0.12 * h, skin, { sy: 1.15 });
    if (opts.tray) {
      k.cyl(0, 1.78 * h, 0, 0.36, 0.3, 0.07, 0xdee2e6, 12);
      for (let i = 0; i < 5; i++) k.box(Math.cos(i * 1.3) * 0.16, 1.85 * h, Math.sin(i * 1.3) * 0.16, 0.1, 0.12, 0.1, [0xfab005, 0xe03131, 0x74c0fc][i % 3]);
    }
  });
}

/** A parked or waiting car (no wheels turning): a Kit drawing facing +x. */
export function kitCar(k: Kit, color: number, kind: "car" | "suv" | "danfo" = "car") {
  const glass = 0x22303f;
  if (kind === "danfo") {
    k.soft(0, 0.38, 0, 4.9, 1.75, 1.92, 0xf5c518, 0.18);
    for (const s of [-1, 1]) {
      k.box(-0.1, 0.78, s * 0.965, 4.7, 0.09, 0.02, 0x111111, { noAo: true });
      k.box(-0.5, 1.4, s * 0.965, 3.4, 0.5, 0.02, glass, { noAo: true });
    }
    k.box(2.3, 1.12, 0, 0.3, 0.55, 1.7, glass, { noAo: true });
    for (const x of [1.6, -1.5]) for (const z of [-0.88, 0.88]) k.cyl(x, 0, z, 0.38, 0.38, 0.26, 0x1b1b1b, 12, { rx: Math.PI / 2, noAo: true });
    return;
  }
  const suv = kind === "suv";
  k.soft(0, 0.32, 0, 4.4, suv ? 0.9 : 0.68, 1.82, color, 0.2);
  k.soft(-0.2, suv ? 1.18 : 0.95, 0, suv ? 2.9 : 2.3, suv ? 0.7 : 0.58, 1.6, glass, 0.16);
  k.soft(-0.2, suv ? 1.86 : 1.5, 0, suv ? 2.7 : 2.0, 0.08, 1.5, color, 0.04);
  for (const x of [1.4, -1.4]) for (const z of [-0.84, 0.84]) k.cyl(x, 0.36, z, 0.35, 0.35, 0.24, 0x1b1b1b, 12, { rx: Math.PI / 2, noAo: true });
  for (const s of [-1, 1]) {
    k.box(2.2, 0.7, s * 0.6, 0.04, 0.13, 0.32, 0xfff3bf, { layer: "glow", noAo: true });
    k.box(-2.2, 0.7, s * 0.6, 0.04, 0.12, 0.3, 0xff6b6b, { layer: "glow", noAo: true });
  }
}

/** The streets along a route: each straight stretch, carried on past the junctions at both ends. */
function streetsOf(route: Route): Street[] {
  const out: Street[] = [];
  route.lines.forEach((ln, i) => {
    const first = i === 0;
    const last = i === route.lines.length - 1;
    const before = first ? 140 : route.turns[i - 1].r + 34;
    const after = last ? 140 : route.turns[i].r + 34;
    const p = route.at(ln.s0);
    const f = ahead(ln.yaw);
    const len = ln.s1 - ln.s0 + before + after;
    const junctions: number[] = [];
    if (!first) junctions.push(before - route.turns[i - 1].r);
    if (!last) junctions.push(before + (ln.s1 - ln.s0) + route.turns[i].r);
    out.push({ ox: p.x - f.fx * before, oz: p.z - f.fz * before, yaw: ln.yaw, len, junctions, s0: ln.s0, uAtS0: before });
  });
  return out;
}

export function buildStreet(scene: THREE.Scene, plan: StreetPlan, atlas: Atlas, disposers: (() => void)[]) {
  const r = rng(plan.seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const night = plan.look.lights;
  const k = new Kit();
  const glowK = new Kit();
  const streets = streetsOf(plan.route);
  const uv = atlas.uv;
  const win = () => (night && r() < 0.5 ? { layer: "texGlow" as const, uv: r() < 0.5 ? uv.winLit : uv.winLit2 } : { layer: "tex" as const, uv: pick([uv.win, uv.winC, uv.winC2]) });
  const groundCol = plan.look.lights ? 0x9a7a58 : 0xc4a27a;

  // The ground everywhere.
  k.mat(plan.route.at(plan.route.length / 2).x, -0.03, plan.route.at(plan.route.length / 2).z, 1400, 1400, groundCol, { noAo: true });

  // ---------------------------------------------------------------- buildings (local: front at z = 0 facing +z)
  const FH = 3.1;
  /** A storey block: shops, a compound wall or a plain ground floor; balconies; flat or pitched roof. */
  const block = (w: number, d: number, floors: number, ground: "shops" | "fence" | "plain", o: { wall?: number; gable?: boolean; balcony?: boolean; sides?: boolean } = {}) => {
    const wall = o.wall ?? pick(WALLS);
    const trim = pick(TRIMS);
    const GH = ground === "shops" ? 3.6 : FH;
    const H = GH + (floors - 1) * FH;
    k.box(0, 0, -d / 2, w, H, d, wall, { grad: [0.8, 1.04, H] });
    for (let f = 1; f < floors; f++) k.box(0, GH + (f - 1) * FH - 0.1, -d / 2, w + 0.24, 0.2, d + 0.24, trim);
    const bays = Math.max(1, Math.floor(w / 2.8));
    const sideBays = Math.max(1, Math.floor(d / 3));
    for (let f = ground === "plain" ? 0 : 1; f < floors; f++) {
      const y = (f === 0 ? 0 : GH + (f - 1) * FH) + FH * 0.55;
      for (let b = 0; b < bays; b++) {
        const x = -w / 2 + (w / bays) * (b + 0.5);
        if (f === 0 && b === Math.floor(bays / 2)) {
          k.quad(x, 1.05, 0.03, 1.0, 2.1, 0xffffff, { layer: "tex" }, uv.door);
          continue;
        }
        const wn = win();
        k.quad(x, y, 0.03, 1.25, 1.42, 0xffffff, { layer: wn.layer }, wn.uv);
        if (r() < 0.12) k.box(x + 0.95, y - 0.55, 0.15, 0.7, 0.45, 0.35, 0xdee2e6);
      }
      if (o.sides !== false)
        for (const s of [-1, 1])
          for (let b = 0; b < sideBays; b++) {
            const wn = win();
            k.quad(s * (w / 2 + 0.03), y, -(d / sideBays) * (b + 0.5), 1.2, 1.4, 0xffffff, { layer: wn.layer, ry: (s * Math.PI) / 2 }, wn.uv);
          }
      if (o.balcony && f > 0 && r() < 0.7) {
        const yb = GH + (f - 1) * FH;
        const bw = Math.min(w - 1, 2.6 + r() * 2);
        const bx = -w / 2 + bw / 2 + r() * (w - bw);
        k.box(bx, yb, 0.6, bw, 0.14, 1.2, trim);
        k.box(bx, yb + 0.14, 1.17, bw, 0.95, 0.06, pick([0x495057, 0xffffff, 0x2b8a3e, 0x1864ab]));
        if (r() < 0.5) k.box(bx - bw / 4, yb + 0.9, 1.1, bw / 3, 0.5, 0.02, pick(SHIRTS), { noAo: true });
      }
    }
    if (ground === "shops") {
      const n = Math.max(1, Math.round(w / 4.2));
      for (let i = 0; i < n; i++) {
        const sw = w / n;
        const x = -w / 2 + sw * (i + 0.5);
        const lit = night && r() < 0.75;
        k.quad(x, 1.35, 0.03, sw - 0.5, 2.7, 0xffffff, { layer: lit ? "texGlow" : "tex" }, pick([uv.shop1, uv.shop2, uv.shop3]));
        k.quad(x, 3.12, 0.05, sw - 0.3, 0.7, 0xffffff, { layer: night && r() < 0.5 ? "texGlow" : "tex" }, atlas.sign(Math.floor(r() * 99)));
        const aw = pick(AWNINGS);
        k.box(x, 2.6, 0.75, sw - 0.2, 0.07, 1.5, aw, { rx: 0.22, noAo: true });
        // Goods out front: crates, sacks, a plastic chair.
        for (let g = 0; g < 3; g++) if (r() < 0.6) k.box(x - sw / 3 + g * (sw / 3), 0, 1.0 + r() * 0.6, 0.5, 0.35 + r() * 0.4, 0.45, pick([0xe03131, 0xfab005, 0x8d6e63, 0x1c7ed6, 0xf8f9fa, 0x2f9e44]));
        if (r() < 0.5) {
          const cx = x + sw / 3;
          k.box(cx, 0.42, 1.9, 0.42, 0.06, 0.42, pick([0xe03131, 0xf8f9fa, 0x1c7ed6]));
          k.box(cx, 0.42, 1.7, 0.42, 0.45, 0.05, pick([0xe03131, 0xf8f9fa, 0x1c7ed6]));
          for (const sx of [-0.18, 0.18]) for (const sz of [1.72, 2.08]) k.box(cx + sx, 0, sz, 0.04, 0.42, 0.04, 0xadb5bd);
        }
      }
    }
    if (ground === "fence") {
      const fc = pick([0xf1f3f5, 0xffe8cc, 0xd3f9d8, 0xe7f5ff, 0xfff0f6]);
      const fz = 2.2;
      k.box(-(w / 2 + 0.8) / 2 - 1.6, 0, fz, w / 2 + 0.8 - 1.6, 2.3, 0.25, fc);
      k.box((w / 2 + 0.8) / 2 + 1.6, 0, fz, w / 2 + 0.8 - 1.6, 2.3, 0.25, fc);
      k.box(0, 2.3, fz, w + 1.6, 0.12, 0.3, 0x495057);
      k.quad(0, 1.1, fz + 0.14, 3.2, 2.2, 0xffffff, { layer: "tex" }, uv.gate);
      for (const s of [-1, 1]) k.box(s * (w / 2 + 0.8), 0, fz / 2, 0.25, 2.3, fz, fc);
      for (const s of [-1, 1]) k.box(s * 1.7, 0, fz, 0.4, 2.6, 0.4, 0xadb5bd);
      if (r() < 0.6) tree(k, -w / 2 + 1.2, 1.0, "mango");
    }
    // The roof.
    if (o.gable) {
      const hd = d / 2 + 0.45;
      const rise = 1.5;
      const a = Math.atan2(rise, hd);
      const L = Math.hypot(hd, rise);
      const rc = pick(ROOFS);
      k.box(0, H - 0.05, -d / 2 + hd / 2 - 0.05, w + 0.7, 0.1, L, rc, { rx: a });
      k.box(0, H - 0.05, -d / 2 - hd / 2 + 0.05, w + 0.7, 0.1, L, rc, { rx: -a });
      k.box(0, H, -d / 2, w, rise * 0.55, d * 0.55, wall);
    } else {
      for (const [x, z, ww, dd] of [[0, 0.1, w + 0.1, 0.2], [0, -d - 0.1, w + 0.1, 0.2], [-w / 2, -d / 2, 0.2, d], [w / 2, -d / 2, 0.2, d]] as const) k.box(x, H, z, ww, 0.7, dd, wall);
      // Black water tanks on stands, a little stair room.
      const tanks = 1 + Math.floor(r() * 3);
      for (let i = 0; i < tanks; i++) {
        const tx = -w / 2 + 1 + r() * (w - 2);
        const tz = -d * 0.65;
        k.box(tx, H, tz, 1.3, 0.9, 1.3, 0x868e96);
        k.cyl(tx, H + 0.9, tz, 0.62, 0.66, 1.5, r() < 0.7 ? 0x1b1b1b : 0x1c5d99, 14);
      }
      if (r() < 0.5) k.box(w / 4, H, -d / 3, 2.4, 2.4, 2.4, wall);
      if (r() < 0.3) k.ball(-w / 4, H + 1.0, -d / 2, 0.45, 0xdee2e6, { part: 0.5, rx: -0.9, sz: 0.5 });
    }
    return H;
  };

  /** A glass office (or a tower on the skyline): bays of glass, a frame, a crown. */
  const office = (w: number, d: number, floors: number, frame: number, big = false) => {
    const fh = 3.4;
    const H = floors * fh;
    k.box(0, 0, -d / 2, w, H, d, frame);
    const cellH = big ? fh * 2 : fh;
    const cellW = big ? 6.4 : 3.2;
    const cols = Math.max(1, Math.round((w - 0.6) / cellW));
    const rows = Math.max(1, Math.floor((H - (big ? 0 : fh)) / cellH));
    const sides: [number, number, number, number][] = [[0, 0.03, 0, w], [w / 2 + 0.03, -d / 2, Math.PI / 2, d], [-w / 2 - 0.03, -d / 2, -Math.PI / 2, d]];
    for (const [sx, sz, ry, span] of sides) {
      const n = ry === 0 ? cols : Math.max(1, Math.round((span - 0.6) / cellW));
      const c = (span - 0.6) / n;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < n; col++) {
          const along = -span / 2 + 0.3 + c * (col + 0.5);
          const y = (big ? 0 : fh) + cellH * (row + 0.5);
          const lit = night && r() < 0.45;
          const px = ry === 0 ? along : sx;
          const pz = ry === 0 ? sz : sz - along * Math.sign(ry);
          k.quad(px, y, pz, c - 0.12, cellH - 0.14, ry === 0 ? 0xffffff : 0xe7f0f8, { layer: lit ? "texGlow" : "tex", ry }, lit ? uv.glassLit : uv.glass);
        }
    }
    if (!big) {
      k.quad(0, fh / 2, 0.04, Math.min(w - 1, 9.6), fh - 0.3, 0xffffff, { layer: night ? "texGlow" : "tex" }, uv.lobby);
      k.box(0, fh - 0.15, 1.2, Math.min(w, 10), 0.25, 2.4, frame);
    }
    k.box(0, H, -d / 2, w * 0.7, 1.4, d * 0.7, frame);
    if (big && r() < 0.6) k.cyl(0, H + 1.4, -d / 2, 0.08, 0.12, 8, 0x868e96, 6);
    if (big && night) k.ball(0, H + 9.5, -d / 2, 0.3, 0xff4d4d, { layer: "glow", noAo: true });
    return H;
  };

  /** A bungalow behind its wall: one storey, a pitched aluminium roof. */
  const bungalow = (w: number, d: number) => block(w, d, 1, "fence", { gable: true, sides: true });

  /** Trees: a palm, a mango (round and dark), an almond (flat layers). */
  function tree(kk: Kit, x: number, z: number, kind: "palm" | "mango" | "almond" = "palm") {
    if (kind === "palm") {
      const h = 6 + r() * 3;
      const lean = (r() - 0.5) * 0.3;
      for (let i = 0; i < 6; i++) kk.cyl(x + lean * i * 0.4, (h / 6) * i, z, 0.16 - i * 0.01, 0.19 - i * 0.01, h / 6 + 0.05, i % 2 ? 0x8d6e63 : 0x7a5c50, 7);
      const tx = x + lean * 2.4;
      for (let a = 0; a < 9; a++)
        kk.at(tx, h, z, (a / 9) * Math.PI * 2 + r() * 0.3, () => {
          kk.box(0, -0.15, 1.25, 0.55, 0.05, 2.6, a % 2 ? 0x2f9e44 : 0x2b8a3e, { rx: 0.45 + r() * 0.3, noAo: true, layer: "foliage" });
        });
      kk.ball(tx, h - 0.2, z, 0.35, 0x6b4f2a);
    } else if (kind === "mango") {
      kk.cyl(x, 0, z, 0.2, 0.28, 2.2, 0x6b4f3a, 7);
      for (let i = 0; i < 5; i++) kk.leafy(x + (r() - 0.5) * 2, 2.6 + r() * 1.4, z + (r() - 0.5) * 2, 1.2 + r() * 0.6, i % 2 ? 0x2b6b2e : 0x2f7d34, { detail: 1 });
    } else {
      kk.cyl(x, 0, z, 0.16, 0.22, 3, 0x6b4f3a, 7);
      for (let i = 0; i < 3; i++) kk.leafy(x, 3 + i * 1.1, z, 2.4 - i * 0.6, 0x3c8d3f, { sy: 0.28, detail: 1 });
    }
  }

  /** A lamp post (lit at night: a glow, and a pool of light on the ground). */
  const lamp = (x: number, z: number, armDir: number) => {
    k.cyl(x, 0, z, 0.07, 0.1, 7, 0x495057, 8);
    k.box(x, 6.85, z + armDir * 0.8, 0.1, 0.1, 1.6, 0x495057);
    k.box(x, 6.7, z + armDir * 1.55, 0.5, 0.15, 0.3, 0x343a40);
    k.box(x, 6.62, z + armDir * 1.55, 0.42, 0.04, 0.24, night ? 0xfff0c2 : 0xe9ecef, { layer: night ? "glow" : "solid", noAo: true });
    if (night) {
      glowK.mat(x, 0.02, z + armDir * 1.8, 7, 7, 0x7a5f2e, {}, uv.blob);
      glowK.quad(x, 6.5, z + armDir * 1.55, 2.2, 2.2, 0x9c7a38, { ry: 0 }, uv.blob);
      glowK.quad(x, 6.5, z + armDir * 1.55, 2.2, 2.2, 0x9c7a38, { ry: Math.PI / 2 }, uv.blob);
    }
  };

  // ---------------------------------------------------------------- each street
  const destStreet = streets.findIndex((st) => plan.stopS >= st.s0 && plan.stopS <= st.s0 + st.len - st.uAtS0);
  const boardStreet = streets.findIndex((st) => plan.boardS >= st.s0 && plan.boardS <= st.s0 + st.len - st.uAtS0);
  const eventStreet = streets.findIndex((st) => plan.eventS >= st.s0 && plan.eventS <= st.s0 + st.len - st.uAtS0);
  const uOf = (st: Street, s: number) => st.uAtS0 + (s - st.s0);
  let destDoor = new THREE.Vector3();
  let destLook = new THREE.Vector3();
  let billboards = 0;

  streets.forEach((st, si) => {
    const nearJunction = (u: number, gap: number) => st.junctions.some((j) => Math.abs(u - j) < gap);
    const boardU = si === boardStreet ? uOf(st, plan.boardS) : null;
    const destU = si === destStreet ? uOf(st, plan.stopS) : null;
    const eventU = si === eventStreet ? uOf(st, plan.eventS) : null;
    k.at(st.ox, 0, st.oz, st.yaw, () => {
      // The road: tarmac, worn patches, faded dashes, zebras by the junctions.
      k.mat(st.len / 2, 0, 0, st.len, ROAD_HALF * 2, 0x3d4147, { noAo: true });
      for (let u = 4; u < st.len; u += 7 + r() * 14) if (!nearJunction(u, 7)) k.mat(u, 0.004, (r() - 0.5) * 7, 2 + r() * 5, 1 + r() * 2.2, r() < 0.5 ? 0x34383d : 0x4a4e55, { noAo: true });
      for (let u = 2; u < st.len; u += 6) if (!nearJunction(u, ROAD_HALF + 6)) k.mat(u, 0.008, 0, 3, 0.14, 0xd9dcdf, { noAo: true });
      for (const j of st.junctions)
        for (const side of [-1, 1])
          for (let i = -4; i <= 4; i++) k.mat(j + side * (ROAD_HALF + 3), 0.009, i * 1.15, 2.2, 0.55, 0xe9ecef, { noAo: true });
      // Pavements, kerbs painted black and white, and the gutter.
      for (const side of [-1, 1]) {
        let u0 = 0;
        const cuts = [...st.junctions.map((j) => [j - ROAD_HALF, j + ROAD_HALF]), [st.len, st.len]].sort((a, b) => a[0] - b[0]);
        for (const [c0, c1] of cuts) {
          if (c0 > u0) {
            const L = c0 - u0;
            k.box(u0 + L / 2, 0, side * PAVE_MID, L, 0.16, PAVE_OUT - ROAD_HALF, 0xb8ab96, { noAo: true });
            for (let u = u0; u < c0 - 0.6; u += 1.2) k.box(u + 0.6, 0, side * (ROAD_HALF + 0.1), 1.2, 0.2, 0.22, Math.round(u / 1.2) % 2 ? 0x1f1f1f : 0xf1f3f5, { noAo: true });
            k.mat(u0 + L / 2, 0.005, side * (PAVE_OUT + 0.35), L, 0.7, 0x2b2b2b, { noAo: true });
          }
          u0 = Math.max(u0, c1);
        }
      }
      // Lamps on the right, electric poles and their wires on the left.
      for (let u = 6; u < st.len; u += 26) if (!nearJunction(u, ROAD_HALF + 3)) lamp(u, ROAD_HALF + 0.9, -1);
      const poles: number[] = [];
      for (let u = 10; u < st.len; u += 32) if (!nearJunction(u, ROAD_HALF + 4)) poles.push(u);
      const pz = -(ROAD_HALF + 1.1);
      for (const u of poles) {
        k.cyl(u, 0, pz, 0.11, 0.15, 9, 0x6b5a48, 7);
        k.box(u, 8.4, pz, 0.12, 0.12, 2.2, 0x6b5a48);
        if (r() < 0.3) k.cyl(u + 0.35, 6.6, pz, 0.32, 0.32, 0.9, 0x868e96, 10);
      }
      for (let i = 0; i + 1 < poles.length; i++) {
        const a = poles[i];
        const b = poles[i + 1];
        if (b - a > 40) continue;
        for (const dz of [-0.9, 0, 0.9]) k.box((a + b) / 2, 8.5, pz + dz, b - a, 0.03, 0.03, 0x1b1b1b, { noAo: true });
      }

      // Buildings along both sides, front row and a taller row behind.
      for (const side of [-1, 1]) {
        let u = 0;
        while (u < st.len) {
          const w = 7 + r() * 9;
          const mid = u + w / 2;
          const clear = (gap: number) => !nearJunction(mid, gap + w / 2);
          // Room kept: the bus stop where you get in, the place you're going.
          const nearBoard = side === 1 && boardU != null && Math.abs(mid - boardU) < 13 + w / 2;
          const nearDest = side === 1 && destU != null && Math.abs(mid - destU) < 14 + w / 2;
          if (clear(24) && !nearBoard && !nearDest) {
            const front = PAVE_OUT + 1.6 + r() * 1.2;
            const d = 8 + r() * 3;
            const kind = r();
            k.at(mid, 0, side * front, side === 1 ? Math.PI : 0, () => {
              if (si === 0 && kind < 0.35) bungalow(w, d);
              else if (kind < 0.62) block(w, d, 2 + Math.floor(r() * 3), "shops", { balcony: true });
              else if (kind < 0.86 || si === 0) block(w, d, 2 + Math.floor(r() * 2), "fence", { balcony: true });
              else office(w, d, 4 + Math.floor(r() * 5), pick([0xe9ecef, 0xdee2e6, 0xf8f9fa, 0xced4da]));
            });
          }
          // Behind: taller blocks and offices peeking over.
          if (!nearJunction(mid, 38 + w / 2) && r() < 0.75) {
            const back = PAVE_OUT + 18 + r() * 8;
            k.at(mid, 0, side * back, side === 1 ? Math.PI : 0, () => {
              if (r() < 0.5) block(w, 9, 4 + Math.floor(r() * 4), "plain", { sides: false });
              else office(w, 10, 6 + Math.floor(r() * 6), pick([0xdee2e6, 0xced4da, 0xe9ecef]), true);
            });
          }
          u += w + 1 + r() * 2.5;
        }
        // Palms, trees and stalls on the pavements' edges.
        for (let tu = 8; tu < st.len; tu += 12 + r() * 14) {
          if (nearJunction(tu, 12)) continue;
          if (side === 1 && ((boardU != null && Math.abs(tu - boardU) < 10) || (destU != null && Math.abs(tu - destU) < 12) || (eventU != null && Math.abs(tu - eventU) < 9))) continue;
          const rr = r();
          const z = side * (PAVE_OUT - 0.5);
          if (rr < 0.4) tree(k, tu, z, "palm");
          else if (rr < 0.55) tree(k, tu, z, "almond");
          else if (rr < 0.8) {
            // A hawker's umbrella and table.
            k.cyl(tu, 0, z - side * 0.4, 0.04, 0.04, 2.3, 0x495057, 6);
            k.cyl(tu, 2.1, z - side * 0.4, 0, 1.4, 0.55, pick(AWNINGS), 10);
            k.box(tu, 0, z - side * 0.4, 1.3, 0.8, 0.7, 0x8d6e63);
            for (let g = 0; g < 4; g++) k.box(tu - 0.45 + g * 0.3, 0.8, z - side * 0.4, 0.24, 0.16, 0.5, pick([0xfab005, 0xe03131, 0x74c0fc, 0xf8f9fa]));
            if (r() < 0.7) kitPerson(k, tu + 0.9, z - side * 0.1, side === 1 ? Math.PI : 0, r, { wrapper: true });
          }
        }
        // Parked cars by the kerb (not where you get in, stop, or something happens).
        for (let pu = 14; pu < st.len; pu += 18 + r() * 26) {
          if (nearJunction(pu, 14)) continue;
          if ((boardU != null && Math.abs(pu - boardU) < 16) || (destU != null && Math.abs(pu - destU) < 16) || (eventU != null && Math.abs(pu - eventU) < 24)) continue;
          if (r() < 0.45) continue;
          k.at(pu, 0, side * (ROAD_HALF - 0.95), side === 1 ? 0 : Math.PI, () => kitCar(k, pick(CARS), r() < 0.2 ? "suv" : "car"));
        }
      }
      // The bus stop, just ahead of where you get in.
      if (boardU != null && !plan.walking)
        k.at(boardU + 7, 0, PAVE_OUT - 1.2, Math.PI, () => {
          k.box(0, 2.5, 0, 4.4, 0.12, 1.8, 0x1864ab);
          for (const x of [-2, 2]) k.box(x, 0.16, -0.7, 0.1, 2.34, 0.1, 0x495057);
          k.box(0, 0.16, -0.75, 4, 1.6, 0.04, 0x9fb7c9, { noAo: true });
          k.box(0, 0.6, -0.4, 3.4, 0.08, 0.4, 0x868e96);
          k.quad(0, 2.85, 0.92, 1.8, 0.5, 0xffffff, { layer: "tex" }, uv.busstop);
          k.quad(0, 2.85, 0.92, 1.8, 0.5, 0xffffff, { layer: "tex", ry: Math.PI }, uv.busstop);
          for (let i = 0; i < 4; i++) kitPerson(k, -1.6 + i * 1.1 + r() * 0.3, -0.1 + r() * 0.4, Math.PI + (r() - 0.5), r, { wrapper: r() < 0.4 });
        });
      // Billboards.
      for (let bu = 30; bu < st.len - 20; bu += 70 + r() * 30) {
        if (nearJunction(bu, 16)) continue;
        const side = billboards % 2 ? 1 : -1;
        k.at(bu, 0, side * (PAVE_OUT + 0.8), side === 1 ? Math.PI - 0.45 : 0.45, () => {
          k.cyl(0, 0, 0, 0.25, 0.3, 8.5, 0x495057, 8);
          k.box(0, 8.3, -0.1, 8.6, 4.4, 0.25, 0x343a40);
          k.quad(0, 10.5, 0.05, 8.2, 4.1, 0xffffff, { layer: night ? "texGlow" : "tex" }, atlas.board(billboards));
          k.box(0, 8.2, 0.3, 8.6, 0.12, 0.6, 0x495057);
        });
        billboards++;
      }
    });
  });

  // ---------------------------------------------------------------- the junctions' corners
  plan.route.turns.forEach((tn, ti) => {
    const p = plan.route.at(tn.s0);
    const f = ahead(p.yaw);
    const kx = p.x + f.fx * tn.r;
    const kz = p.z + f.fz * tn.r;
    const corner = (sa: number, sb: number) => ({ x: kx + f.fx * 17 * sa + f.rx * 17 * sb, z: kz + f.fz * 17 * sa + f.rz * 17 * sb });
    // Traffic lights at the four corners (green for you).
    for (const [sa, sb] of [[-1, 1], [1, -1], [1, 1], [-1, -1]]) {
      const x = kx + f.fx * (ROAD_HALF + 1) * sa + f.rx * (ROAD_HALF + 1) * sb;
      const z = kz + f.fz * (ROAD_HALF + 1) * sa + f.rz * (ROAD_HALF + 1) * sb;
      k.cyl(x, 0, z, 0.08, 0.08, 4.2, 0x343a40, 8);
      k.at(x, 3.4, z, p.yaw + Math.PI / 2 + (sa > 0 ? Math.PI : 0), () => {
        k.box(0, 0, 0, 0.35, 1.1, 0.3, 0x212529);
        const on = sa < 0 ? 2 : 0;
        [0xff4d4d, 0xffc94d, 0x40e080].forEach((c, i) => k.ball(0, 0.85 - i * 0.32, 0.16, 0.1, i === on ? c : 0x2b2b2b, { layer: i === on ? "glow" : "solid", noAo: true }));
      });
    }
    // What stands in each corner.
    const features = ti === 0 ? ["mosque", "petrol", "market", "park"] : ["church", "site", "park", "petrol"];
    const quads: [number, number][] = [[1, -1], [-1, -1], [1, 1], [-1, 1]];
    quads.forEach(([sa, sb], qi) => {
      const c = corner(sa, sb);
      k.at(c.x, 0, c.z, Math.atan2(kx - c.x, kz - c.z), () => feature(features[qi]));
    });
  });

  /** The landmarks in the corners (local: facing +z, towards the junction). */
  function feature(kind: string) {
    if (kind === "mosque") {
      k.box(0, 0, -3, 12, 5.5, 10, 0xf8f9fa, { grad: [0.85, 1, 5.5] });
      k.box(0, 5.5, -3, 12.4, 0.4, 10.4, 0x2b8a3e);
      k.cyl(0, 5.9, -3, 3.4, 3.4, 1.2, 0xf8f9fa, 20);
      k.ball(0, 7.1, -3, 3.4, 0x2f9e44, { part: 0.5, w: 20, h: 10 });
      k.cyl(0, 10.4, -3, 0.06, 0.06, 1.2, 0xfab005, 6);
      for (const s of [-1, 1]) {
        k.cyl(s * 6.6, 0, 2.2, 0.55, 0.65, 15, 0xf8f9fa, 12);
        k.cyl(s * 6.6, 11, 2.2, 0.9, 0.9, 0.35, 0x2b8a3e, 12);
        k.ball(s * 6.6, 15, 2.2, 0.7, 0x2f9e44, { part: 0.5 });
      }
      for (let i = -2; i <= 2; i++) k.quad(i * 2.2, 2.6, 2.03, 1.2, 2.2, 0xffffff, { layer: night ? "texGlow" : "tex" }, night ? uv.winLit2 : uv.win);
      k.quad(0, 1.4, 2.04, 2.2, 2.8, 0xffffff, { layer: "tex" }, uv.door);
    } else if (kind === "church") {
      k.box(0, 0, -6, 10, 7, 14, 0xfff9db, { grad: [0.85, 1, 7] });
      const hd = 5.4;
      const a = Math.atan2(3, hd);
      k.box(-hd / 2 + 0.1, 6.9, -6, Math.hypot(hd, 3), 0.15, 14.6, 0x8c2f1e, { rz: a });
      k.box(hd / 2 - 0.1, 6.9, -6, Math.hypot(hd, 3), 0.15, 14.6, 0x8c2f1e, { rz: -a });
      k.box(0, 0, 1.6, 4, 13, 4, 0xfff9db, { grad: [0.85, 1, 13] });
      k.cyl(0, 13, 1.6, 0, 2.9, 6, 0x8c2f1e, 4, { ry: Math.PI / 4 });
      k.box(0, 19, 1.6, 0.18, 2.2, 0.18, 0xfab005);
      k.box(0, 20.3, 1.6, 1.1, 0.18, 0.18, 0xfab005);
      k.quad(0, 4.6, 3.63, 3.6, 0.6, 0xffffff, { layer: "tex" }, uv.church);
      k.quad(0, 1.6, 3.63, 1.8, 3.2, 0xffffff, { layer: "tex" }, uv.door);
      for (let i = 0; i < 4; i++) k.quad(5.03, 3.4, -1 - i * 3.2, 1.2, 2.6, 0xffffff, { layer: night ? "texGlow" : "tex", ry: Math.PI / 2 }, night ? uv.winLit : uv.winC2);
    } else if (kind === "petrol") {
      k.mat(0, 0.01, -3, 15, 13, 0x8d949b, { noAo: true });
      for (const x of [-5.5, 5.5]) for (const z of [-6, 0]) k.cyl(x, 0, z, 0.22, 0.22, 5, 0xf1f3f5, 10);
      k.box(0, 5, -3, 14, 0.7, 9, 0xf8f9fa);
      k.box(0, 5.1, 1.52, 14, 0.5, 0.06, 0xc92a2a, { noAo: true });
      k.quad(0, 5.35, 1.58, 5.6, 1.0, 0xffffff, { layer: night ? "texGlow" : "tex" }, uv.fuel);
      if (night) k.box(0, 4.95, -3, 13, 0.04, 8, 0xfff8e1, { layer: "glow", noAo: true });
      for (const x of [-3, 3]) {
        k.box(x, 0, -3, 1.2, 0.25, 4, 0xadb5bd);
        for (const z of [-4.2, -1.8]) {
          k.box(x, 0.25, z, 0.7, 1.7, 0.5, 0xc92a2a);
          k.box(x, 1.2, z + 0.26, 0.5, 0.4, 0.02, 0x1b1b1b, { noAo: true });
        }
      }
      k.box(0, 0, -10, 8, 3.2, 4, 0xf8f9fa);
      k.quad(0, 1.4, -7.98, 6, 2.4, 0xffffff, { layer: night ? "texGlow" : "tex" }, uv.lobby);
      k.cyl(7.5, 0, 1.5, 0.12, 0.12, 5, 0x495057, 8);
      k.quad(7.5, 5.2, 1.6, 2.4, 0.9, 0xffffff, { layer: "texGlow" }, uv.price);
      k.at(3, 0, -1.8, Math.PI / 2, () => kitCar(k, pick(CARS)));
    } else if (kind === "market") {
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const x = -5 + i * 5;
          const z = -j * 4.5;
          k.box(x, 0, z, 2.6, 0.85, 1.4, 0x8d6e63);
          for (let g = 0; g < 6; g++) k.ball(x - 1 + (g % 3) * 1, 0.95, z - 0.3 + Math.floor(g / 3) * 0.6, 0.2, pick([0xe03131, 0xfab005, 0x2f9e44, 0xe8590c, 0xf8f9fa]), { part: 0.5 });
          k.cyl(x, 0, z + 0.9, 0.04, 0.04, 2.5, 0x495057, 6);
          k.cyl(x, 2.3, z + 0.9, 0, 1.9, 0.7, pick(AWNINGS), 12);
          if (r() < 0.8) kitPerson(k, x + 1.4, z + 1.2, Math.PI * r() * 2, r, { wrapper: r() < 0.6, tray: r() < 0.2 });
          if (r() < 0.6) kitPerson(k, x - 1.2, z - 1.1, Math.PI * r() * 2, r);
        }
    } else if (kind === "park") {
      k.mat(0, 0.02, -3, 14, 13, 0x5c9e4a, { noAo: true });
      tree(k, -4, -4, "almond");
      tree(k, 3.5, -6, "mango");
      tree(k, 4, 0, "palm");
      k.box(-1, 0, 0.5, 2.4, 0.45, 0.5, 0x8d6e63);
      kitPerson(k, -1.4, 0.5, 0, r);
      kitPerson(k, -0.5, 0.6, -0.4, r);
    } else if (kind === "site") {
      // A building going up: columns, two slabs, rods sticking out, a sand heap, blocks.
      for (let fl = 0; fl < 3; fl++)
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++) {
            k.box(-5 + i * 3.3, fl * 3.2, -1 - j * 3.3, 0.35, 3.2, 0.35, 0xadb5bd);
            if (fl === 2) for (let q = 0; q < 3; q++) k.box(-5 + i * 3.3 + (q - 1) * 0.1, 9.6, -1 - j * 3.3, 0.03, 1.2, 0.03, 0x7a5c50, { noAo: true });
          }
      for (let fl = 1; fl < 3; fl++) k.box(0, fl * 3.2 - 0.2, -4.3, 10.6, 0.22, 7.2, 0xced4da);
      k.box(0, 3.2, 0.3, 10, 2.6, 0.02, 0x1c7ed6, { noAo: true });
      k.ball(4, 0, 3, 1.8, 0xd4a373, { part: 0.5, sy: 0.6 });
      for (let i = 0; i < 4; i++) k.box(-3 + i * 0.5, 0, 3, 0.45, 0.25 * (4 - i), 0.22, 0xc5c0b8);
    }
  }

  // ---------------------------------------------------------------- landmarks on the way
  const sts = streets;
  // A welcome arch over the middle street, a pedestrian bridge over the last one.
  if (sts.length > 1) {
    const st = sts[1];
    const u = st.junctions[0] + 26;
    k.at(st.ox, 0, st.oz, st.yaw, () =>
      k.at(u, 0, 0, 0, () => {
        for (const s of [-1, 1]) k.box(0, 0, s * (ROAD_HALF + 0.8), 0.7, 7.4, 0.7, 0x2b8a3e);
        k.box(0, 6.2, 0, 0.6, 1.4, (ROAD_HALF + 0.8) * 2 + 0.7, 0x2b8a3e);
        k.quad(-0.32, 6.9, 0, 9.4, 1.2, 0xffffff, { layer: night ? "texGlow" : "tex", ry: -Math.PI / 2 }, uv.welcome);
      }),
    );
  }
  const lastSt = sts[sts.length - 1];
  if (sts.length > 1) {
    const st = lastSt;
    const u = st.junctions[0] + 26;
    k.at(st.ox, 0, st.oz, st.yaw, () =>
      k.at(u, 0, 0, 0, () => {
        const span = PAVE_OUT + 1.5;
        k.box(0, 5.4, 0, 2.6, 0.35, span * 2, 0x868e96);
        for (const s of [-1, 1]) {
          k.box(1.25 * s, 5.75, 0, 0.06, 1.1, span * 2, 0x2b8a3e, { noAo: true });
          for (let z = -span; z <= span; z += 1.5) k.box(1.25 * s, 5.75, z, 0.08, 1.1, 0.08, 0x2b8a3e);
          k.box(0, 0, s * (PAVE_OUT + 0.4), 0.6, 5.4, 0.6, 0x868e96);
          // Stairs down along the pavement.
          k.box(-4.6, 2.6, s * (PAVE_OUT + 1.2), 9.4, 0.3, 1.8, 0x868e96, { rz: -Math.atan2(5.4, 9.4) * 1 });
        }
        k.box(0, 5.75, -1.2, 0.02, 0.9, 2.2, 0x2b8a3e);
        k.quad(-1.33, 6.25, 0, 3.2, 0.8, 0xffffff, { layer: "tex", ry: -Math.PI / 2 }, uv.lagos);
        for (let i = 0; i < 3; i++) kitPerson(k, (r() - 0.5) * 1.4, -span + 3 + i * 4.5, i % 2 ? 0 : Math.PI, r);
      }),
    );
  }

  // The place you're going: a big building with its name across the front, a canopy, flags.
  {
    const st = sts[destStreet >= 0 ? destStreet : sts.length - 1];
    const u = uOf(st, plan.stopS);
    const front = PAVE_OUT + 2;
    const w = 24;
    const d = 16;
    const floors = 5;
    k.at(st.ox, 0, st.oz, st.yaw, () =>
      k.at(u + 2, 0, front, Math.PI, () => {
        k.mat(0, 0.17, 1.0, w + 4, 2.4, 0xd6c7b0, { noAo: true });
        office(w, d, floors, 0xf8f9fa);
        k.box(0, 0, 0.05, w + 0.4, 0.3, 0.3, 0xdee2e6);
        k.box(0, 3.6, 2, 9, 0.35, 4.2, 0x0b7285);
        for (const s of [-1, 1]) k.cyl(s * 4.2, 0, 3.8, 0.12, 0.12, 3.6, 0xdee2e6, 10);
        k.box(0, 5.2, 0.08, 18.6, 2.5, 0.22, 0x0b7285);
        k.quad(0, 6.45, 0.21, 18, 2.4, 0xffffff, { layer: "texGlow" }, uv.dest);
        for (const [s, c] of [[-1, 0x2b8a3e], [1, 0x2b8a3e]] as const) {
          k.cyl(s * (w / 2 + 1.2), 0, 2.2, 0.06, 0.06, 8, 0xdee2e6, 8);
          k.box(s * (w / 2 + 1.2) + 0.7, 6.8, 2.2, 1.4, 0.9, 0.02, c, { noAo: true });
          k.box(s * (w / 2 + 1.2) + 0.7, 6.8, 2.21, 0.47, 0.9, 0.02, 0xffffff, { noAo: true });
        }
        for (const s of [-1, 1]) {
          k.cyl(s * 6, 0, 1.6, 0.5, 0.4, 0.8, 0x868e96, 12);
          k.leafy(s * 6, 1.3, 1.6, 0.7, 0x2f9e44, { detail: 1 });
        }
      }),
    );
    const p = plan.route.place(plan.stopS + 2, front);
    destDoor = new THREE.Vector3(p.x, 0, p.z);
    destLook = new THREE.Vector3(p.x, 5.5, p.z);
  }

  // Towers on the skyline, away from the streets.
  const farFrom = (x: number, z: number, gap: number) =>
    sts.every((st) => {
      const f = ahead(st.yaw);
      const dx = x - st.ox;
      const dz = z - st.oz;
      const along = dx * f.fx + dz * f.fz;
      const side = dx * f.rx + dz * f.rz;
      return along < -gap || along > st.len + gap || Math.abs(side) > gap;
    });
  const mid = plan.route.at(plan.route.length * 0.55);
  let towers = 0;
  for (let i = 0; i < 160 && towers < 26; i++) {
    const a = r() * Math.PI * 2;
    const dist = 70 + r() * 170;
    const x = mid.x + Math.cos(a) * dist;
    const z = mid.z + Math.sin(a) * dist;
    if (!farFrom(x, z, 42)) continue;
    const w = 12 + r() * 14;
    k.at(x, 0, z, r() * Math.PI, () => office(w, w * (0.7 + r() * 0.5), 8 + Math.floor(r() * 18), pick([0xdee2e6, 0xced4da, 0xf8f9fa, 0xadb5bd]), true));
    towers++;
  }

  // ---------------------------------------------------------------- into meshes
  const mats = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    tex: new THREE.MeshLambertMaterial({ vertexColors: true, map: atlas.texture }),
    texGlow: new THREE.MeshBasicMaterial({ vertexColors: true, map: atlas.texture }),
    foliage: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: atlas.texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  disposers.push(() => {
    for (const m of Object.values(mats)) m.dispose();
    glowMat.dispose();
  });
  const built = k.build(mats);
  built.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.receiveShadow = true;
      o.castShadow = o.name === "solid" || o.name === "foliage";
      disposers.push(() => o.geometry.dispose());
    }
  });
  scene.add(built);
  const glows = glowK.build({ texGlow: glowMat });
  glows.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.renderOrder = 3;
      disposers.push(() => o.geometry.dispose());
    }
  });
  scene.add(glows);
  return { destDoor, destLook, streets: sts };
}

