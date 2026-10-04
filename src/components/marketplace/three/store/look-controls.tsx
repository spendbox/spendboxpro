"use client";

import { useFrame, useThree, type RootState } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

export interface StoreApi {
  /** Turns the view a little left (-1) or right (1). */
  look: (direction: number) => void;
}

interface LookState {
  yaw: number;
  pitch: number;
  velocity: number;
  intro: number;
  dragging: boolean;
}

/** Stands the camera in the shop, turned by yaw/pitch, walking in during the intro. */
function placeCamera(three: RootState, s: LookState, lounge: boolean) {
  const camera = three.camera as THREE.PerspectiveCamera;
  const portrait = three.size.width / three.size.height < 0.8;
  const ease = 1 - Math.pow(1 - s.intro, 3);
  // Walk in from the door, glancing over at the lounge first.
  const yaw = s.yaw + (1 - ease) * (lounge ? 0.6 : 0.2);
  const pitch = s.pitch + (portrait ? 0.07 : 0.04);
  camera.position.set(Math.sin(yaw) * 0.6, 1.7, (portrait ? 4.5 : 5.6) + (1 - ease) * 3);
  camera.lookAt(camera.position.x + Math.sin(yaw) * Math.cos(pitch), 1.7 + Math.sin(pitch), camera.position.z - Math.cos(yaw) * Math.cos(pitch));
}

/** Drag (or swipe) to look around the shop, with a little glide after letting go. */
export function LookControls({ lounge, apiRef }: { lounge: boolean; apiRef?: RefObject<StoreApi | null> }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = useRef<LookState>({ yaw: 0, pitch: -0.06, velocity: 0, intro: reduced ? 1 : 0, dragging: false });

  // Phones (tall screens) get a wider view so the counter and shelves fit.
  useEffect(() => {
    const three = get();
    const camera = three.camera as THREE.PerspectiveCamera;
    camera.fov = size.width / size.height < 0.8 ? 72 : 58;
    camera.updateProjectionMatrix();
    placeCamera(three, state.current, lounge);
    three.invalidate();
  }, [get, size, lounge]);

  useEffect(() => {
    const three = get();
    const el = three.gl.domElement;
    const s = state.current;
    let last: { x: number; y: number } | null = null;
    if (apiRef) apiRef.current = { look: (d) => ((s.velocity = d * 0.12), get().invalidate()) };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
      s.dragging = true;
      s.velocity = 0;
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const w = el.clientWidth || 1;
      const delta = (-(e.clientX - last.x) / w) * 1.6;
      s.yaw = Math.max(-0.95, Math.min(0.95, s.yaw + delta));
      s.velocity = delta;
      s.pitch = Math.max(-0.28, Math.min(0.12, s.pitch + ((e.clientY - last.y) / w) * 0.6));
      last = { x: e.clientX, y: e.clientY };
      placeCamera(get(), s, lounge);
      get().invalidate();
    };
    const up = () => {
      last = null;
      s.dragging = false;
      get().invalidate();
    };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      if (apiRef) apiRef.current = null;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [get, lounge, apiRef]);

  // Animate the walk-in and the glide; only draw frames while something moves.
  useFrame((three, dt) => {
    const s = state.current;
    let moving = false;
    if (s.intro < 1) {
      s.intro = Math.min(1, s.intro + dt / 1.4);
      moving = true;
    }
    if (!s.dragging && Math.abs(s.velocity) > 0.0002) {
      s.yaw = Math.max(-0.95, Math.min(0.95, s.yaw + s.velocity));
      s.velocity *= 0.9;
      moving = true;
    }
    if (moving) {
      placeCamera(three, s, lounge);
      three.invalidate();
    }
  });

  return null;
}
