// Headwear: face cap, head tie, gele, kufi, fila and hijab.
// Caps follow the skull and leave room for the hair underneath; ties and gele add volume and folds;
// the hijab frames the face and drapes down over the shoulders.

import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Object3D, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { skinPoint } from "./face.ts";
import { hairThickness, hairUnder } from "./hair.ts";
import type { HeadCtx } from "./head-shape.ts";
import { PI, bell, smooth } from "./math.ts";
import { type Part, ROOT, ellGeo } from "./parts.ts";
import { type DirFn, capShell, earClear, lathe } from "./shells.ts";

/** Thickness of each hairstyle close to the head (fraction of the radius), so caps sit on top of it. */
const HAIR_THICKNESS = [0, 0.025, 0.09, 0.115, 0.115, 0.03, 0.03, 0.06, 0.06, 0.075, 0.055, 0.03];

/** Bakes a scaled, rotated, positioned copy of a geometry (scale first, then rotation, then position). */
function placed(g: SphereGeometry | TubeGeometry, pos: Vector3, rot: [number, number, number] = [0, 0, 0], scale?: Vector3) {
  const o = new Object3D();
  o.position.copy(pos);
  o.rotation.set(...rot);
  if (scale) o.scale.copy(scale);
  o.updateMatrix();
  return g.applyMatrix4(o.matrix);
}

/**
 * A cap's peak: a thin D-shaped bill along the front of the crown's rim, pitched slightly down and
 * curving down at the sides, as a worn cap's does. Top surface (with the edges) and underside are
 * separate so the underside can be darker. (The prototype's was a flattened ball on the forehead,
 * which looked like a disc from the front.) edgeLift: how far the crown's rim stands off the skin.
 */
function capVisor(c: HeadCtx, rim: DirFn, edgeLift: DirFn) {
  const NS = Math.max(10, Math.round(26 * c.lod)), NT = Math.max(3, Math.round(6 * c.lod)), half = 0.95, half_t = 0.011;
  const U = (a: number, ph: number) => new Vector3(Math.sin(a) * Math.sin(ph), Math.cos(a), Math.sin(a) * Math.cos(ph));
  const mid: Vector3[][] = [];
  for (let i = 0; i <= NS; i++) {
    const s = (2 * i) / NS - 1, ph = s * half;
    // Where the crown's rim is at this angle (as capShell finds it).
    let lo = 0.02, hi = PI * 0.97;
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2;
      if (U(m, ph).y - rim(U(m, ph)) > 0) lo = m;
      else hi = m;
    }
    const u = U(lo, ph), A = skinPoint(c, u).multiplyScalar(1.004 + edgeLift(u));
    const out = new Vector3(A.x, 0, A.z).normalize().add(new Vector3(0, -0.2, 0)).normalize();
    const depth = 0.56 * c.F.w * Math.pow(Math.max(0, 1 - s * s), 0.45) + 0.02;
    const row: Vector3[] = [];
    for (let j = 0; j <= NT; j++) {
      const t = j / NT;
      row.push(A.clone().addScaledVector(out, t * depth).add(new Vector3(0, -0.11 * s * s * t - 0.03 * t * t, 0)));
    }
    mid.push(row);
  }
  const W = NT + 1;
  const sheet = (dy: number, flip: boolean, extra?: (pos: number[], idx: number[]) => void) => {
    const pos: number[] = [], idx: number[] = [];
    for (const row of mid) for (const p of row) pos.push(p.x, p.y + dy, p.z);
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * W + j, b = a + 1, cc = a + W, d = cc + 1;
        if (flip) idx.push(a, b, d, a, d, cc);
        else idx.push(a, d, b, a, cc, d);
      }
    }
    extra?.(pos, idx);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // Top surface plus the band round its edge (down to the underside), so the peak has thickness.
  const top = sheet(half_t, true, (pos, idx) => {
    const base = pos.length / 3;
    const edgeIds: [number, number][] = [];
    for (let i = 0; i <= NS; i++) edgeIds.push([i, NT]);
    for (const [k, [i, j]] of edgeIds.entries()) {
      const p = mid[i][j];
      pos.push(p.x, p.y + half_t, p.z, p.x, p.y - half_t, p.z);
      if (k > 0) {
        const a = base + 2 * (k - 1), b = a + 1, cc = base + 2 * k, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
  });
  return { top, under: sheet(-half_t, false) };
}

export function headwear(c: HeadCtx): Part[] {
  const w = c.recipe.hw, F = c.F;
  if (!w) return [];
  const hairT = HAIR_THICKNESS[Math.max(0, hairUnder(c.recipe))] || 0;
  // Caps stay just outside the hair under them, right down to the rim (the prototype's thinned towards the
  // rim, so hair could show through the lower part of the cap).
  const overHair: DirFn = (u) => {
    const t = hairThickness(c, u);
    return t > 0 ? t + 0.012 : 0;
  };
  const parts: Part[] = [];
  const add = (name: string, geo: Part["geo"], mat: Part["mat"] = "hw", surface: Part["surface"] = "sheet") =>
    parts.push({ name, mat, node: ROOT, geo, surface });

  if (w === 1) {
    // Face cap: six-panel crown, a curved peak (visor) at the front, top button.
    const crown = (u: Vector3) => hairT + 0.05 + 0.05 * smooth((u.y - 0.4) / 0.5), rim: DirFn = (u) => 0.3 + 0.16 * u.z;
    add("capCrown", capShell(c, 72, 22, rim, crown, { floor: overHair }));
    const visor = capVisor(c, rim, (u) => Math.max(overHair(u), 0.1 * crown(u)));
    add("capVisor", visor.top);
    add("capVisorUnder", visor.under, "hwDark");
    add("capButton", ellGeo(0.07, 0.04, 0.07, 10, c.lod, new Vector3(0, F.h * 1.12 + hairT + 0.04, 0)), "hwDark", "closed");
    [-0.9, 0, 0.9].forEach((a, i) => {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const th = 0.05 + (k / 12) * 1.05, u = new Vector3(Math.sin(th) * Math.sin(a), Math.cos(th), Math.sin(th) * Math.cos(a));
        pts.push(skinPoint(c, u).multiplyScalar(1.004 + Math.max(crown(u), overHair(u)) + 0.004));
      }
      add(`capSeam${i}`, new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.008, 4, false), "hwDark", "closed");
    });
  }
  if (w === 4) {
    // Kufi: snug round cap with an embroidered band (the band is in its texture).
    add("kufi", capShell(c, 72, 20, () => 0.4, (u) => hairT + 0.04 - 0.04 * smooth((u.y - 0.85) / 0.15), { floor: overHair }), "kufi");
  }
  if (w === 5) {
    // Fila (abeti-aja): soft cap whose crown folds over to one side, with its two flaps.
    add("fila", capShell(c, 72, 24, () => 0.38,
      (u) => hairT + 0.05 + 0.32 * smooth((u.y - 0.55) / 0.4) * smooth((u.x + 0.1) / 0.7) + 0.1 * smooth((u.y - 0.7) / 0.3), { floor: overHair }));
    for (const [i, z] of [0.24, -0.3].entries()) {
      add(`filaFlap${i}`, placed(ellGeo(0.12, 0.2, 0.14, 12, c.lod), new Vector3(F.w * 0.95, F.h * 0.86, z), [0, 0, -0.7]), "hw", "closed");
    }
  }
  if (w === 2 || w === 3) {
    // Head tie / gele base: wraps the head above the ears, fuller at the back.
    const overEar = earClear(c, 0.06);
    const edge = (u: Vector3) => Math.max(u.z >= 0 ? 0.38 * u.z + 0.08 * (1 - u.z) : 0.08 + 0.75 * u.z, overEar(u));
    add("wrap", capShell(c, 80, 26, edge, (u) =>
      hairT + 0.08 + 0.12 * smooth((u.y - 0.3) / 0.6) + 0.12 * smooth(-u.z) * smooth((u.y + 0.2) / 0.6) + 0.012 * Math.sin(Math.atan2(u.x, u.z) * 7 + u.y * 12)));
    if (w === 2) {
      // Knot on top with two loops.
      const kp = new Vector3(0.25, F.h * 1.12, 0.35);
      add("tieKnot", ellGeo(0.2, 0.16, 0.16, 14, c.lod, kp), "hw", "closed");
      for (const sx of [-1, 1]) {
        add(`tieLoop${sx > 0 ? 1 : 0}`, placed(ellGeo(0.32, 0.12, 0.05, 14, c.lod), kp.clone().add(new Vector3(sx * 0.26, 0.08, -0.04)), [0, 0, sx * 0.45]), "hw", "closed");
      }
    } else {
      // Gele: stiff pleated fan rising above the head, with a knot at the front.
      const grp = new Object3D(), pleat = new Object3D();
      grp.add(pleat);
      for (let k = 0; k < 13; k++) {
        const a = -1.25 + (2.5 * k) / 12;
        grp.position.set(0, F.h * 0.8, -0.05);
        grp.rotation.set(-0.38, 0, a * 0.95);
        pleat.position.set(0, 0.45, 0);
        pleat.rotation.set(0, k % 2 ? 0.55 : -0.55, 0);
        pleat.scale.set(0.26, 0.95 - (0.25 * Math.abs(a)) / 1.25, 0.1);
        grp.updateMatrixWorld(true);
        const seg = Math.max(8, Math.round(16 * c.lod));
        add(`gelePleat${k}`, new SphereGeometry(1, seg, Math.max(6, Math.round(10 * c.lod)), 0, PI * 2, 0, PI * 0.55).applyMatrix4(pleat.matrixWorld), k % 2 ? "hw" : "hwSheen");
      }
      add("geleKnot", ellGeo(0.32, 0.22, 0.24, 14, c.lod, new Vector3(0, F.h, 0.52)), "hw", "closed");
    }
  }
  if (w === 6) {
    // Hijab: covers the head, ears and neck, open around the face, and drapes to the chest.
    const inFace = (u: Vector3) => u.z > 0.15 && (u.x / 0.74) ** 2 + ((u.y + 0.22) / 0.74) ** 2 < 1;
    // The cap ends at the neck, where the drape takes over (the prototype's ran on down the neck under the drape).
    add("hijab", capShell(c, 84, 34, (u) => (inFace(u) ? 2 : -0.9),
      // (Extra thickness low down, where its edge tucks into the drape: there it stays well off the neck.)
      (u) => 0.05 + 0.1 * bell((Math.abs(u.x) - 0.95) / 0.25) * smooth((u.y + 0.6) / 0.4) + 0.04 * smooth((-u.z - 0.2) / 0.6) + 0.06 * smooth((-u.y - 0.6) / 0.2), { smoothEdge: 14 }));
    const k = c.fem ? 0.86 : 1;
    // Profile traced from the bottom up, so the surface faces outward.
    const drape = lathe([[0, -3.06], [1.9 * k, -3.05], [1.82 * k, -2.75], [1.62 * k, -2.35], [1.3 * k, -1.8], [1.08 * k, -1.3], [1.0 * k, -0.95]], Math.max(16, Math.round(40 * c.lod)));
    add("hijabDrape", drape.scale(1, 1, 0.86).translate(0, 0, -0.06));
  }
  return parts;
}
