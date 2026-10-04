"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { accentOf, type StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import { shade } from "../textures";
import { MaterialsProvider } from "./kit";
import { LookControls, type StoreApi } from "./look-controls";
import { Lounge } from "./lounge";
import { Bell, Board, Decor, GiftBox, Lights, ProductScreen, WallArt, type StoreBusiness, type StoreTarget } from "./pieces";
import { Plants } from "./plants";
import { Backdrop, Counter, Furniture, Room } from "./room";

/**
 * Soft studio light from every direction, made in code (no download). It's
 * what gives marble, leather and brass their reflections.
 */
function StudioLight({ intensity }: { intensity: number }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene, invalidate } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [get, intensity]);
  return null;
}

/**
 * A business's 3D store ("Boutique" theme), as React components. Shoppers can
 * tap products, the bell and the welcome board; with `editing` on (the
 * business's own editor), tapping anything picks it to change.
 */
export default function StoreCanvas({
  business,
  theme,
  products,
  onSelect,
  apiRef,
  editing = false,
  hasGift = false,
}: {
  business: StoreBusiness;
  theme: StoreTheme;
  products: StoreProduct[];
  onSelect: (target: StoreTarget) => void;
  apiRef?: RefObject<StoreApi | null>;
  editing?: boolean;
  /** Put a gift on the counter (the business has perks). */
  hasGift?: boolean;
}) {
  const accent = accentOf(theme, business.brand_color);
  const dark = theme.wall === "#2F3A34";
  const warm = theme.lights.tone === "warm";
  const pick = (target: StoreTarget) => (editing ? () => onSelect(target) : undefined);
  const mobile = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches, []);
  return (
    <Canvas
      // Draw only when something changes (looking around, a picture loading, the bell).
      frameloop="demand"
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={[1, mobile ? 1.75 : 2]}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: dark ? 1.1 : 1.0 }}
      camera={{ fov: 58, near: 0.3, far: 60, position: [0, 1.7, 8] }}
      aria-label={`Inside ${business.name}`}
    >
      <color attach="background" args={[dark ? "#1d2420" : shade(theme.wall, -0.06)]} />
      <StudioLight intensity={dark ? 0.45 : 0.6} />
      <hemisphereLight args={[warm ? "#fff1dc" : "#eef5ff", warm ? "#8a6a4a" : "#6c7a88", 0.45]} />
      {/* Daylight through the door and window, casting soft shadows. */}
      <directionalLight
        position={[-7, 8, 5]}
        intensity={warm ? 1.9 : 2.1}
        color={warm ? "#fff0d9" : "#f4f8ff"}
        castShadow
        shadow-mapSize={mobile ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={4}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <LookControls lounge={theme.table !== "none"} apiRef={apiRef} />
      <MaterialsProvider>
        <Room theme={theme} accent={accent} onFloor={pick({ kind: "floor" })} onWalls={pick({ kind: "walls" })} />
        <Counter accent={accent} onTap={pick({ kind: "counter" })} />
        <Backdrop style={theme.backdrop} accent={accent} wall={theme.wall} onTap={pick({ kind: "backdrop" })} />
        <Furniture />
        <Plants plants={theme.plants} onTap={editing ? (spot) => onSelect({ kind: "plant", spot }) : undefined} />
        <Lounge style={theme.table} rug={theme.rug} accent={accent} onTap={pick({ kind: "table" })} onRug={pick({ kind: "rug" })} />
        <Lights theme={theme} accent={accent} onTap={pick({ kind: "lights" })} />
        <Board theme={theme} business={business} accent={accent} onTap={() => onSelect({ kind: "board" })} />
        <ProductScreen business={business} products={products} accent={accent} onSelect={onSelect} editing={editing} />
        <WallArt theme={theme} accent={accent} onTap={editing ? (index) => onSelect({ kind: "art", index }) : undefined} />
        <Decor business={business} accent={accent} counterName={theme.counterName} />
        {hasGift && <GiftBox accent={accent} onOpen={() => onSelect({ kind: "gift" })} />}
        <Bell onRing={editing ? undefined : () => onSelect({ kind: "bell" })} />
      </MaterialsProvider>
    </Canvas>
  );
}
