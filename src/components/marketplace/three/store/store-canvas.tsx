"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import { accentOf, type StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import { shade } from "../textures";
import { LookControls, type StoreApi } from "./look-controls";
import { Bell, Lights, Room, Shelves, Signs, type StoreBusiness, type StoreTarget } from "./pieces";

/** A business's 3D store ("Boutique" theme), as React components. */
export default function StoreCanvas({
  business,
  theme,
  products,
  onSelect,
  apiRef,
}: {
  business: StoreBusiness;
  theme: StoreTheme;
  products: StoreProduct[];
  onSelect: (target: StoreTarget) => void;
  apiRef?: RefObject<StoreApi | null>;
}) {
  const accent = accentOf(theme, business.brand_color);
  const dark = theme.wall === "#2F3A34";
  const warm = theme.lights === "warm";
  const mobile = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches, []);
  return (
    <Canvas
      flat
      // Draw only when something changes (looking around, a picture loading, the bell).
      frameloop="demand"
      dpr={[1, mobile ? 1.75 : 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 58, near: 0.1, far: 100, position: [0, 1.7, 8] }}
      aria-label={`Inside ${business.name}`}
    >
      <color attach="background" args={[dark ? "#1d2420" : shade(theme.wall, -0.06)]} />
      <hemisphereLight args={[warm ? "#fff4e3" : "#eef5ff", warm ? "#8a6a4a" : "#6c7a88", dark ? 1.4 : 1.7]} />
      <directionalLight position={[2, 6, 6]} intensity={1.1} color={warm ? "#ffe9c7" : "#f2f7ff"} />
      <LookControls lounge={theme.lounge} apiRef={apiRef} />
      <Room theme={theme} accent={accent} />
      <Lights theme={theme} accent={accent} />
      <Signs business={business} theme={theme} accent={accent} onAbout={() => onSelect({ kind: "about" })} />
      <Bell onRing={() => onSelect({ kind: "bell" })} />
      <Shelves products={products} accent={accent} onSelect={onSelect} />
    </Canvas>
  );
}
