// Shape tests for facial hair and headwear. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";

import { buildHead } from "../head.ts";
import { type Part, triangleCount } from "../parts.ts";
import { CATALOGS, DEFAULT_RECIPE, type Recipe } from "../recipe.ts";
import { layerGaps, morphed, nonFinite, part, windingAgreement } from "./geometry-checks.ts";

const FACIAL = /^(stubble|mustache|goatee|beard)$/;
const SHELLS = /^(capCrown|kufi|fila|wrap|hijab)$/;
const from = new Vector3(0, -0.1, 0);

/** A part's geometry with blend shape k applied (so layer checks can compare moving surfaces). */
const posed = (p: Part, k?: number): Part => {
  const geo = p.geo.clone();
  geo.setAttribute("position", morphed(p.geo, k));
  return { ...p, geo };
};

/** Recipes that stress the face: plain, wide full lips, and slim heart-shaped with thin lips. */
const FACES: Partial<Recipe>[] = [{}, { lips: 7, face: 6, fat: 3, chin: 4 }, { lips: 2, face: 3, fat: 0, chin: 2, frame: 1 }];

test("every facial hair and headwear option builds without broken numbers", () => {
  for (const k of ["facial", "hw", "hwC", "pattern"] as const) {
    for (let i = 0; i < CATALOGS[k].length; i++) {
      for (const lod of [1, 0.5]) {
        for (const hair of [0, 4]) assert.deepEqual(nonFinite(buildHead({ ...DEFAULT_RECIPE, hair, [k]: i }, lod)), [], `${k}=${i} lod ${lod}`);
      }
    }
  }
});

test("facial hair and headwear face outward", () => {
  for (const [k, n] of [["facial", CATALOGS.facial.length], ["hw", CATALOGS.hw.length]] as const) {
    for (let i = 1; i < n; i++) {
      for (const lod of [1, 0.5]) {
        const m = buildHead({ ...DEFAULT_RECIPE, [k]: i }, lod);
        for (const p of m.parts.filter((q) => FACIAL.test(q.name) || SHELLS.test(q.name) || /^(cap|tie|gele|fila|hijab)/.test(q.name))) {
          assert.ok(windingAgreement(p.geo) >= 0.999, `${p.name} (${k}=${i}, lod ${lod}) has folded triangles`);
        }
        // Shells over the head point away from it (lit from outside).
        for (const p of m.parts.filter((q) => FACIAL.test(q.name) || SHELLS.test(q.name))) {
          const P = p.geo.attributes.position, N = p.geo.attributes.normal, a = new Vector3(), b = new Vector3();
          let s = 0;
          for (let j = 0; j < P.count; j++) s += b.fromBufferAttribute(N, j).dot(a.fromBufferAttribute(P, j).sub(from).normalize());
          assert.ok(s / P.count > 0.5, `${p.name} (${k}=${i}) faces into the head`);
        }
        const drape = m.parts.find((q) => q.name === "hijabDrape");
        if (drape) {
          const P = drape.geo.attributes.position, N = drape.geo.attributes.normal, r = new Vector3();
          let s = 0, n2 = 0;
          for (let j = 0; j < P.count; j++) {
            r.set(P.getX(j), 0, P.getZ(j) + 0.06);
            if (r.length() < 0.2) continue;
            s += new Vector3().fromBufferAttribute(N, j).dot(r.normalize());
            n2++;
          }
          assert.ok(s / n2 > 0.5, "hijab drape faces inward");
        }
      }
    }
  }
});

test("facial hair stays clear of the skin and face in every mouth shape", () => {
  for (const face of FACES) {
    for (let f = 1; f < CATALOGS.facial.length; f++) {
      const m = buildHead({ ...DEFAULT_RECIPE, ...face, facial: f }, 1);
      for (const k of [undefined, 0, 1, 2, 3]) {
        const under = [part(m, "headSkin"), posed(part(m, "faceLower"), k), posed(part(m, "faceUpper"), k)];
        for (const p of m.parts.filter((q) => FACIAL.test(q.name))) {
          const gaps = layerGaps(morphed(p.geo, k), under, from, 600);
          const worst = Math.min(...gaps);
          assert.ok(worst >= 0.002, `${p.name} comes within ${worst.toFixed(4)} of the face (facial ${f}, shape ${k ?? "rest"}, ${JSON.stringify(face)})`);
        }
      }
    }
  }
});

test("headwear stays clear of the skin", () => {
  for (let w = 1; w < CATALOGS.hw.length; w++) {
    for (const face of FACES) {
      const m = buildHead({ ...DEFAULT_RECIPE, ...face, hw: w }, 1), skin = [part(m, "headSkin")];
      for (const p of m.parts.filter((q) => SHELLS.test(q.name))) {
        const worst = Math.min(...layerGaps(p.geo.attributes.position as never, skin, from, 600));
        // Caps keep 0.004 off the skin at their edges by design.
        assert.ok(worst >= 0.003, `${p.name} comes within ${worst.toFixed(4)} of the skin (hw ${w})`);
      }
    }
  }
});

test("hijab hides the ears; other headwear keeps them", () => {
  assert.ok(!buildHead({ ...DEFAULT_RECIPE, hw: 6 }, 1).parts.some((p) => p.name.startsWith("ear")));
  assert.ok(buildHead({ ...DEFAULT_RECIPE, hw: 1 }, 1).parts.some((p) => p.name === "ear0"));
});

test("head with the heaviest extras stays within budget", () => {
  // Box braids, a cap, a full beard, sunglasses and all the jewellery: the heaviest head there is. The
  // whole avatar's budget is 70k (own) / 20k (nearby), so this leaves about 22k / 7k for the body
  // (body.test.ts checks the whole avatar).
  const busy = { ...DEFAULT_RECIPE, hair: 8, hw: 1, facial: 5, glasses: 3, ear: 3, pierce: 6 };
  const full = triangleCount(buildHead(busy, 1)), near = triangleCount(buildHead(busy, 0.5));
  assert.ok(full <= 48000, `own avatar's head with extras is ${full} triangles (limit 48k)`);
  assert.ok(near <= 13500, `nearby player's head with extras is ${near} triangles (limit 13.5k)`);
});
