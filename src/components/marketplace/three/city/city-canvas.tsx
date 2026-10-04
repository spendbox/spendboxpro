"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import type { ExploreBusiness } from "@/lib/types";
import { hash } from "../geometry";
import { LabelTracker, type LabelPlacement } from "./label-tracker";
import { planTown } from "./layout";
import { MapControls, type MapApi } from "./map-controls";
import { Shop } from "./shop";
import { Blocks, Cars, Ground, Lamps, Roads, Trees } from "./town";

const SKY = "#dcefe4";

/** Redraws the town a few times a second for the moving cars (dragging redraws on its own). */
function Ticker({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(id);
  }, [invalidate, fps]);
  return null;
}

/** The marketplace town, as React components. */
export default function CityCanvas({
  businesses,
  onOpen,
  paused,
  apiRef,
  onPlace,
}: {
  businesses: ExploreBusiness[];
  onOpen: (business: ExploreBusiness) => void;
  paused: boolean;
  apiRef: RefObject<MapApi | null>;
  onPlace: (placements: LabelPlacement[]) => void;
}) {
  const plan = useMemo(() => planTown(businesses.length), [businesses.length]);
  // Labels sit just above each shop's roof (shop heights vary a little).
  const anchors = useMemo(() => businesses.map((b, i) => ({ id: b.id, x: plan.shops[i]!.x, y: 2.6 + hash(b.id) * 1.6 + 1.9, z: plan.shops[i]!.z })), [businesses, plan]);
  const motion = useMemo(() => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const startZoom = businesses.length <= 3 ? 1.35 : businesses.length <= 9 ? 1.1 : 1;

  return (
    <Canvas
      orthographic
      flat
      // Sharp enough on any screen without drawing four times the pixels on high-resolution ones.
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [60, 66, 60], near: 0.1, far: 400 }}
      // Nothing to draw while a store covers the map.
      frameloop={paused ? "never" : "demand"}
      aria-label="Map of your shops"
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 70, 150]} />
      <hemisphereLight args={["#ffffff", "#7fa37a", 1.55]} />
      <directionalLight position={[30, 60, 20]} intensity={1.6} color="#fff4e0" />
      {!paused && motion && <Ticker fps={30} />}
      <MapControls bounds={plan.bounds} startZoom={startZoom} apiRef={apiRef} />
      <LabelTracker anchors={anchors} onPlace={onPlace} />
      <Ground />
      <Roads plan={plan} />
      <Blocks plan={plan} />
      <Trees plan={plan} />
      <Lamps plan={plan} />
      <Cars plan={plan} moving={motion} />
      {businesses.map((b, i) => (
        <Shop key={b.id} business={b} position={[plan.shops[i]!.x, 0, plan.shops[i]!.z]} delay={i * 0.07} animate={motion} onOpen={onOpen} />
      ))}
    </Canvas>
  );
}
