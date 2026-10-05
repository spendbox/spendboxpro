"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { DISPLAY_KINDS, type DisplayKind } from "@/lib/product-display";
import { formatMoney } from "@/lib/format";
import { mix } from "../geometry";
import { useDispose } from "../hooks";
import { canvas, fitText, fontFamily, roundRect, shade, toTexture } from "../textures";
import type { Hall, HallItem } from "./hall";
import { FRONT } from "./hall";
import { CutoutFigure, MannequinFigure, MannequinHead } from "./cutout-figure";
import { Built, Kit } from "./kit";
import { H, W } from "./layout";
import { FloorShadow } from "./room";
import { tap, useHoverCursor } from "./tap";

// The product hall's displays, one for each product: clothes on a dress-form
// mannequin (the photo wrapped round it like the garment), food on a plate on
// a laid table, homes as a model house in a glass case with the listing photo
// beside it, videos on a roll-up banner, and anything else on a pedestal.
//
// All the furniture is built at once and merged by material (a few draw calls
// for the whole hall); only the product pictures are separate, and each one
// loads when the visitor comes near.

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

function PhotoPlane({ item, size, position, rotation, aspect, round = false }: { item: HallItem; size: [number, number]; position: Vec; rotation?: Vec; aspect?: number; round?: boolean }) {
  const texture = useNearTexture(pictureUrl(item), aspect ?? size[0] / size[1], [item.x, item.z]);
  return (
    <mesh position={position} rotation={rotation}>
      {round ? <circleGeometry args={[size[0] / 2, 40]} /> : <planeGeometry args={size} />}
      {texture ? <meshBasicMaterial key={texture.uuid} map={texture} toneMapped={false} /> : <meshStandardMaterial key="blank" color="#e4ddd2" roughness={0.9} />}
    </mesh>
  );
}

// ---------------------------------------------------------------- Labels

/** The little card in front of each display: name and price. */
function tagTexture(title: string, price: string | null, accent: string) {
  const { c, ctx } = canvas(512, 176);
  ctx.fillStyle = "#fbfaf6";
  roundRect(ctx, 0, 0, 512, 176, 22);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 10, 176);
  const display = fontFamily("display");
  ctx.fillStyle = "#1c211e";
  ctx.textBaseline = "middle";
  let name = title;
  fitText(ctx, name, 450, 44, 700, display);
  while (ctx.measureText(name).width > 450 && name.length > 4) name = `${name.slice(0, -2).trimEnd()}…`;
  ctx.fillText(name, 34, 62);
  ctx.fillStyle = price ? shade(accent, -0.1) : "#6b726e";
  ctx.font = `700 ${price ? 46 : 36}px ${display}`;
  ctx.fillText(price ?? "Ask for price", 34, 128);
  return toTexture(c);
}

function priceOf(item: HallItem) {
  return item.product.price != null ? formatMoney(item.product.price, item.product.currency) : null;
}

function Tag({ item, accent, position, rotation = [-0.35, 0, 0], width = 0.34 }: { item: HallItem; accent: string; position: Vec; rotation?: Vec; width?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const [near, setNear] = useState(false);
  useFrame(({ camera }) => {
    if (near) return;
    const dx = camera.position.x - item.x;
    const dz = camera.position.z - item.z;
    if (dx * dx + dz * dz < NEAR * NEAR) setNear(true);
  });
  const texture = useMemo(() => (near ? tagTexture(item.product.title, priceOf(item), accent) : null), [near, item, accent]);
  useDispose(texture);
  useEffect(() => invalidate(), [texture, invalidate]);
  if (!texture) return null;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, (width * 176) / 512]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/** The roll-up banner's print: brand colours, a "Watch" header and the product's name and price. */
function bannerTexture(title: string, price: string | null, accent: string) {
  const { c, ctx } = canvas(340, 820);
  const g = ctx.createLinearGradient(0, 0, 0, 820);
  g.addColorStop(0, shade(accent, -0.18));
  g.addColorStop(1, shade(accent, 0.08));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 340, 820);
  const display = fontFamily("display");
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 30px ${display}`;
  ctx.fillText("▶  WATCH", 170, 44);
  let name = title;
  fitText(ctx, name, 300, 34, 800, display);
  while (ctx.measureText(name).width > 300 && name.length > 4) name = `${name.slice(0, -2).trimEnd()}…`;
  ctx.fillText(name, 170, 722);
  ctx.font = `700 28px ${display}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(price ?? "Ask for price", 170, 772);
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

/** A section's sign: its name and how many products it has. */
function signTexture(label: string, count: number, accent: string) {
  const { c, ctx } = canvas(1024, 256);
  ctx.fillStyle = "#1d2320";
  roundRect(ctx, 0, 0, 1024, 256, 40);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, 40, 196, 140, 14, 7);
  ctx.fill();
  const display = fontFamily("display");
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  fitText(ctx, label, 720, 104, 800, display);
  ctx.fillText(label, 40, 112);
  ctx.textAlign = "right";
  ctx.font = `700 64px ${display}`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(String(count), 984, 112);
  return toTexture(c);
}

// ---------------------------------------------------------------- Furniture (merged)

/** The dress form's outline: [radius, height]. */
const FORM: [number, number][] = [
  [0, 0.84],
  [0.15, 0.845],
  [0.175, 0.9],
  [0.185, 0.98],
  [0.165, 1.08],
  [0.15, 1.14],
  [0.165, 1.22],
  [0.185, 1.3],
  [0.18, 1.38],
  [0.155, 1.45],
  [0.1, 1.5],
  [0.05, 1.53],
  [0.045, 1.6],
  [0, 1.6],
];
const FORM_SCALE: Vec = [1.18, 1, 0.74];

function formRadius(y: number) {
  for (let i = 1; i < FORM.length; i++) {
    const [r1, y1] = FORM[i]!;
    const [r0, y0] = FORM[i - 1]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return 0;
}

/** The garment's outline: evenly spaced up the form (so the photo isn't stretched), flaring into a skirt below the hips. */
const GARMENT_BOTTOM = 0.62;
const GARMENT_TOP = 1.51;
const GARMENT: THREE.Vector2[] = Array.from({ length: 16 }, (_, i) => {
  const y = GARMENT_BOTTOM + ((GARMENT_TOP - GARMENT_BOTTOM) * i) / 15;
  const r = y < 0.9 ? 0.177 + (0.9 - y) * 0.3 : formRadius(y) + 0.012;
  return new THREE.Vector2(r, y);
});

/** A glossy black boutique dress form on a slim base (its head is added separately). */
function dressForm(k: Kit) {
  k.cyl("leather", 0.24, 0.26, 0.024, [0, 0.012, 0], "#141414", 40);
  k.cyl("leather", 0.016, 0.016, 0.84, [0, 0.44, 0], "#141414", 12);
  k.add("leather", new THREE.LatheGeometry(FORM.map(([r, y]) => new THREE.Vector2(r, y)), 32).scale(...FORM_SCALE), "#141414");
}

/** A black dress form, unless the product's own 3D cutout stands there (it brings its own mannequin parts). */
function mannequin(k: Kit, cutout: boolean) {
  if (!cutout) dressForm(k);
}

/** Two oak-topped white steps: the shoe (or bag) on the top one. */
function riser(k: Kit, cutout: boolean) {
  k.rbox("satin", [0.72, 0.42, 0.56], 0.015, [0, 0.21, 0.02], "#f5f2ec");
  k.box("wood", [0.73, 0.025, 0.57], [0, 0.432, 0.02], "#c79f74");
  k.rbox("satin", [0.48, 0.34, 0.36], 0.015, [0, 0.615, -0.08], "#f5f2ec");
  k.box("wood", [0.49, 0.025, 0.37], [0, 0.797, -0.08], "#c79f74");
  // Without a cutout, the photo leans on a little acrylic stand on the lower step.
  if (!cutout) k.rbox("glass", [0.3, 0.03, 0.1], 0.008, [0, 0.46, 0.17]);
}

function table(k: Kit, accent: string) {
  k.cyl("brass", 0.22, 0.24, 0.025, [0, 0.0125, 0], "#ffffff", 32);
  k.cyl("metal", 0.035, 0.045, 0.72, [0, 0.38, 0], "#2a2c2b", 12);
  k.cyl("wood", 0.55, 0.55, 0.035, [0, 0.745, 0], "#b98d62", 48);
  // (Outlines run from the outside in, so the top faces up.)
  k.lathe("linen", [[0.618, 0.515], [0.62, 0.52], [0.615, 0.66], [0.6, 0.745], [0.56, 0.768], [0, 0.768]], [0, 0, 0], "#ffffff", 48);
  // Charger plate, cutlery on a napkin, a glass and a candle.
  k.lathe("china", [[0.243, 0.024], [0.25, 0.022], [0.235, 0.012], [0.2, 0.003], [0, 0.003]], [0, 0.768, 0.12], "#f6f3ec", 40);
  k.rbox("fabric", [0.12, 0.006, 0.2], 0.002, [-0.34, 0.769, 0.12], mix(accent, "#ffffff", 0.55));
  k.box("metal", [0.014, 0.006, 0.18], [-0.34, 0.774, 0.12], "#d9dcdc");
  k.box("metal", [0.016, 0.006, 0.19], [0.31, 0.769, 0.12], "#d9dcdc");
  k.lathe("glass", [[0, 0], [0.035, 0], [0.006, 0.01], [0.006, 0.09], [0.03, 0.11], [0.038, 0.17], [0.036, 0.17]], [0.3, 0.766, -0.1]);
  k.cyl("satin", 0.025, 0.025, 0.07, [-0.24, 0.8, -0.14], "#f6f1e7", 16);
  k.lathe("brass", [[0, 0], [0.04, 0], [0.042, 0.01]], [-0.24, 0.766, -0.14], "#ffffff", 20);
  // The menu card's stand.
  k.box("wood", [0.3, 0.38, 0.015], [0, 0.96, -0.3], "#8a6448", [-0.12, 0, 0]);
  k.box("wood", [0.2, 0.012, 0.08], [0, 0.771, -0.29], "#8a6448");
}

const ROOFS = ["#3b4049", "#9a4b33", "#34493d", "#5b4636"];

function house(k: Kit, index: number) {
  // Plinth with a brass edge, a lawn and a path.
  k.rbox("satin", [1.05, 0.78, 1.05], 0.02, [0, 0.39, 0], "#f2efe8");
  k.box("brass", [1.07, 0.02, 1.07], [0, 0.785, 0], "#ffffff");
  k.rbox("matte", [0.9, 0.03, 0.9], 0.01, [0, 0.81, 0], "#93bd74");
  k.box("satin", [0.12, 0.006, 0.28], [0, 0.828, 0.3], "#e9e2d4");
  const y0 = 0.825;
  const wall = index % 3 === 1 ? "#ece2d0" : "#f4f0e8";
  const roof = ROOFS[index % ROOFS.length]!;
  // Two storeys.
  k.box("satin", [0.56, 0.22, 0.36], [0, y0 + 0.11, -0.04], wall);
  k.box("satin", [0.56, 0.2, 0.36], [0, y0 + 0.32, -0.04], wall);
  k.box("satin", [0.58, 0.015, 0.38], [0, y0 + 0.222, -0.04], "#ffffff");
  // Gable roof: a triangular end and two slopes.
  const top = y0 + 0.42;
  const gable = new THREE.Shape([new THREE.Vector2(-0.18, 0), new THREE.Vector2(0.18, 0), new THREE.Vector2(0, 0.13)]);
  const prism = new THREE.ExtrudeGeometry(gable, { depth: 0.56, bevelEnabled: false }).translate(0, 0, -0.28).rotateY(Math.PI / 2);
  k.add("satin", prism, wall, [0, top, -0.04]);
  const slope = Math.atan2(0.13, 0.18);
  for (const s of [1, -1]) k.box("satin", [0.64, 0.022, 0.25], [0, top + 0.07, -0.04 + s * 0.1], roof, [s * slope, 0, 0]);
  k.box("satin", [0.06, 0.15, 0.06], [0.17, top + 0.12, -0.12], "#8c5a45");
  // Front: door, windows with white frames, a balcony.
  const front = 0.141;
  const pane = "#2c3a44";
  k.box("satin", [0.1, 0.16, 0.012], [0, y0 + 0.08, front], "#ffffff");
  k.box("wood", [0.08, 0.145, 0.014], [0, y0 + 0.075, front + 0.002], shade(roof, 0.05));
  for (const [x, y, w, h] of [
    [-0.18, y0 + 0.12, 0.12, 0.09],
    [0.18, y0 + 0.12, 0.12, 0.09],
    [-0.16, y0 + 0.33, 0.11, 0.1],
    [0.16, y0 + 0.33, 0.11, 0.1],
    [0, y0 + 0.33, 0.1, 0.12],
  ] as const) {
    k.box("satin", [w + 0.02, h + 0.02, 0.01], [x, y, front], "#ffffff");
    k.box("satin", [w, h, 0.014], [x, y, front + 0.002], pane);
  }
  for (const sx of [-1, 1])
    for (const z of [-0.12, 0.04]) {
      k.box("satin", [0.012, 0.1, 0.1], [sx * 0.281, y0 + 0.33, z], "#ffffff");
      k.box("satin", [0.014, 0.08, 0.08], [sx * 0.282, y0 + 0.33, z], pane);
    }
  k.box("satin", [0.24, 0.012, 0.07], [0, y0 + 0.235, front + 0.035], "#ffffff");
  k.box("metal", [0.24, 0.04, 0.004], [0, y0 + 0.26, front + 0.068], "#2a2c2b");
  // A garage beside it, and two trees.
  k.box("satin", [0.2, 0.16, 0.3], [0.38, y0 + 0.08, -0.01], wall);
  k.box("satin", [0.22, 0.015, 0.32], [0.38, y0 + 0.165, -0.01], "#ffffff");
  k.box("satin", [0.15, 0.11, 0.01], [0.38, y0 + 0.06, 0.141], "#d9d4ca");
  for (const [x, z, r] of [
    [-0.36, 0.3, 0.07],
    [-0.36, -0.3, 0.085],
  ] as const) {
    k.cyl("wood", 0.008, 0.01, 0.08, [x, y0 + 0.04, z], "#6b4f3a", 6);
    k.sphere("satin", r, [x, y0 + 0.08 + r, z], "#5d8a45");
  }
  // The glass case, with brass edges.
  k.box("glass", [0.95, 0.62, 0.95], [0, 0.8 + 0.31, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box("brass", [0.012, 0.62, 0.012], [sx * 0.475, 1.11, sz * 0.475], "#ffffff");
  k.box("brass", [0.96, 0.012, 0.012], [0, 1.42, 0.475], "#ffffff");
  k.box("brass", [0.96, 0.012, 0.012], [0, 1.42, -0.475], "#ffffff");
  k.box("brass", [0.012, 0.012, 0.96], [0.475, 1.42, 0], "#ffffff");
  k.box("brass", [0.012, 0.012, 0.96], [-0.475, 1.42, 0], "#ffffff");
  // The listing photo's stand, behind.
  k.cyl("brass", 0.12, 0.14, 0.02, [0, 0.01, -0.7], "#ffffff", 24);
  k.cyl("brass", 0.012, 0.012, 1.5, [0, 0.76, -0.7], "#ffffff", 8);
  k.box("wood", [0.78, 0.58, 0.03], [0, 1.78, -0.71], "#2b2420");
}

function banner(k: Kit) {
  k.rbox("metal", [0.92, 0.09, 0.2], 0.03, [0, 0.07, 0], "#cfd3d6");
  for (const s of [-1, 1]) k.box("metal", [0.04, 0.02, 0.42], [s * 0.38, 0.01, -0.02], "#9aa0a3", [0, s * 0.25, 0]);
  k.cyl("metal", 0.012, 0.012, 2.08, [0, 1.14, -0.04], "#9aa0a3", 8);
  k.cyl("metal", 0.016, 0.016, 0.9, [0, 2.19, 0], "#cfd3d6", 10, [0, 0, Math.PI / 2]);
}

function pedestal(k: Kit, cutout: boolean) {
  k.box("satin", [0.6, 0.05, 0.6], [0, 0.025, 0], "#d9d3c8");
  k.rbox("satin", [0.56, 0.9, 0.56], 0.015, [0, 0.5, 0], "#f5f2ec");
  k.box("satin", [0.585, 0.02, 0.585], [0, 0.96, 0], "#faf8f3");
  for (const s of [-1, 1]) {
    k.box("brass", [0.59, 0.012, 0.012], [0, 0.944, s * 0.293], "#ffffff");
    k.box("brass", [0.012, 0.012, 0.59], [s * 0.293, 0.944, 0], "#ffffff");
  }
  // The photo's mount (a cutout stands on the pedestal itself).
  if (cutout) return;
  k.rbox("glass", [0.4, 0.05, 0.16], 0.01, [0, 0.995, 0]);
  k.box("satin", [0.54, 0.54, 0.02], [0, 1.26, -0.02], "#ffffff", [-0.08, 0, 0]);
}

/** Every display's furniture in one go, plus the hall's ceiling lights. */
function useHallFurniture(hall: Hall, accent: string) {
  return useMemo(() => {
    const k = new Kit();
    hall.items.forEach((item, i) => {
      const cutout = Boolean(item.product.cutout_url) && item.product.media_type === "image";
      k.place([item.x, 0, item.z], item.rotY, () => {
        if (item.kind === "wear") mannequin(k, cutout);
        else if (item.kind === "shoes") riser(k, cutout);
        else if (item.kind === "food") table(k, accent);
        else if (item.kind === "home") house(k, i);
        else if (item.kind === "video") banner(k);
        else pedestal(k, cutout);
      });
    });
    return k.build();
  }, [hall, accent]);
}

// ---------------------------------------------------------------- One display

/** The parts of a display that show the product (and take the tap). */
function ProductDisplay({ item, accent, focused, onPick }: { item: HallItem; accent: string; focused: boolean; onPick: (item: HallItem, far: boolean) => void }) {
  const hover = useHoverCursor();
  const onClick = tap((e: ThreeEvent<MouseEvent>) => {
    const dx = e.camera.position.x - item.x;
    const dz = e.camera.position.z - item.z;
    onPick(item, dx * dx + dz * dz > 5 * 5);
  });
  return (
    <group position={[item.x, 0, item.z]} rotation-y={item.rotY} onClick={onClick} {...hover.handlers}>
      {item.kind === "wear" && <Wear item={item} />}
      {item.kind === "shoes" && <OnRiser item={item} accent={accent} />}
      {item.kind === "food" && <Plate item={item} accent={accent} />}
      {item.kind === "home" && <Listing item={item} accent={accent} />}
      {item.kind === "video" && <Banner item={item} accent={accent} focused={focused} />}
      {item.kind === "item" && <OnPedestal item={item} accent={accent} />}
      {/* The area that takes the tap. */}
      <mesh position={HIT[item.kind].at} visible={false}>
        <boxGeometry args={HIT[item.kind].size} />
      </mesh>
    </group>
  );
}

const HIT: Record<DisplayKind, { at: Vec; size: Vec }> = {
  wear: { at: [0, 1.0, 0], size: [0.9, 2.0, 0.9] },
  shoes: { at: [0, 0.5, 0], size: [0.8, 1.0, 0.7] },
  food: { at: [0, 0.6, 0], size: [1.3, 1.2, 1.3] },
  home: { at: [0, 1.0, -0.2], size: [1.2, 2.1, 1.5] },
  video: { at: [0, 1.1, 0], size: [0.95, 2.2, 0.3] },
  item: { at: [0, 0.8, 0], size: [0.7, 1.6, 0.7] },
};

/** The product's 3D cutout, when it has one (and it's a photo). */
const cutoutOf = (item: HallItem) => (item.product.media_type === "image" ? (item.product.cutout_url ?? null) : null);

/**
 * Clothes: the 3D cutout of the photo (the model wearing it, full height, or
 * the garment itself at dress-form height) on the platform; without a cutout,
 * the photo wrapped round a dress form.
 */
function Wear({ item }: { item: HallItem }) {
  const url = cutoutOf(item);
  return (
    <>
      {url ? <MannequinFigure url={url} at={[item.x, item.z]} fallback={<Garment item={item} withForm />} /> : <Garment item={item} />}
      <NameAbove item={item} />
    </>
  );
}

/** The product's name floating above its mannequin, like the signs in a boutique window. */
function NameAbove({ item }: { item: HallItem }) {
  const invalidate = useThree((s) => s.invalidate);
  const [near, setNear] = useState(false);
  useFrame(({ camera }) => {
    if (near) return;
    const dx = camera.position.x - item.x;
    const dz = camera.position.z - item.z;
    if (dx * dx + dz * dz < NEAR * NEAR) setNear(true);
  });
  const texture = useMemo(() => {
    if (!near) return null;
    const { c, ctx } = canvas(512, 160);
    const display = fontFamily("display");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1c211e";
    let name = item.product.title;
    fitText(ctx, name, 480, 56, 800, display);
    while (ctx.measureText(name).width > 480 && name.length > 4) name = `${name.slice(0, -2).trimEnd()}…`;
    ctx.fillText(name, 256, 56);
    const price = priceOf(item);
    ctx.font = `600 38px ${display}`;
    ctx.fillStyle = "#4b524e";
    ctx.fillText(price ?? "Ask for price", 256, 120);
    return toTexture(c);
  }, [near, item]);
  useDispose(texture);
  useEffect(() => invalidate(), [texture, invalidate]);
  if (!texture) return null;
  return (
    <mesh position={[0, 2.12, 0]}>
      <planeGeometry args={[0.85, 0.265]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/** Shoes and bags: the 3D cutout on the top step, or the photo leaning on the lower one. */
function OnRiser({ item, accent }: { item: HallItem; accent: string }) {
  const url = cutoutOf(item);
  const photo = <PhotoPlane item={item} size={[0.3, 0.3]} position={[0, 0.62, 0.15]} rotation={[-0.25, 0, 0]} aspect={1} />;
  return (
    <>
      {url ? <CutoutFigure url={url} at={[item.x, item.z]} base={0.81} maxW={0.44} maxH={0.4} z={-0.08} fallback={photo} /> : photo}
      <Tag item={item} accent={accent} position={[0, 0.25, 0.302]} rotation={[0, 0, 0]} />
      <FloorShadow size={[1.0, 0.85]} position={[0, 0]} opacity={0.5} />
    </>
  );
}

/** A dress form on its own (when a cutout fails to load on a platform built without one). */
function LoneDressForm() {
  const parts = useMemo(() => {
    const k = new Kit();
    dressForm(k);
    return k.build();
  }, []);
  return <Built parts={parts} />;
}

/** The photo wrapped round the dress form, front and back. */
function Garment({ item, withForm = false }: { item: HallItem; withForm?: boolean }) {
  const [front, back] = useMemo(
    () => [
      new THREE.LatheGeometry(GARMENT, 28, -Math.PI / 2, Math.PI).scale(...FORM_SCALE),
      new THREE.LatheGeometry(GARMENT, 28, Math.PI / 2, Math.PI).scale(...FORM_SCALE),
    ],
    [],
  );
  useDispose(front);
  useDispose(back);
  const texture = useNearTexture(pictureUrl(item), 0.78, [item.x, item.z]);
  const material = texture ? <meshStandardMaterial key={texture.uuid} map={texture} roughness={0.85} /> : <meshStandardMaterial key="blank" color="#d8d0c4" roughness={0.9} />;
  return (
    <>
      {withForm && <LoneDressForm />}
      <MannequinHead y={1.54} />
      <mesh geometry={front} castShadow>
        {material}
      </mesh>
      <mesh geometry={back} castShadow>
        {material}
      </mesh>
      <FloorShadow size={[0.9, 0.9]} position={[0, 0]} opacity={0.45} />
    </>
  );
}

function Plate({ item, accent }: { item: HallItem; accent: string }) {
  return (
    <>
      <PhotoPlane item={item} size={[0.34, 0.34]} position={[0, 0.79, 0.12]} rotation={[-Math.PI / 2, 0, 0]} aspect={1} round />
      <PhotoPlane item={item} size={[0.26, 0.34]} position={[0, 0.96, -0.29]} rotation={[-0.12, 0, 0]} />
      <Tag item={item} accent={accent} position={[0, 0.58, 0.63]} rotation={[0, 0, 0]} width={0.38} />
      <FloorShadow size={[1.6, 1.6]} position={[0, 0]} opacity={0.4} />
    </>
  );
}

function Listing({ item, accent }: { item: HallItem; accent: string }) {
  return (
    <>
      <PhotoPlane item={item} size={[0.72, 0.52]} position={[0, 1.78, -0.69]} />
      <Tag item={item} accent={accent} position={[0, 0.56, 0.531]} rotation={[0, 0, 0]} width={0.42} />
      <FloorShadow size={[1.5, 1.5]} position={[0, 0]} opacity={0.45} />
    </>
  );
}

function Banner({ item, accent, focused }: { item: HallItem; accent: string; focused: boolean }) {
  const print = useMemo(() => bannerTexture(item.product.title, priceOf(item), accent), [item, accent]);
  useDispose(print);
  const aspect = 0.79 / 1.4;
  const poster = useNearTexture(item.product.poster_url, aspect, [item.x, item.z]);
  const video = useVideoTexture(item.product.media_url, aspect, focused);
  const picture = video ?? poster;
  return (
    <>
      <mesh position={[0, 1.145, 0]} castShadow>
        <planeGeometry args={[0.85, 2.05]} />
        <meshBasicMaterial map={print} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.2, 0.004]}>
        <planeGeometry args={[0.79, 1.4]} />
        {picture ? <meshBasicMaterial key={picture.uuid} map={picture} toneMapped={false} /> : <meshBasicMaterial key="blank" color="#1d2320" toneMapped={false} />}
      </mesh>
      {!video && (
        <mesh position={[0, 1.2, 0.008]}>
          <planeGeometry args={[0.24, 0.24]} />
          <meshBasicMaterial map={playTexture()} transparent toneMapped={false} />
        </mesh>
      )}
      <FloorShadow size={[1.2, 0.6]} position={[0, 0]} opacity={0.45} />
    </>
  );
}

function OnPedestal({ item, accent }: { item: HallItem; accent: string }) {
  const url = cutoutOf(item);
  const photo = <PhotoPlane item={item} size={[0.48, 0.48]} position={[0, 1.26, -0.008]} rotation={[-0.08, 0, 0]} />;
  return (
    <>
      {/* The product itself standing on the pedestal, when it has a 3D cutout. */}
      {url ? <CutoutFigure url={url} at={[item.x, item.z]} base={0.97} maxW={0.46} maxH={0.55} fallback={photo} /> : photo}
      <Tag item={item} accent={accent} position={[0, 0.72, 0.282]} rotation={[0, 0, 0]} />
      <FloorShadow size={[0.95, 0.95]} position={[0, 0]} opacity={0.5} />
    </>
  );
}

// ---------------------------------------------------------------- Signs and lights

function SectionSign({ label, count, accent, position, rotationY }: { label: string; count: number; accent: string; position: Vec; rotationY: number }) {
  const texture = useMemo(() => signTexture(label, count, accent), [label, count, accent]);
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

/** The business's name on the hall's far wall. */
function EndSign({ name, accent, z }: { name: string; accent: string; z: number }) {
  const texture = useMemo(() => {
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
  }, [name, accent]);
  useDispose(texture);
  return (
    <mesh position={[0, 2.9, z - 0.02]} rotation-y={Math.PI}>
      <planeGeometry args={[4.4, 1.1]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

export function HallDisplays({
  hall,
  name,
  accent,
  glow,
  focusedId,
  onPick,
}: {
  hall: Hall;
  name: string;
  accent: string;
  glow: string;
  focusedId: string | null;
  onPick: (item: HallItem, far: boolean) => void;
}) {
  const furniture = useHallFurniture(hall, accent);
  const kinds = useMemo(() => new Map(DISPLAY_KINDS.map((k) => [k.id, k])), []);
  return (
    <>
      <Built parts={furniture} />
      {hall.items.map((item) => (
        <ProductDisplay key={item.product.id} item={item} accent={accent} focused={focusedId === item.product.id} onPick={onPick} />
      ))}
      {hall.sections.map((s) =>
        s.kind === "food" || s.kind === "home" ? (
          // Over the islands, facing people walking down the hall.
          [-2.1, 2.1].map((x) => <SectionSign key={`${s.kind}${x}`} label={kinds.get(s.kind)!.section} count={s.count} accent={accent} position={[x, 3.75, s.z - 0.1]} rotationY={Math.PI} />)
        ) : (
          // High on both walls.
          [-1, 1].map((side) => (
            <SectionSign key={`${s.kind}${side}`} label={kinds.get(s.kind)!.section} count={s.count} accent={accent} position={[side * (W / 2 - 0.03), 3.3, s.z + 0.9]} rotationY={-side * (Math.PI / 2)} />
          ))
        ),
      )}
      {hall.items.length > 0 && <HallLights end={hall.end} glow={glow} />}
      <EndSign name={name} accent={accent} z={hall.end} />
    </>
  );
}
