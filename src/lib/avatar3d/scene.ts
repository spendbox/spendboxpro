// Turns a built model into three.js objects, and drives the face (blink, look around, expressions).

import { Bone, Group, Matrix4, Mesh, type Object3D, Skeleton, SkinnedMesh } from "three";
import { LID_MORPHS } from "./eyes.ts";
import { MOUTH_MORPHS } from "./face.ts";
import type { MaterialSet } from "./materials.ts";
import type { Model } from "./parts.ts";

export type FaceState = { smile: number; open: number; pucker: number; wide: number; brow: number; lid: number };
export const NEUTRAL: FaceState = { smile: 0, open: 0, pucker: 0, wide: 0, brow: 0, lid: 0 };

export type AvatarObject = {
  root: Group;
  /** Every bone by name (body bones, and the head's jaw, eyes and brows). */
  nodes: Record<string, Object3D>;
  /** Each bone's rest position and rotation (poses are applied relative to these). */
  rest: Map<string, { p: import("three").Vector3; q: import("three").Quaternion }>;
  mouth: Mesh[];
  lids: Mesh[];
  /** Current expression (eased toward the target each frame). */
  face: FaceState;
  faceH: number;
};

/**
 * Turns the built model into three.js objects: a bone for every node (the skeleton), rigid parts
 * hanging from their bones, and skinned parts bound to the skeleton.
 */
export function mountModel(model: Model, mats: MaterialSet): AvatarObject {
  const nodes: Record<string, Object3D> = {}, bones: Bone[] = [];
  for (const n of model.nodes) {
    const b = new Bone();
    b.name = n.id;
    new Matrix4().fromArray(n.matrix).decompose(b.position, b.quaternion, b.scale);
    nodes[n.id] = b;
    bones.push(b);
  }
  const root = new Group();
  for (const n of model.nodes) {
    if (n.parent) nodes[n.parent].add(nodes[n.id]);
    else root.add(nodes[n.id]);
  }
  // Bind in the rest pose, with the avatar at the origin.
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  const rest = new Map(bones.map((b) => [b.name, { p: b.position.clone(), q: b.quaternion.clone() }]));
  const mouth: Mesh[] = [], lids: Mesh[] = [];
  for (const p of model.parts) {
    const m = p.skinned ? new SkinnedMesh(p.geo, mats.get(p.mat)) : new Mesh(p.geo, mats.get(p.mat));
    m.name = p.name;
    if (p.mat === "cornea") m.renderOrder = 1;
    if (m instanceof SkinnedMesh) {
      root.add(m);
      m.frustumCulled = false; // its bounds move with the pose
      m.bind(skeleton, new Matrix4());
    } else nodes[p.node].add(m);
    if (p.morphs?.[0] === MOUTH_MORPHS[0]) mouth.push(m);
    if (p.morphs?.[0] === LID_MORPHS[0]) lids.push(m);
  }
  return { root, nodes, rest, mouth, lids, face: { ...NEUTRAL }, faceH: model.meta.faceH };
}

/**
 * Eases the face toward a target expression. blink is 0..1 (1 = shut).
 * gaze turns the eyeballs (x up/down, y left/right, in radians).
 */
export function updateFace(a: AvatarObject, target: Partial<FaceState>, blink: number, gaze: { x: number; y: number }, dt: number) {
  const cur = a.face, k = Math.min(1, dt * 9);
  for (const key of Object.keys(cur) as (keyof FaceState)[]) cur[key] += ((target[key] ?? 0) - cur[key]) * k;
  for (const m of a.mouth) {
    const inf = m.morphTargetInfluences!;
    inf[0] = cur.smile;
    inf[1] = cur.open;
    inf[2] = cur.pucker;
    inf[3] = cur.wide;
  }
  const jaw = a.nodes.jaw;
  if (jaw) jaw.position.y = -cur.open * 0.115 * a.faceH;
  const brows = a.nodes.brows;
  if (brows) brows.position.y = cur.brow * 0.045;
  for (const m of a.lids) {
    const inf = m.morphTargetInfluences!;
    inf[0] = blink;
    inf[1] = Math.max(0, cur.lid) * (1 - blink);
    inf[2] = Math.max(0, -cur.lid) * (1 - blink);
  }
  for (const id of ["eyeball0", "eyeball1"]) {
    const b = a.nodes[id];
    if (!b) continue;
    b.rotation.x += (gaze.x - b.rotation.x) * 0.3;
    b.rotation.y += (gaze.y - b.rotation.y) * 0.3;
  }
}
