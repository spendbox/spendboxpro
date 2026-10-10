// The skeleton and skin weights: turns the built avatar (parts hanging from rigid nodes) into a
// skinned one, where every point of the body and its clothes moves with one to four bones, blended
// smoothly across the joints (shoulder, elbow, wrist, hip, knee, ankle, toes, spine, neck).
//
// Bones rest with no rotation (only an offset from their parent), so in animations their axes are the
// avatar's own: x to its left, y up, z forward. Weights depend only on where a point is on the body,
// so skin and every layer of clothing over it move together and never pass through each other.

import { BufferAttribute, type BufferGeometry, Matrix4, Vector3 } from "three";
import { CROTCH_Y } from "./body.ts";
import { smooth } from "./math.ts";
import type { Node, Part } from "./parts.ts";

/** The body's bones, parent first. Index 0 is the avatar's right side (x < 0), 1 its left. */
export const BODY_BONES: [string, string][] = [
  ["hips", "avatar"], ["spine", "hips"], ["chest", "spine"], ["neck", "chest"], ["skull", "neck"],
  ["clavicle0", "chest"], ["upperArm0", "clavicle0"], ["forearm0", "upperArm0"], ["hand0", "forearm0"],
  ["clavicle1", "chest"], ["upperArm1", "clavicle1"], ["forearm1", "upperArm1"], ["hand1", "forearm1"],
  ["thigh0", "hips"], ["shin0", "thigh0"], ["foot0", "shin0"], ["toe0", "foot0"],
  ["thigh1", "hips"], ["shin1", "thigh1"], ["foot1", "shin1"], ["toe1", "foot1"],
];

/** Everything the rig needs to know about the built body (all heights in the body's own units). */
export type RigInput = {
  /** Model-space matrix of each node the parts were built on (avatar, head, body, chest, arm0, hand0, leg0, ...). */
  M: Map<string, Matrix4>;
  /** The head's own nodes (jaw, eyes, brows), with "head" as their root. */
  headNodes: Node[];
  shY: number;
  L1: number;
  L2: number;
  LT: number;
  LS: number;
  /** Where each leg meets the hips, in the leg node's frame. */
  jy: number;
  /** How far forward the ball of the foot is from the ankle. */
  ballZ: number;
  /** x of each thigh's centre (body units), and the arm's starting x. */
  legX: number;
};

const BODY_Y = { hips: -6.45, spine: -5.1, chest: -3.45, neck: -1.5 };

export type Rig = { nodes: Node[]; skin: (p: Part) => Part };

export function buildRig(R: RigInput): Rig {
  const M = R.M, body = M.get("body")!, head = M.get("head")!;
  const at = (node: string, x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(M.get(node)!);
  const inBody = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(body);
  const pos = new Map<string, Vector3>();
  pos.set("avatar", new Vector3());
  pos.set("hips", inBody(0, BODY_Y.hips, -0.05));
  pos.set("spine", inBody(0, BODY_Y.spine, -0.15));
  pos.set("chest", inBody(0, BODY_Y.chest, -0.1));
  pos.set("neck", inBody(0, BODY_Y.neck, -0.12));
  // The skull turns on the top of the neck, about level with the earlobes, behind the jaw.
  pos.set("skull", new Vector3(0, -0.45, -0.12).applyMatrix4(head));
  for (const i of [0, 1]) {
    const s = i ? 1 : -1;
    pos.set(`clavicle${i}`, inBody(s * 0.25, BODY_Y.neck - 0.08, -0.05));
    pos.set(`upperArm${i}`, at(`arm${i}`, 0, 0, 0));
    pos.set(`forearm${i}`, at(`arm${i}`, 0, -R.L1, 0));
    pos.set(`hand${i}`, at(`hand${i}`, 0, 0, 0));
    pos.set(`thigh${i}`, at(`leg${i}`, 0, -0.2, 0));
    pos.set(`shin${i}`, at(`leg${i}`, 0, -R.LT, 0));
    pos.set(`foot${i}`, at(`leg${i}`, 0, -R.LT - R.LS, 0));
    pos.set(`toe${i}`, at(`leg${i}`, 0, -R.LT - R.LS - 0.5, R.ballZ));
  }
  const nodes: Node[] = [{ id: "avatar", parent: null, matrix: new Matrix4().toArray() }];
  for (const [id, parent] of BODY_BONES) {
    nodes.push({ id, parent, matrix: new Matrix4().makeTranslation(pos.get(id)!.clone().sub(pos.get(parent)!)).toArray() });
  }
  // The head's own nodes hang from the skull (the head keeps its own scale and offset).
  const skullInv = new Matrix4().makeTranslation(pos.get("skull")!.clone().negate());
  for (const n of R.headNodes) {
    nodes.push(n.parent === null ? { ...n, parent: "skull", matrix: skullInv.clone().multiply(head).toArray() } : n);
  }
  const index = new Map(nodes.map((n, k) => [n.id, k]));
  const bodyInv = body.clone().invert(), headInv = head.clone().invert();

  // ---- weights ----
  type W = Map<string, number>;
  const add = (w: W, bone: string, v: number) => v > 1e-4 && w.set(bone, (w.get(bone) ?? 0) + v);
  /** Spine chain by height: hips, spine, chest, neck, blended between neighbours. */
  const spineW = (w: W, y: number, k: number) => {
    const chain: [string, number][] = [["hips", BODY_Y.hips], ["spine", BODY_Y.spine], ["chest", BODY_Y.chest], ["neck", BODY_Y.neck]];
    if (y <= chain[0][1]) return add(w, "hips", k);
    if (y >= chain[3][1]) return add(w, "neck", k);
    for (let c = 0; c < 3; c++) {
      const [b0, y0] = chain[c], [b1, y1] = chain[c + 1];
      if (y <= y1) {
        const t = smooth((y - y0) / (y1 - y0));
        add(w, b0, k * (1 - t));
        add(w, b1, k * t);
        return;
      }
    }
  };
  const shX = new Vector3().copy(pos.get("upperArm1")!).applyMatrix4(bodyInv).x;
  /** The torso and everything on it (clothes, robes, chains): spine, shoulders, and the tops of the thighs. */
  const torsoW = (p: Vector3, hanging: boolean): W => {
    const w: W = new Map(), q = p.clone().applyMatrix4(bodyInv), side = q.x < 0 ? 0 : 1, ax = Math.abs(q.x);
    // Shoulders: the deltoid goes with the arm, the top of the shoulder with the collarbone.
    const arm = 0.8 * smooth((ax - shX * 0.72) / (shX * 0.35)) * smooth((q.y - (R.shY - 1.2)) / 0.7);
    const clav = (1 - arm) * 0.6 * smooth((ax - 0.35) / 0.55) * smooth((q.y - (R.shY - 0.9)) / 0.6);
    add(w, `upperArm${side}`, arm);
    add(w, `clavicle${side}`, clav);
    let rest = 1 - arm - clav;
    // Below the waist the hips divide into the thighs: there the cloth and skin follow the legs.
    const split = hanging ? 0.5 * smooth((CROTCH_Y + 0.2 - q.y) / 0.6) + 0.15 * smooth((CROTCH_Y - q.y) / 3) : 0.7 * smooth((-6.45 - q.y) / (-6.45 - CROTCH_Y));
    if (split > 0) {
      const s = smooth(0.5 + q.x / (R.legX * (hanging ? 3 : 1.6)));
      add(w, "thigh1", rest * split * s);
      add(w, "thigh0", rest * split * (1 - s));
      rest *= 1 - split;
    }
    spineW(w, q.y, rest);
    return w;
  };
  /** A point on an arm (arm node frame): shoulder, elbow, wrist. */
  const armW = (i: number, p: Vector3): W => {
    const w: W = new Map(), q = p.clone().applyMatrix4(M.get(`arm${i}`)!.clone().invert()), s = -q.y;
    const top = smooth((s + 0.1) / 0.7), fore = smooth((s - (R.L1 - 0.35)) / 0.7), hand = smooth((s - (R.L1 + R.L2 - 0.15)) / 0.3);
    add(w, `clavicle${i}`, (1 - top) * 0.5);
    spineW(w, p.clone().applyMatrix4(bodyInv).y, (1 - top) * 0.5);
    add(w, `upperArm${i}`, top * (1 - fore));
    add(w, `forearm${i}`, top * fore * (1 - hand));
    add(w, `hand${i}`, top * fore * hand);
    return w;
  };
  /** A point on a leg (leg node frame): hip, knee, ankle, ball of the foot. */
  const legW = (i: number, p: Vector3): W => {
    const w: W = new Map(), q = p.clone().applyMatrix4(M.get(`leg${i}`)!.clone().invert()), s = -q.y;
    // At the crotch the leg matches the hips (70% thigh), becoming all thigh further down.
    const thigh = 0.7 + 0.3 * smooth((s + R.jy) / 1.0), shin = smooth((s - (R.LT - 0.35)) / 0.7);
    const foot = smooth((s - (R.LT + R.LS - 0.12)) / 0.25), toe = smooth((q.z - (R.ballZ - 0.15)) / 0.3);
    add(w, "hips", 1 - thigh);
    add(w, `thigh${i}`, thigh * (1 - shin));
    add(w, `shin${i}`, thigh * shin * (1 - foot));
    add(w, `foot${i}`, thigh * shin * foot * (1 - toe));
    add(w, `toe${i}`, thigh * shin * foot * toe);
    return w;
  };
  /** The neck (the head's skin below the jaw): head, neck and chest blended down its length. */
  const neckW = (p: Vector3): W => {
    const w: W = new Map(), h = p.clone().applyMatrix4(headInv);
    // The jaw line: low at the chin, rising towards the back (where the skull meets the neck).
    const jaw = -0.5 - 0.62 * smooth((h.z + 0.2) / 0.9), neckness = smooth((jaw - h.y) / 0.4);
    add(w, "head", 1 - neckness);
    const y = p.clone().applyMatrix4(bodyInv).y, low = smooth((BODY_Y.neck + 0.1 - y) / 0.5);
    add(w, "neck", neckness * (1 - low));
    add(w, "chest", neckness * low);
    return w;
  };

  const HANGING = /^(skirt|dressSkirt|tunic|topTail|hemBorder|agbada|abaya|jalabiya|wrapPanel|wrapKnot|blazerTail|pencilSkirt)$/;
  const HEAD_SKINNED = /^(headSkin|hijab)$/;
  const skin = (p: Part): Part => {
    const node = p.node, g = p.geo.clone();
    let wf: (v: Vector3) => W;
    const arm = /^(arm|hand)(\d)$/.exec(node), leg = /^leg(\d)$/.exec(node);
    if (node === "head" && HEAD_SKINNED.test(p.name)) wf = neckW;
    else if (arm) wf = (v) => armW(+arm[2], v);
    else if (leg) wf = (v) => legW(+leg[1], v);
    else if (node === "chest" || node === "body") wf = (v) => torsoW(v, HANGING.test(p.name));
    else return p; // the head's rigid parts (face, eyes, hair, headwear...) stay on their nodes
    g.applyMatrix4(M.get(node)!);
    const P = g.attributes.position, n = P.count, si = new Float32Array(n * 4), sw = new Float32Array(n * 4), v = new Vector3();
    for (let k = 0; k < n; k++) {
      const w = [...wf(v.fromBufferAttribute(P, k)).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = w.reduce((t, [, x]) => t + x, 0) || 1;
      w.forEach(([bone, x], j) => {
        si[k * 4 + j] = index.get(bone)!;
        sw[k * 4 + j] = x / sum;
      });
    }
    g.setAttribute("skinIndex", new BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new BufferAttribute(sw, 4));
    return { ...p, geo: g as BufferGeometry, node: "avatar", skinned: true };
  };
  return { nodes, skin };
}
