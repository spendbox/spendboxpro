// Kites over the suburbs: bright paper diamonds on long strings, flown from yards, pitches and
// playgrounds, swaying in the wind. Only round the camera, and only by day. One instanced mesh
// for the kites (2 triangles each) and one set of lines for the strings: almost free to draw.

import * as THREE from "three";
import { hash, type Tile } from "@/lib/city/layout";

const MAX = 48;
const COLORS = [0xe03131, 0xf59f00, 0x1c7ed6, 0x2f9e44, 0xae3ec9, 0xf8f9fa, 0x0ca678, 0xe8590c];
/** Where kites are flown from. */
const FROM = new Set<Tile["kind"]>(["house", "park", "pitch", "playground", "trees"]);

export function createKites(parent: THREE.Object3D) {
  // A diamond, taller than wide, facing +z.
  const shape = new THREE.BufferGeometry();
  shape.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.16, 0, -0.1, 0, 0, 0, -0.2, 0, 0, 0.16, 0, 0, -0.2, 0, 0.1, 0, 0], 3));
  shape.computeVertexNormals();
  const kites = new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), MAX);
  kites.count = 0;
  kites.frustumCulled = false;
  const strings = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x495057, transparent: true, opacity: 0.45 }));
  strings.frustumCulled = false;
  const group = new THREE.Group();
  group.add(kites, strings);
  parent.add(group);
  let flyers: { x: number; z: number; h: number; phase: number; lean: number }[] = [];
  const stringPos = new Float32Array(MAX * 6);
  strings.geometry.setAttribute("position", new THREE.BufferAttribute(stringPos, 3));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();

  return {
    /** Pick who's flying a kite today among the drawn tiles (quiet, low-rise ones only). */
    build(tiles: readonly Tile[], seed: number) {
      flyers = [];
      for (const t of tiles) {
        if (flyers.length >= MAX) break;
        if (!FROM.has(t.kind) || hash(t.x, t.z, seed + 4401) > 0.035) continue;
        const r = hash(t.z, t.x, seed + 4402);
        kites.setColorAt(flyers.length, color.setHex(COLORS[Math.floor(r * COLORS.length) % COLORS.length]));
        flyers.push({ x: t.x, z: t.z, h: 2.2 + r * 1.6, phase: r * 20, lean: 0.8 + hash(t.x, t.z, seed + 4403) * 0.8 });
      }
      kites.count = flyers.length;
      if (kites.instanceColor) kites.instanceColor.needsUpdate = true;
      strings.geometry.setDrawRange(0, flyers.length * 2);
    },
    /** Sway in the wind; away at night. */
    update(time: number, night: number) {
      group.visible = night < 0.5 && flyers.length > 0;
      if (!group.visible) return;
      flyers.forEach((f, k) => {
        const sway = Math.sin(time * 0.9 + f.phase) * 0.35;
        const bob = Math.sin(time * 1.7 + f.phase * 1.3) * 0.12;
        // Blown downwind (towards +x), swinging side to side.
        const kx = f.x + f.lean + sway * 0.3;
        const ky = f.h + bob;
        const kz = f.z + sway;
        q.setFromEuler(e.set(0, Math.PI / 2, sway * 0.6));
        m4.compose(p.set(kx, ky, kz), q, one);
        kites.setMatrixAt(k, m4);
        stringPos.set([f.x, 0.3, f.z, kx, ky - 0.2, kz], k * 6);
      });
      kites.instanceMatrix.needsUpdate = true;
      (strings.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    },
    dispose() {
      parent.remove(group);
      shape.dispose();
      (kites.material as THREE.Material).dispose();
      strings.geometry.dispose();
      (strings.material as THREE.Material).dispose();
    },
  };
}
