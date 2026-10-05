"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { StoreTheme } from "@/lib/store-theme";
import { useDispose } from "../hooks";
import { canvas, fitText, fontFamily, roundRect, toTexture } from "../textures";
import { Built, Kit } from "./kit";
import { W } from "./layout";
import { useImageTexture } from "./pieces";
import { plantKit } from "./plants";
import { FloorShadow } from "./room";
import { artTexture } from "./store-textures";
import { Tappable } from "./tap";

// The far wall at the end of the product hall, decorated as the business
// chooses: a centrepiece (its name, a big framed picture, an arched mirror,
// a living wall or floating shelves), wall lights either side, a console
// table with flowers or books, and a plant in each corner. Every piece has
// its own space on the wall, so nothing overlaps:
//
//   name (small, top)            y 3.8 – 4.5
//   centrepiece                  y 1.4 – 3.35, |x| < 1.6
//   lights                       |x| = 2.9
//   console + flowers            y 0 – 1.25, |x| < 0.95
//   corner plants                |x| = 4.75, on the floor

const WALNUT = "#56392a";
const OAK = "#c6a279";
const MIDDLE = 2.38;

function nameTexture(name: string, accent: string) {
  const { c, ctx } = canvas(1024, 256);
  const display = fontFamily("display");
  ctx.fillStyle = accent;
  roundRect(ctx, 462, 214, 100, 12, 6);
  ctx.fill();
  ctx.fillStyle = "#1d2320";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, name, 960, 130, 800, display);
  ctx.fillText(name, 512, 110);
  return toTexture(c);
}

/** A soft, silvery reflection for the mirror (there's nothing real to reflect). */
function mirrorTexture() {
  const { c, ctx } = canvas(256, 512);
  const g = ctx.createLinearGradient(0, 0, 256, 512);
  g.addColorStop(0, "#eef2f3");
  g.addColorStop(0.45, "#c9d3d6");
  g.addColorStop(1, "#aab6ba");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(40, 512);
  ctx.lineTo(120, 0);
  ctx.lineTo(170, 0);
  ctx.lineTo(90, 512);
  ctx.fill();
  return toTexture(c);
}

/** An arch: a rectangle with a round top, `w` wide and `h` tall, standing on y = 0. */
function arch(w: number, h: number) {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

/** Everything solid (frames, shelves, lights, console, plants), merged by material. */
function useWallParts(wall: StoreTheme["backWall"], accent: string) {
  return useMemo(() => {
    const k = new Kit();
    const { feature, lights, console: table, plants, pot } = wall;

    if (feature === "art") k.rbox("wood", [2.1, 1.5, 0.05], 0.01, [0, MIDDLE, 0.025], WALNUT);
    if (feature === "mirror") {
      const frame = new THREE.ExtrudeGeometry(arch(1.32, 2.06), { depth: 0.04, bevelEnabled: false });
      k.add("brass", frame, "#ffffff", [0, MIDDLE - 1.03, 0]);
    }
    if (feature === "leaves") {
      k.rbox("wood", [2.9, 1.95, 0.06], 0.01, [0, MIDDLE, 0.03], WALNUT);
      k.box("matte", [2.75, 1.8, 0.02], [0, MIDDLE, 0.065], "#2f4a33");
      // Leaves of a few greens, overlapping, inside the frame.
      for (let i = 0; i < 150; i++) {
        const x = (((i * 73) % 100) / 100 - 0.5) * 2.55;
        const y = MIDDLE + (((i * 37) % 100) / 100 - 0.5) * 1.6 - 0.12;
        const greens = ["#ffffff", "#d9ecc8", "#b9d7a2", "#e9f4dc"];
        k.leaf([x, y, 0.08 + (i % 5) * 0.012], 0, -0.25 - (i % 4) * 0.08, 0.26 + (i % 6) * 0.03, greens[i % 4], (i % 3) as 0 | 1 | 2, 0.42, 0.15, (i * 2.399) % (Math.PI * 2));
      }
    }
    if (feature === "shelves") {
      const colors = ["#2f4a3c", "#b9785a", "#e7dccb", "#3b4a63", accent, "#c9a25a"];
      [1.7, 2.3, 2.9].forEach((y, row) => {
        k.rbox("wood", [2.2, 0.05, 0.26], 0.01, [0, y - 0.025, 0.13], OAK);
        // Books leaning together, a vase and a little plant, different on each shelf.
        const left = row % 2 === 0 ? -0.8 : 0.35;
        for (let b = 0; b < 5; b++) k.rbox("satin", [0.045, 0.24 + ((b * 7 + row * 3) % 5) * 0.025, 0.17], 0.006, [left + b * 0.05, y + 0.13 + ((b * 7 + row * 3) % 5) * 0.0125, 0.12], colors[(b + row) % colors.length]);
        const vx = row % 2 === 0 ? 0.55 : -0.6;
        k.lathe("satin", [[0, 0], [0.07, 0], [0.09, 0.08], [0.06, 0.2], [0.035, 0.26], [0.04, 0.28], [0.03, 0.28]], [vx, y, 0.12], row === 1 ? "#f4f0e8" : "#2a2b2a");
        const px = row % 2 === 0 ? 0.0 : -0.1;
        k.lathe("satin", [[0, 0], [0.07, 0], [0.08, 0.12], [0.075, 0.13]], [px, y, 0.12], "#efebe4");
        for (let l = 0; l < 7; l++) k.sphere("satin", 0.05, [px + Math.sin(l * 0.9) * 0.06, y + 0.17 + (l % 3) * 0.035, 0.12 + Math.cos(l * 0.9) * 0.04], "#5d8a45");
      });
    }

    // Wall lights.
    if (lights === "sconces" || lights === "globes") {
      for (const x of [-2.9, 2.9]) {
        k.cyl("brass", 0.06, 0.06, 0.02, [x, 2.5, 0.01], "#ffffff", 20, [Math.PI / 2, 0, 0]);
        k.cyl("brass", 0.012, 0.012, 0.16, [x, 2.5, 0.09], "#ffffff", 8, [Math.PI / 2, 0, 0]);
        if (lights === "sconces") k.lathe("brass", [[0.04, 0], [0.11, -0.16], [0.105, -0.165], [0.035, -0.005]], [x, 2.7, 0.17], "#ffffff", 24);
      }
    }
    if (lights === "picture" && feature !== "name" && feature !== "none") {
      const top = feature === "mirror" ? MIDDLE + 1.06 : feature === "leaves" ? MIDDLE + 0.98 : feature === "shelves" ? 3.2 : MIDDLE + 0.75;
      k.cyl("brass", 0.022, 0.022, 0.02, [0, top + 0.08, 0.01], "#ffffff", 16, [Math.PI / 2, 0, 0]);
      k.box("brass", [0.012, 0.1, 0.16], [0, top + 0.13, 0.09], "#ffffff", [0.55, 0, 0]);
      k.cyl("brass", 0.028, 0.024, 0.7, [0, top + 0.17, 0.19], "#ffffff", 20, [0, 0, Math.PI / 2]);
    }

    // The console table, and what's on it.
    if (table !== "none") {
      k.rbox("wood", [1.8, 0.05, 0.4], 0.012, [0, 0.8, 0.22], WALNUT);
      k.rbox("wood", [1.7, 0.03, 0.34], 0.01, [0, 0.2, 0.22], WALNUT);
      for (const x of [-0.85, 0.85]) for (const z of [0.06, 0.38]) k.cyl("brass", 0.012, 0.012, 0.78, [x, 0.39, z], "#ffffff", 8);
      if (table === "flowers") {
        k.lathe("satin", [[0, 0], [0.08, 0], [0.12, 0.08], [0.1, 0.26], [0.06, 0.32], [0.07, 0.34], [0.06, 0.34]], [0, 0.825, 0.22], "#efebe4");
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4;
          const r = 0.05 + (i % 3) * 0.035;
          k.sphere("fabric", 0.045, [Math.sin(a) * r, 1.17 + (i % 4) * 0.02, 0.22 + Math.cos(a) * r * 0.6], i % 3 === 0 ? "#f6e7c8" : i % 3 === 1 ? "#ffffff" : "#f2c4c0");
        }
        for (let i = 0; i < 5; i++) k.leaf([Math.sin(i * 1.3) * 0.05, 1.12, 0.22 + Math.cos(i * 1.3) * 0.03], i * 1.3, 0.9, 0.16, "#d9ecc8", 0);
      } else {
        const books = ["#2f4a3c", "#e7dccb", "#b9785a"];
        books.forEach((c, i) => k.rbox("satin", [0.34 - i * 0.03, 0.05, 0.24], 0.006, [-0.45, 0.85 + i * 0.05, 0.22], c));
        k.lathe("satin", [[0, 0], [0.07, 0], [0.09, 0.1], [0.06, 0.24], [0.04, 0.3], [0.045, 0.32], [0.035, 0.32]], [0.45, 0.825, 0.22], "#2a2b2a");
        k.lathe("brass", [[0, 0], [0.09, 0], [0.1, 0.02], [0, 0.02]], [0, 0.825, 0.22], "#ffffff");
      }
    }

    // A plant in each corner.
    if (plants !== "none") for (const [x, seed] of [[-4.75, 0.4], [4.75, 1.7]] as const) k.place([x, 0, 0.6], 0, () => plantKit(k, plants, pot, seed));
    return k.build();
  }, [wall, accent]);
}

/** The picture in the big frame: a preset print or the business's own photo. */
function BigPicture({ art, accent }: { art: StoreTheme["backWall"]["art"]; accent: string }) {
  const preset = useMemo(() => artTexture(accent, art.kind === "preset" ? art.id : "arch"), [accent, art]);
  useDispose(preset);
  const photo = useImageTexture(art.kind === "image" ? art.url : null, 1.8 / 1.2);
  const picture = art.kind === "image" ? photo : preset;
  return (
    <>
      <mesh position={[0, MIDDLE, 0.052]}>
        <planeGeometry args={[2.0, 1.4]} />
        <meshStandardMaterial color="#f7f4ee" roughness={0.9} />
      </mesh>
      <mesh position={[0, MIDDLE, 0.054]}>
        <planeGeometry args={[1.8, 1.2]} />
        {picture ? <meshStandardMaterial key={picture.uuid} map={picture} roughness={0.8} /> : <meshStandardMaterial key="blank" color="#e7e2d8" roughness={0.9} />}
      </mesh>
    </>
  );
}

function Mirror() {
  const texture = useMemo(() => mirrorTexture(), []);
  useDispose(texture);
  const shape = useMemo(() => {
    const g = new THREE.ShapeGeometry(arch(1.2, 1.94), 24);
    // The shape's UVs run in metres; stretch the texture over the arch.
    const uv = g.attributes.uv!;
    const pos = g.attributes.position!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 1.2 + 0.5, pos.getY(i) / 1.94);
    return g;
  }, []);
  useDispose(shape);
  return (
    <mesh geometry={shape} position={[0, MIDDLE - 0.97, 0.042]}>
      <meshStandardMaterial map={texture} metalness={0.2} roughness={0.15} />
    </mesh>
  );
}

export function BackWall({ theme, name, accent, glow, end, onTap }: { theme: StoreTheme; name: string; accent: string; glow: string; end: number; onTap?: () => void }) {
  const wall = theme.backWall;
  const parts = useWallParts(wall, accent);
  const sign = useMemo(() => nameTexture(name, accent), [name, accent]);
  useDispose(sign);
  const big = wall.feature === "name";
  return (
    // The wall faces back down the hall; in here +z points away from it.
    <group position={[0, 0, end]} rotation-y={Math.PI}>
      <Tappable onTap={onTap}>
        {/* The whole wall takes the tap in the editor. */}
        {onTap && (
          <mesh position={[0, 2.5, 0.005]}>
            <planeGeometry args={[W, 5]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <Built parts={parts} />
        <mesh position={big ? [0, 2.6, 0.02] : [0, 4.15, 0.02]}>
          <planeGeometry args={big ? [4.4, 1.1] : [2.8, 0.7]} />
          <meshBasicMaterial map={sign} transparent toneMapped={false} />
        </mesh>
        {wall.feature === "art" && <BigPicture art={wall.art} accent={accent} />}
        {wall.feature === "mirror" && <Mirror />}
        {(wall.lights === "sconces" || wall.lights === "globes") &&
          [-2.9, 2.9].map((x) =>
            wall.lights === "globes" ? (
              <mesh key={x} position={[x, 2.5, 0.25]}>
                <sphereGeometry args={[0.11, 24, 16]} />
                <meshBasicMaterial color="#fff6e6" toneMapped={false} />
              </mesh>
            ) : (
              <mesh key={x} position={[x, 2.6, 0.17]}>
                <sphereGeometry args={[0.035, 12, 8]} />
                <meshBasicMaterial color={glow} toneMapped={false} />
              </mesh>
            ),
          )}
        {wall.console !== "none" && <FloorShadow size={[2.3, 0.9]} position={[0, 0.22]} opacity={0.4} />}
        {wall.plants !== "none" && [-4.75, 4.75].map((x) => <FloorShadow key={x} size={[1.2, 1.2]} position={[x, 0.6]} />)}
      </Tappable>
    </group>
  );
}
