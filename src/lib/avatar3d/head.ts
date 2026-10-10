// Builds the whole head (skin, face, eyes, brows, ears, glasses, facial hair, headwear) from a recipe.
// Hair will be added by the hair module.

import { Matrix4 } from "three";
import { brows, eyes, glasses } from "./eyes.ts";
import { ears } from "./ears.ts";
import { facePatch, headSkin } from "./face.ts";
import { facialHair } from "./facial-hair.ts";
import { headwear } from "./headwear.ts";
import { headCtx } from "./head-shape.ts";
import { type Model, ROOT } from "./parts.ts";
import type { Recipe } from "./recipe.ts";

/** Level of detail: 1 for your own avatar, 0.5 for players nearby. */
export function buildHead(recipe: Recipe, lod = 1): Model {
  const c = headCtx(recipe, lod);
  const I = new Matrix4().toArray();
  const e = eyes(c), b = brows(c);
  return {
    nodes: [{ id: ROOT, parent: null, matrix: I }, { id: "jaw", parent: ROOT, matrix: I }, ...e.nodes, ...b.nodes],
    parts: [headSkin(c), ...facePatch(c), ...e.parts, ...b.parts, ...ears(c), ...glasses(c), ...facialHair(c), ...headwear(c)],
    meta: { faceH: c.F.h },
  };
}
