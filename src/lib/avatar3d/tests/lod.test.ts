// Tests for the levels of detail. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { FARTHEST_BUDGET, FAR_BUDGET, MAX_DETAILED, buildFar, pickLevels } from "../lod.ts";
import { MOVES, applyMove } from "../moves.ts";
import { triangleCount } from "../parts.ts";
import { CATALOGS, DEFAULT_RECIPE, type Recipe, randomRecipe } from "../recipe.ts";
import { nonFinite } from "./geometry-checks.ts";
import { rigOf } from "./posed.ts";

/** The heaviest looks: busy heads with every kind of outfit. */
const BUSY: Partial<Recipe>[] = [];
for (const hair of [7, 8, 9, 10]) {
  for (const look of [{ outfit: 4 }, { outfit: 6, frame: 1 }, { outfit: 0, topStyle: 10, layer: 3, bottomStyle: 8, shoes: 4 }, { outfit: 11, frame: 1 }]) {
    BUSY.push({ hair, hw: 1, facial: 5, glasses: 3, ear: 3, pierce: 6, chain: 6, watch: 3, ...look });
  }
}

test("the far and farthest levels stay under budget in one mesh, for the heaviest looks", () => {
  for (const extra of BUSY) {
    for (const [level, budget] of [["far", FAR_BUDGET], ["farthest", FARTHEST_BUDGET]] as const) {
      const m = buildFar({ ...DEFAULT_RECIPE, ...extra }, level), t = triangleCount(m);
      assert.equal(m.parts.length, 1, "one mesh (one draw call)");
      assert.ok(t <= budget, `${level} ${JSON.stringify(extra)}: ${t} triangles (limit ${budget})`);
    }
  }
});

test("no fingers, ears, teeth or jewellery far away; no face at the farthest", () => {
  const r = { ...DEFAULT_RECIPE, chain: 3, watch: 1, ear: 2, pierce: 6, glasses: 1 };
  // The far level's palette names the materials it was painted from: none of the jewellery's.
  for (const level of ["far", "farthest"] as const) {
    const pal = buildFar(r, level).meta.palette!;
    for (const k of ["gold", "chainMetal", "watchBand", "teeth", "nail", "earVC"] as const) assert.ok(!pal.includes(k), `${level} has ${k}`);
  }
  const pal = buildFar(r, "farthest").meta.palette!;
  for (const k of ["sclera", "brow", "skinVC", "glassesFrame", "lidVC"] as const) assert.ok(!pal.includes(k), `farthest has ${k}`);
});

test("every option builds a sound far level", () => {
  for (const k of Object.keys(CATALOGS) as (keyof typeof CATALOGS)[]) {
    for (let i = 0; i < CATALOGS[k].length; i++) for (const level of ["far", "farthest"] as const) {
      const m = buildFar({ ...DEFAULT_RECIPE, [k]: i }, level), g = m.parts[0].geo;
      assert.deepEqual(nonFinite(m), [], `${k}=${i}`);
      const pal = m.meta.palette!, id = g.attributes.matId, sw = g.attributes.skinWeight, si = g.attributes.skinIndex;
      for (let v = 0; v < id.count; v++) {
        assert.ok(id.getX(v) < pal.length, `${k}=${i}: point ${v} has no colour`);
        const sum = sw.getX(v) + sw.getY(v) + sw.getZ(v) + sw.getW(v);
        assert.ok(Math.abs(sum - 1) < 1e-4, `${k}=${i}: point ${v} weights ${sum}`);
        assert.ok(si.getX(v) < m.nodes.length);
      }
    }
  }
});

test("far avatars play every move", () => {
  for (let s = 0; s < 6; s++) {
    let n = 0;
    const r = randomRecipe(() => ((n = (n * 9301 + 49297 + s * 7) % 233280) / 233280)), m = buildFar(r, s % 2 ? "farthest" : "far"), { bones, root, rest } = rigOf(m);
    for (const mv of MOVES) {
      for (let t = 0; t <= 7; t += 0.25) {
        applyMove(bones, rest, mv, t, m.meta.stride);
        root.updateMatrixWorld(true);
        for (const b of Object.values(bones)) assert.ok(b.matrixWorld.elements.every(Number.isFinite), `${mv.id} ${b.name}`);
      }
    }
  }
});

test("only the nearest players get detail; everyone else is drawn at the farthest level", () => {
  const d = Array.from({ length: 100 }, (_, i) => i * 0.5);
  const lv = pickLevels(d);
  assert.equal(lv.filter((l) => l !== "farthest").length, MAX_DETAILED);
  assert.equal(lv[0], "near");
  assert.equal(lv[20], "far");
  assert.equal(lv[99], "farthest");
  assert.deepEqual(pickLevels([2, 50, 10]), ["near", "farthest", "far"]);
});
