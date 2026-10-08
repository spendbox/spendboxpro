// The regulars (NPCs) as little people inside buildings, on rooftops and in parks: soft,
// rounded figures in the same colours as their chat avatars (skin, hair, top), standing,
// sitting or leaning, gently breathing, shifting their weight and looking round. Each one can
// be tapped. Built in metres (about 1.7 m tall); outdoors they're scaled down with the city.

import * as THREE from "three";
import { HAIR_COLOR, SKIN, TOP_COLOR } from "@/lib/avatar";
import type { Npc } from "@/lib/npcs";
import { Kit, rngFrom, shadeHex } from "./kit";

export type Pose = "stand" | "sit" | "lean";
/** Where someone can be: a place on the floor (x, z), which way they face, standing or sitting. */
export type Spot = { x: number; z: number; ry: number; pose: Pose; /** Seat height when sitting, floor height otherwise. */ y?: number };

const TROUSERS = [0x2b3240, 0x3b4a5c, 0x4a3b30, 0x5b6370, 0x1f2a36, 0x6b5a48, 0xd8cbb5, 0x2f3e46];
const SHOES = [0x1f1f1f, 0x3b2a20, 0xf1f3f5, 0x5c4033];

type Fig = {
  npc: Npc;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  pose: Pose;
  phase: number;
  look: number;
  tag: THREE.Sprite | null;
};

function hairStyle(i: number) {
  // Map the avatar's hairstyle to a simple 3D one.
  // 0 Buzz, 1 Short, 2 Curly, 3 Afro, 4 Long, 5 Bun, 6 Braids, 7 Mohawk, 8 Side part, 9 Bald, 10 Locs, 11 Bob
  return (["cap", "cap", "curly", "afro", "long", "bun", "long", "cap", "cap", "bald", "long", "bob"] as const)[i] ?? "cap";
}

function nameTag(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const c = canvas.getContext("2d")!;
  // "Funmi O.": the first name and an initial (first names repeat now and then).
  const first = name;
  c.font = "700 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const tw = c.measureText(first).width;
  const w = Math.min(248, tw + 40);
  const x0 = (256 - w) / 2;
  c.fillStyle = "rgba(16,22,34,0.72)";
  c.beginPath();
  c.roundRect(x0, 10, w, 52, 26);
  c.fill();
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(first, 128, 38);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFigures(npcs: Npc[], spots: Spot[], opts?: { tags?: boolean; key?: string }) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(0.32, 20).rotateX(-Math.PI / 2);
  const figs: Fig[] = [];
  const hits: THREE.Object3D[] = [];
  const textures: THREE.Texture[] = [];

  const part = (draw: (k: Kit) => void) => {
    const k = new Kit();
    k.floorY = -100;
    draw(k);
    const g = k.build({ solid: mat, foliage: mat });
    return g;
  };

  npcs.forEach((npc, n) => {
    const spot = spots[n % Math.max(1, spots.length)] ?? { x: 0, z: 0, ry: 0, pose: "stand" as Pose };
    const rnd = rngFrom(`${npc.id}|${opts?.key ?? ""}`);
    const a = npc.avatar;
    const skin = parseInt((SKIN[a.skin] ?? "#d9a37a").slice(1), 16);
    const hair = parseInt((HAIR_COLOR[a.hairColor] ?? "#1b1b1b").slice(1), 16);
    const top = parseInt((TOP_COLOR[a.topColor] ?? "#2f6fd1").slice(1), 16);
    const trousers = TROUSERS[Math.floor(rnd() * TROUSERS.length)];
    const shoes = SHOES[Math.floor(rnd() * SHOES.length)];
    const style = hairStyle(a.hair);
    const sitting = spot.pose === "sit";
    const seat = sitting ? (spot.y ?? 0.46) : 0;
    const hipY = sitting ? seat + 0.06 : 0.86;
    const scale = 0.94 + rnd() * 0.12;

    const root = new THREE.Group();
    const body = new THREE.Group();
    // Legs and shoes, hips and the torso: one piece.
    const torso = part((k) => {
      if (sitting) {
        for (const side of [-1, 1]) {
          // Thigh forward along the seat, shin down to the floor.
          k.soft(side * 0.09, hipY - 0.09, 0.17, 0.15, 0.15, 0.44, trousers, 0.07);
          k.soft(side * 0.09, 0.06, 0.37, 0.13, Math.max(0.1, hipY - 0.15), 0.13, trousers, 0.06);
          k.soft(side * 0.09, 0, 0.42, 0.11, 0.08, 0.25, shoes, 0.035);
        }
      } else {
        for (const side of [-1, 1]) {
          k.soft(side * 0.088, 0.06, 0.0, 0.13, hipY - 0.04, 0.14, trousers, 0.06);
          k.soft(side * 0.088, 0, 0.04, 0.11, 0.08, 0.25, shoes, 0.035);
        }
      }
      k.soft(0, hipY - 0.1, 0, 0.34, 0.2, 0.21, trousers, 0.08);
      // Torso: a soft, slightly tapered shape in the avatar's top colour.
      k.soft(0, hipY + 0.04, 0, 0.36, 0.56, 0.22, top, 0.1);
      k.soft(0, hipY + 0.42, 0, 0.42, 0.16, 0.23, top, 0.08);
      k.cyl(0, hipY + 0.56, 0, 0.05, 0.055, 0.1, shadeHex(skin, 0.06), 10);
    });
    body.add(torso);

    // Head: skin, hair and two little eyes.
    const head = new THREE.Group();
    head.position.y = hipY + 0.64;
    head.add(
      part((k) => {
        k.ball(0, 0.1, 0, 0.115, skin, { sy: 1.1, w: 16, h: 12 });
        for (const side of [-1, 1]) k.ball(side * 0.04, 0.115, 0.1, 0.014, 0x1b1b1b, { w: 6, h: 4 });
        k.ball(0, 0.07, 0.11, 0.012, shadeHex(skin, 0.15), { w: 6, h: 4 });
        if (style === "bald") return;
        if (style === "afro") {
          k.ball(0, 0.16, -0.015, 0.16, hair, { w: 14, h: 10 });
        } else if (style === "curly") {
          k.ball(0, 0.14, -0.01, 0.13, hair, { sy: 0.9, w: 14, h: 10 });
        } else {
          k.ball(0, 0.115, -0.008, 0.124, hair, { part: 0.52, w: 16, h: 8 });
        }
        if (style === "long") k.soft(0, -0.08, -0.07, 0.25, 0.26, 0.1, hair, 0.05);
        if (style === "bob") k.soft(0, 0.0, -0.035, 0.27, 0.15, 0.2, hair, 0.07);
        if (style === "bun") k.ball(0, 0.25, -0.07, 0.06, hair, { w: 10, h: 8 });
      }),
    );
    body.add(head);

    // Arms hang from the shoulders (so they can swing a little).
    const arm = (side: number) => {
      const g = new THREE.Group();
      g.position.set(side * 0.22, hipY + 0.5, 0);
      g.add(
        part((k) => {
          k.soft(0, -0.3, 0, 0.1, 0.32, 0.1, top, 0.045);
          k.soft(0, -0.52, 0, 0.085, 0.26, 0.085, skin, 0.04);
          k.ball(0, -0.55, 0, 0.045, skin, { w: 8, h: 6 });
        }),
      );
      g.rotation.z = side * 0.08;
      if (sitting) g.rotation.x = -0.75;
      return g;
    };
    const armL = arm(-1);
    const armR = arm(1);
    body.add(armL, armR);
    body.scale.setScalar(scale);
    root.add(body);

    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.position.set(0, 0.006, sitting ? 0.15 : 0.02);
    sh.renderOrder = 1;
    root.add(sh);

    let tag: THREE.Sprite | null = null;
    if (opts?.tags !== false) {
      const tex = nameTag(npc.name);
      textures.push(tex);
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      tag.scale.set(0.62, 0.175, 1);
      tag.position.y = (hipY + 0.98) * scale;
      tag.renderOrder = 6;
      root.add(tag);
    }

    root.position.set(spot.x, sitting ? 0 : (spot.y ?? 0), spot.z);
    root.rotation.y = spot.ry;
    root.traverse((o) => {
      o.userData.npc = npc.id;
    });
    group.add(root);
    figs.push({ npc, root, body, head, armL, armR, pose: spot.pose, phase: rnd() * 10, look: (rnd() - 0.5) * 0.6, tag });
    hits.push(torso, head, armL, armR);
  });

  function update(time: number) {
    for (const f of figs) {
      const t = time + f.phase;
      // Breathing, and a slow shift of weight from foot to foot.
      f.body.scale.y = f.body.scale.x * (1 + Math.sin(t * 1.7) * 0.008);
      if (f.pose !== "sit") f.body.rotation.z = Math.sin(t * 0.35) * 0.025;
      // Looking round now and then (smoothly), sometimes nodding along.
      const glance = Math.sin(t * 0.23) * 0.55 + Math.sin(t * 0.61) * 0.2 + f.look;
      f.head.rotation.y = glance;
      f.head.rotation.x = Math.sin(t * 0.9) * 0.04;
      // Talking with their hands a little.
      const talk = Math.max(0, Math.sin(t * 0.4)) * 0.18;
      if (f.pose === "sit") {
        f.armR.rotation.x = -0.75 - talk * Math.max(0, Math.sin(t * 3.1));
      } else {
        f.armL.rotation.x = Math.sin(t * 0.9) * 0.05;
        f.armR.rotation.x = -talk * (0.6 + 0.4 * Math.sin(t * 2.7));
      }
    }
  }

  /** The NPC whose figure is under this hit object, if any. */
  function npcOf(o: THREE.Object3D | null | undefined): string | null {
    while (o) {
      if (typeof o.userData.npc === "string") return o.userData.npc;
      o = o.parent;
    }
    return null;
  }

  function dispose() {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== shadowGeo) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
    shadowGeo.dispose();
    shadowMat.dispose();
    mat.dispose();
    for (const t of textures) t.dispose();
  }

  return { group, hits, update, npcOf, dispose, figs };
}

export type Figures = ReturnType<typeof createFigures>;
