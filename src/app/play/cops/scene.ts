// Police & Thieves, drawn: the city (world.ts) at the time of day the game is played (10am in the
// sun, 6pm at sunset, 2am at night with lit windows and street lamps), its roads, pavements and
// blocks painted on one big ground, every building and prop baked into a few big meshes (one
// colour material, so a phone draws the whole city in a handful of calls), police in navy with
// caps, thieves in black hoodies and masks (a sack of money on the back when carrying), tanks,
// tracers, rockets, grenades, explosions, the vault and the bags of loot glowing so you can find
// them. Third person over the right shoulder; aiming comes in close; a sniper looks through its
// scope; a tank sits further back.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SIDES, type GunId } from "@/lib/cops";
import { recipeOf, type Avatar } from "@/lib/avatar";
import { getAvatarModel } from "@/lib/avatar3d/client";
import { LOD } from "@/lib/avatar3d/lod";
import { makeMaterials, type MaterialSet } from "@/lib/avatar3d/materials";
import { MOVES, applyMove } from "@/lib/avatar3d/moves";
import { seededRecipe, type Recipe } from "@/lib/avatar3d/recipe";
import { mountModel, type AvatarObject } from "@/lib/avatar3d/scene";
import { HIDEOUT, HQ, MAP, ROAD_W, ROADS, VAULT, type Bag, type Block, type City, type Shape, type Shot, type V3 } from "./world";

export type Tod = "day" | "dusk" | "night";

const SKY: Record<Tod, { top: number; low: number; fog: number; near: number; far: number; hemi: [number, number, number]; sun: number; sunI: number; sunAt: [number, number, number]; exposure: number; lit: boolean }> = {
  day: { top: 0x2f78c4, low: 0xd6e8f5, fog: 0xc9dceb, near: 70, far: 300, hemi: [0xeaf4ff, 0x6b6150, 1.05], sun: 0xfff1d8, sunI: 2.5, sunAt: [-40, 70, 30], exposure: 1.05, lit: false },
  dusk: { top: 0x27365f, low: 0xff9a5a, fog: 0xd9946a, near: 55, far: 260, hemi: [0xffc9a0, 0x3d3550, 0.85], sun: 0xffa060, sunI: 1.9, sunAt: [-70, 22, 20], exposure: 1.1, lit: true },
  night: { top: 0x040815, low: 0x1a2747, fog: 0x0f182c, near: 30, far: 190, hemi: [0x8fa8ff, 0x1a1a24, 0.6], sun: 0xa9c1ff, sunI: 0.75, sunAt: [40, 70, -30], exposure: 1.3, lit: true },
};

type Mat = "matte" | "shiny" | "tower" | "glow";
const m4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** A geometry ready to be merged: no index, just position, normal, uv and a colour. */
function prep(g: THREE.BufferGeometry, colour: number, m: THREE.Matrix4) {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  g.dispose();
  for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  geo.applyMatrix4(m);
  const c = new THREE.Color(colour);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Many pieces, merged into one mesh per material. */
class Parts {
  private lists = new Map<Mat, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, colour: number, m: THREE.Matrix4, mat: Mat = "matte") {
    let l = this.lists.get(mat);
    if (!l) this.lists.set(mat, (l = []));
    l.push(prep(g, colour, m));
  }
  build(mats: Record<Mat, THREE.Material>, bin: { dispose(): void }[], shadows: boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.lists) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      bin.push(geo);
      const mesh = new THREE.Mesh(geo, mats[mat]);
      mesh.castShadow = shadows && mat !== "glow";
      mesh.receiveShadow = shadows && mat !== "glow";
      out.push(mesh);
    }
    this.lists.clear();
    return out;
  }
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const darker = (c: number, k = 0.7) => new THREE.Color(c).multiplyScalar(k).getHex();

type Char = {
  root: THREE.Group;
  body: THREE.Group;
  legs: [THREE.Object3D, THREE.Object3D];
  arms: THREE.Group;
  guns: Map<GunId, THREE.Mesh>;
  bag: THREE.Mesh;
  tag: THREE.Sprite | null;
  bar: { sprite: THREE.Sprite; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string } | null;
  tank: { root: THREE.Group; turret: THREE.Group; barrel: THREE.Object3D } | null;
  team: number;
  stride: number;
  /** The simple figure, shown until the real avatar is ready (or if it can't be built). */
  simple: THREE.Object3D[];
  /** Just the guns (no arms), held by the avatar. */
  held: Map<GunId, THREE.Mesh>;
  /** The player's own 3D avatar in uniform, once built. */
  av: { obj: AvatarObject; mats: MaterialSet; scale: number; floor: number; t: number } | null;
};

/**
 * The uniforms, as avatar parts (src/lib/avatar3d/catalog.ts): police in a navy shirt and cap,
 * dark trousers and black boots (with a vest over the top, added below); thieves in a black
 * hoodie, joggers, dark shades and trainers (and a mask over the face). Everything else (face,
 * skin, hair, build) is the player's own.
 */
const UNIFORM: Record<number, Partial<Recipe>> = {
  0: { outfit: 0, topStyle: 7, top: 0, pattern: 0, bottomStyle: 1, bottom: 0, hw: 1, hwC: 0, layer: 0, shoes: 6, shoeC: 2, glasses: 0, chain: 0, watch: 0, ear: 0, pierce: 0 },
  1: { outfit: 0, topStyle: 3, top: 5, pattern: 0, bottomStyle: 4, bottom: 0, hw: 0, layer: 0, shoes: 1, shoeC: 2, glasses: 3, chain: 0, watch: 0, ear: 0, pierce: 0 },
};
const MOVE = (id: string) => MOVES.find((m) => m.id === id) ?? MOVES[0];
const eul = new THREE.Euler();
const quat = new THREE.Quaternion();

export type ActorView = { x: number; y: number; z: number; yaw: number; pitch: number; speed: number; alive: boolean; crouch: boolean; tank: number; bag: boolean; gun: GunId; hp: number; armour: number; shield: boolean };

export class CopsScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 700);
  private city: City;
  private bin: { dispose(): void }[] = [];
  private mats: Record<Mat, THREE.Material>;
  private charMat: THREE.MeshStandardMaterial;
  private chars = new Map<string, Char>();
  private shots = new Map<number, THREE.Object3D>();
  private pools = new Map<string, THREE.Object3D[]>();
  private fx: { obj: THREE.Object3D; age: number; life: number; kind: "flash" | "spark" | "fire" | "smoke" | "ring"; v?: THREE.Vector3 }[] = [];
  private flashTex: THREE.Texture;
  private smokeTex: THREE.Texture;
  private boomLight: THREE.PointLight;
  private bags = new Map<string, THREE.Group>();
  private bagGeo: THREE.BufferGeometry;
  private bagMat: THREE.Material;
  private beamMat: THREE.Material;
  private pings: { obj: THREE.Group; until: number }[] = [];
  private sun: THREE.DirectionalLight;
  private sunOff: THREE.Vector3;
  private camLook = new THREE.Vector3();
  private fov = 70;
  private shake = 0;
  private lit: boolean;
  private gone = false;
  readonly low: boolean;

  constructor(host: HTMLElement, city: City, blocks: Block[], tod: Tod = "day", low = false) {
    this.city = city;
    this.low = low;
    const look = SKY[tod];
    this.lit = look.lit;
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: "high-performance" });
    const r = this.renderer;
    r.setPixelRatio(Math.min(low ? 1 : 1.5, window.devicePixelRatio || 1));
    r.shadowMap.enabled = !low;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = look.exposure;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.style.width = "100%";
    r.domElement.style.height = "100%";
    r.domElement.style.touchAction = "none";
    host.appendChild(r.domElement);
    const sc = this.scene;
    sc.fog = new THREE.Fog(look.fog, look.near, look.far);
    sc.background = new THREE.Color(look.fog);

    // The sky: a gradient dome, the sun or moon, stars at night.
    const skyGeo = new THREE.SphereGeometry(600, 32, 16);
    const cols: number[] = [];
    const top = new THREE.Color(look.top);
    const low_ = new THREE.Color(look.low);
    const c = new THREE.Color();
    const pos = skyGeo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      c.copy(low_).lerp(top, Math.pow(Math.max(0, pos.getY(i) / 600), 0.5));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    sc.add(new THREE.Mesh(skyGeo, skyMat));
    this.bin.push(skyGeo, skyMat);
    const disc = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.35, tod === "night" ? "rgba(220,230,255,0.9)" : "rgba(255,240,200,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    const discMat = new THREE.SpriteMaterial({ map: disc, fog: false, depthWrite: false, transparent: true });
    const orb = new THREE.Sprite(discMat);
    const sp = new THREE.Vector3(...look.sunAt).normalize().multiplyScalar(500);
    orb.position.copy(sp);
    orb.scale.setScalar(tod === "night" ? 40 : 70);
    sc.add(orb);
    this.bin.push(disc, discMat);
    if (tod === "night") {
      const starGeo = new THREE.BufferGeometry();
      const sv: number[] = [];
      for (let k = 0; k < 900; k++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * 1.3 + 0.12;
        sv.push(Math.cos(a) * Math.cos(e) * 560, Math.sin(e) * 560, Math.sin(a) * Math.cos(e) * 560);
      }
      starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false });
      sc.add(new THREE.Points(starGeo, starMat));
      this.bin.push(starGeo, starMat);
    }

    sc.add(new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2]));
    this.sun = new THREE.DirectionalLight(look.sun, look.sunI);
    this.sunOff = new THREE.Vector3(...look.sunAt).normalize().multiplyScalar(90);
    this.sun.castShadow = !low;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sh = this.sun.shadow.camera as THREE.OrthographicCamera;
    sh.left = -45;
    sh.right = 45;
    sh.top = 45;
    sh.bottom = -45;
    sh.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    sc.add(this.sun, this.sun.target);
    this.boomLight = new THREE.PointLight(0xffa040, 0, 26, 2);
    sc.add(this.boomLight);

    // Materials: everything static is coloured by its vertices.
    const windowTex = canvasTex(64, 64, (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#5a6878";
      for (const [x, y] of [[8, 10], [36, 10], [8, 38], [36, 38]]) g.fillRect(x, y, 20, 18);
    });
    windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
    const litTex = canvasTex(64, 64, (g) => {
      g.fillStyle = "#000000";
      g.fillRect(0, 0, 64, 64);
      for (const [x, y] of [[8, 10], [36, 10], [8, 38], [36, 38]]) {
        g.fillStyle = Math.random() < 0.55 ? "#ffd98a" : "#10141a";
        g.fillRect(x, y, 20, 18);
      }
    });
    litTex.wrapS = litTex.wrapT = THREE.RepeatWrapping;
    this.mats = {
      matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
      shiny: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35 }),
      tower: new THREE.MeshStandardMaterial({ vertexColors: true, map: windowTex, roughness: 0.6, metalness: 0.1, emissive: look.lit ? 0xffffff : 0x000000, emissiveMap: look.lit ? litTex : null, emissiveIntensity: tod === "night" ? 0.9 : 0.45 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    // People stand out a little, even in shade and at night.
    this.charMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: 0x202020, emissiveIntensity: tod === "night" ? 1.4 : 0.6 });
    this.bin.push(windowTex, litTex, ...Object.values(this.mats), this.charMat);

    // The ground: roads, pavements and every block, painted on one big canvas.
    const groundTex = canvasTex(2048, 2048, (g) => paintGround(g, blocks));
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.h * 2, MAP.h * 2).rotateX(-Math.PI / 2), groundMat);
    ground.receiveShadow = !low;
    sc.add(ground);
    const outerMat = new THREE.MeshLambertMaterial({ color: tod === "night" ? 0x2a2f2a : 0x5d7a4a });
    const outer = new THREE.Mesh(new THREE.RingGeometry(MAP.h * 1.4, 700, 48, 1).rotateX(-Math.PI / 2), outerMat);
    outer.position.y = -0.05;
    sc.add(outer);
    const apronMat = new THREE.MeshLambertMaterial({ color: 0x6f7378 });
    const apron = new THREE.Mesh(new THREE.RingGeometry(MAP.h * 1.0, MAP.h * 1.42, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), apronMat);
    apron.position.y = -0.03;
    sc.add(apron);
    this.bin.push(groundTex, groundMat, outerMat, apronMat, ground.geometry, outer.geometry, apron.geometry);

    // Everything you can hide behind, in 3 × 3 chunks (so what's off screen isn't drawn).
    const chunks = new Map<number, Parts>();
    const chunkOf = (x: number, z: number) => Math.min(2, Math.max(0, Math.floor(((x + MAP.h) / (MAP.h * 2)) * 3))) * 3 + Math.min(2, Math.max(0, Math.floor(((z + MAP.h) / (MAP.h * 2)) * 3)));
    for (const s of city.shapes) {
      const k = chunkOf(s.x, s.z);
      let p = chunks.get(k);
      if (!p) chunks.set(k, (p = new Parts()));
      buildProp(s, p);
    }
    // The wall round the city, street lamps along the roads.
    const edge = new Parts();
    for (const [x, z, w, d] of [[0, -MAP.h - 0.5, MAP.h * 2 + 2, 1], [0, MAP.h + 0.5, MAP.h * 2 + 2, 1], [-MAP.h - 0.5, 0, 1, MAP.h * 2], [MAP.h + 0.5, 0, 1, MAP.h * 2]]) {
      edge.add(new THREE.BoxGeometry(w, 4.2, d), 0xb5b0a6, m4(x, 2.1, z));
      edge.add(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), 0x8a857c, m4(x, 4.3, z));
    }
    for (const p of [...chunks.values(), edge]) for (const mesh of p.build(this.mats, this.bin, !low)) sc.add(mesh);
    this.lamps(tod);
    this.skyline(tod, windowTex, litTex);
    this.signs();

    // The vault and the hideout glow; bags of loot and pings use these.
    this.flashTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,230,1)");
      gr.addColorStop(0.3, "rgba(255,200,80,0.9)");
      gr.addColorStop(1, "rgba(255,120,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    this.smokeTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(90,90,90,0.75)");
      gr.addColorStop(1, "rgba(60,60,60,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    this.bagGeo = new THREE.SphereGeometry(0.34, 12, 10);
    this.bagMat = new THREE.MeshStandardMaterial({ color: 0x9c6b30, roughness: 0.9 });
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.bin.push(this.flashTex, this.smokeTex, this.bagGeo, this.bagMat, this.beamMat);
    this.beam(VAULT.x, VAULT.z, 0xffd43b, 2.2, 40);
    this.beam(HIDEOUT.x, HIDEOUT.z, 0xff922b, 3, 30);
  }

  /** A tall soft light over a place, to find it from far away. */
  private beam(x: number, z: number, colour: number, r: number, h: number) {
    const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const geo = new THREE.CylinderGeometry(r, r, h, 20, 1, true);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h / 2, z);
    this.scene.add(m);
    this.bin.push(mat, geo);
  }

  private lamps(tod: Tod) {
    const spots: { x: number; z: number; ry: number }[] = [];
    for (const road of ROADS)
      for (let a = -MAP.h + 8; a < MAP.h - 8; a += 26) {
        if (ROADS.some((x) => Math.abs(a - x) < 9)) continue;
        for (const side of [-1, 1]) {
          spots.push({ x: a, z: road + side * (ROAD_W / 2 + 0.6), ry: side > 0 ? 0 : Math.PI });
          spots.push({ x: road + side * (ROAD_W / 2 + 0.6), z: a + 13, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
        }
      }
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 6.5, 6);
    const headGeo = new THREE.BoxGeometry(0.35, 0.18, 1.1);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.5, metalness: 0.5 });
    const headMat = new THREE.MeshBasicMaterial({ color: this.lit ? 0xffe7a8 : 0xd0d4d8 });
    this.bin.push(poleGeo, headGeo, poleMat, headMat);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    spots.forEach((s, k) => {
      poles.setMatrixAt(k, m4(s.x, 3.25, s.z));
      const dx = -Math.sin(s.ry) * 0;
      heads.setMatrixAt(k, m4(s.x + dx, 6.45, s.z, 0, s.ry === 0 || s.ry === Math.PI ? 0 : Math.PI / 2, 0));
    });
    this.scene.add(poles, heads);
    if (this.lit) {
      // Pools of light on the road under each lamp.
      const glowTex = canvasTex(64, 64, (g) => {
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, tod === "night" ? "rgba(255,214,140,0.55)" : "rgba(255,214,140,0.25)");
        gr.addColorStop(1, "rgba(255,214,140,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
      });
      const glowGeo = new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2);
      const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.bin.push(glowTex, glowGeo, glowMat);
      const glows = new THREE.InstancedMesh(glowGeo, glowMat, spots.length);
      spots.forEach((s, k) => glows.setMatrixAt(k, m4(s.x, 0.03, s.z)));
      glows.renderOrder = 1;
      this.scene.add(glows);
    }
  }

  /** The rest of the city, out past the wall. */
  private skyline(tod: Tod, win: THREE.Texture, lit: THREE.Texture) {
    const N = 90;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const tex = win.clone();
    tex.repeat.set(4, 8);
    tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ color: tod === "night" ? 0x39414f : 0x9aa6b2, map: tex, emissive: this.lit ? 0xffffff : 0x000000, emissiveMap: this.lit ? lit : null, emissiveIntensity: 0.6 });
    this.bin.push(geo, tex, mat);
    const blocks = new THREE.InstancedMesh(geo, mat, N);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + (k % 3) * 0.02;
      const rr = 175 + ((k * 37) % 70);
      const h = 18 + ((k * 31) % 11) * 7;
      const w = 12 + ((k * 17) % 6) * 3;
      blocks.setMatrixAt(k, m4(Math.cos(a) * rr, h / 2, Math.sin(a) * rr, 0, -a, 0, w, h, w * 0.8));
    }
    this.scene.add(blocks);
  }

  /** The signs over the bank, the police HQ and the hideout. */
  private signs() {
    const sign = (text: string, bg: string, fg: string, x: number, y: number, z: number, ry: number, w: number) => {
      const tex = canvasTex(512, 96, (g) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, 512, 96);
        g.fillStyle = fg;
        g.font = "900 58px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, 256, 52);
      });
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const geo = new THREE.PlaneGeometry(w, w * 0.1875);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      this.scene.add(m);
      this.bin.push(tex, mat, geo);
    };
    sign("BANK OF NEWTOWN", "#1d2b44", "#ffd43b", 0, 11, -7.95, 0, 20);
    sign("POLICE", "#1c3fa8", "#ffffff", HQ.x + 8.05, 7.6, -16, Math.PI / 2, 10);
    sign("WAREHOUSE", "#3d2b1f", "#ffa94d", HIDEOUT.x + 0.05, 6.8, -10, Math.PI / 2, 9);
  }

  // ---------------------------------------------------------------- people

  addActor(id: string, name: string, team: number, me: boolean, avatar?: unknown) {
    if (this.chars.has(id)) return;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const police = team === 0;
    let h = 7;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const skin = [0x5c3a21, 0x8d5524, 0x6b4226, 0xa0663b, 0x4a2c17][h % 5];
    const shirt = police ? 0x2747a8 : 0x4a4a55;
    const pants = police ? 0x1b2847 : 0x5c5c66;
    const mesh = (p: Parts) => {
      const ms = p.build({ matte: this.charMat, shiny: this.charMat, tower: this.charMat, glow: this.charMat }, this.bin, !this.low);
      return ms[0];
    };
    // Legs.
    const legs: THREE.Object3D[] = [];
    for (const lx of [-0.13, 0.13]) {
      const p = new Parts();
      p.add(new THREE.CapsuleGeometry(0.1, 0.62, 3, 8), pants, m4(0, -0.42, 0));
      p.add(new THREE.BoxGeometry(0.16, 0.1, 0.28), 0x15171a, m4(0, -0.86, -0.05));
      const leg = mesh(p);
      leg.position.set(lx, 0.9, 0);
      body.add(leg);
      legs.push(leg);
    }
    // Body and head.
    const p = new Parts();
    p.add(new THREE.CapsuleGeometry(0.24, 0.42, 4, 12), shirt, m4(0, 1.22, 0));
    if (police) {
      p.add(new THREE.BoxGeometry(0.47, 0.36, 0.31), 0x0b0f1a, m4(0, 1.3, 0.01));
      p.add(new THREE.BoxGeometry(0.48, 0.06, 0.32), 0xd8f05a, m4(0, 1.36, 0.01));
      p.add(new THREE.BoxGeometry(0.1, 0.06, 0.02), 0xffd43b, m4(-0.12, 1.42, -0.165));
    } else {
      p.add(new THREE.BoxGeometry(0.47, 0.06, 0.31), SIDES[1].colour, m4(0, 1.05, 0.01));
      p.add(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), shirt, m4(0, 1.5, 0.06, -0.4));
    }
    p.add(new THREE.SphereGeometry(0.15, 14, 10), skin, m4(0, 1.62, 0));
    if (police) {
      p.add(new THREE.CylinderGeometry(0.16, 0.165, 0.11, 14), 0x1e3a8a, m4(0, 1.75, 0));
      p.add(new THREE.BoxGeometry(0.3, 0.025, 0.14), 0x0b0f1a, m4(0, 1.71, -0.16));
      p.add(new THREE.BoxGeometry(0.06, 0.05, 0.02), 0xffd43b, m4(0, 1.76, -0.165));
    } else {
      // A beanie and a mask over the face, eyes showing.
      p.add(new THREE.SphereGeometry(0.162, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x222226, m4(0, 1.64, 0));
      p.add(new THREE.BoxGeometry(0.26, 0.11, 0.1), 0x222226, m4(0, 1.56, -0.11));
      p.add(new THREE.BoxGeometry(0.2, 0.025, 0.02), SIDES[1].colour, m4(0, 1.73, -0.15));
    }
    const torso = mesh(p);
    body.add(torso);
    // Arms with each gun.
    const arms = new THREE.Group();
    arms.position.set(0, 1.38, 0);
    body.add(arms);
    const guns = new Map<GunId, THREE.Mesh>();
    for (const gun of ["pistol", "smg", "shotgun", "rifle", "sniper", "rocket"] as GunId[]) {
      const a = new Parts();
      a.add(new THREE.CapsuleGeometry(0.07, 0.36, 3, 6), shirt, m4(0.22, -0.1, -0.2, Math.PI / 2.4));
      a.add(new THREE.CapsuleGeometry(0.07, 0.36, 3, 6), shirt, m4(-0.12, -0.08, -0.3, Math.PI / 2.2, 0, -0.5));
      gunModel(gun, a);
      const g = mesh(a);
      g.visible = gun === "pistol";
      arms.add(g);
      guns.set(gun, g);
    }
    // The same guns alone, for the avatar's own arms to hold.
    const held = new Map<GunId, THREE.Mesh>();
    for (const gun of ["pistol", "smg", "shotgun", "rifle", "sniper", "rocket"] as GunId[]) {
      const a = new Parts();
      gunModel(gun, a);
      const g = mesh(a);
      g.visible = false;
      // Up into the avatar's hands, a little in from the side.
      g.position.set(-0.06, 0.09, 0.04);
      arms.add(g);
      held.set(gun, g);
    }
    // A sack of money, worn on the back while carrying.
    const bag = new THREE.Mesh(this.bagGeo, this.bagMat);
    bag.position.set(0, 1.3, 0.32);
    bag.scale.set(1, 1.15, 0.85);
    bag.visible = false;
    body.add(bag);
    let tag: THREE.Sprite | null = null;
    let bar: Char["bar"] = null;
    if (!me) {
      const tex = canvasTex(256, 64, (g) => {
        g.clearRect(0, 0, 256, 64);
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.beginPath();
        g.roundRect(8, 10, 240, 44, 22);
        g.fill();
        g.fillStyle = SIDES[team].css;
        g.font = "800 28px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(name.slice(0, 16), 128, 33);
      });
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false });
      tag = new THREE.Sprite(mat);
      tag.scale.set(0.16, 0.04, 1);
      tag.position.y = 2.25;
      tag.renderOrder = 10;
      root.add(tag);
      const cv = document.createElement("canvas");
      cv.width = 128;
      cv.height = 16;
      const btex = new THREE.CanvasTexture(cv);
      const bmat = new THREE.SpriteMaterial({ map: btex, depthTest: false, transparent: true, sizeAttenuation: false });
      const bs = new THREE.Sprite(bmat);
      bs.scale.set(0.09, 0.011, 1);
      bs.position.y = 2.0;
      bs.renderOrder = 10;
      root.add(bs);
      bar = { sprite: bs, g: cv.getContext("2d")!, tex: btex, key: "" };
      this.bin.push(tex, mat, btex, bmat);
    }
    this.scene.add(root);
    const c: Char = { root, body, legs: [legs[0], legs[1]], arms, guns, bag, tag, bar, tank: null, team, stride: 0, simple: [legs[0], legs[1], torso, ...guns.values()], held, av: null };
    this.chars.set(id, c);
    this.dressAvatar(c, id, team, me, avatar);
  }

  /** Builds the player's own 3D avatar in their side's uniform (in the background); it replaces the simple figure when ready. */
  private dressAvatar(c: Char, id: string, team: number, me: boolean, avatar?: unknown) {
    let recipe: Recipe;
    try {
      recipe = avatar ? recipeOf(avatar as Avatar) : seededRecipe(id);
    } catch {
      recipe = seededRecipe(id);
    }
    recipe = { ...recipe, ...UNIFORM[team] };
    // You in full detail; everyone else in the light version (one mesh each: a full match stays smooth on a phone).
    void getAvatarModel(recipe, me ? LOD.near : LOD.far)
      .then((model) => {
        if (this.gone || this.chars.get(id) !== c) return;
        const mats = makeMaterials(recipe);
        const obj = mountModel(model, mats);
        const box = new THREE.Box3().setFromObject(obj.root);
        const scale = 1.74 / Math.max(0.01, box.max.y - box.min.y);
        obj.root.scale.setScalar(scale);
        obj.root.position.y = -box.min.y * scale;
        obj.root.traverse((o) => {
          (o as THREE.Mesh).castShadow = !this.low;
          o.frustumCulled = false;
        });
        // The avatar faces +z; everyone here faces -z.
        const wrap = new THREE.Group();
        wrap.rotation.y = Math.PI;
        wrap.add(obj.root);
        c.body.add(wrap);
        this.kit(c, obj, team, scale);
        for (const o of c.simple) o.visible = false;
        c.av = { obj, mats, scale, floor: box.min.y, t: 0 };
      })
      .catch(() => {
        // The simple figure stays.
      });
  }

  /** The kit over the uniform: a police vest (POLICE on the back), or a thief's mask. */
  private kit(c: Char, obj: AvatarObject, team: number, scale: number) {
    const chest = obj.nodes.chest;
    const head = obj.nodes.head ?? obj.nodes.skull;
    const u = 1 / scale;
    if (team === 0 && chest) {
      const vest = new THREE.Group();
      const geo = new RoundedBoxGeometry(0.4 * u, 0.36 * u, 0.25 * u, 3, 0.07 * u);
      const mat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
      const v = new THREE.Mesh(geo, mat);
      vest.add(v);
      const tex = canvasTex(256, 96, (g) => {
        g.fillStyle = "#111827";
        g.fillRect(0, 0, 256, 96);
        g.fillStyle = "#ffffff";
        g.font = "900 54px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("POLICE", 128, 52);
      });
      const label = new THREE.MeshBasicMaterial({ map: tex });
      const pgeo = new THREE.PlaneGeometry(0.34 * u, 0.12 * u);
      const back = new THREE.Mesh(pgeo, label);
      back.position.set(0, 0.04 * u, -0.127 * u);
      back.rotation.y = Math.PI;
      const front = new THREE.Mesh(pgeo, label);
      front.position.set(0, 0.07 * u, 0.127 * u);
      front.scale.setScalar(0.6);
      vest.add(back, front);
      vest.position.set(0, -0.06 * u, 0.0);
      chest.add(vest);
      this.bin.push(geo, mat, tex, label, pgeo);
    }
    if (team === 1 && head) {
      // A dark mask over the lower face.
      const geo = new THREE.SphereGeometry(0.105 * u, 16, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.45);
      const mat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(1, 1.05, 1.08);
      m.position.set(0, 0.05 * u, 0.012 * u);
      head.add(m);
      this.bin.push(geo, mat);
    }
    void c;
  }

  private makeTank(c: Char) {
    const police = c.team === 0;
    const hull = police ? 0x2c3e50 : 0x4b5320;
    const trim = police ? 0xf1f3f5 : SIDES[1].colour;
    const mats = { matte: this.charMat, shiny: this.charMat, tower: this.charMat, glow: this.charMat };
    const root = new THREE.Group();
    const p = new Parts();
    p.add(new THREE.BoxGeometry(3.2, 1.1, 5.8), hull, m4(0, 1.0, 0));
    p.add(new THREE.BoxGeometry(2.6, 0.5, 4.6), darker(hull, 0.85), m4(0, 1.7, 0.1));
    p.add(new THREE.BoxGeometry(3.25, 0.12, 0.4), trim, m4(0, 1.3, -2.7));
    for (const sx of [-1, 1]) {
      p.add(new THREE.BoxGeometry(0.75, 0.95, 6.3), 0x1d1f22, m4(sx * 1.55, 0.5, 0));
      for (let k = 0; k < 6; k++) p.add(new THREE.CylinderGeometry(0.38, 0.38, 0.8, 10).rotateZ(Math.PI / 2), 0x3a3d42, m4(sx * 1.55, 0.42, -2.4 + k * 0.96));
    }
    const hullMesh = p.build(mats, this.bin, !this.low);
    for (const m of hullMesh) root.add(m);
    const turret = new THREE.Group();
    turret.position.set(0, 2.0, 0.3);
    const t = new Parts();
    t.add(new THREE.CylinderGeometry(1.15, 1.3, 0.8, 12), darker(hull, 1.1), m4(0, 0.35, 0));
    t.add(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10), 0x1d1f22, m4(0.4, 0.85, 0.3));
    t.add(new THREE.BoxGeometry(1.0, 0.14, 0.14), trim, m4(0, 0.5, -1.1));
    for (const m of t.build(mats, this.bin, !this.low)) turret.add(m);
    const barrel = new THREE.Group();
    barrel.position.set(0, 0.4, -0.9);
    const b = new Parts();
    b.add(new THREE.CylinderGeometry(0.13, 0.16, 3.4, 10).rotateX(Math.PI / 2), 0x2b2f35, m4(0, 0, -1.7));
    b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 10).rotateX(Math.PI / 2), 0x1d1f22, m4(0, 0, -3.35));
    for (const m of b.build(mats, this.bin, !this.low)) barrel.add(m);
    turret.add(barrel);
    root.add(turret);
    this.scene.add(root);
    c.tank = { root, turret, barrel };
  }

  setActor(id: string, v: ActorView, dt: number, hideSelf = false) {
    const c = this.chars.get(id);
    if (!c) return;
    const inTank = v.tank > 0;
    c.root.visible = v.alive && !hideSelf && !inTank;
    c.root.position.set(v.x, v.y, v.z);
    c.root.rotation.y = v.yaw;
    if (inTank && !c.tank) this.makeTank(c);
    if (c.tank) {
      c.tank.root.visible = v.alive && inTank;
      if (inTank) {
        c.tank.root.position.set(v.x, v.y, v.z);
        // The hull turns slowly towards where it's going; the turret points where you look.
        let d = v.yaw - c.tank.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (v.speed > 0.5) c.tank.root.rotation.y += d * Math.min(1, dt * 2.5);
        c.tank.turret.rotation.y = v.yaw - c.tank.root.rotation.y;
        c.tank.barrel.rotation.x = Math.max(-0.15, Math.min(0.4, v.pitch));
      }
    }
    if (inTank) return;
    c.arms.rotation.x = v.pitch * 0.9;
    if (c.av) {
      this.poseAvatar(c, v, dt);
      c.body.visible = !v.shield || Math.floor(performance.now() / 120) % 2 === 0;
      if (c.tag) c.tag.position.y = v.crouch ? 1.6 : 2.2;
      this.drawBar(c, v);
      return;
    }
    for (const [g, m] of c.guns) m.visible = g === v.gun;
    c.bag.visible = v.bag;
    c.stride += v.speed * dt * 2.2;
    const go = Math.min(1, v.speed / 3);
    const swing = Math.sin(c.stride) * go * 0.7;
    if (v.crouch) {
      c.body.position.y = -0.42;
      c.legs[0].rotation.x = -1.1 + swing * 0.3;
      c.legs[1].rotation.x = -0.4 - swing * 0.3;
    } else {
      c.body.position.y = Math.abs(Math.cos(c.stride)) * go * 0.05;
      c.legs[0].rotation.x = swing;
      c.legs[1].rotation.x = -swing;
    }
    c.body.visible = !v.shield || Math.floor(performance.now() / 120) % 2 === 0;
    if (c.tag) c.tag.position.y = v.crouch ? 1.8 : 2.25;
    this.drawBar(c, v);
  }

  /** The avatar walking, running, standing or crouching, holding its gun up where it aims. */
  private poseAvatar(c: Char, v: ActorView, dt: number) {
    const a = c.av!;
    for (const [g, m] of c.held) m.visible = g === v.gun;
    c.bag.visible = v.bag;
    c.body.position.y = 0;
    const run = v.speed > 4.2;
    const move = v.crouch ? MOVE("sit") : MOVE(run ? "run" : v.speed > 0.4 ? "walk" : "idle");
    // Feet keep up with the ground (a move's own speed is in the avatar's units).
    a.t += move.speed > 0 ? (dt * v.speed) / (move.speed * a.scale) : dt;
    const nodes = a.obj.nodes;
    applyMove(nodes, a.obj.rest, move, a.t, a.obj.stride, v.crouch ? { seat: 0.5 / a.scale + a.floor } : undefined);
    // Both arms up on the gun, raised and lowered with the aim.
    const p = Math.max(-0.8, Math.min(0.8, v.pitch));
    const set = (id: string, x: number, y: number, z: number) => {
      const b = nodes[id];
      const r = a.obj.rest.get(id);
      if (!b || !r) return;
      b.quaternion.copy(r.q).multiply(quat.setFromEuler(eul.set(x, y, z, "YXZ")));
    };
    // (x: forward and up; z: the right arm in is +, the left arm in is -.)
    if (v.gun === "rocket") {
      set("upperArm0", -0.65 - p * 0.5, 0, -0.15);
      set("forearm0", -1.55, 0, 0);
      set("upperArm1", -1.2 - p * 0.9, 0, -0.4);
      set("forearm1", -0.6, 0, 0);
    } else if (v.gun === "pistol") {
      set("upperArm0", -1.45 - p, 0, 0.2);
      set("forearm0", -0.12, 0, 0);
      set("upperArm1", -1.4 - p, 0, -0.42);
      set("forearm1", -0.18, 0, 0);
    } else {
      set("upperArm0", -1.2 - p * 0.9, 0, 0.18);
      set("forearm0", -0.5, 0, 0);
      set("upperArm1", -1.35 - p * 0.9, 0, -0.45);
      set("forearm1", -0.25, 0, 0);
    }
  }

  /** Health and armour over someone's head (redrawn only when they change). */
  private drawBar(c: Char, v: ActorView) {
    if (c.bar) {
      c.bar.sprite.position.y = v.crouch ? 1.4 : 2.0;
      const key = `${Math.round(v.hp / 5)}|${Math.round(v.armour / 5)}`;
      if (key !== c.bar.key) {
        c.bar.key = key;
        const g = c.bar.g;
        g.clearRect(0, 0, 128, 16);
        g.fillStyle = "rgba(0,0,0,0.6)";
        g.fillRect(0, 0, 128, 16);
        g.fillStyle = v.hp > 50 ? "#51cf66" : v.hp > 25 ? "#fcc419" : "#ff6b6b";
        g.fillRect(2, 2, Math.max(0, (v.hp / 100) * 124), 8);
        g.fillStyle = "#74c0fc";
        g.fillRect(2, 11, Math.max(0, (v.armour / 60) * 124), 3);
        c.bar.tex.needsUpdate = true;
      }
    }
  }

  /** Where a gun's muzzle is for someone (or a tank's barrel). */
  muzzle(id: string): V3 | null {
    const c = this.chars.get(id);
    if (!c) return null;
    const v = new THREE.Vector3();
    if (c.tank?.root.visible) {
      c.tank.barrel.localToWorld(v.set(0, 0, -3.6));
      return { x: v.x, y: v.y, z: v.z };
    }
    return null;
  }

  // ---------------------------------------------------------------- what flies, and bangs

  private take(kind: string, make: () => THREE.Object3D) {
    const pool = this.pools.get(kind) ?? [];
    this.pools.set(kind, pool);
    const o = pool.pop() ?? make();
    this.scene.add(o);
    return o;
  }
  private give(kind: string, o: THREE.Object3D) {
    this.scene.remove(o);
    this.pools.get(kind)?.push(o);
  }

  addShot(s: Shot) {
    const kind = s.kind === "rocket" || s.kind === "grenade" || s.kind === "cannon" ? s.kind : "bullet";
    const o = this.take(kind, () => {
      if (kind === "grenade") {
        const geo = new THREE.SphereGeometry(0.11, 10, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x2f4f2f, roughness: 0.6 });
        this.bin.push(geo, mat);
        return new THREE.Mesh(geo, mat);
      }
      if (kind === "rocket") {
        const g = new THREE.Group();
        const geo = new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8).rotateX(Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5c6650, roughness: 0.5 });
        const fmat = new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
        const flame = new THREE.Sprite(fmat);
        flame.position.z = 0.5;
        flame.scale.setScalar(0.9);
        g.add(new THREE.Mesh(geo, mat), flame);
        this.bin.push(geo, mat, fmat);
        return g;
      }
      const geo = new THREE.BoxGeometry(kind === "cannon" ? 0.12 : 0.035, kind === "cannon" ? 0.12 : 0.035, kind === "cannon" ? 1.6 : 1.3);
      const mat = new THREE.MeshBasicMaterial({ color: kind === "cannon" ? 0xffc078 : 0xffe066, transparent: true, opacity: 0.9 });
      this.bin.push(geo, mat);
      return new THREE.Mesh(geo, mat);
    });
    o.userData.kind = kind;
    o.position.set(s.x, s.y, s.z);
    this.shots.set(s.id, o);
  }
  moveShot(s: Shot) {
    const o = this.shots.get(s.id);
    if (!o) return;
    o.position.set(s.x, s.y, s.z);
    if (s.kind !== "grenade") o.lookAt(s.x - s.vx, s.y - s.vy, s.z - s.vz);
    else o.rotation.x += 0.3;
  }
  dropShot(id: number) {
    const o = this.shots.get(id);
    if (!o) return;
    this.shots.delete(id);
    this.give(o.userData.kind as string, o);
  }

  private sprite(kind: "flash" | "spark" | "fire" | "smoke", p: V3, size: number, life: number, v?: THREE.Vector3) {
    const o = this.take(`fx:${kind}`, () => {
      const mat = new THREE.SpriteMaterial({ map: kind === "smoke" ? this.smokeTex : this.flashTex, blending: kind === "smoke" ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this.bin.push(mat);
      return new THREE.Sprite(mat);
    }) as THREE.Sprite;
    o.position.set(p.x, p.y, p.z);
    o.scale.setScalar(size);
    o.userData.size = size;
    (o.material as THREE.SpriteMaterial).opacity = 1;
    this.fx.push({ obj: o, age: 0, life, kind, v });
  }

  /** A flash at a gun's muzzle. */
  flash(p: V3) {
    this.sprite("flash", p, 0.55, 0.06);
  }
  /** A bullet hitting something. */
  spark(p: V3) {
    this.sprite("spark", p, 0.35, 0.12);
  }
  /** An explosion: a fireball, smoke, a flash of light and the camera shakes if it's near. */
  explode(p: V3, size: number) {
    this.sprite("fire", { x: p.x, y: p.y + 0.6, z: p.z }, size * 0.6, 0.5);
    for (let k = 0; k < 5; k++) this.sprite("fire", { x: p.x + (Math.random() - 0.5) * size * 0.5, y: p.y + 0.4 + Math.random(), z: p.z + (Math.random() - 0.5) * size * 0.5 }, size * 0.35, 0.35 + Math.random() * 0.2);
    for (let k = 0; k < 6; k++) this.sprite("smoke", { x: p.x + (Math.random() - 0.5) * size * 0.4, y: p.y + 0.8, z: p.z + (Math.random() - 0.5) * size * 0.4 }, size * 0.5, 1.6 + Math.random(), new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5));
    this.boomLight.position.set(p.x, p.y + 1.5, p.z);
    this.boomLight.intensity = 60;
    const d = this.camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 40) * 0.5);
  }

  // ---------------------------------------------------------------- loot and pings

  /** The bags of loot lying on the ground (dropped by thieves who were taken down). */
  setBags(list: Bag[]) {
    const keep = new Set(list.map((b) => b.id));
    for (const [id, g] of this.bags)
      if (!keep.has(id)) {
        this.scene.remove(g);
        this.bags.delete(id);
      }
    for (const b of list) {
      let g = this.bags.get(b.id);
      if (!g) {
        g = new THREE.Group();
        const bag = new THREE.Mesh(this.bagGeo, this.bagMat);
        bag.position.y = 0.32;
        const geo = new THREE.CylinderGeometry(0.5, 0.5, 14, 12, 1, true);
        this.bin.push(geo);
        const beam = new THREE.Mesh(geo, this.beamMat);
        beam.position.y = 7;
        g.add(bag, beam);
        this.scene.add(g);
        this.bags.set(b.id, g);
      }
      g.position.set(b.x, 0, b.z);
    }
  }

  /** A marker over a spot a teammate pointed at (for 6 seconds). */
  ping(x: number, z: number, team: number) {
    const g = new THREE.Group();
    const tex = canvasTex(64, 64, (c) => {
      c.fillStyle = SIDES[team].css;
      c.beginPath();
      c.arc(32, 32, 28, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffffff";
      c.font = "900 44px system-ui";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("!", 32, 35);
    });
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.position.y = 3;
    s.scale.setScalar(1.4);
    s.renderOrder = 11;
    const bmat = new THREE.MeshBasicMaterial({ color: SIDES[team].colour, transparent: true, opacity: 0.3, depthWrite: false, fog: false });
    const bgeo = new THREE.CylinderGeometry(0.15, 0.15, 30, 8, 1, true);
    const beam = new THREE.Mesh(bgeo, bmat);
    beam.position.y = 15;
    g.add(s, beam);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.bin.push(tex, mat, bmat, bgeo);
    this.pings.push({ obj: g, until: performance.now() + 6000 });
  }

  // ---------------------------------------------------------------- the camera

  /**
   * Over the right shoulder of someone at (x, y, z) looking (yaw, pitch); aiming comes in close,
   * a scope looks from the eye, a tank sits back and up.
   */
  follow(x: number, y: number, z: number, yaw: number, pitch: number, mode: "walk" | "aim" | "scope" | "tank" | "crouch", dt: number) {
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const tall = this.camera.aspect < 1;
    const headY = mode === "tank" ? 3.2 : mode === "crouch" ? 1.15 : 1.65;
    const head = new THREE.Vector3(x, y + headY, z);
    let want: THREE.Vector3;
    if (mode === "scope") want = head.clone().addScaledVector(fwd, 0.4);
    else {
      const back = mode === "tank" ? 9 : mode === "aim" ? 1.0 : tall ? 3.6 : 2.8;
      const side = mode === "tank" ? 0 : mode === "aim" ? 0.34 : tall ? 0.3 : 0.62;
      const up = mode === "tank" ? 1.6 : mode === "aim" ? 0.05 : tall ? 0.6 : 0.3;
      want = head.clone().addScaledVector(right, side).addScaledVector(fwd, -back).add(new THREE.Vector3(0, up, 0));
      const hit = this.city.hit(head, want);
      if (hit) want.lerpVectors(head, want, Math.max(0.1, hit.t - 0.08));
      want.y = Math.max(0.3, want.y);
    }
    const k = mode === "scope" ? 1 : 1 - Math.exp(-dt * 18);
    this.camera.position.lerp(want, k);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 6);
    }
    this.camLook.copy(this.camera.position).addScaledVector(fwd, 10);
    this.camera.lookAt(this.camLook);
    const fov = mode === "scope" ? 18 : mode === "aim" ? 48 : mode === "tank" ? 68 : 72;
    this.fov += (fov - this.fov) * (mode === "scope" ? 1 : 1 - Math.exp(-dt * 12));
    this.setFov();
    // The sun's shadows follow you round the city.
    this.sun.position.set(x, 0, z).add(this.sunOff);
    this.sun.target.position.set(x, 0, z);
  }
  /** Looking down on the city from high up (watching, between lives). */
  overview(x: number, z: number, t: number) {
    const a = t * 0.08;
    this.camera.position.set(x + Math.cos(a) * 70, 75, z + Math.sin(a) * 70);
    this.camera.lookAt(x, 0, z);
    this.fov = 60;
    this.setFov();
    this.sun.position.set(x, 0, z).add(this.sunOff);
    this.sun.target.position.set(x, 0, z);
  }
  private setFov() {
    const a = this.camera.aspect;
    this.camera.fov = a < 1 ? Math.min(95, ((2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.fov) / 2) / Math.max(0.45, a)) * 180) / Math.PI) * 0.82) : this.fov;
    this.camera.updateProjectionMatrix();
  }
  /** Where the crosshair (the middle of the screen) points, and which way. */
  ray() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return { o: this.camera.position.clone(), d: dir };
  }
  /** Where a point in the world is on the screen (-1..1 each way), and whether it's in front. */
  project(p: V3) {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    return { x: v.x, y: v.y, front: v.z < 1 };
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.setFov();
  }

  render(dt: number) {
    for (let k = this.fx.length - 1; k >= 0; k--) {
      const f = this.fx[k];
      f.age += dt;
      const u = f.age / f.life;
      const s = f.obj as THREE.Sprite;
      if (u >= 1) {
        this.give(`fx:${f.kind}`, s);
        this.fx.splice(k, 1);
        continue;
      }
      const size = s.userData.size as number;
      if (f.kind === "fire") s.scale.setScalar(size * (0.6 + u * 0.9));
      if (f.kind === "smoke") {
        s.scale.setScalar(size * (0.8 + u * 1.6));
        if (f.v) s.position.addScaledVector(f.v, dt);
      }
      (s.material as THREE.SpriteMaterial).opacity = f.kind === "smoke" ? 0.8 * (1 - u) : 1 - u * u;
    }
    this.boomLight.intensity *= Math.exp(-dt * 7);
    const now = performance.now();
    for (let k = this.pings.length - 1; k >= 0; k--)
      if (now > this.pings[k].until) {
        this.scene.remove(this.pings[k].obj);
        this.pings.splice(k, 1);
      }
    for (const [, g] of this.bags) g.rotation.y += dt * 1.5;
    this.renderer.render(this.scene, this.camera);
  }

  /** A picture of the screen as it is now (the end of the match). */
  capture() {
    this.renderer.render(this.scene, this.camera);
    try {
      return this.renderer.domElement.toDataURL("image/jpeg", 0.86);
    } catch {
      return null;
    }
  }

  dispose() {
    this.gone = true;
    for (const c of this.chars.values()) c.av?.mats.dispose();
    for (const d of this.bin) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ---------------------------------------------------------------- the guns in their hands

function gunModel(g: GunId, a: Parts) {
  const metal = 0x25282c;
  const wood = 0x6b4426;
  switch (g) {
    case "pistol":
      a.add(new THREE.BoxGeometry(0.06, 0.1, 0.24), metal, m4(0.12, -0.06, -0.48));
      a.add(new THREE.BoxGeometry(0.05, 0.12, 0.06), metal, m4(0.12, -0.13, -0.42));
      break;
    case "smg":
      a.add(new THREE.BoxGeometry(0.08, 0.13, 0.46), metal, m4(0.12, -0.07, -0.5));
      a.add(new THREE.BoxGeometry(0.05, 0.2, 0.06), metal, m4(0.12, -0.2, -0.5));
      a.add(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8).rotateX(Math.PI / 2), metal, m4(0.12, -0.05, -0.82));
      break;
    case "rifle":
      a.add(new THREE.BoxGeometry(0.08, 0.13, 0.7), 0x3d4a3a, m4(0.12, -0.07, -0.55));
      a.add(new THREE.BoxGeometry(0.06, 0.22, 0.08), metal, m4(0.12, -0.21, -0.55, 0.25));
      a.add(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 8).rotateX(Math.PI / 2), metal, m4(0.12, -0.04, -1.04));
      a.add(new THREE.BoxGeometry(0.07, 0.14, 0.24), metal, m4(0.12, -0.09, -0.12));
      break;
    case "shotgun":
      a.add(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8).rotateX(Math.PI / 2), metal, m4(0.12, -0.04, -0.72));
      a.add(new THREE.BoxGeometry(0.08, 0.12, 0.42), wood, m4(0.12, -0.1, -0.3));
      a.add(new THREE.BoxGeometry(0.07, 0.07, 0.22), wood, m4(0.12, -0.1, -0.78));
      break;
    case "sniper":
      a.add(new THREE.BoxGeometry(0.07, 0.12, 0.85), 0x2f3b2f, m4(0.12, -0.07, -0.55));
      a.add(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8).rotateX(Math.PI / 2), metal, m4(0.12, -0.04, -1.25));
      a.add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10).rotateX(Math.PI / 2), 0x111111, m4(0.12, 0.05, -0.55));
      break;
    case "rocket":
      a.add(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 12).rotateX(Math.PI / 2), 0x4b5a3c, m4(0.16, 0.12, -0.35));
      a.add(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 12).rotateX(Math.PI / 2), metal, m4(0.16, 0.12, -1.02));
      a.add(new THREE.BoxGeometry(0.05, 0.15, 0.08), metal, m4(0.16, -0.02, -0.4));
      break;
  }
}

// ---------------------------------------------------------------- the city's pieces

function buildProp(s: Shape, p: Parts) {
  const base = m4(s.x, 0, s.z, 0, s.ry ?? 0, 0);
  const add = (g: THREE.BufferGeometry, colour: number, x: number, y: number, z: number, mat: Mat = "matte", rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => p.add(g, colour, base.clone().multiply(m4(x, y, z, rx, ry, rz, sx, sy, sz)), mat);
  const { w, d, h } = s;
  const col = s.colour;
  const glass = 0x2a3d55;
  switch (s.look) {
    case "tower": {
      const g = new THREE.BoxGeometry(w, h, d);
      // Windows the right size whatever the tower's size; the roof plain.
      const uv = g.getAttribute("uv") as THREE.BufferAttribute;
      for (let f = 0; f < 6; f++)
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.01);
          else uv.setXY(i, uv.getX(i) * ((f < 2 ? d : w) / 3.4), uv.getY(i) * (h / 3.2));
        }
      add(g, col, 0, h / 2, 0, "tower");
      add(new THREE.BoxGeometry(w + 0.4, 0.7, d + 0.4), darker(col, 0.75), 0, h + 0.35, 0);
      add(new THREE.BoxGeometry(2.4, 1.6, 2), 0x9aa0a6, w * 0.2, h + 0.8, -d * 0.15);
      add(new THREE.BoxGeometry(1.6, 1.2, 1.6), 0x868e96, -w * 0.25, h + 0.6, d * 0.2);
      add(new THREE.BoxGeometry(Math.min(8, w * 0.4), 0.25, 2), 0x343a40, 0, 3.4, d / 2 + 1);
      add(new THREE.BoxGeometry(Math.min(6, w * 0.3), 3, 0.1), glass, 0, 1.5, d / 2 + 0.06, "shiny");
      break;
    }
    case "house": {
      add(new THREE.BoxGeometry(w, h * 0.64, d), col, 0, h * 0.32, 0);
      const hr = h * 0.36;
      add(new THREE.ConeGeometry(1, 1, 4), [0x9c4221, 0x6b4f3a, 0x5c5f66][Math.abs(Math.round(s.x + s.z)) % 3], 0, h * 0.64 + hr / 2, 0, "matte", 0, Math.PI / 4, 0, (w / 2 + 0.5) * Math.SQRT2, hr, (d / 2 + 0.5) * Math.SQRT2);
      add(new THREE.BoxGeometry(1.1, 2.1, 0.1), 0x5c3d2e, 0, 1.05, d / 2 + 0.05);
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(1.3, 1.1, 0.08), glass, sx * w * 0.3, h * 0.36, d / 2 + 0.05, "shiny");
        add(new THREE.BoxGeometry(0.08, 1.1, 1.3), glass, sx * (w / 2 + 0.04), h * 0.36, 0, "shiny");
      }
      break;
    }
    case "station": {
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w + 0.06, 1, d + 0.06), 0x1c3fa8, 0, h * 0.55, 0);
      add(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), 0xadb5bd, 0, h + 0.25, 0);
      for (let k = 0; k < 4; k++) for (const y of [2.5, 6.6]) add(new THREE.BoxGeometry(0.08, 1.4, 1.8), glass, w / 2 + 0.04, y, -d / 2 + 2.2 + k * 3.2, "shiny");
      add(new THREE.BoxGeometry(0.1, 2.6, 2.8), 0x1d2b44, w / 2 + 0.05, 1.3, 2, "shiny");
      add(new THREE.CylinderGeometry(0.06, 0.06, 9, 6), 0xced4da, w / 2 + 2, 4.5, 4.5);
      add(new THREE.BoxGeometry(0.05, 1.1, 1.8), 0x2f9e44, w / 2 + 2, 8.3, 5.4);
      add(new THREE.SphereGeometry(0.35, 10, 8), 0x4dabf7, w / 2 + 0.3, h - 0.6, 2, "glow");
      break;
    }
    case "bank": {
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w + 1.4, 1.1, d + 1.4), 0xd4ccb8, 0, h + 0.55, 0);
      add(new THREE.BoxGeometry(w + 2, 0.4, 4), 0xd4ccb8, 0, 8.2, d / 2 + 1.6);
      for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(w * 0.7 - k * 1.5, 0.25, 1.2), 0xcfc8b8, 0, 0.12 + k * 0.25, d / 2 + 2.2 - k * 0.5);
      for (let k = 0; k < 8; k++) for (const y of [4, 9.6]) if (!(y === 4 && Math.abs(k - 3.5) < 1)) add(new THREE.BoxGeometry(1.6, 2.2, 0.08), glass, -w / 2 + 2.4 + k * ((w - 4.8) / 7), y, d / 2 + 0.04, "shiny");
      break;
    }
    case "vault": {
      add(new THREE.BoxGeometry(w, h, d), 0x3d4248, 0, h / 2, 0, "shiny");
      add(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 28), 0xc9a227, 0, 2.2, d / 2 + 0.2, "shiny", Math.PI / 2);
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), 0x8a6d1d, 0, 2.2, d / 2 + 0.55, "shiny", Math.PI / 2);
      for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(1.4, 0.1, 0.12), 0x8a6d1d, 0, 2.2, d / 2 + 0.72, "shiny", 0, 0, (k * Math.PI) / 4);
      // Gold bars stacked in front.
      for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(0.5, 0.2, 0.25), 0xffd43b, -1.2 + (k % 4) * 0.6 + (k >= 4 ? 0.3 : 0), 0.1 + (k >= 4 ? 0.2 : 0), d / 2 + 2.2, "glow");
      break;
    }
    case "warehouse": {
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), 0x5c4033, 0, h + 0.2, 0);
      for (let k = 0; k < 9; k++) add(new THREE.BoxGeometry(0.1, h - 0.4, d + 0.04), darker(col, 0.8), -w / 2 + 1 + k * ((w - 2) / 8), h / 2, 0);
      add(new THREE.BoxGeometry(0.12, 4.6, 6), 0x2b2f35, -w / 2 - 0.06, 2.3, 0, "shiny");
      add(new THREE.BoxGeometry(w * 0.8, 0.8, 0.08), 0xfab005, 0, h - 1.2, d / 2 + 0.04, "glow");
      break;
    }
    case "garage": {
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w + 0.4, 0.35, d + 0.4), 0x343a40, 0, h + 0.17, 0);
      for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.1, h * 0.65, d * 0.26), 0xced4da, w / 2 + 0.05, h * 0.33, -d / 3 + k * (d / 3));
      break;
    }
    case "shop": {
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w * 0.9, 2.2, 0.08), glass, 0, 1.4, d / 2 + 0.04, "shiny");
      for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(w / 6, 0.1, 1.6), k % 2 ? 0xffffff : 0xe03131, -w / 2 + w / 12 + (k * w) / 6, 3, d / 2 + 0.8, "matte", -0.25);
      break;
    }
    case "car":
    case "policecar": {
      const pc = s.look === "policecar";
      add(new RoundedBoxGeometry(w, h * 0.5, d, 2, 0.12), pc ? 0xf1f3f5 : col, 0, 0.28 + h * 0.25, 0, "shiny");
      if (pc) add(new THREE.BoxGeometry(w + 0.02, h * 0.18, d + 0.02), 0x1c3fa8, 0, 0.38, 0, "shiny");
      add(new RoundedBoxGeometry(w * 0.55, h * 0.4, d * 0.9, 2, 0.1), glass, -w * 0.04, h * 0.72, 0, "shiny");
      if (pc) {
        add(new THREE.BoxGeometry(0.3, 0.12, 0.7), 0xff3b3b, -w * 0.04, h * 0.97, -0.38, "glow");
        add(new THREE.BoxGeometry(0.3, 0.12, 0.7), 0x3b7bff, -w * 0.04, h * 0.97, 0.38, "glow");
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10), 0x1f2124, sx * w * 0.32, 0.33, sz * (d / 2 - 0.06), "matte", Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.12, d * 0.7), 0xfff3bf, w / 2 + 0.01, 0.55, 0, "glow");
      break;
    }
    case "van": {
      add(new RoundedBoxGeometry(w, h - 0.35, d, 2, 0.12), col, 0, 0.35 + (h - 0.35) / 2, 0, "shiny");
      add(new THREE.BoxGeometry(0.06, h * 0.32, d * 0.85), glass, w / 2 + 0.01, h * 0.7, 0, "shiny");
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10), 0x1f2124, sx * w * 0.33, 0.36, sz * (d / 2 - 0.05), "matte", Math.PI / 2);
      break;
    }
    case "bus": {
      add(new RoundedBoxGeometry(w, h - 0.4, d, 2, 0.15), col, 0, 0.4 + (h - 0.4) / 2, 0, "shiny");
      add(new THREE.BoxGeometry(w * 0.86, 0.9, d + 0.02), glass, -w * 0.02, h * 0.66, 0, "shiny");
      add(new THREE.BoxGeometry(w + 0.02, 0.15, d + 0.02), 0x111111, 0, 0.9, 0);
      for (const sx of [-0.33, 0.33]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), 0x1f2124, sx * w, 0.45, sz * (d / 2 - 0.08), "matte", Math.PI / 2);
      break;
    }
    case "container": {
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0, "shiny");
      const rib = darker(col, 0.72);
      for (let k = 0; k <= 9; k++) for (const e of [-1, 1]) add(new THREE.BoxGeometry(0.08, h - 0.15, 0.05), rib, -w / 2 + 0.2 + (k * (w - 0.4)) / 9, h / 2, e * (d / 2 + 0.02));
      break;
    }
    case "crate":
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.12, h + 0.02, 0.12), 0x7d5527, (sx * (w - 0.1)) / 2, h / 2, (sz * (d - 0.1)) / 2);
      add(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), 0x7d5527, 0, h / 2, 0);
      break;
    case "barrel":
      add(new THREE.CylinderGeometry(w / 2, w / 2, h, 14), col, 0, h / 2, 0, "shiny");
      for (const y of [0.25, 0.75]) add(new THREE.TorusGeometry(w / 2 + 0.01, 0.03, 4, 16), 0x495057, 0, h * y, 0, "shiny", Math.PI / 2);
      break;
    case "wall":
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w + 0.1, 0.1, d + 0.1), darker(col, 0.8), 0, h + 0.05, 0);
      break;
    case "halfwall":
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      for (let k = 0; k < Math.floor(w / 1.2); k++) add(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), 0x7a4a2a, -w / 2 + 0.6 + k * 1.2, h + 0.4, 0);
      break;
    case "sandbags": {
      const rows = Math.max(2, Math.round(h / 0.3));
      const per = Math.max(2, Math.round(w / 0.7));
      for (let y = 0; y < rows; y++) for (let k = 0; k < per - (y % 2); k++) add(new RoundedBoxGeometry(0.66, h / rows, d * 0.9, 1, 0.08), y % 2 ? col : darker(col, 0.92), -w / 2 + 0.35 + (k + (y % 2) * 0.5) * ((w - 0.7) / (per - 1)), (h / rows) * (y + 0.5), 0);
      break;
    }
    case "barrier":
      for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(w / 4, h * 0.45, d * 0.4), k % 2 ? 0xf1f3f5 : col, -w / 2 + w / 8 + (k * w) / 4, h * 0.7, 0);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.15, h, d), 0x495057, sx * (w / 2 - 0.1), h / 2, 0);
      break;
    case "stall": {
      add(new THREE.BoxGeometry(w, 0.9, d), 0x8c6d46, 0, 0.45, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, h, 5), 0x495057, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1));
      add(new THREE.BoxGeometry(w + 0.4, 0.1, d + 0.4), col, 0, h, 0, "matte", 0.06);
      for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(0.4, 0.3, 0.4), [0xfab005, 0x40c057, 0xfa5252, 0xff922b, 0xffffff][k], -w / 2 + 0.5 + k * ((w - 1) / 4), 1.05, 0);
      break;
    }
    case "planter":
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.IcosahedronGeometry(1, 0), 0x2f7d32, 0, h + 0.3, 0, "matte", 0, 0, 0, w / 2.2, 0.55, d / 1.6);
      break;
    case "pillar":
      add(new THREE.CylinderGeometry(w / 2, w / 2, h, 16), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w * 1.4, 0.4, w * 1.4), 0xd4ccb8, 0, 0.2, 0);
      add(new THREE.BoxGeometry(w * 1.4, 0.4, w * 1.4), 0xd4ccb8, 0, h - 0.2, 0);
      break;
    case "dumpster":
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0, "shiny");
      add(new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.1), darker(col, 0.7), 0, h + 0.04, 0, "shiny", 0.08);
      break;
    case "kiosk":
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
      add(new THREE.BoxGeometry(w + 0.8, 0.15, d + 0.8), 0xf8f9fa, 0, h + 0.08, 0);
      add(new THREE.BoxGeometry(w * 0.7, 0.9, 0.06), glass, 0, h * 0.6, d / 2 + 0.03, "shiny");
      break;
    case "pipes":
      for (const [y, zz] of [[0.4, -0.4], [0.4, 0.4], [1.1, 0]]) add(new THREE.CylinderGeometry(Math.min(0.42, h / 3.6), Math.min(0.42, h / 3.6), w, 12), col, 0, y * (h / 1.5), zz * (d / 1.8), "shiny", 0, 0, Math.PI / 2);
      break;
    case "sand":
      add(new THREE.ConeGeometry(w / 2, h, 10), col, 0, h / 2, 0);
      break;
    case "scaffold":
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, h, 5), 0x868e96, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05), "shiny");
      for (const y of [h * 0.45, h * 0.9]) add(new THREE.BoxGeometry(w, 0.08, d), 0x8c6d46, 0, y, 0);
      add(new THREE.BoxGeometry(w, h * 0.9, 0.05), 0x2f9e44, 0, h * 0.5, d / 2, "matte");
      break;
    case "bench":
      add(new THREE.BoxGeometry(w, 0.08, d * 0.6), col, 0, 0.45, 0);
      add(new THREE.BoxGeometry(w, 0.4, 0.06), col, 0, 0.75, d * 0.3);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.45, d * 0.6), 0x343a40, sx * (w / 2 - 0.15), 0.22, 0);
      break;
    case "tree": {
      add(new THREE.CylinderGeometry(w * 0.35, w * 0.5, h * 0.6, 7), col, 0, h * 0.3, 0);
      const leaf = [0x2f6b2f, 0x3b7a3b, 0x356b2a][Math.abs(Math.round(s.x * 3 + s.z)) % 3];
      for (const [lx, ly, lz, r] of [[0, 0.75, 0, 2.4], [0.9, 0.62, 0.5, 1.8], [-0.8, 0.66, -0.6, 1.9], [0.2, 0.92, -0.3, 1.6]]) add(new THREE.IcosahedronGeometry(r * (h / 8), 0), leaf, lx, ly * h, lz);
      break;
    }
    case "palm": {
      add(new THREE.CylinderGeometry(w * 0.35, w * 0.5, h, 7), col, 0, h / 2, 0, "matte", 0, 0, 0.06);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        add(new THREE.BoxGeometry(3, 0.06, 0.7), 0x2f9e44, Math.cos(a) * 1.3 + h * 0.06, h - 0.3, Math.sin(a) * 1.3, "matte", 0, -a, -0.35);
      }
      break;
    }
    case "rock":
      add(new THREE.DodecahedronGeometry(1, 0), col, 0, h * 0.42, 0, "matte", 0.3, s.x, 0.2, w / 2, h * 0.6, w / 2.3);
      break;
    case "bush":
      add(new THREE.IcosahedronGeometry(1, 1), col, 0, h * 0.5, 0, "matte", 0, 0, 0, w / 2, h * 0.6, w / 2);
      break;
    default:
      add(new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0);
  }
}

// ---------------------------------------------------------------- the ground

const GROUND: Record<string, string> = { towers: "#b9b4ab", houses: "#6aa84f", park: "#5f9f4a", yard: "#9c9b95", market: "#b98b6e", building: "#a68a5e", parking: "#4b4e54", bank: "#ddd5c4", hq: "#a9aeb4", hideout: "#8c7b68" };

function paintGround(g: CanvasRenderingContext2D, blocks: Block[]) {
  const S = 2048;
  const k = S / (MAP.h * 2);
  const X = (x: number) => (x + MAP.h) * k;
  // Asphalt under everything, then each block on its pavement.
  g.fillStyle = "#3b3e43";
  g.fillRect(0, 0, S, S);
  for (const b of blocks) {
    g.fillStyle = "#cfcabf";
    g.fillRect(X(b.x0), X(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    g.fillStyle = "#8f8a80";
    g.fillRect(X(b.x0), X(b.z0), (b.x1 - b.x0) * k, 2);
    g.fillRect(X(b.x0), X(b.z1) - 2, (b.x1 - b.x0) * k, 2);
    g.fillRect(X(b.x0), X(b.z0), 2, (b.z1 - b.z0) * k);
    g.fillRect(X(b.x1) - 2, X(b.z0), 2, (b.z1 - b.z0) * k);
    const x0 = X(b.x0 + 2);
    const z0 = X(b.z0 + 2);
    const w = (b.x1 - b.x0 - 4) * k;
    const h = (b.z1 - b.z0 - 4) * k;
    g.fillStyle = GROUND[b.kind] ?? "#999";
    g.fillRect(x0, z0, w, h);
    // A little texture: patches, tiles, bays.
    if (b.kind === "park" || b.kind === "houses") {
      for (let n = 0; n < 60; n++) {
        g.fillStyle = n % 2 ? "rgba(40,90,30,0.25)" : "rgba(140,190,90,0.2)";
        g.beginPath();
        g.ellipse(x0 + Math.random() * w, z0 + Math.random() * h, 6 + Math.random() * 20, 4 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "#d8cdb0";
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(x0, z0 + h / 2);
      g.bezierCurveTo(x0 + w / 3, z0 + h * 0.2, x0 + (2 * w) / 3, z0 + h * 0.8, x0 + w, z0 + h / 2);
      g.stroke();
    } else if (b.kind === "parking") {
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.lineWidth = 2;
      for (let x = x0 + 10; x < x0 + w; x += 22) {
        g.beginPath();
        g.moveTo(x, z0 + 6);
        g.lineTo(x, z0 + 40);
        g.moveTo(x, z0 + h - 6);
        g.lineTo(x, z0 + h - 40);
        g.stroke();
      }
    } else if (b.kind === "bank" || b.kind === "market" || b.kind === "towers" || b.kind === "hq") {
      g.strokeStyle = "rgba(0,0,0,0.08)";
      g.lineWidth = 1;
      for (let x = x0; x < x0 + w; x += 16) {
        g.beginPath();
        g.moveTo(x, z0);
        g.lineTo(x, z0 + h);
        g.stroke();
      }
      for (let z = z0; z < z0 + h; z += 16) {
        g.beginPath();
        g.moveTo(x0, z);
        g.lineTo(x0 + w, z);
        g.stroke();
      }
    } else {
      for (let n = 0; n < 50; n++) {
        g.fillStyle = n % 2 ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)";
        g.beginPath();
        g.ellipse(x0 + Math.random() * w, z0 + Math.random() * h, 5 + Math.random() * 18, 3 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Lane lines and crossings.
  g.strokeStyle = "#f1d36b";
  g.lineWidth = 2;
  g.setLineDash([14, 12]);
  for (const r of ROADS) {
    g.beginPath();
    g.moveTo(0, X(r));
    g.lineTo(S, X(r));
    g.moveTo(X(r), 0);
    g.lineTo(X(r), S);
    g.stroke();
  }
  g.setLineDash([]);
  // Zebra crossings on each road, just outside every crossroads.
  g.fillStyle = "rgba(255,255,255,0.85)";
  const half = ROAD_W / 2;
  for (const a of ROADS)
    for (const b of ROADS)
      for (let s = -half + 0.6; s < half - 0.3; s += 1.2)
        for (const e of [-1, 1]) {
          const at = b + e * (half + 1.6);
          // Across the road running along z (x = a), and across the one along x (z = a).
          g.fillRect(X(a + s), X(at - 1.2), 0.6 * k, 2.4 * k);
          g.fillRect(X(at - 1.2), X(a + s), 2.4 * k, 0.6 * k);
        }
  // The zones: the vault (gold), the hideout's drop (orange), the police HQ (blue).
  const zone = (x: number, z: number, r: number, colour: string, text: string) => {
    g.strokeStyle = colour;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(X(x), X(z), r * k, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = colour.replace(")", ",0.18)").replace("rgb", "rgba");
    g.fill();
    g.fillStyle = colour;
    g.font = "900 22px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, X(x), X(z));
  };
  zone(VAULT.x, VAULT.z + 1.5, VAULT.r, "rgb(250,176,5)", "VAULT");
  zone(HIDEOUT.x, HIDEOUT.z, HIDEOUT.r, "rgb(253,126,20)", "DROP");
  zone(HQ.x + 3, HQ.z, 6, "rgb(76,110,245)", "POLICE");
  // Grain.
  for (let n = 0; n < 40000; n++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)";
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
}
