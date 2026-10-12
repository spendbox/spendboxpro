"use client";

import { useEffect, useRef, useState } from "react";

// The on-foot joystick: put a thumb on it and push the way you want to walk (up = the way the
// camera looks). It writes straight into `stick` (read by the 3D city every frame). Arrow keys
// and WASD work too, on a computer.

export function Joystick({ stick: ref }: { stick: { current: { x: number; y: number } } }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touch = useRef<number | null>(null);
  const R = 46;

  const move = (cx: number, cy: number) => {
    const r = pad.current?.getBoundingClientRect();
    if (!r) return;
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    ref.current.x = dx / R;
    ref.current.y = -dy / R;
  };
  const end = () => {
    touch.current = null;
    setKnob({ x: 0, y: 0 });
    ref.current.x = 0;
    ref.current.y = 0;
  };

  // Keys on a computer.
  useEffect(() => {
    const stick = ref.current;
    const down = new Set<string>();
    const apply = () => {
      stick.x = (down.has("right") ? 1 : 0) - (down.has("left") ? 1 : 0);
      stick.y = (down.has("up") ? 1 : 0) - (down.has("down") ? 1 : 0);
    };
    const which = (k: string) => ({ ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" })[k];
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      const w = which(e.key);
      if (!w) return;
      down.add(w);
      apply();
    };
    const ku = (e: KeyboardEvent) => {
      const w = which(e.key);
      if (!w) return;
      down.delete(w);
      apply();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      stick.x = 0;
      stick.y = 0;
    };
  }, [ref]);

  return (
    <div
      ref={pad}
      onPointerDown={(e) => {
        touch.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => touch.current === e.pointerId && move(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      className="pointer-events-auto relative grid size-32 touch-none select-none place-items-center rounded-full bg-black/25 ring-2 ring-white/50 backdrop-blur-sm"
      aria-label="Walk: push the way you want to go"
      role="application"
    >
      <span className="absolute top-1.5 text-[10px] font-semibold text-white/80">Walk</span>
      <span className="size-14 rounded-full bg-white/90 shadow-lg" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
