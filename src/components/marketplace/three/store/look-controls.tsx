"use client";

import { useFrame, useThree, type RootState } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { View } from "./hall";

export interface StoreApi {
  /** Turns the view a little left (-1) or right (1). */
  look: (direction: number) => void;
  /** Turns smoothly to face a direction (yaw: left -, right +; pitch: down -, up +), staying put. */
  focus: (yaw: number, pitch: number) => void;
  /** Glides to stand somewhere and look a certain way. */
  flyTo: (view: View) => void;
  /** Walks forward (1) or back (-1) a step. */
  walk: (direction: number) => void;
  /** Walks to a spot on the floor, keeping the way they face. */
  walkTo: (x: number, z: number) => void;
  /** Back to the entrance, facing the counter. */
  home: () => void;
}

interface LookState {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  velocity: number;
  intro: number;
  dragging: boolean;
  goal: { x: number; z: number; y: number; yaw: number; pitch: number } | null;
}

const PITCH: [number, number] = [-0.75, 0.35];
const EYE = 1.7;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, v));
/** The same angle, moved to within half a turn of `near` (so turning takes the short way round). */
const nearestAngle = (a: number, near: number) => a + Math.round((near - a) / (Math.PI * 2)) * Math.PI * 2;

function entrance(three: RootState) {
  return { x: 0, z: three.size.width / three.size.height < 0.8 ? 4.5 : 5.6 };
}

/** Stands the camera in the shop, turned by yaw/pitch, walking in during the intro. */
function placeCamera(three: RootState, s: LookState, lounge: boolean) {
  const camera = three.camera as THREE.PerspectiveCamera;
  const portrait = three.size.width / three.size.height < 0.8;
  const ease = 1 - Math.pow(1 - s.intro, 3);
  // Walk in from the hall, glancing over at the lounge first.
  const yaw = s.yaw + (1 - ease) * (lounge ? 0.6 : 0.2);
  const pitch = s.pitch + (portrait ? 0.07 : 0.04);
  camera.position.set(s.x + Math.sin(yaw) * 0.6 * (1 - ease), s.y, s.z + (1 - ease) * 3);
  camera.lookAt(camera.position.x + Math.sin(yaw) * Math.cos(pitch), s.y + Math.sin(pitch), camera.position.z - Math.cos(yaw) * Math.cos(pitch));
}

/**
 * Drag (or swipe) to look all the way round; pinch, scroll or tap the floor
 * to walk; products glide the camera up close. Only draws while moving.
 */
export function LookControls({ lounge, apiRef, end }: { lounge: boolean; apiRef?: RefObject<StoreApi | null>; end: number }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = useRef<LookState>({ x: 0, z: 5.6, y: EYE, yaw: 0, pitch: -0.06, velocity: 0, intro: reduced ? 1 : 0, dragging: false, goal: null });
  const bounds = useRef({ x: [-4.7, 4.7] as [number, number], z: [-0.4, end - 0.6] as [number, number] });
  useEffect(() => {
    bounds.current.z = [-0.4, end - 0.6];
  }, [end]);

  // Phones (tall screens) get a wider view so the counter and shelves fit.
  useEffect(() => {
    const three = get();
    const camera = three.camera as THREE.PerspectiveCamera;
    camera.fov = size.width / size.height < 0.8 ? 72 : 58;
    camera.updateProjectionMatrix();
    const s = state.current;
    if (s.intro < 1 && !s.goal) Object.assign(s, entrance(three));
    placeCamera(three, s, lounge);
    three.invalidate();
  }, [get, size, lounge]);

  useEffect(() => {
    const three = get();
    const el = three.gl.domElement;
    const s = state.current;
    const go = (goal: LookState["goal"]) => {
      s.velocity = 0;
      s.intro = 1;
      if (goal) goal.yaw = nearestAngle(goal.yaw, s.yaw);
      s.goal = goal;
      get().invalidate();
    };
    const step = (distance: number) => {
      const b = bounds.current;
      const base = s.goal ?? s;
      go({ ...base, x: clamp(base.x + Math.sin(s.yaw) * distance, b.x), z: clamp(base.z - Math.cos(s.yaw) * distance, b.z), y: EYE, yaw: s.yaw, pitch: clamp(s.pitch, [-0.2, 0.1]) });
    };
    if (apiRef)
      apiRef.current = {
        look: (d) => ((s.goal = null), (s.velocity = d * 0.12), get().invalidate()),
        // Where they're heading, if already walking somewhere.
        focus: (yaw, pitch) => go({ x: (s.goal ?? s).x, z: (s.goal ?? s).z, y: (s.goal ?? s).y, yaw, pitch: clamp(pitch, PITCH) }),
        flyTo: (v) => go({ x: v.x, z: v.z, y: v.y, yaw: v.yaw, pitch: clamp(v.pitch, PITCH) }),
        walk: (d) => step(d * 1.6),
        walkTo: (x, z) => {
          const b = bounds.current;
          const tx = clamp(x, b.x);
          const tz = clamp(z, b.z);
          // Face the way they're walking, unless it's only a short step.
          const far = Math.hypot(tx - s.x, tz - s.z) > 1.2;
          go({ x: tx, z: tz, y: EYE, yaw: far ? Math.atan2(tx - s.x, -(tz - s.z)) : s.yaw, pitch: -0.06 });
        },
        home: () => go({ ...entrance(get()), y: EYE, yaw: 0, pitch: -0.06 }),
      };

    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: number | null = null;
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      s.dragging = true;
      s.goal = null;
      s.velocity = 0;
      s.intro = Math.max(s.intro, 0.999);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const w = el.clientWidth || 1;
      if (pointers.size === 2 && pinch !== null) {
        // Pinch out to walk forward, in to step back.
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const amount = ((d - pinch) / w) * 6;
        pinch = d;
        const bnd = bounds.current;
        s.x = clamp(s.x + Math.sin(s.yaw) * amount, bnd.x);
        s.z = clamp(s.z - Math.cos(s.yaw) * amount, bnd.z);
      } else {
        const delta = (-(e.clientX - last.x) / w) * 2.2;
        s.yaw += delta;
        s.velocity = delta;
        s.pitch = clamp(s.pitch + ((e.clientY - last.y) / w) * 0.8, PITCH);
      }
      placeCamera(get(), s, lounge);
      get().invalidate();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) s.dragging = false;
      get().invalidate();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      step(-Math.sign(e.deltaY) * Math.min(1.2, Math.abs(e.deltaY) / 120));
    };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      if (apiRef) apiRef.current = null;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [get, lounge, apiRef]);

  // Animate the walk-in, the glides and the spin after a swipe.
  useFrame((three, dt) => {
    const s = state.current;
    let moving = false;
    if (s.intro < 1) {
      s.intro = Math.min(1, s.intro + dt / 1.4);
      moving = true;
    }
    if (s.goal && !s.dragging) {
      const t = Math.min(1, dt * 4);
      s.x += (s.goal.x - s.x) * t;
      s.z += (s.goal.z - s.z) * t;
      s.y += (s.goal.y - s.y) * t;
      s.yaw += (s.goal.yaw - s.yaw) * t;
      s.pitch += (s.goal.pitch - s.pitch) * t;
      const left = Math.abs(s.goal.x - s.x) + Math.abs(s.goal.z - s.z) + Math.abs(s.goal.yaw - s.yaw) + Math.abs(s.goal.pitch - s.pitch) + Math.abs(s.goal.y - s.y);
      if (left < 0.003) s.goal = null;
      moving = true;
    }
    if (!s.dragging && Math.abs(s.velocity) > 0.0002) {
      s.yaw += s.velocity;
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
