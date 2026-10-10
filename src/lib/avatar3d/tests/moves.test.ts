// Tests for the skeleton, skin weights and moves. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bone, Group, Line3, Matrix4, Raycaster, Vector3 } from "three";

import { buildAvatar } from "../avatar.ts";
import { MOVES, type Rest, applyMove, dims } from "../moves.ts";
import type { Model } from "../parts.ts";
import { DEFAULT_RECIPE, type Recipe } from "../recipe.ts";
import { posedMesh, rigOf } from "./posed.ts";

/** The skeleton as the page builds it (bones only, no materials). */
function skeleton(m: Model) {
  const bones: Record<string, Bone> = {}, root = new Group();
  for (const n of m.nodes) {
    const b = new Bone();
    b.name = n.id;
    new Matrix4().fromArray(n.matrix).decompose(b.position, b.quaternion, b.scale);
    bones[n.id] = b;
  }
  for (const n of m.nodes) (n.parent ? bones[n.parent] : root).add(bones[n.id]);
  const rest: Rest = new Map(Object.values(bones).map((b) => [b.name, { p: b.position.clone(), q: b.quaternion.clone() }]));
  return { bones, root, rest };
}

const BODIES: Partial<Recipe>[] = [{}, { frame: 1, shoes: 4, outfit: 5 }, { build: 6, height: 4 }, { frame: 1, build: 7, height: 3, butt: 4 }];

test("every point of the skinned body has sound weights", () => {
  for (const body of BODIES) {
    const m = buildAvatar({ ...DEFAULT_RECIPE, ...body }, 0.5);
    for (const p of m.parts.filter((q) => q.skinned)) {
      const si = p.geo.attributes.skinIndex, sw = p.geo.attributes.skinWeight;
      assert.ok(si && sw, `${p.name} has skin weights`);
      for (let k = 0; k < sw.count; k++) {
        const sum = sw.getX(k) + sw.getY(k) + sw.getZ(k) + sw.getW(k);
        assert.ok(Math.abs(sum - 1) < 1e-4, `${p.name} point ${k}: weights add up to ${sum}`);
        for (const c of [si.getX(k), si.getY(k), si.getZ(k), si.getW(k)]) assert.ok(c >= 0 && c < m.nodes.length && Number.isInteger(c));
      }
    }
  }
});

test("every move runs for 7 seconds without broken numbers", () => {
  for (const body of BODIES) {
    const m = buildAvatar({ ...DEFAULT_RECIPE, ...body }, 0.5), { bones, root, rest } = skeleton(m);
    for (const mv of MOVES) {
      for (let t = 0; t <= 7; t += 1 / 30) {
        applyMove(bones, rest, mv, t);
        root.updateMatrixWorld(true);
        for (const b of Object.values(bones)) {
          assert.ok(b.matrixWorld.elements.every(Number.isFinite), `${mv.id} at ${t.toFixed(2)}s: bone ${b.name} broke`);
        }
      }
    }
  }
});

test("standing moves keep the feet on the ground, and walking feet never sink through it", () => {
  for (const body of BODIES) {
    const m = buildAvatar({ ...DEFAULT_RECIPE, ...body }, 0.5), { bones, root, rest } = skeleton(m), D = dims(rest);
    for (const mv of MOVES) {
      for (let t = 0; t <= 7; t += 0.1) {
        applyMove(bones, rest, mv, t);
        root.updateMatrixWorld(true);
        for (const i of [0, 1]) {
          const y = bones[`foot${i}`].getWorldPosition(new Vector3()).y;
          assert.ok(y > D.ankle - 0.05, `${mv.id}: ankle ${i} sinks to ${y.toFixed(2)} (rests at ${D.ankle.toFixed(2)})`);
          if (["idle", "wave", "dance", "talk"].includes(mv.id)) assert.ok(Math.abs(y - D.ankle) < 0.05, `${mv.id}: foot ${i} leaves the ground`);
        }
      }
    }
  }
});

test("legs stay inside skirts, dresses and robes as the avatar walks, runs and jumps", () => {
  // [recipe, the garment, whether it is open at the front (a wrapper is wrapped round with an
  // overlapping front edge, so a leg may step forward through that opening)]
  const cases: [Partial<Recipe>, RegExp, boolean?][] = [
    [{ frame: 1, outfit: 6 }, /^abaya$/], [{ outfit: 7 }, /^jalabiya$/], [{ frame: 1, outfit: 5 }, /^dressSkirt$/],
    [{ outfit: 4 }, /^agbada$/], [{ frame: 1, outfit: 0, bottomStyle: 6 }, /^skirt$/], [{ frame: 1, outfit: 0, bottomStyle: 8 }, /^skirt$/, true],
    [{ frame: 1, outfit: 6, build: 6, butt: 4 }, /^abaya$/],
  ];
  const ray = new Raycaster(), dir = new Vector3(), worst: string[] = [];
  for (const [extra, re, openFront] of cases) {
    const m = buildAvatar({ ...DEFAULT_RECIPE, ...extra }, 0.5), { bones, root, rest, skeleton } = rigOf(m);
    const cloth = m.parts.find((p) => re.test(p.name))!, legs = m.parts.filter((p) => /^leg\dSkin$/.test(p.name));
    // The stretch of leg the garment covers: from the crotch to a little above where its hem hangs at rest.
    let hem = Infinity;
    const cp0 = cloth.geo.attributes.position;
    for (let k = 0; k < cp0.count; k++) hem = Math.min(hem, cp0.getY(k));
    for (const mv of MOVES.filter((x) => ["walk", "run", "jump"].includes(x.id))) {
      let out = 0, total = 0;
      for (let t = 0; t < mv.period * (mv.id === "jump" ? 1 : 1); t += mv.period / 12) {
        applyMove(bones, rest, mv, t, m.meta.stride);
        root.updateMatrixWorld(true);
        const c = posedMesh(cloth, skeleton), hips = bones.hips.getWorldPosition(new Vector3());
        for (const [li, leg] of legs.entries()) {
          const lp = posedMesh(leg, skeleton).geometry.attributes.position;
          const H = bones[`thigh${li}`].getWorldPosition(new Vector3()), K = bones[`shin${li}`].getWorldPosition(new Vector3()), A = bones[`foot${li}`].getWorldPosition(new Vector3());
          const seg = new Line3();
          for (let k = 0; k < lp.count; k += 3) {
            const p = new Vector3().fromBufferAttribute(lp, k);
            if (p.y > -7.2 || p.y < hem + 0.8) continue;
            // Poking through: cloth between the leg's own bone and its skin.
            const o1 = seg.set(H, K).closestPointToPoint(p, true, new Vector3()), o2 = seg.set(K, A).closestPointToPoint(p, true, new Vector3());
            const o = o1.distanceTo(p) < o2.distanceTo(p) ? o1 : o2, d = p.clone().sub(o), dist = d.length();
            if (dist < 0.05 || (openFront && p.z - hips.z > Math.abs(p.x - hips.x) * 1.5)) continue;
            ray.set(o, dir.copy(d).normalize());
            // (Deeper than the cloth's own thickness, about 3 mm: shallower than that never shows.)
            ray.far = dist - 0.03;
            total++;
            if (ray.intersectObject(c, false).length > 0) out++;
          }
        }
      }
      if (out > total * 0.01) worst.push(`${JSON.stringify(extra)} ${mv.id}: ${out} of ${total} leg points outside the ${re}`);
    }
  }
  assert.deepEqual(worst, []);
});
