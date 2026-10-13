// A home plan built in 3D (src/lib/home-plan.ts): each floor stacked on the one below, its rooms'
// floors in their colours, walls round every room (with a doorway in each) and round the
// outside, and the furniture where it was placed. Walls are kept low ("dollhouse" height) so you
// can see into the rooms from above; the floors above the one you're working on are left off.
// Plain shapes and one material per colour, so it's quick to build on any phone.

import * as THREE from "three";
import { CELL_M, FURNITURE, ROOM_FLOOR, SIZES, itemSize, planWalls, type HomePlan, type PlanItem } from "@/lib/home-plan";

/** One storey, in metres. */
export const STOREY_M = 2.8;
const WALL_T = 0.1;

/** An inner wall piece (metres, the home's middle at 0, 0). */
export type WallPiece = { x: number; z: number; len: number; along: boolean };

/**
 * Build the home. `only`: just that one floor, standing at ground level, with full-height walls
 * (for walking round inside it); its inner wall pieces are listed in `walls`.
 */
export function buildHome(plan: HomePlan, upTo: number, wallH = 1.3, only = false): { group: THREE.Group; walls: WallPiece[]; dispose: () => void } {
  const walls: WallPiece[] = [];
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.Material>();
  const mat = (c: string) => {
    let m = mats.get(c);
    if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
    return m;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, colour: string, parent: THREE.Object3D) => {
    const g = new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d));
    geos.push(g);
    const m = new THREE.Mesh(g, mat(colour));
    m.position.set(x, y, z);
    m.castShadow = h > 0.05;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const { w, d } = SIZES[plan.size];
  const W = w * CELL_M;
  const D = d * CELL_M;
  // Plan squares to metres, with the home's middle at the origin.
  const mx = (x: number) => x * CELL_M - W / 2;
  const mz = (y: number) => y * CELL_M - D / 2;

  plan.floors.slice(0, upTo + 1).forEach((floor, level) => {
    if (only && level !== upTo) return;
    const storey = new THREE.Group();
    storey.position.y = only ? 0 : level * STOREY_M;
    group.add(storey);
    // The slab, then each room's floor on it.
    box(W + WALL_T * 2, 0.12, D + WALL_T * 2, 0, -0.06, 0, level === 0 ? "#bfb6a8" : "#d6cfc4", storey);
    for (const r of floor.rooms) box(r.w * CELL_M - 0.02, 0.02, r.d * CELL_M - 0.02, mx(r.x + r.w / 2), 0.01, mz(r.y + r.d / 2), ROOM_FLOOR[r.kind], storey);
    // The outside walls (full height on the floors below the one you're on).
    const h = level < upTo ? STOREY_M - 0.12 : wallH;
    const outer = "#f1e6d3";
    box(W + WALL_T * 2, h, WALL_T, 0, h / 2, -D / 2 - WALL_T / 2, outer, storey);
    box(W + WALL_T * 2, h, WALL_T, 0, h / 2, D / 2 + WALL_T / 2, outer, storey);
    box(WALL_T, h, D, -W / 2 - WALL_T / 2, h / 2, 0, outer, storey);
    box(WALL_T, h, D, W / 2 + WALL_T / 2, h / 2, 0, outer, storey);
    // Inside walls, with a doorway wherever two rooms meet (the same as walking round it).
    for (const wl of planWalls(floor, plan.size).walls) {
      const along = wl.y0 === wl.y1;
      const len = (along ? wl.x1 - wl.x0 : wl.y1 - wl.y0) * CELL_M;
      const x = mx((wl.x0 + wl.x1) / 2), z = mz((wl.y0 + wl.y1) / 2);
      walls.push({ x, z, len, along });
      box(along ? len + WALL_T : WALL_T, h, along ? WALL_T : len + WALL_T, x, h / 2, z, "#faf6ee", storey);
    }
    for (const it of floor.items) storey.add(piece(it, mx, mz, box));
  });
  return {
    group,
    walls,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

type Box = (w: number, h: number, d: number, x: number, y: number, z: number, colour: string, parent: THREE.Object3D) => THREE.Mesh;

/** One piece of furniture, in plain shapes, turned the way it was placed. */
function piece(it: PlanItem, mx: (x: number) => number, mz: (y: number) => number, box: Box): THREE.Object3D {
  const f = FURNITURE[it.kind];
  const s = itemSize(it);
  const g = new THREE.Group();
  g.position.set(mx(it.x + s.w / 2), 0, mz(it.y + s.d / 2));
  g.rotation.y = (-it.rot * Math.PI) / 2;
  // Built facing "forward" (unturned width × depth), then turned.
  const w = f.w * CELL_M - 0.06;
  const d = f.d * CELL_M - 0.06;
  const c = f.colour;
  switch (it.kind) {
    case "bed":
    case "single":
      box(w, 0.35, d, 0, 0.175, 0, c, g);
      box(w - 0.06, 0.12, d - 0.1, 0, 0.41, 0.03, "#f8f9fa", g);
      box(w, 0.6, 0.08, 0, 0.3, -d / 2 + 0.04, c, g);
      box(w * 0.7, 0.08, 0.3, 0, 0.5, -d / 2 + 0.3, "#e7f5ff", g);
      break;
    case "sofa":
    case "armchair":
      box(w, 0.4, d, 0, 0.2, 0, c, g);
      box(w, 0.45, 0.2, 0, 0.6, -d / 2 + 0.1, c, g);
      box(0.15, 0.25, d, -w / 2 + 0.075, 0.52, 0, c, g);
      box(0.15, 0.25, d, w / 2 - 0.075, 0.52, 0, c, g);
      break;
    case "table":
    case "desk":
      box(w, 0.05, d, 0, f.h, 0, c, g);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.06, f.h, 0.06, sx * (w / 2 - 0.06), f.h / 2, sz * (d / 2 - 0.06), c, g);
      break;
    case "chair":
      box(w * 0.8, 0.05, d * 0.8, 0, 0.45, 0, c, g);
      box(w * 0.8, 0.45, 0.05, 0, 0.7, -d * 0.4, c, g);
      box(0.05, 0.45, 0.05, 0, 0.225, 0, c, g);
      break;
    case "tv":
      box(w * 0.6, 0.45, d * 0.8, 0, 0.225, 0, "#495057", g);
      box(w, 0.6, 0.05, 0, 0.8, 0, c, g);
      break;
    case "rug":
      box(w, 0.015, d, 0, 0.03, 0, c, g);
      break;
    case "plant": {
      box(0.25, 0.3, 0.25, 0, 0.15, 0, "#a0522d", g);
      const leaves = box(0.45, 0.7, 0.45, 0, 0.7, 0, c, g);
      leaves.rotation.y = Math.PI / 4;
      break;
    }
    case "lamp":
      box(0.06, f.h, 0.06, 0, f.h / 2, 0, "#495057", g);
      box(0.32, 0.25, 0.32, 0, f.h, 0, c, g);
      break;
    case "fan":
      box(0.05, f.h, 0.05, 0, f.h / 2, 0, "#495057", g);
      box(0.45, 0.45, 0.1, 0, f.h, 0, c, g);
      break;
    case "stairs":
      for (let i = 0; i < 8; i++) box(w, (f.h / 8) * (i + 1), d / 8, 0, ((f.h / 8) * (i + 1)) / 2, d / 2 - (d / 8) * (i + 0.5), c, g);
      break;
    case "art":
    case "mirror":
      // Hung on the wall behind.
      box(w * 0.75, 0.7, 0.04, 0, 1.5, -d / 2 + 0.03, c, g);
      break;
    case "clock":
      box(0.32, 0.32, 0.04, 0, 1.9, -d / 2 + 0.03, c, g);
      break;
    case "coffee":
      box(w - 0.2, 0.05, d - 0.3, 0, f.h, 0, c, g);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.05, f.h, 0.05, sx * (w / 2 - 0.15), f.h / 2, sz * (d / 2 - 0.2), c, g);
      break;
    // The special rooms.
    case "dancefloor": {
      // Coloured tiles, half a metre each.
      const cols = ["#ff4fd8", "#22d3ee", "#a3e635", "#ffd43b", "#7c3aed", "#ff6b6b"];
      const n = Math.round(f.w * CELL_M / 0.5);
      const t = (w + 0.06) / n;
      box(w, 0.03, d, 0, 0.015, 0, "#1b1b1b", g);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) box(t - 0.04, 0.02, t - 0.04, -w / 2 + t * (i + 0.5) - 0.03, 0.04, -d / 2 + t * (j + 0.5) - 0.03, cols[(i + j) % cols.length], g);
      break;
    }
    case "djbooth":
      box(w, 0.9, d * 0.7, 0, 0.45, d * 0.15, c, g);
      box(w * 0.9, 0.04, d * 0.6, 0, 0.92, d * 0.15, "#111111", g);
      for (const sx of [-1, 1]) box(0.36, 0.03, 0.36, sx * w * 0.22, 0.95, d * 0.15, "#495057", g);
      box(w * 0.9, 0.12, 0.03, 0, 0.6, d / 2, "#ff4fd8", g);
      break;
    case "speaker":
      box(w, f.h, d, 0, f.h / 2, 0, c, g);
      for (const y of [0.45, 1.05]) box(w * 0.6, w * 0.6, 0.02, 0, y, d / 2, "#495057", g);
      break;
    case "discoball":
      box(0.02, 0.4, 0.02, 0, f.h + 0.2, 0, "#495057", g);
      box(0.32, 0.32, 0.32, 0, f.h, 0, c, g).rotation.set(Math.PI / 4, Math.PI / 4, 0);
      break;
    case "partylight":
      box(0.05, f.h, 0.05, 0, f.h / 2, 0, "#343a40", g);
      box(0.4, 0.06, 0.06, 0, f.h, 0, "#343a40", g);
      ["#ff4fd8", "#22d3ee", "#ffd43b"].forEach((col, i) => box(0.1, 0.1, 0.12, (i - 1) * 0.14, f.h - 0.08, 0.04, col, g));
      break;
    case "screen":
      box(w, 1.3, 0.04, 0, 1.5, -d / 2 + 0.03, "#111316", g);
      box(w - 0.12, 1.18, 0.02, 0, 1.5, -d / 2 + 0.06, "#4dabf7", g);
      break;
    case "recliner":
      box(w, 0.45, d, 0, 0.225, 0, c, g);
      box(w, 0.6, 0.2, 0, 0.75, -d / 2 + 0.1, c, g);
      box(0.12, 0.2, d, -w / 2 + 0.06, 0.55, 0, "#7a1d1d", g);
      box(0.12, 0.2, d, w / 2 - 0.06, 0.55, 0, "#7a1d1d", g);
      break;
    case "popcorn":
      box(0.35, 0.8, 0.35, 0, 0.4, 0, "#c92a2a", g);
      box(0.4, 0.45, 0.4, 0, 1.05, 0, "#fff3bf", g);
      box(0.42, 0.06, 0.42, 0, 1.3, 0, c, g);
      break;
    case "treadmill":
      box(w * 0.8, 0.15, d, 0, 0.075, 0, "#212529", g);
      box(w * 0.65, 0.02, d * 0.85, 0, 0.16, 0.05, c, g);
      for (const sx of [-1, 1]) box(0.05, 1.2, 0.05, sx * w * 0.36, 0.6, -d / 2 + 0.15, "#adb5bd", g);
      box(w * 0.8, 0.25, 0.08, 0, 1.25, -d / 2 + 0.15, "#212529", g);
      break;
    case "bike":
      box(0.12, 0.08, d * 0.8, 0, 0.04, 0, "#343a40", g);
      box(0.06, 0.8, 0.06, 0, 0.4, d * 0.15, c, g);
      box(0.25, 0.06, 0.3, 0, 0.82, d * 0.15, "#212529", g);
      box(0.06, 1.0, 0.06, 0, 0.5, -d * 0.3, c, g);
      box(0.4, 0.04, 0.04, 0, 1.0, -d * 0.3, "#212529", g);
      box(0.06, 0.3, 0.3, 0, 0.3, 0, "#495057", g);
      break;
    case "weights":
      box(0.35, 0.45, d * 0.8, 0, 0.225, 0.1, c, g);
      for (const sx of [-1, 1]) box(0.05, 1.0, 0.05, sx * 0.45, 0.5, -d / 2 + 0.2, "#adb5bd", g);
      box(w, 0.03, 0.03, 0, 1.0, -d / 2 + 0.2, "#adb5bd", g);
      for (const sx of [-1, 1]) box(0.06, 0.4, 0.4, sx * (w / 2 - 0.15), 1.0, -d / 2 + 0.2, "#212529", g);
      break;
    case "dumbbells":
      box(w, 0.6, d * 0.8, 0, 0.3, 0, c, g);
      for (let i = 0; i < 5; i++) box(0.2, 0.1, 0.12, -w / 2 + 0.15 + i * (w - 0.3) / 4, 0.68, 0, i % 2 ? "#495057" : "#e8590c", g);
      break;
    case "gymmat":
      box(w, 0.02, d, 0, 0.01, 0, c, g);
      break;
    case "pooltable":
      box(w, 0.7, d, 0, 0.35, 0, "#6d4c41", g);
      box(w - 0.2, 0.03, d - 0.2, 0, 0.72, 0, c, g);
      break;
    case "arcade":
      box(w * 0.7, f.h, d * 0.7, 0, f.h / 2, 0, c, g);
      box(w * 0.55, 0.4, 0.02, 0, 1.35, d * 0.35, "#22d3ee", g);
      break;
    case "dartboard":
      box(0.45, 0.45, 0.04, 0, 1.7, -d / 2 + 0.03, "#212529", g);
      box(0.3, 0.3, 0.02, 0, 1.7, -d / 2 + 0.06, "#2f9e44", g);
      box(0.1, 0.1, 0.02, 0, 1.7, -d / 2 + 0.075, c, g);
      break;
    case "homebar":
      box(w, 1.05, d * 0.45, 0, 0.525, d * 0.25, c, g);
      box(w + 0.05, 0.05, d * 0.5, 0, 1.08, d * 0.25, "#212529", g);
      box(w, 1.6, 0.25, 0, 0.8, -d / 2 + 0.13, "#3b2a20", g);
      for (let b = 0; b < 6; b++) box(0.08, 0.25, 0.08, -w / 2 + 0.25 + b * ((w - 0.5) / 5), 1.73, -d / 2 + 0.13, ["#2f9e44", "#e8c07d", "#7a2e3a"][b % 3], g);
      break;
    case "barstool":
      box(0.05, 0.7, 0.05, 0, 0.35, 0, "#495057", g);
      box(0.35, 0.06, 0.35, 0, 0.72, 0, c, g);
      break;
    case "jukebox":
      box(w * 0.85, f.h, d * 0.9, 0, f.h / 2, 0, c, g);
      box(w * 0.55, 0.35, 0.02, 0, 0.9, d * 0.46, "#ffd43b", g);
      break;
    default:
      box(w, f.h, d, 0, f.h / 2, 0, c, g);
  }
  return g;
}
