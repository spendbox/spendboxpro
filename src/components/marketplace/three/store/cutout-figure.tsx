"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useDispose } from "../hooks";
import { softShadow } from "./surfaces";

// A product photo with its background removed, standing in the shop the way
// mockup and AR "placeholder" apps show them: the photo itself, crisp and
// true to colour, upright, always turned to face the visitor, with a soft
// shadow of its own outline on the floor and a darker touch where it meets it.

const NEAR = 18;

interface Figure {
  texture: THREE.Texture;
  /** The outline as a soft shadow, laid on the floor behind it. */
  shadow: THREE.Texture;
  /** Width ÷ height. */
  aspect: number;
  /** The picture already has a head on top (a model, or a mannequin with one). */
  hasHead: boolean;
}

/**
 * Whether the shape starts with a head: one narrow piece in the middle at the
 * top that widens into shoulders below. Flat-lay clothes start wide.
 */
function looksLikeHead(mask: Uint8Array, w: number, h: number) {
  const widths: number[] = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += mask[y * w + x]!;
    widths.push(n);
  }
  const rows = widths.map((n, y) => (n ? y : -1)).filter((y) => y >= 0);
  if (rows.length < 10) return false;
  const top = rows[0]!;
  const tall = rows[rows.length - 1]! - top + 1;
  const widest = Math.max(...widths);
  const headRows = widths.slice(top, top + Math.max(2, Math.round(tall * 0.08)));
  const head = headRows.reduce((a, b) => a + b, 0) / headRows.length;
  const shoulders = Math.max(...widths.slice(top + Math.round(tall * 0.12), top + Math.round(tall * 0.35)));
  // A head is one piece in the middle; a shirt's two shoulder points (with the neck between) aren't.
  const y = top + Math.max(1, Math.round(tall * 0.04));
  let runs = 0;
  let first = -1;
  let last = -1;
  for (let x = 0; x < w; x++) {
    const on = mask[y * w + x] === 1;
    if (on && (x === 0 || mask[y * w + x - 1] !== 1)) runs++;
    if (on) {
      if (first < 0) first = x;
      last = x;
    }
  }
  const middle = (first + last) / 2 / w;
  return runs === 1 && middle > 0.3 && middle < 0.7 && head < widest * 0.42 && shoulders > head * 1.8;
}

/** How far each grid cell is from the edge of the shape (0 outside). */
/**
 * The picture ready to draw: see-through pixels take the colour of the
 * product next to them, so its soft edge never shows a pale or dark outline
 * when the picture is drawn small.
 */
function cleanEdges(img: HTMLImageElement) {
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = px[i * 4 + 3]! > 160 ? 1 : 0;
  // Spread the product's colours outwards into the see-through area.
  let filled = new Uint8Array(solid);
  for (let pass = 0; pass < 6; pass++) {
    const next = new Uint8Array(filled);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0 || !filled[j]) continue;
          r += px[j * 4]!;
          g += px[j * 4 + 1]!;
          b += px[j * 4 + 2]!;
          n++;
        }
        if (!n) continue;
        px[i * 4] = r / n;
        px[i * 4 + 1] = g / n;
        px[i * 4 + 2] = b / n;
        next[i] = 1;
      }
    filled = next;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/** The outline, squashed and blurred, as a shadow texture. */
function shadowOf(picture: HTMLCanvasElement) {
  const w = 128;
  const h = 96;
  const shape = document.createElement("canvas");
  shape.width = w;
  shape.height = h;
  const sctx = shape.getContext("2d")!;
  // Flipped, so the feet meet the shadow's near edge.
  sctx.translate(0, h);
  sctx.scale(1, -1);
  sctx.drawImage(picture, 8, 8, w - 16, h - 16);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = "source-in";
  // Darkest near the feet, fading away from them.
  const fade = sctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "rgba(20,16,12,0.15)");
  fade.addColorStop(1, "rgba(20,16,12,0.85)");
  sctx.fillStyle = fade;
  sctx.fillRect(0, 0, w, h);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  octx.filter = "blur(4px)";
  octx.drawImage(shape, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildFigure(img: HTMLImageElement): Figure {
  const picture = cleanEdges(img);
  const gw = 96;
  const gh = Math.max(8, Math.round((96 * img.height) / img.width));
  const c = document.createElement("canvas");
  c.width = gw;
  c.height = gh;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, gw, gh);
  const px = ctx.getImageData(0, 0, gw, gh).data;
  const mask = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) mask[i] = px[i * 4 + 3]! > 100 ? 1 : 0;
  const texture = new THREE.CanvasTexture(picture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, shadow: shadowOf(picture), aspect: img.width / img.height, hasHead: looksLikeHead(mask, gw, gh) };
}

/** The figure, made once the camera is near `at`; "failed" if the cutout can't be loaded. */
function useNearFigure(url: string, at: [number, number]) {
  const invalidate = useThree((s) => s.invalidate);
  const [near, setNear] = useState(false);
  const [figure, setFigure] = useState<Figure | "failed" | null>(null);
  useFrame(({ camera }) => {
    if (near) return;
    const dx = camera.position.x - at[0];
    const dz = camera.position.z - at[1];
    if (dx * dx + dz * dz < NEAR * NEAR) setNear(true);
  });
  useEffect(() => {
    if (!near) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      try {
        setFigure(buildFigure(img));
      } catch {
        setFigure("failed");
      }
      invalidate();
    };
    img.onerror = () => alive && setFigure("failed");
    img.src = url;
    return () => {
      alive = false;
    };
  }, [near, url, invalidate]);
  return figure;
}

function useFigure(url: string, at: [number, number]) {
  const figure = useNearFigure(url, at);
  const ready = figure && figure !== "failed" ? figure : null;
  useDispose(ready?.texture);
  useDispose(ready?.shadow);
  return { failed: figure === "failed", ready };
}

const camLocal = new THREE.Vector3();

/** Keeps a group turned to face the camera (round the upright axis). */
function useFaceCamera() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g?.parent) return;
    camLocal.copy(camera.position);
    g.parent.worldToLocal(camLocal);
    g.rotation.y = Math.atan2(camLocal.x - g.position.x, camLocal.z - g.position.z);
  });
  return ref;
}

/**
 * The photo standing upright, `height` metres tall with its bottom at `base`,
 * facing the visitor, with its shadow (when `shadow` gives the floor height).
 */
function Standee({ figure, height, base, z = 0, floor }: { figure: Figure; height: number; base: number; z?: number; floor?: number }) {
  const ref = useFaceCamera();
  const width = height * figure.aspect;
  return (
    <group ref={ref} position={[0, 0, z]}>
      <mesh position-y={base + height / 2}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={figure.texture} alphaTest={0.5} alphaToCoverage toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {floor !== undefined && (
        <>
          {/* Its outline on the floor behind it, as if lit from the front and above. */}
          <mesh rotation-x={-Math.PI / 2} position={[0, floor + 0.004, -height * 0.2]} renderOrder={2}>
            <planeGeometry args={[width * 1.05, height * 0.42]} />
            <meshBasicMaterial map={figure.shadow} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
          </mesh>
          {/* A darker touch where it stands. */}
          <mesh rotation-x={-Math.PI / 2} position={[0, floor + 0.005, 0]} renderOrder={3}>
            <planeGeometry args={[Math.max(0.3, width * 0.9), Math.max(0.16, width * 0.35)]} />
            <meshBasicMaterial map={softShadow()} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** A cutout standing with its bottom at `base`, fitting maxW × maxH. Shows `fallback` if it can't load. */
export function CutoutFigure({
  url,
  at,
  base,
  maxW,
  maxH,
  z = 0,
  fallback = null,
}: {
  url: string;
  at: [number, number];
  base: number;
  maxW: number;
  maxH: number;
  z?: number;
  fallback?: ReactNode;
}) {
  const { failed, ready } = useFigure(url, at);
  if (failed) return <>{fallback}</>;
  if (!ready) return null;
  return <Standee figure={ready} height={Math.min(maxH, maxW / ready.aspect)} base={base} z={z} floor={base} />;
}

/**
 * Clothes from the product's 3D cutout. A photo of a model (it has a head)
 * stands full height on the floor; clothes on their own float at the height
 * they're worn, like "ghost mannequin" shop photos, over a clear stand.
 */
export function WornFigure({ url, at, fallback = null }: { url: string; at: [number, number]; fallback?: ReactNode }) {
  const { failed, ready } = useFigure(url, at);
  if (failed) return <>{fallback}</>;
  if (!ready) return null;
  if (ready.hasHead) return <Standee figure={ready} height={Math.min(1.78, 1.0 / ready.aspect)} base={0} floor={0} />;
  // A full outfit reaches down to the shoes; a top or dress sits higher.
  const tall = ready.aspect <= 0.8;
  const height = tall ? Math.min(1.42, 1.1 / ready.aspect) : Math.min(0.8, 0.7 / ready.aspect);
  const bottom = 1.5 - height;
  return (
    <>
      {bottom > 0.08 && (
        <>
          <mesh position-y={bottom / 2}>
            <cylinderGeometry args={[0.012, 0.012, bottom, 12]} />
            <meshPhysicalMaterial color="#ffffff" roughness={0.05} transmission={0.9} thickness={0.02} transparent opacity={0.35} />
          </mesh>
          <mesh position-y={0.008}>
            <cylinderGeometry args={[0.2, 0.21, 0.016, 40]} />
            <meshPhysicalMaterial color="#ffffff" roughness={0.05} transparent opacity={0.3} />
          </mesh>
        </>
      )}
      <Standee figure={ready} height={height} base={bottom} floor={0} />
    </>
  );
}
