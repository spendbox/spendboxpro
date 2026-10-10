// Poses a built avatar on the CPU (as the GPU would), for tests that check moving shapes.
import { Bone, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Skeleton, SkinnedMesh, Vector3 } from "three";
import { type Rest } from "../moves.ts";
import type { Model, Part } from "../parts.ts";

export function rigOf(m: Model) {
  const bones: Record<string, Bone> = {}, root = new Group(), list: Bone[] = [];
  for (const n of m.nodes) {
    const b = new Bone();
    b.name = n.id;
    new Matrix4().fromArray(n.matrix).decompose(b.position, b.quaternion, b.scale);
    bones[n.id] = b;
    list.push(b);
  }
  for (const n of m.nodes) (n.parent ? bones[n.parent] : root).add(bones[n.id]);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(list);
  const rest: Rest = new Map(list.map((b) => [b.name, { p: b.position.clone(), q: b.quaternion.clone() }]));
  return { bones, root, rest, skeleton };
}

/** A skinned part's points in the current pose, as a plain mesh (for raycasting). */
export function posedMesh(p: Part, skeleton: Skeleton) {
  const sm = new SkinnedMesh(p.geo, new MeshBasicMaterial());
  sm.bind(skeleton, new Matrix4());
  skeleton.update();
  const P = p.geo.attributes.position, out = new Float32Array(P.count * 3), v = new Vector3();
  for (let k = 0; k < P.count; k++) {
    sm.getVertexPosition(k, v);
    out.set([v.x, v.y, v.z], k * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(out, 3));
  g.setIndex(p.geo.index);
  g.computeBoundingSphere();
  return new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }));
}
