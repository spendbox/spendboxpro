// The whole avatar: the head (head.ts) on the body, with clothes and jewellery, from a recipe.
//
// Nodes (moving pieces): avatar > head; avatar > body > chest > arm0/arm1 > hand0/hand1;
// body > leg0/leg1. Index 0 is the avatar's right side (x < 0), 1 its left.

import { type BufferGeometry, DoubleSide, type LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, Object3D, Raycaster, Vector3 } from "three";
import { CROTCH_Y, THIGH_SQUASH, bodyParams, crInterp, handGeos, limbGeo, mirrorX, shoeGeo, torsoModel } from "./body.ts";
import { HEAD_HEIGHT_SHARE, HEIGHTS, OUTFITS } from "./catalog.ts";
import { type Dress, armClothes, cuff, hijabDrape, robes, torsoClothes } from "./clothing.ts";
import { buildHead } from "./head.ts";
import { chain, watch } from "./jewellery.ts";
import { PI, smooth } from "./math.ts";
import { type Model, type Node, type Part } from "./parts.ts";
import type { Recipe } from "./recipe.ts";

/** The neck joint: the body and head scale about this height (so height changes keep them joined). */
const NECK_Y = -1.4;

const matrixOf = (o: Object3D) => {
  o.updateMatrix();
  return o.matrix.toArray();
};

/** Only the triangles of g between heights y0 and y1 (the neck), so tests against it are quick. */
function neckBand(g: BufferGeometry, y0: number, y1: number) {
  const p = g.attributes.position, I = g.index!.array, keep: number[] = [];
  for (let i = 0; i < I.length; i += 3) {
    const ys = [p.getY(I[i]), p.getY(I[i + 1]), p.getY(I[i + 2])];
    if (Math.max(...ys) >= y0 && Math.min(...ys) <= y1) keep.push(I[i], I[i + 1], I[i + 2]);
  }
  g.setIndex(keep);
  g.computeBoundingSphere();
  return g;
}

/** Level of detail: 1 for your own avatar, 0.5 for players nearby. */
export function buildAvatar(r: Recipe, lod = 1): Model {
  const head = buildHead(r, lod);
  const B = bodyParams(r), fem = r.frame === 1, O = OUTFITS[r.outfit], T = torsoModel(B);
  const shirtless = !!B.shirtless || !!O.swim;
  const parts: Part[] = [], nodes: Node[] = [];
  const add = (name: string, node: string, geo: BufferGeometry, mat: Part["mat"], surface: Part["surface"] = "sheet") => parts.push({ name, node, geo, mat, surface });
  const node = (id: string, parent: string | null, o?: Object3D) => nodes.push({ id, parent, matrix: o ? matrixOf(o) : new Matrix4().toArray() });

  // Height: the body stretches about the neck; the head grows only a little (head size varies far less than height).
  const s = HEIGHTS[r.height].s, H = B.h * s, W = B.w * (1 + (s - 1) * 0.6), hs = 1 + (s - 1) * HEAD_HEIGHT_SHARE;
  node("avatar", null);
  const ho = new Object3D();
  ho.position.set(0, NECK_Y + (-0.14 - NECK_Y) * hs, 0);
  ho.scale.setScalar(hs);
  node("head", "avatar", ho);
  const bo = new Object3D();
  bo.position.y = NECK_Y * (1 - H);
  bo.scale.set(W, H, W);
  node("body", "avatar", bo);
  node("chest", "body");

  // The neck (part of the head's skin), in body space, for fitting collars to it.
  const skin = head.parts.find((p) => p.name === "headSkin")!;
  const neckMesh = new Mesh(neckBand(skin.geo.clone().applyMatrix4(ho.matrix).applyMatrix4(bo.matrix.clone().invert()), -2.3, -1.1), new MeshBasicMaterial({ side: DoubleSide }));
  neckMesh.updateMatrixWorld();
  const ray = new Raycaster(), zc = (T.P(-1.4, 0).z + T.P(-1.4, PI).z) / 2;
  const neck: Dress["neck"] = (y, th) => {
    const centre = new Vector3(0, y, zc), q = T.P(y, th);
    ray.set(centre, new Vector3(q.x, 0, q.z - zc).normalize());
    const hit = ray.intersectObject(neckMesh, false)[0];
    return hit ? { centre, dist: hit.distance } : null;
  };
  const d: Dress = { T, B, O, fem, lod, shirtless, add, neck };
  torsoClothes(d);

  // Arms: upper arm 3.0, forearm 2.4, hand 1.75 (elbow at the navel, wrist at the crotch, fingertips at mid-thigh).
  const shY = T.shY, shX = crInterp(T.L, T.X, shY), L1 = 3.0 * B.limbL, L2 = 2.4 * B.limbL, at = B.armT, bendA = -0.16;
  const armPts: [number, number][] = [
    [0, -0.12], [0.3 * at * B.armD, -0.2], [0.44 * at * B.armD, -0.42], [0.47 * at * B.armB, -1.0], [0.46 * at * B.armB, -1.7], [0.4 * at, -2.5],
    [0.35 * at, -L1], [0.42 * at * B.armF, -L1 - 0.55], [0.38 * at * B.armF, -L1 - 1.2], [0.29 * at, -L1 - L2 + 0.25], [0.25 * at, -L1 - L2],
    [0.15 * at, -L1 - L2 - 0.15], [0, -L1 - L2 - 0.26],
  ];
  const sq = (y: number): [number, number] => {
    const t = smooth((-y - L1 - 0.6) / (L2 - 0.6));
    return [1 - 0.22 * t, 1 + 0.14 * t];
  };
  [-1, 1].forEach((side, i) => {
    // The arm hangs just clear of the torso (wider bodies hold their arms further out).
    const x0 = shX - 0.08;
    let ang = 0.05 + 0.03 * Math.max(0, at - 1);
    for (let y = shY - 1.4; y > Math.max(shY - (L1 + L2) * 0.95, -7.3); y -= 0.15) {
      const rr = 0.44 * at * (y > shY - L1 ? B.armB : B.armF) * 0.8, xt = Math.max(T.P(y, PI / 2).x, T.P(y, PI * 0.4).x);
      ang = Math.max(ang, Math.atan2(xt + rr - x0, shY - y));
    }
    const ao = new Object3D();
    ao.position.set(side * x0, shY, 0);
    ao.rotation.z = side * Math.min(ang, 0.5);
    node(`arm${i}`, "chest", ao);
    const longS = armClothes(d, `arm${i}`, armPts, L1, bendA, sq);
    const ho2 = new Object3D();
    ho2.position.set(0, -L1 - L2 * Math.cos(bendA), -L2 * Math.sin(bendA));
    ho2.rotation.set(bendA, 0, 0);
    node(`hand${i}`, `arm${i}`, ho2);
    if (longS) cuff(d, `hand${i}`);
    const hand = handGeos(B.limbL * (fem ? 0.92 : 1) * Math.max(0.92, Math.min(1.2, 0.75 + 0.25 * at)), fem, lod);
    const place = (g: BufferGeometry) => (side < 0 ? mirrorX(g) : g);
    hand.skin.forEach((g, k) => add(`hand${i}_${k}`, `hand${i}`, place(g), "skin", "closed"));
    hand.nails.forEach((g, k) => add(`nail${i}_${k}`, `hand${i}`, place(g), "nail", "closed"));
    if (side > 0) watch(add, `hand${i}`, r.watch, at, lod);
  });

  // Legs: thigh 4.0, shin 3.6, ankle about 0.75 above the floor. Each leg starts at the crotch with the
  // same size and place as the hips' thigh tops (its flat top tucked just inside the hips).
  const LT = 4.0 * B.limbL, LS = 3.6 * B.limbL, lt = B.legT, cf = B.calf, topY = -6.55, legX = T.legX, jy = CROTCH_Y - topY;
  // The thigh tapers evenly from the hip to the knee.
  const kneeR = 0.47 * (lt * 0.5 + 0.5), lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const legPts: [number, number][] = [
    [0, jy + 0.16], [0.6 * T.legR, jy + 0.155], [0.86 * T.legR, jy + 0.12], [T.legR, jy], [lerp(T.legR, kneeR, 0.3), -2.0], [lerp(T.legR, kneeR, 0.75), -3.3],
    [kneeR, -LT], [0.5 * cf, -LT - 0.7], [0.56 * cf, -LT - 1.25], [0.46 * cf, -LT - 2.0], [0.32 * (cf * 0.4 + 0.6), -LT - 2.9],
    [0.27, -LT - LS + 0.15], [0.27, -LT - LS], [0, -LT - LS - 0.06],
  ];
  const legM: Part["mat"] = O.bare || O.swim || shirtless ? "skin" : O.match ? "top" : "bottom";
  const lsq = (y: number): [number, number] => {
    const t = smooth((-y - LT + 0.4) / 1.2);
    return [1 - 0.06 * t, THIGH_SQUASH + 0.06 * t];
  };
  /** The buttocks carry on over the backs of the thighs (matching the hips exactly at the crotch). */
  const glutes = (g: BufferGeometry, side: number) => {
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), r = Math.hypot(x, z);
      // Only below the crotch: the leg's top, tucked inside the hips, stays tucked.
      const d = r > 1e-6 && topY + y <= CROTCH_Y + 1e-6 ? T.glute(topY + y, side * legX + x, z) : 0;
      if (d) p.setXYZ(k, x + (x / r) * d, y, z + (z / r) * d);
    }
    g.computeVertexNormals();
    // The row at the crotch would also average in the leg's hidden top (which turns inwards), lighting
    // it as if it faced up; give it the shading of the leg just below so hips and thigh shade as one.
    const n = g.attributes.normal, rows = g.attributes.position.count / ((g as LatheGeometry).parameters.segments + 1);
    for (let k = 0; k < p.count; k++) {
      if (Math.abs(p.getY(k) - jy) < 1e-4 && k % rows > 0) n.setXYZ(k, n.getX(k - 1), n.getY(k - 1), n.getZ(k - 1));
    }
    return g;
  };
  [-1, 1].forEach((side, i) => {
    const lo = new Object3D();
    lo.position.set(side * legX, topY, 0);
        node(`leg${i}`, "body", lo);
    add(`leg${i}Skin`, `leg${i}`, glutes(limbGeo(legPts, 18, lod, null, lsq), side), legM);
    if (shirtless && !(O.swim && fem)) {
      // Shorts (bodybuilder) or swim trunks.
      const sh: [number, number][] = legPts.filter(([, y]) => y > -2.4).map(([x, y]) => [x * 1.05 + 0.02, y]);
      sh.push([lerp(T.legR, kneeR, 0.44) * 1.05 + 0.02, -2.4]);
      add(`leg${i}Shorts`, `leg${i}`, glutes(limbGeo(sh, 18, lod, null, lsq), side), O.swim ? "top" : "bottom");
    }
    const fl = 2.45 * (B.h < 1 ? 0.92 : 1);
    // The shoe stands on the floor; the ankle is just inside its collar.
    // Its upper sits down inside the sole's rim, so the sole wraps it with no gap.
    add(`shoe${i}`, `leg${i}`, shoeGeo(fl * 0.985, 0.95, 1.05, lod).translate(0, -LT - LS - 0.48, 0), "shoe", "closed");
    add(`sole${i}`, `leg${i}`, shoeGeo(fl, 0.98, 0.24, lod, true).translate(0, -LT - LS - 0.55, 0), "sole", "closed");
  });
  const floorY = topY - LT - LS - 0.55;
  robes(d, shX, floorY);
  chain(d, r.chain);
  // The hijab's drape is refitted to the body (the head alone doesn't know where the shoulders are).
  const hijab = head.parts.findIndex((p) => p.name === "hijabDrape");
  if (hijab >= 0) {
    head.parts.splice(hijab, 1);
    const toBody = new Matrix4().copy(bo.matrix).invert().multiply(ho.matrix), k = fem ? 0.86 : 1;
    // Where the head's hijab ends round the neck (the top of its own drape), at each angle.
    const ring = (th: number) => new Vector3(1.0 * k * Math.sin(th), -0.95, 0.86 * k * Math.cos(th) - 0.06).applyMatrix4(toBody);
    add("hijabDrape", "chest", hijabDrape(d, ring), "hw");
  }

  // The head's own nodes hang from the avatar.
  const headNodes = head.nodes.map((n) => (n.parent === null ? { ...n, parent: "avatar", matrix: nodes.find((m) => m.id === "head")!.matrix } : n));
  return {
    nodes: [...nodes.filter((n) => n.id !== "head"), ...headNodes],
    parts: [...head.parts, ...parts],
    meta: { faceH: head.meta.faceH, floorY: NECK_Y * (1 - H) + floorY * H },
  };
}

/** Where the avatar's feet are, for placing it on the ground (before any posing). */
export const footY = (m: Model) => m.meta.floorY ?? 0;
