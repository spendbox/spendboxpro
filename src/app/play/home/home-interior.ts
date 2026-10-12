// Inside a planned home (docs/HOME_PLANNER.md): the home's plan built at full size, one floor at
// a time, as a room you walk round like any other place's (src/app/play/city/interiors.ts). Its
// walls and furniture are in the way (doorways are left open), sofas, chairs and beds are seats,
// and the stairs take you up or down a floor.

import * as THREE from "three";
import type { Spot } from "../city/figures";
import type { Block } from "../city/interact";
import type { Interior, RoomItem, View } from "../city/interiors";
import { CELL_M, FURNITURE, ROOM_LABEL, SIZES, itemSize, type HomePlan } from "@/lib/home-plan";
import { buildHome } from "./home3d";

const WALL_H = 2.7;
const SEATS = new Set(["sofa", "armchair", "chair", "bed", "single"]);

export type HomeInterior = Interior & {
  /** Which floor of the plan this is, and how many there are. */
  level: number;
  floors: number;
};

export function createHomeInterior(plan: HomePlan, level: number): HomeInterior {
  const lv = Math.max(0, Math.min(plan.floors.length - 1, level));
  const floor = plan.floors[lv];
  const { w, d } = SIZES[plan.size];
  const W = w * CELL_M;
  const D = d * CELL_M;
  const mx = (x: number) => x * CELL_M - W / 2;
  const mz = (y: number) => y * CELL_M - D / 2;

  const built = buildHome(plan, lv, WALL_H, true);
  const group = new THREE.Group();
  group.add(built.group);
  // A ceiling, and the light of a home: soft all round, a warm lamp in every room.
  const ceilGeo = new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2);
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0xfbf7ef, side: THREE.DoubleSide });
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.position.y = WALL_H;
  group.add(ceiling);
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0xd8cdbf, 1.35);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1e0, 0.9);
  sun.position.set(W * 0.3, WALL_H * 3, D * 0.6);
  group.add(sun);
  const lamps: THREE.PointLight[] = [];
  for (const r of floor.rooms) {
    const l = new THREE.PointLight(0xffc98a, 0, Math.max(r.w, r.d) * CELL_M * 1.2, 1.6);
    l.position.set(mx(r.x + r.w / 2), WALL_H - 0.3, mz(r.y + r.d / 2));
    group.add(l);
    lamps.push(l);
  }

  // In the way: inner walls (thick enough for the walking grid to see) and furniture.
  const blocks: Block[] = built.walls.map((p) => ({ x: p.x, z: p.z, w: p.along ? p.len : 0.3, d: p.along ? 0.3 : p.len, ry: 0 }));
  const seats: Spot[] = [];
  const items: RoomItem[] = [];
  for (const it of floor.items) {
    const s = itemSize(it);
    const cx = mx(it.x + s.w / 2);
    const cz = mz(it.y + s.d / 2);
    if (it.kind === "stairs") {
      // Up from every floor but the top one; down from every floor but the ground.
      if (lv < plan.floors.length - 1) items.push({ kind: "stairs", label: "Go upstairs", x: cx, y: 1, z: cz, r: 0.7 });
      continue;
    }
    if (it.kind !== "rug") blocks.push({ x: cx, z: cz, w: s.w * CELL_M - 0.1, d: s.d * CELL_M - 0.1, ry: 0 });
    if (SEATS.has(it.kind)) {
      // Facing out of the seat (the back is behind you): unturned, that's towards -z.
      const ry = Math.PI - (it.rot * Math.PI) / 2;
      const per = it.kind === "sofa" ? 2 : 1;
      const f = FURNITURE[it.kind];
      for (let k = 0; k < per; k++) {
        const along = per === 1 ? 0 : (k - 0.5) * f.w * CELL_M * 0.5;
        // Along the seat's width, turned with it.
        const ax = Math.cos(-(it.rot * Math.PI) / 2) * along;
        const az = -Math.sin(-(it.rot * Math.PI) / 2) * along;
        seats.push({ x: cx + ax + Math.sin(ry) * 0.05, z: cz + az + Math.cos(ry) * 0.05, ry, pose: "sit", y: it.kind === "bed" || it.kind === "single" ? 0.5 : 0.45 });
      }
    }
  }
  // The way back down: where the stairs from the floor below come up.
  if (lv > 0) {
    const below = plan.floors[lv - 1].items.find((i) => i.kind === "stairs");
    const s = below ? itemSize(below) : { w: 2, d: 2 };
    const x = below ? mx(below.x + s.w / 2) : mx(1);
    const z = below ? mz(below.y + s.d / 2) : mz(1);
    items.push({ kind: "stairs", label: "Go downstairs", x, y: 0.4, z, r: 0.7 });
  }

  // Where the camera can stand: the front door (the bottom of the plan), then the middle of each room.
  const views: View[] = [{ x: 0, z: D / 2 - 0.6, yaw: 0, pitch: -0.12 }];
  for (const r of floor.rooms) views.push({ x: mx(r.x + r.w / 2), z: mz(r.y + r.d / 2) + Math.min(1, (r.d * CELL_M) / 3), yaw: 0, pitch: -0.15 });
  // Standing spots (for visitors and anyone not sitting): the middle of each room.
  const spots: Spot[] = floor.rooms.map((r) => ({ x: mx(r.x + r.w / 2), z: mz(r.y + r.d / 2), ry: 0, pose: "stand" as Spot["pose"] }));

  let alpha = 1;
  return {
    group,
    views,
    spots,
    seats,
    items,
    blocks,
    w: W,
    d: D,
    level: lv,
    floors: plan.floors.length,
    setNight(n: number) {
      for (const l of lamps) l.intensity = 1.2 * n;
      hemi.intensity = 1.35 - 0.5 * n;
    },
    setAlpha(a: number) {
      if (a === alpha) return;
      alpha = a;
      group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (!m) return;
        m.transparent = a < 1;
        m.opacity = a;
      });
    },
    update() {},
    dispose() {
      built.dispose();
      ceilGeo.dispose();
      ceilMat.dispose();
    },
  };
}

/** A room's name at a spot on the floor (for "You're in the kitchen"). */
export function roomNameAt(plan: HomePlan, level: number, x: number, z: number): string | null {
  const { w, d } = SIZES[plan.size];
  const cx = Math.floor((x + (w * CELL_M) / 2) / CELL_M);
  const cy = Math.floor((z + (d * CELL_M) / 2) / CELL_M);
  const f = plan.floors[level];
  if (!f) return null;
  for (let i = f.rooms.length - 1; i >= 0; i--) {
    const r = f.rooms[i];
    if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.d) return ROOM_LABEL[r.kind];
  }
  return null;
}
