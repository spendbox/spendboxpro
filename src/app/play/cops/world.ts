// Police & Thieves' world, with no drawing in it: a big city (260 m across, a grid of roads and
// 25 blocks: the bank in the middle, the police HQ at the west end, the thieves' hideout at the
// east, and a mix of towers, houses, parks, yards, markets, building sites and car parks between),
// what you can hide behind, how people and tanks move and bump, flying bullets, rockets and
// grenades, who can see whom, the loot, and the bots.
// Metres; y is up; x runs west (police) to east (thieves).

import { GUNS, type GunId } from "@/lib/cops";

export const MAP = { h: 130 };
/** Where the roads run (both ways), and how wide they are. */
export const ROADS = [-90, -30, 30, 90];
export const ROAD_W = 10;

export const RULES = {
  hp: 100,
  armour: 60,
  run: 6.4,
  crouch: 2.9,
  /** Carrying a bag of loot slows you down. */
  carry: 0.82,
  jump: 6.2,
  fall: 18,
  radius: 0.42,
  eye: 1.55,
  crouchEye: 1.02,
  /** Unlimited lives: back in this many seconds after every takedown, with your weapons, until time's up. */
  respawn: 4,
  shield: 2.5,
  grenadeFuse: 2.1,
  grenadeSplash: 9,
  grenadeDmg: 160,
  tankHp: 700,
  tankSpeed: 7.2,
  tankRadius: 2.3,
  tankReload: 2,
  tankSplash: 10,
  tankDmg: 240,
  heal: 2,
  /** Points for the team: a takedown, a bag of loot banked at the hideout, a bag the police took back. */
  killPoints: 1,
  lootPoints: 3,
  returnPoints: 1,
};

/** The bank's vault (thieves take bags of money here), the hideout (where they bank them) and the police HQ. */
export const VAULT = { x: 0, z: -4, r: 3.6 };
export const HIDEOUT = { x: 112, z: 0, r: 6.5 };
export const HQ = { x: -112, z: 0 };
export const BASES = [HQ, HIDEOUT];

export type Look =
  | "tower" | "house" | "station" | "bank" | "warehouse" | "garage" | "shop" | "tree" | "palm" | "rock" | "bush" | "car" | "policecar" | "van" | "bus"
  | "container" | "crate" | "barrel" | "wall" | "sandbags" | "barrier" | "stall" | "fountain" | "planter" | "pillar" | "dumpster" | "kiosk" | "pipes"
  | "sand" | "scaffold" | "halfwall" | "bench" | "fence" | "vault";
export type Shape = { kind: "box" | "cyl"; x: number; z: number; w: number; d: number; h: number; colour: number; ry?: number; look: Look };
export type District = "bank" | "hq" | "hideout" | "towers" | "houses" | "park" | "yard" | "market" | "building" | "parking";
export type Block = { i: number; j: number; x0: number; x1: number; z0: number; z1: number; kind: District };

/** A seeded random 0-1 (the same everywhere for the same seed). */
export function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type V3 = { x: number; y: number; z: number };

// ---------------------------------------------------------------- the city

/** The edges of the blocks between the roads, along one axis. */
function spans() {
  const e = [-MAP.h, ...ROADS.flatMap((r) => [r - ROAD_W / 2, r + ROAD_W / 2]), MAP.h];
  const out: [number, number][] = [];
  for (let k = 0; k < e.length; k += 2) out.push([e[k], e[k + 1]]);
  return out;
}

/** Places no piece may stand: the lane up to the vault, the lanes out of the bases, the zones themselves. */
const CLEAR: { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: -4.5, x1: 4.5, z0: -9, z1: 26 },
  { x0: -126, x1: -94, z0: -5, z1: 5 },
  { x0: 94, x1: 126, z0: -5, z1: 5 },
  { x0: 104, x1: 120, z0: -8, z1: 8 },
  { x0: -122, x1: -102, z0: -8, z1: 8 },
];
const clearOf = (x: number, z: number, reach: number) => !CLEAR.some((c) => x + reach > c.x0 && x - reach < c.x1 && z + reach > c.z0 && z - reach < c.z1);

type Piece = { look: Look; kind: Shape["kind"]; w: [number, number]; d: [number, number]; h: [number, number]; colours: number[]; turn?: boolean };
const P = (look: Look, kind: Shape["kind"], w: [number, number], d: [number, number], h: [number, number], colours: number[], turn = true): Piece => ({ look, kind, w, d, h, colours, turn });
const CARS = [0xf1f3f5, 0x343a40, 0xc92a2a, 0x1971c2, 0xf08c00, 0x2b8a3e, 0x868e96, 0xfab005];

const KITS: Record<Exclude<District, "bank" | "hq" | "hideout">, { n: number; gap: number; pieces: Piece[] }> = {
  towers: { n: 9, gap: 3, pieces: [P("planter", "box", [3, 5], [1.2, 1.6], [0.9, 1], [0x868e96]), P("bench", "box", [2, 2.2], [0.7, 0.8], [0.8, 0.9], [0x8c6d46]), P("kiosk", "box", [2.4, 3], [2.4, 3], [2.6, 2.9], [0xe64980, 0x15aabf, 0xfab005], false), P("car", "box", [4, 4.4], [1.8, 1.9], [1.45, 1.5], CARS)] },
  houses: { n: 10, gap: 2.6, pieces: [P("wall", "box", [5, 8], [0.4, 0.5], [1.4, 1.8], [0xe9ecef, 0xd8c3a5, 0xb2c9ab]), P("car", "box", [4, 4.4], [1.8, 1.9], [1.45, 1.5], CARS), P("tree", "cyl", [0.7, 1], [0.7, 1], [6, 8], [0x6b4f37], false), P("bush", "cyl", [1.6, 2.4], [1.6, 2.4], [1.1, 1.4], [0x2f6b2f], false), P("barrel", "cyl", [0.9, 1], [0.9, 1], [1.2, 1.3], [0x2f6fb3, 0xc92a2a])] },
  park: { n: 18, gap: 2.8, pieces: [P("tree", "cyl", [0.8, 1.2], [0.8, 1.2], [7, 10], [0x6b4f37], false), P("tree", "cyl", [0.7, 1], [0.7, 1], [6, 9], [0x5c4330], false), P("palm", "cyl", [0.6, 0.8], [0.6, 0.8], [7, 9], [0x8a6a45], false), P("rock", "cyl", [2, 3.6], [2, 3.6], [1.2, 2.4], [0x868e96, 0x7d7468], false), P("bush", "cyl", [1.6, 2.6], [1.6, 2.6], [1.1, 1.5], [0x2f6b2f, 0x3b7a3b], false), P("bench", "box", [2, 2.2], [0.7, 0.8], [0.8, 0.9], [0x8c6d46])] },
  yard: { n: 14, gap: 2.6, pieces: [P("container", "box", [5.8, 6.1], [2.4, 2.5], [2.5, 2.6], [0xc2410c, 0x1d4ed8, 0x15803d, 0xb45309]), P("container", "box", [5.8, 6.1], [2.4, 2.5], [5.1, 5.2], [0x0b7285, 0xa61e4d, 0x5f3dc4]), P("crate", "box", [1.4, 1.8], [1.4, 1.8], [1.4, 1.8], [0xa5773d]), P("barrel", "cyl", [0.9, 1], [0.9, 1], [1.2, 1.3], [0x2f6fb3, 0xc92a2a, 0x2b8a3e]), P("pipes", "box", [5, 7], [1.6, 2], [1.4, 1.7], [0x5c636a])] },
  market: { n: 16, gap: 2.4, pieces: [P("stall", "box", [3, 3.6], [2.2, 2.6], [2.3, 2.5], [0xe03131, 0x1c7ed6, 0xf59f00, 0x2f9e44, 0x9c36b5]), P("crate", "box", [1.2, 1.6], [1.2, 1.6], [1, 1.5], [0xa5773d]), P("barrel", "cyl", [0.9, 1], [0.9, 1], [1.2, 1.3], [0x2f9e44, 0xf08c00]), P("kiosk", "box", [2.4, 3], [2.4, 3], [2.6, 2.9], [0xe64980, 0x15aabf], false), P("van", "box", [5, 5.4], [2.1, 2.2], [2.3, 2.4], [0xf8f9fa, 0xfab005])] },
  building: { n: 13, gap: 2.6, pieces: [P("halfwall", "box", [4, 7], [0.4, 0.5], [2.4, 3.2], [0xadb5bd, 0xced4da]), P("sand", "cyl", [3, 4.5], [3, 4.5], [1.2, 1.8], [0xc9a66b], false), P("scaffold", "box", [3, 5], [1.6, 2], [3.5, 5], [0x868e96]), P("pipes", "box", [5, 7], [1.6, 2], [1.4, 1.7], [0x5c636a]), P("barrier", "box", [2.8, 3.2], [0.6, 0.7], [1, 1.1], [0xe9ecef, 0xf08c00]), P("sandbags", "box", [3, 4], [1, 1.2], [1, 1.2], [0xc8b07a])] },
  parking: { n: 16, gap: 2.2, pieces: [P("car", "box", [4, 4.4], [1.8, 1.9], [1.45, 1.5], CARS), P("car", "box", [4, 4.4], [1.8, 1.9], [1.45, 1.5], CARS), P("van", "box", [5, 5.4], [2.1, 2.2], [2.3, 2.4], [0xf8f9fa, 0x343a40]), P("bus", "box", [10, 11], [2.5, 2.6], [3, 3.2], [0xfab005]), P("kiosk", "box", [2.4, 3], [2.4, 3], [2.6, 2.9], [0x15aabf], false), P("dumpster", "box", [2, 2.4], [1.4, 1.5], [1.4, 1.5], [0x2b8a3e, 0x1864ab])] },
};
const MIX: Exclude<District, "bank" | "hq" | "hideout">[] = ["towers", "towers", "houses", "houses", "houses", "park", "park", "yard", "yard", "market", "market", "building", "building", "parking", "parking", "towers", "houses", "park", "yard", "market", "building", "parking"];

/** Each block of the city and what's in it (the bank, HQ and hideout always in the same place). */
export function blocks(seed: number): Block[] {
  const r = rand(seed ^ 0x2545f491);
  const mix = [...MIX].sort(() => r() - 0.5);
  const sp = spans();
  const out: Block[] = [];
  let k = 0;
  for (let i = 0; i < sp.length; i++)
    for (let j = 0; j < sp.length; j++) {
      const kind: District = i === 2 && j === 2 ? "bank" : i === 0 && j === 2 ? "hq" : i === 4 && j === 2 ? "hideout" : mix[k++ % mix.length];
      out.push({ i, j, x0: sp[i][0], x1: sp[i][1], z0: sp[j][0], z1: sp[j][1], kind });
    }
  return out;
}

/** Everything you can hide behind, for a match's seed (every phone gets the same city). */
export function layout(seed: number): Shape[] {
  const r = rand(seed);
  const out: Shape[] = [];
  const pick = (a: [number, number]) => a[0] + r() * (a[1] - a[0]);
  for (const b of blocks(seed)) {
    // Each block keeps its pavement (2 m) free.
    const x0 = b.x0 + 2;
    const x1 = b.x1 - 2;
    const z0 = b.z0 + 2;
    const z1 = b.z1 - 2;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const mine: Shape[] = [];
    const put = (s: Shape) => {
      mine.push(s);
      out.push(s);
    };
    if (b.kind === "bank") {
      put({ kind: "box", x: 0, z: -15, w: 34, d: 14, h: 13, colour: 0xe9e3d3, look: "bank" });
      put({ kind: "box", x: 0, z: -7.6, w: 5, d: 1.2, h: 4.5, colour: 0xb08d3c, look: "vault" });
      for (const px of [-14, -10, -6, 6, 10, 14]) put({ kind: "cyl", x: px, z: -6.6, w: 1.1, d: 1.1, h: 8, colour: 0xf1ede2, look: "pillar" });
      for (const [px, pz] of [[-9, 2], [9, 2], [-16, 9], [16, 9], [-8, 15], [8, 15], [-18, 19], [18, 19]]) put({ kind: "box", x: px, z: pz, w: 3.6, d: 1.4, h: 1, colour: 0x868e96, look: "planter" });
      put({ kind: "cyl", x: -13, z: 14, w: 1.6, d: 1.6, h: 6, colour: 0x6b4f37, look: "tree" });
      put({ kind: "cyl", x: 13, z: 14, w: 1.6, d: 1.6, h: 6, colour: 0x6b4f37, look: "tree" });
      put({ kind: "box", x: -19, z: 3, w: 4.6, d: 2, h: 1.55, colour: 0x1c3fa8, look: "policecar", ry: 0.4 });
      put({ kind: "box", x: 19.5, z: 4, w: 3.2, d: 1.1, h: 1.1, colour: 0xc8b07a, look: "sandbags", ry: -0.3 });
      continue;
    }
    if (b.kind === "hq") {
      put({ kind: "box", x: -119, z: -16, w: 18, d: 14, h: 10, colour: 0xdee2e6, look: "station" });
      put({ kind: "box", x: -119, z: 16.5, w: 16, d: 13, h: 6, colour: 0x495057, look: "garage" });
      for (const pz of [-7.5, 7.5]) put({ kind: "box", x: -100, z: pz * 1.3, w: 4.6, d: 2, h: 1.55, colour: 0x1c3fa8, look: "policecar", ry: Math.PI / 2 });
      put({ kind: "box", x: -98, z: -20, w: 3, d: 0.7, h: 1.05, colour: 0xf08c00, look: "barrier" });
      put({ kind: "box", x: -98, z: 20, w: 3, d: 0.7, h: 1.05, colour: 0xf08c00, look: "barrier" });
      continue;
    }
    if (b.kind === "hideout") {
      put({ kind: "box", x: 120, z: -16.5, w: 16, d: 13, h: 9, colour: 0x8d6e63, look: "warehouse" });
      put({ kind: "box", x: 120, z: 16.5, w: 16, d: 13, h: 8, colour: 0x6d4c41, look: "warehouse" });
      put({ kind: "box", x: 101, z: 9.5, w: 5.4, d: 2.2, h: 2.4, colour: 0x212529, look: "van", ry: Math.PI / 2 });
      for (const [px, pz] of [[100, -10], [102, -12], [99, 13.5]]) put({ kind: "box", x: px, z: pz, w: 1.6, d: 1.6, h: 1.6, colour: 0xa5773d, look: "crate" });
      continue;
    }
    // Big buildings first: towers (one or two tall ones), houses (a few small ones).
    if (b.kind === "towers") {
      const two = x1 - x0 > 40 && r() < 0.6;
      const w = (x1 - x0) * (two ? 0.34 : 0.55);
      const d = (z1 - z0) * (0.45 + r() * 0.15);
      const xs = two ? [x0 + w / 2 + 2, x1 - w / 2 - 2] : [cx + (r() - 0.5) * 6];
      for (const x of xs) {
        const z = cz + (r() - 0.5) * ((z1 - z0) - d - 6);
        if (clearOf(x, z, Math.max(w, d) / 2)) put({ kind: "box", x, z, w, d, h: 18 + Math.floor(r() * 5) * 6, colour: [0x8fa3b8, 0x9aa5a8, 0xb5a28a, 0x7c8ca0][Math.floor(r() * 4)], look: "tower" });
      }
    } else if (b.kind === "houses") {
      const nx = x1 - x0 > 40 ? 2 : 1;
      for (let a = 0; a < nx; a++)
        for (const zz of [0.27, 0.73]) {
          const w = 7 + r() * 3;
          const d = 7 + r() * 2;
          const x = x0 + ((a + 0.5) / nx) * (x1 - x0) + (r() - 0.5) * 3;
          const z = z0 + zz * (z1 - z0) + (r() - 0.5) * 2;
          if (clearOf(x, z, Math.max(w, d) / 2)) put({ kind: "box", x, z, w, d, h: 5 + r() * 3, colour: [0xf4e3c1, 0xe7c9a9, 0xd3e4cd, 0xf1f3f5, 0xffd8a8][Math.floor(r() * 5)], ry: r() < 0.3 ? Math.PI / 2 : 0, look: "house" });
        }
    } else if (b.kind === "market") {
      put({ kind: "box", x: cx, z: z0 + 4, w: Math.min(16, x1 - x0 - 4), d: 6, h: 6, colour: 0xffd8a8, look: "shop" });
    } else if (b.kind === "building") {
      // A half-built block: walls round three sides with gaps.
      const w = (x1 - x0) * 0.5;
      const d = (z1 - z0) * 0.4;
      for (const [sx, sz, ww, dd] of [[cx - w / 4 - 1, cz - d / 2, w / 2 - 2, 0.5], [cx + w / 4 + 1, cz - d / 2, w / 2 - 2, 0.5], [cx - w / 2, cz, 0.5, d * 0.7], [cx + w / 2, cz + d / 6, 0.5, d * 0.5]] as const) put({ kind: "box", x: sx, z: sz, w: ww, d: dd, h: 3 + r() * 2, colour: 0xadb5bd, look: "halfwall" });
    }
    const kit = KITS[b.kind];
    const target = mine.length + Math.round(kit.n * ((x1 - x0) * (z1 - z0)) / 2500);
    for (let tries = 0; mine.length < target && tries < 500; tries++) {
      const p = kit.pieces[Math.floor(r() * kit.pieces.length)];
      const w = pick(p.w);
      const d = p.kind === "cyl" ? w : pick(p.d);
      const reach = Math.max(w, d) / 2;
      if (x1 - x0 < reach * 2 + 1 || z1 - z0 < reach * 2 + 1) continue;
      const x = x0 + reach + r() * (x1 - x0 - reach * 2);
      const z = z0 + reach + r() * (z1 - z0 - reach * 2);
      if (!clearOf(x, z, reach)) continue;
      if (mine.some((s) => overlaps(s, x, z, reach, kit.gap))) continue;
      const shape: Shape = { kind: p.kind, x, z, w, d, h: pick(p.h), colour: p.colours[Math.floor(r() * p.colours.length)], look: p.look };
      if (p.turn && p.kind === "box") shape.ry = b.kind === "parking" || b.kind === "market" ? (r() < 0.5 ? 0 : Math.PI / 2) : (r() - 0.5) * Math.PI;
      put(shape);
    }
  }
  // Parked cars along the roads (at the kerb, so the middle of each road stays open), and a few bins and barriers.
  for (const road of ROADS)
    for (const along of [-1, 1]) {
      for (let k = 0; k < 7; k++) {
        const at = -MAP.h + 12 + r() * (MAP.h * 2 - 24);
        if (ROADS.some((x) => Math.abs(at - x) < 8)) continue;
        const kerb = road + along * 3.5;
        const ox = r() < 0.5;
        const [x, z] = ox ? [at, kerb] : [kerb, at];
        if (!clearOf(x, z, 2.5) || out.some((s) => overlaps(s, x, z, 2.3, 1.2))) continue;
        const look: Look = r() < 0.12 ? "bus" : r() < 0.15 ? "van" : "car";
        const w = look === "bus" ? 10.5 : look === "van" ? 5.2 : 4.2;
        out.push({ kind: "box", x, z, w, d: look === "bus" ? 2.55 : look === "van" ? 2.15 : 1.85, h: look === "bus" ? 3.1 : look === "van" ? 2.35 : 1.48, colour: look === "bus" ? 0xfab005 : CARS[Math.floor(r() * CARS.length)], ry: ox ? 0 : Math.PI / 2, look });
      }
    }
  return out;
}

function overlaps(s: Shape, x: number, z: number, reach: number, gap: number) {
  const sr = s.kind === "cyl" ? s.w / 2 : Math.hypot(s.w, s.d) / 2;
  // Boxes: a looser check along their length.
  if (s.kind === "box") {
    const c = Math.cos(s.ry ?? 0);
    const sn = Math.sin(s.ry ?? 0);
    const lx = (x - s.x) * c - (z - s.z) * sn;
    const lz = (x - s.x) * sn + (z - s.z) * c;
    return Math.abs(lx) < s.w / 2 + reach + gap && Math.abs(lz) < s.d / 2 + reach + gap;
  }
  return Math.hypot(s.x - x, s.z - z) < sr + reach + gap;
}

/** Where a side comes in: in front of its base. */
export function spawns(team: number) {
  const b = BASES[team];
  const dir = team === 0 ? 1 : -1;
  return [-4, -2, 0, 2, 4].flatMap((z) => [{ x: b.x + dir * 3, z, yaw: team === 0 ? -Math.PI / 2 : Math.PI / 2 }, { x: b.x + dir * 7, z: z + 1, yaw: team === 0 ? -Math.PI / 2 : Math.PI / 2 }]);
}

// ---------------------------------------------------------------- finding things quickly

const CELL = 10;
const CELLS = Math.ceil((MAP.h * 2) / CELL);

/** The city with a grid over it, so moving and shooting only look at what's near. */
export class City {
  readonly shapes: Shape[];
  private grid: number[][] = [];
  private stamp: number[];
  private tick = 1;
  constructor(shapes: Shape[]) {
    this.shapes = shapes;
    this.stamp = new Array(shapes.length).fill(0);
    for (let k = 0; k < CELLS * CELLS; k++) this.grid.push([]);
    shapes.forEach((s, idx) => {
      const rr = s.kind === "cyl" ? s.w / 2 : Math.hypot(s.w, s.d) / 2;
      const [a0, b0] = this.cell(s.x - rr, s.z - rr);
      const [a1, b1] = this.cell(s.x + rr, s.z + rr);
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) this.grid[a * CELLS + b].push(idx);
    });
  }
  private cell(x: number, z: number): [number, number] {
    return [Math.max(0, Math.min(CELLS - 1, Math.floor((x + MAP.h) / CELL))), Math.max(0, Math.min(CELLS - 1, Math.floor((z + MAP.h) / CELL)))];
  }
  /** The shapes in the cells over a rectangle. */
  near(x0: number, z0: number, x1: number, z1: number): Shape[] {
    const t = ++this.tick;
    const out: Shape[] = [];
    const [a0, b0] = this.cell(Math.min(x0, x1), Math.min(z0, z1));
    const [a1, b1] = this.cell(Math.max(x0, x1), Math.max(z0, z1));
    for (let a = a0; a <= a1; a++)
      for (let b = b0; b <= b1; b++)
        for (const idx of this.grid[a * CELLS + b]) {
          if (this.stamp[idx] === t) continue;
          this.stamp[idx] = t;
          out.push(this.shapes[idx]);
        }
    return out;
  }

  /** One step of moving: (mx, mz) a direction in the world (length up to 1), jump when asked. */
  step(b: Body, mx: number, mz: number, jump: boolean, dt: number, speed: number, rad = RULES.radius, heavy = false) {
    b.x += mx * speed * dt;
    b.z += mz * speed * dt;
    const near = this.near(b.x - rad - 1, b.z - rad - 1, b.x + rad + 1, b.z + rad + 1);
    const ground = heavy ? 0 : floorAt(near, b.x, b.z);
    if (jump && b.y <= ground + 0.02) b.vy = RULES.jump;
    b.vy -= RULES.fall * dt;
    b.y += b.vy * dt;
    if (b.y <= ground) {
      b.y = ground;
      b.vy = 0;
    }
    for (const s of near) {
      // A tank rolls over the little things.
      if (heavy && s.h < 1.25) continue;
      pushOut(b, s, rad);
    }
    b.x = Math.max(-MAP.h + 1, Math.min(MAP.h - 1, b.x));
    b.z = Math.max(-MAP.h + 1, Math.min(MAP.h - 1, b.z));
  }

  /** Where the segment a→b first enters something solid (0-1 along it, the surface's normal), or null. */
  hit(a: V3, b: V3): { t: number; n: V3 } | null {
    let best: { t: number; n: V3 } | null = null;
    for (const s of this.near(a.x, a.z, b.x, b.z)) {
      const h = shapeHit(s, a, b);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  /** Nothing in between? */
  canSee(a: V3, b: V3) {
    return !this.hit(a, b);
  }
}

export type Body = { x: number; y: number; z: number; vy: number };

function pushOut(b: Body, s: Shape, rad: number) {
  if (b.y >= s.h - 0.05) return;
  if (s.kind === "box") {
    const c = Math.cos(s.ry ?? 0);
    const sn = Math.sin(s.ry ?? 0);
    const lx = (b.x - s.x) * c - (b.z - s.z) * sn;
    const lz = (b.x - s.x) * sn + (b.z - s.z) * c;
    const ex = s.w / 2 + rad;
    const ez = s.d / 2 + rad;
    if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return;
    let nx = lx;
    let nz = lz;
    if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex;
    else nz = Math.sign(lz || 1) * ez;
    b.x = s.x + nx * c + nz * sn;
    b.z = s.z - nx * sn + nz * c;
  } else {
    const rr = s.w / 2 + rad;
    const dx = b.x - s.x;
    const dz = b.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d >= rr) return;
    if (d < 1e-4) {
      b.x = s.x + rr;
      return;
    }
    b.x = s.x + (dx / d) * rr;
    b.z = s.z + (dz / d) * rr;
  }
}

/** Standing on top of something low (a crate, a car)? Its height there (else 0). */
function floorAt(shapes: Shape[], x: number, z: number) {
  let y = 0;
  for (const s of shapes) {
    if (s.h > 3.2) continue;
    if (s.kind === "box") {
      const c = Math.cos(s.ry ?? 0);
      const sn = Math.sin(s.ry ?? 0);
      const lx = (x - s.x) * c - (z - s.z) * sn;
      const lz = (x - s.x) * sn + (z - s.z) * c;
      if (Math.abs(lx) < s.w / 2 && Math.abs(lz) < s.d / 2) y = Math.max(y, s.h);
    } else if (Math.hypot(x - s.x, z - s.z) < s.w / 2) y = Math.max(y, s.h);
  }
  return y;
}

/** Keep people from standing inside each other: push a out from anyone too close. */
export function separate(a: Body, others: Body[], rad = RULES.radius * 2) {
  for (const o of others) {
    if (o === a || Math.abs(o.y - a.y) > 1.2) continue;
    const dx = a.x - o.x;
    const dz = a.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= rad || d < 1e-4) continue;
    a.x += (dx / d) * (rad - d) * 0.5;
    a.z += (dz / d) * (rad - d) * 0.5;
  }
}

/** Where a→b enters one shape (0-1 along, and the surface's normal), or null. */
export function shapeHit(s: Pick<Shape, "kind" | "x" | "z" | "w" | "d" | "h" | "ry">, a: V3, b: V3): { t: number; n: V3 } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  if (s.kind === "box") {
    const c = Math.cos(s.ry ?? 0);
    const sn = Math.sin(s.ry ?? 0);
    const o = [(a.x - s.x) * c - (a.z - s.z) * sn, a.y, (a.x - s.x) * sn + (a.z - s.z) * c];
    const d = [dx * c - dz * sn, dy, dx * sn + dz * c];
    const lo = [-s.w / 2, 0, -s.d / 2];
    const hi = [s.w / 2, s.h, s.d / 2];
    let t0 = 0;
    let t1 = 1;
    let nAxis = -1;
    let nSign = 0;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < lo[k] || o[k] > hi[k]) return null;
        continue;
      }
      let ta = (lo[k] - o[k]) / d[k];
      let tb = (hi[k] - o[k]) / d[k];
      let sign = -1;
      if (ta > tb) {
        [ta, tb] = [tb, ta];
        sign = 1;
      }
      if (ta > t0) {
        t0 = ta;
        nAxis = k;
        nSign = sign;
      }
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    if (nAxis < 0) return null;
    const ln = [0, 0, 0];
    ln[nAxis] = nSign;
    return { t: t0, n: { x: ln[0] * c + ln[2] * sn, y: ln[1], z: -ln[0] * sn + ln[2] * c } };
  }
  const r0 = s.w / 2;
  const ox = a.x - s.x;
  const oz = a.z - s.z;
  const A = dx * dx + dz * dz;
  const B = 2 * (ox * dx + oz * dz);
  const C = ox * ox + oz * oz - r0 * r0;
  const disc = B * B - 4 * A * C;
  if (A > 1e-9 && disc >= 0) {
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t >= 0 && t <= 1) {
      const y = a.y + dy * t;
      if (y >= 0 && y <= s.h) return { t, n: { x: (ox + dx * t) / r0, y: 0, z: (oz + dz * t) / r0 } };
    }
  }
  if (Math.abs(dy) > 1e-9) {
    const t = (s.h - a.y) / dy;
    if (t >= 0 && t <= 1 && Math.hypot(ox + dx * t, oz + dz * t) <= r0) return { t, n: { x: 0, y: 1, z: 0 } };
  }
  return null;
}

/** Does a bullet going a→b pass through someone standing (or crouching) at p? 0-1 along it (and a head hit), or null. */
export function hitsPerson(a: V3, b: V3, p: V3, crouch: boolean): { t: number; head: boolean } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-9) return null;
  let best: { t: number; head: boolean } | null = null;
  const parts = crouch ? [0.35, 0.7, 1.05] : [0.45, 0.95, 1.35, 1.65];
  for (let k = 0; k < parts.length; k++) {
    const h = parts[k];
    const head = k === parts.length - 1;
    const cx = p.x - a.x;
    const cy = p.y + h - a.y;
    const cz = p.z - a.z;
    const t = Math.max(0, Math.min(1, (cx * dx + cy * dy + cz * dz) / len2));
    const ex = a.x + dx * t - p.x;
    const ey = a.y + dy * t - (p.y + h);
    const ez = a.z + dz * t - p.z;
    if (ex * ex + ey * ey + ez * ez < (head ? 0.22 : 0.34) ** 2 && (!best || t < best.t)) best = { t, head };
  }
  return best;
}

/** A tank's hull as a box (for bullets hitting it). */
export const tankBox = (x: number, z: number, yaw: number) => ({ kind: "box" as const, x, z, w: 3.4, d: 6.2, h: 2.7, ry: yaw });

// ---------------------------------------------------------------- what flies

/** What a shot is: a gun's bullet, a grenade, or a tank's shell. */
export type ShotKind = GunId | "grenade" | "cannon";
export const SHOT_KINDS: ShotKind[] = ["pistol", "smg", "shotgun", "rifle", "sniper", "rocket", "grenade", "cannon"];

export type Shot = { id: number; owner: string; team: number; kind: ShotKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; mine: boolean; dmg: number; splash: number; life: number };

const GRAV: Record<ShotKind, number> = { pistol: 0, smg: 0, shotgun: 0, rifle: 0, sniper: 0, rocket: 0.6, grenade: 14, cannon: 1.2 };

export function makeShot(id: number, owner: string, team: number, kind: ShotKind, o: V3, d: V3, mine: boolean): Shot {
  const gun = kind in GUNS ? GUNS[kind as GunId] : null;
  const speed = kind === "grenade" ? 19 : kind === "cannon" ? 95 : gun!.speed;
  const dmg = kind === "grenade" ? RULES.grenadeDmg : kind === "cannon" ? RULES.tankDmg : gun!.dmg;
  const splash = kind === "grenade" ? RULES.grenadeSplash : kind === "cannon" ? RULES.tankSplash : (gun!.splash ?? 0);
  const life = kind === "grenade" ? RULES.grenadeFuse : (kind === "cannon" ? 220 : gun!.range) / speed;
  return { id, owner, team, kind, x: o.x, y: o.y, z: o.z, vx: d.x * speed, vy: d.y * speed + (kind === "grenade" ? 4 : 0), vz: d.z * speed, age: 0, mine, dmg, splash, life };
}

/** Where it'll be after dt; a grenade bounces off the ground and walls. */
export function fly(s: Shot, dt: number, city: City) {
  const from = { x: s.x, y: s.y, z: s.z };
  s.vy -= GRAV[s.kind] * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  s.age += dt;
  if (s.kind === "grenade") {
    const h = city.hit(from, s);
    if (h) {
      // Back to where it hit, bounced off the surface, slowed down.
      s.x = from.x + (s.x - from.x) * h.t + h.n.x * 0.05;
      s.y = from.y + (s.y - from.y) * h.t + h.n.y * 0.05;
      s.z = from.z + (s.z - from.z) * h.t + h.n.z * 0.05;
      const dot = s.vx * h.n.x + s.vy * h.n.y + s.vz * h.n.z;
      s.vx = (s.vx - 2 * dot * h.n.x) * 0.45;
      s.vy = (s.vy - 2 * dot * h.n.y) * 0.45;
      s.vz = (s.vz - 2 * dot * h.n.z) * 0.45;
    }
    if (s.y < 0.12) {
      s.y = 0.12;
      if (s.vy < 0) s.vy = -s.vy * 0.35;
      s.vx *= 0.8;
      s.vz *= 0.8;
    }
  }
  return from;
}

/** How much an explosion at c hurts someone at p (less further out, nothing behind solid cover). */
export function blast(city: City, c: V3, p: V3, radius: number, dmg: number) {
  const d = Math.hypot(p.x - c.x, p.y + 1 - c.y, p.z - c.z);
  if (d > radius) return 0;
  if (!city.canSee({ x: c.x, y: c.y + 0.3, z: c.z }, { x: p.x, y: p.y + 1, z: p.z }) && !city.canSee({ x: c.x, y: c.y + 0.3, z: c.z }, { x: p.x, y: p.y + 1.6, z: p.z })) return 0;
  // Full damage near the middle, still half at the edge.
  return Math.round(dmg * (1 - Math.max(0, d / radius - 0.25) * 0.67));
}

// ---------------------------------------------------------------- the people

export type Stats = { kills: number; downs: number; dmg: number; loot: number; returns: number; alive: number };
export const newStats = (): Stats => ({ kills: 0, downs: 0, dmg: 0, loot: 0, returns: 0, alive: 0 });
/** How much someone did, for sharing the pool: damage, takedowns, loot, bags taken back, and time in the fight. */
export function activity(s: Stats) {
  return Math.round(s.dmg + s.kills * 50 + s.loot * 150 + s.returns * 60 + s.alive * 0.2);
}

export type Actor = {
  id: string;
  name: string;
  team: number;
  bot: boolean;
  body: Body;
  yaw: number;
  pitch: number;
  alive: boolean;
  back: number;
  shield: number;
  hp: number;
  armour: number;
  maxArmour: number;
  crouch: boolean;
  /** In a tank: its health (0: on foot). */
  tank: number;
  /** A bag of loot on their back. */
  bag: boolean;
  gun: GunId;
  stats: Stats;
  /** Someone who isn't here, played by the host's bot (it earns them nothing). */
  standin?: boolean;
  /** Bots only: their plan. */
  brain?: Brain;
};

/** Hurt someone: armour takes most of it first. Returns what it took off. */
export function hurt(a: Actor, dmg: number) {
  if (a.tank > 0) {
    const took = Math.min(a.tank, dmg);
    a.tank -= took;
    return took;
  }
  let left = dmg;
  if (a.armour > 0) {
    const soak = Math.min(a.armour, left * 0.6);
    a.armour -= soak;
    left -= soak;
  }
  const took = Math.min(a.hp, left);
  a.hp -= took;
  return took + (dmg - left);
}

// ---------------------------------------------------------------- the roads, for the bots

type Node = { x: number; z: number; to: number[] };

/** The places bots walk between: every crossing, and the points where the bank and the bases meet the road. */
function roadGraph(): Node[] {
  const pts: { x: number; z: number }[] = [];
  for (const x of ROADS) for (const z of ROADS) pts.push({ x, z });
  pts.push({ x: 0, z: 30 }, { x: 0, z: -30 }, { x: -90, z: 0 }, { x: 90, z: 0 }, { x: -30, z: 0 }, { x: 30, z: 0 });
  const nodes: Node[] = pts.map((p) => ({ ...p, to: [] }));
  // Joined to the next one along the same road.
  for (const road of ROADS) {
    for (const axis of ["x", "z"] as const) {
      const on = nodes.map((n, k) => ({ n, k })).filter(({ n }) => n[axis] === road).sort((a, b) => (axis === "x" ? a.n.z - b.n.z : a.n.x - b.n.x));
      for (let k = 1; k < on.length; k++) {
        on[k].n.to.push(on[k - 1].k);
        on[k - 1].n.to.push(on[k].k);
      }
    }
  }
  return nodes;
}
const GRAPH = roadGraph();
const nearestNode = (x: number, z: number) => {
  let best = 0;
  let bd = Infinity;
  GRAPH.forEach((n, k) => {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
};
/** Where you join the roads from a place: the vault and the bases through their own lanes. */
function entryFor(x: number, z: number) {
  if (Math.abs(x) < 26 && Math.abs(z) < 26) return GRAPH.findIndex((n) => n.x === 0 && n.z === 30);
  if (x < -95) return GRAPH.findIndex((n) => n.x === -90 && n.z === 0);
  if (x > 95) return GRAPH.findIndex((n) => n.x === 90 && n.z === 0);
  return nearestNode(x, z);
}

/** A walk from one place to another along the roads (the shortest by distance). */
export function route(from: { x: number; z: number }, to: { x: number; z: number }, lane = 0): V3[] {
  const a = entryFor(from.x, from.z);
  const b = entryFor(to.x, to.z);
  const dist = new Array(GRAPH.length).fill(Infinity);
  const prev = new Array(GRAPH.length).fill(-1);
  const done = new Array(GRAPH.length).fill(false);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    for (let k = 0; k < GRAPH.length; k++) if (!done[k] && (u < 0 || dist[k] < dist[u])) u = k;
    if (u < 0 || dist[u] === Infinity || u === b) break;
    done[u] = true;
    for (const v of GRAPH[u].to) {
      const d = dist[u] + Math.hypot(GRAPH[u].x - GRAPH[v].x, GRAPH[u].z - GRAPH[v].z);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  const path: V3[] = [{ x: to.x, y: 0, z: to.z }];
  for (let k = b; k >= 0; k = prev[k]) {
    // Each walker keeps to its own part of the road (so a group doesn't walk in single file).
    path.unshift({ x: GRAPH[k].x + lane, y: 0, z: GRAPH[k].z + lane });
    if (k === a) break;
  }
  // Already past the first crossing (closer to the second)? Skip it.
  if (path.length > 2 && Math.hypot(path[1].x - from.x, path[1].z - from.z) < Math.hypot(path[1].x - path[0].x, path[1].z - path[0].z)) path.shift();
  return path;
}

// ---------------------------------------------------------------- bots

export type Brain = { lane: number; path: V3[]; goal: string; until: number; target: string | null; seen: number; next: number; strafe: number; skill: number; stuck: { t: number; x: number; z: number }; side: number; sideUntil: number; reroute: number };

const DEFEND = [{ x: -8, z: 5 }, { x: 8, z: 5 }, { x: -15, z: 12 }, { x: 15, z: 12 }, { x: 0, z: 20 }, { x: -20, z: 22 }, { x: 20, z: 22 }, { x: -28, z: 0 }, { x: 28, z: 0 }];

export type Bag = { id: string; x: number; z: number };

/**
 * A bot's next moment. Thieves: to the vault for a bag, then to the hideout with it (shooting
 * whoever gets in the way). Police: guard the bank, or hunt down a thief with a bag (police can
 * see the bags on their map). Both fight whoever they can see. Returns where it moves, whether it
 * jumps, and the direction of a shot if it fires this frame.
 */
export function think(b: Actor, all: Actor[], bags: Bag[], city: City, now: number, dt: number, r: () => number): { mx: number; mz: number; jump: boolean; shot: V3 | null } {
  const br = (b.brain ??= { lane: (r() - 0.5) * 4.4, path: [], goal: "", until: 0, target: null, seen: 0, next: 0, strafe: r() < 0.5 ? -1 : 1, skill: 0.55 + r() * 0.35, stuck: { t: now, x: b.body.x, z: b.body.z }, side: 0, sideUntil: 0, reroute: 0 });
  const eye = { x: b.body.x, y: b.body.y + RULES.eye, z: b.body.z };
  // Who to shoot: the nearest enemy in sight.
  let target: Actor | null = null;
  let bestD = Infinity;
  for (const o of all) {
    if (o.team === b.team || !o.alive) continue;
    const d = Math.hypot(o.body.x - b.body.x, o.body.z - b.body.z);
    if (d > 55 || d >= bestD) continue;
    if (!city.canSee(eye, { x: o.body.x, y: o.body.y + (o.crouch ? 0.8 : 1.2), z: o.body.z })) continue;
    target = o;
    bestD = d;
  }
  if (target?.id !== br.target) {
    br.target = target?.id ?? null;
    br.seen = now;
  }
  // Where to go.
  let want: { x: number; z: number } | null = null;
  let goal = "";
  if (b.team === 1) {
    const drop = bags.length ? bags.reduce((p, q) => (Math.hypot(q.x - b.body.x, q.z - b.body.z) < Math.hypot(p.x - b.body.x, p.z - b.body.z) ? q : p)) : null;
    if (b.bag) [want, goal] = [HIDEOUT, "hideout"];
    else if (drop && Math.hypot(drop.x - b.body.x, drop.z - b.body.z) < 40) [want, goal] = [drop, `bag:${drop.id}`];
    else [want, goal] = [VAULT, "vault"];
  } else {
    const carrier = all.find((o) => o.team === 1 && o.alive && o.bag);
    if (carrier && (br.skill > 0.7 || Math.hypot(carrier.body.x - b.body.x, carrier.body.z - b.body.z) < 60)) {
      [want, goal] = [{ x: carrier.body.x, z: carrier.body.z }, `chase:${carrier.id}`];
    } else {
      if (!br.goal.startsWith("guard") || now > br.until) {
        const p = DEFEND[Math.floor(r() * DEFEND.length)];
        br.goal = `guard:${p.x},${p.z}`;
        br.until = now + 8 + r() * 10;
        br.path = route(b.body, p, br.lane);
      }
      const [gx, gz] = br.goal.slice(6).split(",").map(Number);
      want = { x: gx, z: gz };
      goal = br.goal;
    }
  }
  // A new goal, or a chase every 2 seconds: a new route.
  if (want && (goal !== br.goal || (goal.startsWith("chase") && now > br.reroute))) {
    br.goal = goal;
    br.path = route(b.body, want, br.lane);
    br.reroute = now + 2;
  }
  let mx = 0;
  let mz = 0;
  while (br.path.length && Math.hypot(br.path[0].x - b.body.x, br.path[0].z - b.body.z) < (br.path.length > 1 ? 3 : 1.2)) br.path.shift();
  const way = br.path[0];
  if (way) {
    const dx = way.x - b.body.x;
    const dz = way.z - b.body.z;
    const l = Math.hypot(dx, dz) || 1;
    mx = dx / l;
    mz = dz / l;
  }
  // Stuck against something: step to one side for a moment (and hop).
  let jump = false;
  if (now - br.stuck.t > 0.6) {
    const moved = Math.hypot(b.body.x - br.stuck.x, b.body.z - br.stuck.z);
    if (way && moved < 0.8) {
      br.side = r() < 0.5 ? -1 : 1;
      br.sideUntil = now + 0.7;
      jump = true;
    }
    br.stuck = { t: now, x: b.body.x, z: b.body.z };
  }
  if (now < br.sideUntil) {
    const sx = -mz * br.side;
    const sz = mx * br.side;
    mx = mx * 0.2 + sx;
    mz = mz * 0.2 + sz;
    const l = Math.hypot(mx, mz) || 1;
    mx /= l;
    mz /= l;
  }
  let shot: V3 | null = null;
  if (target) {
    const tx = target.body.x - b.body.x;
    const tz = target.body.z - b.body.z;
    const face = Math.atan2(-tx, -tz);
    let d = face - b.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.yaw += d * Math.min(1, dt * 5 * br.skill);
    // Fighting: hold ground and step side to side (a thief with a bag keeps running).
    if (!b.bag && bestD < 40) {
      const side = Math.sin(now * 1.3 + b.id.length) * br.strafe;
      mx = Math.cos(face) * side * 0.55;
      mz = -Math.sin(face) * side * 0.55;
    }
    const gun = GUNS[b.gun];
    const reaction = 0.5 / br.skill;
    if (now - br.seen > reaction && Math.abs(d) < 0.25 && now >= br.next && bestD < gun.range * 0.8) {
      br.next = now + 1 / (gun.rate * (0.4 + br.skill * 0.3));
      const wob = (0.03 + bestD * 0.003) / br.skill;
      const aimAt = { x: target.body.x + (r() - 0.5) * wob * bestD, y: target.body.y + (target.crouch ? 0.75 : 1.15) + (r() - 0.5) * wob * bestD, z: target.body.z + (r() - 0.5) * wob * bestD };
      const sx = aimAt.x - eye.x;
      const sy = aimAt.y - eye.y;
      const sz = aimAt.z - eye.z;
      const l = Math.hypot(sx, sy, sz) || 1;
      shot = { x: sx / l, y: sy / l, z: sz / l };
      b.pitch = Math.asin(Math.max(-1, Math.min(1, shot.y)));
    }
  } else if (mx || mz) b.yaw = Math.atan2(-mx, -mz);
  return { mx, mz, jump, shot };
}
