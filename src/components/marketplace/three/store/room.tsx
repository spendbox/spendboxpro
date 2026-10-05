"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { BackdropStyle, StoreTheme } from "@/lib/store-theme";
import { mix } from "../geometry";
import { useDispose } from "../hooks";
import { shade } from "../textures";
import { FRONT } from "./hall";
import { Built, Kit } from "./kit";
import { BACK, COUNTER_Z, D, H, W } from "./layout";
import { brick, floorSurface, softShadow } from "./surfaces";
import { Tappable, tap } from "./tap";

// The shop itself: panelled walls, a feature wall behind the product screen,
// a marble counter with a fluted front, sideboards, and the glass door and
// window. In the editor, tapping the floor or walls opens their settings.

const OAK = "#caa47c";

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

/** A soft shadow on the floor under a piece of furniture. */
export function FloorShadow({ size, position, opacity = 0.6, rotation = 0 }: { size: [number, number]; position: [number, number]; opacity?: number; rotation?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, rotation]} position={[position[0], 0.006, position[1]]} renderOrder={1}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={softShadow()} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** A plane lying on the floor (or ceiling) from the back wall to `end`, its pattern repeating at the shop's usual scale. */
function useLengthPlane(end: number) {
  const plane = useMemo(() => {
    const len = end - BACK;
    const g = new THREE.PlaneGeometry(W, len);
    const uv = g.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / (D + 4)));
    return g;
  }, [end]);
  useDispose(plane);
  return plane;
}

/**
 * The shop's walls, floor and ceiling. They run from the back wall to `end`:
 * the far wall of the product hall, which grows as products are added.
 */
export function Room({ theme, accent, end = FRONT + 2.2, onFloor, onWalls, onWalk }: { theme: StoreTheme; accent: string; end?: number; onFloor?: () => void; onWalls?: () => void; onWalk?: (x: number, z: number) => void }) {
  const dark = theme.wall === "#2F3A34";
  const wall = theme.wall;
  const len = end - BACK;
  const mid = (BACK + end) / 2;
  const shell = useMemo(() => {
    const k = new Kit();
    const side = shade(wall, -0.025);
    k.box("matte", [W, H, 0.2], [0, H / 2, BACK - 0.1], wall);
    k.box("matte", [0.2, H, len], [-W / 2 - 0.1, H / 2, mid], side);
    k.box("matte", [0.2, H, len], [W / 2 + 0.1, H / 2, mid], side);
    // The far wall of the hall.
    k.box("matte", [W + 0.4, H, 0.2], [0, H / 2, end + 0.1], wall);
    const panel = shade(wall, dark ? 0.04 : -0.04);
    wainscot(k, "x", -W / 2, -3.25, BACK + 0.015, panel);
    wainscot(k, "x", 3.25, W / 2, BACK + 0.015, panel);
    wainscot(k, "x", -W / 2, W / 2, end - 0.015, panel);
    wainscot(k, "z", BACK, 0.75, -W / 2 + 0.015, panel);
    wainscot(k, "z", 2.45, end, -W / 2 + 0.015, panel);
    wainscot(k, "z", BACK, end, W / 2 - 0.015, panel);
    // Crown moulding.
    k.rbox("satin", [W, 0.14, 0.12], 0.03, [0, H - 0.07, BACK + 0.06], shade(wall, 0.03));
    k.rbox("satin", [W, 0.14, 0.12], 0.03, [0, H - 0.07, end - 0.06], shade(wall, 0.03));
    k.rbox("satin", [0.12, 0.14, len], 0.03, [-W / 2 + 0.06, H - 0.07, mid], shade(wall, 0.03));
    k.rbox("satin", [0.12, 0.14, len], 0.03, [W / 2 - 0.06, H - 0.07, mid], shade(wall, 0.03));
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
  }, [wall, dark, accent, end, len, mid]);
  const plane = useLengthPlane(end);

  const floor = useMemo(() => floorSurface(theme.floor.style, theme.floor.color), [theme.floor.style, theme.floor.color]);
  useDispose(floor);
  const wood = theme.floor.style === "oak" || theme.floor.style === "herringbone";

  return (
    <>
      <Tappable onTap={onFloor}>
        <mesh
          rotation-x={-Math.PI / 2}
          position-z={mid}
          geometry={plane}
          receiveShadow
          // Visitors tap the floor to walk there.
          onClick={onWalk && !onFloor ? tap((e: ThreeEvent<MouseEvent>) => onWalk(e.point.x, e.point.z)) : undefined}
        >
          <meshStandardMaterial map={floor} roughness={wood ? 0.5 : theme.floor.style === "concrete" ? 0.6 : 0.2} />
        </mesh>
      </Tappable>
      <Tappable onTap={onWalls}>
        <Built parts={shell} shadows={false} />
      </Tappable>
      <mesh rotation-x={Math.PI / 2} position={[0, H, mid]} geometry={plane}>
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

/** The counter: fluted front in the accent colour, marble top, a till and paper bags. */
export function Counter({ accent, onTap }: { accent: string; onTap?: () => void }) {
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
    // Paper bags waiting for orders.
    k.rbox("matte", [0.28, 0.32, 0.16], 0.01, [-0.95, 1.22, cz - 0.25], "#cfae84");
    k.rbox("matte", [0.24, 0.26, 0.14], 0.01, [-0.68, 1.19, cz - 0.3], "#f1ede6");
    return k.build();
  }, [accent]);
  return (
    <Tappable onTap={onTap}>
      <Built parts={parts} />
      <FloorShadow size={[5, 2.2]} position={[0, COUNTER_Z]} opacity={0.5} />
    </Tappable>
  );
}

/** Marble-topped sideboards along the sides, with books and a vase on each. */
export function Furniture() {
  const parts = useMemo(() => {
    const k = new Kit();
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.32);
      k.rbox("wood", [0.56, 0.78, 3.4], 0.02, [x, 0.47, -2.4], OAK);
      for (const z of [-3.5, -2.4, -1.3]) k.box("wood", [0.02, 0.68, 1.04], [x - sx * 0.28, 0.47, z], shade(OAK, -0.05));
      for (const z of [-3.5, -2.4, -1.3]) k.cyl("brass", 0.012, 0.012, 0.2, [x - sx * 0.3, 0.62, z], "#ffffff", 8, [Math.PI / 2, 0, 0]);
      k.rbox("marble", [0.62, 0.04, 3.46], 0.012, [x, 0.88, -2.4]);
      for (const z of [-4.0, -0.8]) k.cyl("brass", 0.02, 0.015, 0.08, [x - sx * 0.2, 0.04, z], "#ffffff", 10);
      // A stack of books, a ceramic vase and a candle.
      ["#1f3b33", "#d9cbb4", "#9b4a32"].forEach((c, i) => k.rbox("matte", [0.34 - i * 0.03, 0.05, 0.26 - i * 0.02], 0.008, [x, 0.925 + i * 0.05, -3.3], c, [0, i * 0.2, 0]));
      k.lathe("satin", [[0, 0], [0.08, 0], [0.12, 0.1], [0.1, 0.24], [0.05, 0.32], [0.055, 0.34], [0.045, 0.34]], [x, 0.9, -1.6], sx < 0 ? "#2a2b2a" : "#e9e3d9");
      k.cyl("satin", 0.04, 0.04, 0.09, [x, 0.945, -2.4], "#f6f1e7", 20);
    }
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

/** The feature wall behind the product screen, in the business's chosen style. */
export function Backdrop({ style, accent, wall, onTap }: { style: BackdropStyle; accent: string; wall: string; onTap?: () => void }) {
  const parts = useMemo(() => {
    const k = new Kit();
    const z = BACK + 0.03;
    if (style === "oak" || style === "walnut") {
      const wood = style === "oak" ? OAK : "#6e4a2e";
      k.box("matte", [6.4, 3.9, 0.02], [0, 1.95, BACK + 0.01], shade(wood, -0.35));
      for (let x = -3.15; x <= 3.151; x += 0.1) k.rbox("wood", [0.065, 3.9, 0.05], 0.012, [x, 1.95, z], Math.round(x * 10) % 3 === 0 ? shade(wood, -0.03) : wood);
      k.box("brass", [6.4, 0.03, 0.07], [0, 3.92, z + 0.01], "#ffffff");
    } else if (style === "fluted") {
      k.box("satin", [6.4, 3.9, 0.03], [0, 1.95, BACK + 0.015], "#ece8df");
      for (let x = -3.15; x <= 3.151; x += 0.1) k.cyl("satin", 0.05, 0.05, 3.9, [x, 1.95, z], "#f4f1ea", 14);
      k.box("brass", [6.4, 0.03, 0.08], [0, 3.92, z + 0.01], "#ffffff");
    } else if (style === "marble") {
      k.rbox("marble", [6.4, 3.9, 0.06], 0.01, [0, 1.95, z]);
      k.box("brass", [6.44, 0.03, 0.08], [0, 3.92, z + 0.01], "#ffffff");
    } else if (style === "painted") {
      k.rbox("satin", [6.4, 3.9, 0.04], 0.01, [0, 1.95, z], shade(mix(accent, wall, 0.12), -0.05));
      for (const [w, h, x, y] of [
        [6.44, 0.04, 0, 3.92],
        [6.44, 0.04, 0, 0.02],
        [0.04, 3.9, -3.2, 1.95],
        [0.04, 3.9, 3.2, 1.95],
      ] as const)
        k.box("brass", [w, h, 0.06], [x, y, z + 0.01], "#ffffff");
    } else if (style === "greenery") {
      // A living wall: a dark backing thick with leaves.
      k.box("matte", [6.4, 3.9, 0.04], [0, 1.95, z], "#1f3a26");
      let r = 41;
      const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      const greens = ["#ffffff", "#d7ecc6", "#bfe0a8", "#e6f2da"];
      // Layers of overlapping leaves, mostly facing out, so no backing shows through.
      for (let i = 0; i < 1100; i++) {
        const cell = (i % 4 === 0 ? 2 : 1) as 1 | 2;
        const size = cell === 1 ? 0.3 + rand() * 0.16 : 0.24;
        k.leaf(
          [-3.05 + rand() * 6.1, -0.1 + rand() * 3.85, z + 0.02 + rand() * 0.1],
          (rand() - 0.5) * 0.8,
          -0.35 + rand() * 0.5,
          size,
          greens[i % greens.length],
          cell,
          cell === 2 ? 0.34 : 0.85,
          0.1,
          (rand() - 0.5) * 2.4,
        );
      }
    } else if (style === "brick") {
      return null;
    }
    return style === "none" ? null : k.build();
  }, [style, accent, wall]);
  return (
    <Tappable onTap={onTap}>
      {parts && <Built parts={parts} shadows={false} />}
      {style === "brick" && (
        <mesh position={[0, 1.95, BACK + 0.02]}>
          <planeGeometry args={[6.4, 3.9]} />
          <meshStandardMaterial map={brick()} roughness={0.9} />
        </mesh>
      )}
      {/* Tapping the plain wall there opens the backdrop choices too. */}
      {style === "none" && onTap && (
        <mesh position={[0, 1.95, BACK + 0.02]}>
          <planeGeometry args={[6.4, 3.9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </Tappable>
  );
}
