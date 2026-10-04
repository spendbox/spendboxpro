import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { accentOf, type StoreTheme } from "@/lib/store-theme";
import { formatMoney } from "@/lib/format";
import type { StoreProduct } from "@/lib/types";
import { chalkboardTexture, floorTexture, neonTexture, priceTagTexture, shade, shopSignTexture, storeSignTexture } from "./textures";

// The inside of a shop, "Boutique" theme: a counter in front of shelves of the
// business's products, the shop's sign, an entrance with an OPEN sign and a
// chalkboard, and a lounge corner. Drag to look around; tap things.

export interface StoreBusiness {
  id: string;
  name: string;
  categories: string[];
  location: string | null;
  about: string | null;
  logo_url: string | null;
  brand_color: string;
  whatsapp: string | null;
}

export type StoreTarget = { kind: "product"; id: string } | { kind: "more" } | { kind: "bell" } | { kind: "about" };

export interface StoreOptions {
  business: StoreBusiness;
  theme: StoreTheme;
  products: StoreProduct[];
  onSelect?: (target: StoreTarget) => void;
  /** Called when the first view is ready (textures can keep loading after). */
  onReady?: () => void;
}

const W = 12; // room width (x)
const D = 9; // room depth (z)
const H = 5.0; // wall height
const BACK = -D / 2;

function paint(geometry: THREE.BufferGeometry, color: string) {
  // Merging needs every piece stored the same way, so make indexed shapes plain.
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const c = new THREE.Color(color);
  const count = g.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return paint(g, color);
}

function cylinder(rt: number, rb: number, h: number, x: number, y: number, z: number, color: string, seg = 16) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return paint(g, color);
}

function blob(r: number, x: number, y: number, z: number, color: string) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Placeholder picture for a product whose image can't load (or a video without a still). */
function placeholderTexture(color: string, video: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, color);
  g.addColorStop(1, shade(color, 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  if (video) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(105, 85);
    ctx.lineTo(175, 128);
    ctx.lineTo(105, 171);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A round wall clock showing the time it is now. */
function clockTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2f3532";
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fbfaf6";
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f3532";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(128 + Math.sin(a) * 92 - 4, 128 - Math.cos(a) * 92 - 4, 8, 8);
  }
  const now = new Date();
  const hand = (angle: number, length: number, width: number) => {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(angle);
    ctx.fillRect(-width / 2, -length, width, length);
    ctx.restore();
  };
  hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), 55, 10);
  hand(now.getMinutes() * (Math.PI / 30), 82, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Simple abstract art in the shop's colours, for the walls. */
function artTexture(accent: string, variant: number) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3b2a1e";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#f7f2ea";
  ctx.fillRect(14, 14, 228, 228);
  const tones = [accent, shade(accent, 0.25), "#f2c14e", "#e4572e", "#2f3532"];
  if (variant === 1) {
    tones.forEach((t, i) => {
      ctx.fillStyle = t;
      ctx.beginPath();
      ctx.arc(70 + i * 30, 150 - (i % 2) * 50, 46 - i * 5, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    tones.forEach((t, i) => {
      ctx.fillStyle = t;
      ctx.fillRect(40 + (i % 2) * 70, 40 + i * 34, 120 - i * 10, 26);
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function newBadgeTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 56;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e5484d";
  ctx.beginPath();
  ctx.roundRect(2, 2, 124, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NEW", 64, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StoreScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = -0.06;
  private yawVelocity = 0;
  private intro = 0;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private raycaster = new THREE.Raycaster();
  private interactive: THREE.Object3D[] = [];
  private bell: THREE.Object3D | null = null;
  private hovered: THREE.Object3D | null = null;
  private frame = 0;
  private last = 0;
  private disposed = false;
  private needsRender = true;
  private reducedMotion: boolean;
  private resizeObserver: ResizeObserver;
  private disposables: { dispose: () => void }[] = [];
  private loader = new THREE.TextureLoader();

  constructor(
    private container: HTMLElement,
    private options: StoreOptions,
  ) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);
    this.loader.setCrossOrigin("anonymous");

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.intro = this.reducedMotion ? 1 : 0;
    this.build();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.bindInput();
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
    options.onReady?.();
  }

  // ------------------------------------------------------------------ the room

  private build() {
    const { theme, business } = this.options;
    const accent = accentOf(theme, business.brand_color);
    const dark = theme.wall === "#2F3A34";
    const warm = theme.lights === "warm";
    this.scene.background = new THREE.Color(dark ? "#1d2420" : shade(theme.wall, -0.06));
    this.scene.add(new THREE.HemisphereLight(warm ? "#fff4e3" : "#eef5ff", warm ? "#8a6a4a" : "#6c7a88", dark ? 1.4 : 1.7));
    const key = new THREE.DirectionalLight(warm ? "#ffe9c7" : "#f2f7ff", 1.1);
    key.position.set(2, 6, 6);
    this.scene.add(key);

    // Floor, walls, ceiling.
    const floorTex = floorTexture(theme.floor);
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D + 4), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 2;
    this.scene.add(floor);
    this.track(floorTex, floorMat, floor.geometry);

    const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.track(solid);
    const wall = theme.wall;
    const parts: THREE.BufferGeometry[] = [
      box(W, H, 0.2, 0, H / 2, BACK - 0.1, wall), // back wall
      box(0.2, H, D + 4, -W / 2 - 0.1, H / 2, 2, shade(wall, -0.03)), // left wall
      box(0.2, H, D + 4, W / 2 + 0.1, H / 2, 2, shade(wall, -0.03)), // right wall
      box(W, 0.22, 0.06, 0, 0.11, BACK + 0.03, shade(accent, -0.1)), // baseboards
      box(0.06, 0.22, D + 4, -W / 2 + 0.03, 0.11, 2, shade(accent, -0.1)),
      box(0.06, 0.22, D + 4, W / 2 - 0.03, 0.11, 2, shade(accent, -0.1)),
      box(W, 0.12, 0.08, 0, H - 0.4, BACK + 0.04, shade(accent, -0.05)), // picture rail
    ];

    // Counter with a till and plant.
    const cz = -1.5;
    parts.push(
      box(3.8, 1.0, 1.0, 0, 0.5, cz, accent),
      box(4.0, 0.1, 1.15, 0, 1.05, cz, "#c39a6b"),
      box(3.5, 0.06, 0.04, 0, 0.75, cz + 0.52, shade(accent, 0.15)),
      box(0.5, 0.24, 0.4, 1.55, 1.22, cz + 0.1, "#2f3532"),
      box(0.42, 0.12, 0.04, 1.55, 1.36, cz - 0.08, "#9fd3b8"),
      cylinder(0.12, 0.1, 0.2, -1.6, 1.2, cz + 0.15, "#b86f4b", 10),
      blob(0.16, -1.6, 1.38, cz + 0.15, "#4f9b4a"),
    );

    // Shelves on the back wall (two rows), and a low cabinet on each side wall.
    const rows = [2.02, 3.0];
    for (const y of rows) parts.push(box(5.6, 0.07, 0.42, 0, y - 0.5, BACK + 0.22, "#a87b52"));
    parts.push(box(0.5, 0.9, 3.4, -W / 2 + 0.3, 0.45, -2.4, "#a87b52"), box(0.5, 0.9, 3.4, W / 2 - 0.3, 0.45, -2.4, "#a87b52"));

    // Entrance on the left wall: door and window.
    parts.push(
      box(0.12, 2.5, 1.5, -W / 2 + 0.06, 1.25, 1.6, "#5b3d29"),
      box(0.14, 2.3, 1.3, -W / 2 + 0.07, 1.2, 1.6, "#cfe8f3"),
      box(0.14, 1.3, 2.0, -W / 2 + 0.07, 1.9, -0.6, "#cfe8f3"),
      box(0.16, 0.1, 2.2, -W / 2 + 0.08, 1.2, -0.6, "#ffffff"),
      box(1.4, 0.03, 0.9, -W / 2 + 0.9, 0.015, 1.6, shade(accent, -0.15)), // mat
    );

    // Chalkboard easel by the door.
    parts.push(box(0.06, 1.6, 0.06, -4.4, 0.8, 0.0, "#7a5534", 0.5), box(0.06, 1.6, 0.06, -3.6, 0.8, -0.35, "#7a5534", 0.5));

    // Lounge on the right.
    if (theme.lounge) {
      const sofa = shade(accent, 0.18);
      parts.push(
        box(1.0, 0.45, 2.6, 4.9, 0.32, 1.3, sofa),
        box(0.3, 0.9, 2.6, 5.35, 0.65, 1.3, shade(sofa, -0.05)),
        box(1.0, 0.65, 0.3, 4.9, 0.4, 0.1, shade(sofa, -0.08)),
        box(1.0, 0.65, 0.3, 4.9, 0.4, 2.5, shade(sofa, -0.08)),
        cylinder(0.65, 0.65, 0.06, 3.4, 0.5, 1.3, "#c39a6b", 20),
        cylinder(0.08, 0.12, 0.48, 3.4, 0.25, 1.3, "#5b3d29", 8),
        cylinder(0.03, 0.03, 1.9, 5.3, 0.95, 3.2, "#2f3532", 6),
      );
      const rug = new THREE.CircleGeometry(1.7, 32);
      rug.rotateX(-Math.PI / 2);
      rug.translate(3.9, 0.012, 1.3);
      parts.push(paint(rug, `#${new THREE.Color(accent).lerp(new THREE.Color("#f4ece0"), 0.62).getHexString()}`));
    }
    if (theme.plants) {
      for (const [x, z, s] of [
        [-5.3, -3.8, 1],
        [5.3, -3.8, 1.1],
        [-5.2, 3.6, 0.9],
      ] as const) {
        parts.push(cylinder(0.32 * s, 0.25 * s, 0.6 * s, x, 0.3 * s, z, "#b86f4b", 12));
        parts.push(blob(0.55 * s, x, 0.95 * s, z, "#4f9b4a"), blob(0.42 * s, x + 0.2, 1.35 * s, z - 0.1, "#5fae55"), blob(0.35 * s, x - 0.2, 1.25 * s, z + 0.15, "#3f8a3f"));
      }
    }
    // Pendant lights over the counter (cords; bulbs are added glowing below).
    const lampZ = -0.3;
    for (const x of [-2.2, 0, 2.2]) parts.push(cylinder(0.012, 0.012, 0.7, x, H - 0.35, lampZ, "#2f3532", 4));

    const room = new THREE.Mesh(mergeGeometries(parts), solid);
    parts.forEach((p) => p.dispose());
    this.scene.add(room);
    this.track(room.geometry);

    // Glowing bits: bulbs, lamp shade.
    const glow = new THREE.MeshBasicMaterial({ color: warm ? "#ffe2a8" : "#e8f3ff" });
    this.track(glow);
    for (const x of [-2.2, 0, 2.2]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), glow);
      bulb.position.set(x, H - 0.85, lampZ);
      const shadeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.24, 16, 1, true), new THREE.MeshLambertMaterial({ color: accent, side: THREE.DoubleSide }));
      shadeMesh.position.set(x, H - 0.72, lampZ);
      this.scene.add(bulb, shadeMesh);
      this.track(bulb.geometry, shadeMesh.geometry, shadeMesh.material as THREE.Material);
    }
    if (theme.lounge) {
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.45, 16, 1, true), glow);
      lamp.position.set(5.3, 2.05, 3.2);
      this.scene.add(lamp);
      this.track(lamp.geometry);
    }

    // Ceiling (kept light so the room feels bright).
    const ceilingMat = new THREE.MeshBasicMaterial({ color: dark ? "#2a332e" : shade(wall, 0.02) });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D + 4), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H, 2);
    this.scene.add(ceiling);
    this.track(ceilingMat, ceiling.geometry);

    // Textured pieces: sign, OPEN sign, chalkboard, plaque, clock.
    const tagline = [business.categories.slice(0, 2).join(" · "), business.location].filter(Boolean).join("  ·  ");
    this.addPlane(storeSignTexture(business.name, tagline, accent, business.logo_url), 5.2, 1.3, [0, H - 0.78, BACK + 0.1], 0, true);
    this.addPlane(shopSignTexture(business.name, accent, business.logo_url), 2.6, 0.65, [0, 0.55, cz + 0.51], 0, true);
    if (theme.lounge) {
      // Art above the sofa.
      this.addPlane(artTexture(accent, 1), 1.3, 1.0, [W / 2 - 0.02, 2.55, 0.7], -Math.PI / 2, false);
      this.addPlane(artTexture(accent, 2), 0.9, 1.2, [W / 2 - 0.02, 2.6, 2.1], -Math.PI / 2, false);
    }
    this.addPlane(clockTexture(), 0.8, 0.8, [4.6, H - 0.95, BACK + 0.1], 0, true);
    this.addPlane(neonTexture("OPEN", "#ff5c8a"), 1.5, 0.47, [-W / 2 + 0.12, 3.05, 1.6], Math.PI / 2, true);
    const board = this.addPlane(
      chalkboardTexture("Welcome!", [
        business.categories.slice(0, 3).join(", ") || "Come in and look around",
        business.location ? `📍 ${business.location}` : "",
        business.whatsapp ? "Ring the bell to chat" : "Tap a product to see more",
      ]),
      1.3,
      0.98,
      [-4.0, 1.25, -0.1],
      0.5,
      true,
    );
    board.rotation.x = -0.18;
    board.userData.target = { kind: "about" } satisfies StoreTarget;
    this.interactive.push(board);

    // Bell on the counter (tap to contact).
    const bellGroup = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({ color: "#e0b341", emissive: "#3a2a00" });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 20), gold);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    dome.position.y = 0.03;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), gold);
    knob.position.y = 0.21;
    bellGroup.add(base, dome, knob);
    bellGroup.position.set(0.35, 1.13, cz + 0.15);
    bellGroup.traverse((o) => (o.userData.target = { kind: "bell" } satisfies StoreTarget));
    this.scene.add(bellGroup);
    this.bell = bellGroup;
    this.interactive.push(base, dome, knob);
    this.track(base.geometry, dome.geometry, knob.geometry, gold);

    // Card on the coffee table (tap for "about").
    if (theme.lounge) {
      const card = this.addPlane(chalkboardTexture("Hello", [business.about?.slice(0, 40) ?? "Thanks for stopping by", "Tap to learn more"]), 0.55, 0.41, [3.4, 0.54, 1.3], 0, false);
      card.rotation.x = -Math.PI / 2 + 0.25;
      card.userData.target = { kind: "about" } satisfies StoreTarget;
      this.interactive.push(card);
    }

    this.addProducts(accent);
  }

  private addPlane(texture: THREE.Texture, w: number, h: number, pos: [number, number, number], rotY: number, transparent: boolean) {
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...pos);
    mesh.rotation.y = rotY;
    this.scene.add(mesh);
    this.track(texture, mat, mesh.geometry);
    return mesh;
  }

  /** Products as framed pictures on the shelves, with price tags; "+N more" if they don't all fit. */
  private addProducts(accent: string) {
    const products = this.options.products;
    const slots: { pos: THREE.Vector3; rotY: number }[] = [];
    for (const y of [2.02, 3.0]) for (const x of [-2.1, -0.7, 0.7, 2.1]) slots.push({ pos: new THREE.Vector3(x, y, BACK + 0.32), rotY: 0 });
    for (const z of [-3.5, -2.3, -1.1]) slots.push({ pos: new THREE.Vector3(-W / 2 + 0.3, 1.55, z), rotY: Math.PI / 2 });
    for (const z of [-3.5, -2.3, -1.1]) slots.push({ pos: new THREE.Vector3(W / 2 - 0.3, 1.55, z), rotY: -Math.PI / 2 });
    const overflow = products.length > slots.length;
    const shown = overflow ? products.slice(0, slots.length - 1) : products;

    const frameMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const frameGeo = new THREE.BoxGeometry(1.08, 1.08, 0.07);
    const picGeo = new THREE.PlaneGeometry(0.94, 0.94);
    const tagGeo = new THREE.PlaneGeometry(0.62, 0.19);
    const badgeGeo = new THREE.PlaneGeometry(0.34, 0.15);
    const badgeTex = newBadgeTexture();
    const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, toneMapped: false });
    this.track(frameMat, frameGeo, picGeo, tagGeo, badgeGeo, badgeTex, badgeMat);

    shown.forEach((p, i) => {
      const slot = slots[i]!;
      const group = new THREE.Group();
      group.position.copy(slot.pos);
      group.rotation.y = slot.rotY;
      const frame = new THREE.Mesh(frameGeo, frameMat);
      const fallback = placeholderTexture(accent, p.media_type === "video");
      const picMat = new THREE.MeshBasicMaterial({ map: fallback, toneMapped: false });
      const still = p.media_type === "image" ? p.media_url : p.poster_url;
      if (still) {
        this.loader.load(still, (tex) => {
          if (this.disposed) return tex.dispose();
          tex.colorSpace = THREE.SRGBColorSpace;
          // Cover-crop to a square.
          const img = tex.image as { width: number; height: number };
          const ratio = img.width / img.height;
          if (ratio > 1) {
            tex.repeat.set(1 / ratio, 1);
            tex.offset.set((1 - 1 / ratio) / 2, 0);
          } else {
            tex.repeat.set(1, ratio);
            tex.offset.set(0, (1 - ratio) / 2);
          }
          picMat.map = tex;
          picMat.needsUpdate = true;
          this.track(tex);
          this.needsRender = true;
        });
      }
      const pic = new THREE.Mesh(picGeo, picMat);
      pic.position.z = 0.04;
      group.add(frame, pic);
      if (p.price !== null) {
        const tagTex = priceTagTexture(formatMoney(p.price, p.currency));
        const tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, toneMapped: false });
        const tag = new THREE.Mesh(tagGeo, tagMat);
        tag.position.set(0, -0.66, 0.05);
        group.add(tag);
        this.track(tagTex, tagMat);
      }
      if (p.viewed === false) {
        const badge = new THREE.Mesh(badgeGeo, badgeMat);
        badge.position.set(0.38, 0.48, 0.06);
        group.add(badge);
      }
      group.traverse((o) => (o.userData.target = { kind: "product", id: p.id } satisfies StoreTarget));
      this.scene.add(group);
      this.interactive.push(frame, pic);
      this.track(fallback, picMat);
    });

    if (overflow) {
      const slot = slots[slots.length - 1]!;
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#fff";
      ctx.font = "800 64px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${products.length - shown.length}`, 128, 110);
      ctx.font = "700 30px system-ui, sans-serif";
      ctx.fillText("See all", 128, 170);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const more = this.addPlane(tex, 0.9, 0.9, [slot.pos.x, slot.pos.y, slot.pos.z], slot.rotY, false);
      if (slot.rotY) more.position.x += slot.rotY > 0 ? 0.04 : -0.04;
      else more.position.z += 0.04;
      more.userData.target = { kind: "more" } satisfies StoreTarget;
      this.interactive.push(more);
    }
  }

  private track(...items: { dispose: () => void }[]) {
    this.disposables.push(...items);
  }

  // ------------------------------------------------------------------ camera and input

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    // Phones (tall screens) get a wider view so the counter and shelves fit.
    this.camera.fov = w / h < 0.8 ? 72 : 58;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private placeCamera() {
    const ease = 1 - Math.pow(1 - this.intro, 3);
    const portrait = this.camera.aspect < 0.8;
    // Walk in from the door, glancing over at the lounge first.
    const yaw = this.yaw + (1 - ease) * (this.options.theme.lounge ? 0.6 : 0.2);
    this.camera.position.set(Math.sin(yaw) * 0.6, 1.7, (portrait ? 4.5 : 5.6) + (1 - ease) * 3);
    const pitch = this.pitch + (portrait ? 0.07 : 0.04);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }

  private hit(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(this.interactive, false)[0]?.object ?? null;
  }

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
  }

  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    this.yawVelocity = 0;
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse") {
        const obj = this.hit(e.clientX, e.clientY);
        const target = obj ? this.rootOf(obj) : null;
        if (target !== this.hovered) {
          if (this.hovered) this.hovered.scale.setScalar(1);
          this.hovered = target;
          if (target) target.scale.setScalar(1.06);
          this.renderer.domElement.style.cursor = target ? "pointer" : "grab";
          this.needsRender = true;
        }
      }
      return;
    }
    const w = this.container.clientWidth || 1;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const delta = (-dx / w) * 1.6;
    this.yaw = Math.max(-0.95, Math.min(0.95, this.yaw + delta));
    this.yawVelocity = delta;
    this.pitch = Math.max(-0.28, Math.min(0.12, this.pitch + (dy / w) * 0.6));
    this.needsRender = true;
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || e.type !== "pointerup") return;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 8) {
      this.yawVelocity = 0;
      const obj = this.hit(e.clientX, e.clientY);
      const target = obj?.userData.target as StoreTarget | undefined;
      if (target) {
        if (target.kind === "bell") this.ring();
        this.options.onSelect?.(target);
      }
    }
  };

  private onLeave = () => {
    if (this.hovered) this.hovered.scale.setScalar(1);
    this.hovered = null;
    this.needsRender = true;
  };

  /** The group a tapped piece belongs to (a framed product), or the piece itself. */
  private rootOf(obj: THREE.Object3D) {
    return obj.parent && obj.parent !== this.scene ? obj.parent : obj;
  }

  private ringing = 0;
  private ring() {
    this.ringing = 1;
  }

  /** Turns the view by an amount (buttons and arrow keys). */
  look(delta: number) {
    this.yawVelocity = delta * 0.12;
  }

  // ------------------------------------------------------------------ loop

  private loop = (now: number) => {
    this.frame = 0;
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    let animating = false;
    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + dt / 1.4);
      animating = true;
    }
    if (this.pointers.size === 0 && Math.abs(this.yawVelocity) > 0.0002) {
      this.yaw = Math.max(-0.95, Math.min(0.95, this.yaw + this.yawVelocity));
      this.yawVelocity *= 0.9;
      animating = true;
    }
    if (this.ringing > 0 && this.bell) {
      this.ringing = Math.max(0, this.ringing - dt * 2.5);
      this.bell.rotation.z = Math.sin(this.ringing * 30) * 0.25 * this.ringing;
      animating = true;
    }
    if (animating || this.needsRender) {
      this.placeCamera();
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
    if (!document.hidden) this.frame = requestAnimationFrame(this.loop);
    else document.addEventListener("visibilitychange", this.resume, { once: true });
  };

  private resume = () => {
    if (!this.frame && !this.disposed) {
      this.last = performance.now();
      this.needsRender = true;
      this.frame = requestAnimationFrame(this.loop);
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.resume);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    el.removeEventListener("pointerleave", this.onLeave);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
