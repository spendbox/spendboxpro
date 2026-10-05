"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { CarMaterialSpec, CarModel, CarPart } from "./coupe";

// The showroom car, built once per detail level and shared by every car in
// every shop for the visit: geometry is the heavy part, so a fleet of ten
// costs about the same memory as one. Built in a worker where the browser
// has them, so the shop never freezes while it's made.

export interface CarGeometry {
  parts: Record<"body" | "wheel", { material: string; geometry: THREE.BufferGeometry }[]>;
  nodes: CarModel["nodes"];
  materials: Record<string, CarMaterialSpec>;
  dims: CarModel["dims"];
}

const built = new Map<number, Promise<CarGeometry>>();

function toGeometry(p: CarPart) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(p.normals, 3));
  // Half the memory for indices where the part is small enough.
  const small = p.positions.length / 3 < 65536;
  g.setIndex(new THREE.BufferAttribute(small ? Uint16Array.from(p.indices) : p.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function fromModel(car: CarModel): CarGeometry {
  return {
    parts: {
      body: car.meshes.body.map((p) => ({ material: p.material, geometry: toGeometry(p) })),
      wheel: car.meshes.wheel.map((p) => ({ material: p.material, geometry: toGeometry(p) })),
    },
    nodes: car.nodes,
    materials: car.materials,
    dims: car.dims,
  };
}

function buildOnce(detail: number): Promise<CarGeometry> {
  return new Promise((resolve, reject) => {
    const inPage = () =>
      // No workers: build here, after the shop has drawn its first frames.
      setTimeout(() => {
        import("./coupe").then(({ buildCar }) => resolve(fromModel(buildCar(detail))), reject);
      }, 300);
    if (typeof Worker === "undefined") return inPage();
    try {
      const worker = new Worker(new URL("./car-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<CarModel>) => {
        resolve(fromModel(e.data));
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        inPage();
      };
      worker.postMessage({ detail });
    } catch {
      inPage();
    }
  });
}

export function loadCar(detail: number) {
  let p = built.get(detail);
  if (!p) {
    p = buildOnce(detail);
    built.set(detail, p);
    // A failed build can be tried again next time.
    p.catch(() => built.delete(detail));
  }
  return p;
}

/** The car at this detail level, once it's built (null until then). */
export function useCar(detail: number) {
  const [car, setCar] = useState<{ detail: number; geometry: CarGeometry } | null>(null);
  useEffect(() => {
    let alive = true;
    loadCar(detail).then(
      (geometry) => alive && setCar({ detail, geometry }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [detail]);
  return car?.detail === detail ? car.geometry : null;
}
