// People in places: the regulars (NPCs) and other players sitting in seats, inside buildings,
// on rooftops, in parks and on rides. Soft, rounded figures (about 1.7 m tall) dressed for what
// they do (chefs in whites, guards in caps, DJs in headphones...), with their own face from
// their avatar on the front of the head, and a name tag (NPCs carry a little "NPC" chip). They
// breathe, look round, talk with their hands, sip drinks, eat, type, and dance in clubs.
// Built in metres; outdoors they're scaled down with the city by the caller.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { AvatarFace } from "@/components/avatar";
import { HAIR_COLOR, SKIN, TOP_COLOR, type Avatar } from "@/lib/avatar";
import type { Npc } from "@/lib/npcs";
import { Kit, mixHex, rngFrom, shadeHex, type Rng } from "./kit";

export type Pose = "stand" | "sit" | "lean";
/** What someone is doing there (how they move). */
export type Act = "talk" | "sip" | "dance" | "eat" | "work" | "dj" | "cook" | "idle" | "wave";
/** Where someone can be: a place on the floor (x, z), which way they face, standing or sitting. */
export type Spot = {
  x: number;
  z: number;
  ry: number;
  pose: Pose;
  /** Seat height when sitting, floor height otherwise. */
  y?: number;
  /** What people there do (default: chat). */
  act?: Act;
  /** The floor under a seat when it isn't at y = 0 (the top deck of a bus...). */
  floor?: number;
};

/** Someone to draw: a regular (NPC) or a player sitting in a seat. */
export type Person = { id: string; name: string; avatar: Avatar; role?: string; npc: boolean; /** Players: the seat they're in. */ seat?: string };

const TROUSERS = [0x2b3240, 0x3b4a5c, 0x4a3b30, 0x5b6370, 0x1f2a36, 0x6b5a48, 0xd8cbb5, 0x2f3e46];
const SHOES = [0x1f1f1f, 0x3b2a20, 0xf1f3f5, 0x5c4033, 0x8a2b2b];
const DRESSES = [0xc8553d, 0x2f6d6a, 0x7048e8, 0xe64980, 0xe3b04b, 0x1c3faa, 0x2f9e44];

type Outfit = {
  top: number;
  trousers: number;
  shoes: number;
  skirt?: number;
  jacket?: number;
  tie?: number;
  apron?: number;
  vest?: number;
  hat?: "chef" | "cap" | "beanie" | "sun" | "captain";
  hatColor?: number;
  headphones?: boolean;
  lanyard?: boolean;
  camera?: boolean;
};

function outfitFor(role: string | undefined, top: number, rnd: Rng, long: boolean): Outfit {
  const o: Outfit = { top, trousers: TROUSERS[Math.floor(rnd() * TROUSERS.length)], shoes: SHOES[Math.floor(rnd() * SHOES.length)] };
  if (long && rnd() < 0.45) o.skirt = rnd() < 0.5 ? top : DRESSES[Math.floor(rnd() * DRESSES.length)];
  const r = (role ?? "").toLowerCase();
  if (r.includes("chef")) Object.assign(o, { top: 0xf8f9fa, hat: "chef", apron: 0xf1f3f5, trousers: 0x2b2b2b, skirt: undefined });
  else if (r.includes("security") || r.includes("guard")) Object.assign(o, { top: 0x1f2a44, trousers: 0x1f2a44, hat: "cap", hatColor: 0x1f2a44, skirt: undefined });
  else if (r.includes("courier")) Object.assign(o, { vest: 0xd9f99d, hat: "cap", hatColor: 0xe03131 });
  else if (r.includes("cleaner")) Object.assign(o, { apron: 0x4dabf7, top: 0x74c0fc });
  else if (r.includes("café") || r.includes("cafe") || r.includes("vendor")) Object.assign(o, { apron: mixHex(top, 0x5c4033, 0.6) });
  else if (r.includes("accountant") || r.includes("manager")) Object.assign(o, { jacket: rnd() < 0.5 ? 0x2b3240 : 0x3b3b3b, tie: [0xc92a2a, 0x1c3faa, 0x2f9e44, 0xe3b04b][Math.floor(rnd() * 4)], top: 0xf1f3f5, trousers: 0x2b3240 });
  else if (r.includes("receptionist")) Object.assign(o, { jacket: mixHex(top, 0x1f1f1f, 0.35), lanyard: true });
  else if (r.includes("office") || r.includes("intern")) Object.assign(o, { lanyard: true, tie: rnd() < 0.3 ? 0x1c3faa : undefined });
  else if (r.includes("dj")) Object.assign(o, { headphones: true, top: 0x18202b });
  else if (r.includes("photographer") || r.includes("tourist")) Object.assign(o, { camera: true, hat: r.includes("tourist") ? "sun" : "beanie", hatColor: r.includes("tourist") ? 0xe9d8a6 : 0x343a40 });
  else if (r.includes("gardener")) Object.assign(o, { hat: "sun", hatColor: 0xd9c48f, apron: 0x2f9e44 });
  else if (r.includes("captain")) Object.assign(o, { hat: "captain", hatColor: 0x1f2a44, jacket: 0x1f2a44 });
  else if (r.includes("stargazer") || r.includes("pigeon")) Object.assign(o, { hat: "beanie", hatColor: [0xc92a2a, 0x343a40, 0x2f9e44][Math.floor(rnd() * 3)] });
  else if (r.includes("birdwatcher")) Object.assign(o, { hat: "sun", hatColor: 0x6b7a4b, camera: true });
  else if (r.includes("jogger")) Object.assign(o, { trousers: 0x1f1f1f, shoes: 0xf1f3f5, skirt: undefined });
  else if (r.includes("painter")) Object.assign(o, { apron: 0xf1efe8, hat: "beanie", hatColor: 0x7a2e3a });
  else if (r.includes("designer")) Object.assign(o, { top: 0x1f1f1f });
  return o;
}

/** Which simple 3D hairstyle goes with the avatar's hairstyle. */
function hairStyle(i: number) {
  // 0 Buzz, 1 Short, 2 Curly, 3 Afro, 4 Long, 5 Bun, 6 Braids, 7 Mohawk, 8 Side part, 9 Bald, 10 Locs, 11 Bob
  return (["buzz", "cap", "curly", "afro", "long", "bun", "braids", "mohawk", "cap", "bald", "locs", "bob"] as const)[i] ?? "cap";
}

// ---------------------------------------------------------------- name tags

function nameTag(name: string, npc: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 80;
  const c = canvas.getContext("2d")!;
  const font = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  c.font = `700 30px ${font}`;
  const tw = Math.min(200, c.measureText(name).width);
  const chip = npc ? 58 : 0;
  const w = Math.min(312, tw + 40 + chip);
  const x0 = (320 - w) / 2;
  c.fillStyle = npc ? "rgba(16,22,34,0.74)" : "rgba(11,114,133,0.88)";
  c.beginPath();
  c.roundRect(x0, 12, w, 54, 27);
  c.fill();
  c.fillStyle = "#ffffff";
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.fillText(name, x0 + 20, 40, 200);
  if (npc) {
    // The "NPC" chip: a regular, not a real player.
    const cx = x0 + w - chip - 6;
    c.fillStyle = "#ffd43b";
    c.beginPath();
    c.roundRect(cx, 23, chip - 4, 32, 10);
    c.fill();
    c.fillStyle = "#1b1b1b";
    c.font = `800 19px ${font}`;
    c.textAlign = "center";
    c.fillText("NPC", cx + (chip - 4) / 2, 40);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- faces

/** A sheet of faces (4 × 4 of 128 px), drawn from each person's avatar portrait. */
function faceAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let alive = true;
  /** Paint avatar a into cell k (async: the portrait is an SVG picture). */
  function draw(a: Avatar, k: number) {
    const cx = (k % 4) * 128;
    const cy = Math.floor(k / 4) * 128;
    const svg = renderToStaticMarkup(createElement(AvatarFace, { avatar: a, size: 240 }));
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      // The face (the head in the portrait spans x 34..86, y 25..83 of 120).
      const s = 240 / 120;
      c.save();
      c.beginPath();
      c.rect(cx, cy, 128, 128);
      c.clip();
      c.clearRect(cx, cy, 128, 128);
      c.drawImage(img, 30 * s, 26 * s, 60 * s, 60 * s, cx, cy, 128, 128);
      // Keep only the face (soft-edged oval).
      c.globalCompositeOperation = "destination-in";
      c.translate(cx + 64, cy + 60);
      c.scale(1, 58 / 52);
      const g = c.createRadialGradient(0, 0, 40, 0, 0, 54);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(-64, -64, 128, 128);
      c.restore();
      tex.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return {
    tex,
    draw,
    uv: (k: number) => ({ u0: (k % 4) / 4, v0: 1 - (Math.floor(k / 4) + 1) / 4, du: 1 / 4, dv: 1 / 4 }),
    dispose() {
      alive = false;
      tex.dispose();
    },
  };
}

/** The face patch on the front of a head (a piece of a sphere), mapped to one atlas cell. */
function facePatch(r: number, cell: { u0: number; v0: number; du: number; dv: number }) {
  const g = new THREE.SphereGeometry(r, 14, 10, Math.PI / 2 - 0.95, 1.9, 0.62, 1.66);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.u0 + uv.getX(k) * cell.du, cell.v0 + uv.getY(k) * cell.dv);
  return g;
}

// ---------------------------------------------------------------- figures

type Fig = {
  id: string;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  prop: THREE.Object3D | null;
  pose: Pose;
  act: Act;
  phase: number;
  look: number;
  baseY: number;
  scale: number;
  tag: THREE.Sprite | null;
};

export type FigureOpts = {
  /** Name tags (default true). */
  tags?: boolean;
  /** Seed text, so the same person dresses the same way. */
  key?: string;
  /** What people do when their spot doesn't say (a club: "dance"). */
  act?: Act;
};

/** Regulars (from npcsFor) or players, each in their spot (spots[n], wrapping round). */
export function createFigures(people: (Npc | Person)[], spots: Spot[], opts?: FigureOpts) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const atlas = faceAtlas();
  const faceMat = new THREE.MeshLambertMaterial({ map: atlas.tex, transparent: true, alphaTest: 0.04, depthWrite: true });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2);
  const figs: Fig[] = [];
  const hits: THREE.Object3D[] = [];
  const textures: THREE.Texture[] = [];

  const part = (draw: (k: Kit) => void) => {
    const k = new Kit();
    k.floorY = -100;
    draw(k);
    return k.build({ solid: mat, foliage: mat, glow: mat });
  };

  people.forEach((p, n) => {
    const person: Person = "npc" in p && typeof p.npc === "boolean" ? (p as Person) : { id: p.id, name: p.name, avatar: p.avatar, role: (p as Npc).role, npc: true };
    const spot = spots[n % Math.max(1, spots.length)] ?? { x: 0, z: 0, ry: 0, pose: "stand" as Pose };
    const rnd = rngFrom(`${person.id}|${opts?.key ?? ""}`);
    const a = person.avatar;
    const skin = parseInt((SKIN[a.skin] ?? "#d9a37a").slice(1), 16);
    const hair = parseInt((HAIR_COLOR[a.hairColor] ?? "#1b1b1b").slice(1), 16);
    const style = hairStyle(a.hair);
    const long = style === "long" || style === "bun" || style === "bob" || style === "braids" || style === "locs";
    const o = outfitFor(person.role, parseInt((TOP_COLOR[a.topColor] ?? "#2f6fd1").slice(1), 16), rnd, long);
    const sitting = spot.pose === "sit";
    const act: Act = spot.act ?? opts?.act ?? (sitting ? "idle" : "talk");
    const floorY = spot.floor ?? 0;
    const seat = sitting ? (spot.y ?? 0.46) - floorY : 0;
    const hipY = sitting ? seat + 0.05 : 0.9;
    const scale = 0.95 + rnd() * 0.1;
    const skinD = shadeHex(skin, 0.08);

    const root = new THREE.Group();
    const body = new THREE.Group();
    const torso = part((k) => {
      // Legs and shoes.
      if (sitting) {
        for (const side of [-1, 1]) {
          k.soft(side * 0.095, hipY - 0.085, 0.18, 0.15, 0.15, 0.44, o.trousers, 0.07);
          k.soft(side * 0.095, 0.07, 0.38, 0.12, Math.max(0.1, hipY - 0.16), 0.12, o.skirt !== undefined ? skin : o.trousers, 0.055);
          k.soft(side * 0.095, 0, 0.42, 0.11, 0.085, 0.26, o.shoes, 0.04);
        }
        if (o.skirt !== undefined) k.soft(0, hipY - 0.1, 0.12, 0.38, 0.12, 0.42, o.skirt, 0.05);
      } else {
        for (const side of [-1, 1]) {
          const legC = o.skirt !== undefined ? skin : o.trousers;
          k.soft(side * 0.09, 0.07, 0.0, 0.125, hipY - 0.05, 0.135, legC, 0.06);
          k.soft(side * 0.09, 0, 0.035, 0.11, 0.085, 0.26, o.shoes, 0.04);
        }
        if (o.skirt !== undefined) k.cyl(0, hipY - 0.42, 0, 0.17, 0.25, 0.5, o.skirt, 14);
      }
      // Hips, then a torso that widens a little to the shoulders.
      k.soft(0, hipY - 0.1, 0, 0.33, 0.2, 0.2, o.skirt ?? o.trousers, 0.08);
      k.soft(0, hipY + 0.04, 0, 0.32, 0.36, 0.2, o.top, 0.1);
      k.soft(0, hipY + 0.3, 0, 0.4, 0.22, 0.22, o.top, 0.1);
      if (o.jacket !== undefined) {
        // An open jacket: two front panels and the back.
        for (const side of [-1, 1]) k.soft(side * 0.12, hipY - 0.02, 0.006, 0.16, 0.56, 0.21, o.jacket, 0.06);
        k.soft(0, hipY - 0.02, -0.03, 0.4, 0.56, 0.17, o.jacket, 0.07);
      }
      if (o.tie !== undefined) k.box(0, hipY + 0.16, 0.105, 0.045, 0.3, 0.012, o.tie, { noAo: true });
      if (o.apron !== undefined) k.soft(0, hipY - 0.32, 0.1, 0.3, 0.68, 0.03, o.apron, 0.012);
      if (o.vest !== undefined) k.soft(0, hipY + 0.02, 0, 0.35, 0.44, 0.215, o.vest, 0.09);
      if (o.lanyard) {
        k.box(0, hipY + 0.2, 0.108, 0.075, 0.1, 0.008, 0xffffff, { noAo: true });
        k.box(0, hipY + 0.3, 0.104, 0.12, 0.012, 0.006, 0x1c3faa, { noAo: true, rz: 0 });
      }
      if (o.camera) {
        k.box(0.06, hipY + 0.12, 0.11, 0.13, 0.08, 0.06, 0x212529);
        k.cyl(0.06, hipY + 0.12 + 0.04, 0.14, 0.025, 0.025, 0.05, 0x495057, 10, { rx: Math.PI / 2 });
      }
      // Neck.
      k.cyl(0, hipY + 0.5, 0, 0.048, 0.055, 0.12, skinD, 10);
    });
    body.add(torso);

    // Head: skin, ears, hair (and a hat), with the face from the avatar on the front.
    const head = new THREE.Group();
    head.position.y = hipY + 0.6;
    const R = 0.112;
    head.add(
      part((k) => {
        k.ball(0, 0.11, 0, R, skin, { sy: 1.1, w: 16, h: 12 });
        for (const side of [-1, 1]) k.ball(side * R * 0.98, 0.1, -0.005, 0.024, skinD, { sx: 0.6, w: 8, h: 6 });
        if (style !== "bald" && o.hat !== "chef") {
          if (style === "afro") k.ball(0, 0.16, -0.02, 0.165, hair, { w: 14, h: 10 });
          else if (style === "curly") {
            k.ball(0, 0.15, -0.012, 0.128, hair, { sy: 0.92, w: 14, h: 10 });
            for (let c = 0; c < 6; c++) k.ball(Math.cos(c) * 0.09, 0.2 + (c % 2) * 0.03, Math.sin(c) * 0.06 - 0.02, 0.05, hair, { w: 8, h: 6 });
          } else if (style === "buzz") k.ball(0, 0.118, -0.004, R + 0.006, hair, { part: 0.48, w: 16, h: 8 });
          else if (style === "mohawk") {
            k.ball(0, 0.118, -0.004, R + 0.004, shadeHex(hair, -0.2), { part: 0.45, w: 16, h: 8 });
            k.soft(0, 0.18, -0.03, 0.05, 0.1, 0.24, hair, 0.024);
          } else k.ball(0, 0.118, -0.01, R + 0.014, hair, { part: 0.53, w: 16, h: 8 });
          if (style === "long" || style === "braids" || style === "locs") {
            if (style === "long") k.soft(0, -0.1, -0.075, 0.25, 0.3, 0.09, hair, 0.045);
            else for (let b = 0; b < 7; b++) k.cyl(-0.1 + b * 0.033, -0.16, -0.07 + Math.abs(b - 3) * 0.01, 0.014, 0.018, 0.28, hair, 6);
          }
          if (style === "bob") k.soft(0, -0.01, -0.03, 0.27, 0.16, 0.21, hair, 0.07);
          if (style === "bun") k.ball(0, 0.25, -0.075, 0.062, hair, { w: 10, h: 8 });
        }
        if (o.hat === "chef") {
          k.cyl(0, 0.17, 0, R + 0.01, R + 0.01, 0.06, 0xffffff, 14);
          k.ball(0, 0.28, 0, 0.13, 0xffffff, { sy: 0.75, w: 12, h: 8 });
        } else if (o.hat === "cap" || o.hat === "captain") {
          k.ball(0, 0.13, -0.005, R + 0.018, o.hatColor ?? 0x343a40, { part: 0.5, w: 14, h: 8 });
          k.box(0, 0.13, 0.08, 0.18, 0.012, 0.11, shadeHex(o.hatColor ?? 0x343a40, 0.2), { noAo: true });
          if (o.hat === "captain") k.box(0, 0.165, 0.118, 0.06, 0.03, 0.01, 0xe3b04b, { noAo: true });
        } else if (o.hat === "beanie") {
          k.ball(0, 0.135, -0.008, R + 0.02, o.hatColor ?? 0x343a40, { part: 0.55, sy: 1.15, w: 14, h: 8 });
        } else if (o.hat === "sun") {
          k.ball(0, 0.15, 0, R + 0.012, o.hatColor ?? 0xe9d8a6, { part: 0.5, w: 14, h: 8 });
          k.cyl(0, 0.145, 0, 0.21, 0.21, 0.012, o.hatColor ?? 0xe9d8a6, 18);
        }
        if (o.headphones) {
          k.ring(0, 0.12, 0, R + 0.02, 0.012, 0x212529, { arc: Math.PI, rz: 0 });
          for (const side of [-1, 1]) k.cyl(side * (R + 0.01), 0.09, 0, 0.04, 0.04, 0.03, 0x212529, 12, { rz: Math.PI / 2 });
        }
      }),
    );
    const cell = figs.length % 16;
    atlas.draw(a, cell);
    const face = new THREE.Mesh(facePatch(R * 1.012, atlas.uv(cell)), faceMat);
    face.scale.y = 1.1;
    face.position.y = 0.11;
    head.add(face);
    body.add(head);

    // Arms: shoulder → upper arm → elbow → forearm and hand (so they can bend to sip and eat).
    const sleeve = o.jacket ?? o.top;
    const arm = (side: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.215, hipY + 0.38, 0);
      shoulder.add(part((k) => k.soft(0, -0.28, 0, 0.095, 0.3, 0.095, sleeve, 0.045)));
      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      elbow.add(
        part((k) => {
          k.soft(0, -0.24, 0, 0.082, 0.25, 0.082, short(o) ? skin : sleeve, 0.038);
          k.ball(0, -0.26, 0.005, 0.045, skin, { w: 8, h: 6 });
        }),
      );
      shoulder.add(elbow);
      shoulder.rotation.z = side * 0.07;
      return { shoulder, elbow };
    };
    const L = arm(-1);
    const R2 = arm(1);
    body.add(L.shoulder, R2.shoulder);

    // Something in the hand: a glass, a fork, a phone...
    let prop: THREE.Object3D | null = null;
    if (act === "sip" || act === "eat" || (act === "talk" && rnd() < 0.25) || act === "dance") {
      const drink = act !== "eat";
      prop = part((k) => {
        if (drink) {
          const c = [0xffb347, 0xe8590c, 0xc2255c, 0x74c0fc, 0x8ce99a][Math.floor(rnd() * 5)];
          k.cyl(0, 0, 0, 0.032, 0.026, 0.11, 0xe7f5ff, 10);
          k.cyl(0, 0.01, 0, 0.028, 0.023, 0.075, c, 10, { layer: "glow" });
        } else {
          k.box(0, -0.02, 0, 0.012, 0.16, 0.012, 0xced4da);
        }
      });
      prop.position.set(0, -0.3, 0.04);
      R2.elbow.add(prop);
    }

    body.scale.setScalar(scale);
    root.add(body);

    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.position.set(0, 0.006, sitting ? 0.15 : 0.02);
    sh.renderOrder = 1;
    root.add(sh);

    let tag: THREE.Sprite | null = null;
    if (opts?.tags !== false) {
      const tex = nameTag(person.name, person.npc);
      textures.push(tex);
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      tag.scale.set(0.78, 0.195, 1);
      tag.position.y = (hipY + 1.02) * scale;
      tag.renderOrder = 6;
      root.add(tag);
    }

    const baseY = sitting ? floorY : (spot.y ?? 0);
    root.position.set(spot.x, baseY, spot.z);
    root.rotation.y = spot.ry;
    root.traverse((obj) => {
      if (person.npc) obj.userData.npc = person.id;
      else obj.userData.seat = person.seat ?? person.id;
    });
    group.add(root);
    // Resting arms for the pose.
    if (sitting) {
      L.shoulder.rotation.x = R2.shoulder.rotation.x = -0.5;
      L.elbow.rotation.x = R2.elbow.rotation.x = -0.7;
    }
    figs.push({ id: person.id, root, body, head, armL: L.shoulder, armR: R2.shoulder, elbowL: L.elbow, elbowR: R2.elbow, prop, pose: spot.pose, act, phase: rnd() * 20, look: (rnd() - 0.5) * 0.6, baseY, scale, tag });
    hits.push(torso, head, L.shoulder, R2.shoulder);
  });

  const toCam = new THREE.Vector3();
  /**
   * Move everyone a step. cam: where the viewer is, in this group's space (people near you
   * glance your way now and then).
   */
  function update(time: number, cam?: THREE.Vector3) {
    for (const f of figs) {
      const t = time + f.phase;
      const sit = f.pose === "sit";
      // Breathing.
      f.body.scale.y = f.scale * (1 + Math.sin(t * 1.7) * 0.008);
      let glance = Math.sin(t * 0.23) * 0.5 + Math.sin(t * 0.61) * 0.18 + f.look;
      if (cam) {
        toCam.set(cam.x - f.root.position.x, 0, cam.z - f.root.position.z);
        const d = toCam.length();
        if (d < 3.2 && Math.sin(t * 0.17) > -0.2) {
          let a = Math.atan2(toCam.x, toCam.z) - f.root.rotation.y;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          if (Math.abs(a) < 1.6) glance = a * 0.85;
        }
      }
      f.head.rotation.y += (Math.max(-1.1, Math.min(1.1, glance)) - f.head.rotation.y) * 0.08;
      f.head.rotation.x = Math.sin(t * 0.9) * 0.04;
      const sL = f.armL;
      const sR = f.armR;
      switch (f.act) {
        case "dance": {
          // Bounce to the beat, sway the hips, arms up and pumping.
          const beat = t * 7.6;
          f.root.position.y = f.baseY + Math.abs(Math.sin(beat / 2)) * 0.05;
          f.body.rotation.z = Math.sin(beat / 2) * 0.09;
          f.body.rotation.y = Math.sin(t * 0.8) * 0.4;
          f.head.rotation.x = Math.sin(beat) * 0.12;
          const up = Math.sin(t * 0.37) > 0;
          sR.rotation.x = up ? -2.6 + Math.sin(beat) * 0.35 : -0.9 + Math.sin(beat) * 0.4;
          sL.rotation.x = up ? -0.8 + Math.sin(beat + 1) * 0.4 : -2.4 + Math.sin(beat + 1) * 0.35;
          sR.rotation.z = 0.2;
          sL.rotation.z = -0.2;
          f.elbowR.rotation.x = -0.5 + Math.sin(beat) * 0.3;
          f.elbowL.rotation.x = -0.5 + Math.sin(beat + 1.4) * 0.3;
          break;
        }
        case "dj": {
          const beat = t * 7.6;
          f.head.rotation.x = Math.sin(beat) * 0.14;
          sL.rotation.x = -2.6;
          sL.rotation.z = -0.5;
          f.elbowL.rotation.x = -1.8;
          sR.rotation.x = -0.9 + Math.sin(t * 2.3) * 0.15;
          f.elbowR.rotation.x = -0.6;
          f.body.rotation.z = Math.sin(beat / 2) * 0.03;
          break;
        }
        case "sip":
        case "eat": {
          // Now and then bring the glass (or fork) up.
          const cycle = (t % (f.act === "eat" ? 4.2 : 6.5)) / (f.act === "eat" ? 4.2 : 6.5);
          const lift = cycle > 0.7 ? Math.sin(((cycle - 0.7) / 0.3) * Math.PI) : 0;
          sR.rotation.x = (sit ? -0.75 : -0.45) - lift * 0.55;
          f.elbowR.rotation.x = -1.0 - lift * 1.25;
          f.head.rotation.x = -lift * 0.15;
          if (!sit) {
            sL.rotation.x = Math.sin(t * 0.9) * 0.05;
            f.body.rotation.z = Math.sin(t * 0.35) * 0.02;
          }
          break;
        }
        case "work":
        case "cook": {
          sR.rotation.x = sL.rotation.x = -0.75;
          f.elbowR.rotation.x = -0.9 + Math.sin(t * 9) * 0.06;
          f.elbowL.rotation.x = -0.9 + Math.sin(t * 8 + 1) * 0.06;
          f.head.rotation.x = 0.15;
          break;
        }
        case "wave": {
          sR.rotation.x = -2.6;
          sR.rotation.z = 0.3 + Math.sin(t * 6) * 0.3;
          f.elbowR.rotation.x = -0.3;
          break;
        }
        default: {
          // Chatting: hands move now and then, weight shifts from foot to foot.
          const talk = Math.max(0, Math.sin(t * 0.45)) ;
          if (sit) {
            sR.rotation.x = -0.6 - talk * 0.35 * (0.6 + 0.4 * Math.sin(t * 3.1));
            f.elbowR.rotation.x = -0.8 - talk * 0.5;
          } else {
            f.body.rotation.z = Math.sin(t * 0.35) * 0.025;
            sL.rotation.x = Math.sin(t * 0.9) * 0.05;
            sR.rotation.x = -talk * (0.5 + 0.35 * Math.sin(t * 2.7));
            f.elbowR.rotation.x = -talk * (0.9 + 0.3 * Math.sin(t * 3.3));
            if (f.act === "talk") {
              const other = Math.max(0, Math.sin(t * 0.45 + 2.2));
              sL.rotation.x = -other * 0.4;
              f.elbowL.rotation.x = -other * 0.8;
            }
          }
        }
      }
    }
  }

  /** The NPC whose figure is under this hit object, if any. */
  function npcOf(obj: THREE.Object3D | null | undefined): string | null {
    while (obj) {
      if (typeof obj.userData.npc === "string") return obj.userData.npc;
      obj = obj.parent;
    }
    return null;
  }
  /** The seat of the player whose figure is under this hit object, if any. */
  function seatOf(obj: THREE.Object3D | null | undefined): string | null {
    while (obj) {
      if (typeof obj.userData.seat === "string") return obj.userData.seat;
      obj = obj.parent;
    }
    return null;
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry !== shadowGeo) obj.geometry.dispose();
      if (obj instanceof THREE.Sprite) obj.material.dispose();
    });
    shadowGeo.dispose();
    shadowMat.dispose();
    mat.dispose();
    faceMat.dispose();
    atlas.dispose();
    for (const t of textures) t.dispose();
  }

  return { group, hits, update, npcOf, seatOf, dispose, figs };
}

/** Short sleeves (bare forearms) for some tops. */
function short(o: Outfit) {
  return o.jacket === undefined && (o.top === 0xf8f9fa ? false : (o.top & 0xff) % 3 === 0);
}

export type Figures = ReturnType<typeof createFigures>;
