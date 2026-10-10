// Bottoms (BOTTOMS, and the trousers under suits and robes): the hips and legs as real garments, with a
// waistband, fly, pockets and hems; skin below a hem; skirts and the wrapper hanging from the waist.

import { type BufferGeometry, Vector3 } from "three";
import { CROTCH_Y, crInterp, limbGeo, sheetGeo, torsoGeo } from "./body.ts";
import { type Dress, hangGeo, lerp } from "./clothing.ts";
import { PI, smax, smooth } from "./math.ts";
import { ellGeo } from "./parts.ts";

/** The legs as built by avatar.ts: their profile and the helpers that shape them. */
export type Legs = {
  /** Radius profile [radius, y] in the leg's own frame (top of leg at 0, y down). */
  pts: [number, number][];
  /** Front/back squash at each height. */
  squash: (y: number) => [number, number];
  /** Carries the buttocks on over the backs of the thighs. */
  glutes: (g: BufferGeometry, side: number) => BufferGeometry;
  /** Where the leg meets the hips (its frame's y), and where the ankle is. */
  jy: number;
  ankle: number;
  kneeY: number;
  kneeR: number;
};

/** How far the cloth on the hips stands off the skin (the legs match it where they meet). */
const HIP_OFF = 0.02;

/** Radius of the bare leg at height y (straight lines between the profile points). */
function legR(L: Legs, y: number) {
  const p = L.pts;
  for (let k = 0; k < p.length - 1; k++) {
    const [r0, y0] = p[k], [r1, y1] = p[k + 1];
    if (y <= y0 && y >= y1) return lerp(r0, r1, (y0 - y) / (y0 - y1 || 1));
  }
  return p[p.length - 1][0];
}

/** The hips' garment: pelvis cloth, waistband, fly, and back pockets on jeans and shorts. */
export function pelvisWear(d: Dress) {
  const { T, lod, add, look } = d, b = look.bottom!, mat = look.bottomMat, dark = mat === "jeans" ? "jeansDark" : "bottomDark";
  const skirt = b.kind === "skirt";
  // (Under a skirt the hips are hidden: fewer triangles.)
  add("pelvis", "body", torsoGeo(T, lod, skirt ? -6.2 : -5.7, CROTCH_Y, skirt ? -0.01 : HIP_OFF, skirt ? 8 : 18, skirt ? 24 : 44), skirt ? "bottom" : mat);
  if (skirt) return;
  add("waistband", "body", torsoGeo(T, lod, -5.72, -5.98, HIP_OFF + 0.025, 3, 44), b.cuff ? mat : dark);
  if (b.kind === "leggings") return;
  // Fly: a stitched strip down the front.
  add("fly", "body", sheetGeo(T, lod, 2, 6, HIP_OFF + 0.012, (u, v) => [lerp(-5.98, -6.95, v), lerp(0.04, 0.1, u)]), dark);
  if (b.pockets) {
    for (const sx of [-1, 1]) {
      add(`backPocket${sx > 0 ? 1 : 0}`, "body", sheetGeo(T, lod, 5, 5, HIP_OFF + 0.015, (u, v) => {
        const a = PI - sx * lerp(0.28, 0.85, u);
        return [lerp(-6.15, -6.75 - 0.08 * Math.sin(PI * u), v), a];
      }), dark);
    }
  }
  // Belt loops on jeans and trousers, where they show (under a crop top; other tops hang over them).
  if (!b.cuff && !b.native && look.top?.crop) {
    for (const a of [0.55, 1.35, PI - 0.4, PI + 0.4, 2 * PI - 1.35, 2 * PI - 0.55]) {
      const p = T.P(-5.85, a, HIP_OFF + 0.04);
      add(`beltLoop${Math.round(a * 100)}`, "body", ellGeo(0.025, 0.13, 0.015, 6, lod, p), dark, "closed");
    }
  }
}

/** One leg: the garment down to its hem, and bare skin below it. */
export function legWear(d: Dress, L: Legs, side: number, node: string, lod: number) {
  const { add, look } = d, b = look.bottom;
  const skin = (from: number) => {
    const pts: [number, number][] = [[legR(L, from) * 0.97, from], ...L.pts.filter(([, y]) => y < from - 0.02)];
    return L.glutes(limbGeo(pts, 18, lod, null, L.squash), side);
  };
  if (!b || b.kind === "skirt") {
    // Under a long skirt only the ankles show: the legs can be much coarser.
    const hidden = b?.kind === "skirt" && (b.hem ?? 0) < -11.5;
    add(`${node}Skin`, node, L.glutes(limbGeo(L.pts, hidden ? 8 : 18, hidden ? lod * 0.5 : lod, null, L.squash), side), "skin");
    return;
  }
  // How far the hem is down: trousers to the top of the shoe, shorts above the knee.
  const hemY = b.kind === "shorts" ? L.jy - (b.hem ?? 2.4) : b.kind === "leggings" ? L.ankle + 0.05 : L.ankle - 0.2;
  const fit = b.fit ?? 0.1, straight = L.kneeR + fit;
  const ease = (y: number) => {
    const r = legR(L, y);
    if (b.kind === "leggings") return r + fit;
    // Hugs the hip, falls straight from the thigh down past the knee (a straight leg)...
    let g = r + HIP_OFF + 0.35 * fit * smooth((L.jy - y) / 1.5);
    if (b.kind !== "shorts") g = smax(g, straight, 0.25);
    // ...and joggers and sokoto gather in at the ankle.
    if (b.cuff) g = lerp(g, r + 0.05, smooth((y - (L.ankle + 1.1)) / -0.9));
    return g;
  };
  const pts: [number, number][] = L.pts.filter(([, y]) => y > hemY + 0.05).map(([, y]) => [ease(y), y]);
  // Extra rows down the leg so the straight fall keeps its shape.
  for (let y = L.jy - 0.5; y > hemY + 0.1; y -= 0.6) if (!pts.some(([, py]) => Math.abs(py - y) < 0.2)) pts.push([ease(y), y]);
  pts.sort((p, q) => q[1] - p[1]);
  pts[0][0] = 0; // the garment's top is closed off inside the hips, like the leg's
  // The hem turns in to the leg, showing the cloth's thickness (round the ankle for full-length legs).
  const inner = Math.max(legR(L, hemY), 0.24) + 0.008;
  pts.push([Math.max(ease(hemY), inner + 0.01), hemY], [inner, hemY - 0.004]);
  add(`${node}Wear`, node, L.glutes(limbGeo(pts, 18, lod, null, L.squash), side), look.bottomMat);
  if (b.cuff) add(`${node}Cuff`, node, limbGeo([[legR(L, hemY + 0.25) + 0.065, hemY + 0.28], [legR(L, hemY) + 0.06, hemY + 0.02], [legR(L, hemY) + 0.012, hemY - 0.005]], 18, lod, null, L.squash), look.bottomMat === "jeans" ? "jeansDark" : "bottomDark");
  if (b.kind === "shorts") add(`${node}Skin`, node, skin(hemY + 0.25), "skin");
}

/** Skirts and the wrapper (iro): hung from the waist; the wrapper has an overlapping front panel and a tucked knot. */
export function skirtWear(d: Dress) {
  const { T, lod, add, look } = d, b = look.bottom!, hipR = crInterp(T.L, T.X, -7.05);
  const mat = b.native ? "bottomPatDS" : "bottomDS";
  // Under a top that hangs over the waist the skirt starts out of sight beneath it; a crop top shows its waistband.
  const shown = !!look.top?.crop || !look.top, y0 = shown ? -5.6 : Math.max((look.top?.hem ?? -6.2) + 0.3, -5.95);
  add("skirt", "body", hangGeo(T, lod, y0, b.hem ?? -9, shown ? 0.04 : 0.03, (t) => hipR * (b.flare ?? 0.2) * t ** 1.2, b.wrap ? 20 : 16, 44, y0 - 0.2), mat);
  if (shown) add("skirtBand", "body", torsoGeo(T, lod, -5.58, -5.85, 0.06, 3, 44), b.native ? "bottomPat" : "bottomDark");
  if (b.wrap) {
    // The wrapper's end crosses the front and is tucked in at the waist with a knot.
    add("wrapPanel", "body", sheetGeo(T, lod, 8, 18, 0, (u, v) => {
      const y = lerp(-5.62, b.hem ?? -13, v), a = lerp(-0.25, 0.9, u) + 0.25 * v;
      return [y, a];
    }, (y, th) => {
      const p = T.P(Math.max(y, -7.05), th, 0.09), r = Math.hypot(p.x, p.z);
      // Below the hips it falls straight, like the skirt under it.
      const q = T.P(Math.max(-7.05, y), th, 0.09), rr = Math.max(r, Math.hypot(q.x, q.z)) + hipR * (b.flare ?? 0.2) * smooth((-5.6 - y) / 7.5) ** 1.2;
      return new Vector3((p.x / r) * rr, y, (p.z / r) * rr);
    }), mat);
    add("wrapKnot", "body", ellGeo(0.16, 0.12, 0.1, 10, lod, T.P(-5.7, 0.95, 0.14)), b.native ? "bottomPat" : "bottom", "closed");
  }
}
