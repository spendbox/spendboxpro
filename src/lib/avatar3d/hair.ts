// Hair: buzz, low fade, short coils, afro, puff, bun, cornrows, box braids, locs, long, headwrap.
// Most styles are shells over the scalp (built on the real skin); braids, locs and cornrows add tubes;
// long hair adds a fall that hangs from the hairline. hairThickness tells caps how much room to leave.

import { CatmullRomCurve3, Float32BufferAttribute, BufferGeometry, Object3D, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { type HeadCtx, deform } from "./head-shape.ts";
import { skinPoint } from "./face.ts";
import { PI, smooth } from "./math.ts";
import { type Part, ROOT, ellGeo } from "./parts.ts";
import type { Recipe } from "./recipe.ts";
import { type DirFn, capShell, earLine, hairline, tubeAlong, wave } from "./shells.ts";

/** Hairline, arching up over the ears. */
export const scalpEdge: DirFn = (u) => Math.max(hairline(u), earLine(u));

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

type Shell = { edge: DirFn; thick: DirFn; mat: Part["mat"]; res: [number, number] };

/** The scalp shells of each style (thickness as a fraction of the radius). */
function shells(h: number): Shell[] {
  const S = (res: [number, number], mat: Part["mat"], thick: DirFn, edge: DirFn = scalpEdge): Shell => ({ edge, thick, mat, res });
  switch (h) {
    case 1: return [S([64, 20], "buzz", () => 0.012)];
    case 2: return [
      S([64, 20], "buzz", () => 0.01),
      // Low fade: longer on top, fading into the buzz on the sides.
      S([64, 16], "hair", (u) => 0.03 + 0.045 * smooth((u.y - 0.34) / 0.2) + wave(0.006, 15)(u), (u) => Math.max(scalpEdge(u), 0.34)),
    ];
    case 3: return [S([72, 26], "hair", (u) => 0.045 + 0.035 * smooth((u.y - hairline(u)) / 0.3) + wave(0.02, 15)(u))];
    case 4: return [S([80, 32], "hair", (u) => 0.05 + 0.5 * smooth((u.y - hairline(u)) / 0.5) * (1 - 0.25 * Math.max(u.z, 0)) + wave(0.025, 13)(u))];
    case 5: case 6: return [S([64, 20], "hairStrand", () => 0.016)];
    case 7: return [S([64, 20], "scalp", () => 0.012)];
    case 8: return [S([64, 22], "hairStrand", (u) => 0.018 + 0.006 * Math.sin(u.x * 30))];
    case 9: return [S([64, 22], "hair", (u) => 0.03 + wave(0.015, 15)(u))];
    case 10: return [S([64, 22], "hairStrand", () => 0.04)];
    case 11: {
      const edge: DirFn = (u) => (u.z > 0 ? 0.08 + 0.34 * Math.pow(u.z, 1.3) : 0.08 - 0.68 * Math.pow(-u.z, 1.1));
      // Fabric folds round the head, flattening out at the crown (where they would otherwise crowd and fold).
      const folds: DirFn = (u) => 0.035 * Math.sin(Math.atan2(u.x, u.z) * 5 + u.y * 9) * smooth((1 - u.y) / 0.2);
      return [S([80, 30], "wrap", (u) => 0.08 + 0.45 * smooth((u.y - edge(u)) / 0.7) * (1 - 0.3 * Math.max(u.z, 0)) + folds(u), edge)];
    }
    default: return [];
  }
}

/** Extra height of tubes lying on the scalp (cornrows, braid and loc roots) above the scalp shell. */
const TUBE_HEIGHT: Record<number, number> = { 7: 0.075, 8: 0.06, 9: 0.08 };

/**
 * How far the drawn hair stands off the skin in direction u (fraction of the radius), 0 where there is
 * none. Caps use it to sit just outside the hair, all the way down to their rim.
 */
export function hairThickness(c: HeadCtx, u: Vector3): number {
  const h = hairUnder(c.recipe);
  let t = 0;
  for (const s of shells(h)) if (u.y > s.edge(u)) t = Math.max(t, s.thick(u));
  if (TUBE_HEIGHT[h] && u.y > scalpEdge(u)) t = Math.max(t, TUBE_HEIGHT[h]);
  return t;
}

/** Bakes a scaled, rotated, positioned copy of a geometry. */
function placed<G extends BufferGeometry>(g: G, pos: Vector3, rot: [number, number, number] = [0, 0, 0]) {
  const o = new Object3D();
  o.position.copy(pos);
  o.rotation.set(...rot);
  o.updateMatrix();
  return g.applyMatrix4(o.matrix);
}

/**
 * Long hair: falls from the hairline round the back and sides, following the head (and clearing the
 * ears) then hanging straight and flaring a little over the shoulders. (The prototype hung half a
 * cylinder behind the head, which cut through the ears and floated off the head at the top.)
 */
function longFall(c: HeadCtx): BufferGeometry {
  const NA = Math.max(16, Math.round(44 * c.lod)), NY = Math.max(10, Math.round(30 * c.lod)), span = 1.84;
  const yBottom = -2.35, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NA; i++) {
    // Angle round the head from straight back (0), to the sides at about +-105 degrees.
    const ph = PI + span * (2 * (i / NA) - 1), dir = new Vector3(Math.sin(ph), 0, Math.cos(ph));
    // The head's outline at this angle: how far out the skin (and the ears, at the sides) reaches at each height.
    const prof: [number, number][] = [];
    for (let k = 0; k <= 40; k++) {
      const el = 1.2 - (k / 40) * 2.2, u = new Vector3(dir.x * Math.cos(el), Math.sin(el), dir.z * Math.cos(el));
      const p = skinPoint(c, u), side = Math.abs(Math.sin(ph));
      const r = Math.hypot(p.x, p.z + 0.05) + (side > 0.6 && p.y > -0.35 && p.y < 0.35 ? 0.2 * side : 0);
      prof.push([p.y, r]);
    }
    // The fall starts at the hairline and hangs from the widest point above each height.
    const top = scalpTopAt(c, ph);
    for (let j = 0; j <= NY; j++) {
      const y = top + (yBottom - top) * (j / NY);
      let r = 0;
      for (const [py, pr] of prof) if (py >= y - 0.02) r = Math.max(r, pr);
      r = r * 1.04 + 0.05 + 0.18 * smooth((-y - 1.0) / 1.2);
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

/** Height where the scalp hair ends at a horizontal angle (the hairline there). */
function scalpTopAt(c: HeadCtx, ph: number) {
  let lo = 0.02, hi = PI * 0.97;
  const U = (a: number) => new Vector3(Math.sin(a) * Math.sin(ph), Math.cos(a), Math.sin(a) * Math.cos(ph));
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    if (U(m).y - scalpEdge(U(m)) > 0) lo = m;
    else hi = m;
  }
  // A little above the hairline, so the fall starts under the scalp hair's edge.
  return skinPoint(c, U(lo * 0.94)).y;
}

export function hair(c: HeadCtx): Part[] {
  const h = hairUnder(c.recipe), F = c.F, parts: Part[] = [];
  if (h <= 0) return parts;
  const add = (name: string, geo: Part["geo"], mat: Part["mat"], surface: Part["surface"] = "sheet") => parts.push({ name, mat, node: ROOT, geo, surface });
  shells(h).forEach((s, i) => add(`hair${i}`, capShell(c, s.res[0], s.res[1], s.edge, s.thick), s.mat));

  if (h === 5 || h === 6) {
    // Puff (big, high on the crown) or bun (smaller, at the back), with a band round its base.
    const puff = h === 5, r = puff ? 0.6 : 0.34, w = wave(puff ? 0.06 : 0.03, 7), seg = Math.max(12, Math.round(28 * c.lod));
    const g = new SphereGeometry(1, seg, Math.max(8, Math.round(18 * c.lod))), p = g.attributes.position, u = new Vector3();
    for (let i = 0; i < p.count; i++) {
      u.fromBufferAttribute(p, i);
      const k = r * (1 + w(u));
      p.setXYZ(i, u.x * k, u.y * k, u.z * k);
    }
    g.computeVertexNormals();
    const at = new Vector3(0, (puff ? 0.95 : 0.8) * F.h, (puff ? -0.28 : -0.6) * F.d);
    add(puff ? "puff" : "bun", g.translate(at.x, at.y, at.z), puff ? "hair" : "hairStrand", "closed");
    const band = placed(new TorusGeometry(puff ? 0.42 : 0.26, 0.04, 8, 28), at.clone().add(new Vector3(0, puff ? -0.4 : -0.05, puff ? 0.08 : 0.22)), [puff ? PI / 2 - 0.3 : -0.6, 0, 0]);
    add("hairBand", band, "hairTie", "closed");
  }
  if (h === 7) {
    // Cornrows: nine braids from the forehead back over the crown.
    for (let r = -4; r <= 4; r++) {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 22; k++) {
        const th = 0.6 + ((2.75 - 0.6) * k) / 22;
        pts.push(skinPoint(c, new Vector3(r * 0.15, Math.sin(th), Math.cos(th)).normalize()).multiplyScalar(1.022));
      }
      add(`cornrow${r + 4}`, tubeAlong(new CatmullRomCurve3(pts), 30, 5, 0.036, (t, a) => 1 + 0.16 * Math.sin(t * 70 + a * PI * 2)), "hair", "closed");
    }
  }
  if (h === 8 || h === 9) {
    // Box braids (thinner, with beads) or locs, hanging from round the back and sides of the head.
    const loc = h === 9, N = loc ? 15 : 22, rr = loc ? 0.058 : 0.042, len = loc ? 2.2 : 2.7;
    for (let b = 0; b < N; b++) {
      const ph = -1.75 + (3.5 * b) / (N - 1), e = 0.2;
      const s0 = deform(c, new Vector3(Math.sin(ph) * Math.cos(e), Math.sin(e), -Math.cos(ph) * Math.cos(e)));
      const pts = [s0.clone()], r0 = Math.hypot(s0.x, s0.z), ang = Math.atan2(s0.x, s0.z), steps = 9;
      for (let k = 1; k <= steps; k++) {
        const y = s0.y - (k * len) / steps, r = r0 + (0.1 * Math.min(k, 3)) / 3 + Math.max(0, -y - 1.3) * 0.55, a = ang + 0.035 * Math.sin(k * 1.3 + b);
        pts.push(new Vector3(r * Math.sin(a), y, r * Math.cos(a) * (Math.cos(a) < 0 ? 1.05 : 1)));
      }
      const cv = new CatmullRomCurve3(pts);
      add(`${loc ? "loc" : "braid"}${b}`, tubeAlong(cv, loc ? 14 : 18, 4, rr, loc
        ? (t, a) => (1 + 0.14 * Math.sin(t * 22 + b + a * 2)) * (t > 0.93 ? 0.75 : 1)
        : (t, a) => (1 + 0.2 * Math.sin(t * 95 + a * PI * 2)) * (t > 0.95 ? 0.7 : 1)), "hair", "closed");
      if (!loc && b % 2 === 0) add(`bead${b}`, ellGeo(0.05, 0.06, 0.05, 10, c.lod, cv.getPointAt(1)), "gold", "closed");
    }
  }
  if (h === 10) add("hairFall", longFall(c), "hairStrand");
  if (h === 11) {
    // Headwrap knot at the front.
    for (const [i, z] of [0.6, -0.6].entries()) {
      add(`wrapKnot${i}`, placed(new TorusGeometry(0.2, 0.085, 10, 24), new Vector3(0, 1.02 * F.h, 0.52 * F.d), [-0.5, 0, z]), "wrap", "closed");
    }
  }
  return parts;
}
