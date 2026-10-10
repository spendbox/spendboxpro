// Facial hair: stubble, mustache, goatee, short beard and full beard.
// Each is a shell over the skin whose edges fade into the skin along a smooth line. Beards carry the
// same mouth blend shapes as the face, so they move with it when smiling or talking (the prototype's
// stayed still, and the moving chin and cheeks pushed through them).

import { Float32BufferAttribute } from "three";
import { LIPS } from "./catalog.ts";
import { MOUTH_MORPHS, MOUTH_W, MOUTH_Y } from "./face.ts";
import { type HeadCtx, NP } from "./head-shape.ts";
import { clamp01, smooth } from "./math.ts";
import { type Part, ROOT } from "./parts.ts";
import { type DirFn, type ShellGrid, maskShell, wave } from "./shells.ts";

/** Soft "x is below edge" (1 well below, 0 well above), over a width w. */
const below = (x: number, edge: number, w: number) => smooth((edge - x) / w + 0.5);

/**
 * The bare area around the lips: an oval hugging the lips, a little wider than the mouth. (The
 * prototype kept beards out of a rectangle reaching far below the lower lip, which left a bare patch.)
 */
function lipsArea(c: HeadCtx): DirFn {
  const L = LIPS[c.recipe.lips], hw = MOUTH_W * L.w * 1.08 + 0.02;
  const top = MOUTH_Y + 0.052 * L.up + 0.01, bottom = MOUTH_Y - 0.066 * L.low - 0.012, mid = (top + bottom) / 2, hh = (top - bottom) / 2;
  return (u) => {
    const r = Math.pow(Math.abs(u.x) / hw, 4) + ((u.y - mid) / hh) ** 2;
    // Fully bare a little beyond the lips' outline (r = 1), so hair stops just outside them, never on the lip.
    return smooth((1.4 - r) / 0.3) * smooth((u.z - 0.5) / 0.05);
  };
}

/** Where a beard grows: jaw, chin, cheeks below the cheek line and upper neck; not the lips. */
function beardArea(c: HeadCtx): DirFn {
  const lips = lipsArea(c);
  return (u) => {
    const ax = Math.abs(u.x), al = Math.acos(Math.max(-1, Math.min(1, u.dot(NP))));
    const neck = smooth((al - 0.8) / 0.1), front = smooth((u.z + 0.34) / 0.08);
    const cheekLine = -0.25 + 0.32 * clamp01((ax - 0.45) / 0.4);
    const cheeks = below(u.y, cheekLine, 0.06);
    // Facial hair starts just below the nostrils (the prototype's ran up to the base of the nose).
    const nose = below(ax, 0.22, 0.05) * smooth((u.y + 0.3) / 0.03);
    const mouth = Math.max(lips(u), nose);
    const sideburnTop = smooth((ax - 0.86) / 0.04) * smooth((u.y + 0.25) / 0.04) * below(u.z, 0.05, 0.04);
    return neck * front * cheeks * (1 - mouth) * (1 - sideburnTop);
  };
}

/**
 * Mustache: from under the nose down to the upper lip, following the lip's curve and drooping a little
 * towards the corners of the mouth, a little wider than the mouth. Half-width also returned for tapering.
 */
function mustacheArea(c: HeadCtx): { area: DirFn; half: number } {
  const L = LIPS[c.recipe.lips], half = MOUTH_W * L.w + 0.09, lipTop = MOUTH_Y + 0.05 * L.up;
  const area: DirFn = (u) => {
    const ax = Math.abs(u.x), t = Math.min(1, ax / half);
    // Starts just above the lip line (it would otherwise touch the lip as the mouth opens).
    const lower = lipTop + 0.025 - 0.05 * t * t, upper = -0.3 - 0.07 * t * t;
    return below(ax, half, 0.03) * smooth((u.y - lower) / 0.02) * below(u.y, upper, 0.025) * smooth((u.z - 0.55) / 0.05);
  };
  return { area, half };
}

/** Builds one facial-hair shell, with mouth blend shapes so it follows the face. */
function hairShellPart(c: HeadCtx, name: string, mat: Part["mat"], grid: ShellGrid, area: DirFn, thick: DirFn): Part {
  const { geo, mask, morphs } = maskShell(c, grid, area, thick, [...MOUTH_MORPHS]);
  const P = geo.attributes.position;
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = morphs.map((a) => new Float32BufferAttribute(a, 3));
  if (mat === "stubble") {
    // Stubble fades out softly at its edges instead of ending in a line.
    const col = new Float32Array(P.count * 4);
    for (let i = 0; i < P.count; i++) col.set([1, 1, 1, mask[i]], i * 4);
    geo.setAttribute("color", new Float32BufferAttribute(col, 4));
  }
  return { name, mat, node: ROOT, geo, morphs: [...MOUTH_MORPHS], surface: "sheet" };
}

export function facialHair(c: HeadCtx): Part[] {
  const f = c.recipe.facial;
  if (!f) return [];
  const beard = beardArea(c), stache = mustacheArea(c);
  // Thickest in the middle, tapering towards the corners of the mouth.
  // (The hairy texture scales with the thickness, so the thin tapered ends never wave down onto the lip.)
  const stacheThick = (t: number): DirFn => (u) => t * (1 - 0.6 * Math.min(1, Math.abs(u.x) / stache.half) ** 2) * (1 + wave(0.25, 15)(u));
  // Jaw beards wrap round the head, so they use a sphere grid; mouth-area hair gets a finer front-view grid.
  const JAW: ShellGrid = { sphere: [96, 64] };
  const LIP: ShellGrid = { front: { x: [-0.46, 0.46], y: [-0.5, -0.26], n: [64, 18] } };
  // Down to the underside of the chin, not onto the throat (where the grid bunches up and folds).
  const CHIN: ShellGrid = { front: { x: [-0.4, 0.4], y: [-0.88, -0.46], n: [48, 30] } };
  if (f === 1) return [hairShellPart(c, "stubble", "stubble", JAW, beard, () => 0.008)];
  const mustache = (t: number) => hairShellPart(c, "mustache", "beard", LIP, stache.area, stacheThick(t));
  if (f === 2) return [mustache(0.022)];
  if (f === 3) {
    const lips = lipsArea(c);
    const goatee: DirFn = (u) => {
      const ax = Math.abs(u.x);
      // Narrower towards the bottom of the chin, like a real goatee.
      const half = 0.2 + 0.1 * smooth((u.y + 0.82) / 0.3);
      return below(ax, half, 0.04) * below(u.y, -0.5, 0.04) * smooth((u.z - 0.3) / 0.05) * (1 - lips(u));
    };
    return [
      hairShellPart(c, "goatee", "beard", CHIN, goatee, (u) => 0.025 + 0.05 * clamp01((-u.y - 0.7) / 0.25) + wave(0.008, 15)(u)),
      mustache(0.02),
    ];
  }
  if (f === 4) return [hairShellPart(c, "beard", "beard", JAW, beard, (u) => 0.024 + wave(0.008, 15)(u))];
  return [
    hairShellPart(c, "beard", "beard", JAW, beard,
      (u) => 0.03 + 0.13 * clamp01((-u.y - 0.5) / 0.45) * clamp01(u.z + 0.3) + wave(0.016, 14)(u)),
  ];
}
