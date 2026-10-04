"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { accentOf, readTheme } from "@/lib/store-theme";
import type { ExploreBusiness } from "@/lib/types";
import { blob, box, hash, merge, mix } from "../geometry";
import { useDispose } from "../hooks";
import { awningTexture, shade, shopSignTexture } from "../textures";
import { PLOT, PLOT_D } from "./layout";

const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

/**
 * One shop on the map: walls in its colours, a striped awning, its sign, a
 * door, windows and plants. It rises into place when the map opens. (Its
 * name label is an ordinary button drawn over the map; see LabelTracker.)
 */
export function Shop({
  business,
  position,
  delay,
  animate,
  onOpen,
}: {
  business: ExploreBusiness;
  position: [number, number, number];
  delay: number;
  animate: boolean;
  onOpen: (business: ExploreBusiness) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const theme = readTheme(business.store_theme);
  const accent = accentOf(theme, business.brand_color);
  const r = hash(business.id);
  const height = 2.6 + r * 1.6;
  const chosenWall = (business.store_theme as { wall?: string } | null)?.wall;
  const wall = chosenWall ? (theme.wall === "#2F3A34" ? "#3b4842" : shade(theme.wall, -0.04)) : mix(accent, "#ffffff", 0.78);

  const body = useMemo(() => {
    const w = 4.6;
    const d = 4;
    const front = d / 2 - 0.4;
    const parts = [
      box(PLOT - 0.6, 0.08, PLOT_D - 0.6, 0, 0.22, 0, "#ece8de"),
      box(w, height, d, 0, 0.26 + height / 2, -0.4, wall),
      box(w + 0.3, 0.3, d + 0.3, 0, 0.26 + height + 0.15, -0.4, shade(accent, -0.08)),
      box(w - 0.2, 0.12, d - 0.2, 0, 0.26 + height + 0.36, -0.4, "#e7e2d8"),
      box(1.1, 1.75, 0.12, 0, 0.26 + 0.875, front + 0.04, "#3a2a1f"),
      box(1.25, 0.12, 0.16, 0, 0.26 + 1.8, front + 0.06, shade(accent, -0.1)),
      box(1.25, 1.05, 0.08, -1.55, 0.26 + 1.15, front + 0.02, "#bfe3f0"),
      box(1.25, 1.05, 0.08, 1.55, 0.26 + 1.15, front + 0.02, "#bfe3f0"),
      box(1.4, 0.1, 0.25, -1.55, 0.26 + 0.6, front + 0.1, "#ffffff"),
      box(1.4, 0.1, 0.25, 1.55, 0.26 + 0.6, front + 0.1, "#ffffff"),
      box(0.5, 0.45, 0.5, -2.75, 0.26 + 0.22, d / 2 + 0.2, "#b86f4b"),
      box(0.5, 0.45, 0.5, 2.75, 0.26 + 0.22, d / 2 + 0.2, "#b86f4b"),
      blob(0.42, -2.75, 0.26 + 0.75, d / 2 + 0.2, "#4f9b4a"),
      blob(0.42, 2.75, 0.26 + 0.75, d / 2 + 0.2, "#4f9b4a"),
    ];
    if (height > 3.4) for (const x of [-1.4, 0, 1.4]) parts.push(box(0.9, 0.7, 0.08, x, 0.26 + height - 0.75, front + 0.02, "#bfe3f0"));
    if (r > 0.55) parts.push(box(0.5, 0.9, 0.5, 1.4, 0.26 + height + 0.75, -1.4, shade(wall, -0.2)));
    return merge(parts);
  }, [height, wall, accent, r]);
  useDispose(body);
  const awning = useMemo(() => awningTexture(accent), [accent]);
  useDispose(awning);
  const sign = useMemo(() => shopSignTexture(business.name, accent, business.logo_url), [business.name, accent, business.logo_url]);
  useDispose(sign);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || g.scale.y >= 1) return;
    if (!animate) {
      g.scale.y = 1;
      return;
    }
    born.current ??= clock.elapsedTime;
    const t = Math.max(0, Math.min(1, (clock.elapsedTime - born.current - delay) / 0.65));
    g.scale.y = Math.max(0.001, easeOutBack(t));
  });

  const open = (e: ThreeEvent<MouseEvent>) => {
    // A tap, not the end of a drag.
    if (e.delta > 8) return;
    e.stopPropagation();
    onOpen(business);
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = on ? "pointer" : "";
  };

  return (
    <group ref={group} position={position} scale-y={animate ? 0.001 : 1} onClick={open} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      <mesh geometry={body}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {/* Soft shadow */}
      <mesh rotation-x={-Math.PI / 2} position={[0.5, 0.27, -0.1]}>
        <planeGeometry args={[5.8, 5.2]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.26 + 2.25, 1.95]} rotation-x={-0.75}>
        <planeGeometry args={[4.8, 1.2]} />
        <meshLambertMaterial map={awning} transparent side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.26 + Math.min(height - 0.55, 3.2), 1.67]}>
        <planeGeometry args={[3.6, 0.9]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
    </group>
  );
}
