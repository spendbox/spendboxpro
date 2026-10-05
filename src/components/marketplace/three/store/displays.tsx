"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { formatMoney } from "@/lib/format";
import { mix } from "../geometry";
import { useDispose } from "../hooks";
import { canvas, fitText, fontFamily, roundRect, shade, toTexture } from "../textures";
import type { StoreTheme } from "@/lib/store-theme";
import { frameSize, FRONT, SHELF, TABLE, type Fixture, type FrameSpec, type Hall, type HallItem } from "./hall";
import { Built, Kit, type Mat } from "./kit";
import { H } from "./layout";
import { FloorShadow } from "./room";
import { tap, useHoverCursor } from "./tap";
import { Showroom } from "./car/showroom";

// The product hall's displays. Every product is a framed picture with its
// name and price printed under the photo, in the frame style the business
// chose (walnut and mat, thin black, gold, white, or a frameless canvas);
// videos get a dark screen-like mat. Wall frames hang in a row with a brass
// picture light above each; small frames lean on shelving units and display
// tables against the walls, built in the business's chosen design and colour.
//
// All the furniture and frame mouldings are built at once and merged by
// material (a few draw calls for the whole hall); only the pictures and
// captions are separate, and each one loads when the visitor comes near.

type Vec = [number, number, number];

// ---------------------------------------------------------------- Pictures

/** Crops a loaded texture to fill `aspect` (width / height). */
function cover(tex: THREE.Texture, aspect: number) {
  const img = tex.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
  const w = img.videoWidth || img.width || 1;
  const h = img.videoHeight || img.height || 1;
  const ratio = w / h / aspect;
  tex.repeat.set(ratio > 1 ? 1 / ratio : 1, ratio > 1 ? 1 : ratio);
  tex.offset.set(ratio > 1 ? (1 - 1 / ratio) / 2 : 0, ratio > 1 ? 0 : (1 - ratio) / 2);
}

const NEAR = 18;

/** A product's picture, loaded once the camera comes within NEAR metres of `at`. */
function useNearTexture(url: string | null, aspect: number, at: [number, number]) {
  const invalidate = useThree((s) => s.invalidate);
  const [near, setNear] = useState(false);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useFrame(({ camera }) => {
    if (near || !url) return;
    const dx = camera.position.x - at[0];
    const dz = camera.position.z - at[1];
    if (dx * dx + dz * dz < NEAR * NEAR) setNear(true);
  });
  useEffect(() => {
    if (!near || !url) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, (tex) => {
      loaded = tex;
      if (!alive) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      cover(tex, aspect);
      setTexture(tex);
      invalidate();
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [near, url, aspect, invalidate]);
  return texture;
}

/** A video playing (muted, looping) while `active`, as a texture. */
function useVideoTexture(url: string, aspect: number, active: boolean) {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  useEffect(() => {
    if (!active) return;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.src = url;
    let tex: THREE.VideoTexture | null = null;
    const ready = () => {
      tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      cover(tex, aspect);
      setTexture(tex);
    };
    video.addEventListener("loadeddata", ready, { once: true });
    void video.play().catch(() => {});
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      tex?.dispose();
      setTexture(null);
    };
  }, [url, aspect, active]);
  // Keep drawing frames while the video plays.
  useFrame(({ invalidate }) => {
    if (texture) invalidate();
  });
  return active ? texture : null;
}

/** The picture a product shows: its photo, or a video's still frame. */
function pictureUrl(item: HallItem) {
  const p = item.product;
  return p.media_type === "video" ? p.poster_url : p.media_url;
}

// ---------------------------------------------------------------- Frames

function priceOf(item: HallItem) {
  return item.product.price != null ? formatMoney(item.product.price, item.product.currency) : null;
}

/** True once the camera has come within NEAR metres of `at`. */
function useNear(at: [number, number]) {
  const [near, setNear] = useState(false);
  useFrame(({ camera }) => {
    if (near) return;
    const dx = camera.position.x - at[0];
    const dz = camera.position.z - at[1];
    if (dx * dx + dz * dz < NEAR * NEAR) setNear(true);
  });
  return near;
}

/** The colours of each frame style: moulding (material and colour) and mat. */
const LOOK: Record<FrameSpec["style"], { mat: string; moulding: [Mat, string] }> = {
  classic: { mat: "#f3eee5", moulding: ["wood", "#56392a"] },
  gallery: { mat: "#fbfaf7", moulding: ["satin", "#1a1d1c"] },
  gold: { mat: "#f3eee5", moulding: ["brass", "#ffffff"] },
  white: { mat: "#ffffff", moulding: ["satin", "#f4f2ee"] },
  canvas: { mat: "#fbfaf7", moulding: ["satin", "#2b2b2b"] },
};
const SCREEN_MAT = "#151817";
const matOf = (f: FrameSpec) => (f.screen && f.style !== "canvas" ? SCREEN_MAT : LOOK[f.style].mat);
/** A canvas's caption is a small label below it, not the whole width. */
const captionWidth = (f: FrameSpec) => (f.style === "canvas" ? Math.min(f.photo[0], f.small ? 0.3 : 0.8) : f.photo[0] + 2 * f.mat);

/** The band under the photo (or a canvas's label): the product's name and its price. */
function captionTexture(f: FrameSpec, title: string, price: string | null, accent: string, video: boolean) {
  const mw = captionWidth(f);
  const w = Math.round(Math.min(1024, Math.max(512, mw * 700)));
  const h = Math.round((w * f.caption) / mw);
  const { c, ctx } = canvas(w, h);
  const bg = matOf(f);
  const dark = bg === SCREEN_MAT;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const display = fontFamily("display");
  const maxW = w * 0.86;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = dark ? "#ffffff" : "#1c211e";
  let name = video ? `▶  ${title}` : title;
  fitText(ctx, name, maxW, Math.round(h * 0.3), 700, display);
  while (ctx.measureText(name).width > maxW && name.length > 4) name = `${name.slice(0, -2).trimEnd()}…`;
  ctx.fillText(name, w / 2, h * 0.38);
  ctx.font = `600 ${Math.round(h * 0.24)}px ${display}`;
  ctx.fillStyle = dark ? mix(accent, "#ffffff", 0.45) : shade(accent, -0.12);
  ctx.fillText(price ?? "Ask for price", w / 2, h * 0.7);
  return toTexture(c);
}

/** A white play button. */
const playTexture = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const { c, ctx } = canvas(128, 128);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(50, 38);
    ctx.lineTo(92, 64);
    ctx.lineTo(50, 90);
    ctx.closePath();
    ctx.fill();
    t = toTexture(c);
    return t;
  };
})();

/** Black or white, whichever reads better on `bg`. */
function inkOn(bg: string) {
  const c = new THREE.Color(bg);
  return c.r * 0.299 + c.g * 0.587 + c.b * 0.114 > 0.6 ? "#1d2320" : "#ffffff";
}

/** A section's sign, in the shop's sign style: its name and how many products it has. */
function signTexture(label: string, count: number, accent: string, signs: StoreTheme["signs"]) {
  const bg = signs.color ?? (signs.style === "dark" ? "#1d2320" : signs.style === "light" ? "#fbf8f2" : signs.style === "brand" ? accent : "#c9a25a");
  const ink = inkOn(bg);
  const { c, ctx } = canvas(1024, 256);
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, 1024, 256, 40);
  ctx.fill();
  if (signs.style === "light" && !signs.color) {
    ctx.strokeStyle = "rgba(29,35,32,0.15)";
    ctx.lineWidth = 4;
    roundRect(ctx, 2, 2, 1020, 252, 38);
    ctx.stroke();
  }
  // A short bar: the accent colour, unless the sign is already in it (or a custom colour).
  ctx.fillStyle = signs.style === "brand" || signs.color ? ink : accent;
  roundRect(ctx, 40, 196, 140, 14, 7);
  ctx.fill();
  const display = fontFamily("display");
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  fitText(ctx, label, 720, 104, 800, display);
  ctx.fillText(label, 40, 112);
  ctx.textAlign = "right";
  ctx.font = `700 64px ${display}`;
  ctx.globalAlpha = 0.7;
  ctx.fillText(String(count), 984, 112);
  return toTexture(c);
}

// ---------------------------------------------------------------- Furniture (merged)

const WALNUT = "#56392a";
const OAK = "#c6a279";
const INK = "#1a1d1c";

/** A straight rod between two points in the y-z plane (picture-light arms, frame struts). */
function rod(k: Kit, mat: Mat, a: Vec, b: Vec, size: [number, number], color?: string) {
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  k.box(mat, [size[0], Math.hypot(dy, dz), size[1]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], color, [Math.atan2(dz, dy), 0, 0]);
}

/** A frame's moulding and backing: its foot at the origin, its back on z = 0, facing +z. */
function frameKit(k: Kit, f: FrameSpec) {
  const [w, h] = frameSize(f);
  const m = f.moulding;
  const d = f.depth;
  if (f.style === "canvas") {
    // Stretched canvas: the photo wraps a shallow box (its sides dark), the label hangs below.
    const top = f.caption + f.gap;
    k.box("satin", [f.photo[0], f.photo[1], d - 0.004], [0, top + f.photo[1] / 2, (d - 0.004) / 2], "#2b2b2b");
    return;
  }
  const [mat, color] = f.screen ? (["satin", INK] as [Mat, string]) : LOOK[f.style].moulding;
  // Brown-paper backing, as on a real frame.
  k.box("matte", [w - 0.02, h - 0.02, d - 0.014], [0, h / 2, (d - 0.014) / 2], "#9c7b57");
  const r = Math.min(0.006, m / 3);
  k.rbox(mat, [w, m, d], r, [0, h - m / 2, d / 2], color);
  k.rbox(mat, [w, m, d], r, [0, m / 2, d / 2], color);
  for (const s of [-1, 1]) k.rbox(mat, [m, h - 2 * m + 0.004, d], r, [s * (w - m) / 2, h / 2, d / 2], color);
  if (f.style === "gold") {
    // A raised inner bead on the gold frame.
    const t = f.small ? 0.008 : 0.016;
    const iw = w - 2 * m;
    const ih = h - 2 * m;
    for (const y of [m + t / 2, h - m - t / 2]) k.box("brass", [iw + t, t, d + 0.01], [0, y, d / 2 + 0.005]);
    for (const s of [-1, 1]) k.box("brass", [t, ih, d + 0.01], [s * (iw - t) / 2, h / 2, d / 2 + 0.005]);
  }
  if (f.style === "classic" && !f.screen) {
    // A fine gilt fillet round the inside of the moulding.
    const t = f.small ? 0.005 : 0.008;
    const iw = w - 2 * m;
    const ih = h - 2 * m;
    for (const y of [m + t / 2, h - m - t / 2]) k.box("brass", [iw, t, t], [0, y, d - 0.01]);
    for (const s of [-1, 1]) k.box("brass", [t, ih, t], [s * (iw - t) / 2, h / 2, d - 0.01]);
  }
}

/** A brass picture light above a wall frame. */
function pictureLight(k: Kit, f: FrameSpec) {
  const [w, h] = frameSize(f);
  const bar = Math.min(0.5, w * 0.42);
  k.cyl("brass", 0.022, 0.022, 0.02, [0, h + 0.07, 0.01], undefined, 16, [Math.PI / 2, 0, 0]);
  rod(k, "brass", [0, h + 0.07, 0.015], [0, h + 0.14, 0.17], [0.012, 0.012]);
  k.cyl("brass", 0.026, 0.022, bar, [0, h + 0.14, 0.18], undefined, 20, [0, 0, Math.PI / 2]);
}

/** The strut behind a frame that leans on a shelf or table. */
function strut(k: Kit, f: FrameSpec) {
  const h = frameSize(f)[1];
  rod(k, "wood", [0, h * 0.55, -0.003], [0, 0.02, -0.12], [0.03, 0.008], WALNUT);
}

/** A shelving unit's colours in each design: carcass (material, colour), shelves and back panel. */
function shelfColours(style: Fixture["style"], accent: string): { carcass: [Mat, string]; shelves: string; back: string } {
  switch (style) {
    case "walnut":
      return { carcass: ["wood", WALNUT], shelves: OAK, back: mix(accent, "#efe8dc", 0.84) };
    case "oak":
      return { carcass: ["wood", "#cfae84"], shelves: "#dcc39d", back: "#f3eee6" };
    case "white":
      return { carcass: ["satin", "#f2efe9"], shelves: OAK, back: mix(accent, "#ffffff", 0.9) };
    case "black":
      return { carcass: ["satin", INK], shelves: WALNUT, back: "#e9e4dc" };
    default:
      // In the brand's colour: a deep shade for the carcass, a pale tint behind.
      return { carcass: ["satin", mix(accent, "#141414", 0.35)], shelves: OAK, back: mix(accent, "#f4efe6", 0.86) };
  }
}

/** A shelving unit against the wall (its back on z = 0, facing +z), `w` long. */
function shelfUnit(k: Kit, style: Fixture["style"], accent: string, w: number) {
  const { depth: d, height: h, shelves } = SHELF;
  const { carcass, shelves: shelfColour, back } = shelfColours(style, accent);
  const [cm, cc] = carcass;
  k.box("matte", [w - 0.06, h - 0.08, 0.02], [0, 0.08 + (h - 0.08) / 2, 0.01], back);
  for (const s of [-1, 1]) k.rbox(cm, [0.04, h, d], 0.01, [s * (w / 2 - 0.02), h / 2, d / 2], cc);
  k.rbox(cm, [w + 0.04, 0.05, d + 0.03], 0.012, [0, h + 0.025, (d + 0.03) / 2], cc);
  // The cupboard under the bottom shelf, on a recessed plinth.
  k.box("satin", [w - 0.1, 0.08, d - 0.05], [0, 0.04, (d - 0.05) / 2], shade(cc, -0.35));
  const top = shelves[0]! - 0.035;
  const doorH = top - 0.09;
  const doors = Math.max(2, Math.round(w / 1.15));
  const dw = (w - 0.1) / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + 0.05 + dw * (i + 0.5);
    k.rbox(cm, [dw - 0.012, doorH, 0.025], 0.006, [x, 0.085 + doorH / 2, d - 0.0125], cc);
    k.cyl("brass", 0.008, 0.008, 0.12, [x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), 0.085 + doorH / 2, d + 0.008], undefined, 10);
  }
  for (const y of shelves) {
    k.rbox("wood", [w - 0.08, 0.035, d - 0.01], 0.008, [0, y - 0.0175, (d - 0.01) / 2 + 0.005], shelfColour);
    k.box("brass", [w - 0.08, 0.008, 0.006], [0, y - 0.012, d + 0.001]);
  }
}

/** A display table against the wall (its back edge TABLE.back out from it), `l` long, in its design. */
function displayTable(k: Kit, style: Fixture["style"], accent: string, l: number) {
  const { depth: w, back, height: h } = TABLE;
  const z = back + w / 2;
  if (style === "oak" || style === "glass") {
    if (style === "oak") k.rbox("wood", [l, 0.05, w], 0.012, [0, h - 0.025, z], OAK);
    else {
      k.box("glass", [l, 0.02, w], [0, h - 0.01, z]);
      for (const s of [-1, 1]) k.box("brass", [l, 0.012, 0.012], [0, h - 0.026, z + s * (w / 2 - 0.006)]);
    }
    // Legs, and a low shelf between them.
    const legMat: Mat = style === "oak" ? "wood" : "brass";
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(legMat, [0.04, h - 0.05, 0.04], [sx * (l / 2 - 0.06), (h - 0.05) / 2, z + sz * (w / 2 - 0.06)], style === "oak" ? shade(OAK, -0.12) : "#ffffff");
    k.rbox("wood", [l - 0.16, 0.03, w - 0.16], 0.008, [0, 0.18, z], style === "oak" ? OAK : WALNUT);
    return;
  }
  // A stone top on a solid plinth.
  k.rbox(style === "black" ? "darkMarble" : "marble", [l, 0.04, w], 0.01, [0, h - 0.02, z]);
  k.box("brass", [l + 0.004, 0.008, w + 0.004], [0, h - 0.044, z]);
  const plinth = style === "brand" ? mix(accent, "#23211f", 0.55) : style === "black" ? "#1d1c1a" : "#efebe4";
  k.rbox("satin", [l - 0.12, h - 0.09, w - 0.14], 0.02, [0, 0.04 + (h - 0.09) / 2, z], plinth);
  k.box("satin", [l - 0.16, 0.04, w - 0.18], [0, 0.02, z], shade(plinth, -0.3));
}

/** Every fixture, frame moulding, strut and picture light in one go. */
function useHallFurniture(hall: Hall, accent: string) {
  return useMemo(() => {
    const k = new Kit();
    for (const fx of hall.fixtures)
      k.place([fx.x, 0, fx.z], fx.rotY, () => (fx.kind === "shelf" ? shelfUnit(k, fx.style, accent, fx.length) : displayTable(k, fx.style, accent, fx.length)));
    for (const item of hall.items)
      k.place(
        [item.x, item.y, item.z],
        item.rotY,
        () => {
          frameKit(k, item.frame);
          if (item.tilt) strut(k, item.frame);
          else if (item.onWall) pictureLight(k, item.frame);
        },
        1,
        item.tilt,
      );
    return k.build();
  }, [hall, accent]);
}

// ---------------------------------------------------------------- One frame

/** A frame's mat, photo and caption (the moulding is in the merged furniture); tapping it picks the product. */
function ProductDisplay({ item, accent, focused, onPick }: { item: HallItem; accent: string; focused: boolean; onPick: (item: HallItem, far: boolean) => void }) {
  const hover = useHoverCursor();
  const onClick = tap((e: ThreeEvent<MouseEvent>) => {
    const dx = e.camera.position.x - item.x;
    const dz = e.camera.position.z - item.z;
    onPick(item, dx * dx + dz * dz > 5 * 5);
  });
  const f = item.frame;
  const [w, h] = frameSize(f);
  const video = item.product.media_type === "video";
  const canvasStyle = f.style === "canvas";
  const aspect = f.photo[0] / f.photo[1];
  const near = useNear([item.x, item.z]);
  const still = useNearTexture(pictureUrl(item), aspect, [item.x, item.z]);
  const playing = useVideoTexture(item.product.media_url, aspect, video && focused);
  const picture = playing ?? still;
  const caption = useMemo(() => (near ? captionTexture(f, item.product.title, priceOf(item), accent, video) : null), [near, f, item, accent, video]);
  useDispose(caption);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [caption, invalidate]);

  const m = f.moulding;
  const z = f.depth - (canvasStyle ? 0.002 : 0.012);
  const photoY = m + f.caption + f.gap + f.photo[1] / 2;
  const bevel = f.small ? 0.004 : 0.007;
  const mat = matOf(f);
  return (
    <group position={[item.x, item.y, item.z]} rotation-y={item.rotY} onClick={onClick} {...hover.handlers}>
      <group rotation-x={-item.tilt}>
        {!canvasStyle && (
          <>
            <mesh position={[0, h / 2, z]}>
              <planeGeometry args={[w - 2 * m, h - 2 * m]} />
              <meshBasicMaterial color={mat} toneMapped={false} />
            </mesh>
            {/* The mat's bevelled window. */}
            {f.mat > 0.02 && (
              <mesh position={[0, photoY, z + 0.0015]}>
                <planeGeometry args={[f.photo[0] + 2 * bevel, f.photo[1] + 2 * bevel]} />
                <meshBasicMaterial color={mat === SCREEN_MAT ? "#2a2f2d" : "#ffffff"} toneMapped={false} />
              </mesh>
            )}
          </>
        )}
        <mesh position={[0, photoY, z + 0.003]}>
          <planeGeometry args={f.photo} />
          {picture ? <meshBasicMaterial key={picture.uuid} map={picture} toneMapped={false} /> : <meshBasicMaterial key="blank" color={f.screen ? "#1d2320" : "#e4ddd2"} toneMapped={false} />}
        </mesh>
        {video && !playing && (
          <mesh position={[0, photoY, z + 0.0045]}>
            <planeGeometry args={[Math.min(f.photo[0], f.photo[1]) * 0.32, Math.min(f.photo[0], f.photo[1]) * 0.32]} />
            <meshBasicMaterial map={playTexture()} transparent toneMapped={false} />
          </mesh>
        )}
        {caption && (
          <mesh position={[0, m + f.caption / 2, canvasStyle ? 0.004 : z + 0.0015]}>
            <planeGeometry args={[canvasStyle ? captionWidth(f) : w - 2 * m, f.caption]} />
            <meshBasicMaterial map={caption} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- Signs and lights

function SectionSign({ label, count, accent, signs, position, rotationY }: { label: string; count: number; accent: string; signs: StoreTheme["signs"]; position: Vec; rotationY: number }) {
  const texture = useMemo(() => signTexture(label, count, accent, signs), [label, count, accent, signs]);
  useDispose(texture);
  return (
    <mesh position={position} rotation-y={rotationY}>
      <planeGeometry args={[1.2, 0.3]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Strip lights down the hall's ceiling. */
function HallLights({ end, glow }: { end: number; glow: string }) {
  const len = end - FRONT;
  return (
    <>
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} position={[x, H - 0.01, FRONT + len / 2]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[0.14, Math.max(0.5, len - 0.6)]} />
          <meshBasicMaterial color={glow} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- The hall

export function HallDisplays({
  hall,
  accent,
  glow,
  signs,
  focusedId,
  onPick,
}: {
  hall: Hall;
  accent: string;
  glow: string;
  signs: StoreTheme["signs"];
  focusedId: string | null;
  onPick: (item: HallItem, far: boolean) => void;
}) {
  const furniture = useHallFurniture(hall, accent);
  return (
    <>
      {/* Tapping a table, shelf or frame edge picks the nearest product on it (rather than walking into it). */}
      <group
        onClick={tap((e: ThreeEvent<MouseEvent>) => {
          let best: HallItem | null = null;
          let bestD = Infinity;
          for (const item of hall.items) {
            const d = (item.x - e.point.x) ** 2 + (item.z - e.point.z) ** 2 + (item.y + 0.25 - e.point.y) ** 2 * 0.5;
            if (d < bestD) [best, bestD] = [item, d];
          }
          if (best && bestD < 2.5 * 2.5) {
            const dx = e.camera.position.x - best.x;
            const dz = e.camera.position.z - best.z;
            onPick(best, dx * dx + dz * dz > 5 * 5);
          }
        })}
      >
        {/* No cast shadows: frames on walls shouldn't throw shapes on the floor (shelves and tables get soft ones below). */}
        <Built parts={furniture} shadows={false} />
      </group>
      {hall.fixtures.map((fx) => {
        const depth = fx.kind === "shelf" ? SHELF.depth : TABLE.back + TABLE.depth;
        return (
          <FloorShadow
            key={`${fx.x},${fx.z}`}
            size={[fx.length + 0.35, depth + 0.45]}
            position={[fx.x + Math.sin(fx.rotY) * (depth / 2), fx.z + Math.cos(fx.rotY) * (depth / 2)]}
            rotation={fx.rotY}
            opacity={0.42}
          />
        );
      })}
      {hall.items.map((item) => (
        <ProductDisplay key={item.product.id} item={item} accent={accent} focused={focusedId === item.product.id} onPick={onPick} />
      ))}
      {hall.sections.map((s) => (
        <SectionSign key={s.key} label={s.label} count={s.count} accent={accent} signs={signs} position={[s.sign.x, s.sign.y, s.sign.z]} rotationY={s.sign.rotY} />
      ))}
      {hall.cars.length > 0 && <Showroom cars={hall.cars} items={hall.items} accent={accent} onPick={onPick} />}
      {hall.items.length > 0 && <HallLights end={hall.end} glow={glow} />}
    </>
  );
}
