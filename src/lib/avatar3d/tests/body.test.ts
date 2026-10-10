// Shape tests for the body, clothes and body jewellery. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { type BufferAttribute, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";

import { buildAvatar } from "../avatar.ts";
import { buildHead } from "../head.ts";
import { type Model, type Part, triangleCount } from "../parts.ts";
import { CATALOGS, DEFAULT_RECIPE, type Recipe } from "../recipe.ts";
import { nonFinite, signedVolume, windingAgreement } from "./geometry-checks.ts";

const BODY_KEYS = ["build", "frame", "bust", "butt", "height", "outfit", "top", "pattern", "bottom", "watch", "chain"] as const;

/** The parts that belong to the body (everything the head builder didn't make). */
function bodyParts(m: Model, r: Recipe, lod: number): Part[] {
  const head = new Set(buildHead(r, lod).parts.map((p) => p.name));
  return m.parts.filter((p) => !head.has(p.name));
}

test("every body, clothing and jewellery option builds without broken numbers", () => {
  for (const k of BODY_KEYS) {
    for (let i = 0; i < CATALOGS[k].length; i++) {
      for (const lod of [1, 0.5]) {
        for (const frame of [0, 1]) {
          const r = { ...DEFAULT_RECIPE, frame, [k]: i };
          assert.deepEqual(nonFinite(buildAvatar(r, lod)), [], `${k}=${i} frame ${frame} lod ${lod}`);
        }
      }
    }
  }
});

test("body and clothes face outward with no folded triangles", () => {
  for (const k of BODY_KEYS) {
    for (let i = 0; i < CATALOGS[k].length; i++) {
      for (const lod of [1, 0.5]) {
        for (const frame of [0, 1]) {
          const r = { ...DEFAULT_RECIPE, frame, [k]: i }, m = buildAvatar(r, lod);
          for (const p of bodyParts(m, r, lod)) {
            assert.ok(windingAgreement(p.geo) >= 0.999, `${p.name} (${k}=${i}, frame ${frame}, lod ${lod}) has folded triangles`);
            if (p.surface === "closed") assert.ok(signedVolume(p.geo) > 0, `${p.name} (${k}=${i}, frame ${frame}, lod ${lod}) is inside out`);
          }
        }
      }
    }
  }
});

/**
 * How far each sampled vertex of a layer sits outside the surfaces under it, measured straight out
 * from the body's centre line at the vertex's height (the torso and hips are round that line).
 */
function gapsOver(layer: BufferAttribute, under: Part[], samples = 250): number[] {
  const meshes = under.map((p) => new Mesh(p.geo, new MeshBasicMaterial({ side: DoubleSide })));
  const ray = new Raycaster(), p = new Vector3(), o = new Vector3(), dir = new Vector3(), gaps: number[] = [];
  const step = Math.max(1, Math.floor(layer.count / samples));
  for (let i = 0; i < layer.count; i += step) {
    p.fromBufferAttribute(layer, i);
    o.set(0, p.y, 0);
    dir.subVectors(p, o);
    const dist = dir.length();
    if (dist < 0.05) continue;
    ray.set(o, dir.normalize());
    ray.far = dist + 0.3;
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) continue;
    let best = Infinity;
    for (const h of hits) if (Math.abs(dist - h.distance) < Math.abs(best)) best = dist - h.distance;
    gaps.push(best);
  }
  return gaps;
}

test("clothes and jewellery sit clear of what they cover (no flickering where they touch)", () => {
  // [recipe, layer parts, parts underneath, smallest allowed gap]
  const cases: [Partial<Recipe>, RegExp, RegExp, number][] = [
    [{ outfit: 12, frame: 1 }, /^swimBottom$/, /^pelvis$/, 0.02],
    [{ outfit: 12, frame: 1, bust: 4 }, /^swimCup/, /^torso$/, 0.015],
    [{ outfit: 12, frame: 0 }, /^swimBottom$/, /^pelvis$/, 0.02],
    [{ outfit: 10 }, /^(shirtFront|lapel|tie)/, /^torso$/, 0.02],
    [{ outfit: 2 }, /^(hood|pocket)$/, /^torso$/, 0.015],
    [{ outfit: 8, frame: 1 }, /^collar\d/, /^torso$/, 0.02],
    [{ outfit: 8, frame: 1, butt: 3 }, /^skirt$/, /^pelvis$/, 0.02],
    [{ outfit: 11, frame: 1, butt: 3 }, /^(pencilSkirt|blazerTail)$/, /^pelvis$/, 0.02],
    [{ outfit: 5, frame: 1, butt: 3 }, /^dressSkirt$/, /^pelvis$/, 0.02],
    [{ outfit: 3 }, /^tunic$/, /^pelvis$/, 0.02],
    [{ chain: 1 }, /^chain0$/, /^torso$/, 0.01],
    [{ chain: 4, frame: 1, bust: 4 }, /^chain0$/, /^torso$/, 0.01],
    [{ chain: 6, outfit: 10 }, /^chain/, /^torso$/, 0.01],
    [{ chain: 5, frame: 1, bust: 4 }, /^(pendant|pendantGem)$/, /^torso$/, 0.005],
  ];
  for (const [extra, layerRe, underRe, min] of cases) {
    for (const lod of [1, 0.5]) {
      const m = buildAvatar({ ...DEFAULT_RECIPE, ...extra }, lod), under = m.parts.filter((p) => underRe.test(p.name));
      const layers = m.parts.filter((p) => layerRe.test(p.name));
      assert.ok(layers.length && under.length, `${JSON.stringify(extra)}: missing ${layerRe} or ${underRe}`);
      for (const L of layers) {
        const gaps = gapsOver(L.geo.attributes.position as BufferAttribute, under);
        const worst = Math.min(...gaps);
        assert.ok(gaps.length > 0 && worst >= min, `${L.name} (${JSON.stringify(extra)}, lod ${lod}) comes within ${worst.toFixed(3)} of the ${underRe} (needs ${min})`);
      }
    }
  }
});

test("the whole avatar stays within budget with the heaviest options", () => {
  // The heaviest head (box braids, cap, full beard, sunglasses, all the jewellery) with every outfit,
  // both frames and the heaviest chains. Budgets: 70k for your own avatar, 20k for players nearby.
  const head = { hair: 8, hw: 1, facial: 5, glasses: 3, ear: 3, pierce: 6, watch: 3 };
  let own = 0, near = 0, ownAt = "", nearAt = "";
  for (let outfit = 0; outfit < CATALOGS.outfit.length; outfit++) {
    for (const frame of [0, 1]) {
      for (const chain of [4, 6]) {
        for (const build of [0, 4]) {
          const r = { ...DEFAULT_RECIPE, ...head, outfit, frame, chain, build }, tag = JSON.stringify({ outfit, frame, chain, build });
          const a = triangleCount(buildAvatar(r, 1)), b = triangleCount(buildAvatar(r, 0.5));
          if (a > own) [own, ownAt] = [a, tag];
          if (b > near) [near, nearAt] = [b, tag];
        }
      }
    }
  }
  assert.ok(own <= 70000, `own avatar is ${own} triangles at ${ownAt} (limit 70k)`);
  assert.ok(near <= 20000, `nearby player is ${near} triangles at ${nearAt} (limit 20k)`);
});

test("height moves the feet, not the head", () => {
  // HEIGHTS: 0 average, 3 very short, 4 very tall. The neck stays put (where the face camera looks).
  const floor = (height: number) => buildAvatar({ ...DEFAULT_RECIPE, height }, 1).meta.floorY!;
  assert.ok(Number.isFinite(floor(0)), "floorY is set");
  assert.ok(floor(3) > floor(0) && floor(0) > floor(4), "shorter avatars' feet are higher");
});
