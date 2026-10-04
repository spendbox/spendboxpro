"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { TableStyle } from "@/lib/store-theme";
import { mix } from "../geometry";
import { shade } from "../textures";
import { Built, Kit, leatherOf } from "./kit";
import { LOUNGE } from "./layout";
import { strelitzia } from "./plants";
import { FloorShadow } from "./room";
import { Tappable } from "./tap";

// The lounge corner's table sets. Each is built facing +z (the open side,
// towards the shopper), then turned to face the door. Tap any of them to
// choose another style.

const CREAM = "#ece6da";
const OAK = "#caa47c";
const WALNUT = "#6e4a2e";
const BLACK = "#262726";

/** Plates, a glass and cutlery for one seat, at angle `a` round the table centre (radius r). */
function placeSetting(k: Kit, a: number, r: number, y: number) {
  k.place([Math.sin(a) * r, y, Math.cos(a) * r], a, () => {
    k.lathe("china", [[0, 0], [0.1, 0], [0.13, 0.008], [0.15, 0.018], [0.152, 0.02]], [0, 0, 0], "#ffffff");
    k.lathe("china", [[0, 0], [0.05, 0], [0.075, 0.025], [0.08, 0.035]], [0, 0.012, 0], "#f6f3ee");
    k.box("brass", [0.012, 0.004, 0.17], [-0.19, 0.003, 0], "#ffffff");
    k.box("brass", [0.012, 0.004, 0.17], [0.19, 0.003, 0], "#ffffff");
    k.lathe("glass", [[0, 0], [0.035, 0], [0.006, 0.01], [0.006, 0.09], [0.04, 0.12], [0.045, 0.19], [0.043, 0.19]], [0.17, 0, -0.14]);
  });
}

/** A small vase of flowers for the middle of a table. */
function flowers(k: Kit, x: number, y: number, z: number) {
  k.lathe("satin", [[0, 0], [0.035, 0], [0.05, 0.05], [0.03, 0.13], [0.018, 0.16], [0.022, 0.17]], [x, y, z], "#f4f0e8");
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    const h = 0.2 + (i % 3) * 0.05;
    k.cyl("satin", 0.003, 0.004, h, [x + Math.sin(a) * 0.02, y + 0.12 + h / 2, z + Math.cos(a) * 0.02], "#6b8a4a", 4, [Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22]);
    k.sphere("fabric", 0.028, [x + Math.sin(a) * 0.05, y + 0.13 + h, z + Math.cos(a) * 0.05], i % 2 ? "#ffffff" : "#f6e7c8");
  }
}

/** A padded throw cushion leaning back, facing the centre from angle a. */
function cushion(k: Kit, a: number, r: number, y: number, color: string, outward = false) {
  k.place([Math.sin(a) * r, y, -Math.cos(a) * r], outward ? Math.PI - a : -a, () => {
    k.rbox("fabric", [0.4, 0.38, 0.13], 0.06, [0, 0, 0], color, [-0.32, 0, 0]);
  });
}

function booth(k: Kit, leather: string) {
  const A = 1.95;
  k.sector("satin", 0.72, 1.46, -A, A, 0.3, 0, CREAM, 0.02);
  const seats = 5;
  for (let i = 0; i < seats; i++) {
    const a0 = -A + ((2 * A) / seats) * i;
    k.sector("leather", 0.76, 1.36, a0 + 0.008, a0 + (2 * A) / seats - 0.008, 0.15, 0.3, leather, 0.05);
  }
  const ribs = 18;
  for (let i = 0; i < ribs; i++) {
    const a0 = -A + ((2 * A) / ribs) * i;
    k.sector("leather", 1.3, 1.5, a0 + 0.004, a0 + (2 * A) / ribs - 0.004, 0.64, 0.42, leather, 0.05);
  }
  k.sector("wood", 1.5, 1.58, -A - 0.03, A + 0.03, 1.14, 0, OAK, 0.012);
  cushion(k, -1.15, 1.12, 0.66, "#f2efe8");
  cushion(k, 0.05, 1.14, 0.66, mix(leather, "#ffffff", 0.35));
  cushion(k, 1.2, 1.12, 0.66, "#f2efe8");
  // Round marble table on a black pyramid base.
  k.cyl("marble", 0.56, 0.56, 0.035, [0, 0.76, 0], "#ffffff", 48);
  k.cyl("metal", 0.05, 0.3, 0.72, [0, 0.38, 0], BLACK, 4, [0, Math.PI / 4, 0]);
  for (const a of [-1.2, 0, 1.2]) placeSetting(k, a + Math.PI, 0.36, 0.78);
  flowers(k, 0, 0.78, 0);
}

/** A chair with a cane-filled round back. */
function caneChair(k: Kit, leather: string) {
  for (const [x, z] of [
    [-0.19, -0.19],
    [0.19, -0.19],
    [-0.19, 0.19],
    [0.19, 0.19],
  ] as const)
    k.cyl("wood", 0.018, 0.022, 0.45, [x, 0.225, z], WALNUT, 10);
  k.rbox("leather", [0.48, 0.08, 0.46], 0.035, [0, 0.48, 0], leather);
  for (const x of [-0.17, 0.17]) k.cyl("wood", 0.016, 0.016, 0.22, [x, 0.6, -0.2], WALNUT, 8);
  k.torus("wood", 0.2, 0.018, [0, 0.88, -0.21], WALNUT, [0, 0, 0], Math.PI * 2, [1, 1.15, 1]);
  k.add("cane", new THREE.CircleGeometry(0.2, 32).scale(1, 1.15, 1), "#ffffff", [0, 0.88, -0.21]);
}

function marbleSet(k: Kit, leather: string) {
  k.rbox("darkMarble", [1.5, 0.05, 0.85], 0.02, [0, 0.76, 0]);
  for (const x of [-0.5, 0.5]) {
    k.cyl("metal", 0.035, 0.035, 0.72, [x, 0.37, 0], BLACK, 12);
    k.rbox("metal", [0.08, 0.025, 0.62], 0.01, [x, 0.013, 0], BLACK);
  }
  for (const [x, z, r] of [
    [-0.4, 0.72, Math.PI],
    [0.4, 0.72, Math.PI],
    [-0.4, -0.72, 0],
    [0.4, -0.72, 0],
  ] as const)
    k.place([x, 0, z], r, () => caneChair(k, leather));
  k.place([-0.42, 0, 0.18], 0, () => placeSetting(k, 0, 0, 0.79));
  k.place([0.42, 0, 0.18], 0, () => placeSetting(k, 0, 0, 0.79));
  k.place([-0.42, 0, -0.18], Math.PI, () => placeSetting(k, 0, 0, 0.79));
  k.place([0.42, 0, -0.18], Math.PI, () => placeSetting(k, 0, 0, 0.79));
  flowers(k, 0, 0.785, 0);
}

/** A bentwood bistro chair with a cane seat and a looped back. */
function bentwoodChair(k: Kit) {
  for (const [x, z] of [
    [-0.17, -0.15],
    [0.17, -0.15],
    [-0.15, 0.17],
    [0.15, 0.17],
  ] as const)
    k.cyl("wood", 0.017, 0.02, 0.47, [x, 0.235, z], WALNUT, 10, [z * 0.25, 0, -x * 0.25]);
  k.torus("wood", 0.21, 0.022, [0, 0.47, 0], WALNUT, [Math.PI / 2, 0, 0]);
  k.add("cane", new THREE.CircleGeometry(0.21, 32), "#ffffff", [0, 0.47, 0], [-Math.PI / 2, 0, 0]);
  k.torus("wood", 0.2, 0.018, [0, 0.47, -0.18], WALNUT, [0, 0, 0], Math.PI, [1, 1.9, 1]);
  k.torus("wood", 0.13, 0.014, [0, 0.47, -0.18], WALNUT, [0, 0, 0], Math.PI, [1, 2.2, 1]);
  k.torus("wood", 0.15, 0.012, [0, 0.25, 0], WALNUT, [Math.PI / 2, 0, 0]);
}

function bistro(k: Kit) {
  k.cyl("wood", 0.52, 0.52, 0.045, [0, 0.76, 0], WALNUT, 48);
  k.cyl("metal", 0.035, 0.035, 0.72, [0, 0.37, 0], BLACK, 12);
  k.cyl("metal", 0.26, 0.28, 0.025, [0, 0.013, 0], BLACK, 32);
  for (const a of [Math.PI, Math.PI - 2.1, Math.PI + 2.1]) {
    k.place([Math.sin(a) * 0.72, 0, Math.cos(a) * 0.72], a + Math.PI, () => bentwoodChair(k));
    placeSetting(k, a, 0.3, 0.785);
  }
  flowers(k, 0, 0.785, 0);
}

/** A rattan sofa with a black steel frame and a leather seat. */
function rattanSofa(k: Kit, leather: string) {
  const w = 1.3;
  k.rbox("leather", [w - 0.1, 0.14, 0.55], 0.05, [0, 0.44, 0.02], leather);
  k.rbox("leather", [w - 0.16, 0.42, 0.12], 0.05, [0, 0.73, -0.22], leather, [-0.14, 0, 0]);
  k.rbox("satin", [w - 0.06, 0.1, 0.6], 0.02, [0, 0.33, 0], BLACK);
  k.add("cane", new THREE.PlaneGeometry(w, 0.62), "#ffffff", [0, 0.68, -0.31]);
  for (const sx of [-1, 1]) k.add("cane", new THREE.PlaneGeometry(0.62, 0.42), "#ffffff", [(sx * w) / 2, 0.58, 0], [0, Math.PI / 2, 0]);
  const tube = (len: number, at: [number, number, number], rot: [number, number, number]) => k.cyl("metal", 0.016, 0.016, len, at, BLACK, 8, rot);
  tube(w, [0, 1.0, -0.31], [0, 0, Math.PI / 2]);
  for (const sx of [-1, 1]) {
    tube(0.64, [(sx * w) / 2, 0.79, 0], [Math.PI / 2, 0, 0]);
    tube(1.0, [(sx * w) / 2, 0.5, -0.31], [0, 0, 0]);
    tube(0.79, [(sx * w) / 2, 0.395, 0.31], [0, 0, 0]);
  }
  tube(w, [0, 0.37, -0.31], [0, 0, Math.PI / 2]);
}

function linenSet(k: Kit, leather: string) {
  k.rbox("linen", [1.42, 0.03, 0.92], 0.012, [0, 0.765, 0]);
  k.box("linen", [1.42, 0.3, 0.01], [0, 0.62, 0.46]);
  k.box("linen", [1.42, 0.3, 0.01], [0, 0.62, -0.46]);
  k.box("linen", [0.01, 0.3, 0.92], [0.71, 0.62, 0]);
  k.box("linen", [0.01, 0.3, 0.92], [-0.71, 0.62, 0]);
  k.cyl("metal", 0.04, 0.04, 0.45, [0, 0.24, 0], BLACK, 12);
  k.rbox("metal", [0.9, 0.03, 0.07], 0.01, [0, 0.015, 0], BLACK, [0, Math.PI / 4, 0]);
  k.rbox("metal", [0.9, 0.03, 0.07], 0.01, [0, 0.015, 0], BLACK, [0, -Math.PI / 4, 0]);
  k.place([0, 0, 0.88], Math.PI, () => rattanSofa(k, leather));
  k.place([0, 0, -0.88], 0, () => rattanSofa(k, leather));
  for (const x of [-0.35, 0.35]) {
    k.place([x, 0.785, 0.22], 0, () => placeSetting(k, 0, 0, 0));
    k.place([x, 0.785, -0.22], Math.PI, () => placeSetting(k, 0, 0, 0));
  }
}

function garden(k: Kit, leather: string) {
  k.cyl("satin", 0.6, 0.56, 0.62, [0, 0.31, 0], "#f1ede6", 40);
  k.cyl("matte", 0.57, 0.57, 0.02, [0, 0.61, 0], "#3b2c22", 32);
  k.place([0, 0, 0], 0, () => strelitzia(k, 0.6, 0.4), 1.1);
  const parts = 4;
  for (let i = 0; i < parts; i++) {
    const a0 = -Math.PI + ((2 * Math.PI) / parts) * i;
    const a1 = a0 + (2 * Math.PI) / parts;
    k.sector("satin", 0.6, 1.3, a0 + 0.004, a1 - 0.004, 0.28, 0, CREAM, 0.02);
    k.sector("leather", 0.64, 1.26, a0 + 0.012, a1 - 0.012, 0.14, 0.28, leather, 0.05);
  }
  for (const a of [0.45, 1.9, 3.4, 4.9]) cushion(k, a, 0.72, 0.6, a > 3 ? "#f2efe8" : mix(leather, "#ffffff", 0.3), true);
  k.place([1.25, 0, 1.0], 0, () => {
    k.cyl("leather", 0.22, 0.22, 0.42, [0, 0.21, 0], leather, 32);
  });
}

// Long tables are turned side-on, so their chairs and sofas don't hide the table from the shopper.
const sideOn = (build: (k: Kit, leather: string) => void) => (k: Kit, leather: string) => k.place([0, 0, 0], Math.PI / 2, () => build(k, leather));

const BUILDERS: Record<Exclude<TableStyle, "none">, (k: Kit, leather: string) => void> = {
  booth,
  marble: sideOn(marbleSet),
  bistro: (k) => bistro(k),
  linen: sideOn(linenSet),
  garden,
};

/** The lounge corner: a rug and the chosen table set. In the editor, tap it to pick another style. */
export function Lounge({ style, accent, onTap }: { style: TableStyle; accent: string; onTap?: () => void }) {
  const leather = leatherOf(accent);
  const parts = useMemo(() => {
    const k = new Kit();
    k.add("fabric", new THREE.CircleGeometry(1.95, 64), mix(accent, "#efe9de", 0.82), [0, 0.008, 0], [-Math.PI / 2, 0, 0]);
    k.add("fabric", new THREE.RingGeometry(1.86, 1.92, 64), shade(mix(accent, "#efe9de", 0.6), -0.05), [0, 0.01, 0], [-Math.PI / 2, 0, 0]);
    if (style !== "none") BUILDERS[style](k, leather);
    return k.build();
  }, [style, accent, leather]);
  return (
    <Tappable onTap={onTap} position={[LOUNGE.x, 0, LOUNGE.z]} rotationY={LOUNGE.rotY}>
      <Built parts={parts} />
      {style !== "none" && <FloorShadow size={[3.4, 3.4]} position={[0, 0]} opacity={0.42} />}
    </Tappable>
  );
}
