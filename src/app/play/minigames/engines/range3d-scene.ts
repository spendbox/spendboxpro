// The 3D shooting range behind the "range3d" engine (./range3d.tsx), with no React in it so it
// can also be drawn on its own (tests, screenshots). It holds:
//
// - planRounds(seed): every round's targets, where they stand and when they turn or run. The
//   same seed always gives the same plan, so scores can be compared between players.
// - RangeWorld: the indoor range (bench, lanes, floor markings, baffles, lights, berm), the
//   paper targets (scoring rings drawn on a canvas, bullet holes stay on the paper), the gun in
//   your hands (recoil, muzzle flash, brass) and the raycast that says what a shot hit.
//
// Units are metres. You stand at the bench at z = 0 looking down the range (-z).

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { makeRng } from "../rng";

export type Weapon = "pistol" | "carbine" | "rifle";

/** How each gun handles: recoil kick and sway (degrees), seconds between shots, reload time. */
export const WEAPONS: Record<Weapon, { label: string; kick: number; sway: number; rof: number; reload: number; hole: number }> = {
  pistol: { label: "Pistol", kick: 1.0, sway: 0.09, rof: 0.22, reload: 1.15, hole: 0.017 },
  carbine: { label: "Carbine", kick: 0.5, sway: 0.07, rof: 0.14, reload: 1.35, hole: 0.02 },
  rifle: { label: "Rifle", kick: 1.5, sway: 0.05, rof: 0.6, reload: 1.5, hole: 0.026 },
};

export type Motion =
  | { kind: "static" }
  /** Turns to face you at `on`, turns away again at `off` (round seconds). */
  | { kind: "turn"; slot: number; on: number; off: number }
  /** Runs along a rail from x0 to x1 between t0 and t1. */
  | { kind: "rail"; t0: number; t1: number; x0: number; x1: number };

export type TargetSpec = {
  id: number;
  /** A hostage (no-shoot): hitting it costs points. */
  hostage: boolean;
  /** The paper's centre. */
  x: number;
  y: number;
  z: number;
  /** The paper's size. */
  w: number;
  h: number;
  /** The scoring rings' outer radius. */
  ringR: number;
  motion: Motion;
};

export type RoundPlan = {
  n: number;
  name: string;
  /** Gun and distance, e.g. "Pistol · 10 m". */
  tag: string;
  brief: string;
  weapon: Weapon;
  /** Field of view while playing (degrees, vertical), and through the scope (0: no scope). */
  fov: number;
  scopeFov: number;
  seconds: number;
  /** Rounds in a magazine, and magazines. */
  mag: number;
  mags: number;
  /** Ring points are multiplied by this. */
  mult: number;
  /** Points lost for hitting a hostage. */
  penalty: number;
  /** Where the aim starts, and how far you can turn (degrees either side). */
  aim: [number, number, number];
  yawLimit: number;
  /** Turning-target stands (x positions). */
  slots: number[];
  targets: TargetSpec[];
};

/** The scoring ring for a hit `d` outer radii from the centre: 10 (bullseye) to 1, 0 off the rings. */
export function ringOf(d: number) {
  if (d <= BULL) return 10;
  if (d > 1) return 0;
  return Math.max(1, 10 - Math.ceil((d - BULL) / RING_STEP));
}
const BULL = 0.18;
const RING_STEP = (1 - BULL) / 9;
/** Outer radius of ring k (as a fraction of the rings' radius). */
const ringRadius = (k: number) => (k >= 10 ? BULL : BULL + (10 - k) * RING_STEP);

/** Where the rings' centre sits on a paper (local y): as far from the top as from the sides. */
export const ringCentreY = (s: { w: number; h: number }) => s.h / 2 - s.w / 2;

/** Every round, from a seed. */
export function planRounds(seed: number): RoundPlan[] {
  const r = makeRng((seed ^ 0x5eed1e) >>> 0);
  let id = 1;

  // Round 1: three static papers at 10 m, all the time you need (nearly).
  const r1: TargetSpec[] = [-1.45, 0, 1.45].map((x) => ({
    id: id++,
    hostage: false,
    x,
    y: 1.45 + (r() - 0.5) * 0.22,
    z: -10,
    w: 0.95,
    h: 1.2,
    ringR: 0.42,
    motion: { kind: "static" },
  }));

  // Round 2: turning targets at 25 m; each faces you for about two seconds. Some are hostages.
  const slots = [-2.8, -0.95, 0.95, 2.8];
  const busy = slots.map(() => 0);
  const r2: TargetSpec[] = [];
  let t = 1.3;
  let last = -1;
  let n = 0;
  const face = (slot: number, at: number, hostage: boolean) => {
    const dur = Math.max(1.55, 2.3 - n * 0.06);
    r2.push({ id: id++, hostage, x: slots[slot], y: 1.5, z: -25, w: 1.3, h: 1.6, ringR: 0.6, motion: { kind: "turn", slot, on: at, off: at + dur } });
    busy[slot] = at + dur + 0.7;
  };
  while (t < 26.5) {
    const free = slots.map((_, i) => i).filter((i) => busy[i] <= t && i !== last);
    if (!free.length) {
      t += 0.4;
      continue;
    }
    const i = free[Math.floor(r() * free.length)];
    face(i, t, n >= 2 && r() < 0.27);
    last = i;
    n++;
    // Now and then two at once (often a hostage next to a real one).
    if (n > 3 && r() < 0.38) {
      const more = slots.map((_, k) => k).filter((k) => busy[k] <= t);
      if (more.length) face(more[Math.floor(r() * more.length)], t + 0.15, r() < 0.55);
    }
    t += 1.5 + r() * 1.0;
  }

  // Round 3: targets running on rails at 50 m (and hostages on the rail in front).
  const r3: TargetSpec[] = [];
  t = 1.2;
  n = 0;
  const SPAN = 6.2;
  while (t < 31) {
    const dir = r() < 0.5 ? 1 : -1;
    const speed = 0.95 + n * 0.08 + r() * 0.45;
    const dur = (SPAN * 2) / speed;
    const hostage = n >= 1 && r() < 0.22;
    r3.push({ id: id++, hostage, x: 0, y: 1.55, z: -50, w: 1.4, h: 1.7, ringR: 0.62, motion: { kind: "rail", t0: t, t1: t + dur, x0: -dir * SPAN, x1: dir * SPAN } });
    if (n >= 1 && !hostage && r() < 0.45) {
      // A hostage crossing the other way, a little later, on the nearer rail.
      const hs = 0.8 + r() * 0.5;
      const h0 = t + 0.8 + r() * 1.5;
      r3.push({ id: id++, hostage: true, x: 0, y: 1.5, z: -47.5, w: 1.3, h: 1.6, ringR: 0.6, motion: { kind: "rail", t0: h0, t1: h0 + (SPAN * 2) / hs, x0: dir * SPAN, x1: -dir * SPAN } });
    }
    t += dur * 0.55 + r() * 0.9;
    n++;
  }

  return [
    {
      n: 1,
      name: "Static",
      tag: "Pistol · 10 m",
      brief: "Three paper targets. 10 shots. Aim for the orange bullseye.",
      weapon: "pistol",
      fov: 30,
      scopeFov: 0,
      seconds: 30,
      mag: 5,
      mags: 2,
      mult: 1,
      penalty: 0,
      aim: [0, 1.42, -10],
      yawLimit: 12,
      slots: [],
      targets: r1,
    },
    {
      n: 2,
      name: "Pop-ups",
      tag: "Carbine · 25 m",
      brief: "Targets turn to face you for 2 seconds. Blue hostages: don't shoot!",
      weapon: "carbine",
      fov: 22,
      scopeFov: 0,
      seconds: 30,
      mag: 8,
      mags: 2,
      mult: 1,
      penalty: 25,
      aim: [0, 1.5, -25],
      yawLimit: 11,
      slots,
      targets: r2,
    },
    {
      n: 3,
      name: "Movers",
      tag: "Rifle · 50 m",
      brief: "Targets run on rails. Use the scope and lead them. Hits score double!",
      weapon: "rifle",
      fov: 30,
      scopeFov: 8,
      seconds: 36,
      mag: 5,
      mags: 2,
      mult: 2,
      penalty: 25,
      aim: [0, 1.55, -50],
      yawLimit: 10,
      slots: [],
      targets: r3,
    },
  ];
}

/** Where a target is (x), how much it faces you (0 edge-on, 1 square on) and if it's out at round time t. */
export function targetState(s: TargetSpec, t: number): { x: number; face: number; shown: boolean } {
  const m = s.motion;
  if (m.kind === "static") return { x: s.x, face: 1, shown: true };
  if (m.kind === "turn") {
    const TURN = 0.22;
    const face = Math.max(0, Math.min(1, (t - m.on) / TURN, (m.off - t) / TURN));
    return { x: s.x, face, shown: t > m.on - 0.4 && t < m.off + 0.4 };
  }
  const k = (t - m.t0) / (m.t1 - m.t0);
  return { x: m.x0 + (m.x1 - m.x0) * Math.max(0, Math.min(1, k)), face: 1, shown: k >= 0 && k <= 1 };
}

export type ShotResult =
  | { kind: "ring"; spec: TargetSpec; ring: number }
  | { kind: "hostage"; spec: TargetSpec }
  | { kind: "miss"; steel: boolean };

// ------------------------------------------------------------------------------- textures

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, x: c.getContext("2d")! };
}

/** Speckles of light and dark (concrete, rubber, paper). */
function speckle(x: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, rnd: () => number) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    x.fillStyle = `rgba(${v},${v},${v},${a * rnd()})`;
    const s = 1 + rnd() * 2.2;
    x.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

function drawScoringPaper(x: CanvasRenderingContext2D, W: number, H: number, s: TargetSpec, label: string) {
  const ppm = W / s.w;
  x.fillStyle = "#efe9dc";
  x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(255,255,255,.25)");
  g.addColorStop(1, "rgba(120,100,70,.12)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const rnd = makeRng(s.id * 97 + 3);
  speckle(x, W, H, 260, 0.06, rnd);
  const cx = W / 2;
  const cy = (s.h / 2 - ringCentreY(s)) * ppm;
  const R = s.ringR * ppm;
  for (let k = 1; k <= 10; k++) {
    const rr = ringRadius(k) * R;
    x.beginPath();
    x.arc(cx, cy, rr, 0, Math.PI * 2);
    x.fillStyle = k === 10 ? "#ff6a1a" : k >= 5 ? "#1b1d21" : "#f7f3ea";
    x.fill();
    x.lineWidth = Math.max(1, W / 220);
    x.strokeStyle = k > 5 ? "rgba(235,228,214,.85)" : "#26282c";
    x.stroke();
  }
  // The X ring and the ring numbers.
  x.beginPath();
  x.arc(cx, cy, BULL * R * 0.45, 0, Math.PI * 2);
  x.strokeStyle = "rgba(0,0,0,.45)";
  x.lineWidth = Math.max(1, W / 260);
  x.stroke();
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `700 ${Math.round(R * 0.075)}px system-ui, sans-serif`;
  for (let k = 1; k <= 8; k++) {
    const mid = ((ringRadius(k) + ringRadius(k + 1)) / 2) * R;
    x.fillStyle = k >= 5 ? "#ebe4d6" : "#26282c";
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.fillText(String(k), cx + dx * mid, cy + dy * mid);
  }
  // Corner marks, the range's name, and an orange strip.
  x.strokeStyle = "#26282c";
  x.lineWidth = Math.max(1, W / 200);
  const m = W * 0.06;
  const L = W * 0.06;
  for (const [ax, ay] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) {
    x.beginPath();
    x.moveTo(ax - L / 2, ay);
    x.lineTo(ax + L / 2, ay);
    x.moveTo(ax, ay - L / 2);
    x.lineTo(ax, ay + L / 2);
    x.stroke();
  }
  const below = cy + R + (H - cy - R) / 2;
  x.fillStyle = "#26282c";
  x.font = `800 ${Math.round(W * 0.062)}px system-ui, sans-serif`;
  x.fillText("SPENDBOX RANGE", cx, below - W * 0.025);
  x.font = `600 ${Math.round(W * 0.042)}px system-ui, sans-serif`;
  x.fillStyle = "#5c5f66";
  x.fillText(label, cx, below + W * 0.045);
  x.fillStyle = "#e8590c";
  x.fillRect(0, H - W * 0.025, W, W * 0.025);
}

function drawHostagePaper(x: CanvasRenderingContext2D, W: number, H: number, s: TargetSpec) {
  x.fillStyle = "#eef1f3";
  x.fillRect(0, 0, W, H);
  speckle(x, W, H, 200, 0.05, makeRng(s.id * 31 + 7));
  const cx = W / 2;
  const fill = "#4dabf7";
  const edge = "#1864ab";
  x.lineJoin = "round";
  x.lineCap = "round";
  // Arms up.
  x.strokeStyle = edge;
  x.lineWidth = W * 0.13;
  for (const sx of [-1, 1]) {
    x.beginPath();
    x.moveTo(cx + sx * W * 0.2, H * 0.4);
    x.lineTo(cx + sx * W * 0.33, H * 0.12);
    x.stroke();
  }
  x.strokeStyle = fill;
  x.lineWidth = W * 0.1;
  for (const sx of [-1, 1]) {
    x.beginPath();
    x.moveTo(cx + sx * W * 0.2, H * 0.4);
    x.lineTo(cx + sx * W * 0.33, H * 0.12);
    x.stroke();
  }
  // Head and body.
  x.fillStyle = fill;
  x.strokeStyle = edge;
  x.lineWidth = W * 0.015;
  x.beginPath();
  x.arc(cx, H * 0.24, W * 0.12, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.beginPath();
  x.roundRect(cx - W * 0.26, H * 0.36, W * 0.52, H * 0.6, W * 0.12);
  x.fill();
  x.stroke();
  // "NO SHOOT".
  x.fillStyle = "#e03131";
  x.fillRect(0, H * 0.55, W, H * 0.12);
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `900 ${Math.round(W * 0.12)}px system-ui, sans-serif`;
  x.fillText("NO SHOOT", cx, H * 0.61);
  x.fillStyle = "#c92a2a";
  x.font = `900 ${Math.round(W * 0.085)}px system-ui, sans-serif`;
  x.fillText("HOSTAGE", cx, H * 0.05);
  x.fillStyle = "#1864ab";
  x.fillRect(0, H - W * 0.025, W, W * 0.025);
}

/** A bullet hole, torn paper around it. */
function drawHole(x: CanvasRenderingContext2D, px: number, py: number, r: number) {
  x.fillStyle = "rgba(60,50,40,.28)";
  x.beginPath();
  x.arc(px, py, r * 1.9, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#d9d2c3";
  x.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = r * (1.25 + ((i * 7) % 3) * 0.16);
    if (i === 0) x.moveTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
    else x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
  x.fillStyle = "#0b0b0c";
  x.beginPath();
  x.arc(px, py, r, 0, Math.PI * 2);
  x.fill();
}

// ------------------------------------------------------------------------------- the world

type Disposable = { dispose(): void };

type Live = {
  spec: TargetSpec;
  /** What moves (rail carriage) or turns (paper on its frame). */
  holder: THREE.Object3D;
  paper: THREE.Mesh;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  W: number;
  H: number;
  face: number;
};

type Fx = { obj: THREE.Object3D; life: number; age: number; v?: THREE.Vector3; spin?: THREE.Vector3 };

/** Eye height and the camera's pull-back between rounds. */
const EYE = new THREE.Vector3(0, 1.52, 0);
const BACK = new THREE.Vector3(0, 1.68, 2.15);

export class RangeWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 0.75, 0.05, 160);
  readonly gunScene = new THREE.Scene();
  readonly gunCam = new THREE.PerspectiveCamera(46, 0.75, 0.01, 6);

  private bin: Disposable[] = [];
  private roundBin: Disposable[] = [];
  private env = new THREE.Group();
  private round = new THREE.Group();
  private fxGroup = new THREE.Group();
  private live: Live[] = [];
  private turners: THREE.Object3D[] = [];
  private box = new THREE.BoxGeometry(1, 1, 1);
  private mats = new Map<string, THREE.Material>();
  private anis: number;
  private envTex: THREE.Texture | null = null;

  private guns = {} as Record<Weapon, THREE.Group>;
  private weapon: Weapon = "pistol";
  private flash: THREE.Sprite;
  private gunFlash: THREE.PointLight;
  private rangeFlash: THREE.PointLight;
  private casings: Fx[] = [];
  private puffs: Fx[] = [];
  private gs = { kick: 0, flash: 0, reload: -1, reloadDur: 1, lower: 1, lowerTo: 1, lagX: 0, lagY: 0, clock: 0 };
  private ray = new THREE.Raycaster();
  /** 0: pulled back between rounds, 1: at the bench aiming. */
  private k = 0;
  private plan: RoundPlan | null = null;

  constructor(opts: { anisotropy?: number } = {}) {
    this.anis = opts.anisotropy ?? 4;
    this.bin.push(this.box);
    this.camera.rotation.order = "YXZ";
    this.scene.background = new THREE.Color("#14171c");
    this.scene.fog = new THREE.Fog("#14171c", 38, 120);
    this.scene.add(this.env, this.round, this.fxGroup);
    this.buildRange();
    this.buildLights();
    this.buildGuns();
    // Muzzle flash, the light it throws, and pools of brass and dust.
    const flashTex = this.track(this.flashTexture());
    this.flash = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: flashTex, color: "#ffd9a0", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })));
    this.flash.visible = false;
    this.gunFlash = new THREE.PointLight("#ffb366", 0, 2.5, 2);
    this.gunScene.add(this.gunFlash);
    this.rangeFlash = new THREE.PointLight("#ffb366", 0, 9, 2);
    this.rangeFlash.position.set(0.25, 1.35, -0.9);
    this.scene.add(this.rangeFlash);
    const brassGeo = this.track(new THREE.CylinderGeometry(0.0048, 0.0048, 0.02, 8));
    const brass = this.mat("brass", "#c9a24a", 0.35, 0.9);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(brassGeo, brass);
      m.visible = false;
      this.gunScene.add(m);
      this.casings.push({ obj: m, life: 0, age: 1, v: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    const dustTex = this.track(this.dustTexture());
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: dustTex, color: "#b9b2a6", transparent: true, depthWrite: false, opacity: 0 })));
      s.visible = false;
      this.fxGroup.add(s);
      this.puffs.push({ obj: s, life: 0.6, age: 1 });
    }
    this.setWeapon("pistol");
  }

  /** Reflections for the metal (needs the renderer once). */
  attach(renderer: THREE.WebGLRenderer) {
    if (this.envTex) return;
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const walls = new THREE.MeshBasicMaterial({ color: "#2a2e35", side: THREE.BackSide });
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 4.6) });
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.8) });
    const room = new THREE.Mesh(geo, walls);
    room.scale.set(12, 5, 14);
    room.position.y = 2;
    es.add(room);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(geo, lamp);
      l.scale.set(9, 0.1, 0.5);
      l.position.set(0, 4.3, -5 + i * 3.4);
      es.add(l);
    }
    const w = new THREE.Mesh(geo, warm);
    w.scale.set(0.2, 2, 6);
    w.position.set(5.8, 2, 0);
    es.add(w);
    this.envTex = pm.fromScene(es, 0.03).texture;
    geo.dispose();
    walls.dispose();
    lamp.dispose();
    warm.dispose();
    pm.dispose();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.35;
    this.gunScene.environment = this.envTex;
    this.gunScene.environmentIntensity = 0.9;
  }

  setSize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gunCam.aspect = w / h;
    this.gunCam.updateProjectionMatrix();
  }

  // ----------------------------------------------------------------- helpers

  private track<T extends Disposable>(x: T, bin = this.bin): T {
    bin.push(x);
    return x;
  }
  private mat(key: string, color: string, rough = 0.8, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
    let m = this.mats.get(key);
    if (!m) {
      m = this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
      this.mats.set(key, m);
    }
    return m;
  }
  private basic(key: string, color: THREE.ColorRepresentation, extra: THREE.MeshBasicMaterialParameters = {}) {
    let m = this.mats.get(key);
    if (!m) {
      m = this.track(new THREE.MeshBasicMaterial({ color, ...extra }));
      this.mats.set(key, m);
    }
    return m;
  }
  /** A box: size, then position, into `parent`. */
  private cube(parent: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
    const b = new THREE.Mesh(this.box, m);
    b.scale.set(sx, sy, sz);
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  }
  private rbox(parent: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.004) {
    const geo = this.track(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)));
    const b = new THREE.Mesh(geo, m);
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  }
  /** A cylinder along z (barrels, scopes). */
  private tube(parent: THREE.Object3D, m: THREE.Material, r0: number, r1: number, len: number, x: number, y: number, z: number, seg = 14) {
    const geo = this.track(new THREE.CylinderGeometry(r1, r0, len, seg));
    const c = new THREE.Mesh(geo, m);
    c.rotation.x = -Math.PI / 2;
    c.position.set(x, y, z);
    parent.add(c);
    return c;
  }
  /** A cylinder from a to b. */
  private limb(parent: THREE.Object3D, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
    const len = a.distanceTo(b);
    const geo = this.track(new THREE.CylinderGeometry(r1, r0, len, 12));
    const c = new THREE.Mesh(geo, m);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parent.add(c);
    return c;
  }
  private canvasTex(c: HTMLCanvasElement, repeat?: [number, number], bin = this.bin) {
    const t = this.track(new THREE.CanvasTexture(c), bin);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.anis;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  }
  private plane(parent: THREE.Object3D, m: THREE.Material, w: number, h: number) {
    const geo = this.track(new THREE.PlaneGeometry(w, h));
    const p = new THREE.Mesh(geo, m);
    parent.add(p);
    return p;
  }

  // ----------------------------------------------------------------- the range

  private concrete() {
    const { c, x } = canvas(512, 512);
    const rnd = makeRng(11);
    x.fillStyle = "#7d8186";
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      const g = x.createRadialGradient(rnd() * 512, rnd() * 512, 0, rnd() * 512, rnd() * 512, 60 + rnd() * 120);
      const v = rnd() < 0.5 ? "0,0,0" : "255,255,255";
      g.addColorStop(0, `rgba(${v},${0.05 + rnd() * 0.05})`);
      g.addColorStop(1, `rgba(${v},0)`);
      x.fillStyle = g;
      x.fillRect(0, 0, 512, 512);
    }
    speckle(x, 512, 512, 5000, 0.12, rnd);
    // Slab joints.
    x.fillStyle = "rgba(30,32,36,.55)";
    x.fillRect(0, 0, 512, 2);
    x.fillRect(0, 0, 2, 512);
    return c;
  }
  private panels() {
    const { c, x } = canvas(256, 256);
    x.fillStyle = "#373d46";
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2; i++) {
      x.fillStyle = i ? "#3d444e" : "#333941";
      x.fillRect(i * 128 + 4, 0, 120, 256);
    }
    speckle(x, 256, 256, 1500, 0.08, makeRng(5));
    x.fillStyle = "#22262c";
    x.fillRect(0, 0, 4, 256);
    x.fillRect(128, 0, 4, 256);
    x.fillStyle = "rgba(0,0,0,.25)";
    x.fillRect(0, 200, 256, 56);
    return c;
  }
  private hazard() {
    const { c, x } = canvas(256, 32);
    x.fillStyle = "#f2b705";
    x.fillRect(0, 0, 256, 32);
    x.fillStyle = "#1b1d21";
    for (let i = -2; i < 12; i++) {
      x.beginPath();
      x.moveTo(i * 32, 32);
      x.lineTo(i * 32 + 16, 32);
      x.lineTo(i * 32 + 48, 0);
      x.lineTo(i * 32 + 32, 0);
      x.fill();
    }
    return c;
  }
  /** Big letters painted on the floor (stretched so they read from the bench). */
  private floorText(text: string, colour = "#f1f3f5") {
    const { c, x } = canvas(256, 512);
    x.clearRect(0, 0, 256, 512);
    x.save();
    x.translate(128, 256);
    x.scale(1, 2.6);
    x.fillStyle = colour;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = "900 92px system-ui, sans-serif";
    x.fillText(text, 0, 0);
    x.restore();
    // Wear.
    x.globalCompositeOperation = "destination-out";
    speckle(x, 256, 512, 1800, 0.6, makeRng(text.length * 13));
    x.globalCompositeOperation = "source-over";
    return c;
  }
  private sign(text: string, bg: string, fg: string, w = 512, h = 160) {
    const { c, x } = canvas(w, h);
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = fg;
    x.lineWidth = 8;
    x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = fg;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = `900 ${Math.round(h * 0.52)}px system-ui, sans-serif`;
    x.fillText(text, w / 2, h / 2 + 4);
    return c;
  }
  private flashTexture() {
    const { c, x } = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,240,1)");
    g.addColorStop(0.25, "rgba(255,200,110,.9)");
    g.addColorStop(1, "rgba(255,120,30,0)");
    x.fillStyle = g;
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 22 : 64;
      x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private dustTexture() {
    const { c, x } = canvas(64, 64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private buildRange() {
    const E = this.env;
    const HW = 10; // half the hall's width
    const LEN = 58;
    // Floor.
    const floorMat = this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(this.concrete(), [5, 15]), roughness: 0.85, metalness: 0 }));
    const floor = this.plane(E, floorMat, HW * 2, LEN + 4);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -LEN / 2 + 2);
    // Painted lines: lanes (yellow), distances (white), the firing line (red).
    const yellow = this.mat("paint-y", "#e9b10a", 0.7);
    const white = this.mat("paint-w", "#e9ecef", 0.7);
    const red = this.mat("paint-r", "#e03131", 0.7);
    for (const lx of [-4.9, 4.9]) this.cube(E, yellow, 0.12, 0.004, 52, lx, 0.002, -27);
    for (const lx of [-9.4, 9.4]) this.cube(E, yellow, 0.08, 0.004, 52, lx, 0.002, -27);
    for (const dz of [-10, -25, -50]) this.cube(E, white, 9.8, 0.004, 0.12, 0, 0.002, dz + 0.9);
    for (const dz of [-5, -15, -20, -30, -35, -40, -45]) this.cube(E, this.mat("paint-wf", "#9aa0a6", 0.8), 9.8, 0.003, 0.05, 0, 0.0015, dz);
    this.cube(E, red, 9.8, 0.004, 0.14, 0, 0.002, -1.45);
    for (const [txt, dz, w, d] of [["10 m", -8.6, 1.7, 2.6], ["25 m", -22.3, 3.4, 5.2], ["50 m", -46.2, 5.4, 8]] as const) {
      const p = this.plane(E, this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(this.floorText(txt)), transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })), w, d);
      p.rotation.x = -Math.PI / 2;
      p.position.set(0, 0.004, dz);
      p.renderOrder = 1;
    }
    // Walls with acoustic panels, the ceiling, and the berm at the end.
    const wallMat = this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(this.panels(), [LEN / 2.4, 1]), roughness: 0.92 }));
    for (const sx of [-1, 1]) {
      const w = this.plane(E, wallMat, LEN + 4, 4.6);
      w.rotation.y = -sx * (Math.PI / 2);
      w.position.set(sx * HW, 2.3, -LEN / 2 + 2);
      this.cube(E, this.mat("skirt", "#23272d", 0.7), 0.06, 0.32, LEN + 4, sx * (HW - 0.03), 0.16, -LEN / 2 + 2);
    }
    const ceil = this.plane(E, this.mat("ceil", "#2a2e35", 1), HW * 2, LEN + 4);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 4.6, -LEN / 2 + 2);
    const back = this.plane(E, this.mat("backwall", "#2a2d31", 0.95), HW * 2, 4.6);
    back.position.set(0, 2.3, -LEN - 0.5);
    const near = this.plane(E, this.mat("nearwall", "#2b3038", 0.95), HW * 2, 4.6);
    near.rotation.y = Math.PI;
    near.position.set(0, 2.3, 2.6);
    // Berm: a slope of dark rubber, a steel deflector over it, a hazard kick plate in front.
    const rub = makeRng(23);
    const { c: bc, x: bx } = canvas(256, 256);
    bx.fillStyle = "#2b2623";
    bx.fillRect(0, 0, 256, 256);
    speckle(bx, 256, 256, 4000, 0.25, rub);
    const berm = this.cube(E, this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(bc, [8, 2]), roughness: 1 })), HW * 2, 0.8, 5.4, 0, 1.55, -LEN + 3.4);
    berm.rotation.x = Math.atan2(3.4, 4);
    this.cube(E, this.mat("steel", "#5d646d", 0.45, 0.7), HW * 2, 0.06, 1.8, 0, 3.75, -LEN + 1.6).rotation.x = -0.45;
    const hz = this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(this.hazard(), [16, 1]), roughness: 0.6 }));
    this.cube(E, hz, HW * 2, 0.3, 0.08, 0, 0.15, -LEN + 6);
    // Wing walls at 47 m (the runners come out from behind them).
    const conc = this.mat("concrete-wall", "#6a7078", 0.9);
    const hz2 = this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(this.hazard(), [4, 1]), roughness: 0.6 }));
    for (const sx of [-1, 1]) {
      this.cube(E, conc, 4.4, 2.6, 0.3, sx * 7.8, 1.3, -46.6);
      this.cube(E, hz2, 4.4, 0.18, 0.32, sx * 7.8, 2.5, -46.6);
    }
    // Rails for the runners.
    const railMat = this.mat("rail", "#8d949c", 0.35, 0.85);
    for (const rz of [-50, -47.5]) {
      for (const o of [-0.12, 0.12]) this.cube(E, railMat, 19, 0.05, 0.04, 0, 0.05, rz + o);
      for (let sx = -9; sx <= 9; sx += 1.2) this.cube(E, this.mat("sleeper", "#2b2e33", 0.9), 0.1, 0.03, 0.45, sx, 0.015, rz);
    }
    // Ceiling baffles (angled steel and acoustic board) and the lights between them.
    const baffle = this.mat("baffle", "#454c57", 0.85, 0.1);
    const lip = this.mat("baffle-lip", "#4a525d", 0.6, 0.4);
    const lamp = this.basic("lamp", new THREE.Color(1.6, 1.58, 1.5), { toneMapped: false });
    const housing = this.mat("housing", "#15171a", 0.6, 0.3);
    for (let z = -2.5, i = 0; z > -LEN + 4; z -= 3.3, i++) {
      const b = this.cube(E, baffle, HW * 2, 1.25, 0.06, 0, 3.95, z);
      b.rotation.x = 0.62;
      this.cube(E, lip, HW * 2, 0.05, 0.1, 0, 3.45, z + 0.32);
      if (i % 2 === 0) {
        for (const lx of [-6.5, 0, 6.5]) {
          this.cube(E, housing, 5.6, 0.06, 0.2, lx, 3.62, z - 1.65);
          this.cube(E, lamp, 5.4, 0.025, 0.12, lx, 3.585, z - 1.65);
        }
      }
    }
    // Target carrier tracks over our lane, and over the lanes either side.
    const track = this.mat("track", "#59616b", 0.5, 0.6);
    for (const tx of [-1.45, 0, 1.45, -7.2, 7.2]) this.cube(E, track, 0.05, 0.07, 13, tx, 3.3, -7.5);
    for (const tx of [-7.2, 7.2]) this.cube(E, track, 0.08, 0.1, 30, tx, 3.25, -16);
    // The booth: bench, partitions, lane number, and a few things on the bench.
    const top = this.mat("bench", "#4a515b", 0.5, 0.2);
    const panel = this.mat("booth", "#3a414b", 0.85);
    const orange = this.mat("orange", "#e8590c", 0.5);
    this.cube(E, top, 2.1, 0.06, 0.6, 0, 1.2, -1.05);
    this.cube(E, orange, 2.1, 0.025, 0.015, 0, 1.185, -1.355);
    this.cube(E, panel, 2.1, 1.17, 0.05, 0, 0.585, -1.3);
    this.cube(E, top, 2.0, 0.035, 0.3, 0, 0.62, -1.12);
    this.cube(E, orange, 2.1, 0.05, 0.01, 0, 1.0, -1.27);
    this.cube(E, this.mat("ammo", "#4c5a3a", 0.7), 0.3, 0.18, 0.2, 0.55, 0.73, -1.12);
    for (const sx of [-1, 1]) {
      this.cube(E, panel, 0.06, 2.3, 1.9, sx * 1.08, 1.15, -0.45);
      this.cube(E, orange, 0.07, 0.04, 1.9, sx * 1.08, 2.3, -0.45);
    }
    const laneSign = this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(this.sign("LANE 4", "#e8590c", "#ffffff")), roughness: 0.6 }));
    this.cube(E, laneSign, 0.7, 0.22, 0.03, 0, 2.95, -1.7);
    this.cube(E, this.mat("ammo", "#4c5a3a", 0.7), 0.24, 0.13, 0.12, -0.72, 1.295, -0.98);
    this.cube(E, this.mat("ammo-lid", "#3d4a2e", 0.6), 0.25, 0.025, 0.13, -0.72, 1.37, -0.98);
    for (let i = 0; i < 2; i++) {
      const m = this.cube(E, this.mat("mag", "#1d1f23", 0.5, 0.4), 0.03, 0.025, 0.13, 0.42 + i * 0.07, 1.245, -1.02);
      m.rotation.y = 0.2 - i * 0.35;
    }
    for (let i = 0; i < 5; i++) {
      const cz = this.tube(E, this.mat("brass", "#c9a24a", 0.35, 0.9), 0.005, 0.005, 0.02, -0.2 + i * 0.13, 1.235, -0.9 - (i % 3) * 0.08, 8);
      cz.rotation.z = i;
    }
    // Hanging distance signs (seen between rounds).
    for (const [txt, dz] of [["10", -10], ["25", -25], ["50", -50]] as const) {
      const sm = this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(this.sign(`${txt} m`, "#1b1d21", "#f2b705", 384, 160)), roughness: 0.6 }));
      for (const sx of [-1, 1]) this.cube(E, sm, 0.9, 0.36, 0.03, sx * 4.9, 3.05, dz + 0.9);
    }
    // Red "live fire" lamps on the walls.
    const liveLamp = this.basic("live", new THREE.Color(2.2, 0.25, 0.2), { toneMapped: false });
    for (const sx of [-1, 1]) for (const lz of [-3, -20, -38]) this.cube(E, liveLamp, 0.05, 0.12, 0.3, sx * (HW - 0.04), 3.0, lz);
    // Old targets on the lanes either side.
    const decoSpec: TargetSpec = { id: 999, hostage: false, x: 0, y: 0, z: 0, w: 0.95, h: 1.2, ringR: 0.42, motion: { kind: "static" } };
    const { c: dc, x: dx } = canvas(256, 324);
    drawScoringPaper(dx, 256, 324, decoSpec, "LANE 3");
    const drnd = makeRng(77);
    for (let i = 0; i < 9; i++) drawHole(dx, 128 + (drnd() - 0.5) * 120, 110 + (drnd() - 0.5) * 120, 3.5);
    const decoMat = this.track(new THREE.MeshStandardMaterial({ map: this.canvasTex(dc), roughness: 0.9, side: THREE.DoubleSide }));
    for (const [tx, tz] of [[-7.2, -12], [7.2, -27]] as const) {
      const p = this.plane(E, decoMat, 0.95, 1.2);
      p.position.set(tx, 1.5, tz);
      this.cube(E, track, 1.05, 0.04, 0.03, tx, 2.12, tz);
      this.cube(E, track, 0.2, 0.12, 0.2, tx, 3.15, tz);
      for (const o of [-0.4, 0.4]) this.cube(E, this.mat("wire", "#9aa0a6", 0.4, 0.8), 0.008, 1.0, 0.008, tx + o, 2.62, tz);
    }
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#dfe7f2", "#4a4540", 1.35));
    const d = new THREE.DirectionalLight("#fff4e6", 0.9);
    d.position.set(2, 8, 6);
    d.target.position.set(0, 0, -20);
    this.scene.add(d, d.target);
    for (const [z, aimZ, i] of [[-6.2, -10, 30], [-19.5, -25, 55], [-42, -50, 95]] as const) {
      const s = new THREE.SpotLight("#fff1dc", i, 18, 0.72, 0.6, 1.6);
      s.position.set(0, 3.9, z);
      s.target.position.set(0, 1.2, aimZ);
      this.scene.add(s, s.target);
    }
    const g1 = new THREE.HemisphereLight("#e9eef5", "#30302e", 1.4);
    const g2 = new THREE.DirectionalLight("#ffffff", 2.2);
    g2.position.set(-0.6, 1.2, 0.8);
    const g3 = new THREE.DirectionalLight("#9fb4d0", 0.8);
    g3.position.set(1, 0.2, -1);
    this.gunScene.add(g1, g2, g3);
  }

  // ----------------------------------------------------------------- guns

  private glove(parent: THREE.Object3D, x: number, y: number, z: number, rx = 0) {
    const gl = this.mat("glove", "#1f2124", 0.9);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.x = rx;
    this.rbox(g, gl, 0.052, 0.08, 0.068, 0.004, 0, 0.006, 0.014);
    this.rbox(g, gl, 0.054, 0.055, 0.024, 0, -0.005, -0.038, 0.01);
    this.rbox(g, this.mat("glove-pad", "#3a3d42", 0.9), 0.02, 0.05, 0.04, 0.027, 0, 0.01, 0.008);
    parent.add(g);
    return g;
  }
  private sleeve(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
    this.limb(parent, this.mat("sleeve", "#2e3b47", 0.95), a, b, 0.036, 0.048);
    const cuff = b.clone().sub(a).normalize().multiplyScalar(0.03).add(a);
    this.limb(parent, this.mat("cuff", "#1a2129", 0.9), a, cuff, 0.037, 0.037);
  }

  private buildGuns() {
    const steel = this.mat("gun-steel", "#2b2e33", 0.38, 0.75);
    const poly = this.mat("gun-poly", "#1c1d20", 0.7, 0.05);
    const dark = this.mat("gun-dark", "#111214", 0.5, 0.5);
    const tan = this.mat("gun-tan", "#8c7a5a", 0.75, 0.05);
    const glass = this.mat("glass", "#1b3b5a", 0.05, 0.6, { emissive: "#0b2238", emissiveIntensity: 0.6 });
    const dot = this.basic("tritium", new THREE.Color(1.5, 0.8, 0.1), { toneMapped: false });

    // Pistol.
    {
      const g = new THREE.Group();
      const slide = new THREE.Group();
      this.rbox(slide, steel, 0.03, 0.032, 0.19, 0, 0.03, -0.075, 0.005);
      for (let i = 0; i < 5; i++) this.cube(slide, dark, 0.031, 0.022, 0.003, 0, 0.03, 0.0 + i * 0.006);
      this.cube(slide, dark, 0.012, 0.006, 0.04, 0.009, 0.046, -0.06);
      this.cube(slide, poly, 0.005, 0.007, 0.006, 0, 0.049, -0.163);
      this.cube(slide, dot, 0.003, 0.003, 0.002, 0, 0.051, -0.1665);
      for (const sx of [-1, 1]) this.cube(slide, poly, 0.007, 0.008, 0.008, sx * 0.008, 0.05, 0.012);
      g.add(slide);
      g.userData.slide = slide;
      this.rbox(g, tan, 0.028, 0.024, 0.155, 0, 0.004, -0.065, 0.005);
      const grip = this.rbox(g, tan, 0.029, 0.105, 0.048, 0, -0.046, 0.004, 0.008);
      grip.rotation.x = -0.28;
      this.cube(g, poly, 0.007, 0.006, 0.045, 0, -0.024, -0.045);
      this.cube(g, poly, 0.007, 0.026, 0.006, 0, -0.013, -0.068);
      this.tube(g, dark, 0.0065, 0.0065, 0.012, 0, 0.03, -0.172, 12);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.03, -0.19);
      g.add(muzzle);
      g.userData.muzzle = muzzle;
      g.userData.port = new THREE.Vector3(0.012, 0.045, -0.06);
      this.glove(g, 0.002, -0.052, 0.008, -0.28);
      this.sleeve(g, new THREE.Vector3(0.006, -0.085, 0.05), new THREE.Vector3(0.09, -0.32, 0.36));
      // Support hand under and around the grip from the left.
      const sup = this.glove(g, -0.024, -0.06, -0.004, -0.2);
      sup.rotation.z = 0.5;
      this.sleeve(g, new THREE.Vector3(-0.04, -0.09, 0.04), new THREE.Vector3(-0.2, -0.33, 0.33));
      g.position.set(0.13, -0.125, -0.5);
      g.rotation.set(0.05, 0.26, 0.02);
      g.userData.base = { p: g.position.clone(), r: g.rotation.clone() };
      this.guns.pistol = g;
    }

    // Carbine with a red dot.
    {
      const g = new THREE.Group();
      this.rbox(g, steel, 0.034, 0.046, 0.2, 0, 0.035, -0.06, 0.005);
      this.rbox(g, steel, 0.03, 0.036, 0.15, 0, -0.004, -0.05, 0.004);
      this.rbox(g, tan, 0.044, 0.046, 0.27, 0, 0.034, -0.295, 0.009);
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) this.cube(g, dark, 0.002, 0.012, 0.03, sx * 0.0225, 0.032, -0.2 - i * 0.05);
      this.cube(g, steel, 0.02, 0.008, 0.44, 0, 0.061, -0.18);
      for (let i = 0; i < 18; i++) this.cube(g, dark, 0.021, 0.003, 0.005, 0, 0.066, 0.03 - i * 0.024);
      this.tube(g, dark, 0.008, 0.008, 0.16, 0, 0.034, -0.5);
      this.tube(g, steel, 0.012, 0.012, 0.05, 0, 0.034, -0.6, 10);
      const mag = this.rbox(g, steel, 0.024, 0.13, 0.055, 0, -0.07, -0.085, 0.005);
      mag.rotation.x = 0.16;
      const grip = this.rbox(g, tan, 0.027, 0.085, 0.04, 0, -0.045, 0.03, 0.008);
      grip.rotation.x = -0.35;
      this.rbox(g, tan, 0.036, 0.065, 0.2, 0, 0.012, 0.19, 0.012);
      this.cube(g, dark, 0.01, 0.01, 0.12, 0, 0.03, 0.08);
      // Red dot.
      this.cube(g, dark, 0.026, 0.014, 0.05, 0, 0.072, -0.05);
      this.tube(g, poly, 0.02, 0.02, 0.055, 0, 0.098, -0.05, 18);
      this.tube(g, glass, 0.016, 0.016, 0.057, 0, 0.098, -0.05, 18);
      this.cube(g, poly, 0.012, 0.012, 0.018, 0.022, 0.098, -0.05);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.034, -0.635);
      g.add(muzzle);
      g.userData.muzzle = muzzle;
      g.userData.port = new THREE.Vector3(0.02, 0.04, -0.04);
      this.glove(g, 0.002, -0.048, 0.035, -0.35);
      this.sleeve(g, new THREE.Vector3(0.008, -0.085, 0.07), new THREE.Vector3(0.12, -0.3, 0.4));
      const sup = this.glove(g, -0.012, 0.005, -0.31, 0);
      sup.rotation.z = -0.9;
      this.sleeve(g, new THREE.Vector3(-0.04, -0.02, -0.29), new THREE.Vector3(-0.16, -0.42, 0.02));
      g.position.set(0.15, -0.17, -0.5);
      g.rotation.set(0.05, 0.07, 0);
      g.userData.base = { p: g.position.clone(), r: g.rotation.clone() };
      this.guns.carbine = g;
    }

    // Bolt rifle with a scope.
    {
      const g = new THREE.Group();
      const od = this.mat("gun-od", "#4a5139", 0.8, 0.05);
      this.rbox(g, od, 0.042, 0.06, 0.42, 0, 0.0, -0.13, 0.012);
      this.rbox(g, od, 0.04, 0.09, 0.22, 0, -0.005, 0.2, 0.014);
      this.rbox(g, steel, 0.03, 0.03, 0.2, 0, 0.034, -0.03, 0.006);
      this.tube(g, dark, 0.0095, 0.0085, 0.48, 0, 0.034, -0.48);
      this.tube(g, steel, 0.013, 0.013, 0.06, 0, 0.034, -0.74, 10);
      const grip = this.rbox(g, od, 0.028, 0.08, 0.04, 0, -0.05, 0.05, 0.01);
      grip.rotation.x = -0.4;
      this.cube(g, dark, 0.022, 0.04, 0.05, 0, -0.04, -0.06);
      this.limb(g, steel, new THREE.Vector3(0.012, 0.03, 0.03), new THREE.Vector3(0.05, 0.012, 0.035), 0.004, 0.004);
      const knob = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.009, 10, 8)), dark);
      knob.position.set(0.052, 0.01, 0.035);
      g.add(knob);
      // Scope.
      for (const rz of [-0.08, 0.04]) this.cube(g, dark, 0.03, 0.03, 0.018, 0, 0.065, rz);
      this.tube(g, poly, 0.016, 0.016, 0.26, 0, 0.088, -0.03, 18);
      this.tube(g, poly, 0.016, 0.026, 0.07, 0, 0.088, -0.19, 18);
      this.tube(g, poly, 0.026, 0.026, 0.03, 0, 0.088, -0.24, 18);
      this.tube(g, glass, 0.023, 0.023, 0.031, 0, 0.088, -0.241, 18);
      this.tube(g, poly, 0.02, 0.016, 0.05, 0, 0.088, 0.115, 18);
      this.tube(g, this.mat("gun-ring", "#e8590c", 0.5), 0.0205, 0.0205, 0.006, 0, 0.088, 0.1, 18);
      const turret = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.009, 0.009, 0.022, 12)), steel);
      turret.position.set(0, 0.11, -0.02);
      g.add(turret);
      const side = turret.clone();
      side.rotation.z = Math.PI / 2;
      side.position.set(0.024, 0.088, -0.02);
      g.add(side);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.034, -0.78);
      g.add(muzzle);
      g.userData.muzzle = muzzle;
      g.userData.port = new THREE.Vector3(0.02, 0.04, -0.02);
      this.glove(g, 0.002, -0.05, 0.055, -0.4);
      this.sleeve(g, new THREE.Vector3(0.008, -0.085, 0.09), new THREE.Vector3(0.12, -0.3, 0.42));
      const sup = this.glove(g, -0.01, -0.03, -0.28, 0);
      sup.rotation.z = -0.9;
      this.sleeve(g, new THREE.Vector3(-0.04, -0.05, -0.26), new THREE.Vector3(-0.16, -0.42, 0.04));
      g.position.set(0.16, -0.19, -0.5);
      g.rotation.set(0.06, 0.05, 0);
      g.userData.base = { p: g.position.clone(), r: g.rotation.clone() };
      this.guns.rifle = g;
    }
    for (const w of Object.keys(this.guns) as Weapon[]) {
      this.guns[w].visible = false;
      this.gunScene.add(this.guns[w]);
    }
  }

  setWeapon(w: Weapon) {
    this.weapon = w;
    for (const k of Object.keys(this.guns) as Weapon[]) this.guns[k].visible = k === w;
    (this.guns[w].userData.muzzle as THREE.Object3D).add(this.flash);
  }

  // ----------------------------------------------------------------- rounds

  /** Puts up a round's targets (and takes down the last round's). */
  loadRound(plan: RoundPlan) {
    for (const d of this.roundBin) d.dispose();
    this.roundBin = [];
    this.round.clear();
    this.live = [];
    this.turners = [];
    this.plan = plan;
    this.setWeapon(plan.weapon);
    const steel = this.mat("track", "#59616b", 0.5, 0.6);
    const wire = this.mat("wire", "#9aa0a6", 0.4, 0.8);
    const yel = this.mat("paint-y", "#e9b10a", 0.7);
    const wood = this.mat("wood", "#8a6a45", 0.9);
    const base = this.mat("stand", "#2a2e34", 0.6, 0.4);
    // Turning-target stands.
    for (let i = 0; i < plan.slots.length; i++) {
      const sx = plan.slots[i];
      this.cube(this.round, base, 0.6, 0.28, 0.42, sx, 0.14, -25);
      this.cube(this.round, yel, 0.61, 0.04, 0.43, sx, 0.29, -25);
      this.cube(this.round, steel, 0.05, 0.42, 0.05, sx, 0.5, -25);
      const turner = new THREE.Group();
      turner.position.set(sx, 1.5, -25);
      for (const o of [-0.5, 0.5]) this.cube(turner, wood, 0.05, 1.7, 0.03, o, 0, -0.02);
      this.cube(turner, wood, 1.2, 0.05, 0.03, 0, -0.78, -0.02);
      this.round.add(turner);
      this.turners.push(turner);
    }
    for (const s of plan.targets) {
      const W = 256;
      const H = Math.round((256 * s.h) / s.w);
      const { c, x } = canvas(W, H);
      if (s.hostage) drawHostagePaper(x, W, H, s);
      else drawScoringPaper(x, W, H, s, `${-s.z} m · ${plan.tag.split(" ")[0].toUpperCase()}`);
      const tex = this.canvasTex(c, undefined, this.roundBin);
      tex.anisotropy = Math.max(this.anis, 8);
      const pm = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }), this.roundBin);
      const geo = this.track(new THREE.PlaneGeometry(s.w, s.h), this.roundBin);
      const paper = new THREE.Mesh(geo, pm);
      let holder: THREE.Object3D;
      const m = s.motion;
      if (m.kind === "turn") {
        holder = this.turners[m.slot];
        holder.add(paper);
        paper.visible = false;
      } else if (m.kind === "rail") {
        const car = new THREE.Group();
        car.position.set(m.x0, 0, s.z);
        this.cube(car, base, 0.5, 0.14, 0.34, 0, 0.12, 0);
        this.cube(car, s.hostage ? this.mat("blue", "#1c7ed6", 0.6) : this.mat("orange", "#e8590c", 0.5), 0.51, 0.03, 0.35, 0, 0.2, 0);
        this.cube(car, steel, 0.04, s.y - s.h / 2 - 0.2, 0.04, 0, (s.y - s.h / 2 + 0.2) / 2, 0);
        this.cube(car, wood, s.w + 0.06, 0.05, 0.03, 0, s.y - s.h / 2, -0.02);
        paper.position.set(0, s.y, 0.005);
        car.add(paper);
        car.visible = false;
        this.round.add(car);
        holder = car;
      } else {
        const g = new THREE.Group();
        g.position.set(s.x, 0, s.z);
        paper.position.set(0, s.y, 0);
        g.add(paper);
        // Hanger bar and wires up to the carrier on the track.
        const topY = s.y + s.h / 2;
        this.cube(g, steel, s.w + 0.08, 0.035, 0.03, 0, topY + 0.01, -0.01);
        this.cube(g, steel, 0.22, 0.12, 0.22, 0, 3.13, 0);
        for (const o of [-s.w * 0.42, s.w * 0.42]) this.cube(g, wire, 0.008, 3.1 - topY, 0.008, o, (3.1 + topY) / 2, -0.01);
        this.round.add(g);
        holder = g;
      }
      const L: Live = { spec: s, holder, paper, ctx: x, tex, W, H, face: 1 };
      paper.userData.live = L;
      this.live.push(L);
    }
    this.setTime(0);
  }

  /** Moves and turns the targets to round time t. */
  setTime(t: number) {
    const turned = new Set<number>();
    for (const L of this.live) {
      const st = targetState(L.spec, t);
      L.face = st.face;
      const m = L.spec.motion;
      if (m.kind === "turn") {
        L.paper.visible = st.shown;
        if (st.shown) {
          this.turners[m.slot].rotation.y = (1 - st.face) * (Math.PI / 2);
          turned.add(m.slot);
        }
      } else if (m.kind === "rail") {
        L.holder.visible = st.shown;
        L.holder.position.x = st.x;
      }
    }
    for (let i = 0; i < this.turners.length; i++) if (!turned.has(i)) this.turners[i].rotation.y = Math.PI / 2;
  }

  /** Where the view is: aim (degrees), field of view, and k (0 pulled back, 1 at the bench). */
  setView(yaw: number, pitch: number, fov: number, k: number) {
    this.k = k;
    const e = 1 - (1 - k) * (1 - k);
    this.camera.position.lerpVectors(BACK, EYE, e);
    this.camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, "YXZ");
    if (Math.abs(this.camera.fov - fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The aim that points at a spot (degrees), from the bench. */
  static aimAt(p: [number, number, number]): { yaw: number; pitch: number } {
    const dx = p[0] - EYE.x;
    const dy = p[1] - EYE.y;
    const dz = p[2] - EYE.z;
    return { yaw: THREE.MathUtils.radToDeg(Math.atan2(-dx, -dz)), pitch: THREE.MathUtils.radToDeg(Math.atan2(dy, Math.hypot(dx, dz))) };
  }

  /** A shot along an aim (degrees): what it hit. Leaves a hole in paper, dust anywhere else. */
  shoot(yaw: number, pitch: number): ShotResult {
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, "YXZ"));
    this.scene.updateMatrixWorld();
    this.ray.set(EYE, dir);
    this.ray.far = 120;
    const hits = this.ray.intersectObjects([this.round, this.env], true);
    const hit = hits.find((h: THREE.Intersection) => shown(h.object) && !(h.object as THREE.Mesh).userData.noHit);
    if (!hit) return { kind: "miss", steel: false };
    const L = hit.object.userData.live as Live | undefined;
    if (L && L.face > 0.2) {
      const uv = hit.uv!;
      const r = (WEAPONS[this.weapon].hole / L.spec.w) * L.W;
      drawHole(L.ctx, uv.x * L.W, (1 - uv.y) * L.H, Math.max(2.2, r));
      L.tex.needsUpdate = true;
      if (L.spec.hostage) return { kind: "hostage", spec: L.spec };
      const lp = L.paper.worldToLocal(hit.point.clone());
      const d = Math.hypot(lp.x, lp.y - ringCentreY(L.spec)) / L.spec.ringR;
      return { kind: "ring", spec: L.spec, ring: ringOf(d) };
    }
    // Dust off the floor, berm or walls.
    const p = this.puffs.find((f) => f.age >= f.life) ?? this.puffs[0];
    p.age = 0;
    p.obj.position.copy(hit.point).addScaledVector(dir, -0.05);
    p.obj.visible = true;
    const steel = !!L || (hit.object as THREE.Mesh).material === this.mats.get("steel") || (hit.object as THREE.Mesh).material === this.mats.get("track");
    return { kind: "miss", steel };
  }

  /** Bang: recoil, flash, brass. */
  fire() {
    this.gs.kick = 1;
    this.gs.flash = 0.055;
    this.flash.material.rotation = Math.random() * Math.PI;
    const s = this.weapon === "pistol" ? 0.06 : 0.1;
    this.flash.scale.setScalar(s * (0.8 + Math.random() * 0.4));
    const gun = this.guns[this.weapon];
    const c = this.casings.find((f) => f.age >= f.life) ?? this.casings[0];
    gun.updateMatrixWorld();
    c.obj.position.copy(gun.localToWorld((gun.userData.port as THREE.Vector3).clone()));
    c.v!.set(0.7 + Math.random() * 0.3, 0.8 + Math.random() * 0.3, 0.25);
    c.spin!.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.age = 0;
    c.life = 0.55;
    c.obj.visible = this.weapon !== "rifle";
  }

  startReload(dur: number) {
    this.gs.reload = 0;
    this.gs.reloadDur = dur;
  }
  /** Gun down (between rounds) or up (aiming). */
  lower(down: boolean) {
    this.gs.lowerTo = down ? 1 : 0;
  }
  /** Drag speed, so the gun lags a little behind your aim. */
  nudge(dx: number, dy: number) {
    this.gs.lagX = Math.max(-1, Math.min(1, this.gs.lagX + dx * 0.02));
    this.gs.lagY = Math.max(-1, Math.min(1, this.gs.lagY + dy * 0.02));
  }

  update(dt: number) {
    const gs = this.gs;
    gs.clock += dt;
    gs.kick *= Math.exp(-dt * 11);
    gs.lagX *= Math.exp(-dt * 7);
    gs.lagY *= Math.exp(-dt * 7);
    gs.lower += (gs.lowerTo - gs.lower) * Math.min(1, dt * 6);
    let dip = 0;
    if (gs.reload >= 0) {
      gs.reload += dt;
      const p = gs.reload / gs.reloadDur;
      dip = Math.sin(Math.min(1, p) * Math.PI);
      if (p >= 1) gs.reload = -1;
    }
    const gun = this.guns[this.weapon];
    const b = gun.userData.base as { p: THREE.Vector3; r: THREE.Euler };
    const kick = gs.kick;
    const bob = Math.sin(gs.clock * 1.7) * 0.0025;
    const low = gs.lower;
    gun.position.set(b.p.x - gs.lagX * 0.012 + low * 0.04 + dip * 0.02, b.p.y + bob - gs.lagY * 0.01 - low * 0.16 - dip * 0.07 + kick * 0.008, b.p.z + kick * 0.045);
    gun.rotation.set(b.r.x + kick * (this.weapon === "carbine" ? 0.1 : 0.2) - low * 0.45 - dip * 0.55, b.r.y + gs.lagX * 0.06 + low * 0.25, b.r.z + dip * 0.6 + low * 0.1);
    const slide = gun.userData.slide as THREE.Object3D | undefined;
    if (slide) slide.position.z = Math.min(1, kick * 1.6) * 0.028;
    gs.flash -= dt;
    this.flash.visible = gs.flash > 0;
    this.gunFlash.intensity = gs.flash > 0 ? 0.12 : 0;
    this.rangeFlash.intensity = gs.flash > 0 ? 3 : 0;
    if (gs.flash > 0) {
      const mz = gun.userData.muzzle as THREE.Object3D;
      mz.getWorldPosition(this.gunFlash.position);
    }
    for (const c of this.casings) {
      if (c.age >= c.life) continue;
      c.age += dt;
      c.v!.y -= 5 * dt;
      c.obj.position.addScaledVector(c.v!, dt);
      c.obj.rotation.x += c.spin!.x * dt;
      c.obj.rotation.y += c.spin!.y * dt;
      if (c.age >= c.life) c.obj.visible = false;
    }
    for (const p of this.puffs) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const k = p.age / p.life;
      const s = 0.12 + k * 0.5;
      p.obj.scale.set(s, s, s);
      p.obj.position.y += dt * 0.25;
      ((p.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.55 * (1 - k);
      if (p.age >= p.life) p.obj.visible = false;
    }
  }

  render(renderer: THREE.WebGLRenderer, gun = true) {
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(this.scene, this.camera);
    if (gun) {
      renderer.clearDepth();
      renderer.render(this.gunScene, this.gunCam);
    }
  }

  dispose() {
    for (const d of this.roundBin) d.dispose();
    for (const d of this.bin) d.dispose();
    this.envTex?.dispose();
    this.roundBin = [];
    this.bin = [];
    this.mats.clear();
    this.live = [];
    this.scene.clear();
    this.gunScene.clear();
  }
}

function shown(o: THREE.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
