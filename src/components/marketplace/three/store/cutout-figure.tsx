"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { useDispose } from "../hooks";

// A product photo with its background removed, made into a rounded 3D figure:
// the cut-out shape is "inflated" (thickest in the middle, thin at the edges),
// front and back, so a model wearing an outfit, a shoe or a bottle stands in
// the shop with real depth as you walk round it.

const GRID = 120;
const NEAR = 18;

interface Figure {
  texture: THREE.Texture;
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  /** Built 1 unit tall; this is its width. */
  width: number;
  height: number;
  /** The picture already has a head on top (a model, or a mannequin with one). */
  hasHead: boolean;
}

/**
 * Whether the shape starts with a head: a narrow part at the top that widens
 * into shoulders below it. Flat-lay clothes start wide (collar and shoulders).
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
function distanceFromEdge(mask: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h);
  const BIG = 1e6;
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? BIG : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]!);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i]!, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i]!, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
    }
  return d;
}

/**
 * The picture with clean edges: the soft rim (which still carries a little of
 * the old background) is trimmed by two pixels, and the see-through pixels take
 * the colour of the product next to them, so no pale outline shows.
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
  let solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = px[i * 4 + 3]! > 200 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(solid);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !solid[i - 1] || !solid[i + 1] || !solid[i - w] || !solid[i + w])) next[i] = 0;
      }
    solid = next;
  }
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
  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = solid[i] ? 255 : 0;
  ctx.putImageData(data, 0, 0);
  return c;
}

/** Builds the inflated front and back from the picture's see-through parts, 1 unit tall. */
function buildFigure(img: HTMLImageElement): Figure {
  const aspect = img.width / img.height;
  const height = 1;
  const width = aspect;
  const gw = Math.max(8, Math.round(aspect >= 1 ? GRID : GRID * aspect));
  const gh = Math.max(8, Math.round(aspect >= 1 ? GRID / aspect : GRID));
  const c = document.createElement("canvas");
  c.width = gw;
  c.height = gh;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, gw, gh);
  const px = ctx.getImageData(0, 0, gw, gh).data;
  const mask = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) mask[i] = px[i * 4 + 3]! > 100 ? 1 : 0;
  const hasHead = looksLikeHead(mask, gw, gh);
  const dist = distanceFromEdge(mask, gw, gh);
  let max = 1;
  for (const v of dist) if (v > max) max = v;
  const depth = Math.min(width, height) * 0.3;

  const front = new THREE.PlaneGeometry(width, height, gw - 1, gh - 1);
  const pos = front.attributes.position!;
  for (let iy = 0; iy < gh; iy++)
    for (let ix = 0; ix < gw; ix++) {
      const t = Math.min(1, dist[iy * gw + ix]! / max);
      // A rounded profile: steep at the edge, flat on top.
      pos.setZ(iy * gw + ix, depth * Math.sqrt(1 - (1 - t) * (1 - t)));
    }
  front.computeVertexNormals();

  const back = front.clone();
  const bpos = back.attributes.position!;
  for (let i = 0; i < bpos.count; i++) bpos.setZ(i, -bpos.getZ(i));
  const index = back.index!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  back.computeVertexNormals();

  const texture = new THREE.CanvasTexture(cleanEdges(img));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, front, back, width, height, hasHead };
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
  useDispose(ready?.front);
  useDispose(ready?.back);
  return { failed: figure === "failed", ready };
}

/** The inflated picture itself, `scale` metres tall, its middle at `y`. */
function Body({ figure, scale, y, z = 0 }: { figure: Figure; scale: number; y: number; z?: number }) {
  return (
    <group position={[0, y, z]} scale={scale}>
      <mesh geometry={figure.front}>
        <meshStandardMaterial map={figure.texture} alphaTest={0.6} roughness={0.6} />
      </mesh>
      <mesh geometry={figure.back}>
        <meshStandardMaterial map={figure.texture} alphaTest={0.6} roughness={0.7} color="#c9c4bc" />
      </mesh>
    </group>
  );
}

/** A cutout standing with its feet (or base) at `base`, fitting maxW × maxH. Shows `fallback` if it can't load. */
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
  fallback?: React.ReactNode;
}) {
  const { failed, ready } = useFigure(url, at);
  if (failed) return <>{fallback}</>;
  if (!ready) return null;
  const scale = Math.min(maxW / ready.width, maxH);
  return <Body figure={ready} scale={scale} y={base + scale / 2} z={z} />;
}

// ---------------------------------------------------------------- Boutique mannequins

/** Glossy black, like lacquered display mannequins. */
function Gloss() {
  return <meshPhysicalMaterial color="#0d0d0e" roughness={0.18} metalness={0.1} clearcoat={1} clearcoatRoughness={0.08} />;
}

/** A faceless egg-shaped head on a neck, its chin at `y`. */
export function MannequinHead({ y }: { y: number }) {
  return (
    <group position-y={y}>
      <mesh position-y={0.05}>
        <cylinderGeometry args={[0.042, 0.05, 0.12, 20]} />
        <Gloss />
      </mesh>
      <mesh position={[0, 0.2, 0.01]} scale={[0.1, 0.13, 0.115]} rotation-x={-0.12}>
        <sphereGeometry args={[1, 32, 24]} />
        <Gloss />
      </mesh>
    </group>
  );
}

/** A slim black base, with a pole up to `top` (when the clothes don't reach the floor). */
function MannequinStand({ top }: { top: number }) {
  return (
    <>
      <mesh position-y={0.012}>
        <cylinderGeometry args={[0.24, 0.26, 0.024, 40]} />
        <Gloss />
      </mesh>
      {top > 0.05 && (
        <mesh position-y={top / 2}>
          <cylinderGeometry args={[0.016, 0.016, top, 12]} />
          <Gloss />
        </mesh>
      )}
    </>
  );
}

const SHOULDERS = 1.52;

/**
 * Clothes worn on a glossy black boutique mannequin, from the product's 3D
 * cutout. A photo of a model (it has a head) stands full height as it is; an
 * outfit on its own gets the mannequin's head above its shoulders, and a top
 * on its own sits on a stand at chest height.
 */
export function MannequinFigure({ url, at, fallback = null }: { url: string; at: [number, number]; fallback?: React.ReactNode }) {
  const { failed, ready } = useFigure(url, at);
  if (failed) return <>{fallback}</>;
  if (!ready) return null;
  if (ready.hasHead) {
    const scale = Math.min(0.95 / ready.width, 1.78);
    return (
      <>
        <MannequinStand top={0} />
        <Body figure={ready} scale={scale} y={0.024 + scale / 2} />
      </>
    );
  }
  // A full outfit (tall) reaches the floor; a top or dress shorter than that sits on a pole.
  const tall = 1 / ready.width >= 1.25;
  // Wide robes (agbada, kaftans) may spread wider, so their feet still reach the floor.
  const scale = tall ? Math.min(1.15 / ready.width, SHOULDERS - 0.06) : Math.min(0.68 / ready.width, 0.8);
  const bottom = SHOULDERS - scale;
  return (
    <>
      <MannequinStand top={bottom + 0.02} />
      <Body figure={ready} scale={scale} y={SHOULDERS - scale / 2} />
      <MannequinHead y={SHOULDERS - 0.03} />
    </>
  );
}
