"use client";

import { useFrame, useThree, type RootState } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

export interface MapApi {
  zoomBy: (factor: number) => void;
}

interface MapState {
  target: THREE.Vector3;
  zoom: number;
  velocity: THREE.Vector2;
  dragging: number;
}

const OFFSET = new THREE.Vector3(60, 66, 60);

/** Points the bird's-eye camera at the target, at the zoom (about 34 units tall on wide screens, 40 on tall). */
function placeCamera(three: RootState, s: MapState) {
  const { camera, size } = three;
  const viewH = size.width > size.height ? 34 : 40;
  camera.zoom = (size.height / viewH) * s.zoom;
  camera.position.copy(s.target).add(OFFSET);
  camera.lookAt(s.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  three.invalidate();
}

function clampTarget(s: MapState, b: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const m = 6;
  s.target.x = Math.max(b.minX - m, Math.min(b.maxX + m, s.target.x));
  s.target.z = Math.max(b.minZ - m, Math.min(b.maxZ + m, s.target.z));
}

/**
 * Bird's-eye camera for the map: drag to move (with a little glide after),
 * pinch or scroll to zoom towards your fingers or cursor. It keeps the town
 * in view.
 */
export function MapControls({
  bounds,
  startZoom,
  apiRef,
}: {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  startZoom: number;
  apiRef: RefObject<MapApi | null>;
}) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const state = useRef<MapState>({ target: new THREE.Vector3(), zoom: startZoom, velocity: new THREE.Vector2(), dragging: 0 });

  useEffect(() => {
    placeCamera(get(), state.current);
  }, [get, size]);

  useEffect(() => {
    const three = get();
    const el = three.gl.domElement;
    const s = state.current;
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number } | null = null;

    const groundPoint = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, get().camera);
      return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    };
    const setZoom = (next: number, x: number, y: number) => {
      const before = groundPoint(x, y);
      s.zoom = Math.max(0.5, Math.min(2.4, next));
      placeCamera(get(), s);
      const after = groundPoint(x, y);
      if (before && after) s.target.add(before.sub(after));
      clampTarget(s, bounds);
      placeCamera(get(), s);
    };
    apiRef.current = {
      zoomBy: (f) => {
        const rect = el.getBoundingClientRect();
        setZoom(s.zoom * f, rect.left + rect.width / 2, rect.top + rect.height / 2);
      },
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      s.dragging = pointers.size;
      s.velocity.set(0, 0);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: s.zoom };
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (pointers.size === 2 && pinch) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        setZoom(pinch.zoom * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / Math.max(1, pinch.dist)), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        return;
      }
      const from = groundPoint(p.x, p.y);
      const to = groundPoint(e.clientX, e.clientY);
      p.x = e.clientX;
      p.y = e.clientY;
      if (from && to) {
        const delta = from.sub(to);
        s.target.add(delta);
        s.velocity.set(delta.x, delta.z);
        clampTarget(s, bounds);
        placeCamera(get(), s);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      s.dragging = pointers.size;
      if (pointers.size < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(s.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      apiRef.current = null;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [get, bounds, apiRef]);

  // Glide after letting go.
  useFrame((three) => {
    const s = state.current;
    if (s.dragging || s.velocity.lengthSq() < 0.00001) return;
    s.target.x += s.velocity.x * 0.9;
    s.target.z += s.velocity.y * 0.9;
    s.velocity.multiplyScalar(0.9);
    clampTarget(s, bounds);
    placeCamera(three, s);
  });

  return null;
}
