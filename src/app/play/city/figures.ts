// People in places: the regulars (NPCs) and other players sitting in seats, inside buildings,
// on rooftops, in parks and on rides, and everyone on a club's dance floor (you too, when you
// dance). Natural proportions (about 1.7 m tall): a shaped head with a nose, ears and the face
// from their avatar, hair in their style, hands with thumbs, knees, shoes with soles, and
// clothes from their avatar's outfit (hoodies, collars, jackets, agbadas, jerseys, overalls,
// stripes, camo...) or their job (chefs in whites, guards in caps, DJs in headphones). A name
// tag on top (NPCs carry a little "NPC" chip).
//
// Each person is ONE skinned mesh on a 12-bone skeleton (hips, waist, chest, head, two arms of
// two bones, two legs of two bones), so a whole body is a single draw call (plus the face) and
// every joint can move: they breathe, look round, talk with their hands, sip drinks, eat,
// type, sit with bent knees, and dance properly, legs and all, in time with the club's beat.
// Built in metres; outdoors they're scaled down with the city by the caller.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { AvatarFace } from "@/components/avatar";
import { HAIR_COLOR, SKIN, TOP_COLOR, type Avatar } from "@/lib/avatar";
import type { Npc } from "@/lib/npcs";
import { clubBeat, DANCE_MOVES, type DanceMove } from "./dance-moves";
import { Kit, mixHex, pickOf, rngFrom, shadeHex, type Rng } from "./kit";

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
  /** Dancers: the move (otherwise each one mixes up their own). */
  move?: DanceMove;
};

/** Someone to draw: a regular (NPC) or a player sitting in a seat. */
export type Person = { id: string; name: string; avatar: Avatar; role?: string; npc: boolean; /** Players: the seat they're in. */ seat?: string };

const TROUSERS = [0x2b3240, 0x3b4a5c, 0x4a3b30, 0x5b6370, 0x1f2a36, 0x6b5a48, 0xd8cbb5, 0x2f3e46, 0x41506b];
const SHOES = [0x1f1f1f, 0x3b2a20, 0xf1f3f5, 0x5c4033, 0x8a2b2b, 0x2f3e46];
const DRESSES = [0xc8553d, 0x2f6d6a, 0x7048e8, 0xe64980, 0xe3b04b, 0x1c3faa, 0x2f9e44];
const BELTS = [0x2b2118, 0x3b2a20, 0x1f1f1f, 0x5c4033];
const DENIM = 0x4a6fa5;
const WHITE = 0xf1f3f5;

const hex = (css: string | undefined, fallback: number) => (css ? parseInt(css.slice(1), 16) : fallback);

type Outfit = {
  top: number;
  trousers: number;
  shoes: number;
  sole: number;
  sneakers: boolean;
  sleeves: "short" | "long" | "none";
  collar: "round" | "shirt" | "turtle" | "v" | "hood" | "none";
  /** Colour of the sleeves, when not the top's (jackets, varsity sleeves). */
  sleeve?: number;
  skirt?: number;
  shorts?: boolean;
  belt?: number;
  /** An open jacket over the top (blazers, denim, leather, bombers). */
  jacket?: number;
  lapels?: boolean;
  tie?: number;
  bow?: number;
  apron?: number;
  vest?: number;
  overalls?: number;
  /** A long robe (agbada, kimono) and its sash. */
  robe?: number;
  sash?: number;
  pattern?: "stripes" | "check" | "camo" | "dashiki" | "puffer";
  patternColor?: number;
  pocket?: boolean;
  buttons?: boolean;
  watch?: boolean;
  hat?: "chef" | "cap" | "beanie" | "sun" | "captain" | "fila";
  hatColor?: number;
  headphones?: boolean;
  lanyard?: boolean;
  camera?: boolean;
};

/** Clothes from the avatar's outfit (AVATAR_PARTS.top), in its colour. */
function wardrobe(a: Avatar, rnd: Rng, long: boolean): Outfit {
  const top = hex(TOP_COLOR[a.topColor], 0x2f6fd1);
  const o: Outfit = {
    top,
    trousers: pickOf(rnd, TROUSERS),
    shoes: pickOf(rnd, SHOES),
    sole: WHITE,
    sneakers: rnd() < 0.6,
    sleeves: "short",
    collar: "round",
    watch: rnd() < 0.3,
  };
  if (!o.sneakers) o.sole = shadeHex(o.shoes, 0.4);
  if (long && rnd() < 0.4) o.skirt = rnd() < 0.5 ? top : pickOf(rnd, DRESSES);
  else if (rnd() < 0.1) o.shorts = true;
  if (o.skirt === undefined && rnd() < 0.55) o.belt = pickOf(rnd, BELTS);
  const inner = rnd() < 0.5 ? WHITE : pickOf(rnd, [0x343a40, 0xdee2e6, 0xe9ecef]);
  switch (a.top) {
    case 0: // T-shirt
      o.pocket = rnd() < 0.3;
      break;
    case 1: // Hoodie
      Object.assign(o, { sleeves: "long", collar: "hood", pocket: true });
      break;
    case 2: // Collar
      Object.assign(o, { sleeves: rnd() < 0.5 ? "long" : "short", collar: "shirt", buttons: true });
      break;
    case 3: // Jacket
      Object.assign(o, { jacket: top, top: inner, sleeves: "long" });
      break;
    case 4: // Agbada (with a fila cap, often)
      Object.assign(o, { robe: top, sleeves: "long", skirt: undefined, belt: undefined, hat: rnd() < 0.6 ? "fila" : undefined, hatColor: shadeHex(top, 0.15) });
      break;
    case 5: // Polo
      Object.assign(o, { collar: "shirt", buttons: true });
      break;
    case 6: // Turtleneck
      Object.assign(o, { collar: "turtle", sleeves: "long" });
      break;
    case 7: // V-neck
      o.collar = "v";
      break;
    case 8: // Tank top
      Object.assign(o, { sleeves: "none", collar: "none" });
      break;
    case 9: // Striped tee
      Object.assign(o, { pattern: "stripes", patternColor: top === WHITE || top === 0xf1f3f5 ? 0x1c3faa : rnd() < 0.5 ? WHITE : 0x18202b });
      break;
    case 10: // Football jersey
      Object.assign(o, { collar: "v", pattern: "stripes", patternColor: WHITE, shorts: o.skirt === undefined && rnd() < 0.5, sneakers: true, sole: WHITE });
      break;
    case 11: // Denim jacket
      Object.assign(o, { jacket: DENIM, top, sleeves: "long" });
      break;
    case 12: // Leather jacket
      Object.assign(o, { jacket: 0x1f1f1f, top, sleeves: "long" });
      break;
    case 13: // Bomber
      Object.assign(o, { jacket: top, top: 0x343a40, sleeves: "long" });
      break;
    case 14: // Blazer & tie
      Object.assign(o, { jacket: top, lapels: true, top: WHITE, collar: "shirt", tie: pickOf(rnd, [0xc92a2a, 0x1c3faa, 0x2f9e44, 0xe3b04b]), sleeves: "long", trousers: shadeHex(top, 0.2), skirt: undefined, shorts: false });
      break;
    case 15: // Suit & bow tie
      Object.assign(o, { jacket: top, lapels: true, top: WHITE, collar: "shirt", bow: 0x18202b, sleeves: "long", trousers: top, skirt: undefined, shorts: false, sneakers: false, shoes: 0x1f1f1f, sole: 0x111111 });
      break;
    case 16: // Puffer jacket
      Object.assign(o, { pattern: "puffer", sleeves: "long", collar: "turtle" });
      break;
    case 17: // Varsity jacket
      Object.assign(o, { jacket: top, top: WHITE, sleeve: WHITE, sleeves: "long" });
      break;
    case 18: // Flannel shirt
      Object.assign(o, { pattern: "check", patternColor: shadeHex(top, 0.45), collar: "shirt", sleeves: "long", buttons: true });
      break;
    case 19: // Overalls
      Object.assign(o, { overalls: rnd() < 0.6 ? DENIM : top, top: rnd() < 0.5 ? WHITE : 0xe5484d, skirt: undefined, shorts: false });
      o.trousers = o.overalls!;
      break;
    case 20: // Dashiki
      Object.assign(o, { pattern: "dashiki", patternColor: 0xd4a017 });
      if (rnd() < 0.5) o.trousers = top;
      break;
    case 21: // Kimono
      Object.assign(o, { robe: top, sash: rnd() < 0.5 ? 0x18202b : 0xe3b04b, sleeves: "long", collar: "v", skirt: undefined, belt: undefined });
      break;
    case 22: // Scrubs
      Object.assign(o, { collar: "v", trousers: top, skirt: undefined, shorts: false, pocket: true });
      break;
    case 23: // Chef's whites
      Object.assign(o, { top: WHITE, buttons: true, sleeves: "long", trousers: 0x2b2b2b, skirt: undefined });
      break;
    case 24: // Camo fatigues
      Object.assign(o, { top: 0x5b6b3a, trousers: 0x55633a, pattern: "camo", patternColor: 0x3b4a2a, sleeves: "long", sneakers: false, shoes: 0x3b2a20, sole: 0x221a14, skirt: undefined, shorts: false });
      break;
  }
  return o;
}

/** What someone wears: their avatar's outfit, unless their job has a uniform. */
function outfitFor(a: Avatar, role: string | undefined, rnd: Rng, long: boolean): Outfit {
  const o = wardrobe(a, rnd, long);
  const r = (role ?? "").toLowerCase();
  const plain = { robe: undefined, pattern: undefined, overalls: undefined, jacket: undefined, lapels: false, tie: undefined, bow: undefined, skirt: undefined } as const;
  if (r.includes("chef")) Object.assign(o, plain, { top: 0xf8f9fa, hat: "chef", apron: 0xf1f3f5, trousers: 0x2b2b2b, buttons: true, sleeves: "long" });
  else if (r.includes("security") || r.includes("guard")) Object.assign(o, plain, { top: 0x1f2a44, trousers: 0x1f2a44, hat: "cap", hatColor: 0x1f2a44, collar: "shirt", sleeves: "short" });
  else if (r.includes("courier")) Object.assign(o, { vest: 0xd9f99d, hat: "cap", hatColor: 0xe03131, robe: undefined });
  else if (r.includes("cleaner")) Object.assign(o, { apron: 0x4dabf7, top: 0x74c0fc, robe: undefined, jacket: undefined });
  else if (r.includes("café") || r.includes("cafe") || r.includes("vendor")) Object.assign(o, { apron: mixHex(o.top, 0x5c4033, 0.6), robe: undefined, jacket: undefined });
  else if (r.includes("accountant") || r.includes("manager"))
    Object.assign(o, plain, { jacket: rnd() < 0.5 ? 0x2b3240 : 0x3b3b3b, lapels: true, tie: pickOf(rnd, [0xc92a2a, 0x1c3faa, 0x2f9e44, 0xe3b04b]), top: 0xf1f3f5, trousers: 0x2b3240, collar: "shirt", sleeves: "long" });
  else if (r.includes("receptionist")) Object.assign(o, { jacket: mixHex(o.top, 0x1f1f1f, 0.35), lapels: true, lanyard: true, robe: undefined, sleeves: "long" });
  else if (r.includes("office") || r.includes("intern")) Object.assign(o, { lanyard: true, tie: rnd() < 0.3 ? 0x1c3faa : undefined });
  else if (r.includes("dj")) Object.assign(o, { headphones: true, top: 0x18202b, robe: undefined, jacket: undefined, pattern: undefined });
  else if (r.includes("photographer") || r.includes("tourist"))
    Object.assign(o, { camera: true, hat: r.includes("tourist") ? "sun" : "beanie", hatColor: r.includes("tourist") ? 0xe9d8a6 : 0x343a40, robe: undefined });
  else if (r.includes("gardener")) Object.assign(o, { hat: "sun", hatColor: 0xd9c48f, apron: 0x2f9e44, robe: undefined });
  else if (r.includes("captain")) Object.assign(o, plain, { hat: "captain", hatColor: 0x1f2a44, jacket: 0x1f2a44, sleeves: "long" });
  else if (r.includes("stargazer") || r.includes("pigeon")) Object.assign(o, { hat: "beanie", hatColor: pickOf(rnd, [0xc92a2a, 0x343a40, 0x2f9e44]) });
  else if (r.includes("birdwatcher")) Object.assign(o, { hat: "sun", hatColor: 0x6b7a4b, camera: true });
  else if (r.includes("jogger")) Object.assign(o, plain, { trousers: 0x1f1f1f, shoes: 0xf1f3f5, sneakers: true, sole: WHITE, shorts: true, sleeves: "short", collar: "round" });
  else if (r.includes("painter")) Object.assign(o, { apron: 0xf1efe8, hat: "beanie", hatColor: 0x7a2e3a });
  else if (r.includes("designer")) Object.assign(o, { top: 0x1f1f1f, pattern: undefined });
  return o;
}

/** Which simple 3D hairstyle goes with the avatar's hairstyle. */
function hairStyle(i: number) {
  // 0 Buzz, 1 Short, 2 Curly, 3 Afro, 4 Long, 5 Bun, 6 Braids, 7 Mohawk, 8 Side part, 9 Bald, 10 Locs, 11 Bob
  return (["buzz", "cap", "curly", "afro", "long", "bun", "braids", "mohawk", "side", "bald", "locs", "bob"] as const)[i] ?? "cap";
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

const CELLS = 8;
const CELL = 128;

/** A sheet of faces (8 × 8 of 128 px), drawn from each person's avatar portrait. */
function faceAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CELLS * CELL;
  const c = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let alive = true;
  /** Paint avatar a into cell k (async: the portrait is an SVG picture). */
  function draw(a: Avatar, k: number) {
    const cx = (k % CELLS) * CELL;
    const cy = Math.floor(k / CELLS) * CELL;
    // As a picture on its own, an SVG needs its namespace (React leaves it out).
    let svg = renderToStaticMarkup(createElement(AvatarFace, { avatar: a, size: 240 }));
    if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      // The face (the head in the portrait spans x 34..86, y 25..83 of 120).
      const s = 240 / 120;
      c.save();
      c.beginPath();
      c.rect(cx, cy, CELL, CELL);
      c.clip();
      c.clearRect(cx, cy, CELL, CELL);
      c.drawImage(img, 30 * s, 26 * s, 60 * s, 60 * s, cx, cy, CELL, CELL);
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
    uv: (k: number) => ({ u0: (k % CELLS) / CELLS, v0: 1 - (Math.floor(k / CELLS) + 1) / CELLS, du: 1 / CELLS, dv: 1 / CELLS }),
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

// ---------------------------------------------------------------- the skeleton

const HIPS = 0;
const SPINE = 1;
const CHEST = 2;
const HEAD = 3;
const UARM_L = 4;
const FARM_L = 5;
const UARM_R = 6;
const FARM_R = 7;
const THIGH_L = 8;
const SHIN_L = 9;
const THIGH_R = 10;
const SHIN_R = 11;
const NB = 12;
/** Pose numbers: x, y, z turn of each bone, then how far the hips move (x, y, z). */
const PN = NB * 3 + 3;
const HX = NB * 3;
const HY = NB * 3 + 1;
const HZ = NB * 3 + 2;

/** Where each bone sits when standing (model space, metres), and its parent. */
function joints(w: number, hw: number): [number, number, number, number][] {
  return [
    [-1, 0, 0.92, 0],
    [HIPS, 0, 1.03, 0],
    [SPINE, 0, 1.24, 0],
    [CHEST, 0, 1.47, 0],
    [CHEST, -0.19 * w, 1.41, 0],
    [UARM_L, -0.2 * w, 1.13, 0],
    [CHEST, 0.19 * w, 1.41, 0],
    [UARM_R, 0.2 * w, 1.13, 0],
    [HIPS, -0.093 * hw, 0.9, 0],
    [THIGH_L, -0.094, 0.49, 0],
    [HIPS, 0.093 * hw, 0.9, 0],
    [THIGH_R, 0.094, 0.49, 0],
  ];
}

type Body = {
  skin: number;
  skinD: number;
  hair: number;
  style: ReturnType<typeof hairStyle>;
  a: Avatar;
  o: Outfit;
  /** Shoulder and hip width, and a rounder tummy. */
  w: number;
  hw: number;
  belly: boolean;
  rnd: Rng;
};

/** Head height of the middle of the head (the skull's centre). */
const HEAD_Y = 1.625;
const HEAD_R = 0.108;

/** Draws a whole person standing, each part on its bone. */
function drawBody(k: Kit, b: Body) {
  const { skin, skinD, hair, style, a, o, w, hw, rnd } = b;
  const S1 = { seg: 1 };
  const N = { noAo: true };
  const legSkin = o.skirt !== undefined || o.shorts || o.robe !== undefined;
  const lower = o.trousers;
  const sleeve = o.sleeve ?? o.jacket ?? o.robe ?? o.top;
  const top = o.robe ?? o.top;
  const puffer = o.pattern === "puffer";
  const robe = o.robe !== undefined;

  // ---- hips: the pelvis, belt and buckle (or the robe's / skirt's top).
  k.bone = HIPS;
  k.soft(0, 0.83, -0.005, 0.31 * hw, 0.23, 0.2, robe ? top : (o.skirt ?? lower), 0.08);
  if (o.belt !== undefined && !robe && o.overalls === undefined) {
    k.soft(0, 1.0, -0.005, 0.318 * hw, 0.045, 0.207, o.belt, 0.02, S1);
    k.box(0, 1.004, 0.099, 0.045, 0.036, 0.012, 0xd4af37, N);
  }
  if (!robe && o.skirt === undefined) k.box(0, 0.86, 0.1, 0.006, 0.12, 0.004, shadeHex(lower, 0.22), N);
  if (o.apron !== undefined) k.soft(0, 0.55, 0.098, 0.3, 0.5, 0.03, o.apron, 0.012, S1);

  // ---- waist (tummy).
  k.bone = SPINE;
  const tummy = b.belly ? 1.16 : 1;
  k.soft(0, 0.98, 0, 0.29 * w, 0.31, 0.19 * tummy, top, 0.08);
  if (o.jacket !== undefined) {
    for (const s of [-1, 1]) k.soft(s * 0.105 * w, 0.92, 0.01, 0.13 * w, 0.32, 0.2 * tummy, o.jacket, 0.05);
    k.soft(0, 0.92, -0.03, 0.31 * w, 0.32, 0.17, o.jacket, 0.05);
  }
  if (o.apron !== undefined) k.soft(0, 1.04, 0.098 * tummy, 0.28, 0.24, 0.03, o.apron, 0.012, S1);
  if (o.sash !== undefined) k.soft(0, 1.0, 0, 0.3 * w, 0.09, 0.2 * tummy, o.sash, 0.03, S1);
  if (o.overalls !== undefined) k.soft(0, 0.98, 0.004, 0.292 * w, 0.2, 0.192 * tummy, o.overalls, 0.06);

  // ---- chest and shoulders, collar, pattern, extras.
  k.bone = CHEST;
  k.soft(0, 1.17, 0, 0.35 * w, 0.29, 0.21, top, 0.09);
  k.soft(0, 1.36, -0.012, 0.42 * w, 0.1, 0.185, top, 0.05);
  if (puffer) {
    // Puffy rings round the body.
    for (const y of [1.2, 1.31]) k.soft(0, y, 0, 0.38 * w, 0.09, 0.235, shadeHex(top, -0.06), 0.045);
  }
  if (o.jacket !== undefined) {
    for (const s of [-1, 1]) k.soft(s * 0.12 * w, 1.15, 0.012, 0.15 * w, 0.32, 0.215, o.jacket, 0.05);
    k.soft(0, 1.15, -0.03, 0.4 * w, 0.32, 0.18, o.jacket, 0.05);
    if (o.lapels) for (const s of [-1, 1]) k.box(s * 0.055, 1.27, 0.118, 0.035, 0.17, 0.008, shadeHex(o.jacket, 0.18), { noAo: true, rz: s * 0.32 });
  }
  switch (o.collar) {
    case "round":
      k.ring(0, 1.455, 0.004, 0.062, 0.012, shadeHex(top, 0.14), { rx: Math.PI / 2 });
      break;
    case "turtle":
      k.cyl(0, 1.41, -0.004, 0.06, 0.066, 0.1, top, 12);
      break;
    case "shirt":
      for (const s of [-1, 1]) k.box(s * 0.038, 1.415, 0.075, 0.065, 0.04, 0.012, o.top === top ? shadeHex(top, -0.05) : o.top, { noAo: true, rz: s * 0.5, rx: -0.35 });
      break;
    case "v":
      for (const s of [-1, 1]) k.box(s * 0.026, 1.37, 0.106, 0.012, 0.09, 0.004, shadeHex(top, 0.22), { noAo: true, rz: -s * 0.45 });
      break;
    case "hood":
      k.ball(0, 1.45, -0.085, 0.1, shadeHex(top, 0.06), { sx: 1.3, sy: 0.65, sz: 0.85 });
      for (const s of [-1, 1]) k.cyl(s * 0.035, 1.28, 0.106, 0.004, 0.004, 0.13, WHITE, 5);
      break;
  }
  if (o.buttons) for (let i = 0; i < 4; i++) k.cyl(0, 1.0 + i * 0.1, 0.104 * (i ? 1 : tummy), 0.007, 0.007, 0.006, shadeHex(o.top, 0.25), 6, { rx: Math.PI / 2, noAo: true });
  if (o.pocket) {
    if (o.collar === "hood") k.box(0, 1.04, 0.1 * tummy, 0.18, 0.1, 0.008, shadeHex(top, 0.08), N);
    else k.box(0.075 * w, 1.3, 0.104, 0.06, 0.07, 0.006, shadeHex(top, 0.08), N);
  }
  if (o.pattern === "stripes") {
    // Bands across the front and back (where the chest is flat).
    for (const y of [1.2, 1.32]) for (const z of [0.106, -0.106]) k.box(0, y, z, 0.2 * w, 0.042, 0.004, o.patternColor ?? WHITE, N);
  } else if (o.pattern === "check") {
    for (let i = -2; i <= 2; i++) k.box(i * 0.06 * w, 1.0, 0.106, 0.01, 0.45, 0.003, o.patternColor!, N);
    for (let i = 0; i < 4; i++) k.box(0, 1.04 + i * 0.1, 0.106, 0.32 * w, 0.01, 0.003, o.patternColor!, N);
  } else if (o.pattern === "camo") {
    for (let i = 0; i < 9; i++) k.ball((rnd() - 0.5) * 0.28 * w, 1.0 + rnd() * 0.4, 0.09, 0.035 + rnd() * 0.02, i % 2 ? o.patternColor! : 0x7a8450, { sz: 0.35, w: 8, h: 6 });
  } else if (o.pattern === "dashiki") {
    // The embroidered panel round the neck, down to a point.
    for (const s of [-1, 1]) k.box(s * 0.05, 1.27, 0.106, 0.035, 0.2, 0.005, o.patternColor!, { noAo: true, rz: -s * 0.42 });
    k.box(0, 1.43, 0.09, 0.16, 0.03, 0.01, o.patternColor!, N);
    for (let i = 0; i < 5; i++) k.box(-0.08 + i * 0.04, 1.36, 0.108, 0.012, 0.012, 0.004, 0x18202b, N);
  }
  if (o.overalls !== undefined) {
    k.box(0, 1.13, 0.104, 0.2, 0.2, 0.01, o.overalls, N);
    for (const s of [-1, 1]) k.box(s * 0.08, 1.3, 0.1, 0.035, 0.18, 0.012, o.overalls, N);
    for (const s of [-1, 1]) k.cyl(s * 0.08, 1.31, 0.11, 0.012, 0.012, 0.006, 0xd4af37, 6, { rx: Math.PI / 2, noAo: true });
  }
  if (o.tie !== undefined) {
    k.box(0, 1.15, 0.108, 0.045, 0.27, 0.012, o.tie, N);
    k.box(0, 1.41, 0.104, 0.035, 0.035, 0.018, shadeHex(o.tie, 0.1), N);
  }
  if (o.bow !== undefined) for (const s of [-1, 1]) k.box(s * 0.025, 1.415, 0.1, 0.045, 0.032, 0.012, o.bow, { noAo: true, rz: s * 0.25 });
  if (o.vest !== undefined) {
    k.soft(0, 1.0, 0, 0.365 * w, 0.46, 0.226, o.vest, 0.09);
    for (const y of [1.12, 1.26]) k.box(0, y, 0.114, 0.36 * w, 0.025, 0.004, 0xdee2e6, N);
  }
  if (o.apron !== undefined) k.soft(0, 1.26, 0.104, 0.22, 0.16, 0.02, o.apron, 0.01, S1);
  if (o.lanyard) {
    k.box(0, 1.2, 0.11, 0.075, 0.1, 0.008, 0xffffff, N);
    for (const s of [-1, 1]) k.box(s * 0.04, 1.3, 0.106, 0.01, 0.16, 0.004, 0x1c3faa, { noAo: true, rz: -s * 0.3 });
  }
  if (o.camera) {
    k.box(0.06, 1.12, 0.11, 0.13, 0.08, 0.06, 0x212529);
    k.cyl(0.06, 1.16, 0.14, 0.025, 0.025, 0.05, 0x495057, 10, { rx: Math.PI / 2 });
  }

  // ---- head: neck, skull, jaw, nose, ears, hair (and a hat), glasses, earrings.
  k.bone = HEAD;
  const hy = HEAD_Y - 0.11;
  k.cyl(0, 1.42, -0.006, 0.047, 0.055, 0.14, skinD, 10);
  k.ball(0, HEAD_Y, 0, HEAD_R, skin, { sy: 1.12, sz: 1.04, w: 16, h: 12 });
  k.cyl(0, 1.598, 0.098, 0.007, 0.02, 0.044, shadeHex(skin, 0.05), 8, { rx: Math.PI / 2 + 0.32 });
  for (const s of [-1, 1]) k.ball(s * HEAD_R * 0.98, 1.618, -0.006, 0.026, skinD, { sx: 0.55, w: 8, h: 6 });
  const bare = style === "bald" || o.hat === "chef";
  if (!bare) {
    if (style === "afro") {
      k.ball(0, hy + 0.17, -0.02, 0.168, hair, { w: 14, h: 10 });
    } else if (style === "curly") {
      k.ball(0, hy + 0.15, -0.012, 0.128, hair, { sy: 0.92, w: 14, h: 10 });
      for (let c = 0; c < 9; c++) k.ball(Math.cos(c * 0.8) * 0.095, hy + 0.19 + (c % 3) * 0.025, Math.sin(c * 0.8) * 0.07 - 0.02, 0.045, hair, { w: 8, h: 6 });
    } else if (style === "buzz") {
      k.ball(0, hy + 0.12, -0.004, HEAD_R + 0.005, hair, { part: 0.47, sz: 1.03, w: 16, h: 8 });
    } else if (style === "mohawk") {
      k.ball(0, hy + 0.12, -0.004, HEAD_R + 0.004, shadeHex(hair, -0.2), { part: 0.44, w: 16, h: 8 });
      for (let c = 0; c < 5; c++) k.cyl(0, hy + 0.19, 0.07 - c * 0.04, 0.004, 0.026, 0.1 - Math.abs(c - 2) * 0.015, hair, 6);
    } else {
      // A cap of hair with a little fringe and sideburns (side part: swept to one side).
      k.ball(0, hy + 0.12, -0.01, HEAD_R + 0.014, hair, { part: 0.53, sz: 1.05, w: 16, h: 8 });
      if (style === "side") k.ball(0.03, hy + 0.205, 0.04, 0.07, hair, { sx: 1.4, sy: 0.45, w: 10, h: 6 });
      else k.soft(0, hy + 0.17, 0.075, 0.16, 0.04, 0.04, hair, 0.018, S1);
      for (const s of [-1, 1]) k.soft(s * 0.1, hy + 0.06, 0.02, 0.016, 0.06, 0.03, hair, 0.007, S1);
    }
    if (style === "long") {
      k.soft(0, hy - 0.16, -0.075, 0.25, 0.34, 0.09, hair, 0.045);
      for (const s of [-1, 1]) k.soft(s * 0.105, hy - 0.06, 0.0, 0.04, 0.2, 0.08, hair, 0.018, S1);
    }
    if (style === "braids" || style === "locs") {
      const thick = style === "locs" ? 0.022 : 0.014;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const ang = Math.PI * (0.15 + 0.7 * t);
        k.cyl(-Math.cos(ang) * 0.11, hy - 0.2, -Math.sin(ang) * 0.075 - 0.02, thick * 0.8, thick, 0.3, hair, 6);
        if (style === "braids" && i % 2 === 0) k.ball(-Math.cos(ang) * 0.11, hy - 0.2, -Math.sin(ang) * 0.075 - 0.02, 0.012, 0xe3b04b, { w: 6, h: 4 });
      }
    }
    if (style === "bob") k.soft(0, hy - 0.02, -0.03, 0.27, 0.17, 0.215, hair, 0.075);
    if (style === "bun") k.ball(0, hy + 0.25, -0.075, 0.062, hair, { w: 10, h: 8 });
  }
  if (o.hat === "chef") {
    k.cyl(0, hy + 0.17, 0, HEAD_R + 0.01, HEAD_R + 0.01, 0.06, 0xffffff, 14);
    k.ball(0, hy + 0.28, 0, 0.13, 0xffffff, { sy: 0.75, w: 12, h: 8 });
  } else if (o.hat === "cap" || o.hat === "captain") {
    k.ball(0, hy + 0.13, -0.005, HEAD_R + 0.018, o.hatColor ?? 0x343a40, { part: 0.5, w: 14, h: 8 });
    k.box(0, hy + 0.13, 0.08, 0.18, 0.012, 0.11, shadeHex(o.hatColor ?? 0x343a40, 0.2), { noAo: true });
    if (o.hat === "captain") k.box(0, hy + 0.165, 0.118, 0.06, 0.03, 0.01, 0xe3b04b, { noAo: true });
  } else if (o.hat === "beanie") {
    k.ball(0, hy + 0.135, -0.008, HEAD_R + 0.02, o.hatColor ?? 0x343a40, { part: 0.55, sy: 1.15, w: 14, h: 8 });
    k.ring(0, hy + 0.13, -0.004, HEAD_R + 0.016, 0.012, shadeHex(o.hatColor ?? 0x343a40, 0.15), { rx: Math.PI / 2 });
  } else if (o.hat === "sun") {
    k.ball(0, hy + 0.15, 0, HEAD_R + 0.012, o.hatColor ?? 0xe9d8a6, { part: 0.5, w: 14, h: 8 });
    k.cyl(0, hy + 0.145, 0, 0.21, 0.21, 0.012, o.hatColor ?? 0xe9d8a6, 18);
    k.cyl(0, hy + 0.152, 0, HEAD_R + 0.014, HEAD_R + 0.014, 0.025, shadeHex(o.hatColor ?? 0xe9d8a6, 0.35), 16);
  } else if (o.hat === "fila") {
    k.soft(0.01, hy + 0.17, -0.01, 0.21, 0.09, 0.21, o.hatColor ?? 0x7a2e3a, 0.04, { rz: -0.22 });
  }
  if (o.headphones) {
    k.ring(0, HEAD_Y + 0.01, 0, HEAD_R + 0.02, 0.012, 0x212529, { arc: Math.PI, rz: 0 });
    for (const s of [-1, 1]) k.cyl(s * (HEAD_R + 0.01), 1.6, 0, 0.04, 0.04, 0.03, 0x212529, 12, { rz: Math.PI / 2 });
  }
  if (a.glasses > 0) {
    const frame = a.glasses === 3 ? 0x111111 : pickOf(rnd, [0x1f1f1f, 0x7a4b2e, 0xb08d57]);
    for (const s of [-1, 1]) {
      // Thin frames round the lenses the face picture already draws, and the arms back to the ears.
      if (a.glasses === 2) {
        for (const dy of [-0.02, 0.02]) k.box(s * 0.042, 1.632 + dy - 0.003, 0.113, 0.056, 0.006, 0.006, frame, N);
        for (const dx of [-0.026, 0.026]) k.box(s * 0.042 + dx, 1.609, 0.113, 0.006, 0.046, 0.006, frame, N);
      } else k.ring(s * 0.042, 1.632, 0.112, 0.026, 0.0045, frame, { noAo: true });
      k.box(s * 0.104, 1.629, 0.04, 0.005, 0.006, 0.13, frame, N);
    }
    if (a.glasses === 3) for (const s of [-1, 1]) k.cyl(s * 0.042, 1.632, 0.11, 0.025, 0.025, 0.006, 0x18202b, 12, { rx: Math.PI / 2, noAo: true });
    k.box(0, 1.636, 0.115, 0.03, 0.006, 0.006, frame, N);
  }
  if (a.earrings > 0) {
    for (const s of [-1, 1]) {
      if (a.earrings === 2) k.ring(s * 0.11, 1.57, 0, 0.018, 0.003, 0xe3b04b, { noAo: true, ry: Math.PI / 2 });
      else k.ball(s * 0.11, 1.585, 0.002, 0.009, 0xe3b04b, { w: 6, h: 4 });
    }
  }

  // ---- arms: shoulder → upper arm → elbow → forearm and hand (tapered, smooth at the joints).
  for (const s of [-1, 1]) {
    const x0 = s * 0.19 * w;
    const x1 = s * 0.2 * w;
    const wide = robe || puffer ? 1.35 : 1;
    const bareUpper = o.sleeves !== "long";
    k.bone = s < 0 ? UARM_L : UARM_R;
    k.ball(x0, 1.405, 0, 0.062 * Math.min(1.2, wide), o.sleeves === "none" ? skin : sleeve, { sz: 1.05, w: 12, h: 8 });
    k.cyl(x1, 1.13, 0, 0.049 * wide, 0.041 * wide, 0.28, bareUpper ? skin : sleeve, 12);
    if (o.sleeves === "short") {
      k.cyl(x1, 1.24, 0, 0.06, 0.055, 0.17, sleeve, 12);
      if (o.pattern === "stripes") k.cyl(x1, 1.245, 0, 0.0565, 0.0565, 0.022, o.patternColor ?? WHITE, 12);
    }
    k.bone = s < 0 ? FARM_L : FARM_R;
    const longArm = o.sleeves === "long";
    k.ball(x1, 1.13, 0, 0.041 * (longArm ? wide : 1), longArm ? sleeve : skin, { w: 12, h: 8 });
    if (robe) k.cyl(x1, 0.9, 0, 0.06, 0.095, 0.24, sleeve, 12);
    else k.cyl(x1, 0.875, 0, 0.04 * (longArm ? wide : 1), 0.031 * (longArm ? wide : 1), 0.26, longArm ? sleeve : skin, 12);
    if (longArm && !robe) k.cyl(x1, 0.872, 0, 0.037 * wide, 0.037 * wide, 0.032, o.jacket !== undefined || puffer ? shadeHex(sleeve, 0.2) : shadeHex(sleeve, 0.1), 12);
    if (o.watch && s < 0 && !longArm) {
      k.cyl(x1, 0.885, 0, 0.034, 0.034, 0.024, 0x2b2b2b, 12);
      k.box(x1 - s * 0.034, 0.887, 0, 0.004, 0.02, 0.024, 0xdee2e6, N);
    }
    // The hand: palm (facing in), fingers curled a touch, a thumb in front.
    k.soft(x1, 0.775, 0.006, 0.034, 0.105, 0.08, skin, 0.016, S1);
    k.soft(x1 + s * 0.002, 0.722, 0.012, 0.03, 0.065, 0.074, skinD, 0.014, S1);
    k.soft(x1 - s * 0.01, 0.77, 0.05, 0.022, 0.06, 0.024, skin, 0.01, { seg: 1, rx: -0.3 });
  }

  // ---- legs: thigh → knee → shin, ankle and shoe (tapered, smooth at the joints).
  for (const s of [-1, 1]) {
    const xh = s * 0.093 * hw;
    const xk = s * 0.094;
    k.bone = s < 0 ? THIGH_L : THIGH_R;
    const thighC = o.skirt !== undefined || robe ? skin : lower;
    const shinC = legSkin ? skin : lower;
    if (o.shorts) {
      k.cyl(xh, 0.49, -0.004, 0.066 * hw, 0.055, 0.2, skin, 14);
      k.cyl(xh, 0.62, -0.004, 0.08 * hw, 0.072, 0.32, lower, 14);
    } else k.cyl(xh, 0.49, -0.004, 0.077 * hw, 0.057, 0.44, thighC, 14);
    if (o.pattern === "camo" && !o.shorts) for (let i = 0; i < 3; i++) k.ball(xh + (rnd() - 0.5) * 0.05, 0.56 + i * 0.12, 0.062, 0.028, i % 2 ? o.patternColor! : 0x7a8450, { sz: 0.35, w: 8, h: 6 });
    if (o.skirt !== undefined) {
      // Each half of the skirt moves with its leg (so sitting and dancing look right).
      k.soft(s * 0.072 * hw, 0.5, -0.004, 0.2 * hw, 0.52, 0.235, o.skirt, 0.07);
      k.soft(s * 0.078 * hw, 0.49, -0.004, 0.214 * hw, 0.045, 0.248, shadeHex(o.skirt, 0.12), 0.02, S1);
    }
    if (robe) {
      k.soft(s * 0.075 * hw, 0.24, -0.004, 0.22 * hw, 0.74, 0.25, top, 0.07);
      if (o.pattern === undefined && o.sash === undefined) k.soft(s * 0.08 * hw, 0.235, -0.004, 0.226 * hw, 0.04, 0.256, shadeHex(top, 0.18), 0.02, S1);
    }
    k.bone = s < 0 ? SHIN_L : SHIN_R;
    k.ball(xk, 0.49, -0.004, 0.057, o.shorts ? skin : thighC, { w: 12, h: 8 });
    k.cyl(xk, 0.095, -0.006, 0.054, 0.039, 0.4, shinC, 14);
    k.ball(xk, 0.34, -0.022, 0.048, shinC, { sy: 1.8, w: 10, h: 8 });
    if (!legSkin) k.cyl(xk, 0.09, -0.006, 0.046, 0.049, 0.035, shadeHex(lower, 0.12), 14);
    else if (o.sneakers) k.cyl(xk, 0.07, -0.008, 0.041, 0.043, 0.06, pickOf(rnd, [WHITE, 0x343a40]), 12);
    k.soft(xk, 0.022, 0.03, 0.1, 0.085, 0.25, o.shoes, 0.035);
    k.soft(xk, 0, 0.03, 0.106, 0.026, 0.258, o.sole, 0.012, S1);
    if (o.sneakers) {
      k.soft(xk, 0.016, 0.115, 0.1, 0.05, 0.075, o.sole, 0.02, S1);
      for (let i = 0; i < 3; i++) k.box(xk, 0.104 - i * 0.008, 0.035 + i * 0.03, 0.055, 0.006, 0.01, 0xffffff, N);
    }
  }
  k.bone = null;
}

// ---------------------------------------------------------------- poses

const TAU = Math.PI * 2;
/** 1 on the beat, 0 half way between beats. */
const onBeat = (b: number) => 0.5 + 0.5 * Math.cos(TAU * b);
const R = (P: Float32Array, bone: number, x: number, y: number, z: number) => {
  P[bone * 3] = x;
  P[bone * 3 + 1] = y;
  P[bone * 3 + 2] = z;
};
/** Both knees bent by c (the hips drop so the feet stay on the floor). */
function crouch(P: Float32Array, c: number, l = 1, r = 1) {
  P[THIGH_L * 3] -= c * l;
  P[SHIN_L * 3] += 2 * c * l;
  P[THIGH_R * 3] -= c * r;
  P[SHIN_R * 3] += 2 * c * r;
  P[HY] -= 0.82 * (1 - Math.cos(c * Math.min(l, r)));
}
function rest(P: Float32Array) {
  P.fill(0);
  P[UARM_L * 3 + 2] = -0.08;
  P[UARM_R * 3 + 2] = 0.08;
  P[FARM_L * 3] = -0.12;
  P[FARM_R * 3] = -0.12;
}
/** The same pose, left for right. */
function mirror(P: Float32Array) {
  for (const [l, r] of [
    [UARM_L, UARM_R],
    [FARM_L, FARM_R],
    [THIGH_L, THIGH_R],
    [SHIN_L, SHIN_R],
  ]) {
    for (let a = 0; a < 3; a++) {
      const t = P[l * 3 + a];
      P[l * 3 + a] = P[r * 3 + a];
      P[r * 3 + a] = t;
    }
  }
  for (let bone = 0; bone < NB; bone++) {
    P[bone * 3 + 1] = -P[bone * 3 + 1];
    P[bone * 3 + 2] = -P[bone * 3 + 2];
  }
  P[HX] = -P[HX];
}

/** One dance move at beat b (whole numbers are on the beat). */
function dancePose(move: DanceMove, b: number, P: Float32Array) {
  rest(P);
  const sw = Math.sin(Math.PI * b);
  switch (move) {
    case "groove": {
      // Two-step: a step to each side every two beats, knees bouncing, elbows swinging.
      const c = 0.16 + 0.16 * onBeat(b);
      crouch(P, c, 1 + 0.6 * Math.max(0, -sw), 1 + 0.6 * Math.max(0, sw));
      P[HX] = 0.06 * sw;
      P[HIPS * 3 + 2] = -0.07 * sw;
      P[SPINE * 3 + 2] = 0.08 * sw;
      P[CHEST * 3 + 1] = 0.2 * Math.sin(Math.PI * b + 0.6);
      R(P, UARM_L, -0.35 + 0.45 * sw, 0, -0.22);
      R(P, UARM_R, -0.35 - 0.45 * sw, 0, 0.22);
      P[FARM_L * 3] = P[FARM_R * 3] = -1.25 + 0.2 * onBeat(b);
      R(P, HEAD, 0.12 * onBeat(b), 0, -0.06 * sw);
      break;
    }
    case "armsup": {
      // Jumping with both hands in the air, pumping on the beat.
      crouch(P, 0.24 * onBeat(b));
      P[HY] += 0.05 * (1 - onBeat(b));
      R(P, UARM_L, -2.85 + 0.2 * Math.sin(TAU * b), 0, -0.34 - 0.14 * Math.sin(TAU * b));
      R(P, UARM_R, -2.85 + 0.2 * Math.sin(TAU * b + 1), 0, 0.34 + 0.14 * Math.sin(TAU * b + 1));
      P[FARM_L * 3] = P[FARM_R * 3] = -0.25 - 0.5 * onBeat(b);
      P[CHEST * 3] = -0.08;
      R(P, HEAD, -0.2 + 0.12 * onBeat(b), 0, 0);
      break;
    }
    case "shaku": {
      // Lift a knee out to the side on each beat (left, right), arms swinging across.
      const side = Math.floor(b) % 2 === 0 ? 1 : -1;
      const lift = Math.sin(Math.PI * (b - Math.floor(b)));
      crouch(P, 0.2);
      const th = side > 0 ? THIGH_R : THIGH_L;
      const sh = side > 0 ? SHIN_R : SHIN_L;
      P[th * 3] -= 0.85 * lift;
      P[th * 3 + 2] = side * 0.45 * lift;
      P[sh * 3] += 1.15 * lift;
      P[HX] = -side * 0.04 * lift;
      P[SPINE * 3 + 2] = -side * 0.12 * lift;
      P[CHEST * 3 + 1] = 0.35 * Math.sin(Math.PI * b);
      R(P, UARM_L, -0.95 + 0.25 * sw, 0, 0.12);
      R(P, UARM_R, -0.95 - 0.25 * sw, 0, -0.12);
      P[FARM_L * 3] = P[FARM_R * 3] = -1.6;
      R(P, HEAD, 0.1, 0.22 * sw, 0);
      break;
    }
    case "point": {
      // The disco point: right hand up to the sky, then down across the body; left hand on the hip.
      const up = Math.floor(b) % 2 === 0;
      const snap = Math.min(1, (b - Math.floor(b)) * 4);
      const k = up ? snap : 1 - snap;
      R(P, UARM_R, -0.4 - 0.2 * (1 - k), 0, -0.5 + 3.0 * k);
      P[FARM_R * 3] = -0.3 * (1 - k);
      R(P, UARM_L, 0.15, 0, -0.75);
      P[FARM_L * 3] = -1.7;
      P[HIPS * 3 + 2] = 0.1 * sw;
      P[HX] = 0.05 * sw;
      crouch(P, 0.12 + 0.1 * onBeat(b), 1.6, 0.6);
      R(P, HEAD, -0.25 * k + 0.1 * (1 - k), 0.3 * k - 0.1, 0);
      break;
    }
    case "wave": {
      // A body roll from the hips up to the head, arms flowing.
      const ph = Math.PI * b;
      P[HZ] = 0.05 * Math.sin(ph + 1);
      P[SPINE * 3] = 0.2 * Math.sin(ph);
      P[CHEST * 3] = 0.22 * Math.sin(ph - 1);
      P[HEAD * 3] = 0.25 * Math.sin(ph - 2);
      crouch(P, 0.22 + 0.12 * Math.sin(ph + 1.5));
      R(P, UARM_L, -0.45, 0, -0.7 - 0.45 * Math.sin(ph + 1.2));
      R(P, UARM_R, -0.45, 0, 0.7 + 0.45 * Math.sin(ph));
      P[FARM_L * 3] = -0.7 - 0.5 * Math.sin(ph + 2.2);
      P[FARM_R * 3] = -0.7 - 0.5 * Math.sin(ph + 1);
      break;
    }
    case "gwara": {
      // Gwara gwara: one arm swings in a big circle over the head, the other knee lifts.
      const side = Math.floor(b / 4) % 2 === 0 ? 1 : -1;
      const a = Math.PI * b;
      const ua = side > 0 ? UARM_R : UARM_L;
      const fa = side > 0 ? FARM_R : FARM_L;
      const ub = side > 0 ? UARM_L : UARM_R;
      const fb = side > 0 ? FARM_L : FARM_R;
      R(P, ua, -1.9 + 0.75 * Math.sin(a), 0, side * (0.95 + 0.6 * Math.cos(a)));
      P[fa * 3] = -0.4;
      R(P, ub, -0.5, 0, -side * 0.3);
      P[fb * 3] = -1.5;
      const lift = Math.max(0, Math.sin(TAU * b));
      crouch(P, 0.2);
      const th = side > 0 ? THIGH_L : THIGH_R;
      const sh = side > 0 ? SHIN_L : SHIN_R;
      P[th * 3] -= 0.7 * lift;
      P[sh * 3] += 0.95 * lift;
      P[CHEST * 3 + 1] = 0.2 * Math.sin(TAU * b * 2);
      P[HIPS * 3 + 2] = side * 0.06;
      R(P, HEAD, 0.08 * onBeat(b), -side * 0.15, 0);
      break;
    }
    case "legwork": {
      // Quick feet: little kicks forward, one after the other, leaning in, arms pumping.
      for (const s of [-1, 1]) {
        const kick = Math.max(0, Math.sin(TAU * b + (s > 0 ? 0 : Math.PI)));
        P[(s < 0 ? THIGH_L : THIGH_R) * 3] = -0.25 - 0.45 * kick;
        P[(s < 0 ? SHIN_L : SHIN_R) * 3] = 0.55 - 0.4 * kick;
        R(P, s < 0 ? UARM_L : UARM_R, -0.6 + 0.4 * Math.sin(TAU * b + (s > 0 ? Math.PI : 0)), 0, s * 0.15);
        P[(s < 0 ? FARM_L : FARM_R) * 3] = -1.4;
      }
      P[HY] = -0.07;
      P[SPINE * 3] = 0.22;
      R(P, HEAD, -0.05 + 0.15 * onBeat(b), 0, 0);
      break;
    }
    case "spin": {
      // A slow turn (once round every four beats), arms out wide.
      P[HIPS * 3 + 1] = TAU * ((b / 4) % 1);
      R(P, UARM_L, -0.1, 0, -1.35 - 0.1 * Math.sin(TAU * b));
      R(P, UARM_R, -0.1, 0, 1.35 + 0.1 * Math.sin(TAU * b));
      P[FARM_L * 3] = P[FARM_R * 3] = -0.2;
      crouch(P, 0.15 * onBeat(b));
      P[HEAD * 3] = -0.1;
      break;
    }
  }
}

// ---------------------------------------------------------------- figures

type Fig = {
  id: string;
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  /** Where the hips bone rests (sitting moves it down to the seat). */
  hipsY: number;
  prop: THREE.Object3D | null;
  pose: Pose;
  act: Act;
  phase: number;
  look: number;
  headY: number;
  baseY: number;
  scale: number;
  tag: THREE.Sprite | null;
  /** Dancing: the move now (players), or the three this regular mixes up; and mirrored or not. */
  move: DanceMove | null;
  moves: DanceMove[];
  mirror: boolean;
  /** Smooth change from one move to the next. */
  prevMove: DanceMove | null;
  blend: number;
  P: Float32Array;
  Q: Float32Array;
};

export type FigureOpts = {
  /** Name tags (default true). */
  tags?: boolean;
  /** Seed text, so the same person dresses the same way. */
  key?: string;
  /** What people do when their spot doesn't say (a club: "dance"). */
  act?: Act;
  /** Nobody to tap (a crowd in the background): no ids on the figures, no hit boxes. */
  inert?: boolean;
};

const MOVE_IDS = DANCE_MOVES.map((m) => m.id);

/** Regulars (from npcsFor) or players, each in their spot (spots[n], wrapping round). */
export function createFigures(people: (Npc | Person)[], spots: Spot[], opts?: FigureOpts) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const atlas = faceAtlas();
  const faceMat = new THREE.MeshLambertMaterial({ map: atlas.tex, transparent: true, alphaTest: 0.04, depthWrite: true });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2);
  const hitGeo = new THREE.BoxGeometry(0.55, 1, 0.5).translate(0, 0.5, 0);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const figs: Fig[] = [];
  const hits: THREE.Object3D[] = [];
  const textures: THREE.Texture[] = [];
  const skeletons: THREE.Skeleton[] = [];

  people.forEach((p, n) => {
    const person: Person = "npc" in p && typeof p.npc === "boolean" ? (p as Person) : { id: p.id, name: p.name, avatar: p.avatar, role: (p as Npc).role, npc: true };
    const spot = spots[n % Math.max(1, spots.length)] ?? { x: 0, z: 0, ry: 0, pose: "stand" as Pose };
    const rnd = rngFrom(`${person.id}|${opts?.key ?? ""}`);
    const a = person.avatar;
    const skin = hex(SKIN[a.skin], 0xd9a37a);
    const hair = hex(HAIR_COLOR[a.hairColor], 0x1b1b1b);
    const style = hairStyle(a.hair);
    const long = style === "long" || style === "bun" || style === "bob" || style === "braids" || style === "locs";
    const o = outfitFor(a, person.role, rnd, long);
    const sitting = spot.pose === "sit";
    const act: Act = spot.act ?? opts?.act ?? (sitting ? "idle" : "talk");
    const floorY = spot.floor ?? 0;
    const seat = sitting ? (spot.y ?? 0.46) - floorY : 0;
    const scale = 0.93 + rnd() * 0.13;
    const femme = long || o.skirt !== undefined;
    const w = femme ? 0.9 + rnd() * 0.06 : 0.98 + rnd() * 0.12;
    const hw = femme ? 1.06 + rnd() * 0.06 : 0.98 + rnd() * 0.06;

    // The body, every part on its bone, merged into one skinned mesh.
    const k = new Kit();
    k.floorY = -100;
    drawBody(k, { skin, skinD: shadeHex(skin, 0.08), hair, style, a, o, w, hw, belly: rnd() < 0.15, rnd });
    const geo = k.take("solid")!;
    const bones: THREE.Bone[] = [];
    const at = joints(w, hw);
    for (const [parent, x, y, z] of at) {
      const bone = new THREE.Bone();
      const pp = parent >= 0 ? at[parent] : null;
      bone.position.set(x - (pp?.[1] ?? 0), y - (pp?.[2] ?? 0), z - (pp?.[3] ?? 0));
      bones.push(bone);
      if (parent >= 0) bones[parent].add(bone);
    }
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(bones[HIPS]);
    mesh.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    mesh.bind(skeleton);
    skeletons.push(skeleton);
    mesh.frustumCulled = false;

    // The face from their avatar, on the head bone.
    const cell = figs.length % (CELLS * CELLS);
    atlas.draw(a, cell);
    const face = new THREE.Mesh(facePatch(HEAD_R * 1.012, atlas.uv(cell)), faceMat);
    face.scale.set(1, 1.12, 1.04);
    face.position.set(0, HEAD_Y - 1.47, 0);
    bones[HEAD].add(face);

    // Something in the hand: a glass, a fork...
    let prop: THREE.Object3D | null = null;
    if (act === "sip" || act === "eat" || (act === "talk" && rnd() < 0.25) || (act === "dance" && rnd() < 0.35)) {
      const drink = act !== "eat";
      const pk = new Kit();
      pk.floorY = -100;
      if (drink) {
        const c = pickOf(rnd, [0xffb347, 0xe8590c, 0xc2255c, 0x74c0fc, 0x8ce99a]);
        pk.cyl(0, 0, 0, 0.032, 0.026, 0.11, 0xe7f5ff, 10);
        pk.cyl(0, 0.01, 0, 0.028, 0.023, 0.075, c, 10);
      } else pk.box(0, -0.02, 0, 0.012, 0.16, 0.012, 0xced4da);
      prop = new THREE.Mesh(pk.take("solid")!, propMat);
      prop.position.set(0, -0.33, 0.045);
      bones[FARM_R].add(prop);
    }

    const body = new THREE.Group();
    body.add(mesh);
    body.scale.setScalar(scale);
    const root = new THREE.Group();
    root.add(body);

    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.position.set(0, 0.006, sitting ? 0.15 : 0.02);
    sh.renderOrder = 1;
    root.add(sh);

    if (!opts?.inert) {
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.scale.y = (sitting ? seat + 0.9 : 1.8) * scale;
      if (sitting) hit.position.z = 0.15;
      root.add(hit);
      hits.push(hit);
    }

    let tag: THREE.Sprite | null = null;
    if (opts?.tags !== false && !opts?.inert) {
      const tex = nameTag(person.name, person.npc);
      textures.push(tex);
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      tag.scale.set(0.78, 0.195, 1);
      tag.position.y = ((sitting ? seat + 0.05 : 0.92) + 1.06) * scale;
      tag.renderOrder = 6;
      root.add(tag);
    }

    const baseY = sitting ? floorY : (spot.y ?? 0);
    root.position.set(spot.x, baseY, spot.z);
    root.rotation.y = spot.ry;
    if (!opts?.inert) {
      root.traverse((obj) => {
        if (person.npc) obj.userData.npc = person.id;
        else obj.userData.seat = person.seat ?? person.id;
      });
    }
    group.add(root);
    // A regular on the dance floor mixes up three moves (some mirrored, so not everyone matches).
    const start = Math.floor(rnd() * MOVE_IDS.length);
    const moves = [0, 3, 5].map((d) => MOVE_IDS[(start + d) % MOVE_IDS.length]);
    figs.push({
      id: person.id,
      root,
      mesh,
      bones,
      hipsY: sitting ? seat + 0.05 : 0.92,
      prop,
      pose: spot.pose,
      act,
      phase: rnd() * 20,
      look: (rnd() - 0.5) * 0.6,
      headY: 0,
      baseY,
      scale,
      tag,
      move: spot.move ?? null,
      moves,
      mirror: rnd() < 0.5,
      prevMove: null,
      blend: 1,
      P: new Float32Array(PN),
      Q: new Float32Array(PN),
    });
  });

  const toCam = new THREE.Vector3();
  let lastTime = 0;
  /**
   * Move everyone a step. cam: where the viewer is, in this group's space (people near you
   * glance your way now and then).
   */
  function update(time: number, cam?: THREE.Vector3) {
    const dt = Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    // In time with the club's music (see clubBeat).
    const beat = clubBeat();
    for (const f of figs) {
      const t = time + f.phase;
      const sit = f.pose === "sit";
      const P = f.P;
      if (f.act === "dance") {
        // Everyone on the beat (a hair apart), their own move.
        const b = beat + (f.phase % 1) * 0.08;
        const move = f.move ?? f.moves[Math.floor((beat + f.phase * 3) / 16) % f.moves.length];
        if (f.prevMove !== move) {
          // A new move: ease over from the pose we were just in.
          if (f.prevMove !== null) {
            f.Q.set(P);
            f.blend = 0;
          }
          f.prevMove = move;
        }
        dancePose(move, b, P);
        if (f.mirror && f.move === null) mirror(P);
        if (f.blend < 1) {
          f.blend = Math.min(1, f.blend + dt * 2.5);
          const e = f.blend * f.blend * (3 - 2 * f.blend);
          for (let i = 0; i < PN; i++) P[i] = f.Q[i] + (P[i] - f.Q[i]) * e;
        }
      } else {
        rest(P);
        // Breathing and a little sway.
        P[CHEST * 3] = Math.sin(t * 1.7) * 0.015;
        if (sit) {
          P[THIGH_L * 3] = P[THIGH_R * 3] = -1.52;
          P[SHIN_L * 3] = P[SHIN_R * 3] = 1.5;
          P[SPINE * 3] = -0.05;
          R(P, UARM_L, -0.45, 0, -0.08);
          R(P, UARM_R, -0.45, 0, 0.08);
          P[FARM_L * 3] = P[FARM_R * 3] = -0.75;
        }
        switch (f.act) {
          case "dj": {
            const b = beat;
            R(P, UARM_L, -2.4, 0, -0.55);
            P[FARM_L * 3] = -1.9;
            R(P, UARM_R, -0.95 + Math.sin(t * 2.3) * 0.15, 0, 0.1);
            P[FARM_R * 3] = -0.7;
            P[HEAD * 3] = 0.12 * onBeat(b);
            P[SPINE * 3 + 2] = Math.sin(Math.PI * b) * 0.04;
            if (!sit) crouch(P, 0.06 * onBeat(b));
            break;
          }
          case "sip":
          case "eat": {
            // Now and then bring the glass (or fork) up.
            const len = f.act === "eat" ? 4.2 : 6.5;
            const cycle = (t % len) / len;
            const lift = cycle > 0.7 ? Math.sin(((cycle - 0.7) / 0.3) * Math.PI) : 0;
            P[UARM_R * 3] = (sit ? -0.75 : -0.45) - lift * 0.55;
            P[FARM_R * 3] = -1.0 - lift * 1.25;
            P[HEAD * 3] = -lift * 0.15;
            if (!sit) {
              P[UARM_L * 3] = Math.sin(t * 0.9) * 0.05;
              P[HIPS * 3 + 2] = Math.sin(t * 0.35) * 0.02;
            }
            break;
          }
          case "work":
          case "cook": {
            P[UARM_L * 3] = P[UARM_R * 3] = -0.75;
            P[FARM_R * 3] = -0.9 + Math.sin(t * 9) * 0.06;
            P[FARM_L * 3] = -0.9 + Math.sin(t * 8 + 1) * 0.06;
            P[HEAD * 3] = 0.15;
            break;
          }
          case "wave": {
            R(P, UARM_R, -0.2, 0, 2.6 + Math.sin(t * 6) * 0.25);
            P[FARM_R * 3] = -0.3;
            break;
          }
          default: {
            // Chatting: hands move now and then, weight shifts from foot to foot.
            const talk = Math.max(0, Math.sin(t * 0.45));
            if (sit) {
              P[UARM_R * 3] = -0.6 - talk * 0.35 * (0.6 + 0.4 * Math.sin(t * 3.1));
              P[FARM_R * 3] = -0.8 - talk * 0.5;
            } else {
              const shift = Math.sin(t * 0.35);
              P[HX] = shift * 0.015;
              P[HIPS * 3 + 2] = shift * 0.03;
              P[SPINE * 3 + 2] = -shift * 0.025;
              crouch(P, 0.03, 1 + Math.max(0, shift), 1 + Math.max(0, -shift));
              P[UARM_L * 3] = Math.sin(t * 0.9) * 0.05;
              P[UARM_R * 3] = -talk * (0.5 + 0.35 * Math.sin(t * 2.7));
              P[FARM_R * 3] = -0.12 - talk * (0.9 + 0.3 * Math.sin(t * 3.3));
              if (f.act === "talk") {
                const other = Math.max(0, Math.sin(t * 0.45 + 2.2));
                P[UARM_L * 3] = -other * 0.4;
                P[FARM_L * 3] = -0.12 - other * 0.8;
              }
            }
          }
        }
        // Look round now and then (and at the viewer when they're close).
        let glance = Math.sin(t * 0.23) * 0.5 + Math.sin(t * 0.61) * 0.18 + f.look;
        if (cam) {
          toCam.set(cam.x - f.root.position.x, 0, cam.z - f.root.position.z);
          if (toCam.length() < 3.2 && Math.sin(t * 0.17) > -0.2) {
            let ang = Math.atan2(toCam.x, toCam.z) - f.root.rotation.y;
            ang = Math.atan2(Math.sin(ang), Math.cos(ang));
            if (Math.abs(ang) < 1.6) glance = ang * 0.85;
          }
        }
        f.headY += (Math.max(-1.1, Math.min(1.1, glance)) - f.headY) * 0.08;
        P[HEAD * 3 + 1] += f.headY;
        P[HEAD * 3] += Math.sin(t * 0.9) * 0.04;
      }
      // Put the bones where the pose says.
      const bones = f.bones;
      for (let i = 0; i < NB; i++) bones[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      bones[HIPS].position.set(P[HX], f.hipsY + P[HY], P[HZ]);
    }
  }

  /** Change someone's dance move (null: back to mixing it up themselves). */
  function setMove(id: string, move: DanceMove | null) {
    const f = figs.find((g) => g.id === id);
    if (!f || (f.act === "dance" && f.move === move)) return;
    if (f.act !== "dance") {
      // From standing about to dancing: ease into it.
      f.Q.set(f.P);
      f.blend = 0;
      f.prevMove = null;
    }
    f.act = "dance";
    f.move = move;
  }

  /** Move someone to another spot on the floor, facing ry. */
  function place(id: string, x: number, z: number, ry: number) {
    const f = figs.find((g) => g.id === id);
    if (!f) return;
    f.root.position.x = x;
    f.root.position.z = z;
    f.root.rotation.y = ry;
  }

  /**
   * Hide anyone standing in the way of a camera at (ax, az) looking at (bx, bz) (this group's
   * space): within r of the line between them, or right next to the camera. `keep`: never hidden.
   */
  function clearView(ax: number, az: number, bx: number, bz: number, r: number, keep?: string) {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    for (const f of figs) {
      if (f.id === keep) {
        f.root.visible = true;
        continue;
      }
      const px = f.root.position.x - ax;
      const pz = f.root.position.z - az;
      const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / len2));
      const ex = px - dx * t;
      const ez = pz - dz * t;
      f.root.visible = t > 0.92 || Math.hypot(ex, ez) > r;
    }
  }
  /** Everyone visible again. */
  function showAll() {
    for (const f of figs) f.root.visible = true;
  }

  /** Where someone stands now (this group's space), or null. */
  function where(id: string) {
    const f = figs.find((g) => g.id === id);
    return f ? { x: f.root.position.x, z: f.root.position.z, ry: f.root.rotation.y } : null;
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
    group.removeFromParent();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry !== shadowGeo && obj.geometry !== hitGeo) obj.geometry.dispose();
      if (obj instanceof THREE.Sprite) obj.material.dispose();
    });
    for (const s of skeletons) s.dispose();
    shadowGeo.dispose();
    shadowMat.dispose();
    hitGeo.dispose();
    hitMat.dispose();
    mat.dispose();
    propMat.dispose();
    faceMat.dispose();
    atlas.dispose();
    for (const t of textures) t.dispose();
  }

  return { group, hits, update, setMove, place, where, clearView, showAll, npcOf, seatOf, dispose, figs };
}

export type Figures = ReturnType<typeof createFigures>;
