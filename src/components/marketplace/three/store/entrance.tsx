"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { StoreTheme } from "@/lib/store-theme";
import { useDispose } from "../hooks";
import { shade, toTexture, canvas } from "../textures";
import { Built, Kit } from "./kit";
import { W } from "./layout";
import { Tappable } from "./tap";

// The shop's door and window, on the left wall by the entrance, in the
// business's chosen designs. Through the glass you see the street outside (a
// painted view: sky, buildings, trees, the pavement), and the glass itself
// catches soft diagonal reflections, so it reads as glass rather than a pale
// panel. Frames have depth, with real hardware: a brass pull bar and kick
// plate on glass doors, lever handles on French doors, a stone threshold,
// and a marble sill (with a little plant) under the window.

const WALL = -W / 2;
/** The frame's face, just off the wall. */
const FX = WALL + 0.045;
const DOOR = { z: 1.6, w: 1.5, h: 2.55 };
const WINDOW = { z: -0.6, w: 2.1, y0: 1.15, y1: 2.6 };
/** The stretch of wall the outside view is painted across (so the door and window show the same street). */
const VIEW = { z0: -2.2, z1: 2.6, y0: 0, y1: 3.4 };

// ---------------------------------------------------------------- Painted textures

let outside: THREE.Texture | null = null;
/** The street outside: sky, a row of buildings, trees and the pavement, a little hazy with distance. */
function outsideTexture() {
  if (outside) return outside;
  const { c, ctx } = canvas(1024, 720);
  const horizon = 430;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#a9d2ee");
  sky.addColorStop(1, "#eef5f6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, horizon);
  // Soft clouds.
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (const [x, y, r] of [
    [180, 110, 46],
    [230, 100, 58],
    [285, 118, 40],
    [720, 80, 40],
    [770, 70, 52],
    [820, 86, 36],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Buildings across the street, each with a grid of windows.
  const fronts = ["#e2d6c4", "#cfd8de", "#e9dfd2", "#d6cfc4", "#c9d3cc", "#e4d2c6", "#d9dde2"];
  let x = -20;
  let i = 0;
  while (x < 1044) {
    const w = 110 + ((i * 53) % 70);
    const h = 150 + ((i * 97) % 140);
    const top = horizon - h + 40;
    ctx.fillStyle = fronts[i % fronts.length]!;
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = shade(fronts[i % fronts.length]!, -0.12);
    ctx.fillRect(x, top, w, 8);
    ctx.fillStyle = "rgba(70,90,110,0.45)";
    for (let wy = top + 24; wy < horizon - 10; wy += 34) for (let wx = x + 14; wx < x + w - 18; wx += 26) ctx.fillRect(wx, wy, 14, 20);
    x += w + 6;
    i++;
  }
  // A row of trees.
  for (let t = 0; t < 9; t++) {
    const tx = 40 + t * 118 + ((t * 37) % 30);
    ctx.fillStyle = "#6b5440";
    ctx.fillRect(tx - 4, horizon + 10, 8, 60);
    ctx.fillStyle = t % 2 ? "#5f8f4e" : "#4f7f43";
    for (const [dx, dy, r] of [
      [0, 0, 38],
      [-26, 14, 28],
      [26, 12, 30],
      [0, -26, 28],
    ] as const) {
      ctx.beginPath();
      ctx.arc(tx + dx, horizon + dy - 6, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The road and the pavement in front of the shop.
  ctx.fillStyle = "#9b9a96";
  ctx.fillRect(0, horizon + 60, 1024, 90);
  ctx.fillStyle = "#f2efe8";
  for (let d = 0; d < 1024; d += 90) ctx.fillRect(d, horizon + 102, 46, 5);
  ctx.fillStyle = "#d8d1c4";
  ctx.fillRect(0, horizon + 150, 1024, 720 - horizon - 150);
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  for (let d = 0; d < 1024; d += 64) {
    ctx.beginPath();
    ctx.moveTo(d, horizon + 150);
    ctx.lineTo(d - 40, 720);
    ctx.stroke();
  }
  // Distance haze.
  const haze = ctx.createLinearGradient(0, 0, 0, 720);
  haze.addColorStop(0, "rgba(255,255,255,0)");
  haze.addColorStop(0.55, "rgba(255,255,255,0.14)");
  haze.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, 1024, 720);
  outside = toTexture(c);
  return outside;
}

let streaks: THREE.Texture | null = null;
/** Reflections on the glass: soft diagonal bands of light and a bright edge, otherwise clear. */
function glassTexture() {
  if (streaks) return streaks;
  const { c, ctx } = canvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = "rgba(214,234,240,0.08)";
  ctx.fillRect(0, 0, 512, 512);
  ctx.save();
  ctx.translate(256, 256);
  ctx.rotate(-0.6);
  for (const [x, w, a] of [
    [-170, 70, 0.32],
    [-80, 22, 0.22],
    [60, 110, 0.18],
    [190, 30, 0.26],
  ] as const) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, -400, w, 800);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 506);
  streaks = toTexture(c);
  streaks.colorSpace = THREE.SRGBColorSpace;
  return streaks;
}

// ---------------------------------------------------------------- Shapes on the wall

type Outline = { kind: "rect"; z0: number; z1: number; y0: number; y1: number } | { kind: "arch"; z: number; w: number; y0: number; h: number } | { kind: "circle"; z: number; y: number; r: number };

function shapeOf(o: Outline) {
  if (o.kind === "rect") {
    const s = new THREE.Shape();
    s.moveTo(o.z0, o.y0);
    s.lineTo(o.z1, o.y0);
    s.lineTo(o.z1, o.y1);
    s.lineTo(o.z0, o.y1);
    s.lineTo(o.z0, o.y0);
    return s;
  }
  if (o.kind === "circle") {
    const s = new THREE.Shape();
    s.absarc(o.z, o.y, o.r, 0, Math.PI * 2, false);
    return s;
  }
  const r = o.w / 2;
  const s = new THREE.Shape();
  s.moveTo(o.z - r, o.y0);
  s.lineTo(o.z + r, o.y0);
  s.lineTo(o.z + r, o.y0 + o.h - r);
  s.absarc(o.z, o.y0 + o.h - r, r, 0, Math.PI, false);
  s.lineTo(o.z - r, o.y0);
  return s;
}

/** A flat shape standing on the wall at x, its outline drawn in (z, y); UVs either across the painted street (`street`) or across the shape itself. */
function wallShape(o: Outline, x: number, street: boolean) {
  const g = new THREE.ShapeGeometry(shapeOf(o), 32);
  const pos = g.attributes.position!;
  const uv = g.attributes.uv!;
  let zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    zmin = Math.min(zmin, pos.getX(i));
    zmax = Math.max(zmax, pos.getX(i));
    ymin = Math.min(ymin, pos.getY(i));
    ymax = Math.max(ymax, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getX(i);
    const y = pos.getY(i);
    // Seen from inside the shop (looking towards -x), z runs right to left.
    if (street) uv.setXY(i, 1 - (z - VIEW.z0) / (VIEW.z1 - VIEW.z0), (y - VIEW.y0) / (VIEW.y1 - VIEW.y0));
    else uv.setXY(i, 1 - (z - zmin) / (zmax - zmin || 1), (y - ymin) / (ymax - ymin || 1));
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Where glass goes for each design (outlines in z, y). */
function glazing(e: StoreTheme["entrance"]): Outline[] {
  const { z, w, h } = DOOR;
  const panes: Outline[] = [];
  if (e.door === "arched") panes.push({ kind: "arch", z, w: w - 0.1, y0: 0.06, h: h + 0.08 });
  else if (e.door === "french") for (const s of [-1, 1]) panes.push({ kind: "rect", z0: z + (s < 0 ? -w / 2 + 0.08 : 0.05), z1: z + (s < 0 ? -0.05 : w / 2 - 0.08), y0: 0.28, y1: h - 0.08 });
  else if (e.door === "oak") panes.push({ kind: "rect", z0: z + 0.12, z1: z + 0.36, y0: 0.5, y1: h - 0.32 });
  else if (e.door === "brand") panes.push({ kind: "circle", z, y: h * 0.66, r: 0.26 });
  else panes.push({ kind: "rect", z0: z - w / 2 + 0.08, z1: z + w / 2 - 0.08, y0: 0.26, y1: h - 0.08 });
  const { z: wz, w: ww, y0, y1 } = WINDOW;
  if (e.window === "arched") panes.push({ kind: "arch", z: wz, w: ww * 0.62, y0: y0 + 0.04, h: y1 - y0 + 0.42 });
  else panes.push({ kind: "rect", z0: wz - ww / 2 + 0.07, z1: wz + ww / 2 - 0.07, y0: y0 + 0.07, y1: y1 - 0.07 });
  return panes;
}

// ---------------------------------------------------------------- Frames and hardware (merged)

/** A deep rectangular frame: posts, head and sill with an inner bead, and optional glazing bars. */
function frame(k: Kit, z0: number, z1: number, y0: number, y1: number, c: string, bars: { across?: number; down?: number } = {}) {
  const w = z1 - z0;
  const h = y1 - y0;
  const zc = (z0 + z1) / 2;
  const t = 0.08;
  k.rbox("metal", [0.09, h, t], 0.01, [FX, y0 + h / 2, z0 + t / 2], c);
  k.rbox("metal", [0.09, h, t], 0.01, [FX, y0 + h / 2, z1 - t / 2], c);
  k.rbox("metal", [0.09, t, w], 0.01, [FX, y1 - t / 2, zc], c);
  k.rbox("metal", [0.09, t, w], 0.01, [FX, y0 + t / 2, zc], c);
  // The inner bead that holds the glass.
  const b = 0.018;
  k.box("metal", [0.03, h - 2 * t, b], [FX + 0.03, y0 + h / 2, z0 + t + b / 2], shade(c, 0.12));
  k.box("metal", [0.03, h - 2 * t, b], [FX + 0.03, y0 + h / 2, z1 - t - b / 2], shade(c, 0.12));
  k.box("metal", [0.03, b, w - 2 * t], [FX + 0.03, y1 - t - b / 2, zc], shade(c, 0.12));
  k.box("metal", [0.03, b, w - 2 * t], [FX + 0.03, y0 + t + b / 2, zc], shade(c, 0.12));
  for (let i = 1; i <= (bars.across ?? 0); i++) k.rbox("metal", [0.05, 0.035, w - 2 * t], 0.008, [FX + 0.01, y0 + (h * i) / ((bars.across ?? 0) + 1), zc], c);
  for (let i = 1; i <= (bars.down ?? 0); i++) k.rbox("metal", [0.05, h - 2 * t, 0.035], 0.008, [FX + 0.01, y0 + h / 2, z0 + (w * i) / ((bars.down ?? 0) + 1)], c);
}

/** An outline extruded off the wall (arched frames). */
function extruded(k: Kit, mat: "metal" | "wood" | "satin", outer: Outline, inner: Outline, depth: number, c: string) {
  const s = shapeOf(outer);
  s.holes.push(new THREE.Path(shapeOf(inner).getPoints(32)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 32 });
  // Shape (z, y) → world: z stays, extrusion runs out from the wall along +x.
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, FX - depth / 2 + pos.getZ(i), pos.getY(i), pos.getX(i));
  g.computeVertexNormals();
  k.add(mat, g, c);
}

/** A brass pull bar on stand-offs. */
function pullBar(k: Kit, z: number, y: number, length = 0.9) {
  k.cyl("brass", 0.016, 0.016, length, [FX + 0.11, y, z], "#ffffff", 14);
  for (const s of [-1, 1]) k.cyl("brass", 0.009, 0.009, 0.08, [FX + 0.07, y + s * (length / 2 - 0.08), z], "#ffffff", 8, [0, 0, Math.PI / 2]);
}

/** A lever handle with a round rose. */
function lever(k: Kit, z: number, y: number, dir: 1 | -1) {
  k.cyl("brass", 0.03, 0.03, 0.015, [FX + 0.055, y, z], "#ffffff", 16, [0, 0, Math.PI / 2]);
  k.rbox("brass", [0.02, 0.022, 0.13], 0.008, [FX + 0.09, y, z + dir * 0.06], "#ffffff");
}

function buildEntrance(k: Kit, e: StoreTheme["entrance"], accent: string) {
  const c = e.color;
  const { z, w, h } = DOOR;
  const z0 = z - w / 2;
  const z1 = z + w / 2;
  // A stone threshold, flush with the floor.
  k.box("satin", [0.24, 0.012, w + 0.1], [WALL + 0.12, 0.006, z], "#5b5853");

  if (e.door === "arched") {
    extruded(k, "metal", { kind: "arch", z, w: w + 0.12, y0: 0, h: h + 0.2 }, { kind: "arch", z, w: w - 0.1, y0: 0.06, h: h + 0.08 }, 0.09, c);
    k.rbox("metal", [0.05, 0.04, w - 0.1], 0.008, [FX + 0.01, h - 0.32, z], c);
    k.box("brass", [0.012, 0.2, w - 0.12], [FX + 0.02, 0.16, z], "#ffffff");
    pullBar(k, z + w / 2 - 0.22, 1.1);
  } else if (e.door === "french") {
    frame(k, z0, z1, 0, h, c);
    k.rbox("metal", [0.09, h - 0.08, 0.05], 0.008, [FX, h / 2, z], c);
    for (const s of [-1, 1]) {
      const a = s < 0 ? z0 + 0.08 : z + 0.05;
      const b = s < 0 ? z - 0.05 : z1 - 0.08;
      // Each leaf: a solid bottom panel and three glazing bars.
      k.rbox("metal", [0.06, 0.2, b - a], 0.01, [FX + 0.005, 0.16, (a + b) / 2], c);
      for (let i = 1; i <= 3; i++) k.box("metal", [0.04, 0.025, b - a], [FX + 0.012, 0.28 + ((h - 0.36) * i) / 4, (a + b) / 2], c);
      k.box("metal", [0.04, h - 0.36, 0.025], [FX + 0.012, 0.28 + (h - 0.36) / 2, (a + b) / 2], c);
      lever(k, z + s * 0.09, 1.05, s < 0 ? -1 : 1);
    }
  } else if (e.door === "oak" || e.door === "brand") {
    frame(k, z0, z1, 0, h, c);
    const leaf = e.door === "oak" ? "#b98a5c" : accent;
    const mat = e.door === "oak" ? "wood" : "satin";
    // A solid leaf with its window cut out (a tall strip, or a round porthole).
    const pane = glazing(e)[0]!;
    extruded(k, mat, { kind: "rect", z0: z0 + 0.08, z1: z1 - 0.08, y0: 0.08, y1: h - 0.08 }, pane, 0.05, leaf);
    if (e.door === "oak" && pane.kind === "rect") {
      // Raised panels beside the glass, and a slim frame round it.
      for (const [y, hh] of [
        [0.32, 0.5],
        [1.05, 0.95],
      ] as const)
        k.rbox("wood", [0.02, hh, w * 0.34], 0.006, [FX + 0.032, y + hh / 2, z - 0.22], shade(leaf, -0.06));
      const { z0: a, z1: b, y0: c0, y1: c1 } = pane;
      k.box("metal", [0.03, c1 - c0 + 0.04, 0.02], [FX + 0.03, (c0 + c1) / 2, a - 0.01], c);
      k.box("metal", [0.03, c1 - c0 + 0.04, 0.02], [FX + 0.03, (c0 + c1) / 2, b + 0.01], c);
      k.box("metal", [0.03, 0.02, b - a + 0.04], [FX + 0.03, c1 + 0.01, (a + b) / 2], c);
      k.box("metal", [0.03, 0.02, b - a + 0.04], [FX + 0.03, c0 - 0.01, (a + b) / 2], c);
    } else {
      // A brass ring round the porthole, and a brass kick plate.
      k.torus("brass", 0.275, 0.03, [FX + 0.03, h * 0.66, z], "#ffffff", [0, Math.PI / 2, 0]);
      k.box("brass", [0.012, 0.18, w - 0.3], [FX + 0.03, 0.17, z], "#ffffff");
    }
    pullBar(k, z1 - 0.2, 1.1, 0.6);
  } else {
    frame(k, z0, z1, 0, h, c, {});
    k.rbox("metal", [0.06, 0.18, w - 0.16], 0.01, [FX + 0.005, 0.17, z], c);
    k.box("brass", [0.012, 0.16, w - 0.2], [FX + 0.04, 0.17, z], "#ffffff");
    pullBar(k, z1 - 0.2, 1.1);
  }

  // The window, with a marble sill and a little plant on it.
  const { z: wz, w: ww, y0, y1 } = WINDOW;
  if (e.window === "arched") {
    const aw = ww * 0.62;
    extruded(k, "metal", { kind: "arch", z: wz, w: aw + 0.12, y0, h: y1 - y0 + 0.5 }, { kind: "arch", z: wz, w: aw, y0: y0 + 0.04, h: y1 - y0 + 0.42 }, 0.09, c);
    // Sunburst glazing bars in the arch, and one across.
    const cy = y0 + 0.04 + (y1 - y0 + 0.42) - aw / 2;
    for (const a of [Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75]) {
      const len = aw / 2;
      k.box("metal", [0.04, len, 0.025], [FX + 0.012, cy + (Math.sin(a) * len) / 2, wz + (Math.cos(a) * len) / 2], c, [-(a - Math.PI / 2), 0, 0]);
    }
    k.box("metal", [0.04, 0.03, aw], [FX + 0.012, cy, wz], c);
    k.rbox("marble", [0.18, 0.04, aw + 0.24], 0.01, [WALL + 0.09, y0 - 0.02, wz]);
  } else {
    frame(k, wz - ww / 2, wz + ww / 2, y0, y1, c, e.window === "grid" ? { across: 1, down: 2 } : {});
    k.rbox("marble", [0.18, 0.04, ww + 0.24], 0.01, [WALL + 0.09, y0 - 0.02, wz]);
    if (e.window === "shutters")
      // Slim louvred shutters folded open either side (clear of the door).
      for (const s of [-1, 1]) {
        const sz = wz + s * (ww / 2 + 0.17);
        k.rbox("satin", [0.03, y1 - y0 + 0.08, 0.26], 0.008, [FX, (y0 + y1) / 2, sz], c);
        for (let i = 0; i < 13; i++) k.box("satin", [0.045, 0.016, 0.2], [FX + 0.02, y0 + 0.06 + i * ((y1 - y0 - 0.08) / 13), sz], shade(c, 0.15));
      }
  }
  // A small potted plant on the sill.
  const px = WALL + 0.1;
  const pz = wz + (e.window === "arched" ? 0.42 : ww / 2 - 0.22);
  k.lathe("satin", [[0, 0], [0.055, 0], [0.065, 0.1], [0.06, 0.11]], [px, y0, pz], "#efebe4");
  for (let i = 0; i < 7; i++) k.sphere("satin", 0.045, [px + Math.sin(i * 0.9) * 0.04, y0 + 0.15 + (i % 3) * 0.03, pz + Math.cos(i * 0.9) * 0.04], "#5d8a45");
}

// ---------------------------------------------------------------- The entrance

export function Entrance({ entrance, accent, onTap }: { entrance: StoreTheme["entrance"]; accent: string; onTap?: () => void }) {
  const parts = useMemo(() => {
    const k = new Kit();
    buildEntrance(k, entrance, accent);
    return k.build();
  }, [entrance, accent]);
  const panes = useMemo(() => glazing(entrance), [entrance]);
  // The street behind each pane, and the glass in front of it.
  const geometries = useMemo(() => panes.map((p) => ({ view: wallShape(p, WALL + 0.004, true), glass: wallShape(p, FX + 0.02, false) })), [panes]);
  useDispose(useMemo(() => ({ dispose: () => geometries.forEach((g) => (g.view.dispose(), g.glass.dispose())) }), [geometries]));
  const street = outsideTexture();
  const glass = glassTexture();
  return (
    <Tappable onTap={onTap}>
      <Built parts={parts} shadows={false} />
      {geometries.map((g, i) => (
        <group key={i}>
          <mesh geometry={g.view}>
            <meshBasicMaterial map={street} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={g.glass} renderOrder={2}>
            <meshBasicMaterial map={glass} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </Tappable>
  );
}
