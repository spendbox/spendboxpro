// Outer layers (LAYERS): an open-front jacket or cardigan worn over the top. Its sleeves are the arms
// themselves in the jacket's cloth (clothing.ts armClothes), so a layer costs little extra.

import { drapePoint, sheetGeo, torsoGeo } from "./body.ts";
import type { LayerStyle } from "./catalog.ts";
import { type Dress, collarGeo, lerp, neckLineFn, ribbonGeo } from "./clothing.ts";
import { PI, smooth } from "./math.ts";
import { ellGeo } from "./parts.ts";
import { shirtCollar, topOff } from "./tops.ts";

/** How far a layer stands off the skin: clear of the top under it. */
export const layerOff = (d: Dress, y: number) => topOff(d.look.top, y) + 0.08;

export function buildLayer(d: Dress, L: LayerStyle) {
  const { T, lod, add } = d, hem = L.hem ?? -6.2, off = (y: number) => layerOff(d, y);
  const line = neckLineFn(d, off(-1.4));
  // Half-width of the open front at each height: jackets hang open a hand's width; a cardigan's
  // and a blazer's opening narrows from the neck down into a V.
  const open = (y: number) => (L.knit || L.collar === "lapel" ? lerp(0.5, 0.16, smooth((-1.5 - y) / 2.4)) : 0.16);
  const at = (y: number, th: number) => drapePoint(T, y, th, off(y), hem);
  add("layer", "chest", sheetGeo(T, lod, 32, 24, 0, (u, v) => {
    const th = lerp(open(-1.4), 2 * PI - open(-1.4), u);
    const y = lerp(line(th) - 0.02, hem, v);
    // Pull the front edges in line with the opening at each height.
    const o = open(y), th2 = th < PI ? Math.max(th, o) : Math.min(th, 2 * PI - o);
    return [y, th2];
  }, (y, th) => at(y, th)), "layerDS");
  // Collar.
  if (L.collar === "lapel") {
    // Lapels folded back along the opening, wider at the top (notch), down to the top button.
    for (const sx of [-1, 1]) {
      add(`lapel${sx > 0 ? 1 : 0}`, "chest", sheetGeo(T, lod, 4, 14, 0, (u, v) => {
        const y = lerp(-1.42, -3.4, v), o = open(y), w = lerp(0.3, 0.06, smooth(v));
        return [y, sx * (o + u * w)];
      }, (y, th) => at(y, th).addScaledVector(T.N(y, th), 0.025)), "layerTrim");
    }
    const c = collarGeo(d, off(-1.4), 0.16);
    if (c) add("layerCollar", "chest", c, "layerTrim");
  } else if (L.collar === "shirt") {
    const c = collarGeo(d, off(-1.4), 0.14);
    if (c) add("layerCollar", "chest", c, "layer");
    shirtCollar(d, off(-1.4), "layer");
  } else if (L.collar === "band") {
    const c = collarGeo(d, off(-1.4), 0.18);
    if (c) add("layerCollar", "chest", c, "layerRib");
  } else {
    // Cardigan: knit bands along the opening and round the neck.
    for (const sx of [-1, 1]) {
      const path: [number, number][] = [];
      for (let k = 0; k <= 20; k++) {
        const y = lerp(-1.45, hem + 0.05, k / 20);
        path.push([y, sx * (open(y) + 0.02)]);
      }
      add(`layerEdge${sx > 0 ? 1 : 0}`, "chest", ribbonGeo(T, path, off(-3) + 0.012, 0.045), "layerRib");
    }
  }
  // Hem: ribbed on bombers and cardigans.
  if (L.ribbed || L.knit) add("layerHem", "chest", torsoGeo(T, lod, hem + 0.3, hem, (y) => off(y) + 0.015, 3, 36), "layerRib");
  // Buttons down one side of the opening (denim jacket, cardigan, blazer).
  if (lod >= 1 && (L.denim || L.knit || L.collar === "lapel")) {
    const n = L.denim ? 5 : L.knit ? 5 : 2, y0 = L.collar === "lapel" ? -3.6 : -1.9;
    for (let b = 0; b < n; b++) {
      const y = lerp(y0, hem + 0.35, b / (n - 1)), th = -(open(y) + 0.06);
      add(`layerButton${b}`, "chest", ellGeo(0.05, 0.05, 0.025, 8, lod, at(y, th).addScaledVector(T.N(y, th), 0.03)), L.denim ? "gold" : "trim", "closed");
    }
  }
  if (L.denim) {
    // Chest pocket flaps.
    for (const sx of [-1, 1]) {
      add(`layerPocket${sx > 0 ? 1 : 0}`, "chest", sheetGeo(T, lod, 4, 3, 0, (u, v) => [lerp(-2.55, -2.85, v), sx * lerp(0.35, 0.75, u)], (y, th) => at(y, th).addScaledVector(T.N(y, th), 0.02)), "layerTrim");
    }
  }
}
