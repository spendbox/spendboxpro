// Tests for the skeleton, skin weights and moves. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bone, Group, Matrix4, Vector3 } from "three";

import { buildAvatar } from "../avatar.ts";
import { MOVES, type Rest, applyMove, dims } from "../moves.ts";
import type { Model } from "../parts.ts";
import { DEFAULT_RECIPE, type Recipe } from "../recipe.ts";

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
