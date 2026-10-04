import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Little shape helpers. Many coloured pieces are merged into one mesh (one draw
// call), so each piece carries its colour in its vertices.

/** Paints every vertex one colour (and makes the shape non-indexed so pieces can be merged). */
export function paint(geometry: THREE.BufferGeometry, color: string) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const c = new THREE.Color(color);
  const count = g.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

export function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return paint(g, color);
}

export function cylinder(rt: number, rb: number, h: number, x: number, y: number, z: number, color: string, segments = 16) {
  const g = new THREE.CylinderGeometry(rt, rb, h, segments);
  g.translate(x, y, z);
  return paint(g, color);
}

export function blob(r: number, x: number, y: number, z: number, color: string) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.translate(x, y, z);
  return paint(g, color);
}

export function disc(r: number, x: number, y: number, z: number, color: string) {
  const g = new THREE.CircleGeometry(r, 32);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Merges painted pieces into one shape and frees the pieces. */
export function merge(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** A stable number in [0, 1) from a string, for variety that doesn't change between visits. */
export function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function mix(a: string, b: string, amount: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), amount).getHexString()}`;
}
