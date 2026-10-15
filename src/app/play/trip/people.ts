// People in the trip film (docs/TRIPS.md): the 3D avatars that act out what happens on the road
// (an officer in black with a face cap and a rifle on his back, LASTMA in yellow, area boys in
// singlets, a woman in buba and wrapper with a baby tied on her back, hawkers with trays on their
// heads, a boy with a squeegee), walking and running where they're sent and then waving, talking,
// cheering or dancing; and the people out walking on the pavements as you pass.

import * as THREE from "three";
import { LOD } from "@/lib/avatar3d/lod";
import type { Recipe } from "@/lib/avatar3d/recipe";
import { createMyAvatar } from "../city/npc3d";
import { Kit } from "../city/kit";
import type { Route } from "./road-path";
import { PAVE_MID } from "./street";

export type Costume = "police" | "lastma" | "thug" | "woman" | "man" | "kid" | "schoolkid" | "mechanic" | "preacher" | "aunty" | "chief" | "escort" | "student" | "any";

/** Each costume as avatar parts (indexes into the avatar catalogue: src/lib/avatar3d/catalog.ts). */
function costumeOf(c: Costume, r: () => number): Partial<Recipe> {
  const any = (n: number) => Math.floor(r() * n);
  // Lagos people: brown to deep brown skin, dark hair (now and then grey or burgundy).
  const local = { skin: any(7), hairC: [0, 0, 0, 1, 2, 5, 6][any(7)] };
  const plain = { ...local, layer: 0, glasses: 0, chain: 0, outfit: 0 };
  switch (c) {
    case "police":
      return { ...plain, frame: 0, topStyle: 7, top: 5, bottomStyle: 1, bottom: 0, hw: 1, hwC: 5, shoeC: 0 };
    case "lastma":
      return { ...plain, frame: 0, topStyle: 7, top: 3, bottomStyle: 1, bottom: 5, hw: 1, hwC: 2 };
    case "thug":
      return { ...plain, frame: 0, topStyle: r() < 0.6 ? 5 : 1, top: any(13), bottomStyle: r() < 0.5 ? 3 : 2, bottom: any(6), hw: r() < 0.4 ? 1 : 0, hwC: any(13) };
    case "woman":
      return { ...plain, frame: 1, facial: 0, topStyle: 11, top: any(13), bottomStyle: 8, bottom: any(6), hw: 2, hwC: any(13) };
    case "aunty":
      return { ...plain, frame: 1, facial: 0, topStyle: 11, top: [3, 12, 7, 6][any(4)], bottomStyle: 8, bottom: 3, hw: 3, hwC: [3, 12, 7, 6][any(4)] };
    case "chief":
      return { ...plain, frame: 0, outfit: 4, topStyle: 0, bottomStyle: 0, top: [4, 3, 0][any(3)], hw: 5, hwC: [4, 3, 0][any(3)] };
    case "man":
      return { ...plain, frame: 0, topStyle: [1, 7, 8][any(3)], top: any(13), bottomStyle: [1, 2][any(2)], bottom: any(6), hw: 0 };
    case "mechanic":
      return { ...plain, frame: 0, topStyle: 1, top: 0, bottomStyle: 1, bottom: 1, hw: r() < 0.5 ? 1 : 0, hwC: 10 };
    case "preacher":
      return { ...plain, frame: 0, outfit: 10, topStyle: 0, bottomStyle: 0, top: 0, hw: 0 };
    case "escort":
      return { ...plain, frame: 0, topStyle: 1, top: 5, bottomStyle: 2, bottom: 0, glasses: 3, hw: 0 };
    case "student":
      return { ...plain, topStyle: [1, 8, 3][any(3)], top: any(13), bottomStyle: 2, bottom: 1, hw: 0 };
    case "schoolkid":
      return { ...plain, topStyle: 7, top: 4, bottomStyle: r() < 0.5 ? 3 : 6, bottom: 2, hw: 0 };
    default:
      return local;
  }
}

export type Prop = "tray" | "basin" | "baby" | "rifle" | "torch" | "stick" | "umbrella" | "squeegee" | "bucket" | "shovel" | "phone" | "backpack" | "bible" | "notebook";

/** A prop, in the avatar's own frame (metres, facing +z). */
function buildProp(k: Kit, p: Prop, night: boolean) {
  switch (p) {
    case "tray":
      k.cyl(0, 1.74, 0.02, 0.42, 0.34, 0.07, 0xdee2e6, 14);
      for (let i = 0; i < 9; i++) k.box(Math.cos(i * 0.7) * 0.22 * (i % 3 ? 1 : 0.4), 1.81, Math.sin(i * 0.7) * 0.22 * (i % 3 ? 1 : 0.4), 0.12, 0.13, 0.09, [0xfab005, 0xe03131, 0x74c0fc, 0xf8f9fa, 0x2f9e44][i % 5]);
      k.cyl(0, 1.7, 0.02, 0.12, 0.12, 0.05, 0xc92a2a, 10);
      break;
    case "basin":
      k.cyl(0, 1.74, 0, 0.42, 0.28, 0.2, 0xced4da, 16, { open: true });
      for (let i = 0; i < 6; i++) k.ball(Math.cos(i) * 0.18, 1.88, Math.sin(i) * 0.18, 0.1, [0xe03131, 0xe8590c, 0x2f9e44][i % 3]);
      break;
    case "baby":
      k.soft(0, 0.95, -0.2, 0.42, 0.42, 0.24, 0xf08c00, 0.1);
      k.ball(0, 1.42, -0.22, 0.1, 0x5c3a1e);
      break;
    case "rifle":
      k.box(0.12, 0.7, -0.2, 0.06, 0.95, 0.07, 0x1b1b1b, { rz: 0.5, noAo: true });
      break;
    case "torch":
      k.cyl(0.3, 1.05, 0.25, 0.04, 0.04, 0.22, 0x343a40, 8, { rx: Math.PI / 2 });
      if (night) k.ball(0.3, 1.05, 0.48, 0.06, 0xfff3bf, { layer: "glow", noAo: true });
      break;
    case "stick":
      k.box(0.3, 0.2, 0.2, 0.04, 1.4, 0.04, 0x6b4f3a, { rx: 0.25, noAo: true });
      break;
    case "umbrella":
      k.box(0.18, 1.1, 0.05, 0.03, 1.0, 0.03, 0x343a40, { noAo: true });
      k.cyl(0.18, 2.0, 0.05, 0.02, 0.75, 0.32, [0xe03131, 0x1971c2, 0x2f9e44][Math.floor(Math.random() * 3)], 12);
      break;
    case "squeegee":
      k.box(0.3, 0.9, 0.3, 0.03, 0.7, 0.03, 0x495057, { rx: -0.6, noAo: true });
      k.box(0.3, 1.35, 0.62, 0.3, 0.06, 0.05, 0x1971c2, { noAo: true });
      break;
    case "bucket":
      k.cyl(-0.32, 0.25, 0.05, 0.13, 0.1, 0.24, 0xfab005, 10);
      break;
    case "shovel":
      k.box(0.32, 0.25, 0.1, 0.04, 1.25, 0.04, 0x8d6e63, { noAo: true });
      k.box(0.32, 0.05, 0.1, 0.22, 0.28, 0.03, 0x868e96, { noAo: true });
      break;
    case "phone":
      k.box(0.12, 1.42, 0.3, 0.08, 0.15, 0.015, 0x111111, { noAo: true });
      break;
    case "backpack":
      k.soft(0, 0.95, -0.22, 0.36, 0.45, 0.2, 0x1864ab, 0.06);
      break;
    case "bible":
      k.box(0.18, 1.0, 0.24, 0.16, 0.22, 0.05, 0x111111, { noAo: true });
      break;
    case "notebook":
      k.box(-0.2, 1.0, 0.24, 0.14, 0.2, 0.03, 0xf8f9fa, { noAo: true });
      break;
  }
}

export type Actor = {
  root: THREE.Group;
  /** Send them somewhere (walking, or running when speed is high); then do `then`. */
  go(x: number, z: number, speed?: number, then?: string): void;
  /** What they do when standing (a move id), how fast, and who they face. */
  act(move: string, rate?: number): void;
  face(x: number, z: number): void;
  /** Sit (a seat this high). */
  sit(h: number): void;
  arrived(): boolean;
  update(dt: number): void;
  dispose(): void;
};

export function createActor(o: { costume: Costume; props?: Prop[]; seed: string; x: number; z: number; yaw?: number; scale?: number; night: boolean; mats: { solid: THREE.Material; glow: THREE.Material }; level?: number }): Actor {
  let s = 0;
  for (const ch of o.seed) s = (s * 31 + ch.charCodeAt(0)) | 0;
  const r = () => ((s = (Math.imul(s, 1103515245) + 12345) | 0) >>> 8) / 0x1000000;
  const av = createMyAvatar(null, o.level ?? LOD.near, o.seed, costumeOf(o.costume, r));
  const root = av.root;
  root.position.set(o.x, 0, o.z);
  root.rotation.y = o.yaw ?? 0;
  root.scale.setScalar(o.scale ?? 1);
  const own: (() => void)[] = [];
  if (o.props?.length) {
    const k = new Kit();
    for (const p of o.props) buildProp(k, p, o.night);
    const g = k.build({ solid: o.mats.solid, glow: o.mats.glow });
    g.traverse((m) => {
      if (m instanceof THREE.Mesh) {
        m.castShadow = true;
        own.push(() => m.geometry.dispose());
      }
    });
    root.add(g);
  }
  const goals: { x: number; z: number; speed: number; then?: string }[] = [];
  let move = "idle";
  let rate = 1;
  let seat = 0.45;
  let faceAt: { x: number; z: number } | null = null;
  let moving = false;
  const turnTo = (yaw: number, dt: number) => {
    let d = yaw - root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    root.rotation.y += d * Math.min(1, dt * 8);
  };
  return {
    root,
    go(x, z, speed = 1.4, then) {
      goals.push({ x, z, speed, then });
    },
    act(m, rr = 1) {
      move = m;
      rate = rr;
    },
    face(x, z) {
      faceAt = { x, z };
    },
    sit(h) {
      seat = h;
      move = "sit";
    },
    arrived: () => goals.length === 0,
    update(dt) {
      const g = goals[0];
      moving = false;
      if (g) {
        const dx = g.x - root.position.x;
        const dz = g.z - root.position.z;
        const d = Math.hypot(dx, dz);
        const step = g.speed * dt;
        if (d <= step || d < 0.05) {
          root.position.x = g.x;
          root.position.z = g.z;
          goals.shift();
          if (g.then) move = g.then;
        } else {
          root.position.x += (dx / d) * step;
          root.position.z += (dz / d) * step;
          turnTo(Math.atan2(dx, dz), dt);
          moving = true;
        }
      }
      if (!moving && faceAt) turnTo(Math.atan2(faceAt.x - root.position.x, faceAt.z - root.position.z), dt);
      const doing = moving ? (g!.speed > 2.4 ? "run" : "walk") : move;
      av.update(dt, doing, seat, moving ? Math.max(0.8, Math.min(1.6, g!.speed / (g!.speed > 2.4 ? 3.6 : 1.35))) : rate);
    },
    dispose() {
      for (const d of own) d();
      av.dispose();
    },
  };
}

/**
 * People out walking on both pavements near you (both ways), light avatars; as you pass them,
 * the ones left behind come round again further ahead.
 */
export function createWalkers(scene: THREE.Scene, route: Route, o: { count: number; night: boolean; mats: { solid: THREE.Material; glow: THREE.Material } }) {
  const list: { a: Actor; s: number; side: number; dir: number; speed: number; lat: number }[] = [];
  for (let i = 0; i < o.count; i++) {
    const side = i % 2 ? 1 : -1;
    const kinds: Costume[] = ["any", "any", "woman", "man", "student", "any", "woman", "schoolkid"];
    const c = kinds[i % kinds.length];
    const props: Prop[] = c === "woman" && i % 3 === 0 ? ["tray"] : c === "student" ? ["backpack"] : c === "any" && i % 4 === 1 ? ["phone"] : [];
    const a = createActor({ costume: c, props, seed: `walker-${i}`, x: 0, z: 0, night: o.night, mats: o.mats, level: LOD.far, scale: c === "schoolkid" ? 0.66 : 1 });
    scene.add(a.root);
    list.push({ a, s: 0, side, dir: i % 3 ? 1 : -1, speed: 1.1 + (i % 5) * 0.12, lat: side * (PAVE_MID + ((i % 3) - 1) * 0.8) });
  }
  let placed = false;
  return {
    /** focusS: where you are along the road (people stay round there). */
    update(dt: number, focusS: number) {
      list.forEach((w, i) => {
        if (!placed) w.s = focusS - 20 + (i / list.length) * 90;
        if (w.s < focusS - 30) w.s += 95 + (i % 4) * 4;
        if (w.s > focusS + 75) w.s -= 95;
        w.s += w.dir * w.speed * dt;
        const p = route.place(w.s, w.lat);
        w.a.root.position.set(p.x, 0.16, p.z);
        w.a.root.rotation.y = Math.atan2(Math.cos(p.yaw) * w.dir, -Math.sin(p.yaw) * w.dir);
        w.a.act("walk", w.speed / 1.3);
        w.a.update(dt);
      });
      placed = true;
    },
    dispose() {
      for (const w of list) w.a.dispose();
    },
  };
}
