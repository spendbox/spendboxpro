// Bottle service (docs/CLUBS.md): when someone orders bottles in a club, a line of hostesses walks
// in from the way in, single file, each holding a bottle up high with a sparkler fizzing on top,
// the first one carrying a light-up LED sign with the buyer's name. They stop round the table,
// dance a moment with the bottles up, set them down in an ice bucket (the sparklers fizz on a while)
// and walk back out. Everyone in the club sees it. Drawn in the room's own metres, in its holder.

import * as THREE from "three";
import type { BottleLook } from "@/lib/world/bottles";

type Seat = { x: number; z: number; ry: number };

const geo = {
  leg: new THREE.CylinderGeometry(0.045, 0.035, 0.8, 8).translate(0, 0.4, 0),
  dress: new THREE.CylinderGeometry(0.16, 0.24, 0.62, 12).translate(0, 0.31, 0),
  top: new THREE.CylinderGeometry(0.15, 0.16, 0.3, 12).translate(0, 0.15, 0),
  head: new THREE.SphereGeometry(0.11, 14, 10),
  hair: new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7),
  bun: new THREE.SphereGeometry(0.065, 10, 8),
  arm: new THREE.CylinderGeometry(0.035, 0.03, 0.55, 8).translate(0, 0.275, 0),
  // Bottles: champagne, a squat cognac, a tall tequila (the 3 L one is a big champagne).
  champagne: new THREE.CylinderGeometry(0.045, 0.045, 0.2, 14).translate(0, 0.1, 0),
  shoulder: new THREE.CylinderGeometry(0.018, 0.045, 0.07, 14).translate(0, 0.235, 0),
  neck: new THREE.CylinderGeometry(0.016, 0.018, 0.08, 10).translate(0, 0.31, 0),
  cognac: new THREE.BoxGeometry(0.12, 0.17, 0.07).translate(0, 0.085, 0),
  tequila: new THREE.CylinderGeometry(0.035, 0.05, 0.32, 14).translate(0, 0.16, 0),
  label: new THREE.CylinderGeometry(0.047, 0.047, 0.07, 14).translate(0, 0.09, 0),
  bucket: new THREE.CylinderGeometry(0.16, 0.12, 0.2, 18, 1, true).translate(0, 0.1, 0),
  bucketBase: new THREE.CircleGeometry(0.12, 18).rotateX(-Math.PI / 2),
  stick: new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4).translate(0, 0.06, 0),
  sign: new THREE.PlaneGeometry(0.9, 0.36),
  pole: new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).translate(0, 0.25, 0),
  heel: new THREE.BoxGeometry(0.07, 0.04, 0.14),
  cognacLabel: new THREE.BoxGeometry(0.122, 0.06, 0.072).translate(0, 0.08, 0),
  iceTop: new THREE.CircleGeometry(0.15, 16).rotateX(-Math.PI / 2),
};
const mat = (color: number, extra?: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial({ color, ...extra });
const MAT = {
  skin: [mat(0x8d5524), mat(0x6b3e1f), mat(0xa86b3c), mat(0x5a3418)],
  hair: mat(0x14100d),
  // Sparkly dresses: gold, silver, black, red, each with a little shine of its own.
  dress: [0xd4a017, 0xc0c4cc, 0x1a1a1a, 0xc92a2a, 0xe64980].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.25, emissive: c, emissiveIntensity: 0.18 })),
  heel: mat(0x0b0b0b),
  ice: mat(0xe7f5ff, { transparent: true, opacity: 0.7 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xdee2e6, metalness: 0.9, roughness: 0.2 }),
  stick: mat(0x868e96),
  pole: mat(0x212529),
};
const glassMats = new Map<number, THREE.MeshStandardMaterial>();
const glassOf = (c: number) => glassMats.get(c) ?? (glassMats.set(c, new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.15 })), glassMats.get(c)!);
const labelMats = new Map<number, THREE.MeshLambertMaterial>();
const labelOf = (c: number) => labelMats.get(c) ?? (labelMats.set(c, mat(c)), labelMats.get(c)!);

/** A bottle, standing on its base at 0. */
function bottleMesh(look: BottleLook) {
  const g = new THREE.Group();
  const glass = glassOf(look.glass);
  if (look.shape === "cognac") {
    g.add(new THREE.Mesh(geo.cognac, glass));
    const neck = new THREE.Mesh(geo.neck, glass);
    neck.position.y = -0.13;
    g.add(neck);
    const label = new THREE.Mesh(geo.cognacLabel, labelOf(look.label));
    g.add(label);
  } else if (look.shape === "tequila") {
    g.add(new THREE.Mesh(geo.tequila, glass));
    const neck = new THREE.Mesh(geo.neck, glass);
    neck.position.y = 0.03;
    g.add(neck);
    const label = new THREE.Mesh(geo.label, labelOf(look.label));
    label.position.y = 0.06;
    g.add(label);
  } else {
    g.add(new THREE.Mesh(geo.champagne, glass), new THREE.Mesh(geo.shoulder, glass), new THREE.Mesh(geo.neck, glass));
    g.add(new THREE.Mesh(geo.label, labelOf(look.label)));
    if (look.shape === "big") g.scale.setScalar(1.8);
  }
  return g;
}

/** The top of a bottle (where its sparkler goes), in its own frame. */
const topOf = (look: BottleLook) => (look.shape === "cognac" ? 0.22 : look.shape === "tequila" ? 0.39 : 0.35) * (look.shape === "big" ? 1.8 : 1);

/** A sparkler: a stick, a white-hot core and a spray of sparks (moved each frame). */
type Sparkler = { group: THREE.Group; sparks: THREE.Points; vel: Float32Array; life: Float32Array; core: THREE.Mesh };
const SPARKS = 64;
const sparkTex = (() => {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d")!;
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.3, "rgba(255,230,160,0.9)");
  gr.addColorStop(1, "rgba(255,160,40,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const sparkMat = new THREE.PointsMaterial({ size: 0.085, map: sparkTex ?? undefined, color: 0xffe9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const coreGeo = new THREE.SphereGeometry(0.035, 8, 6);

function sparkler(): Sparkler {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo.stick, MAT.stick));
  const pos = new Float32Array(SPARKS * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(g, sparkMat);
  sparks.frustumCulled = false;
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 0.12;
  group.add(sparks, core);
  const life = new Float32Array(SPARKS).map(() => Math.random() * 0.5);
  return { group, sparks, vel: new Float32Array(SPARKS * 3), life, core };
}

function fizz(s: Sparkler, dt: number, on: boolean) {
  const pos = s.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
  const a = pos.array as Float32Array;
  for (let i = 0; i < SPARKS; i++) {
    s.life[i] -= dt;
    if (s.life[i] <= 0) {
      if (!on) {
        a[i * 3 + 1] = -99;
        continue;
      }
      // A new spark from the tip, flung up and out.
      s.life[i] = 0.25 + Math.random() * 0.45;
      a[i * 3] = 0;
      a[i * 3 + 1] = 0.12;
      a[i * 3 + 2] = 0;
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.4 + Math.random() * 0.9;
      s.vel[i * 3] = Math.cos(ang) * sp * 0.6;
      s.vel[i * 3 + 1] = 0.6 + Math.random() * 1.2;
      s.vel[i * 3 + 2] = Math.sin(ang) * sp * 0.6;
    } else {
      s.vel[i * 3 + 1] -= 3.5 * dt;
      a[i * 3] += s.vel[i * 3] * dt;
      a[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
      a[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
    }
  }
  pos.needsUpdate = true;
  s.core.visible = on;
  s.core.scale.setScalar(on ? 0.8 + Math.random() * 0.6 : 0);
}

/** The LED sign: the buyer's name in bright dots, flashing between two colours. */
function signTextures(name: string) {
  if (typeof document === "undefined") return null;
  const make = (fg: string, edge: string) => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 204;
    const x = c.getContext("2d")!;
    x.fillStyle = "#050505";
    x.fillRect(0, 0, 512, 204);
    x.strokeStyle = edge;
    x.lineWidth = 10;
    x.strokeRect(8, 8, 496, 188);
    x.fillStyle = fg;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = "bold 30px sans-serif";
    x.fillText("🍾 BOTTLE SERVICE 🍾", 256, 48);
    const label = name.toUpperCase().slice(0, 16);
    x.font = `900 ${label.length > 10 ? 62 : 78}px sans-serif`;
    x.shadowColor = fg;
    x.shadowBlur = 18;
    x.fillText(label, 256, 128);
    // The dots of an LED board over it all.
    x.shadowBlur = 0;
    x.fillStyle = "rgba(0,0,0,0.35)";
    for (let yy = 0; yy < 204; yy += 6) x.fillRect(0, yy, 512, 2);
    for (let xx = 0; xx < 512; xx += 6) x.fillRect(xx, 0, 2, 204);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return [make("#ff2d95", "#ffd43b"), make("#3bc9db", "#ff2d95"), make("#ffd43b", "#3bc9db")];
}

type Hostess = { body: THREE.Group; arm: THREE.Group; held: THREE.Object3D; look: BottleLook | null; spark: Sparkler | null };

function hostess(v: number, holding: THREE.Object3D, look: BottleLook | null): Hostess {
  const body = new THREE.Group();
  const skin = MAT.skin[Math.floor(v * 97) % MAT.skin.length];
  const dress = MAT.dress[Math.floor(v * 53) % MAT.dress.length];
  for (const sx of [-0.07, 0.07]) {
    const leg = new THREE.Mesh(geo.leg, skin);
    leg.position.x = sx;
    body.add(leg);
    const heel = new THREE.Mesh(geo.heel, MAT.heel);
    heel.position.set(sx, 0.02, 0.02);
    body.add(heel);
  }
  // A short flared dress from the waist down, and its top up to the shoulders.
  const skirt = new THREE.Mesh(geo.dress, dress);
  skirt.position.y = 0.5;
  body.add(skirt);
  const top = new THREE.Mesh(geo.top, dress);
  top.position.y = 1.1;
  body.add(top);
  const head = new THREE.Mesh(geo.head, skin);
  head.position.y = 1.6;
  body.add(head);
  const hair = new THREE.Mesh(geo.hair, MAT.hair);
  hair.position.y = 1.62;
  hair.rotation.x = -0.35;
  body.add(hair);
  const bun = new THREE.Mesh(geo.bun, MAT.hair);
  bun.position.set(0, 1.73, -0.07);
  body.add(bun);
  // The other arm down by her side.
  const down = new THREE.Mesh(geo.arm, skin);
  down.position.set(-0.19, 1.42, 0);
  down.rotation.z = Math.PI - 0.12;
  body.add(down);
  // The arm up high, the bottle (or the sign) in her hand.
  const arm = new THREE.Group();
  arm.position.set(0.19, 1.42, 0);
  const upper = new THREE.Mesh(geo.arm, skin);
  arm.add(upper);
  holding.position.y = 0.58;
  arm.add(holding);
  body.add(arm);
  let spark: Sparkler | null = null;
  if (look) {
    spark = sparkler();
    spark.group.position.y = 0.58 + topOf(look);
    arm.add(spark.group);
  }
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { body, arm, held: holding, look, spark };
}

type Parade = {
  girls: Hostess[];
  seat: Seat;
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** Where each one stands round the table. */
  spots: THREE.Vector3[];
  t: number;
  phase: "in" | "dance" | "out";
  sign: { mesh: THREE.Mesh; tex: THREE.Texture[] } | null;
  looks: BottleLook[];
};

type Left = { group: THREE.Group; sparks: Sparkler[]; t: number };

/**
 * The bottle parades in one room. `room` is what the bucket is set down on (raycast from above to
 * find the table top); `holder` is the room's holder (metres inside it); `door` where they come in.
 */
export function createParades(holder: THREE.Object3D, room: THREE.Object3D, door: { x: number; z: number }) {
  const parades: Parade[] = [];
  const left: Left[] = [];
  const ray = new THREE.Raycaster();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  function tableTop(x: number, z: number) {
    holder.updateWorldMatrix(true, true);
    a.set(x, 1.3, z);
    holder.localToWorld(a);
    b.set(x, 0, z);
    holder.localToWorld(b);
    const dir = b.clone().sub(a);
    const len = dir.length();
    ray.set(a, dir.normalize());
    ray.far = len;
    for (const hit of ray.intersectObject(room, true)) {
      const p = holder.worldToLocal(hit.point.clone());
      if (p.y > 0.3 && p.y < 1.2) return p.y;
    }
    return 0.75;
  }

  /** The bucket on the table, the bottles in the ice, their sparklers still going a while. */
  function setDown(p: Parade) {
    const fx = Math.sin(p.seat.ry);
    const fz = Math.cos(p.seat.ry);
    const x = p.seat.x + fx * 0.5;
    const z = p.seat.z + fz * 0.5;
    const top = tableTop(x, z);
    const g = new THREE.Group();
    g.position.set(x, top + 0.002, z);
    const bucket = new THREE.Mesh(geo.bucket, MAT.silver);
    const base = new THREE.Mesh(geo.bucketBase, MAT.silver);
    const ice = new THREE.Mesh(geo.iceTop, MAT.ice);
    ice.position.y = 0.16;
    g.add(bucket, base, ice);
    const sparks: Sparkler[] = [];
    p.looks.forEach((look, k) => {
      const n = p.looks.length;
      const ang = (k / Math.max(1, n)) * Math.PI * 2;
      const r = n > 1 ? 0.07 : 0;
      const bt = bottleMesh(look);
      bt.position.set(Math.cos(ang) * r, 0.05, Math.sin(ang) * r);
      bt.rotation.z = Math.cos(ang) * 0.18;
      bt.rotation.x = Math.sin(ang) * 0.18;
      g.add(bt);
      const s = sparkler();
      s.group.position.set(Math.cos(ang) * r, 0.05 + topOf(look), Math.sin(ang) * r);
      g.add(s.group);
      sparks.push(s);
    });
    holder.add(g);
    left.push({ group: g, sparks, t: 0 });
  }

  function remove(p: Parade) {
    for (const h of p.girls) holder.remove(h.body);
  }

  return {
    /** Hostesses bring these bottles to the seat, the sign with this name in front. */
    parade(seat: Seat, looks: BottleLook[], name: string) {
      const tex = signTextures(name || "VIP");
      const girls: Hostess[] = [];
      let sign: Parade["sign"] = null;
      // The sign first (on a short pole, held up high), then a hostess for each bottle.
      if (tex) {
        const board = new THREE.Group();
        const pole = new THREE.Mesh(geo.pole, MAT.pole);
        // Two faces back to back, so the name reads the right way round from either side.
        const mesh = new THREE.Mesh(geo.sign, new THREE.MeshBasicMaterial({ map: tex[0], toneMapped: false }));
        mesh.position.y = 0.6;
        const back = new THREE.Mesh(geo.sign, mesh.material);
        back.position.y = 0.6;
        back.rotation.y = Math.PI;
        board.add(pole, mesh, back);
        girls.push(hostess(0.37, board, null));
        sign = { mesh, tex };
      }
      looks.forEach((look, k) => girls.push(hostess(0.13 + k * 0.21, bottleMesh(look), look)));
      const start = new THREE.Vector3(door.x, 0, door.z);
      const fx = Math.sin(seat.ry);
      const fz = Math.cos(seat.ry);
      const rx = Math.cos(seat.ry);
      const rz = -Math.sin(seat.ry);
      // They gather in an arc on the far side of the table, facing the buyer.
      const tx = seat.x + fx * 0.5;
      const tz = seat.z + fz * 0.5;
      const spots = girls.map((_, k) => {
        const n = girls.length;
        const across = (k - (n - 1) / 2) * 0.5;
        const out = 0.75 + Math.abs(across) * 0.25;
        return new THREE.Vector3(tx + fx * out + rx * across, 0, tz + fz * out + rz * across);
      });
      const end = spots[Math.floor(spots.length / 2)];
      for (const h of girls) {
        h.body.position.copy(start);
        holder.add(h.body);
      }
      parades.push({ girls, seat, start, end, spots, t: 0, phase: "in", sign, looks });
    },
    update(dt: number) {
      for (let i = parades.length - 1; i >= 0; i--) {
        const p = parades[i];
        p.t += dt;
        const walk = p.start.distanceTo(p.end);
        if (p.phase === "in") {
          // Single file, a metre apart, along the way in; each peels off to her spot at the end.
          let all = true;
          p.girls.forEach((h, k) => {
            const d = p.t * 1.2 - k * 1.0;
            const to = p.spots[k];
            const from = p.start;
            const len = from.distanceTo(to);
            const u = Math.max(0, Math.min(1, d / Math.max(0.01, len)));
            if (u < 1) all = false;
            h.body.position.lerpVectors(from, to, u);
            h.body.position.y = u > 0 && u < 1 ? Math.abs(Math.sin(p.t * 8 + k)) * 0.04 : 0;
            h.body.rotation.y = u < 1 ? Math.atan2(to.x - from.x, to.z - from.z) : p.seat.ry + Math.PI;
            h.body.visible = d > -0.2;
          });
          if (all || p.t > walk / 1.2 + p.girls.length + 4) {
            p.phase = "dance";
            p.t = 0;
          }
        } else if (p.phase === "dance") {
          // Facing the buyer: a sway, the bottles pumped up and down to the music.
          p.girls.forEach((h, k) => {
            h.body.rotation.y = p.seat.ry + Math.PI + Math.sin(p.t * 3 + k) * 0.15;
            h.body.position.y = Math.abs(Math.sin(p.t * 6 + k * 0.7)) * 0.05;
            h.arm.rotation.z = Math.sin(p.t * 6 + k) * 0.2;
          });
          if (p.t > 4.5) {
            for (const h of p.girls) if (h.look) h.held.visible = false;
            for (const h of p.girls) if (h.spark) h.spark.group.visible = false;
            setDown(p);
            p.phase = "out";
            p.t = 0;
          }
        } else {
          let gone = true;
          p.girls.forEach((h, k) => {
            const d = p.t * 1.3 - k * 0.6;
            const from = p.spots[k];
            const len = from.distanceTo(p.start);
            const u = Math.max(0, Math.min(1, d / Math.max(0.01, len)));
            if (u < 1) gone = false;
            h.body.position.lerpVectors(from, p.start, u);
            h.body.position.y = 0;
            h.body.rotation.y = Math.atan2(p.start.x - from.x, p.start.z - from.z);
            // The bottle's on the table: her arm comes down (the sign stays up).
            h.arm.rotation.z = h.look ? -(Math.PI - 0.12) : 0;
            h.body.visible = u < 1;
          });
          if (gone) {
            remove(p);
            parades.splice(i, 1);
            continue;
          }
        }
        for (const h of p.girls) if (h.spark && h.held.visible) fizz(h.spark, dt, true);
        // The sign flashes between its colours.
        if (p.sign) {
          const k = Math.floor((p.t * 4) % p.sign.tex.length);
          const m = p.sign.mesh.material as THREE.MeshBasicMaterial;
          if (m.map !== p.sign.tex[k]) {
            m.map = p.sign.tex[k];
            m.needsUpdate = true;
          }
        }
      }
      // The sparklers in the bucket burn out after a few seconds; the bottles stay.
      for (const l of left) {
        l.t += dt;
        for (const s of l.sparks) fizz(s, dt, l.t < 8);
        if (l.t > 9) for (const s of l.sparks) s.group.visible = false;
      }
    },
    dispose() {
      for (const p of parades) remove(p);
      parades.length = 0;
      for (const l of left) holder.remove(l.group);
      left.length = 0;
    },
  };
}
