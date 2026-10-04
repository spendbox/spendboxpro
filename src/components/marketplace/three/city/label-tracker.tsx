"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface LabelPlacement {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Works out, every frame, where each shop's label belongs on screen, and hands
 * the positions to the map (which moves its label buttons without re-rendering).
 */
export function LabelTracker({ anchors, onPlace }: { anchors: { id: string; x: number; y: number; z: number }[]; onPlace: (placements: LabelPlacement[]) => void }) {
  useFrame(({ camera, size }) => {
    const v = new THREE.Vector3();
    onPlace(
      anchors.map((a) => {
        v.set(a.x, a.y, a.z).project(camera);
        const x = ((v.x + 1) / 2) * size.width;
        const y = ((1 - v.y) / 2) * size.height;
        return { id: a.id, x, y, visible: x > -80 && x < size.width + 80 && y > -40 && y < size.height + 40 };
      }),
    );
  });
  return null;
}
