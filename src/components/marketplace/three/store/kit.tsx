"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { merge, mix, paint } from "../geometry";
import { useDispose } from "../hooks";
import { caneWeave, darkMarble, leaf, linen, whiteMarble, woodGrain } from "./surfaces";

// The store's materials (marble, leather, wood, brass...) and a small kit for
// building furniture from simple shapes. Every piece with the same material
// is merged into one mesh, so a whole room is only a handful of draw calls.

export type Mat =
  | "matte" // painted walls, plaster
  | "satin" // lacquer, ceramic pots, painted wood
  | "wood"
  | "marble"
  | "darkMarble"
  | "leather"
  | "fabric"
  | "linen"
  | "brass"
  | "metal"
  | "cane"
  | "leaf"
  | "china"
  | "glass";

export type Materials = Record<Mat, THREE.Material>;

function makeMaterials(): Materials {
  const tinted = { vertexColors: true, color: "#ffffff" } as const;
  return {
    matte: new THREE.MeshStandardMaterial({ ...tinted, roughness: 0.92 }),
    satin: new THREE.MeshStandardMaterial({ ...tinted, roughness: 0.38 }),
    wood: new THREE.MeshStandardMaterial({ ...tinted, map: woodGrain(), roughness: 0.55 }),
    marble: new THREE.MeshStandardMaterial({ map: whiteMarble(), roughness: 0.12 }),
    darkMarble: new THREE.MeshStandardMaterial({ map: darkMarble(), roughness: 0.14 }),
    // Glossy leather, like a well-kept banquette.
    leather: new THREE.MeshPhysicalMaterial({ ...tinted, roughness: 0.48, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
    fabric: new THREE.MeshStandardMaterial({ ...tinted, map: linen(), roughness: 1 }),
    linen: new THREE.MeshStandardMaterial({ map: linen(), roughness: 0.95 }),
    brass: new THREE.MeshStandardMaterial({ color: "#c9a25a", metalness: 1, roughness: 0.28 }),
    metal: new THREE.MeshStandardMaterial({ ...tinted, metalness: 0.75, roughness: 0.38 }),
    cane: new THREE.MeshStandardMaterial({ map: caneWeave(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
    leaf: new THREE.MeshStandardMaterial({ ...tinted, map: leaf(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 }),
    china: new THREE.MeshStandardMaterial({ ...tinted, roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false }),
  };
}

const MaterialsContext = createContext<Materials | null>(null);

export function MaterialsProvider({ children }: { children: ReactNode }) {
  const materials = useMemo(() => makeMaterials(), []);
  useDispose(useMemo(() => ({ dispose: () => Object.values(materials).forEach((m) => m.dispose()) }), [materials]));
  return <MaterialsContext.Provider value={materials}>{children}</MaterialsContext.Provider>;
}

export function useMaterials() {
  const m = useContext(MaterialsContext);
  if (!m) throw new Error("useMaterials needs a MaterialsProvider");
  return m;
}

type Vec = [number, number, number];

/** Collects shapes by material, then merges each material's shapes into one. */
export class Kit {
  private parts = new Map<Mat, THREE.BufferGeometry[]>();
  private frame: THREE.Matrix4 | null = null;

  /** Builds the shapes made inside `draw` standing at `position`, turned by `rotY` (like a group). */
  place(position: Vec, rotY: number, draw: () => void) {
    const previous = this.frame;
    const local = new THREE.Matrix4().makeRotationY(rotY).setPosition(...position);
    this.frame = previous ? previous.clone().multiply(local) : local;
    draw();
    this.frame = previous;
    return this;
  }

  add(mat: Mat, geometry: THREE.BufferGeometry, color = "#ffffff", at: Vec = [0, 0, 0], rot: Vec = [0, 0, 0]) {
    geometry.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    geometry.translate(at[0], at[1], at[2]);
    if (this.frame) geometry.applyMatrix4(this.frame);
    if (!geometry.attributes.uv) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position!.count * 2), 2));
    const list = this.parts.get(mat) ?? [];
    list.push(paint(geometry, color));
    this.parts.set(mat, list);
    return this;
  }

  box(mat: Mat, size: Vec, at: Vec, color?: string, rot?: Vec) {
    return this.add(mat, new THREE.BoxGeometry(...size), color, at, rot);
  }

  /** A box with soft, rounded edges (cushions, tabletops, cabinets). */
  rbox(mat: Mat, size: Vec, radius: number, at: Vec, color?: string, rot?: Vec) {
    const r = Math.min(radius, size[0] / 2.01, size[1] / 2.01, size[2] / 2.01);
    return this.add(mat, new RoundedBoxGeometry(size[0], size[1], size[2], 3, r), color, at, rot);
  }

  cyl(mat: Mat, top: number, bottom: number, height: number, at: Vec, color?: string, segments = 24, rot?: Vec) {
    return this.add(mat, new THREE.CylinderGeometry(top, bottom, height, segments), color, at, rot);
  }

  /** A turned shape (vase, plate, glass, lamp) from its outline: [radius, height] pairs. */
  lathe(mat: Mat, outline: [number, number][], at: Vec, color?: string, segments = 28) {
    return this.add(mat, new THREE.LatheGeometry(outline.map(([r, y]) => new THREE.Vector2(r, y)), segments), color, at);
  }

  sphere(mat: Mat, radius: number, at: Vec, color?: string, scale: Vec = [1, 1, 1]) {
    return this.add(mat, new THREE.SphereGeometry(radius, 20, 14).scale(...scale), color, at);
  }

  torus(mat: Mat, radius: number, tube: number, at: Vec, color?: string, rot?: Vec, arc = Math.PI * 2, scale: Vec = [1, 1, 1]) {
    return this.add(mat, new THREE.TorusGeometry(radius, tube, 10, 40, arc).scale(...scale), color, at, rot);
  }

  /**
   * A curved, padded piece (booth seats and backs): a ring section between two
   * radii, from angle a0 to a1 (0 = straight back, -z), puffed at the edges.
   */
  sector(mat: Mat, inner: number, outer: number, a0: number, a1: number, height: number, y: number, color?: string, puff = 0.04) {
    const shape = new THREE.Shape();
    const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) * 12));
    const pts: THREE.Vector2[] = [];
    // Shape space: (x, y) = (sin a, cos a) * r; rotating it flat sends y to -z.
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push(new THREE.Vector2(Math.sin(a) * (outer - puff), Math.cos(a) * (outer - puff)));
    }
    for (let i = steps; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push(new THREE.Vector2(Math.sin(a) * (inner + puff), Math.cos(a) * (inner + puff)));
    }
    shape.setFromPoints(pts);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, height - puff * 2), bevelEnabled: puff > 0, bevelThickness: puff, bevelSize: puff, bevelSegments: 3, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    // Extrusion now runs up from 0 (plus the bevel below); sit it at y.
    return this.add(mat, g, color, [0, y + puff, 0]);
  }

  /** A flat, bent leaf on a stem, pointing along `angle` and leaning out by `lean`. */
  leaf(at: Vec, angle: number, lean: number, length: number, color = "#ffffff") {
    const g = new THREE.PlaneGeometry(length * 0.42, length, 1, 6);
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + length / 2) / length;
      pos.setZ(i, -t * t * length * 0.35);
      pos.setX(i, pos.getX(i) * (1 - Math.abs(pos.getX(i)) * 0.4));
    }
    g.translate(0, length / 2, 0);
    g.computeVertexNormals();
    return this.add("leaf", g, color, at, [lean, angle, 0]);
  }

  build(): BuiltParts {
    const out: BuiltParts = [];
    for (const [mat, list] of this.parts) out.push([mat, merge(list)]);
    this.parts.clear();
    return out;
  }
}

export type BuiltParts = [Mat, THREE.BufferGeometry][];

/** Draws what a Kit built: one mesh per material, casting and catching shadows. */
export function Built({ parts, shadows = true }: { parts: BuiltParts; shadows?: boolean }) {
  const materials = useMaterials();
  useDispose(useMemo(() => ({ dispose: () => parts.forEach(([, g]) => g.dispose()) }), [parts]));
  return (
    <>
      {parts.map(([mat, geometry]) => (
        <mesh key={mat} geometry={geometry} material={materials[mat]} castShadow={shadows && mat !== "glass"} receiveShadow />
      ))}
    </>
  );
}

/** Softer, lighter version of a colour for leather (the accent, made sage-like and calm). */
export function leatherOf(accent: string) {
  return mix(mix(accent, "#7f9a6a", 0.45), "#e9e4d6", 0.12);
}
