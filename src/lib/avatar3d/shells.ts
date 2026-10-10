// Shells: surfaces that sit a set distance off the head (hair, beards, caps, wraps). Each follows the
// chosen face shape, because it is built from the same direction-to-skin functions as the skin itself.

import {
  BufferGeometry, type Curve, Float32BufferAttribute, LatheGeometry, SphereGeometry, SplineCurve, TubeGeometry, Vector2, Vector3,
} from "three";
import { EAR_Y } from "./ears.ts";
import { MOUTH_MORPHS, outerSkin, skinPoint } from "./face.ts";
import type { HeadCtx } from "./head-shape.ts";
import { PI, smooth } from "./math.ts";

export type DirFn = (u: Vector3) => number;

/** Gentle bumpy texture (hair clumps, folds), as a fraction of the radius. */
export const wave = (a: number, f: number): DirFn => (u) =>
  a * Math.sin(u.x * f + 1.3) * Math.sin(u.y * f * 0.93 + 0.7) * Math.sin(u.z * f * 1.07 + 2.1);

/** Hairline height (direction y) for a direction: f at the front, s at the sides, b at the back. */
export function hairline(u: Vector3, f = 0.6, s = 0.12, b = -0.55) {
  return u.z > 0 ? s + (f - s) * Math.pow(u.z, 1.3) : s + (b - s) * Math.pow(-u.z, 1.1);
}
/** Horizontal angle round the head of direction u: 0 straight ahead, +-PI/2 at the sides, +-PI behind. */
export const around = (u: Vector3) => Math.atan2(u.x, u.z);

/**
 * Where the ears are in scalp terms (matching ears.ts): the horizontal angle of the ear's middle,
 * half its angular width, and the direction-height of its top and bottom.
 */
export function earSpot(c: HeadCtx) {
  const sc = c.fem ? 0.9 : 1;
  return { mid: 1.785, half: 0.185 * sc, top: EAR_Y + 0.28 * sc, bottom: EAR_Y - 0.25 * sc };
}

/** An arch over each ear, `gap` above its top: the lowest a wrap or hairline may come there (-1 elsewhere). */
export function earClear(c: HeadCtx, gap: number): DirFn {
  const e = earSpot(c), front = e.mid - e.half - 0.05, back = e.mid + e.half + 0.05;
  return (u) => {
    const a = Math.abs(around(u)), over = smooth((a - front + 0.08) / 0.08) * smooth((back + 0.08 - a) / 0.08);
    return -1 + (e.top + gap + 1) * over;
  };
}

export type CapOptions = {
  /** Evens out the edge between neighbouring columns (for edges that jump, like a hijab's face opening). */
  smoothEdge?: number;
  /** Least thickness, kept even at the edge (a cap over hair stays outside the hair down to its rim). */
  floor?: DirFn;
  /** See-through-ness per point, 0..1 (thinning hair: fades, soft hairlines). Adds a colour-with-alpha attribute. */
  alpha?: DirFn;
};

/**
 * A cap laid out from the crown down to an edge (where direction y = edge(u)), so its edge is a smooth
 * curve instead of a staircase. thick(u) is the distance off the skin as a fraction of the radius; it
 * eases in over the last stretch above the edge so the edge meets the skin closely.
 */
export function capShell(c: HeadCtx, NA: number, NR: number, edge: DirFn, thick?: DirFn, opts: CapOptions = {}) {
  const { smoothEdge = 0, floor, alpha } = opts;
  NA = Math.max(16, Math.round(NA * c.lod));
  NR = Math.max(6, Math.round(NR * c.lod));
  const U = (a: number, ph: number) => new Vector3(Math.sin(a) * Math.sin(ph), Math.cos(a), Math.sin(a) * Math.cos(ph));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], rgba: number[] = [];
  // How far down from the crown each column reaches (found by halving the search range).
  let ends = Array.from({ length: NA + 1 }, (_, i) => {
    const ph = (i / NA) * PI * 2;
    let lo = 0.02, hi = PI * 0.97;
    for (let k = 0; k < 26; k++) {
      const m = (lo + hi) / 2;
      if (U(m, ph).y - edge(U(m, ph)) > 0) lo = m;
      else hi = m;
    }
    return lo;
  });
  for (let it = 0; it < smoothEdge; it++) {
    ends = ends.map((e, i) => {
      const prev = ends[(i - 1 + NA) % NA], next = ends[(i + 1) % NA];
      return Math.min(e, (prev + 2 * e + next) / 4);
    });
    ends[NA] = ends[0];
  }
  for (let i = 0; i <= NA; i++) {
    const ph = (i / NA) * PI * 2, lo = ends[i];
    for (let j = 0; j <= NR; j++) {
      const a = (lo * j) / NR, u = U(a, ph), e = smooth((lo - a) / 0.16), ex = thick ? thick(u) : 0, fl = floor ? floor(u) : 0;
      // Built over the real skin (head, neck and the smoothing where they meet), so wraps that come down
      // the back of the neck stay outside it.
      const d = skinPoint(c, u).multiplyScalar(1.004 + Math.max(fl, ex * (0.1 + 0.9 * e)));
      pos.push(d.x, d.y, d.z);
      uv.push(i / NA, j / NR);
      if (alpha) rgba.push(1, 1, 1, alpha(u));
    }
  }
  const W = NR + 1;
  for (let i = 0; i < NA; i++) {
    for (let j = 0; j < NR; j++) {
      const a = i * W + j, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, b, d, a, d, cc);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  if (alpha) g.setAttribute("color", new Float32BufferAttribute(rgba, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The seam (first and last column) and the crown (first row) are shared points: share their normals.
  const nr = g.attributes.normal, s = new Vector3(), t = new Vector3();
  for (let j = 0; j <= NR; j++) {
    s.fromBufferAttribute(nr, j).add(t.fromBufferAttribute(nr, NA * W + j)).normalize();
    nr.setXYZ(j, s.x, s.y, s.z);
    nr.setXYZ(NA * W + j, s.x, s.y, s.z);
  }
  s.set(0, 0, 0);
  for (let i = 0; i <= NA; i++) s.add(t.fromBufferAttribute(nr, i * W));
  s.normalize();
  for (let i = 0; i <= NA; i++) nr.setXYZ(i * W, s.x, s.y, s.z);
  return g;
}

/**
 * Grid a masked shell is built on: a whole sphere of directions (for areas that wrap round, like a
 * jaw beard), or a front-view rectangle (finer, for small areas on the face, like a mustache).
 */
export type ShellGrid = { sphere: [number, number] } | { front: { x: [number, number]; y: [number, number]; n: [number, number] } };

function frontGrid(x: [number, number], y: [number, number], nx: number, ny: number) {
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const X = x[0] + ((x[1] - x[0]) * i) / nx, Y = y[0] + ((y[1] - y[0]) * j) / ny;
      pos.push(X, Y, Math.sqrt(Math.max(0, 1 - X * X - Y * Y)));
    }
  }
  const W = nx + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, b, d, a, d, cc);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(pos.slice(), 3));
  g.setIndex(idx);
  return g;
}

/**
 * A shell over part of the head and neck where mask(u) > 0, standing thick(u) (fraction of the radius)
 * off the skin and thinning to EDGE_LIFT at its edge. Triangles are trimmed exactly along the line
 * where the mask fades out, so the outline is a smooth curve (the prototype kept whole grid triangles,
 * which gave beards a staircase edge). Returns each vertex's direction and mask value too.
 */
export function maskShell(c: HeadCtx, grid: ShellGrid, mask: DirFn, thick: DirFn, shapes: (typeof MOUTH_MORPHS)[number][] = []) {
  const src = "sphere" in grid
    ? new SphereGeometry(1, Math.max(8, Math.round(grid.sphere[0] * c.lod)), Math.max(6, Math.round(grid.sphere[1] * c.lod)))
    : frontGrid(grid.front.x, grid.front.y, Math.max(8, Math.round(grid.front.n[0] * c.lod)), Math.max(4, Math.round(grid.front.n[1] * c.lod)));
  const sp = src.attributes.position, si = src.index!.array;
  const dirs: Vector3[] = [], masks: number[] = [];
  for (let i = 0; i < sp.count; i++) {
    const u = new Vector3().fromBufferAttribute(sp, i).normalize();
    dirs.push(u);
    masks.push(mask(u));
  }
  // Trim each triangle to the part where mask >= CUT, adding vertices where its edges cross the cut.
  const cut = new Map<string, number>(), tris: number[] = [];
  const cross = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let k = cut.get(key);
    if (k === undefined) {
      // Search along the edge for the crossing (the mask isn't linear), then add a vertex there.
      let lo = 0, hi = 1;
      const at = (t: number) => dirs[a].clone().lerp(dirs[b], t).normalize();
      for (let it = 0; it < 12; it++) {
        const m = (lo + hi) / 2;
        if ((mask(at(m)) >= CUT) === (masks[a] >= CUT)) lo = m;
        else hi = m;
      }
      k = dirs.length;
      dirs.push(at((lo + hi) / 2));
      masks.push(CUT);
      cut.set(key, k);
    }
    return k;
  };
  for (let t = 0; t < si.length; t += 3) {
    const v = [si[t], si[t + 1], si[t + 2]], inside = v.map((i) => masks[i] >= CUT), n = inside.filter(Boolean).length;
    // (Slivers this makes are removed below, once their corners are placed.)
    if (n === 3) tris.push(...v);
    if (n === 0 || n === 3) continue;
    // Rotate (keeping the winding) so the odd one out comes first.
    let r = 0;
    while (inside[r] !== (n === 1)) r++;
    const [a, b, d] = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]];
    if (n === 1) tris.push(a, cross(a, b), cross(a, d));
    else {
      const ab = cross(a, b), ad = cross(a, d);
      tris.push(ab, b, d, ab, d, ad);
    }
  }
  // Drop unused vertices and place the rest.
  const used = new Map<number, number>();
  const pos: number[] = [], keepDirs: Vector3[] = [], keepMasks: number[] = [];
  // The same distance off the outer skin, at rest or with the face in a mouth blend shape.
  const map = (u: Vector3, shape?: (typeof MOUTH_MORPHS)[number]) => {
    const k = smooth(mask(u));
    return outerSkin(c, u, shape).multiplyScalar(1 + EDGE_LIFT + (thick(u) - EDGE_LIFT) * k);
  };
  const placed = (i: number) => {
    let k = used.get(i);
    if (k === undefined) {
      k = keepDirs.length;
      used.set(i, k);
      const u = dirs[i], p = map(u);
      pos.push(p.x, p.y, p.z);
      keepDirs.push(u);
      keepMasks.push(masks[i]);
    }
    return k;
  };
  // Keep each triangle unless it is a needle-thin sliver from the trimming (its corners almost in a line, so it
  // can come out facing either way; too thin to see).
  const idx: number[] = [], A = new Vector3(), B = new Vector3(), C = new Vector3();
  for (let t = 0; t < tris.length; t += 3) {
    const k = [placed(tris[t]), placed(tris[t + 1]), placed(tris[t + 2])];
    A.fromArray(pos, 3 * k[0]);
    B.fromArray(pos, 3 * k[1]);
    C.fromArray(pos, 3 * k[2]);
    const longest = Math.max(A.distanceToSquared(B), B.distanceToSquared(C), C.distanceToSquared(A));
    const area2 = B.clone().sub(A).cross(C.clone().sub(A)).length();
    if (area2 > 0.1 * longest) idx.push(...k);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Normals from the trimmed mesh itself, so the small triangles along the trimmed edge are lit the way they face.
  g.computeVertexNormals();
  // Blend shapes: each point rebuilt on the moved face, as a change from rest.
  const morphs = shapes.map((sh) => {
    const out = new Float32Array(pos.length);
    keepDirs.forEach((u, i) => {
      if (u.z <= 0) return;
      const d = map(u, sh);
      out[3 * i] = d.x - pos[3 * i];
      out[3 * i + 1] = d.y - pos[3 * i + 1];
      out[3 * i + 2] = d.z - pos[3 * i + 2];
    });
    return out;
  });
  return { geo: g, dirs: keepDirs, mask: keepMasks, morphs };
}
/** Masked shells are trimmed where the mask falls below CUT, and stand EDGE_LIFT off the skin there. */
const CUT = 0.05, EDGE_LIFT = 0.006;

/** A tube along a curve whose radius is scaled by fn(t along, a around) (braids, cornrows, locs). */
export function tubeAlong(curve: Curve<Vector3>, segs: number, sides: number, r: number, fn: (t: number, a: number) => number) {
  const g = new TubeGeometry(curve, segs, r, sides, false), p = g.attributes.position, ctr = new Vector3(), o = new Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, ctr);
    for (let j = 0; j <= sides; j++) {
      const ix = i * (sides + 1) + j;
      o.fromBufferAttribute(p, ix).sub(ctr).multiplyScalar(fn(i / segs, j / sides));
      p.setXYZ(ix, ctr.x + o.x, ctr.y + o.y, ctr.z + o.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A surface of revolution around the vertical axis through a smooth profile of [radius, y] points. */
export function lathe(pts: [number, number][], seg = 22) {
  const curve = new SplineCurve(pts.map(([x, y]) => new Vector2(x, y)));
  return new LatheGeometry(curve.getPoints(26), seg);
}
