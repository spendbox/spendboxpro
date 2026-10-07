// Decides what stands on every tile of the city. Pure maths, no drawing.
//
// Tiles are laid out in a square spiral from the centre (tile 0), so new tiles always
// appear on the outside edge and the city grows outwards. The database uses the same
// spiral (spiral_xy) to work out which tiles are "nearby" for sweeps.
// Each round gets its own seed, so the street grid, downtowns and parks differ every round,
// but a given tile always looks the same for everyone during that round.

export type TileKind =
  | "road"
  | "bridge"
  | "river"
  | "lake"
  | "tower"
  | "office"
  | "house"
  | "park"
  | "trees"
  | "plaza"
  | "pond"
  | "ferris"
  | "stadium"
  | "turbine";

export type Tile = {
  i: number;
  x: number;
  z: number;
  kind: TileKind;
  /** Height of the tallest thing on the tile (for placing markers above it). */
  top: number;
  /** Road direction: along x, along z, or a crossing. */
  road?: "x" | "z" | "cross";
  /** Stable random numbers for this tile (0..1). */
  r: [number, number, number, number];
};

export const KIND_LABEL: Record<TileKind, string> = {
  road: "Road",
  tower: "Skyscraper",
  office: "Office block",
  house: "House",
  park: "Park",
  trees: "Woods",
  plaza: "Plaza",
  pond: "Pond",
  bridge: "Bridge",
  river: "River",
  lake: "Lake",
  ferris: "Ferris wheel",
  stadium: "Stadium",
  turbine: "Wind turbine",
};

/** Everything the city can be made of, for the help screen. */
export const CITY_ASSETS = {
  tiles: ["Roads and crossings", "Bridges", "A winding river", "Lakes", "Ponds", "Skyscrapers", "Office blocks", "Houses with gardens", "Parks", "Woods", "Plazas with fountains", "Ferris wheels", "Stadiums", "Wind turbines"],
  moving: ["Cars", "Boats", "Birds", "Clouds", "Hot-air balloons", "Planes", "Turning Ferris wheels and turbines"],
};

/** Square spiral: tile n → grid (x, z). Must match spiral_xy in the database. */
export function spiralXY(n: number): [number, number] {
  if (n <= 0) return [0, 0];
  const p = n + 1;
  const k = Math.ceil((Math.sqrt(p) - 1) / 2);
  let t = 2 * k + 1;
  let m = t * t;
  t -= 1;
  if (p >= m - t) return [k - (m - p), -k];
  m -= t;
  if (p >= m - t) return [-k, -k + (m - p)];
  m -= t;
  if (p >= m - t) return [-k + (m - p), k];
  return [k, k - (m - p - t)];
}

/** Integer hash → 0..1, stable for the same inputs. */
export function hash(x: number, z: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth random field (value noise), 0..1. */
function noise(x: number, z: number, s: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, s);
  const b = hash(x0 + 1, z0, s);
  const c = hash(x0, z0 + 1, s);
  const d = hash(x0 + 1, z0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export type CityPlan = {
  seed: number;
  periodX: number;
  periodZ: number;
  offX: number;
  offZ: number;
  centres: { x: number; z: number; radius: number; weight: number }[];
  /** A river winding across the city (along x or z), or none. */
  river: { along: "x" | "z"; at: number; amp: number; wave: number; phase: number; width: number } | null;
  palette: Palette;
};

/** Where the river's centre line is, for a position along it. */
export function riverCentre(plan: CityPlan, along: number) {
  const r = plan.river!;
  return r.at + r.amp * Math.sin(along / r.wave + r.phase);
}

export type Palette = {
  name: string;
  towers: number[];
  offices: number[];
  walls: number[];
  roofs: number[];
  leaves: number[];
  car: number[];
};

const PALETTES: Palette[] = [
  {
    name: "coastal",
    towers: [0x9ec9e2, 0xb8d4e8, 0x7fb0cf, 0xd5e3ec, 0xa7bfd1],
    offices: [0xf2e3cf, 0xe9d2c0, 0xf5efe6, 0xdcd2c6, 0xf0c9a8],
    walls: [0xffffff, 0xf7f0e6, 0xf3e9dc, 0xeef2f3],
    roofs: [0xd9734e, 0xc8644a, 0x6f7f8f, 0xb85c42],
    leaves: [0x7bc47f, 0x5fae6a, 0x9ad08b, 0x4f9a5e],
    car: [0xff6b6b, 0xffd166, 0x4dabf7, 0xffffff, 0x495057, 0x63e6be],
  },
  {
    name: "sunset",
    towers: [0xf4c7b8, 0xe8b4a6, 0xd9a7c7, 0xf1d1c1, 0xc9b6e4],
    offices: [0xfbe8d3, 0xf6d6bd, 0xf8efe4, 0xe7cfc0, 0xf2c6a0],
    walls: [0xfffaf3, 0xfdf0e2, 0xf8e8da, 0xffffff],
    roofs: [0x8c5a7a, 0xb35d4f, 0x6c5b7b, 0xd07a5a],
    leaves: [0x8cc084, 0x6aa96f, 0xa9cf8e, 0x5b9a6a],
    car: [0xff8787, 0x748ffc, 0xffe066, 0xffffff, 0x343a40, 0x69db7c],
  },
  {
    name: "modern",
    towers: [0xcfd8e3, 0xb6c3d1, 0xe3e8ee, 0x9fb3c8, 0xdfe7f0],
    offices: [0xe9ecef, 0xdee2e6, 0xf1f3f5, 0xced4da, 0xe6e0d6],
    walls: [0xffffff, 0xf1f3f5, 0xe9ecef, 0xf8f9fa],
    roofs: [0x7a8794, 0x8f9ba7, 0x6b7785, 0xa08c78],
    leaves: [0x74b816, 0x5c940d, 0x8ce99a, 0x40c057],
    car: [0xfa5252, 0x228be6, 0xfab005, 0xffffff, 0x212529, 0x12b886],
  },
];

export function makePlan(seed: number): CityPlan {
  const r = (k: number) => hash(seed, k, 9173);
  const centres = [{ x: 0, z: 0, radius: 2.2 + r(1) * 2, weight: 1 }];
  const extra = 1 + Math.floor(r(2) * 3);
  for (let k = 0; k < extra; k++) {
    const angle = r(10 + k) * Math.PI * 2;
    const dist = 12 + r(20 + k) * 18;
    centres.push({
      x: Math.round(Math.cos(angle) * dist),
      z: Math.round(Math.sin(angle) * dist),
      radius: 1.5 + r(30 + k) * 2,
      weight: 0.65 + r(40 + k) * 0.3,
    });
  }
  return {
    seed,
    periodX: 4 + Math.floor(r(3) * 3),
    periodZ: 4 + Math.floor(r(4) * 3),
    offX: Math.floor(r(5) * 6),
    offZ: Math.floor(r(6) * 6),
    centres,
    river:
      r(50) < 0.75
        ? {
            along: r(51) < 0.5 ? "x" : "z",
            at: Math.round((r(52) - 0.5) * 14) || 5,
            amp: 1.5 + r(53) * 3,
            wave: 3 + r(54) * 4,
            phase: r(55) * 6.28,
            width: 0.9 + r(56) * 0.8,
          }
        : null,
    palette: PALETTES[Math.floor(r(7) * PALETTES.length)],
  };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function tileAt(plan: CityPlan, i: number): Tile {
  const [x, z] = spiralXY(i);
  const s = plan.seed;
  const r: Tile["r"] = [hash(x, z, s), hash(x, z, s + 1), hash(x, z, s + 2), hash(x, z, s + 3)];

  const roadX = mod(z - plan.offZ, plan.periodZ) === 0; // runs along x
  const roadZ = mod(x - plan.offX, plan.periodX) === 0; // runs along z
  const road: Tile["road"] = roadX && roadZ ? "cross" : roadX ? "x" : "z";

  // Water: the river, and lakes away from downtown. Roads cross water on bridges.
  let water: "river" | "lake" | null = null;
  if (plan.river) {
    const along = plan.river.along === "x" ? x : z;
    const across = plan.river.along === "x" ? z : x;
    if (Math.abs(across - riverCentre(plan, along)) <= plan.river.width) water = "river";
  }
  if (!water && Math.hypot(x, z) > 5 && noise(x / 5 - 9, z / 5 + 4, s + 23) > 0.79) water = "lake";
  if (water) {
    const crossing = road === "cross" || (plan.river?.along === "x" ? road === "z" : road === "x");
    if ((roadX || roadZ) && (water === "lake" || crossing)) {
      return { i, x, z, kind: "bridge", top: 0.35, road: road === "cross" ? (plan.river?.along === "x" ? "z" : "x") : road, r };
    }
    return { i, x, z, kind: water, top: 0.1, r };
  }

  if (roadX || roadZ) return { i, x, z, kind: "road", top: 0.05, road, r };

  let density = 0;
  for (const c of plan.centres) {
    const d = Math.hypot(x - c.x, z - c.z);
    density = Math.max(density, c.weight * Math.exp(-d / (c.radius * 1.5)));
  }
  density += (noise(x / 3, z / 3, s + 7) - 0.5) * 0.25;

  const green = noise(x / 6 + 31, z / 6 - 17, s + 11);
  if (green > 0.7 && density < 0.6) {
    if (green > 0.8 && r[0] < 0.45) return { i, x, z, kind: "pond", top: 0.5, r };
    if (r[3] < 0.07) return { i, x, z, kind: "ferris", top: 2.6, r };
    return { i, x, z, kind: "park", top: 0.9, r };
  }
  if (density > 0.56) {
    const h = 2.4 + density * 5.5 * (0.6 + r[1] * 0.8);
    return { i, x, z, kind: "tower", top: h + 0.4, r };
  }
  if (density > 0.24) {
    if (r[0] < 0.06) return { i, x, z, kind: "plaza", top: 0.6, r };
    if (r[0] > 0.985) return { i, x, z, kind: "stadium", top: 0.6, r };
    return { i, x, z, kind: "office", top: 0.9 + r[1] * 1.6 + density * 1.5, r };
  }
  if (Math.hypot(x, z) > 13 && r[2] < 0.035) return { i, x, z, kind: "turbine", top: 3.2, r };
  if (r[3] > 0.992) return { i, x, z, kind: "ferris", top: 2.6, r };
  if (r[0] < 0.16) return { i, x, z, kind: "trees", top: 1, r };
  return { i, x, z, kind: "house", top: 0.95, r };
}
