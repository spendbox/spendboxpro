// Shape tests for the head and face. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Matrix4, Vector3 } from "three";

import { buildHead } from "../head.ts";
import { pack, triangleCount, unpack } from "../parts.ts";
import { CATALOGS, DEFAULT_RECIPE, type Recipe, type RecipeKey, randomRecipe } from "../recipe.ts";
import { layerGaps, morphed, nonFinite, part, signedVolume, windingAgreement } from "./geometry-checks.ts";

/** Recipe keys that change the head. */
const HEAD_KEYS: RecipeKey[] = [
  "face", "chin", "fat", "skin", "eye", "eyeC", "brow", "nose", "lips", "lipT", "hairC", "frame", "build", "ear", "pierce", "glasses", "hw",
];

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** A spread of recipes: the default, every face-shape extreme, and some random ones. */
const SAMPLES: Recipe[] = [
  DEFAULT_RECIPE,
  { ...DEFAULT_RECIPE, face: 3, chin: 2, fat: 0, eye: 6, nose: 6, lips: 2, frame: 1, glasses: 2, ear: 2, pierce: 6 },
  { ...DEFAULT_RECIPE, face: 6, chin: 4, fat: 3, eye: 7, brow: 5, nose: 4, lips: 7, build: 4, glasses: 3, ear: 3 },
  { ...DEFAULT_RECIPE, face: 4, chin: 6, fat: 2, eye: 3, brow: 2, nose: 5, lips: 6, frame: 1, build: 1, glasses: 1 },
  ...Array.from({ length: 6 }, (_, i) => randomRecipe(rng(100 + i))),
];

test("every head option builds without broken numbers", () => {
  for (const k of HEAD_KEYS) {
    for (let i = 0; i < CATALOGS[k].length; i++) {
      const m = buildHead({ ...DEFAULT_RECIPE, [k]: i }, 0.5);
      assert.deepEqual(nonFinite(m), [], `${k}=${i}`);
    }
  }
  for (const r of SAMPLES) assert.deepEqual(nonFinite(buildHead(r, 1)), []);
});

test("all surfaces face outward", () => {
  for (const r of SAMPLES) {
    for (const lod of [1, 0.5]) {
      const m = buildHead(r, lod);
      for (const p of m.parts) {
        const label = `${p.name} (lod ${lod}, face ${r.face}, nose ${r.nose})`;
        assert.ok(windingAgreement(p.geo) >= 0.999, `${label}: triangles wound against their normals`);
        if (p.surface === "closed") assert.ok(signedVolume(p.geo) > 0, `${label}: wound inside out`);
      }
    }
  }
});

test("layers never touch the skin underneath (no flicker)", () => {
  const GAP = 0.002, from = new Vector3(0, -0.1, 0);
  for (const r of SAMPLES.slice(0, 6)) {
    const m = buildHead({ ...r, glasses: r.glasses || 1 }, 1), skin = [part(m, "headSkin")];
    const check = (name: string, gaps: number[]) => {
      const worst = Math.min(...gaps);
      assert.ok(worst >= GAP, `${name} comes within ${worst.toFixed(4)} of the skin (face ${r.face}, lips ${r.lips}, brow ${r.brow})`);
    };
    for (const b of ["brow0", "brow1"]) check(b, layerGaps(morphed(part(m, b).geo), skin, from));
    // The face patch over the skin, at rest and with each mouth blend shape at full strength.
    for (const name of ["faceUpper", "faceLower"]) {
      for (const k of [undefined, 0, 1, 2, 3]) check(`${name} shape ${k ?? "rest"}`, layerGaps(morphed(part(m, name).geo, k), skin, from));
    }
    check("glasses", layerGaps(morphed(part(m, "rim0").geo), [...skin, part(m, "faceUpper")], from));
    // Eyelids stay clear of the eyeball in every lid state.
    for (const i of [0, 1]) {
      const node = m.nodes.find((n) => n.id === `eye${i}`)!, centre = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(node.matrix));
      const sclera = part(m, `sclera${i}`).geo;
      sclera.computeBoundingSphere();
      const er = sclera.boundingSphere!.radius, lids = part(m, `lids${i}`).geo, p = new Vector3();
      for (const k of [undefined, 0, 1, 2]) {
        const pos = morphed(lids, k);
        for (let j = 0; j < pos.count; j++) {
          const d = p.fromBufferAttribute(pos, j).distanceTo(centre);
          assert.ok(d >= er * 1.003, `eyelid ${i} (shape ${k ?? "open"}) touches the eyeball`);
        }
      }
    }
  }
});

test("head stays within its triangle budget", () => {
  const busy = { ...DEFAULT_RECIPE, glasses: 3, ear: 3, pierce: 6 };
  assert.ok(triangleCount(buildHead(busy, 1)) <= 34000, "own avatar's head is over 34k triangles");
  assert.ok(triangleCount(buildHead(busy, 0.5)) <= 12000, "nearby player's head is over 12k triangles");
});

test("a model survives the trip from the worker unchanged", () => {
  const m = buildHead(SAMPLES[1], 0.5), back = unpack(pack(m).packed);
  assert.equal(back.parts.length, m.parts.length);
  assert.deepEqual(back.nodes, m.nodes);
  m.parts.forEach((p, i) => {
    const q = back.parts[i];
    assert.equal(q.name, p.name);
    assert.deepEqual([...q.geo.attributes.position.array], [...p.geo.attributes.position.array]);
    assert.deepEqual([...(q.geo.index?.array ?? [])], [...(p.geo.index?.array ?? [])]);
    assert.equal(q.geo.morphAttributes.position?.length ?? 0, p.geo.morphAttributes.position?.length ?? 0);
  });
});
