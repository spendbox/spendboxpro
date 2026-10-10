// Web Worker: builds avatar meshes off the main thread so the page never stutters.
// Receives { id, recipe, lod }, replies { id, packed } (or { id, error }).

import { buildHead } from "./head.ts";
import { pack } from "./parts.ts";
import { cleanRecipe } from "./recipe.ts";

type Req = { id: number; recipe: Record<string, number>; lod: number };

self.onmessage = (ev: MessageEvent<Req>) => {
  const { id, recipe, lod } = ev.data;
  try {
    const { packed, transfer } = pack(buildHead(cleanRecipe(recipe), lod));
    (self as unknown as Worker).postMessage({ id, packed }, transfer);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: String(e) });
  }
};
