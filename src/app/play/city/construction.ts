// Things being built.
//
// 1. Construction sites (the "crane" tiles) really put up a building during the hunt: first the
//    foundations, then a concrete frame rising floor by floor, then the walls and windows, and
//    at the end a finished block with a roof. Drawn as one instanced mesh, redrawn only when a
//    site moves on a step (a few times a minute at most).
//
// 2. While the map is still secret (the join window), the whole city is a building site:
//    plots of earth, scaffolding and ghostly frames, cranes and fences, growing as tiles are
//    added. When the hunt starts it sinks away and the real city rises (see city-view).

import * as THREE from "three";
import { hash, spiralIndex, spiralXY, type Tile } from "@/lib/city/layout";
import { grown, keyOf, type World } from "./world";

/** How far along a construction site is (0 = just started, 1 = finished). */
export function siteProgress(t: Tile, progress: number) {
  const start = 0.02 + t.r[2] * 0.22;
  const dur = 0.45 + t.r[3] * 0.3;
  return Math.min(1, Math.max(0, (progress - start) / dur));
}

/** Height of a construction site's building when finished. */
export const siteHeight = (t: Tile) => 1.3 + t.r[1] * 1.3;

const FLOOR = 0.24;

export function createSites(world: World, parent: THREE.Object3D) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x0b1a2a, emissiveIntensity: 0.2 });
  let mesh: THREE.InstancedMesh | null = null;
  let glass: THREE.InstancedMesh | null = null;
  let sites: Tile[] = [];
  let key = "";
  let checked = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();

  function clear() {
    for (const m of [mesh, glass]) {
      if (!m) continue;
      parent.remove(m);
      m.dispose();
    }
    mesh = glass = null;
  }

  function build() {
    sites = world.tiles.filter((t) => t.kind === "crane");
    key = "";
    checked = 0;
  }

  /** The boxes a site shows at this stage. */
  function boxes(t: Tile, p: number, out: { solid: number[]; glass: number[] }) {
    const H = siteHeight(t);
    const floors = Math.max(4, Math.round(H / FLOOR));
    const fh = H / floors;
    const cx = t.x - 0.06;
    const cz = t.z + 0.05;
    const w = 0.62;
    const d = 0.6;
    const wall = world.plan?.palette.offices[Math.floor(t.r[0] * 5) % 5] ?? 0xe9ecef;
    const push = (list: number[], x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number) => list.push(x, y, z, sx, sy, sz, col);
    // Foundations: a dug-out pit, then a concrete slab.
    if (p < 0.08) {
      push(out.solid, cx, 0.075, cz, w + 0.08, 0.012, d + 0.08, 0x6e5440);
      return;
    }
    push(out.solid, cx, 0.08, cz, w + 0.04, 0.05, d + 0.04, 0xadb5bd);
    if (p < 0.14) return;
    // Frame: columns and floor slabs going up.
    const frameF = Math.min(1, (p - 0.14) / 0.36);
    const frameTop = frameF * H;
    const slabs = Math.floor(frameTop / fh);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) {
      push(out.solid, cx + (ox * w) / 2.15, 0.13, cz + (oz * d) / 2.15, 0.035, Math.max(0.01, frameTop), 0.035, 0x9aa1aa);
    }
    for (let k = 1; k <= slabs; k++) push(out.solid, cx, 0.13 + k * fh - 0.02, cz, w, 0.025, d, 0xbfc4ca);
    // Walls and windows, floor by floor.
    const clad = Math.max(0, Math.min(1, (p - 0.5) / 0.4));
    const cladFloors = Math.floor(clad * floors);
    if (cladFloors > 0) {
      push(out.solid, cx, 0.13, cz, w - 0.01, cladFloors * fh, d - 0.01, wall);
      for (let k = 0; k < cladFloors; k++) push(out.glass, cx, 0.13 + k * fh + fh * 0.35, cz, w + 0.004, fh * 0.35, d + 0.004, 0x6c8eae);
    }
    if (p >= 0.92) {
      // Finished: a roof with a little plant room.
      push(out.solid, cx, 0.13 + H, cz, w + 0.02, 0.04, d + 0.02, 0x868e96);
      push(out.solid, cx + 0.12, 0.17 + H, cz - 0.1, 0.16, 0.1, 0.14, 0xdee2e6);
    } else if (frameF > 0) {
      // Scaffolding on the front while work goes on.
      push(out.solid, cx, 0.13, cz + d / 2 + 0.05, w + 0.06, Math.max(0.01, frameTop * 0.95), 0.012, 0xff922b);
    }
  }

  function update(now: number) {
    if (!sites.length) {
      if (mesh) clear();
      return;
    }
    // Redraw only when a site moves on a step (or a site finishes rising out of the ground).
    if (now - checked < 400) return;
    checked = now;
    let k = "";
    for (const t of sites) k += `${Math.round(siteProgress(t, world.progress) * 60)}${grown(world, t.i, now) ? "g" : "-"}|`;
    if (k === key) return;
    key = k;
    const out = { solid: [] as number[], glass: [] as number[] };
    for (const t of sites) if (grown(world, t.i, now)) boxes(t, siteProgress(t, world.progress), out);
    clear();
    const make = (list: number[], material: THREE.Material) => {
      const n = list.length / 7;
      if (!n) return null;
      const m = new THREE.InstancedMesh(geo, material, n);
      for (let i = 0; i < n; i++) {
        const o = i * 7;
        m4.compose(v.set(list[o], list[o + 1], list[o + 2]), q, s.set(list[o + 3], list[o + 4], list[o + 5]));
        m.setMatrixAt(i, m4);
        m.setColorAt(i, color.setHex(list[o + 6]));
      }
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    mesh = make(out.solid, mat);
    glass = make(out.glass, glassMat);
  }

  /** Lit windows at night. */
  function setNight(night: number, windowDay: THREE.Color, windowNight: THREE.Color) {
    glassMat.emissive.copy(windowDay).lerp(windowNight, night);
    glassMat.emissiveIntensity = 0.2 + night * 0.8;
  }

  function dispose() {
    clear();
    geo.dispose();
    mat.dispose();
    glassMat.dispose();
  }

  return { build, update, setNight, dispose };
}

/** The secret city: one big building site covering every tile (and a margin round it). */
export function createBuildingSite(scene: THREE.Object3D) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const plotMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x8792a2, wireframe: true, transparent: true, opacity: 0.55 });
  const solidMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const pileGeo = new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.25, 0);
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xfab005 });
  let parts: THREE.InstancedMesh[] = [];
  let cranes: { jib: THREE.Object3D; speed: number }[] = [];
  let builtFor = "";
  /** While leaving: when it started sinking. */
  let leaving = -1;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();

  function clear() {
    for (const p of parts) {
      group.remove(p);
      p.dispose();
    }
    parts = [];
    for (const c of [...group.children]) {
      group.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry !== geo) o.geometry.dispose();
      });
    }
    cranes = [];
  }

  /** box: only the part of a very big town that's being drawn (see the window in city-view). */
  function build(seed: number, count: number, box?: { x0: number; x1: number; z0: number; z1: number } | null) {
    const k = `${seed}:${count}:${box ? `${box.x0},${box.z0}` : ""}`;
    if (k === builtFor) return;
    builtFor = k;
    clear();
    // Every tile so far, and a ring of plots about to be added.
    const n = count + Math.min(160, Math.round(6 * Math.sqrt(count) + 10));
    const cells: [number, number][] = [];
    const inSite = new Set<string>();
    if (box) {
      for (let x = box.x0; x <= box.x1; x++) {
        for (let z = box.z0; z <= box.z1; z++) {
          if (spiralIndex(x, z) >= n) continue;
          cells.push([x, z]);
          inSite.add(keyOf(x, z));
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const c = spiralXY(i);
        cells.push(c);
        inSite.add(keyOf(c[0], c[1]));
      }
    }
    const H = (x: number, z: number, k: number) => hash(x * 3 + 7, z * 5 - 3, seed * 13 + 4242 + k);
    const plots: number[] = [];
    const frames: number[] = [];
    const solids: number[] = [];
    const piles: number[] = [];
    const push = (list: number[], x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number, ry = 0) => list.push(x, y, z, sx, sy, sz, col, ry);
    const DIRT = [0xb59b7a, 0xc4ab88, 0xa88f6e, 0xbdb6a8];
    for (const [x, z] of cells) {
      const r = H(x, z, 0);
      push(plots, x, 0, z, 0.96, 0.03 + r * 0.02, 0.96, DIRT[Math.floor(H(x, z, 1) * DIRT.length) % DIRT.length]);
      const r2 = H(x, z, 2);
      if (r2 < 0.3) {
        // A ghostly frame of something to come (random heights: not a hint of the real city).
        const h = 0.4 + H(x, z, 3) * 1.3;
        push(frames, x + (H(x, z, 4) - 0.5) * 0.1, 0.03, z + (H(x, z, 5) - 0.5) * 0.1, 0.62, h, 0.62, 0);
        // Concrete slabs at a few floors.
        for (let f = 0.35; f < h; f += 0.35) push(solids, x, 0.03 + f, z, 0.64, 0.025, 0.64, 0xbfc4ca);
      } else if (r2 < 0.45) {
        // Scaffolding round a slab.
        push(solids, x, 0.03, z, 0.7, 0.05, 0.7, 0xadb5bd);
        push(frames, x, 0.08, z, 0.74, 0.5 + H(x, z, 6) * 0.6, 0.74, 0);
      } else if (r2 < 0.66) {
        // Heaps of earth and stacks of materials.
        push(piles, x - 0.15, 0.03, z + 0.1, 0.45, 0.3, 0.4, 0x9c7f5c, H(x, z, 7) * 6);
        push(solids, x + 0.2, 0.03, z - 0.2, 0.25, 0.08, 0.15, [0xd9480f, 0x495057, 0xe9ecef][Math.floor(H(x, z, 8) * 3) % 3]);
        push(solids, x + 0.2, 0.11, z - 0.2, 0.25, 0.08, 0.15, 0xd9480f);
      } else if (r2 < 0.73) {
        // A little site cabin.
        push(solids, x + 0.15, 0.03, z + 0.15, 0.36, 0.18, 0.18, 0xf2b705);
        push(solids, x + 0.15, 0.13, z + 0.245, 0.2, 0.05, 0.004, 0x4c6e91);
      }
      // Fences along the outside edge of the site.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (inSite.has(keyOf(x + dx, z + dz))) continue;
        const fx = x + dx * 0.49;
        const fz = z + dz * 0.49;
        push(solids, fx, 0.03, fz, dx ? 0.03 : 1, 0.16, dx ? 1 : 0.03, (x + z) % 2 ? 0xff922b : 0xf8f9fa);
      }
    }
    const make = (list: number[], g: THREE.BufferGeometry, material: THREE.Material, shadow: boolean) => {
      const count = list.length / 8;
      if (!count) return;
      const mesh = new THREE.InstancedMesh(g, material, count);
      for (let i = 0; i < count; i++) {
        const o = i * 8;
        q.setFromAxisAngle(up, list[o + 7]);
        m4.compose(v.set(list[o], list[o + 1], list[o + 2]), q, s.set(list[o + 3], list[o + 4], list[o + 5]));
        mesh.setMatrixAt(i, m4);
        if (material !== frameMat) mesh.setColorAt(i, color.setHex(list[o + 6]));
      }
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parts.push(mesh);
      group.add(mesh);
    };
    make(plots, geo, plotMat, false);
    make(frames, geo, frameMat, false);
    make(solids, geo, solidMat, true);
    make(piles, pileGeo, solidMat, true);
    // Tower cranes dotted about, arms slowly turning.
    const nCranes = Math.min(16, Math.max(2, Math.round(cells.length / 22)));
    for (let k = 0; k < nCranes; k++) {
      const [x, z] = cells[Math.floor(H(k, 99, 9) * cells.length)];
      const h = 2.2 + H(x, z, 10) * 1.4;
      const crane = new THREE.Group();
      const mast = new THREE.Mesh(geo, craneMat);
      mast.scale.set(0.08, h, 0.08);
      const jib = new THREE.Group();
      const arm = new THREE.Mesh(geo, craneMat);
      arm.scale.set(1.5, 0.06, 0.06);
      arm.position.x = 0.4;
      const weight = new THREE.Mesh(geo, solidMat);
      weight.scale.set(0.2, 0.12, 0.12);
      weight.position.x = -0.3;
      const cable = new THREE.Mesh(geo, solidMat);
      cable.scale.set(0.01, 0.6, 0.01);
      cable.position.set(0.9, -0.6, 0);
      const load = new THREE.Mesh(geo, solidMat);
      load.scale.set(0.16, 0.06, 0.1);
      load.position.set(0.9, -0.66, 0);
      jib.add(arm, weight, cable, load);
      jib.position.y = h;
      jib.rotation.y = H(x, z, 11) * 6.28;
      crane.add(mast, jib);
      crane.position.set(x + 0.3, 0.03, z - 0.3);
      crane.traverse((o) => (o.castShadow = true));
      group.add(crane);
      cranes.push({ jib, speed: (0.1 + H(x, z, 12) * 0.15) * (k % 2 ? 1 : -1) });
    }
  }

  function show(on: boolean) {
    if (on) {
      leaving = -1;
      group.visible = true;
      group.scale.set(1, 1, 1);
      group.position.y = 0;
    } else if (group.visible && leaving < 0) {
      leaving = performance.now();
    }
  }

  function update(dt: number, now: number) {
    if (!group.visible) return;
    for (const c of cranes) c.jib.rotation.y += c.speed * dt;
    if (leaving >= 0) {
      // Sink into the ground as the real city rises.
      const t = Math.min(1, (now - leaving) / 1600);
      group.scale.y = Math.max(0.001, 1 - t * t);
      group.position.y = -t * 0.05;
      if (t >= 1) {
        group.visible = false;
        leaving = -1;
      }
    }
  }

  function dispose() {
    clear();
    scene.remove(group);
    geo.dispose();
    pileGeo.dispose();
    plotMat.dispose();
    frameMat.dispose();
    solidMat.dispose();
    craneMat.dispose();
  }

  return { build, show, update, dispose, group };
}
