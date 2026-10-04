"use client";

import { type ThreeEvent } from "@react-three/fiber";
import { useEffect, useState, type ReactNode } from "react";

/** Runs a handler for a tap, but not at the end of a drag (which looks around). */
export function tap<E extends ThreeEvent<MouseEvent>>(handler: (e: E) => void) {
  return (e: E) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    handler(e);
  };
}

/** Shows the pointer cursor while hovering something tappable. */
export function useHoverCursor(enabled = true) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered, enabled]);
  return {
    hovered: enabled && hovered,
    handlers: enabled
      ? {
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            setHovered(true);
          },
          onPointerOut: () => setHovered(false),
        }
      : {},
  };
}

/** A group you can tap (when `onTap` is given); otherwise just a group. */
export function Tappable({
  onTap,
  children,
  position,
  rotationY,
}: {
  onTap?: () => void;
  children: ReactNode;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const hover = useHoverCursor(Boolean(onTap));
  return (
    <group position={position} rotation-y={rotationY} onClick={onTap ? tap(onTap) : undefined} {...hover.handlers}>
      {children}
    </group>
  );
}
