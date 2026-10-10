// Shape tests for hair, and for caps worn over it. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";

import { buildHead } from "../head.ts";
import { CATALOGS, DEFAULT_RECIPE } from "../recipe.ts";
import { layerGaps, nonFinite, part, windingAgreement } from "./geometry-checks.ts";

const HAIRS = CATALOGS.hair.length, from = new Vector3(0, -0.1, 0);
const scalp = (name: string) => /^hair\d$/.test(name);

test("every hairstyle builds without broken numbers, alone and under each headwear", () => {
  for (let hair = 0; hair < HAIRS; hair++) {
    for (let hw = 0; hw < CATALOGS.hw.length; hw++) {
      for (const lod of [1, 0.5]) assert.deepEqual(nonFinite(buildHead({ ...DEFAULT_RECIPE, hair, hw }, lod)), [], `hair ${hair} hw ${hw} lod ${lod}`);
    }
  }
});

test("hair has no folds and its scalp shells face outward", () => {
  for (let hair = 1; hair < HAIRS; hair++) {
    for (const lod of [1, 0.5]) {
      const m = buildHead({ ...DEFAULT_RECIPE, hair }, lod);
      for (const p of m.parts) assert.ok(windingAgreement(p.geo) >= 0.999, `${p.name} (hair ${hair}, lod ${lod}) has folded triangles`);
      for (const p of m.parts.filter((q) => scalp(q.name))) {
        const P = p.geo.attributes.position, N = p.geo.attributes.normal, a = new Vector3(), b = new Vector3();
        let s = 0;
        for (let j = 0; j < P.count; j++) s += b.fromBufferAttribute(N, j).dot(a.fromBufferAttribute(P, j).sub(from).normalize());
        assert.ok(s / P.count > 0.5, `${p.name} (hair ${hair}) faces into the head`);
      }
    }
  }
});

test("hair stays clear of the skin", () => {
  for (let hair = 1; hair < HAIRS; hair++) {
    for (const face of [{}, { face: 6, fat: 3 }, { face: 4, fat: 0, frame: 1 }]) {
      const m = buildHead({ ...DEFAULT_RECIPE, ...face, hair }, 1), skin = [part(m, "headSkin")];
      for (const p of m.parts.filter((q) => scalp(q.name) || q.name === "hairFall")) {
        const worst = Math.min(...layerGaps(p.geo.attributes.position as never, skin, from, 600));
        assert.ok(worst >= 0.003, `${p.name} comes within ${worst.toFixed(4)} of the skin (hair ${hair}, ${JSON.stringify(face)})`);
      }
    }
  }
});

test("caps sit outside the hair under them", () => {
  for (let hair = 1; hair < HAIRS; hair++) {
    for (const [hw, cap] of [[1, "capCrown"], [4, "kufi"], [5, "fila"]] as const) {
      const m = buildHead({ ...DEFAULT_RECIPE, hair, hw }, 1), under = m.parts.filter((q) => scalp(q.name));
      if (!under.length) continue;
      const worst = Math.min(...layerGaps(part(m, cap).geo.attributes.position as never, under, from, 800));
      assert.ok(worst >= 0.003, `${cap} comes within ${worst.toFixed(4)} of the hair (hair ${hair})`);
    }
  }
});

test("the cap's peak faces up and sticks out in front", () => {
  const m = buildHead({ ...DEFAULT_RECIPE, hw: 1 }, 1), g = part(m, "capVisor").geo, N = g.attributes.normal, P = g.attributes.position;
  let up = 0, front = 0;
  for (let i = 0; i < N.count; i++) {
    up += N.getY(i);
    front = Math.max(front, P.getZ(i));
  }
  assert.ok(up / N.count > 0.3, "cap peak's top faces down");
  assert.ok(front > 0.9, "cap peak doesn't reach out past the forehead");
});
