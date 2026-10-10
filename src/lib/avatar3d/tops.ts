// Tops worn as separates (TOPS): the cloth on the torso and its neckline, cut (crop, tank), collar,
// buttons, knit ribbing and native embroidery. Sleeves are made with the arms (clothing.ts armClothes);
// the hood and kangaroo pocket with the outfit pieces (robes).

import { drapePoint, sheetGeo, torsoGeo } from "./body.ts";
import type { TopStyle } from "./catalog.ts";
import { type Dress, collarGeo, hangGeo, lerp, neckLineFn, ribbonGeo } from "./clothing.ts";
import { PI, clamp01, smax, smooth } from "./math.ts";
import { ellGeo } from "./parts.ts";

/** How far a top stands off the skin at height y: looser tops further, and more below the chest (it hangs). */
export const topOff = (top: TopStyle | null, y: number) => 0.02 + (top?.loose ?? 0) + 0.07 * smooth((-5.3 - y) / 0.9);

/** Angle round the body measured from the front centre (0) to the back (PI). */
const fromFront = (th: number) => Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));

/**
 * The top edge of the cloth at angle th for necklines cut below the neck: scoop, V and boat necks,
 * and a tank top's armholes (straps over the shoulders between them). null for necklines that go up
 * to the neck (crew, collars).
 */
function topEdge(top: TopStyle): ((th: number) => number) | null {
  const neck = top.neck ?? "crew";
  if (!top.tank && (neck === "crew" || neck === "collar" || neck === "mandarin")) return null;
  return (th) => {
    const a = fromFront(th), side = Math.abs(Math.sin(th)), front = a < PI / 2;
    // (Never quite at the top of the torso, where its surface turns sharply into the neck.)
    const T0 = -1.4;
    let y = T0;
    if (neck === "scoop") y = front ? lerp(T0, -1.95, smooth((0.62 - a) / 0.5)) : lerp(T0, -1.58, smooth((a - PI + 0.62) / 0.5));
    if (neck === "v") y = front ? lerp(-2.55, T0, smooth(a / 0.62)) : T0;
    if (neck === "boat") y = lerp(T0, front ? -1.55 : -1.5, smooth((1.15 - Math.min(a, PI - a)) / 0.9));
    // Tank top: armholes cut down under the arms, leaving straps over the shoulders.
    // (A smooth minimum: the neckline rounds into the armhole instead of meeting it in a corner.)
    if (top.tank) y = -smax(-y, -lerp(T0, -2.5, smooth((side - 0.45) / 0.5)), 0.15);
    return y;
  };
}

export function buildTop(d: Dress, top: TopStyle) {
  // A long top (tunic length) is fitted to the hips, then hangs (it doesn't follow the body in at the crotch).
  const { T, lod, add } = d, full = top.hem ?? -6.2, hem = Math.max(full, -6.3), edge = topEdge(top), off = (y: number) => topOff(top, y);
  const drape = (y: number, th: number) => drapePoint(T, y, th, off(y), hem);
  // Skin shows where the top doesn't reach (open necklines, armholes, a bare midriff).
  // (Never coarser than the top over it, or the two would cross.)
  if (edge || top.crop) add("torsoSkin", "chest", torsoGeo(T, lod < 0.1 ? 0.25 : lod, -1.3, -5.95, lod < 0.3 ? -0.06 : -0.02, 20, 22), "skin");
  if (edge) {
    // (Many columns, few rows: the cut edge needs the columns to stay clean, the drop is smooth.)
    // (A V neck needs enough columns across its point even on other players.)
    const vee = top.neck === "v";
    add("torso", "chest", sheetGeo(T, vee && lod >= 0.5 ? Math.max(lod, 0.75) : Math.max(lod, 0.25), 64, vee ? 16 : 22, 0, (u, v) => {
      const th = u * PI * 2;
      return [lerp(edge(th), hem, v ** 1.4), th];
    }, (y, th) => drape(y, th)), "top");
    // The cut edge is bound with a narrow band.
    const path: [number, number][] = [];
    for (let k = 0; k <= 72; k++) path.push([edge((k / 72) * PI * 2) - 0.02, (k / 72) * PI * 2]);
    add("neckBand", "chest", ribbonGeo(T, path, topOff(top, -1.5) + 0.012, 0.03), top.knit ? "rib" : "topEdgeDS");
  } else {
    add("torso", "chest", torsoGeo(T, lod, -1.3, hem, off, 40, 36, true), "top");
    const neck = top.neck ?? "crew", o = off(-1.4);
    const c = collarGeo(d, o, neck === "mandarin" ? 0.24 : 0.09);
    if (c) add("collar", "chest", c, neck === "crew" ? "rib" : top.trim === "senator" ? "embroid" : "top");
    if (neck === "collar") shirtCollar(d, o, "top");
  }
  if (full < hem) {
    add("topTail", "chest", hangGeo(T, lod, hem + 0.15, full, off(hem), (t) => 0.12 * t, 8, 40), "topDS");
    if (top.trim === "dashiki") {
      // Embroidered border round the hem, following the tail's flare.
      const k = 1 - 0.32 / (hem + 0.15 - full);
      add("hemBorder", "chest", hangGeo(T, lod, full + 0.32, full, off(hem) + 0.015, (t) => 0.12 * (k + (1 - k) * t), 2, 40), "embroid");
    }
  }
  // Knit hem (sweaters, hoodies), or a neat hem band on a crop top.
  if (top.knit || top.crop) add("hemBand", "chest", torsoGeo(T, lod, hem + (top.knit ? 0.3 : 0.12), hem, (y) => off(y) + 0.012, 3, 36), top.knit ? "rib" : "topEdge");
  if (top.buttons) {
    // Button placket down the front (a polo's is short).
    const end = top.sl === "short" ? -2.7 : hem + 0.1, start = edge ? edge(0) : -1.45;
    add("placket", "chest", sheetGeo(T, lod, 2, 14, 0, (u, v) => [lerp(start, end, v), lerp(-0.04, 0.04, u)], (y, th) => drapePoint(T, y, th, off(y) + 0.012, hem)), "topEdge");
    // (Buttons only up close: on other players they are too small to see.)
    const n = lod < 1 ? 0 : top.sl === "short" ? 3 : 6;
    for (let b = 0; b < n; b++) {
      const y = lerp(start - 0.15, end + 0.2, b / (n - 1));
      add(`button${b}`, "chest", ellGeo(0.04, 0.04, 0.02, 8, lod, drapePoint(T, y, 0, off(y) + 0.03, hem)), "trim", "closed");
    }
  }
  if (top.trim === "dashiki") {
    // Dashiki: the embroidered yoke round the V neck, and an embroidered hem border.
    add("yoke", "chest", sheetGeo(T, lod, 30, 12, 0, (u, v) => {
      const th = lerp(-1.25, 1.25, u), a = Math.abs(th), y0 = edge!(th);
      // (Kept just below the top of the torso, where its surface direction is reliable.)
      return [Math.min(y0 - 0.02, -1.38) - v * lerp(0.55, 0.3, clamp01(a / 1.25)), th];
    }, (y, th) => drape(y, th).addScaledVector(T.N(y, th), 0.012)), "embroid");
  }
  if (top.trim === "senator") {
    // Senator: an embroidered band down the front, beside the buttons, to mid-chest.
    add("frontEmbroidery", "chest", sheetGeo(T, lod, 2, 10, 0, (u, v) => [lerp(-1.55, -3.6, v), lerp(0.1, 0.2, u)], (y, th) => drapePoint(T, y, th, off(y) + 0.012, hem)), "embroid");
    for (let b = 0; b < 5; b++) {
      const y = lerp(-1.65, -3.4, b / 4);
      add(`button${b}`, "chest", ellGeo(0.035, 0.035, 0.02, 8, lod, drapePoint(T, y, 0, off(y) + 0.025, hem)), "gold", "closed");
    }
  }
}

/**
 * A shirt collar: the band round the neck (collarGeo) and two pointed flaps folded down onto the
 * chest, meeting at the front. off: the cloth's offset from the skin.
 */
export function shirtCollar(d: Dress, off: number, mat: "top" | "layer" | "shirt") {
  const { T, lod, add } = d, line = neckLineFn(d, off);
  for (const sx of [-1, 1]) {
    add(`collarFlap${sx > 0 ? 1 : 0}`, "chest", sheetGeo(T, lod, 12, 3, off + 0.03, (u, v) => {
      const a = lerp(0.05, 1.6, u), depth = lerp(0.42, 0.2, smooth(a / 1.2));
      return [Math.min(line(sx * a) + 0.04, -1.31) - v * depth, sx * a];
    }), mat === "top" ? "topDS" : mat === "layer" ? "layerDS" : "collarWhite");
  }
}
