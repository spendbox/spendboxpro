// Things you can use inside places (seats, the bar, darts, the DJ booth...): each one gets a
// soft glowing ring that breathes gently when you're near (or pointing at it), and a little
// floating label with an icon. One instanced mesh for the rings, a handful of label sprites
// (only the closest few show), and picking by distance to each thing (no extra hit meshes).
// Also the walk planner: tap the floor to walk there, round the furniture.

import { Armchair, ArrowUpDown, Binoculars, Camera, Cherry, Circle, Disc3, Gamepad2, Martini, Mic, Music, Music2, Piano, Spade, Target, Tv, UtensilsCrossed, Vault, type LucideIcon } from "lucide-react";
import * as THREE from "three";
import { drawIcon } from "./textures";

export type InteractKind =
  | "seat" | "darts" | "archery" | "arcade" | "pool" | "cards" | "dance" | "dj" | "bar" | "jukebox" | "menu" | "stairs" | "window" | "piano" | "karaoke" | "slots-free" | "photo"
  // At a sports venue: watch the match / the fight (by the big screen, at the pitch side).
  | "match"
  // In the bank: try to rob the vault.
  | "vault";

/** Something to use, in the room's own space (metres). */
export type Item = { id: string; kind: InteractKind; label: string; x: number; y: number; z: number; /** How big it is (tap radius, metres). */ r: number; /** A seat someone's in. */ taken?: string | null };

const ICONS: Record<InteractKind, LucideIcon> = {
  seat: Armchair, darts: Target, archery: Target, arcade: Gamepad2, pool: Circle, cards: Spade, dance: Music, dj: Disc3, bar: Martini, jukebox: Music2,
  menu: UtensilsCrossed, stairs: ArrowUpDown, window: Binoculars, piano: Piano, karaoke: Mic, "slots-free": Cherry, photo: Camera, match: Tv, vault: Vault,
};
const SEAT = new THREE.Color(0x63e6be);
const THING = new THREE.Color(0xffd43b);

function labelTexture(kind: InteractKind, text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const c = canvas.getContext("2d")!;
  c.font = "700 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const tw = Math.min(232, c.measureText(text).width);
  const w = tw + 76;
  const x0 = (320 - w) / 2;
  c.fillStyle = "rgba(255,255,255,0.94)";
  c.beginPath();
  c.roundRect(x0, 8, w, 56, 28);
  c.fill();
  c.fillStyle = kind === "seat" ? "#12b886" : "#f59f00";
  c.beginPath();
  c.arc(x0 + 30, 36, 20, 0, Math.PI * 2);
  c.fill();
  drawIcon(c, ICONS[kind], x0 + 18, 24, 24, "#ffffff", 2.4);
  c.fillStyle = "#1b1f27";
  c.textBaseline = "middle";
  c.fillText(text, x0 + 58, 37, 232);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The glowing markers and labels for a room's things (add `group` to the room's holder). */
export function createInteractables(list: Item[]) {
  const group = new THREE.Group();
  let items = list;
  const ringGeo = new THREE.RingGeometry(0.26, 0.36, 28).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  let rings = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, items.length));
  rings.frustumCulled = false;
  rings.renderOrder = 4;
  group.add(rings);
  const LABELS = 4;
  const labels = Array.from({ length: LABELS }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(1.2, 0.27, 1);
    s.renderOrder = 7;
    s.visible = false;
    group.add(s);
    return s;
  });
  const shown: (string | null)[] = labels.map(() => null);
  const texCache = new Map<string, THREE.CanvasTexture>();
  const texFor = (it: Item) => {
    const text = it.taken ? `${it.taken}'s seat` : it.label;
    const key = `${it.kind}|${text}`;
    let t = texCache.get(key);
    if (!t) {
      t = labelTexture(it.kind, text);
      texCache.set(key, t);
    }
    return t;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const dist = new Float32Array(256);
  const order: number[] = [];

  function setItems(next: Item[]) {
    items = next;
    if (items.length > rings.count || rings.instanceMatrix.count < items.length) {
      group.remove(rings);
      rings.dispose();
      rings = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, items.length));
      rings.frustumCulled = false;
      rings.renderOrder = 4;
      group.add(rings);
    }
    for (let k = 0; k < labels.length; k++) shown[k] = null;
  }

  /** cam: the viewer, in the room's space. hover: the thing pointed at. */
  function update(time: number, cam: THREE.Vector3, hover: string | null) {
    rings.count = items.length;
    order.length = 0;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const d = Math.hypot(it.x - cam.x, it.z - cam.z);
      if (k < dist.length) dist[k] = d;
      const near = it.kind === "seat" ? 3.2 : 7;
      const on = (d < near && !it.taken) || it.id === hover;
      const sc = on ? (it.id === hover ? 1.25 : 0.85 + 0.15 * pulse) * Math.max(0.7, it.r / 0.5) * Math.min(1, (near - d) / 1.2 + (it.id === hover ? 1 : 0)) : 0.0001;
      m4.compose(v.set(it.x, it.y + 0.02, it.z), q, s.set(sc, 1, sc));
      rings.setMatrixAt(k, m4);
      rings.setColorAt(k, it.kind === "seat" ? SEAT : THING);
      if (on && (it.kind !== "seat" || d < 1.9 || it.id === hover)) order.push(k);
    }
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    ringMat.opacity = 0.45 + 0.3 * pulse;
    order.sort((a, b) => (items[a].id === hover ? -1 : items[b].id === hover ? 1 : (dist[a] ?? 0) - (dist[b] ?? 0)));
    for (let j = 0; j < labels.length; j++) {
      const k = order[j];
      const sp = labels[j];
      if (k === undefined) {
        sp.visible = false;
        shown[j] = null;
        continue;
      }
      const it = items[k];
      if (shown[j] !== it.id) {
        shown[j] = it.id;
        sp.material.map = texFor(it);
        sp.material.needsUpdate = true;
      }
      sp.visible = true;
      sp.position.set(it.x, it.y + (it.kind === "seat" ? 0.75 : 1.05) + Math.sin(time * 1.8 + k) * 0.03, it.z);
    }
  }

  const wp = new THREE.Vector3();
  /** The thing a ray (in world space) points at, if any. */
  function pick(ray: THREE.Ray): Item | null {
    group.updateWorldMatrix(true, false);
    const scale = group.matrixWorld.getMaxScaleOnAxis();
    let best: Item | null = null;
    let bestT = Infinity;
    for (const it of items) {
      wp.set(it.x, it.y + 0.3, it.z).applyMatrix4(group.matrixWorld);
      const t = wp.clone().sub(ray.origin).dot(ray.direction);
      if (t <= 0) continue;
      const d = ray.distanceToPoint(wp);
      if (d < it.r * scale && t < bestT) {
        bestT = t;
        best = it;
      }
    }
    return best;
  }

  function dispose() {
    ringGeo.dispose();
    ringMat.dispose();
    rings.dispose();
    for (const l of labels) l.material.dispose();
    for (const t of texCache.values()) t.dispose();
    group.removeFromParent();
  }

  return { group, update, pick, setItems, get items() { return items; }, dispose };
}

export type Interactables = ReturnType<typeof createInteractables>;

// ---------------------------------------------------------------- walking round a room

/** Where furniture stands (its soft shadow): middle, size, turn. */
export type Block = { x: number; z: number; w: number; d: number; ry: number };

/**
 * Plans walks round a room w × d metres (centred on 0, 0) without going through furniture
 * (roughly: it keeps to the gaps between the blocks). Paths are a few straight legs.
 */
export function createWalker(w: number, d: number, blocks: Block[], margin = 0.45) {
  const C = 0.25;
  const nx = Math.max(2, Math.floor((w - 2 * margin) / C));
  const nz = Math.max(2, Math.floor((d - 2 * margin) / C));
  const x0 = -((nx - 1) * C) / 2;
  const z0 = -((nz - 1) * C) / 2;
  const solid = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const px = x0 + i * C;
      const pz = z0 + j * C;
      for (const b of blocks) {
        if (b.w > w * 0.8 && b.d > d * 0.8) continue;
        const c = Math.cos(b.ry);
        const s = Math.sin(b.ry);
        const lx = (px - b.x) * c - (pz - b.z) * s;
        const lz = (px - b.x) * s + (pz - b.z) * c;
        if (Math.abs(lx) < b.w / 2 + 0.02 && Math.abs(lz) < b.d / 2 + 0.02) {
          solid[i * nz + j] = 1;
          break;
        }
      }
    }
  }
  const cellOf = (x: number, z: number) => [Math.min(nx - 1, Math.max(0, Math.round((x - x0) / C))), Math.min(nz - 1, Math.max(0, Math.round((z - z0) / C)))] as const;
  const free = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && !solid[i * nz + j];
  /** The nearest free cell to (i, j). */
  function nearestFree(i: number, j: number) {
    if (free(i, j)) return [i, j] as const;
    for (let r = 1; r < Math.max(nx, nz); r++) {
      for (let di = -r; di <= r; di++) {
        for (const dj of [-r, r]) if (free(i + di, j + dj)) return [i + di, j + dj] as const;
        if (Math.abs(di) === r) for (let dj = -r + 1; dj < r; dj++) if (free(i + di, j + dj)) return [i + di, j + dj] as const;
      }
    }
    return null;
  }
  /** Can you walk straight from cell a to cell b? */
  function clearLine(ai: number, aj: number, bi: number, bj: number) {
    const n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2;
    for (let k = 1; k < n; k++) {
      const i = Math.round(ai + ((bi - ai) * k) / n);
      const j = Math.round(aj + ((bj - aj) * k) / n);
      if (!free(i, j)) return false;
    }
    return true;
  }
  /** A path from (fx, fz) to (tx, tz): the points to walk through (ending at the goal), or null. */
  function path(fx: number, fz: number, tx: number, tz: number) {
    const [si0, sj0] = cellOf(fx, fz);
    const start = nearestFree(si0, sj0);
    const [gi0, gj0] = cellOf(tx, tz);
    const goal = nearestFree(gi0, gj0);
    if (!start || !goal) return null;
    const N = nx * nz;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    const open: number[] = [];
    const sIdx = start[0] * nz + start[1];
    const gIdx = goal[0] * nz + goal[1];
    g[sIdx] = 0;
    open.push(sIdx);
    const h = (k: number) => Math.hypot(Math.floor(k / nz) - goal[0], (k % nz) - goal[1]);
    let found = false;
    for (let guard = 0; open.length && guard < N * 4; guard++) {
      // The open cell with the lowest cost (fine for rooms this size).
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === gIdx) {
        found = true;
        break;
      }
      if (done[cur]) continue;
      done[cur] = 1;
      const ci = Math.floor(cur / nz);
      const cj = cur % nz;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!free(ni, nj) || (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj)))) continue;
          const nk = ni * nz + nj;
          const cost = g[cur] + (di && dj ? 1.414 : 1);
          if (cost < g[nk]) {
            g[nk] = cost;
            came[nk] = cur;
            open.push(nk);
          }
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let k = gIdx; k !== -1; k = came[k]) cells.unshift(k);
    // Pull the string tight: keep only the corners you can't see past.
    const pts: { x: number; z: number }[] = [];
    let a = cells[0];
    for (let k = 1; k < cells.length; k++) {
      const b = cells[k];
      const next = cells[k + 1];
      if (next === undefined || !clearLine(Math.floor(a / nz), a % nz, Math.floor(next / nz), next % nz)) {
        pts.push({ x: x0 + Math.floor(b / nz) * C, z: z0 + (b % nz) * C });
        a = b;
      }
    }
    if (!pts.length) pts.push({ x: x0 + goal[0] * C, z: z0 + goal[1] * C });
    return pts;
  }
  return { path };
}
