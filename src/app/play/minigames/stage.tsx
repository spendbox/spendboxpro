"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

// The drawing board most action games use: a canvas with its own fixed units (W × H, sharp on
// every screen), a drawing loop, and taps / drags in those same units. Anything in `children`
// sits on top (scores, buttons).

export type Pointer = { x: number; y: number; id: number };
export type StageHandlers = {
  /** Called every frame: draw here (ctx is already scaled to W × H units). dt in seconds. */
  frame: (ctx: CanvasRenderingContext2D, dt: number, t: number) => void;
  down?: (p: Pointer) => void;
  move?: (p: Pointer) => void;
  up?: (p: Pointer) => void;
};

export function Stage({
  w,
  h,
  handlers,
  className,
  children,
  running = true,
  bg = "#10161f",
}: {
  w: number;
  h: number;
  handlers: StageHandlers;
  className?: string;
  children?: React.ReactNode;
  running?: boolean;
  bg?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hRef = useRef(handlers);
  useEffect(() => {
    hRef.current = handlers;
  });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      hRef.current.frame(ctx, dt, t / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w, h, running, bg]);

  const at = (e: React.PointerEvent): Pointer => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h, id: e.pointerId };
  };

  return (
    <div className={cn("relative mx-auto w-full overflow-hidden rounded-3xl select-none", className)} style={{ aspectRatio: `${w} / ${h}`, maxHeight: "62dvh", maxWidth: `calc(62dvh * ${w / h})` }}>
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          hRef.current.down?.(at(e));
        }}
        onPointerMove={(e) => hRef.current.move?.(at(e))}
        onPointerUp={(e) => hRef.current.up?.(at(e))}
        onPointerCancel={(e) => hRef.current.up?.(at(e))}
        onContextMenu={(e) => e.preventDefault()}
      />
      {children}
    </div>
  );
}

/** The score and timer bar along the top of a stage. */
export function Hud({ left, right, centre }: { left?: React.ReactNode; right?: React.ReactNode; centre?: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2 text-sm font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
      <span className="tabular-nums">{left}</span>
      <span className="truncate tabular-nums">{centre}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );
}

/** Big on-screen buttons under a stage (left / right / action...). */
export function Pads({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex gap-2">{children}</div>;
}
export function Pad({ onDown, onUp, children, className }: { onDown: () => void; onUp?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("flex min-h-14 flex-1 touch-none select-none items-center justify-center gap-2 rounded-2xl bg-ink text-base font-bold text-white active:scale-95", className)}
    >
      {children}
    </button>
  );
}

/** Keyboard keys while a game is on screen (computers). */
export function useKeys(down: (key: string) => void, up?: (key: string) => void) {
  const d = useRef(down);
  const u = useRef(up);
  useEffect(() => {
    d.current = down;
    u.current = up;
  });
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
      d.current(e.key);
    };
    const ku = (e: KeyboardEvent) => u.current?.(e.key);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);
}

/** Calls onEnd(score) once, at most (engines can call finish() freely). */
export function useFinish(onEnd: (score: number) => void) {
  const done = useRef(false);
  const cb = useRef(onEnd);
  useEffect(() => {
    cb.current = onEnd;
  });
  return (score: number) => {
    if (done.current) return;
    done.current = true;
    cb.current(score);
  };
}
