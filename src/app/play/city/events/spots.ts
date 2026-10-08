// Where a world event happens. The database gives each event a tile; the event needs a fitting
// kind of place (a hospital, a tower, water, a road...), so we take the nearest one that fits,
// falling back to something sensible when the city has none (no river? a pond out in the
// countryside; no airport? the fields at the edge of town). Pure maths on the tile list, the
// same for everyone. Also: a route along the roads for parades and chases, and a spot by the
// road in front of a building for fire engines and ambulances to park.

import { spiralXY, type CityPlan, type StructureType, type Tile } from "@/lib/city/layout";
import type { EventNeed } from "@/lib/world-events";
import { RAIL_Y } from "../trains";
import { BRIDGE_TOP } from "../world";

export type Spot = {
  /** The tile it happens on (the corner tile of a big 2×2 building). */
  tile: number;
  /** Centre of the place (the middle of a 2×2 building), and its height. */
  x: number;
  z: number;
  top: number;
  /** 1 for a normal tile, 2 for a big building. */
  w: number;
  /** Tile kind, or the big building's type. */
  kind: string;
  /** Ground height there (the hills, out in the countryside). */
  ground: number;
  /** Open water here: its surface height and extent (along x and z). */
  water: boolean;
  waterY: number;
  waterW: number;
  waterD: number;
  /** We had to make a pond for it (no water anywhere): its radius. */
  pool: number;
  /** The long way of the place: 0 along x, 1 along z (roads, rivers, the railway). */
  axis: 0 | 1;
  /** By the road in front of the place, for vehicles to park, and which way the road runs. */
  fx: number;
  fz: number;
  fyaw: number;
  /** A route along the roads through (or near) the place: x, y, z per point. */
  route: Float32Array;
  cum: Float32Array;
  len: number;
  /** A special point: an oil rig's flare, a station platform, a chimney top... */
  hx: number;
  hy: number;
  hz: number;
  /** Out past the edge of the city, beyond this spot (open country). */
  ex: number;
  ez: number;
};

export type CityIndex = {
  tiles: Tile[];
  plan: CityPlan | null;
  at: Map<string, Tile>;
  /** Half the width of the built city (in tiles). */
  half: number;
};

const key = (x: number, z: number) => `${x},${z}`;

export function indexCity(tiles: Tile[], plan: CityPlan | null): CityIndex {
  const at = new Map<string, Tile>();
  let half = 2;
  for (const t of tiles) {
    at.set(key(t.x, t.z), t);
    half = Math.max(half, Math.abs(t.x), Math.abs(t.z));
  }
  return { tiles, plan, at, half };
}

type Match = (t: Tile) => boolean;
const kind = (...kinds: Tile["kind"][]): Match => (t) => kinds.includes(t.kind);
const big = (...types: StructureType[]): Match => (t) => t.kind === "structure" && !!t.structure?.anchor && types.includes(t.structure.type);
const either = (...ms: Match[]): Match => (t) => ms.some((m) => m(t));
const ROADISH = kind("road", "bridge");
const roadOK: Match = (t) => (t.kind === "road" || t.kind === "bridge") && !t.works && !t.roundabout;
const straightRoad: Match = (t) => roadOK(t) && (t.mask === 5 || t.mask === 10 || t.kind === "bridge");
const LOTS = kind("house", "office", "park", "trees", "plaza", "tower", "hospital", "police", "clock", "crane", "fuel", "watertower", "mast", "billboard");

/** What fits each need, best first (each entry is tried in turn until one exists in the city). */
const NEEDS: Record<EventNeed, (Match | "outskirts" | "pool" | "scheduled")[]> = {
  any: ["scheduled"],
  sky: ["scheduled"],
  hospital: [kind("hospital"), kind("office"), LOTS],
  tower: [either(kind("tower"), big("twin", "hotel")), kind("office"), LOTS],
  office: [kind("office"), kind("tower"), LOTS],
  market: [big("market"), kind("plaza"), kind("park"), straightRoad],
  stadium: [big("arena"), kind("stadium"), kind("park"), kind("plaza"), LOTS],
  water: [either(kind("lake", "river", "pond"), big("port", "dam")), "pool"],
  river: [kind("river"), kind("lake", "pond"), big("port", "dam"), "pool"],
  park: [kind("park", "trees"), kind("pond", "plaza"), LOTS],
  plaza: [kind("plaza"), kind("park"), straightRoad, LOTS],
  station: [(t) => !!t.station, (t) => !!t.rail, kind("plaza"), straightRoad],
  airport: [big("airport"), big("military"), "outskirts"],
  port: [big("port"), kind("river"), kind("lake"), big("dam", "oilrig"), "pool"],
  campus: [big("campus"), big("museum"), kind("plaza"), kind("park"), LOTS],
  museum: [big("museum"), kind("clock"), big("campus"), kind("office"), LOTS],
  hotel: [big("hotel"), big("twin"), kind("tower"), kind("office"), LOTS],
  mall: [big("mall"), big("market"), kind("office"), LOTS],
  construction: [kind("crane"), kind("office"), LOTS],
  power: [big("power", "dam", "solar"), kind("mast", "turbine", "watertower"), "outskirts"],
  outskirts: ["outskirts"],
  road: [straightRoad, roadOK, ROADISH],
  bridge: [kind("bridge"), straightRoad, ROADISH],
  police: [kind("police"), straightRoad, ROADISH],
  oilrig: [big("oilrig"), big("port"), kind("lake", "river"), "pool"],
  house: [kind("house"), LOTS],
};

/** Height of the land at (x, z) (city-view's hills; flat inside the city). */
export type Ground = (x: number, z: number) => number;

export function findSpot(city: CityIndex, need: EventNeed, scheduled: number, salt: number, ground: Ground): Spot | null {
  const { tiles } = city;
  if (!tiles.length) return null;
  const [sx, sz] = spiralXY(Math.max(0, scheduled));
  const jitter = (t: Tile) => ((Math.imul(t.x * 73856093 ^ t.z * 19349663, 83492791 + salt) >>> 0) % 1000) / 4000;
  for (const m of NEEDS[need] ?? NEEDS.any) {
    if (m === "scheduled") {
      const t = city.at.get(key(sx, sz)) ?? tiles[Math.min(tiles.length - 1, Math.max(0, scheduled))] ?? tiles[0];
      return finish(city, t, ground, null);
    }
    if (m === "outskirts" || m === "pool") {
      const t = nearestEdge(city, sx, sz);
      if (!t) continue;
      return finish(city, t, ground, m);
    }
    let best: Tile | null = null;
    let bestD = Infinity;
    for (const t of tiles) {
      if (!m(t)) continue;
      const d = Math.hypot(t.x - sx, t.z - sz) + jitter(t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) return finish(city, best, ground, null);
  }
  return finish(city, city.at.get(key(sx, sz)) ?? tiles[0], ground, null);
}

/** A lot near the edge of the city, nearest to (sx, sz). */
function nearestEdge(city: CityIndex, sx: number, sz: number) {
  let best: Tile | null = null;
  let bestD = Infinity;
  for (const t of city.tiles) {
    if (Math.max(Math.abs(t.x), Math.abs(t.z)) < city.half - 1) continue;
    if (t.kind === "road" || t.kind === "bridge") continue;
    const d = Math.hypot(t.x - sx, t.z - sz);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best ?? city.tiles[city.tiles.length - 1];
}

function finish(city: CityIndex, t: Tile, ground: Ground, mode: "outskirts" | "pool" | null): Spot {
  const st = t.kind === "structure" && t.structure ? t.structure : null;
  const w = st ? 2 : 1;
  const x = st ? st.ax + 0.5 : t.x;
  const z = st ? st.az + 0.5 : t.z;
  // Beyond the edge of the city, in the direction of this spot.
  const m = Math.max(Math.abs(x), Math.abs(z), 0.5);
  const out = (city.half + 3) / m;
  const ex = x * out;
  const ez = z * out;
  const s: Spot = {
    tile: t.i,
    x,
    z,
    top: t.top,
    w,
    kind: st ? st.type : t.kind,
    ground: t.kind === "road" || t.kind === "bridge" ? 0.065 : t.kind === "plaza" ? 0.1 : st ? 0.09 : 0.08,
    water: false,
    waterY: 0.08,
    waterW: 0,
    waterD: 0,
    pool: 0,
    axis: t.road === "z" ? 1 : 0,
    fx: x,
    fz: z,
    fyaw: 0,
    route: new Float32Array(6),
    cum: new Float32Array(2),
    len: 0,
    hx: x,
    hy: t.top,
    hz: z,
    ex,
    ez,
  };
  const plan = city.plan;
  if (mode) {
    // Out in the countryside: a field, or a pond made for the event.
    const d = mode === "pool" ? 4.2 : 2.2;
    const k = (city.half + d) / m;
    s.x = x * k;
    s.z = z * k;
    s.kind = mode;
    s.top = 0;
    let h = -Infinity;
    for (const [ox, oz] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) h = Math.max(h, ground(s.x + ox, s.z + oz));
    s.ground = Math.max(0.02, h);
    s.hy = s.ground;
    s.hx = s.x;
    s.hz = s.z;
    if (mode === "pool") {
      s.pool = 2.6;
      s.water = true;
      s.waterY = s.ground + 0.04;
      s.waterW = s.waterD = 4.4;
    }
    s.fx = s.x;
    s.fz = s.z;
    makeRoute(city, s, x, z);
    return s;
  }
  if (t.kind === "river" || t.kind === "lake" || t.kind === "pond") {
    s.water = true;
    s.waterY = t.kind === "pond" ? 0.1 : 0.01;
    s.ground = s.waterY;
    if (t.kind === "river" && plan?.river) {
      s.axis = plan.river.along === "x" ? 0 : 1;
      s.waterW = s.axis === 0 ? 5 : 0.9;
      s.waterD = s.axis === 0 ? 0.9 : 5;
    } else {
      // How big is this lake? (Count the water round it.)
      let minX = t.x;
      let maxX = t.x;
      let minZ = t.z;
      let maxZ = t.z;
      const seen = new Set<string>([key(t.x, t.z)]);
      const todo = [t];
      while (todo.length && seen.size < 40) {
        const c = todo.pop()!;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = city.at.get(key(c.x + ox, c.z + oz));
          if (!n || seen.has(key(n.x, n.z)) || (n.kind !== "lake" && n.kind !== "river" && n.kind !== "pond")) continue;
          seen.add(key(n.x, n.z));
          todo.push(n);
          minX = Math.min(minX, n.x);
          maxX = Math.max(maxX, n.x);
          minZ = Math.min(minZ, n.z);
          maxZ = Math.max(maxZ, n.z);
        }
      }
      s.x = (minX + maxX) / 2;
      s.z = (minZ + maxZ) / 2;
      s.waterW = maxX - minX + 0.9;
      s.waterD = maxZ - minZ + 0.9;
      s.axis = s.waterW >= s.waterD ? 0 : 1;
    }
  }
  if (st) {
    const ax = st.ax;
    const az = st.az;
    if (st.type === "port") {
      s.water = true;
      s.waterY = 0.08;
      s.hx = ax + 0.5;
      s.hz = az + 0.95;
      s.hy = 0.08;
      s.waterW = 1.9;
      s.waterD = 1.0;
      s.axis = 0;
    } else if (st.type === "oilrig") {
      s.water = true;
      s.waterY = 0.1;
      s.waterW = s.waterD = 1.9;
      s.hx = ax + 1.48;
      s.hy = 1.42;
      s.hz = az + 0.08;
    } else if (st.type === "dam") {
      s.water = true;
      s.waterY = 0.5;
      s.hx = ax + 0.5;
      s.hz = az;
      s.hy = 0.5;
      s.waterW = 1.9;
      s.waterD = 0.9;
    } else if (st.type === "power") {
      // The chimney top.
      s.hx = ax + 0.5 - 0.62;
      s.hz = az + 0.5 - 0.55;
      s.hy = 3.2;
    } else if (st.type === "airport") {
      // The runway runs along x on the +z half.
      s.hx = ax + 0.5;
      s.hz = az + 0.85;
      s.hy = 0.1;
      s.axis = 0;
    }
  }
  if (t.station || t.rail) {
    s.hy = RAIL_Y;
    s.axis = plan?.rail?.along === "z" ? 1 : 0;
  }
  // Where vehicles pull up: the nearest road round the place.
  if (t.kind === "road" || t.kind === "bridge") {
    s.fx = t.x;
    s.fz = t.z;
    s.fyaw = t.road === "z" ? Math.PI / 2 : 0;
  } else {
    let best: Tile | null = null;
    let bestD = Infinity;
    for (let ox = -w; ox <= w + 1; ox++) {
      for (let oz = -w; oz <= w + 1; oz++) {
        const n = city.at.get(key((st ? st.ax : t.x) + ox - (st ? 0 : 0), (st ? st.az : t.z) + oz));
        if (!n || !roadOK(n)) continue;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    if (best) {
      s.fx = best.x;
      s.fz = best.z;
      s.fyaw = best.road === "z" ? Math.PI / 2 : 0;
    } else {
      s.fx = x + 0.7 * w;
      s.fz = z;
    }
  }
  makeRoute(city, s, s.fx, s.fz);
  return s;
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

/** A route along the roads, about 14 tiles long, with the spot near its middle. */
function makeRoute(city: CityIndex, s: Spot, fromX: number, fromZ: number) {
  // Start on the nearest road to (fromX, fromZ).
  let start: Tile | null = null;
  let bestD = Infinity;
  for (const t of city.tiles) {
    if (!roadOK(t)) continue;
    const d = Math.hypot(t.x - fromX, t.z - fromZ);
    if (d < bestD) {
      bestD = d;
      start = t;
    }
  }
  if (!start || bestD > 6) {
    // No roads near: a straight line across the place.
    const pts = [s.x - 4, s.ground, s.z, s.x + 4, s.ground, s.z];
    setRoute(s, pts);
    return;
  }
  const seen = new Set<string>([key(start.x, start.z)]);
  let h = (start.x * 928371 + start.z * 123457 + s.tile * 31) >>> 0;
  const rnd = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return (h % 10000) / 10000;
  };
  const first = start.road === "z" ? 1 : 0;
  const walk = (dir: number, n: number) => {
    const out: Tile[] = [];
    let c = start!;
    let d = dir;
    for (let k = 0; k < n; k++) {
      const options: number[] = [];
      for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {
        const n2 = city.at.get(key(c.x + DIRS[nd][0], c.z + DIRS[nd][1]));
        if (n2 && roadOK(n2) && !seen.has(key(n2.x, n2.z))) options.push(nd);
      }
      if (!options.length) break;
      // Mostly straight on, sometimes round a corner.
      const nd = options[0] === d && (options.length === 1 || rnd() < 0.75) ? d : options[Math.floor(rnd() * options.length)];
      c = city.at.get(key(c.x + DIRS[nd][0], c.z + DIRS[nd][1]))!;
      seen.add(key(c.x, c.z));
      out.push(c);
      d = nd;
    }
    return out;
  };
  const ahead = walk(first, 8);
  const behind = walk(first + 2, 7);
  const path = [...behind.reverse(), start, ...ahead];
  const pts: number[] = [];
  for (const t of path) pts.push(t.x, t.kind === "bridge" ? BRIDGE_TOP : 0.06, t.z);
  if (path.length < 2) pts.push(start.x + 0.45, 0.06, start.z);
  setRoute(s, pts);
}

function setRoute(s: Spot, pts: number[]) {
  s.route = new Float32Array(pts);
  const n = pts.length / 3;
  s.cum = new Float32Array(n);
  for (let k = 1; k < n; k++) s.cum[k] = s.cum[k - 1] + Math.hypot(pts[k * 3] - pts[k * 3 - 3], pts[k * 3 + 2] - pts[k * 3 - 1]);
  s.len = s.cum[n - 1];
}

/** A point along a spot's route, d from its start (clamped): position and heading. */
export type Along = { x: number; y: number; z: number; yaw: number };

export function along(s: Spot, d: number, out: Along, side = 0) {
  const r = s.route;
  const n = s.cum.length;
  const dd = Math.min(Math.max(d, 0), s.len);
  let k = 1;
  while (k < n - 1 && s.cum[k] < dd) k++;
  const seg = s.cum[k] - s.cum[k - 1] || 1;
  const f = (dd - s.cum[k - 1]) / seg;
  const x0 = r[k * 3 - 3];
  const z0 = r[k * 3 - 1];
  const dx = r[k * 3] - x0;
  const dz = r[k * 3 + 2] - z0;
  const l = Math.hypot(dx, dz) || 1;
  // Keep to one side of the road (side > 0: the right-hand lane).
  out.x = x0 + dx * f - (dz / l) * side;
  out.z = z0 + dz * f + (dx / l) * side;
  out.y = r[k * 3 - 2] + (r[k * 3 + 1] - r[k * 3 - 2]) * f;
  out.yaw = Math.atan2(-dz, dx);
  return out;
}
