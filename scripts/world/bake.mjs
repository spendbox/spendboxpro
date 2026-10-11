#!/usr/bin/env node
// Bakes a region's land, water, main roads and landmark positions from OpenStreetMap into
// src/lib/world/regions/<id>/baked.ts (© OpenStreetMap contributors, ODbL: the game shows the credit).
//
//   npm run bake:world -- lagos           uses the downloaded data if it's there
//   npm run bake:world -- lagos --fresh   downloads it again
//
// Needs curl and access to overpass-api.de. Downloads are kept in scripts/world/.cache (not
// committed). Prints a small map of the result to check by eye.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REGIONS } from "../../src/lib/world/index.ts";
import { line4 } from "../../src/lib/world/compile.ts";
import { tileBounds, toTile } from "../../src/lib/world/geo.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const id = process.argv[2];
const fresh = process.argv.includes("--fresh");
const region = REGIONS[id];
if (!region) {
  console.error(`Which region? One of: ${Object.keys(REGIONS).join(", ")}`);
  process.exit(1);
}

const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const cacheDir = join(here, ".cache");
mkdirSync(cacheDir, { recursive: true });

function overpass(name, query) {
  const file = join(cacheDir, `${id}-${name}.json`);
  if (!fresh && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  console.log(`Downloading ${name} from OpenStreetMap…`);
  const q = join(cacheDir, `${id}-${name}.query`);
  writeFileSync(q, query);
  const out = execFileSync("curl", ["-sS", "--fail", "-m", "900", "--data-urlencode", `data@${q}`, OVERPASS], { maxBuffer: 1 << 30 });
  writeFileSync(file, out);
  return JSON.parse(out.toString("utf8"));
}

// ---------------------------------------------------------------- the region's tiles
const frame = { origin: { lat: (region.box.north + region.box.south) / 2, lon: (region.box.west + region.box.east) / 2 } };
const B = tileBounds(frame, region.box);
const W = B.x1 - B.x0 + 1;
const H = B.z1 - B.z0 + 1;
const at = (lat, lon) => toTile(frame, { lat, lon });
const m = 0.02; // download a little round the edges, so shapes crossing them are whole
const bbox = `${region.box.south - m},${region.box.west - m},${region.box.north + m},${region.box.east + m}`;

const RANKS = ["tertiary", "secondary", "primary", "trunk", "motorway"];
const minRank = RANKS.indexOf(region.bake?.roads ?? "secondary");
const wanted = RANKS.slice(minRank).join("|");

const osm = overpass(
  "map",
  `[out:json][timeout:600];
(
  way["natural"="coastline"](${bbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["waterway"="riverbank"](${bbox});
  relation["waterway"="riverbank"](${bbox});
  way["highway"~"^(${wanted})$"](${bbox});
);
out geom;`,
);
console.log(`${osm.elements.length} map features`);

// ---------------------------------------------------------------- land and water
// Worked out on a finer grid (S × S cells per tile), then each tile is water if most of it is.
const S = 4;
const FW = W * S;
const FH = H * S;
const LAND = 0, WATER = 1, BARRIER = 2;
const fine = new Uint8Array(FW * FH);
const fx = (p) => (p.x - (B.x0 - 0.5)) * S - 0.5;
const fz = (p) => (p.z - (B.z0 - 0.5)) * S - 0.5;
const inFine = (x, z) => x >= 0 && z >= 0 && x < FW && z < FH;

/** Fill every fine cell inside a set of rings (even–odd, so holes stay out). */
function fillRings(rings) {
  const edges = [];
  for (const ring of rings) {
    const pts = ring.map((g) => {
      const t = at(g.lat, g.lon);
      return { x: fx(t), z: fz(t) };
    });
    for (let k = 0; k + 1 < pts.length; k++) edges.push([pts[k], pts[k + 1]]);
  }
  if (!edges.length) return;
  let zMin = Infinity, zMax = -Infinity;
  for (const [a, b] of edges) {
    zMin = Math.min(zMin, a.z, b.z);
    zMax = Math.max(zMax, a.z, b.z);
  }
  for (let z = Math.max(0, Math.ceil(zMin)); z <= Math.min(FH - 1, Math.floor(zMax)); z++) {
    const cuts = [];
    for (const [a, b] of edges) if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) cuts.push(a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(cuts[k])); x <= Math.min(FW - 1, Math.floor(cuts[k + 1])); x++) fine[z * FW + x] = WATER;
    }
  }
}

// Lakes, lagoons, creeks and wide rivers drawn as areas.
for (const e of osm.elements) {
  const t = e.tags ?? {};
  if (t.natural !== "water" && t.waterway !== "riverbank") continue;
  if (e.type === "way" && e.geometry) fillRings([e.geometry]);
  if (e.type === "relation") fillRings((e.members ?? []).filter((mb) => mb.geometry && (mb.role === "outer" || mb.role === "inner")).map((mb) => mb.geometry));
}

// The coast: land is on the left of each coastline, water on its right. Draw the coastlines as
// walls, then flood the water side from just right of every stretch of wall.
const seeds = [];
for (const e of osm.elements) {
  if (e.type !== "way" || e.tags?.natural !== "coastline" || !e.geometry) continue;
  const pts = e.geometry.map((g) => {
    const t = at(g.lat, g.lon);
    return { x: fx(t), z: fz(t) };
  });
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    line4(a.x, a.z, b.x, b.z, (x, z) => inFine(x, z) && (fine[z * FW + x] = BARRIER));
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    // To the right of travel, with x east and z south: (-dz, dx).
    const rx = -(b.z - a.z) / len, rz = (b.x - a.x) / len;
    for (let s = 0.5; s < len; s += 2) {
      const px = a.x + ((b.x - a.x) * s) / len + rx * 1.5;
      const pz = a.z + ((b.z - a.z) * s) / len + rz * 1.5;
      seeds.push([Math.round(px), Math.round(pz)]);
    }
  }
}
const coastWater = new Uint8Array(FW * FH);
flood(seeds, (x, z) => fine[z * FW + x] !== BARRIER, coastWater);
for (let k = 0; k < fine.length; k++) if (coastWater[k]) fine[k] = WATER;
// Wall cells go with their neighbours.
for (let z = 0; z < FH; z++) {
  for (let x = 0; x < FW; x++) {
    if (fine[z * FW + x] !== BARRIER) continue;
    let wet = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inFine(x + dx, z + dz) && fine[(z + dz) * FW + x + dx] === WATER) wet++;
    fine[z * FW + x] = wet >= 2 ? WATER : LAND;
  }
}

// Sea: the water joined to the southern edge (the open ocean), not past the harbour gates.
const gate = new Uint8Array(FW * FH);
for (const path of region.bake?.seaGates ?? []) {
  const pts = path.map(([lat, lon]) => {
    const t = at(lat, lon);
    return { x: fx(t), z: fz(t) };
  });
  for (let k = 1; k < pts.length; k++) line4(pts[k - 1].x, pts[k - 1].z, pts[k].x, pts[k].z, (x, z) => inFine(x, z) && (gate[z * FW + x] = 1));
}
const sea = new Uint8Array(FW * FH);
const bottom = [];
for (let x = 0; x < FW; x++) if (fine[(FH - 1) * FW + x] === WATER) bottom.push([x, FH - 1]);
flood(bottom, (x, z) => fine[z * FW + x] === WATER && !gate[z * FW + x], sea);

function flood(start, ok, mark) {
  const stack = [];
  for (const [x, z] of start) if (inFine(x, z) && ok(x, z) && !mark[z * FW + x]) {
    mark[z * FW + x] = 1;
    stack.push(z * FW + x);
  }
  while (stack.length) {
    const k = stack.pop();
    const x = k % FW, z = (k - x) / FW;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inFine(nx, nz)) continue;
      const n = nz * FW + nx;
      if (!mark[n] && ok(nx, nz)) {
        mark[n] = 1;
        stack.push(n);
      }
    }
  }
}

// Down to tiles: water if at least half of it is, sea if most of that water is sea.
const waterTiles = new Uint8Array(W * H);
for (let tz = 0; tz < H; tz++) {
  for (let tx = 0; tx < W; tx++) {
    let wet = 0, salt = 0;
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const k = (tz * S + b) * FW + tx * S + a;
      if (fine[k] === WATER) {
        wet++;
        if (sea[k]) salt++;
      }
    }
    if (wet * 2 >= S * S) waterTiles[tz * W + tx] = salt * 2 > wet ? 2 : 1;
  }
}

// ---------------------------------------------------------------- main roads
const roads = osm.elements.filter((e) => e.type === "way" && e.geometry && RANKS.includes(e.tags?.highway));
const metres = (a, b) => Math.hypot((b.lat - a.lat) * 111_320, (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
const lengthOf = (g) => g.reduce((s, p, k) => (k ? s + metres(g[k - 1], p) : 0), 0);
const label = (t) => t.name ?? t.ref ?? "";

// A dual carriageway is two one-way roads side by side: keep just the one heading east or north,
// so it's one road (100 m tiles are wider than both together). A one-way road with no partner
// beside it is kept whatever way it goes.
const oneWay = (t) => t.oneway === "yes" || t.oneway === "1" || t.oneway === "-1";
const grid = new Map();
const cellOf = (p) => `${Math.round(p.lat * 1000)},${Math.round(p.lon * 1000)}`;
for (const e of roads) {
  if (!oneWay(e.tags) || e.tags.junction === "roundabout") continue;
  // Every 50 m or so along it, so a partner is found wherever its points happen to be.
  for (let j = 1; j < e.geometry.length; j++) {
    const a = e.geometry[j - 1], b = e.geometry[j];
    const n = Math.max(1, Math.ceil(metres(a, b) / 50));
    for (let s = 0; s <= n; s++) {
      const k = cellOf({ lat: a.lat + ((b.lat - a.lat) * s) / n, lon: a.lon + ((b.lon - a.lon) * s) / n });
      if (!grid.has(k)) grid.set(k, new Set());
      grid.get(k).add(e);
    }
  }
}
const heading = (g) => {
  const a = g[0], b = g[g.length - 1];
  return Math.atan2(b.lat - a.lat, (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180));
};
/** The point halfway along a road. */
function middle(g) {
  let left = lengthOf(g) / 2;
  for (let k = 1; k < g.length; k++) {
    const d = metres(g[k - 1], g[k]);
    if (d >= left && d > 0) return { lat: g[k - 1].lat + ((g[k].lat - g[k - 1].lat) * left) / d, lon: g[k - 1].lon + ((g[k].lon - g[k - 1].lon) * left) / d };
    left -= d;
  }
  return g[0];
}
function hasPartner(e) {
  const mid = middle(e.geometry);
  const h = heading(e.geometry);
  for (let dl = -1; dl <= 1; dl++) for (let dn = -1; dn <= 1; dn++) {
    const k = `${Math.round(mid.lat * 1000) + dl},${Math.round(mid.lon * 1000) + dn}`;
    for (const o of grid.get(k) ?? []) {
      if (o === e || o.tags.highway !== e.tags.highway || label(o.tags) !== label(e.tags)) continue;
      const turn = Math.abs(((heading(o.geometry) - h + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      if (turn > (3 * Math.PI) / 4) return true; // facing the other way
    }
  }
  return false;
}
const keep = (e) => {
  if (!oneWay(e.tags) || e.tags.junction === "roundabout" || !label(e.tags) || !hasPartner(e)) return true;
  const h = heading(e.geometry);
  return h > -Math.PI / 4 && h <= (3 * Math.PI) / 4;
};

const roadTiles = new Uint8Array(W * H); // rank 1-5, +8 on a bridge
const isBridge = (t) => t.bridge && t.bridge !== "no";
let kept = 0;
for (const e of roads) {
  if (!keep(e)) continue;
  kept++;
  const v = RANKS.indexOf(e.tags.highway) + 1 + (isBridge(e.tags) ? 8 : 0);
  const pts = e.geometry.map((g) => at(g.lat, g.lon));
  for (let k = 1; k < pts.length; k++) {
    line4(pts[k - 1].x, pts[k - 1].z, pts[k].x, pts[k].z, (x, z) => {
      if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return;
      const c = (z - B.z0) * W + (x - B.x0);
      const old = roadTiles[c];
      if (!old || (v & 7) > (old & 7) || (v > 8 && old < 8)) roadTiles[c] = v;
    });
  }
}

// The long bridges with their real curves (for drawing them smoothly later).
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let worst = 0, at2 = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1e-9;
    const d = Math.abs(dz * (p.x - a.x) - dx * (p.z - a.z)) / len;
    if (d > worst) [worst, at2] = [d, k];
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at2 + 1), tol).slice(0, -1), ...simplify(pts.slice(at2), tol)];
}
const routes = [];
for (const e of roads) {
  if (!isBridge(e.tags) || !keep(e) || lengthOf(e.geometry) < 300) continue;
  const pts = simplify(e.geometry.map((g) => ({ ...at(g.lat, g.lon), g })), 0.15).map((p) => [+p.g.lat.toFixed(5), +p.g.lon.toFixed(5)]);
  routes.push({ id: `osm-w${e.id}`, name: label(e.tags) || "Bridge", kind: e.tags.highway, bridge: true, path: pts });
}

// ---------------------------------------------------------------- landmarks
const pattern = (l) => l.osm ?? l.name.replace(/\s*[(,].*$/, "").replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
const wantedMarks = region.landmarks.filter((l) => l.approx);
const found = {};
const missed = [];
if (wantedMarks.length) {
  const marks = overpass(
    "landmarks",
    `[out:json][timeout:300];
(
${wantedMarks.map((l) => `  nwr(around:2500,${l.at.lat},${l.at.lon})["name"~"${pattern(l)}",i];`).join("\n")}
);
out center tags;`,
  );
  for (const l of wantedMarks) {
    const re = new RegExp(pattern(l), "i");
    let best = null;
    for (const e of marks.elements) {
      const p = e.type === "node" ? { lat: e.lat, lon: e.lon } : e.center;
      if (!p || !re.test(e.tags?.name ?? "")) continue;
      const d = metres(l.at, p);
      if (d <= 2500 && (!best || d < best.d)) best = { d, p };
    }
    if (best) found[l.id] = { lat: +best.p.lat.toFixed(5), lon: +best.p.lon.toFixed(5) };
    else missed.push(l.name);
  }
}

// ---------------------------------------------------------------- write it out
function rows(cells, letter, none) {
  const out = [];
  for (let z = 0; z < H; z++) {
    let s = "", run = 0, cur = null;
    for (let x = 0; x < W; x++) {
      const ch = letter(cells[z * W + x]);
      if (ch === cur) run++;
      else {
        if (cur !== null) s += cur + run;
        cur = ch;
        run = 1;
      }
    }
    if (cur !== none) s += cur + run;
    out.push(s);
  }
  return out;
}
const waterRows = rows(waterTiles, (v) => (v === 2 ? "S" : v === 1 ? "W" : "L"), "L");
const roadRows = rows(roadTiles, (v) => (v ? (v > 8 ? "abcde"[5 - (v & 7)] : "ABCDE"[5 - v]) : "N"), "N");
const grid2 = (r) => `{\n  x0: ${B.x0},\n  z0: ${B.z0},\n  rows: [\n${r.map((s) => `    ${JSON.stringify(s)},`).join("\n")}\n  ],\n}`;
const file = join(root, "src", "lib", "world", "regions", id, "baked.ts");
writeFileSync(
  file,
  `// Made by scripts/world/bake.mjs from OpenStreetMap data (© OpenStreetMap contributors, ODbL),
// ${new Date().toISOString().slice(0, 10)}. Don't edit by hand: put fixes in corrections.ts.

import type { LatLon } from "../../geo.ts";
import type { BakedGrid, Road } from "../../region.ts";

export const WATER: BakedGrid | null = ${grid2(waterRows)};

export const ROAD_GRID: BakedGrid | null = ${grid2(roadRows)};

export const ROUTES: Road[] = ${JSON.stringify(routes, null, 1)};

export const FOUND: Record<string, LatLon> = ${JSON.stringify(found, null, 1)};
`,
);

// ---------------------------------------------------------------- a quick look
const count = (arr, f) => arr.reduce((n, v) => n + (f(v) ? 1 : 0), 0);
console.log(`Wrote ${file}`);
console.log(`${W} × ${H} tiles: ${count(waterTiles, (v) => v === 1)} lagoon, ${count(waterTiles, (v) => v === 2)} sea, ${count(roadTiles, (v) => v > 0)} road (${kept} of ${roads.length} roads kept), ${routes.length} long bridges`);
console.log(`Landmarks found in the map: ${Object.keys(found).length} of ${wantedMarks.length}${missed.length ? `; not found: ${missed.join(", ")}` : ""}`);
const step = 3;
for (let z = 0; z < H; z += step * 2) {
  let line = "";
  for (let x = 0; x < W; x += step) {
    const c = z * W + x;
    line += roadTiles[c] > 8 ? "=" : roadTiles[c] ? "+" : waterTiles[c] === 2 ? "~" : waterTiles[c] === 1 ? "-" : ".";
  }
  console.log(line);
}
