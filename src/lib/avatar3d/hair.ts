// Hair: buzz, low fade, short coils, afro, puff, bun, cornrows, box braids, locs, long, headwrap.
//
// Every style grows inside one hairline that runs the way a real one does: across the forehead,
// receding a little at the temples, down in front of each ear as a sideburn, up and over the ear,
// down again behind it, and across the nape. It is placed from where the ears actually are (earSpot).
// Most styles are shells over the scalp; braids and locs grow from sections all over the scalp, lie
// along the head and then hang; cornrows run in rows from the front hairline to the nape; long hair
// hugs the head from the crown and falls from its widest point. hairThickness tells caps how much
// room to leave.

import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Object3D, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { skinPoint } from "./face.ts";
import type { HeadCtx } from "./head-shape.ts";
import { PI, bell, clamp01, smooth } from "./math.ts";
import { type Part, ROOT, ellGeo } from "./parts.ts";
import type { Recipe } from "./recipe.ts";
import { type DirFn, around, capShell, earSpot, tubeAlong, wave } from "./shells.ts";

/**
 * The hairline: the lowest direction-height hair grows at, by angle round the head. (The prototype's
 * arch over the ear was centred on the ear's front edge, which left no sideburn and cut across the
 * back of the ear.)
 */
export function hairlineFor(c: HeadCtx): DirFn {
  const e = earSpot(c), front = e.mid - e.half - 0.03, back = e.mid + e.half + 0.03;
  // [angle from straight ahead, height]
  const keys: [number, number][] = [
    [0, 0.6], [0.5, 0.55], [0.85, 0.43], // forehead, easing back at the temples
    [1.15, 0.32], [front - 0.26, 0.18], // temple
    [front - 0.17, 0], [front - 0.02, -0.02], // sideburn, down to about mid-ear, just in front of it
    [front + 0.05, e.top + 0.05], [back - 0.06, e.top + 0.05], // up and over the ear
    [back + 0.1, e.bottom + 0.1], [back + 0.35, -0.32], // down behind the ear
    [2.7, -0.45], [PI, -0.52], // nape
  ];
  return (u) => {
    const a = Math.abs(around(u));
    let k = 0;
    while (k < keys.length - 2 && a > keys[k + 1][0]) k++;
    const [a0, h0] = keys[k], [a1, h1] = keys[k + 1];
    return h0 + (h1 - h0) * smooth((a - a0) / (a1 - a0));
  };
}

/**
 * Which hairstyle is drawn: -1 for none (head ties, gele and hijab cover it), or the buzz (1) under
 * any other headwear for big styles a cap would squash (afro, puff, bun, headwrap).
 */
export function hairUnder(r: Pick<Recipe, "hw" | "hair">) {
  const w = r.hw, h = r.hair;
  if (w === 2 || w === 3 || w === 6) return -1;
  if (w && (h === 4 || h === 5 || h === 6 || h === 11)) return 1;
  return h;
}

/**
 * The body of a hairstyle: one layer over the scalp inside the hairline, set by a few numbers (all
 * as fractions of the head's radius). Most styles are just different settings of it.
 */
export type HairBody = {
  /** Length on top (above topFrom) and on the sides and back. */
  top: number;
  side: number;
  /** Direction-height where the top length takes over from the side length. */
  topFrom: number;
  /** How far up from the hairline the hair thins in (a fade); small = a crisp edge. */
  fade: number;
  /** How much scalp shows through at the hairline (0) up to fully thick hair (1). */
  edgeDensity: number;
  /** Less length at the front (afro: rounder, sits back from the face). */
  frontLess?: number;
  /** Bumps in the surface (clumps, coils). */
  clumps?: number;
  texture: "coil" | "strand";
};

/** Pieces of gathered hair added to a body. */
type Gathered = "puff" | "bun" | "ponytail" | "fall";

type Style = { body: HairBody; gathered?: Gathered; res?: [number, number] };

const SLEEK: HairBody = { top: 0.016, side: 0.016, topFrom: 0.3, fade: 0.08, edgeDensity: 0.7, texture: "strand" };
/** The fade family: a low fade, and short coils (the same cut, longer on the sides). */
const LOW_FADE: HairBody = { top: 0.075, side: 0.02, topFrom: 0.3, fade: 0.5, edgeDensity: 0.12, clumps: 0.006, texture: "coil" };

/** Each hairstyle (by its index in HAIRS) as body settings plus gathered pieces. */
const STYLES: Partial<Record<number, Style>> = {
  1: { body: { top: 0.012, side: 0.012, topFrom: 0.3, fade: 0.15, edgeDensity: 0.45, texture: "coil" } }, // buzz
  2: { body: LOW_FADE }, // low fade
  3: { body: { ...LOW_FADE, side: 0.055, top: 0.085, topFrom: 0.15, fade: 0.14, edgeDensity: 0.55, clumps: 0.015 } }, // short coils
  // Afro: a fuller body, rounding out gradually from the hairline (a short fade made steep, helmet-like walls).
  // Dense: no scalp shows through.
  4: { body: { top: 0.55, side: 0.3, topFrom: -0.1, fade: 0.45, edgeDensity: 1, frontLess: 0.45, clumps: 0.025, texture: "coil" }, res: [80, 32] },
  5: { body: SLEEK, gathered: "puff" },
  6: { body: SLEEK, gathered: "bun" },
  10: { body: { ...SLEEK, top: 0.04, side: 0.04 }, gathered: "fall" }, // long
  12: { body: SLEEK, gathered: "ponytail" },
};

/** Thickness and density of a body at direction u (E: the hairline). */
function bodyAt(b: HairBody, E: DirFn) {
  return {
    thick: (u: Vector3) => {
      const k = smooth((u.y - E(u)) / b.fade), len = b.side + (b.top - b.side) * smooth((u.y - b.topFrom) / 0.3);
      const t = len * (1 - (b.frontLess ?? 0) * Math.max(u.z, 0)) + (b.clumps ? wave(b.clumps, 14)(u) : 0);
      return 0.006 + (t - 0.006) * k;
    },
    alpha: (u: Vector3) => b.edgeDensity + (1 - b.edgeDensity) * smooth((u.y - E(u)) / b.fade),
  };
}

/** The headwrap hairstyle: fabric, not hair (its own edge, folds flattening out at the crown). */
function wrapShell(): { edge: DirFn; thick: DirFn } {
  const edge: DirFn = (u) => (u.z > 0 ? 0.08 + 0.34 * Math.pow(u.z, 1.3) : 0.08 - 0.68 * Math.pow(-u.z, 1.1));
  const folds: DirFn = (u) => 0.035 * Math.sin(Math.atan2(u.x, u.z) * 5 + u.y * 9) * smooth((1 - u.y) / 0.2);
  return { edge, thick: (u) => 0.08 + 0.45 * smooth((u.y - edge(u)) / 0.7) * (1 - 0.3 * Math.max(u.z, 0)) + folds(u) };
}

/** Thickness of the hair layer under braids, locs and cornrows: short hair in the hair colour between them. */
const SCALP = 0.022;

type Layer = { edge: DirFn; thick: DirFn; alpha?: DirFn; mat: Part["mat"]; res: [number, number] };

/** The layers over the scalp for a hairstyle: its body, a bare parted scalp under strands, or the wrap. */
function scalpLayers(c: HeadCtx, h: number): Layer[] {
  const E = hairlineFor(c), st = STYLES[h];
  if (st) {
    const b = bodyAt(st.body, E);
    return [{ edge: E, ...b, mat: st.body.texture === "coil" ? "hairBody" : "hairBodyStrand", res: st.res ?? [72, 26] }];
  }
  if (h === 7 || h === 8 || h === 9) return [{ edge: E, thick: () => SCALP, mat: "hair", res: [64, 22] }];
  if (h === 11) return [{ ...wrapShell(), mat: "wrap", res: [80, 30] }];
  return [];
}

/** Braid, loc and cornrow sizes. Braids from higher on the head lie over the ones below (layer). */
const STRANDS = {
  braids: { count: 46, r: 0.04, length: 2.7, layer: 0.035 },
  locs: { count: 30, r: 0.058, length: 2.2, layer: 0.04 },
};
const CORNROW_R = 0.034;

/** Most a strand style stands off the scalp (so caps leave room). */
const STRAND_HEIGHT: Record<number, number> = {
  7: SCALP + CORNROW_R * 1.8,
  8: SCALP + STRANDS.braids.r * 2.2 + STRANDS.braids.layer,
  9: SCALP + STRANDS.locs.r * 2.2 + STRANDS.locs.layer,
};

/**
 * How far the drawn hair stands off the skin in direction u (fraction of the radius), 0 where there is
 * none. Caps use it to sit just outside the hair, all the way down to their rim.
 */
export function hairThickness(c: HeadCtx, u: Vector3): number {
  const h = hairUnder(c.recipe);
  let t = 0;
  for (const s of scalpLayers(c, h)) if (u.y > s.edge(u)) t = Math.max(t, s.thick(u));
  if (STRAND_HEIGHT[h] && u.y > hairlineFor(c)(u)) t = Math.max(t, STRAND_HEIGHT[h]);
  return t;
}

/** Extra room strands and long hair leave where they pass over an ear. */
function earRoom(c: HeadCtx): DirFn {
  const e = earSpot(c), mid = (e.top + e.bottom) / 2;
  return (u) => 0.17 * bell((Math.abs(around(u)) - e.mid) / 0.3) * bell((u.y - mid) / 0.32) * smooth((Math.abs(u.x) - 0.5) / 0.2);
}

/** Outward normal of the skin at direction u (from three nearby skin points). */
function skinNormal(c: HeadCtx, u: Vector3) {
  const up = Math.abs(u.y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const t1 = new Vector3().crossVectors(u, up).normalize(), t2 = new Vector3().crossVectors(u, t1).normalize();
  const p0 = skinPoint(c, u), p1 = skinPoint(c, u.clone().addScaledVector(t1, 0.01).normalize()), p2 = skinPoint(c, u.clone().addScaledVector(t2, 0.01).normalize());
  return p1.sub(p0).cross(p2.sub(p0)).normalize();
}

/**
 * Braids or locs. Each grows from its own section of the scalp (spread evenly over the hair area),
 * lies along the head (combed back from the forehead and down at the sides and back, clearing the
 * ears), leaves the head where it curves away underneath, and hangs from there. (The prototype hung
 * them all from one ring round the head, like a fringe off a cap.)
 */
function strands(c: HeadCtx, kind: "braids" | "locs"): Part[] {
  const S = STRANDS[kind], E = hairlineFor(c), room = earRoom(c), parts: Part[] = [];
  const segs = Math.max(8, Math.round(16 * c.lod)), sides = c.lod < 1 ? 3 : 4;
  // Roots: an even spiral of points over the sphere, kept where hair grows.
  const roots: Vector3[] = [];
  const total = Math.round(S.count * 2.6);
  for (let k = 0; k < total && roots.length < S.count; k++) {
    const y = 1 - (2 * (k + 0.5)) / total, r = Math.sqrt(1 - y * y), th = k * 2.399963;
    const u = new Vector3(r * Math.cos(th), y, r * Math.sin(th));
    if (u.y > E(u) + 0.05) roots.push(u);
  }
  roots.forEach((u0, b) => {
    // Each strand grows out of the scalp, rising to its full height over the first stretch.
    const lift = S.r * 1.05 + S.layer * clamp01((u0.y + 0.3) / 1.3);
    const at = (u: Vector3, along: number) => skinPoint(c, u).multiplyScalar(1 + SCALP + S.r * 1.05 + (lift - S.r * 1.05) * smooth(along / 0.18) + room(u));
    const pts = [at(u0, 0)];
    let u = u0.clone(), len = 0;
    // Along the head.
    for (let i = 0; i < 80 && len < S.length * 0.75; i++) {
      if (skinNormal(c, u).y < -0.25) break; // the head turns under here: the strand leaves it
      const sweep = smooth((u.z + 0.05) / 0.45);
      const comb = new Vector3(Math.sign(u.x) * 0.35 * sweep, -1, -0.4 - 1.3 * sweep);
      const t = comb.addScaledVector(u, -comb.dot(u));
      if (t.lengthSq() < 1e-4) break;
      u = u.clone().addScaledVector(t.normalize(), 0.05).normalize();
      const p = at(u, len + 0.05);
      len += p.distanceTo(pts[pts.length - 1]);
      pts.push(p);
    }
    // Hanging down from there, drifting a little outwards.
    const last = pts[pts.length - 1], out = new Vector3(last.x, 0, last.z + 0.05).normalize(), fall = S.length - len, steps = 6;
    for (let k = 1; k <= steps; k++) pts.push(last.clone().add(new Vector3(0, -(fall * k) / steps, 0)).addScaledVector(out, 0.035 * k));
    const cv = new CatmullRomCurve3(pts);
    const shape = kind === "locs"
      ? (t: number, a: number) => (1 + 0.14 * Math.sin(t * 22 + b + a * 2)) * (t > 0.93 ? 0.75 : 1)
      : (t: number, a: number) => (1 + 0.2 * Math.sin(t * 95 + a * PI * 2)) * (t > 0.95 ? 0.7 : 1);
    parts.push({ name: `${kind === "locs" ? "loc" : "braid"}${b}`, mat: "hair", node: ROOT, geo: tubeAlong(cv, segs, sides, S.r, shape), surface: "closed" });
    if (kind === "braids" && b % 3 === 0) parts.push({ name: `bead${b}`, mat: "gold", node: ROOT, geo: ellGeo(0.05, 0.06, 0.05, 6, c.lod, cv.getPointAt(1)), surface: "closed" });
  });
  return parts;
}

/**
 * Cornrows: rows from the front hairline straight back over the head to the nape, side by side from
 * ear to ear, the parted scalp showing between them. (The prototype had nine short rows on top only.)
 */
function cornrows(c: HeadCtx): Part[] {
  const E = hairlineFor(c), parts: Part[] = [], rows = 13;
  for (let k = 0; k < rows; k++) {
    // Each row lies in an upright plane (x = s) and runs round the head inside the hairline.
    const s = -0.86 + (1.72 * k) / (rows - 1), rc = Math.sqrt(1 - s * s);
    const dirs: Vector3[] = [];
    let best: Vector3[] = [];
    for (let th = -0.6; th <= 4.4; th += 0.02) {
      const u = new Vector3(s, rc * Math.sin(th), rc * Math.cos(th));
      if (u.y > E(u) + 0.02) dirs.push(u);
      else {
        if (dirs.length > best.length) best = dirs.slice();
        dirs.length = 0;
      }
    }
    if (dirs.length > best.length) best = dirs;
    if (best.length < 4) continue;
    const pts = best.filter((_, i) => i % 2 === 0).map((u) => skinPoint(c, u).multiplyScalar(1 + SCALP + CORNROW_R * 1.05));
    const cv = new CatmullRomCurve3(pts), len = cv.getLength();
    const segs = Math.max(12, Math.round(len * 26 * c.lod));
    parts.push({
      name: `cornrow${k}`, mat: "hair", node: ROOT, surface: "closed",
      geo: tubeAlong(cv, segs, 4, CORNROW_R, (t, a) => (1 + 0.16 * Math.sin(t * len * 90 + a * PI * 2)) * (t < 0.02 || t > 0.98 ? 0.6 : 1)),
    });
  }
  return parts;
}

/**
 * Long hair: hugs the head from the crown down to its widest point (and over the ears), then hangs and
 * flares a little at the ends, round the back and sides, framing the face. (The prototype hung half a
 * cylinder behind the head, and the first version here started at the hairline: both floated off it.)
 */
function longFall(c: HeadCtx): BufferGeometry {
  const NA = Math.max(16, Math.round(44 * c.lod)), NY = Math.max(12, Math.round(34 * c.lod)), span = 1.84, yBottom = -2.35;
  const room = earRoom(c), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NA; i++) {
    const ph = PI + span * (2 * (i / NA) - 1), dir = new Vector3(Math.sin(ph), 0, Math.cos(ph));
    // The head's outline at this angle, from the crown down: height and distance from the middle.
    const prof: [number, number][] = [];
    for (let k = 0; k <= 48; k++) {
      const el = 1.45 - (k / 48) * 2.5, u = new Vector3(dir.x * Math.cos(el), Math.sin(el), dir.z * Math.cos(el));
      const p = skinPoint(c, u).multiplyScalar(1 + room(u));
      prof.push([p.y, Math.hypot(p.x, p.z + 0.05)]);
    }
    const top = prof[0][0];
    for (let j = 0; j <= NY; j++) {
      // Rows are closer together near the crown, where the hair curves over the head.
      const y = top + (yBottom - top) * Math.pow(j / NY, 1.35);
      let r = 0;
      for (const [py, pr] of prof) if (py >= y - 0.01) r = Math.max(r, pr);
      r += 0.055 + 0.18 * smooth((-y - 1.0) / 1.2);
      pos.push(r * dir.x, y, r * dir.z - 0.05);
      uv.push(i / NA, j / NY);
    }
  }
  const W = NY + 1;
  for (let i = 0; i < NA; i++) {
    for (let j = 0; j < NY; j++) {
      const a = i * W + j, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, b, d, a, d, cc);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Hair gathered from the body: a puff high on the crown, a bun at the back, a ponytail, or a long fall.
 * Each sits on the body's surface (not at a fixed spot in space), with a band where it is tied.
 */
function gatheredPiece(c: HeadCtx, body: HairBody, kind: Gathered): Part[] {
  if (kind === "fall") return [{ name: "hairFall", mat: "hairStrand", node: ROOT, geo: longFall(c), surface: "sheet" }];
  const thick = bodyAt(body, hairlineFor(c)).thick;
  const where = { puff: new Vector3(0, 0.93, -0.36), bun: new Vector3(0, 0.45, -0.89), ponytail: new Vector3(0, 0.22, -0.98) }[kind].normalize();
  const base = skinPoint(c, where).multiplyScalar(1 + thick(where)), n = skinNormal(c, where);
  const tie = (r: number, at: Vector3): Part => ({
    name: "hairBand", mat: "hairTie", node: ROOT, surface: "closed",
    geo: new TorusGeometry(r, 0.035, 8, 28).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n)).translate(at.x, at.y, at.z),
  });
  if (kind === "ponytail") {
    // Gathered at the back of the head, then one smooth arc out from the tie and down the back,
    // fullest just below the tie and tapering to the ends.
    const start = base.clone().addScaledVector(n, 0.06), drop = 1.45, out = new Vector3(n.x, 0, n.z).normalize(), pts: Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const s = k / 8;
      pts.push(start.clone().addScaledVector(out, 0.3 * Math.sin(Math.min(1, s * 2.2) * (PI / 2))).add(new Vector3(0, -drop * Math.pow(s, 1.2), 0)));
    }
    const tail = tubeAlong(new CatmullRomCurve3(pts), Math.max(10, Math.round(24 * c.lod)), Math.max(6, Math.round(10 * c.lod)), 0.16,
      (t, a) => (0.7 + 0.6 * smooth(t / 0.25) - 0.95 * smooth((t - 0.4) / 0.6)) * (1 + 0.04 * Math.sin(a * PI * 6)));
    return [tie(0.12, base.clone().addScaledVector(n, 0.05)), { name: "ponytail", mat: "hairStrand", node: ROOT, geo: tail, surface: "closed" }];
  }
  // Puff (big, high on the crown) or bun (smaller, at the back): a soft ball sitting on the tie.
  const puff = kind === "puff", r = puff ? 0.6 : 0.34, w = wave(puff ? 0.06 : 0.03, 7), seg = Math.max(12, Math.round(28 * c.lod));
  const g = new SphereGeometry(1, seg, Math.max(8, Math.round(18 * c.lod))), p = g.attributes.position, u = new Vector3();
  for (let i = 0; i < p.count; i++) {
    u.fromBufferAttribute(p, i);
    const k = r * (1 + w(u));
    p.setXYZ(i, u.x * k, u.y * k, u.z * k);
  }
  g.computeVertexNormals();
  const at = base.clone().addScaledVector(n, r * 0.8);
  return [
    { name: kind, mat: puff ? "hair" : "hairStrand", node: ROOT, geo: g.translate(at.x, at.y, at.z), surface: "closed" },
    tie(r * 0.62, base.clone().addScaledVector(n, 0.05)),
  ];
}

/** Bakes a rotated, positioned copy of a geometry. */
function placed<G extends BufferGeometry>(g: G, pos: Vector3, rot: [number, number, number] = [0, 0, 0]) {
  const o = new Object3D();
  o.position.copy(pos);
  o.rotation.set(...rot);
  o.updateMatrix();
  return g.applyMatrix4(o.matrix);
}

export function hair(c: HeadCtx): Part[] {
  const h = hairUnder(c.recipe), F = c.F, parts: Part[] = [];
  if (h <= 0) return parts;
  const add = (name: string, geo: Part["geo"], mat: Part["mat"], surface: Part["surface"] = "sheet") => parts.push({ name, mat, node: ROOT, geo, surface });
  scalpLayers(c, h).forEach((s, i) => add(`hair${i}`, capShell(c, s.res[0], s.res[1], s.edge, s.thick, { alpha: s.alpha }), s.mat));
  const gathered = STYLES[h]?.gathered;
  if (gathered) parts.push(...gatheredPiece(c, STYLES[h]!.body, gathered));
  if (h === 7) parts.push(...cornrows(c));
  if (h === 8) parts.push(...strands(c, "braids"));
  if (h === 9) parts.push(...strands(c, "locs"));
  if (h === 11) {
    // Headwrap knot at the front.
    for (const [i, z] of [0.6, -0.6].entries()) {
      add(`wrapKnot${i}`, placed(new TorusGeometry(0.2, 0.085, 10, 24), new Vector3(0, 1.02 * F.h, 0.52 * F.d), [-0.5, 0, z]), "wrap", "closed");
    }
  }
  return parts;
}
