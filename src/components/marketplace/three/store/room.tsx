"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { StoreTheme } from "@/lib/store-theme";
import { mix } from "../geometry";
import { useDispose } from "../hooks";
import { shade } from "../textures";
import { Built, Kit } from "./kit";
import { BACK, COUNTER_Z, D, H, W } from "./layout";
import { floorSurface, softShadow } from "./surfaces";

// The shop itself: panelled walls with an arch behind the shelves, a marble
// counter with a fluted front, oak shelves, sideboards, the glass door and
// window, and big leafy plants in ceramic pots.

const OAK = "#caa47c";
const WALNUT = "#6e4a2e";

/** Panel mouldings on the lower part of a wall, from a to b along it. */
function wainscot(k: Kit, along: "x" | "z", from: number, to: number, at: number, color: string) {
  const len = to - from;
  const mid = (from + to) / 2;
  const c = color;
  // Lower panel, chair rail and skirting.
  if (along === "x") {
    k.box("satin", [len, 1.0, 0.03], [mid, 0.5, at], c);
    k.rbox("satin", [len, 0.06, 0.07], 0.02, [mid, 1.02, at], shade(c, -0.04));
    k.box("satin", [len, 0.16, 0.05], [mid, 0.08, at], shade(c, -0.06));
  } else {
    k.box("satin", [0.03, 1.0, len], [at, 0.5, mid], c);
    k.rbox("satin", [0.07, 0.06, len], 0.02, [at, 1.02, mid], shade(c, -0.04));
    k.box("satin", [0.05, 0.16, len], [at, 0.08, mid], shade(c, -0.06));
  }
  // Raised panel frames.
  const panels = Math.max(1, Math.round(len / 1.4));
  const pw = len / panels;
  for (let i = 0; i < panels; i++) {
    const cx = from + pw * (i + 0.5);
    const frame = shade(c, 0.03);
    if (along === "x") {
      k.box("satin", [pw - 0.3, 0.025, 0.05], [cx, 0.86, at], frame);
      k.box("satin", [pw - 0.3, 0.025, 0.05], [cx, 0.3, at], frame);
      k.box("satin", [0.025, 0.58, 0.05], [cx - pw / 2 + 0.15, 0.58, at], frame);
      k.box("satin", [0.025, 0.58, 0.05], [cx + pw / 2 - 0.15, 0.58, at], frame);
    } else {
      k.box("satin", [0.05, 0.025, pw - 0.3], [at, 0.86, cx], frame);
      k.box("satin", [0.05, 0.025, pw - 0.3], [at, 0.3, cx], frame);
      k.box("satin", [0.05, 0.58, 0.025], [at, 0.58, cx - pw / 2 + 0.15], frame);
      k.box("satin", [0.05, 0.58, 0.025], [at, 0.58, cx + pw / 2 - 0.15], frame);
    }
  }
}

/** An arched panel shape (flat), w wide, rising to `top`, its curve starting at `spring`. */
function arch(w: number, spring: number, top: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.absellipse(0, spring, w / 2, top - spring, 0, Math.PI, false, 0);
  s.lineTo(-w / 2, 0);
  return new THREE.ShapeGeometry(s, 24);
}

/** A strelitzia-style plant in a ceramic pot. */
export function plant(k: Kit, x: number, z: number, scale: number, pot = "#efebe4", seed = 0, leaves = 8) {
  const s = scale;
  k.lathe("satin", [[0, 0], [0.24 * s, 0], [0.3 * s, 0.08 * s], [0.33 * s, 0.5 * s], [0.31 * s, 0.56 * s], [0.28 * s, 0.56 * s]], [x, 0, z], pot);
  k.cyl("matte", 0.29 * s, 0.29 * s, 0.02, [x, 0.54 * s, z], "#3b2c22");
  for (let i = 0; i < leaves; i++) {
    const angle = (i / leaves) * Math.PI * 2 + seed;
    const h = (0.7 + ((i * 37) % 10) / 22) * s;
    const lean = 0.25 + ((i * 13) % 7) / 18;
    const sx = x + Math.sin(angle) * 0.06 * s;
    const sz = z + Math.cos(angle) * 0.06 * s;
    k.cyl("satin", 0.012 * s, 0.018 * s, h, [sx + Math.sin(angle) * h * 0.12, 0.55 * s + h / 2, sz + Math.cos(angle) * h * 0.12], "#5d8a45", 6, [Math.cos(angle) * 0.24, 0, -Math.sin(angle) * 0.24]);
    k.leaf([sx + Math.sin(angle) * h * 0.24, 0.55 * s + h, sz + Math.cos(angle) * h * 0.24], angle, lean, (0.75 + ((i * 7) % 5) / 12) * s, i % 3 ? "#ffffff" : "#d9ecc8");
  }
}

/** A soft shadow on the floor under a piece of furniture. */
export function FloorShadow({ size, position, opacity = 0.6, rotation = 0 }: { size: [number, number]; position: [number, number]; opacity?: number; rotation?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, rotation]} position={[position[0], 0.006, position[1]]} renderOrder={1}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={softShadow()} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function Room({ theme, accent }: { theme: StoreTheme; accent: string }) {
  const dark = theme.wall === "#2F3A34";
  const wall = theme.wall;
  const shell = useMemo(() => {
    const k = new Kit();
    const side = shade(wall, -0.025);
    k.box("matte", [W, H, 0.2], [0, H / 2, BACK - 0.1], wall);
    k.box("matte", [0.2, H, D + 4], [-W / 2 - 0.1, H / 2, 2], side);
    k.box("matte", [0.2, H, D + 4], [W / 2 + 0.1, H / 2, 2], side);
    // Arch behind the shelves, a deeper tone of the wall with a hint of the accent.
    k.add("matte", arch(6.6, 2.6, 4.3), mix(shade(wall, dark ? 0.05 : -0.06), accent, 0.1), [0, 0, BACK + 0.01]);
    k.add("matte", arch(6.9, 2.6, 4.45), shade(wall, dark ? 0.08 : -0.02), [0, 0, BACK + 0.005]);
    const panel = shade(wall, dark ? 0.04 : -0.04);
    wainscot(k, "x", -W / 2, -3.45, BACK + 0.015, panel);
    wainscot(k, "x", 3.45, W / 2, BACK + 0.015, panel);
    wainscot(k, "z", BACK, 0.75, -W / 2 + 0.015, panel);
    wainscot(k, "z", 2.45, D / 2 + 2, -W / 2 + 0.015, panel);
    wainscot(k, "z", BACK, D / 2 + 2, W / 2 - 0.015, panel);
    // Crown moulding.
    k.rbox("satin", [W, 0.14, 0.12], 0.03, [0, H - 0.07, BACK + 0.06], shade(wall, 0.03));
    k.rbox("satin", [0.12, 0.14, D + 4], 0.03, [-W / 2 + 0.06, H - 0.07, 2], shade(wall, 0.03));
    k.rbox("satin", [0.12, 0.14, D + 4], 0.03, [W / 2 - 0.06, H - 0.07, 2], shade(wall, 0.03));
    // The entrance: black steel door and window frames, and a mat.
    const steel = "#232625";
    for (const [z, w, y0, y1] of [
      [1.6, 1.5, 0, 2.55],
      [-0.6, 2.1, 1.15, 2.6],
    ] as const) {
      const h = y1 - y0;
      k.box("metal", [0.08, h, 0.07], [-W / 2 + 0.04, y0 + h / 2, z - w / 2], steel);
      k.box("metal", [0.08, h, 0.07], [-W / 2 + 0.04, y0 + h / 2, z + w / 2], steel);
      k.box("metal", [0.08, 0.07, w], [-W / 2 + 0.04, y1, z], steel);
      k.box("metal", [0.08, 0.07, w], [-W / 2 + 0.04, y0 + 0.035, z], steel);
      k.box("metal", [0.06, 0.04, w], [-W / 2 + 0.04, y0 + h * 0.62, z], steel);
      k.box("glass", [0.02, h, w], [-W / 2 + 0.05, y0 + h / 2, z]);
    }
    k.cyl("brass", 0.018, 0.018, 0.5, [-W / 2 + 0.12, 1.1, 1.0], "#ffffff", 10);
    k.rbox("fabric", [1.0, 0.025, 1.4], 0.01, [-W / 2 + 0.75, 0.012, 1.6], shade(accent, -0.25));
    return k.build();
  }, [wall, dark, accent]);

  const floor = useMemo(() => floorSurface(theme.floor), [theme.floor]);
  useDispose(floor);

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-z={2} receiveShadow>
        <planeGeometry args={[W, D + 4]} />
        <meshStandardMaterial map={floor} roughness={theme.floor === "wood" ? 0.5 : 0.22} />
      </mesh>
      <Built parts={shell} shadows={false} />
      <mesh rotation-x={Math.PI / 2} position={[0, H, 2]}>
        <planeGeometry args={[W, D + 4]} />
        <meshStandardMaterial color={dark ? "#2a332e" : "#fbfaf7"} roughness={1} />
      </mesh>
      {/* Daylight outside the door and window. */}
      <mesh position={[-W / 2 + 0.005, 1.28, 1.6]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[1.5, 2.55]} />
        <meshBasicMaterial color="#e9f3ee" toneMapped={false} />
      </mesh>
      <mesh position={[-W / 2 + 0.005, 1.87, -0.6]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[2.1, 1.45]} />
        <meshBasicMaterial color="#eef6f6" toneMapped={false} />
      </mesh>
    </>
  );
}

/** The counter: fluted front in the accent colour, marble top, a till and a little vase. */
export function Counter({ accent }: { accent: string }) {
  const parts = useMemo(() => {
    const k = new Kit();
    const cz = COUNTER_Z;
    const lacquer = mix(accent, "#f3efe7", 0.12);
    k.rbox("satin", [3.7, 0.92, 0.9], 0.02, [0, 0.52, cz], shade(lacquer, -0.08));
    for (let x = -1.8; x <= 1.801; x += 0.1) k.cyl("satin", 0.05, 0.05, 0.86, [x, 0.53, cz + 0.43], lacquer, 12);
    k.box("brass", [3.74, 0.06, 0.96], [0, 0.04, cz], "#ffffff");
    k.rbox("marble", [4.0, 0.07, 1.15], 0.025, [0, 1.025, cz]);
    // Till: a tablet on a brass stand, and a card reader.
    k.cyl("brass", 0.06, 0.08, 0.02, [1.45, 1.07, cz - 0.05], "#ffffff", 20);
    k.cyl("brass", 0.012, 0.012, 0.16, [1.45, 1.15, cz - 0.05], "#ffffff", 8);
    k.rbox("satin", [0.4, 0.27, 0.02], 0.01, [1.45, 1.27, cz - 0.05], "#1b1e1d", [-0.35, 0.25, 0]);
    k.rbox("satin", [0.08, 0.02, 0.13], 0.008, [1.1, 1.07, cz + 0.12], "#222524");
    // A bud vase with a branch.
    k.lathe("satin", [[0, 0], [0.07, 0], [0.09, 0.08], [0.06, 0.2], [0.03, 0.26], [0.035, 0.28], [0.025, 0.28]], [-1.5, 1.06, cz + 0.05], "#e9e3d9");
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      k.cyl("satin", 0.005, 0.006, 0.45, [-1.5 + Math.sin(a) * 0.05, 1.5, cz + 0.05 + Math.cos(a) * 0.05], "#6b5a3d", 5, [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]);
      for (let j = 0; j < 4; j++) k.leaf([-1.5 + Math.sin(a) * (0.06 + j * 0.03), 1.35 + j * 0.1, cz + 0.05 + Math.cos(a) * (0.06 + j * 0.03)], a + j, 1.1, 0.11, "#cfe3b8");
    }
    // Paper bags waiting for orders.
    k.rbox("matte", [0.28, 0.32, 0.16], 0.01, [-0.95, 1.22, cz - 0.25], "#cfae84");
    k.rbox("matte", [0.24, 0.26, 0.14], 0.01, [-0.68, 1.19, cz - 0.3], "#f1ede6");
    return k.build();
  }, [accent]);
  return (
    <>
      <Built parts={parts} />
      <FloorShadow size={[5, 2.2]} position={[0, COUNTER_Z]} opacity={0.5} />
    </>
  );
}

/** Oak shelves on the back wall and marble-topped sideboards along the sides. */
export function Furniture() {
  const parts = useMemo(() => {
    const k = new Kit();
    for (const y of [1.45, 2.43]) {
      k.rbox("wood", [5.6, 0.06, 0.38], 0.015, [0, y, BACK + 0.2], OAK);
      k.cyl("brass", 0.012, 0.012, 5.6, [0, y - 0.05, BACK + 0.37], "#ffffff", 8, [0, 0, Math.PI / 2]);
    }
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.32);
      k.rbox("wood", [0.56, 0.78, 3.4], 0.02, [x, 0.47, -2.4], OAK);
      for (const z of [-3.5, -2.4, -1.3]) k.box("wood", [0.02, 0.68, 1.04], [x - sx * 0.28, 0.47, z], shade(OAK, -0.05));
      for (const z of [-3.5, -2.4, -1.3]) k.cyl("brass", 0.012, 0.012, 0.2, [x - sx * 0.3, 0.62, z], "#ffffff", 8, [Math.PI / 2, 0, 0]);
      k.rbox("marble", [0.62, 0.04, 3.46], 0.012, [x, 0.88, -2.4]);
      for (const z of [-4.0, -0.8]) k.cyl("brass", 0.02, 0.015, 0.08, [x - sx * 0.2, 0.04, z], "#ffffff", 10);
    }
    // Chalkboard easel.
    k.cyl("wood", 0.025, 0.025, 1.7, [-4.4, 0.8, 0.02], WALNUT, 8, [0.12, 0, 0.18]);
    k.cyl("wood", 0.025, 0.025, 1.7, [-3.6, 0.8, -0.35], WALNUT, 8, [0.12, 0, -0.18]);
    return k.build();
  }, []);
  return (
    <>
      <Built parts={parts} />
      <FloorShadow size={[1.3, 4.2]} position={[-W / 2 + 0.35, -2.4]} opacity={0.45} />
      <FloorShadow size={[1.3, 4.2]} position={[W / 2 - 0.35, -2.4]} opacity={0.45} />
    </>
  );
}

export function Plants() {
  const parts = useMemo(() => {
    const k = new Kit();
    plant(k, -4.45, -3.95, 1.55, "#efebe4", 0.3);
    plant(k, 4.45, -3.95, 1.75, "#efebe4", 1.1);
    plant(k, -5.3, 3.7, 1.4, "#b9876a", 2.2);
    return k.build();
  }, []);
  return (
    <>
      <Built parts={parts} />
      <FloorShadow size={[1.3, 1.3]} position={[-4.45, -3.95]} />
      <FloorShadow size={[1.4, 1.4]} position={[4.45, -3.95]} />
      <FloorShadow size={[1.2, 1.2]} position={[-5.3, 3.7]} />
    </>
  );
}
