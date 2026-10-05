"use client";

import { useMemo } from "react";
import { POTS, type PlantKind, type PlantSpot, type PotColor, type StoreTheme } from "@/lib/store-theme";
import { Built, Kit } from "./kit";
import { COUNTER_Z } from "./layout";
import { FloorShadow } from "./room";
import { Tappable } from "./tap";

// Plants and flowers, each spot chosen separately by the business. Built at
// scale 1 (a floor plant about 1.6 m tall with its pot) and scaled per spot.

/** Where each spot is, how big its plant is, and whether it stands on the floor. */
export const SPOTS: Record<PlantSpot, { at: [number, number, number]; scale: number; floor: boolean; seed: number }> = {
  backLeft: { at: [-4.45, 0, -3.95], scale: 1.0, floor: true, seed: 0.3 },
  backRight: { at: [3.8, 0, -3.95], scale: 1.1, floor: true, seed: 1.1 },
  front: { at: [-5.3, 0, 3.7], scale: 0.95, floor: true, seed: 2.2 },
  counter: { at: [-1.5, 1.06, COUNTER_Z + 0.05], scale: 0.3, floor: false, seed: 0.7 },
};

/** A pot (shape depends on the plant), returning the soil height. */
function pot(k: Kit, kind: PlantKind, color: string) {
  if (kind === "flowers" || kind === "pampas") {
    // A tall vase.
    k.lathe("satin", [[0, 0], [0.13, 0], [0.18, 0.12], [0.16, 0.46], [0.09, 0.6], [0.1, 0.64], [0.085, 0.64]], [0, 0, 0], color);
    return 0.62;
  }
  k.lathe("satin", [[0, 0], [0.2, 0], [0.26, 0.06], [0.28, 0.42], [0.26, 0.46], [0.24, 0.46]], [0, 0, 0], color);
  k.cyl("matte", 0.245, 0.245, 0.02, [0, 0.44, 0], "#3b2c22");
  return 0.45;
}

export function strelitzia(k: Kit, soil: number, seed: number) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const h = 0.55 + ((i * 37) % 10) / 28;
    const lean = 0.25 + ((i * 13) % 7) / 18;
    k.cyl("satin", 0.01, 0.015, h, [Math.sin(a) * h * 0.1, soil + h / 2, Math.cos(a) * h * 0.1], "#5d8a45", 6, [Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22]);
    k.leaf([Math.sin(a) * h * 0.2, soil + h, Math.cos(a) * h * 0.2], a, lean, 0.62 + ((i * 7) % 5) / 14, i % 3 ? "#ffffff" : "#d9ecc8", 0);
  }
}

function monstera(k: Kit, soil: number, seed: number) {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const h = 0.25 + ((i * 29) % 10) / 22;
    const out = 0.12 + h * 0.25;
    k.cyl("satin", 0.009, 0.012, h + 0.1, [Math.sin(a) * out * 0.5, soil + h / 2, Math.cos(a) * out * 0.5], "#4f7a3c", 6, [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]);
    k.leaf([Math.sin(a) * out, soil + h, Math.cos(a) * out], a, 0.75 + ((i * 11) % 5) / 12, 0.5 + ((i * 5) % 4) / 14, i % 2 ? "#ffffff" : "#cfe6c0", 1, 0.9, 0.18);
  }
}

function olive(k: Kit, soil: number, seed: number) {
  k.cyl("wood", 0.025, 0.04, 1.0, [0, soil + 0.5, 0], "#7a6450", 8, [0.05, 0, 0.04]);
  for (const [a, h] of [
    [0.4, 0.75],
    [2.6, 0.85],
    [4.4, 0.7],
  ] as const)
    k.cyl("wood", 0.012, 0.018, 0.4, [Math.sin(a) * 0.12, soil + h + 0.12, Math.cos(a) * 0.12], "#7a6450", 6, [Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6]);
  let r = seed * 1000;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 120; i++) {
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    const rad = 0.18 + rand() * 0.3;
    const x = Math.sin(ph) * Math.cos(th) * rad;
    const y = Math.cos(ph) * rad * 0.75;
    const z = Math.sin(ph) * Math.sin(th) * rad;
    k.leaf([x, soil + 1.15 + y, z], rand() * Math.PI * 2, 0.6 + rand() * 1.2, 0.13, rand() > 0.5 ? "#ffffff" : "#dfe8d6", 2, 0.32, 0.05);
  }
}

function snake(k: Kit, soil: number, seed: number) {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const ring = i % 2 ? 0.1 : 0.04;
    k.leaf([Math.sin(a) * ring, soil - 0.02, Math.cos(a) * ring], a + 1.2, 0.04 + (i % 3) * 0.08, 0.55 + ((i * 7) % 5) / 12, "#ffffff", 3, 0.22, 0.04);
  }
}

function flowers(k: Kit, soil: number, seed: number) {
  const tones = ["#ffffff", "#f7d6dc", "#f6e7c8", "#f2b8b5"];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + seed;
    const h = 0.35 + ((i * 17) % 7) / 24;
    const lean = 0.18 + (i % 3) * 0.08;
    const tipX = Math.sin(a) * h * lean;
    const tipZ = Math.cos(a) * h * lean;
    k.cyl("satin", 0.005, 0.007, h, [tipX / 2, soil + h / 2, tipZ / 2], "#6b8a4a", 5, [Math.cos(a) * lean, 0, -Math.sin(a) * lean]);
    const color = tones[i % tones.length]!;
    // A bloom: petals round a centre.
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * Math.PI * 2;
      k.sphere("fabric", 0.028, [tipX + Math.cos(pa) * 0.028, soil + h + 0.01, tipZ + Math.sin(pa) * 0.028], color, [1, 0.45, 1]);
    }
    k.sphere("fabric", 0.016, [tipX, soil + h + 0.02, tipZ], "#e9c25a");
    if (i % 2) k.leaf([tipX * 0.5, soil + h * 0.5, tipZ * 0.5], a, 0.9, 0.12, "#ffffff", 2, 0.35, 0.05);
  }
}

function pampas(k: Kit, soil: number, seed: number) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + seed;
    const h = 0.55 + ((i * 13) % 6) / 16;
    const lean = 0.16 + (i % 3) * 0.06;
    const tipX = Math.sin(a) * h * lean;
    const tipZ = Math.cos(a) * h * lean;
    k.cyl("satin", 0.005, 0.006, h, [tipX / 2, soil + h / 2, tipZ / 2], "#b7a27a", 5, [Math.cos(a) * lean, 0, -Math.sin(a) * lean]);
    k.leaf([tipX, soil + h - 0.08, tipZ], a, lean, 0.42, "#ffffff", 4, 0.4, 0.08);
  }
}

const BUILD: Record<Exclude<PlantKind, "none">, (k: Kit, soil: number, seed: number) => void> = { strelitzia, monstera, olive, snake, flowers, pampas };

/** A plant in its pot, standing at the kit's current place (for other spots, like the end of the hall). */
export function plantKit(k: Kit, kind: Exclude<PlantKind, "none">, potColor: PotColor, seed: number) {
  const soil = pot(k, kind, POTS.find((p) => p.id === potColor)!.color);
  BUILD[kind](k, soil, seed);
}

function PlantAt({ spot, kind, potColor, onTap }: { spot: PlantSpot; kind: PlantKind; potColor: PotColor; onTap?: () => void }) {
  const place = SPOTS[spot];
  const color = POTS.find((p) => p.id === potColor)!.color;
  const parts = useMemo(() => {
    if (kind === "none") return null;
    const k = new Kit();
    k.place(
      [0, 0, 0],
      0,
      () => {
        const soil = pot(k, kind, color);
        BUILD[kind](k, soil, place.seed);
      },
      place.scale,
    );
    return k.build();
  }, [kind, color, place.scale, place.seed]);
  if (!parts) {
    // An empty spot can still be tapped in the editor, to add a plant.
    return onTap ? (
      <Tappable onTap={onTap} position={place.at}>
        <mesh position-y={place.floor ? 0.4 : 0.1}>
          <cylinderGeometry args={[0.3 * place.scale, 0.3 * place.scale, place.floor ? 0.8 : 0.2, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Tappable>
    ) : null;
  }
  return (
    <Tappable onTap={onTap} position={place.at}>
      <Built parts={parts} />
      {place.floor && <FloorShadow size={[1.2 * place.scale, 1.2 * place.scale]} position={[0, 0]} />}
    </Tappable>
  );
}

export function Plants({ plants, onTap }: { plants: StoreTheme["plants"]; onTap?: (spot: PlantSpot) => void }) {
  return (
    <>
      {(Object.keys(SPOTS) as PlantSpot[]).map((spot) => (
        <PlantAt key={spot} spot={spot} kind={plants[spot].kind} potColor={plants[spot].pot} onTap={onTap ? () => onTap(spot) : undefined} />
      ))}
    </>
  );
}
