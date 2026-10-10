// Little info bubbles over the map: a white pill with a tail, floating over the places near
// the middle of the view (the place's name, an icon for what it is, and how many people are
// inside) and over the world events' pins (the event's title).
// Tapping one opens the place (or the event's info).
//
// Drawn as a handful of plain DOM elements over the canvas (crisp text, easy taps), moved
// every frame with transforms only. Which places get one is re-picked about five times a
// second: the ones nearest the middle of the screen, fewer when zoomed out and none when far
// out, never two on top of each other, with a little stickiness so they don't flicker as you
// pan. They pop in and out (scale and fade).
//
// A drag that starts on a bubble still moves the map (the press is handed on to the canvas);
// only a quick tap counts as a tap on the bubble.

import {
  Anchor,
  Bath,
  Rocket,
  Dumbbell,
  MoonStar,
  Vault,
  Award,
  Baby,
  Church,
  School,
  BedDouble,
  Briefcase,
  Building2,
  ChevronRight,
  Clock,
  Factory,
  FerrisWheel,
  Flame,
  Fuel,
  Goal,
  GraduationCap,
  HandFist,
  Hospital,
  House,
  Landmark,
  Music,
  Plane,
  Shield,
  ShoppingBag,
  Store,
  Sun,
  TrainFront,
  Trees,
  Trophy,
  UtensilsCrossed,
  Volleyball,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import type { StructureType, Tile } from "@/lib/city/layout";
import { PIN_HEAD, type WorldEventsLayer } from "./world-events";

/** A place that can have a bubble: its anchor tile index and the point over its roof. */
export type BubbleSpot = { i: number; x: number; y: number; z: number };

export type BubblesHost = {
  /** CityView's container (the bubbles go in a layer inside it, over the canvas). */
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  /** What the map camera looks at (for how far out we're zoomed). */
  target: THREE.Vector3;
  /**
   * How zoomed in to count as, for how many bubbles to show, when that isn't simply the
   * camera's distance to the target (from a hot-air balloon, looking across the town). null: the distance.
   */
  zoom?: () => number | null;
  events: WorldEventsLayer;
  /** The places that can have a bubble (a new array when the city changes). */
  spots: () => readonly BubbleSpot[];
  /** A place's name and its tile (for the icon), or null if it isn't a place after all. */
  label: (i: number) => { name: string; tile: Tile } | null;
  /** How many people are in a place right now. */
  count: (i: number) => number;
  /** Is this place's roof hidden from the camera (behind something taller)? Optional. */
  hidden?: (spot: BubbleSpot) => boolean;
  /** Optional short line for a place instead of the head count (e.g. "Match on now"). */
  note?: (i: number) => string | null;
  onBuilding: (i: number) => void;
  onEvent: (id: number) => void;
};

const INK = "#18202b";
const MUTED = "#64707d";
const GOLD = "#f5a524";
const FONT = "var(--font-sans, ui-sans-serif, system-ui, sans-serif)";
/** Bubble height in px (pill plus tail), and how far apart two must stay. */
const PILL_H = 28;
const TAIL_H = 6;
const BUBBLE_H = PILL_H + TAIL_H;
const GAP = 5;
const NAME_MAX = 150;
/** Names get less room when there's a live note ("Match on now") beside them. */
const NAME_MAX_NOTE = 112;
const SLOTS = 10;
const MAX_TOTAL = 8;
const MAX_EVENTS = 3;
const PICK_MS = 200;
const TAP_MOVE = 8;
const TAP_MS = 600;

// ---------------------------------------------------------------- what a place looks like
type Look = { icon: LucideIcon; color: string; outdoor: boolean };
const C = { night: "#7c5cdb", food: "#ee8a00", stay: "#0f9f8f", work: "#2f8fd8", home: "#c98a00", civic: "#e5484d", law: "#3b5bdb", green: "#2f9e44", fun: "#d6409f", grey: "#64707d", power: "#d9a400" };
const STRUCTURE_LOOK: Record<StructureType, Look> = {
  mall: { icon: ShoppingBag, color: C.fun, outdoor: false },
  twin: { icon: Building2, color: C.work, outdoor: false },
  museum: { icon: Landmark, color: C.night, outdoor: false },
  funfair: { icon: FerrisWheel, color: C.fun, outdoor: true },
  market: { icon: Store, color: C.food, outdoor: true },
  arena: { icon: Goal, color: C.green, outdoor: false },
  campus: { icon: GraduationCap, color: C.law, outdoor: false },
  hotel: { icon: BedDouble, color: C.stay, outdoor: false },
  solar: { icon: Sun, color: C.power, outdoor: true },
  airport: { icon: Plane, color: C.stay, outdoor: false },
  port: { icon: Anchor, color: C.stay, outdoor: true },
  military: { icon: Shield, color: C.grey, outdoor: false },
  power: { icon: Zap, color: C.power, outdoor: false },
  dam: { icon: Waves, color: C.work, outdoor: true },
  oilrig: { icon: Factory, color: C.grey, outdoor: false },
  waterpark: { icon: Waves, color: C.work, outdoor: true },
  court: { icon: Volleyball, color: C.food, outdoor: false },
  boxing: { icon: HandFist, color: C.civic, outdoor: false },
  wrestling: { icon: Award, color: C.night, outdoor: false },
  capitol: { icon: Landmark, color: C.law, outdoor: false },
  megamall: { icon: ShoppingBag, color: C.fun, outdoor: false },
  bank: { icon: Vault, color: C.power, outdoor: false },
  bigpark: { icon: Trees, color: C.green, outdoor: true },
  gym: { icon: Dumbbell, color: C.civic, outdoor: false },
  spa: { icon: Bath, color: C.stay, outdoor: false },
  cathedral: { icon: Church, color: C.law, outdoor: false },
  grandmosque: { icon: MoonStar, color: C.green, outdoor: false },
  intlairport: { icon: Plane, color: C.stay, outdoor: false },
  spaceport: { icon: Rocket, color: C.night, outdoor: false },
};
const KIND_LOOK: Partial<Record<Tile["kind"], Look>> = {
  club: { icon: Music, color: C.night, outdoor: false },
  restaurant: { icon: UtensilsCrossed, color: C.food, outdoor: false },
  office: { icon: Briefcase, color: C.work, outdoor: false },
  tower: { icon: Building2, color: C.work, outdoor: false },
  house: { icon: House, color: C.home, outdoor: false },
  hospital: { icon: Hospital, color: C.civic, outdoor: false },
  police: { icon: Shield, color: C.law, outdoor: false },
  fire: { icon: Flame, color: C.civic, outdoor: false },
  fuel: { icon: Fuel, color: C.grey, outdoor: false },
  clock: { icon: Clock, color: C.grey, outdoor: false },
  ferris: { icon: FerrisWheel, color: C.fun, outdoor: true },
  stadium: { icon: Trophy, color: C.green, outdoor: true },
  park: { icon: Trees, color: C.green, outdoor: true },
  trees: { icon: Trees, color: C.green, outdoor: true },
  plaza: { icon: Landmark, color: C.green, outdoor: true },
  pond: { icon: Waves, color: C.work, outdoor: true },
  school: { icon: School, color: C.law, outdoor: false },
  worship: { icon: Church, color: C.night, outdoor: false },
  pitch: { icon: Goal, color: C.green, outdoor: true },
  playground: { icon: Baby, color: C.fun, outdoor: true },
  monument: { icon: Landmark, color: C.grey, outdoor: true },
};
const DEFAULT_LOOK: Look = { icon: Building2, color: GOLD, outdoor: false };

export function placeLook(t: Tile): Look {
  if (t.station) return { icon: TrainFront, color: C.stay, outdoor: false };
  if (t.kind === "structure" && t.structure) return STRUCTURE_LOOK[t.structure.type] ?? DEFAULT_LOOK;
  return KIND_LOOK[t.kind] ?? DEFAULT_LOOK;
}

const svgCache = new Map<LucideIcon, string>();
function svgOf(icon: LucideIcon, size: number, stroke: number) {
  let s = svgCache.get(icon);
  if (!s) {
    s = renderToStaticMarkup(createElement(icon, { size, strokeWidth: stroke, absoluteStrokeWidth: false, "aria-hidden": true }));
    svgCache.set(icon, s);
  }
  return s;
}

const short = (n: number) => (n >= 1000 ? `${Math.floor(n / 100) / 10}k` : String(n));

// ---------------------------------------------------------------- the layer
type Slot = {
  root: HTMLDivElement;
  card: HTMLDivElement;
  icon: HTMLSpanElement;
  name: HTMLSpanElement;
  meta: HTMLSpanElement;
  /** 0 free, 1 a place, 2 an event. */
  kind: 0 | 1 | 2;
  key: number;
  /** World point it hangs off (places), refreshed from the pin each frame for events. */
  wx: number;
  wy: number;
  wz: number;
  /** Pop-in progress 0..1, and whether it's wanted. */
  a: number;
  on: boolean;
  content: string;
  w: number;
  // What was last written to the DOM (to skip identical writes).
  lx: number;
  ly: number;
  ls: number;
  lo: number;
  shown: boolean;
};

export type Bubbles = ReturnType<typeof createBubbles>;

export function createBubbles(host: BubblesHost) {
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:strict;";
  // Measures the safe area (notch, home bar): bubbles stay inside it.
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;top:env(safe-area-inset-top,0px);right:env(safe-area-inset-right,0px);bottom:env(safe-area-inset-bottom,0px);left:env(safe-area-inset-left,0px);";
  layer.appendChild(probe);
  host.el.appendChild(layer);

  let W = 1;
  let H = 1;
  const safe = { l: 0, t: 0, r: 1, b: 1 };
  function resize(w: number, h: number) {
    W = Math.max(1, w);
    H = Math.max(1, h);
    safe.l = probe.offsetLeft + 4;
    safe.t = probe.offsetTop + 4;
    safe.r = probe.offsetLeft + (probe.offsetWidth || W) - 4;
    safe.b = probe.offsetTop + (probe.offsetHeight || H) - 4;
    lastPick = -Infinity;
  }

  // Text widths, measured on a canvas (no layout), cached.
  const measure = document.createElement("canvas").getContext("2d");
  const widths = new Map<string, number>();
  let fontFamily = "";
  function textW(s: string, weight: number, px: number) {
    if (!s) return 0;
    const key = `${weight}|${px}|${s}`;
    let w = widths.get(key);
    if (w !== undefined) return w;
    if (!fontFamily) fontFamily = getComputedStyle(host.el).fontFamily || "system-ui, sans-serif";
    if (measure) {
      measure.font = `${weight} ${px}px ${fontFamily}`;
      w = measure.measureText(s).width;
    } else w = s.length * px * 0.55;
    if (widths.size > 600) widths.clear();
    widths.set(key, w);
    return w;
  }

  // ---- slots (DOM nodes, made when first needed, reused)
  const slots: Slot[] = [];
  function makeSlot(): Slot {
    const root = document.createElement("div");
    root.style.cssText = "position:absolute;left:0;top:0;transform-origin:50% 100%;will-change:transform,opacity;opacity:0;visibility:hidden;pointer-events:none;";
    const card = document.createElement("div");
    card.style.cssText = [
      "position:relative",
      "display:flex",
      "align-items:center",
      "gap:6px",
      `height:${PILL_H}px`,
      "padding:0 10px 0 4px",
      "border-radius:999px",
      "background:#fff",
      `color:${INK}`,
      "box-shadow:0 6px 16px -6px rgba(24,32,43,0.45),0 1px 2px rgba(24,32,43,0.14)",
      `font:600 12.5px/1 ${FONT}`,
      "letter-spacing:-0.005em",
      "white-space:nowrap",
      "cursor:pointer",
      "user-select:none",
      "-webkit-user-select:none",
      "-webkit-touch-callout:none",
      "-webkit-tap-highlight-color:transparent",
      "touch-action:none",
      "pointer-events:none",
      "transition:transform 110ms cubic-bezier(.3,1.6,.5,1),background-color 110ms ease-out,box-shadow 110ms ease-out",
    ].join(";");
    // A generous tap target round the pill.
    const hit = document.createElement("span");
    hit.style.cssText = "position:absolute;inset:-9px -6px -12px -6px;border-radius:999px;";
    const icon = document.createElement("span");
    icon.style.cssText = "flex:none;display:grid;place-items:center;width:20px;height:20px;border-radius:999px;color:#fff;";
    const name = document.createElement("span");
    name.style.cssText = `display:block;max-width:${NAME_MAX}px;overflow:hidden;text-overflow:ellipsis;line-height:16px;`;
    const meta = document.createElement("span");
    meta.style.cssText = `flex:none;display:flex;align-items:center;gap:3px;color:${MUTED};font-weight:500;font-size:11.5px;line-height:16px;`;
    card.append(hit, icon, name, meta);
    const tail = document.createElement("div");
    tail.style.cssText = "width:12px;height:7px;margin:-1px auto 0;background:#fff;clip-path:polygon(0 0,100% 0,50% 100%);";
    root.append(card, tail);
    layer.appendChild(root);
    const s: Slot = { root, card, icon, name, meta, kind: 0, key: -1, wx: 0, wy: 0, wz: 0, a: 0, on: false, content: "", w: 0, lx: NaN, ly: NaN, ls: NaN, lo: NaN, shown: false };
    card.addEventListener("pointerdown", (e) => onCardDown(s, e));
    card.addEventListener("pointerup", (e) => release(e));
    card.addEventListener("wheel", onCardWheel, { passive: false });
    card.addEventListener("contextmenu", (e) => e.preventDefault());
    return s;
  }
  function freeSlot(): Slot | null {
    for (const s of slots) if (s.kind === 0) return s;
    if (slots.length < SLOTS) {
      const s = makeSlot();
      slots.push(s);
      return s;
    }
    return null;
  }
  function slotFor(kind: 1 | 2, key: number) {
    for (const s of slots) if (s.kind === kind && s.key === key) return s;
    return null;
  }

  // ---- content
  function fillPlace(s: Slot, i: number): boolean {
    const info = host.label(i);
    if (!info) return false;
    const look = placeLook(info.tile);
    const note = host.note?.(i) ?? null;
    const n = host.count(i);
    const meta = note ?? (n > 0 ? `${short(n)} ${look.outdoor ? "here" : "inside"}` : "");
    const content = `p|${i}|${info.name}|${meta}|${look.color}`;
    const nameMax = note ? NAME_MAX_NOTE : NAME_MAX;
    s.w = 4 + 20 + 6 + Math.min(nameMax, textW(info.name, 600, 12.5)) + (meta ? 6 + textW(meta, note ? 700 : 500, 11.5) : 0) + 10 + 2;
    if (content === s.content) return true;
    s.content = content;
    s.name.style.maxWidth = `${nameMax}px`;
    s.icon.style.width = s.icon.style.height = "20px";
    s.icon.style.background = look.color;
    s.icon.style.boxShadow = "";
    s.icon.style.margin = "0";
    s.icon.innerHTML = svgOf(look.icon, 12, 2.4);
    s.name.textContent = info.name;
    s.meta.textContent = meta;
    s.meta.style.color = note ? "#c2410c" : MUTED;
    s.meta.style.fontWeight = note ? "700" : "500";
    s.card.setAttribute("aria-label", meta ? `${info.name}, ${meta}` : info.name);
    return true;
  }
  function fillEvent(s: Slot, pinK: number) {
    const p = host.events.pin(pinK);
    const meta = p.claimable && p.coins > 0 ? `+${p.coins} mint` : "";
    const content = `e|${p.id}|${p.title}|${meta}|${p.color}`;
    s.w = 6 + 10 + 6 + Math.min(NAME_MAX, textW(p.title, 600, 12.5)) + 6 + (meta ? textW(meta, 700, 11.5) : 12) + 10 + 2;
    if (content === s.content) return;
    s.content = content;
    // A "live" dot in the event's colour.
    s.icon.style.width = s.icon.style.height = "9px";
    s.icon.style.margin = "0 1px 0 6px";
    s.icon.style.background = p.color;
    s.icon.style.boxShadow = `0 0 0 3px ${p.color}33`;
    s.icon.innerHTML = "";
    s.name.style.maxWidth = `${NAME_MAX}px`;
    s.name.textContent = p.title;
    if (meta) {
      s.meta.textContent = meta;
      s.meta.style.color = "#b8590b";
      s.meta.style.fontWeight = "700";
    } else {
      s.meta.innerHTML = svgOf(ChevronRight, 13, 2.4);
      s.meta.style.color = MUTED;
      s.meta.style.fontWeight = "500";
    }
    s.card.setAttribute("aria-label", `${p.title}, tap for details`);
  }

  // ---- projecting to the screen (scratch, no allocations)
  const v = new THREE.Vector3();
  const pt = { x: 0, y: 0, ppu: 0, depth: 0 };
  /** Screen position (px in the layer) of a world point, and pixels per world unit there. */
  function project(x: number, y: number, z: number): boolean {
    const cam = host.camera;
    v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    const depth = -v.z;
    if (depth < 0.2) return false;
    v.applyMatrix4(cam.projectionMatrix);
    pt.x = ((v.x + 1) / 2) * W;
    pt.y = ((1 - v.y) / 2) * H;
    pt.depth = depth;
    pt.ppu = H / (2 * Math.tan((cam.fov * Math.PI) / 360) * depth);
    return true;
  }
  /** Where an event's bubble hangs (just over its pin's round head), from pin k. */
  function pinTop(k: number): boolean {
    const p = host.events.pin(k);
    if (!project(p.x, p.y, p.z)) return false;
    const px = p.size * pt.ppu;
    pt.y -= PIN_HEAD.top * px + 3;
    return true;
  }
  function findPin(id: number) {
    const n = host.events.pinCount();
    for (let k = 0; k < n; k++) if (host.events.pin(k).id === id) return k;
    return -1;
  }

  // ---- picking which places / events get a bubble (a few times a second)
  let lastPick = -Infinity;
  let limit = 0;
  /** Rects taken this pick: bubbles chosen so far, and the pins' round heads. */
  const rects = new Float32Array(48 * 4);
  const rectOwner = new Int32Array(48);
  let rectN = 0;
  /** Best candidates (kept sorted by score): which, and where. */
  const CAND = 24;
  const candKey = new Int32Array(CAND);
  const candScore = new Float32Array(CAND);
  const candX = new Float32Array(CAND);
  const candY = new Float32Array(CAND);
  const candW = new Float32Array(CAND);
  const candRef = new Int32Array(CAND);
  const candWas = new Uint8Array(CAND);
  let candN = 0;
  const pickedKind = new Uint8Array(MAX_TOTAL);
  const pickedKey = new Int32Array(MAX_TOTAL);
  let pickedN = 0;
  const pickedNames: string[] = [];
  /** Bumped every pick (so CityView can redo things that depend on it, like hiding pills). */
  let picks = 0;
  /** The first pinRects rects are the pins' heads (the rest are bubbles). */
  let pinRects = 0;

  const wantFor = (zoom: number) => (zoom > 46 ? 0 : Math.max(1, Math.min(6, Math.round(6 - (zoom - 12) * 0.16))));

  /** Is there room for a bubble here? One already showing may crowd a little (so it doesn't flicker). */
  function fits(l: number, t: number, r: number, b: number, owner: number, was: boolean) {
    const out = was ? 8 : 0;
    if (l < safe.l - out || r > safe.r + out || t < safe.t - out || b > safe.b + out) return false;
    const gap = was ? -8 : GAP;
    for (let k = 0; k < rectN; k++) {
      if (owner >= 0 && rectOwner[k] === owner) continue;
      const o = k * 4;
      if (l < rects[o + 2] + gap && rects[o] < r + gap && t < rects[o + 3] + gap && rects[o + 1] < b + gap) return false;
    }
    return true;
  }
  function take(l: number, t: number, r: number, b: number, owner: number) {
    if (rectN >= 48) return;
    const o = rectN * 4;
    rects[o] = l;
    rects[o + 1] = t;
    rects[o + 2] = r;
    rects[o + 3] = b;
    rectOwner[rectN++] = owner;
  }
  function addCand(key: number, score: number, x: number, y: number, w: number, was: boolean, ref = -1) {
    if (candN === CAND && score >= candScore[CAND - 1]) return;
    let k = candN < CAND ? candN++ : CAND - 1;
    while (k > 0 && candScore[k - 1] > score) {
      candKey[k] = candKey[k - 1];
      candScore[k] = candScore[k - 1];
      candX[k] = candX[k - 1];
      candY[k] = candY[k - 1];
      candW[k] = candW[k - 1];
      candRef[k] = candRef[k - 1];
      candWas[k] = candWas[k - 1];
      k--;
    }
    candKey[k] = key;
    candScore[k] = score;
    candX[k] = x;
    candY[k] = y;
    candW[k] = w;
    candRef[k] = ref;
    candWas[k] = was ? 1 : 0;
  }

  /** A bubble's width before it has one: estimated from its text. */
  function placeWidth(i: number) {
    const s = slotFor(1, i);
    if (s) return s.w;
    const info = host.label(i);
    if (!info) return 0;
    const n = host.count(i);
    const note = host.note?.(i) ?? null;
    const meta = note ?? (n > 0 ? `${short(n)} inside` : "");
    return 4 + 20 + 6 + Math.min(note ? NAME_MAX_NOTE : NAME_MAX, textW(info.name, 600, 12.5)) + (meta ? 6 + textW(meta, note ? 700 : 500, 11.5) : 0) + 12;
  }

  function pick(places: boolean, events: boolean) {
    picks++;
    rectN = 0;
    pickedN = 0;
    const dist = host.camera.position.distanceTo(host.target);
    const zoom = host.zoom?.() ?? dist;
    // Fewer bubbles as you zoom out (changes only once clearly past a step, so it doesn't flicker).
    const up = wantFor(zoom * 1.08);
    const down = wantFor(zoom * 0.92);
    if (up > limit) limit = up;
    else if (down < limit) limit = down;
    const cx = W / 2;
    const cy = H / 2;
    const rx = Math.max(120, W * 0.36);
    const ry = Math.max(150, H * 0.3);

    // The pins' round heads are taken first: nothing should cover them.
    const pinN = host.events.pinCount();
    for (let k = 0; k < pinN; k++) {
      const p = host.events.pin(k);
      if (p.alpha < 0.3 || !project(p.x, p.y, p.z)) continue;
      const px = p.size * pt.ppu;
      const hy = pt.y - PIN_HEAD.up * px;
      const r = PIN_HEAD.r * px;
      take(pt.x - r, hy - r, pt.x + r, hy + r, p.id);
    }
    pinRects = rectN;

    // Events first (rarer, and they don't last).
    if (events && dist < 80) {
      candN = 0;
      for (let k = 0; k < pinN; k++) {
        const p = host.events.pin(k);
        if (p.alpha < 0.4 || !pinTop(k)) continue;
        const was = slotFor(2, p.id)?.on ?? false;
        const grow = was ? 1.2 : 1.1;
        const dx = (pt.x - cx) / (rx * grow);
        const dy = (pt.y - cy) / (ry * grow);
        const d = dx * dx + dy * dy;
        if (d > 1 || pt.depth > dist * 1.7 + 8) continue;
        const s = slotFor(2, p.id);
        const w = s && s.content ? s.w : 6 + 10 + 6 + Math.min(NAME_MAX, textW(p.title, 600, 12.5)) + 6 + (p.claimable && p.coins ? textW(`+${p.coins} mint`, 700, 11.5) : 12) + 12;
        addCand(p.id, Math.sqrt(d) - (was ? 0.2 : 0), pt.x, pt.y, w, was);
      }
      for (let k = 0; k < candN && pickedN < MAX_EVENTS; k++) {
        const x = candX[k];
        const y = candY[k];
        const w = candW[k];
        if (!fits(x - w / 2, y - BUBBLE_H, x + w / 2, y, candKey[k], candWas[k] === 1)) continue;
        take(x - w / 2, y - BUBBLE_H, x + w / 2, y, candKey[k]);
        pickedKind[pickedN] = 2;
        pickedKey[pickedN++] = candKey[k];
      }
    }

    // Then the places nearest the middle.
    const maxPlaces = places ? Math.min(limit, MAX_TOTAL - pickedN) : 0;
    if (maxPlaces > 0) {
      candN = 0;
      const spots = host.spots();
      const reach = dist * 0.95 + 6;
      const tx = host.target.x;
      const tz = host.target.z;
      for (let k = 0; k < spots.length; k++) {
        const sp = spots[k];
        if (Math.abs(sp.x - tx) > reach || Math.abs(sp.z - tz) > reach) continue;
        const was = slotFor(1, sp.i)?.on ?? false;
        if (!project(sp.x, sp.y, sp.z)) continue;
        const grow = was ? 1.2 : 1;
        const dx = (pt.x - cx) / (rx * grow);
        const dy = (pt.y - cy) / (ry * grow);
        const d = dx * dx + dy * dy;
        if (d > 1 || pt.depth > dist * (was ? 1.6 : 1.45) + 3) continue;
        // Nearest the middle wins; busy places, named ones and ones already showing get a
        // nudge, plain bits of park a small step back.
        const info = host.label(sp.i);
        if (!info) continue;
        const t = info.tile;
        const named = !!(t.name || t.structure || t.station);
        const plain = !named && placeLook(t).outdoor;
        const live = !!host.note?.(sp.i);
        const score = Math.sqrt(d) - (was ? 0.18 : 0) - (host.count(sp.i) > 0 ? 0.08 : 0) - (named ? 0.06 : 0) + (plain ? 0.08 : 0) - (live ? 0.35 : 0);
        if (candN === CAND && score >= candScore[CAND - 1]) continue;
        const w = placeWidth(sp.i);
        if (w <= 0) continue;
        addCand(sp.i, score, pt.x, pt.y, w, was, k);
      }
      let n = 0;
      pickedNames.length = 0;
      for (let k = 0; k < candN && n < maxPlaces; k++) {
        const x = candX[k];
        const y = candY[k] - 2;
        const w = candW[k];
        // Two lots of the same park read the same: one bubble is enough.
        const name = host.label(candKey[k])?.name ?? "";
        if (pickedNames.includes(name)) continue;
        if (!fits(x - w / 2, y - BUBBLE_H, x + w / 2, y, -1, candWas[k] === 1)) continue;
        // Not for a roof you can't see (a taller building is in front of it).
        if (host.hidden?.(spots[candRef[k]])) continue;
        take(x - w / 2, y - BUBBLE_H, x + w / 2, y, -1);
        pickedKind[pickedN] = 1;
        pickedKey[pickedN++] = candKey[k];
        pickedNames.push(name);
        n++;
      }
    }

    // Let go of the ones no longer picked, and give the new ones a slot.
    for (const s of slots) {
      if (s.kind === 0 || !s.on) continue;
      let keep = false;
      for (let k = 0; k < pickedN; k++) if (pickedKind[k] === s.kind && pickedKey[k] === s.key) keep = true;
      if (!keep) hideSlot(s);
    }
    for (let k = 0; k < pickedN; k++) {
      const kind = pickedKind[k] as 1 | 2;
      const key = pickedKey[k];
      let s = slotFor(kind, key);
      if (!s) {
        s = freeSlot();
        if (!s) continue;
        s.kind = kind;
        s.key = key;
        s.a = 0;
        s.content = "";
      }
      if (kind === 1) {
        const sp = spotOf(key);
        if (!sp || !fillPlace(s, key)) {
          s.kind = 0;
          continue;
        }
        s.wx = sp.x;
        s.wy = sp.y;
        s.wz = sp.z;
      } else {
        const pk = findPin(key);
        if (pk < 0) {
          s.kind = 0;
          continue;
        }
        fillEvent(s, pk);
      }
      if (!s.on) {
        s.on = true;
        s.card.style.pointerEvents = "auto";
      }
    }
  }
  function spotOf(i: number) {
    const spots = host.spots();
    for (let k = 0; k < spots.length; k++) if (spots[k].i === i) return spots[k];
    return null;
  }
  function hideSlot(s: Slot) {
    s.on = false;
    s.card.style.pointerEvents = "none";
    if (press && press.slot === s) setPressed(s, false);
  }

  // ---- every frame
  const easeOutBack = (t: number) => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };
  let active = 0;
  function update(dt: number, now: number, places: boolean, events: boolean) {
    const want = places || events;
    if (!want && !active) return;
    if (want && now - lastPick >= PICK_MS) {
      lastPick = now;
      pick(places, events);
    } else if (!want && active) {
      // Hidden (inside somewhere, riding...): everything pops out.
      for (const s of slots) if (s.kind !== 0 && s.on) hideSlot(s);
      lastPick = -Infinity;
    }
    if (!places) for (const s of slots) if (s.kind === 1 && s.on) hideSlot(s);
    if (!events) for (const s of slots) if (s.kind === 2 && s.on) hideSlot(s);
    active = 0;
    for (const s of slots) {
      if (s.kind === 0) continue;
      let fade = 1;
      let ok = false;
      if (s.kind === 2) {
        const k = findPin(s.key);
        if (k >= 0) {
          fade = Math.min(1, host.events.pin(k).alpha * 1.5);
          ok = pinTop(k);
        }
      } else {
        ok = project(s.wx, s.wy, s.wz);
        if (ok) pt.y -= 2;
      }
      if (!ok) {
        // Gone (or behind the camera): fade out where it was.
        if (s.on) hideSlot(s);
        pt.x = Number.isNaN(s.lx) ? -999 : s.lx;
        pt.y = Number.isNaN(s.ly) ? -999 : s.ly;
      }
      s.a = s.on ? Math.min(1, s.a + dt / 0.22) : Math.max(0, s.a - dt / 0.14);
      if (s.a <= 0 && !s.on) {
        s.kind = 0;
        s.key = -1;
        s.content = "";
        if (s.shown) {
          s.root.style.visibility = "hidden";
          s.root.style.opacity = "0";
          s.shown = false;
          s.lo = 0;
        }
        continue;
      }
      active++;
      if (!s.shown) {
        s.root.style.visibility = "visible";
        s.shown = true;
      }
      const scale = s.on ? 0.6 + 0.4 * easeOutBack(s.a) : 0.82 + 0.18 * s.a;
      const opacity = Math.min(1, s.a * 1.6) * fade;
      const x = Math.round(pt.x);
      const y = Math.round(pt.y);
      if (x !== s.lx || y !== s.ly || Math.abs(scale - s.ls) > 0.002) {
        s.root.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%) scale(${scale.toFixed(3)})`;
        s.lx = x;
        s.ly = y;
        s.ls = scale;
      }
      if (Math.abs(opacity - s.lo) > 0.01 || (opacity === 1 && s.lo !== 1)) {
        s.root.style.opacity = opacity >= 0.995 ? "1" : opacity.toFixed(3);
        s.lo = opacity >= 0.995 ? 1 : opacity;
      }
    }
  }

  // ---- taps
  type Press = { slot: Slot; kind: 1 | 2; key: number; x: number; y: number; t: number; id: number; live: boolean };
  let press: Press | null = null;
  function setPressed(s: Slot, on: boolean) {
    s.card.style.transform = on ? "scale(0.92)" : "";
    s.card.style.backgroundColor = on ? "#fff4dc" : "#fff";
    s.card.style.boxShadow = on
      ? `0 0 0 2px ${GOLD},0 4px 12px -6px rgba(24,32,43,0.45)`
      : "0 6px 16px -6px rgba(24,32,43,0.45),0 1px 2px rgba(24,32,43,0.14)";
  }
  function onCardDown(s: Slot, e: PointerEvent) {
    if (s.kind === 0 || !s.on || (e.pointerType === "mouse" && e.button !== 0)) {
      forward(e);
      return;
    }
    if (!press) {
      press = { slot: s, kind: s.kind, key: s.key, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, live: true };
      setPressed(s, true);
      window.addEventListener("pointermove", onPressMove, { passive: true });
      window.addEventListener("pointercancel", onPressCancel);
    }
    e.preventDefault();
    // Hand the press on to the map too, so a drag that starts here still pans it.
    forward(e);
  }
  function forward(e: PointerEvent) {
    try {
      host.canvas.dispatchEvent(new PointerEvent(e.type, e));
    } catch {
      // Old browsers: the bubble just doesn't pass drags on.
    }
  }
  function onCardWheel(e: WheelEvent) {
    e.preventDefault();
    try {
      host.canvas.dispatchEvent(new WheelEvent("wheel", e));
    } catch {
      // ignore
    }
  }
  function onPressMove(e: PointerEvent) {
    if (!press || e.pointerId !== press.id || !press.live) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_MOVE) {
      press.live = false;
      setPressed(press.slot, false);
    }
  }
  function endPress() {
    if (!press) return;
    setPressed(press.slot, false);
    press = null;
    window.removeEventListener("pointermove", onPressMove);
    window.removeEventListener("pointercancel", onPressCancel);
  }
  function onPressCancel(e: PointerEvent) {
    if (press && e.pointerId === press.id) endPress();
  }
  /**
   * A pointer went up. If it went down on a bubble, this was the bubble's: a quick tap opens
   * it (returns true either way, so the map below doesn't act on it too).
   */
  function release(e: PointerEvent): boolean {
    if (!press || e.pointerId !== press.id) return false;
    const p = press;
    endPress();
    const tap = p.live && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TAP_MOVE && performance.now() - p.t < TAP_MS;
    if (tap) {
      if (p.kind === 1) host.onBuilding(p.key);
      else host.onEvent(p.key);
    }
    return true;
  }

  /** Is a bubble showing for this place? */
  function showsPlace(i: number) {
    const s = slotFor(1, i);
    return !!s && s.on;
  }
  /**
   * Would something drawn at world point (x, y, z), w × h world units, bottom-centred there
   * (like the count pills), sit under a bubble? (Uses this pick's bubbles.)
   */
  function covers(x: number, y: number, z: number, w: number, h: number) {
    if (!pickedN || !project(x, y, z)) return false;
    const hw = (w * pt.ppu) / 2;
    const hh = h * pt.ppu;
    const l = pt.x - hw;
    const r = pt.x + hw;
    const t = pt.y - hh;
    const b = pt.y;
    for (let k = pinRects; k < rectN; k++) {
      const o = k * 4;
      if (l < rects[o + 2] && rects[o] < r && t < rects[o + 3] && rects[o + 1] < b) return true;
    }
    return false;
  }
  function dispose() {
    endPress();
    layer.remove();
    slots.length = 0;
  }

  return {
    update,
    resize,
    release,
    showsPlace,
    covers,
    /** How many picks so far (changes about five times a second while bubbles are wanted). */
    picks: () => picks,
    /** Is any bubble on screen? */
    active: () => active > 0,
    dispose,
  };
}
