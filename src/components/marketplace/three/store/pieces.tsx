"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LIGHT_TONES, type Art, type PlantSpot, type StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import { useDispose } from "../hooks";
import { neonTexture, shopSignTexture } from "../textures";
import { useMaterials } from "./kit";
import { BACK, COUNTER_Z, H, LOUNGE, W } from "./layout";
import { ScreenCanvas } from "./screen-canvas";
import { artTexture, boardTexture, clockTexture } from "./store-textures";
import { Tappable, tap, useHoverCursor } from "./tap";

// The store's pieces with pictures or light: the welcome board, the product
// screen, the lamps, the wall art, the bell and the clock. The room and
// furniture are in room.tsx, plants.tsx and lounge.tsx.

export { BACK, COUNTER_Z, D, H, W } from "./layout";

export interface StoreBusiness {
  id: string;
  name: string;
  categories: string[];
  location: string | null;
  about: string | null;
  logo_url: string | null;
  brand_color: string;
  whatsapp: string | null;
}

/** What was tapped. Shoppers tap products, the bell and the board; the business (editing) taps anything. */
export type StoreTarget =
  | { kind: "product"; id: string }
  | { kind: "more" }
  | { kind: "bell" }
  | { kind: "board" }
  | { kind: "screen" }
  | { kind: "table" }
  | { kind: "plant"; spot: PlantSpot }
  | { kind: "lights" }
  | { kind: "art"; index: 0 | 1 }
  | { kind: "floor" }
  | { kind: "walls" };

export function businessTagline(business: StoreBusiness) {
  return [business.categories.slice(0, 2).join(" · "), business.location].filter(Boolean).join("  ·  ");
}

/** A flat picture that always shows its true colours. */
function Picture({ texture, size, position, rotation = [0, 0, 0] }: { texture: THREE.Texture; size: [number, number]; position: [number, number, number]; rotation?: [number, number, number] }) {
  useDispose(texture);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------- Welcome board

const BOARD_W = 3.6;
const BOARD_H = 0.85;
const BOARD_Y = 4.38;

/** The welcome board at the top of the back wall, in the business's chosen style and words. */
export function Board({ theme, business, accent, onTap }: { theme: StoreTheme; business: StoreBusiness; accent: string; onTap: () => void }) {
  const { style, title } = theme.board;
  const subtitle = theme.board.subtitle || businessTagline(business);
  const face = useMemo(() => boardTexture(style, title, subtitle, accent), [style, title, subtitle, accent]);
  useDispose(face);
  const m = useMaterials();
  const z = BACK + 0.02;
  return (
    <Tappable onTap={onTap} position={[0, BOARD_Y, z]}>
      {style === "letter" && (
        <>
          <mesh position-z={0.03} castShadow material={m.wood}>
            <boxGeometry args={[BOARD_W + 0.14, BOARD_H + 0.14, 0.06]} />
          </mesh>
          <mesh position-z={0.061}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
            <meshStandardMaterial map={face} roughness={0.95} />
          </mesh>
        </>
      )}
      {style === "acrylic" && (
        <>
          <mesh position-z={0.07}>
            <boxGeometry args={[BOARD_W + 0.1, BOARD_H + 0.1, 0.02]} />
            <meshPhysicalMaterial color="#ffffff" roughness={0.35} transmission={0} transparent opacity={0.72} clearcoat={1} />
          </mesh>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sy) => (
              <mesh key={`${sx}${sy}`} position={[(sx * BOARD_W) / 2.1, (sy * BOARD_H) / 2.4, 0.04]} rotation-x={Math.PI / 2} material={m.brass}>
                <cylinderGeometry args={[0.025, 0.025, 0.08, 16]} />
              </mesh>
            )),
          )}
          <mesh position-z={0.082}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
            <meshBasicMaterial map={face} transparent toneMapped={false} />
          </mesh>
        </>
      )}
      {style === "neon" && (
        <>
          <mesh position-z={0.025} castShadow>
            <boxGeometry args={[BOARD_W + 0.1, BOARD_H + 0.1, 0.05]} />
            <meshStandardMaterial color="#121212" roughness={0.6} />
          </mesh>
          <mesh position-z={0.051}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
            <meshBasicMaterial map={face} toneMapped={false} />
          </mesh>
        </>
      )}
      {style === "brass" && (
        <mesh position-z={0.03}>
          <planeGeometry args={[BOARD_W, BOARD_H]} />
          <meshBasicMaterial map={face} transparent toneMapped={false} />
        </mesh>
      )}
      {style === "oak" && (
        <>
          <mesh position-z={0.03} castShadow material={m.wood}>
            <boxGeometry args={[BOARD_W + 0.1, BOARD_H + 0.1, 0.05]} />
          </mesh>
          <mesh position-z={0.056}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
            <meshBasicMaterial map={face} transparent toneMapped={false} />
          </mesh>
        </>
      )}
      {/* An invisible pad, so the whole board is easy to tap. */}
      <mesh position-z={0.1}>
        <planeGeometry args={[BOARD_W + 0.2, BOARD_H + 0.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </Tappable>
  );
}

// ---------------------------------------------------------------- Product screen

export const SCREEN_SIZE: [number, number] = [4.6, 2.5875];
const SCREEN_Y = 2.45;

/** The big screen on the back wall: logo and name, then the newest products. Tap a product to open it. */
export function ProductScreen({
  business,
  products,
  accent,
  onSelect,
  editing,
}: {
  business: StoreBusiness;
  products: StoreProduct[];
  accent: string;
  onSelect: (t: StoreTarget) => void;
  editing: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const [screen] = useState(() => new ScreenCanvas(() => invalidate()));
  useEffect(() => () => screen.dispose(), [screen]);
  const tagline = businessTagline(business);
  useEffect(() => {
    screen.draw({ name: business.name, tagline, logo_url: business.logo_url, brand_color: business.brand_color }, products, accent);
  }, [screen, business.name, tagline, business.logo_url, business.brand_color, products, accent]);
  const hover = useHoverCursor();
  const [w, h] = SCREEN_SIZE;
  return (
    <group position={[0, SCREEN_Y, BACK + 0.17]}>
      <mesh castShadow>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.06]} />
        <meshStandardMaterial color="#141515" roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh
        position-z={0.031}
        onClick={tap((e: ThreeEvent<MouseEvent>) => {
          if (editing) return onSelect({ kind: "screen" });
          const hit = e.uv ? screen.hit(e.uv.x, e.uv.y) : null;
          if (hit) onSelect(hit);
        })}
        {...hover.handlers}
      >
        <planeGeometry args={[w, h]} />
        {/* Pulled forward in depth, so the slats behind never flicker through on phones. */}
        <meshBasicMaterial map={screen.texture} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {/* The wall mount behind it. */}
      <mesh position-z={-0.08}>
        <boxGeometry args={[1.2, 0.5, 0.1]} />
        <meshStandardMaterial color="#1c1d1c" roughness={0.5} />
      </mesh>
      {/* A soft glow on the wall around the screen. */}
      <mesh position-z={-0.11}>
        <planeGeometry args={[w + 0.9, h + 0.9]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- Lights

function shadeGeometry(style: StoreTheme["lights"]["style"]) {
  const v = (pts: [number, number][]) => pts.map(([r, y]) => new THREE.Vector2(r, y));
  if (style === "cone") return new THREE.LatheGeometry(v([[0.03, 0.34], [0.05, 0.33], [0.2, 0.02], [0.21, 0], [0.205, -0.005]]), 32);
  if (style === "rattan") return new THREE.LatheGeometry(v([[0.02, 0.3], [0.12, 0.28], [0.26, 0.14], [0.28, 0.0], [0.22, -0.12], [0.1, -0.16]]), 32);
  return new THREE.LatheGeometry(v([[0.02, 0.2], [0.08, 0.19], [0.2, 0.08], [0.26, 0], [0.255, -0.005]]), 32);
}

/** One pendant lamp in the chosen style. */
function Pendant({ style, accent, glow, cord, light }: { style: StoreTheme["lights"]["style"]; accent: string; glow: string; cord: number; light: number }) {
  const m = useMaterials();
  const geometry = useMemo(() => (style === "globe" || style === "linear" ? null : shadeGeometry(style)), [style]);
  useDispose(geometry);
  return (
    <group>
      <mesh position-y={cord / 2 + 0.2}>
        <cylinderGeometry args={[0.006, 0.006, cord, 4]} />
        <meshStandardMaterial color="#1f1f1f" />
      </mesh>
      {style === "globe" ? (
        <mesh>
          <sphereGeometry args={[0.22, 32, 20]} />
          <meshStandardMaterial color="#fff6e8" emissive={glow} emissiveIntensity={1.3} roughness={0.4} />
        </mesh>
      ) : (
        <>
          {style === "dome" && (
            <mesh geometry={geometry!} castShadow>
              <meshStandardMaterial color={accent} metalness={0.35} roughness={0.35} side={THREE.DoubleSide} />
            </mesh>
          )}
          {style === "cone" && <mesh geometry={geometry!} castShadow material={m.brass} />}
          {style === "rattan" && <mesh geometry={geometry!} castShadow material={m.cane} />}
          <mesh position-y={0.03}>
            <sphereGeometry args={[0.07, 16, 10]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
        </>
      )}
      <pointLight position-y={-0.1} color={glow} intensity={light} distance={6} decay={1.6} />
    </group>
  );
}

/** Pendants over the shop floor, one over the lounge table, and ceiling downlights. Tap to change (editing). */
export function Lights({ theme, accent, onTap }: { theme: StoreTheme; accent: string; onTap?: () => void }) {
  const { style, tone } = theme.lights;
  const glow = LIGHT_TONES.find((t) => t.id === tone)!.color;
  const y = H - 1.4;
  return (
    <Tappable onTap={onTap}>
      {style === "linear" ? (
        <group position={[0, y + 0.3, 0.3]}>
          {[-2, 2].map((x) => (
            <mesh key={x} position={[x, 0.55, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 1.1, 4]} />
              <meshStandardMaterial color="#1f1f1f" />
            </mesh>
          ))}
          <mesh castShadow>
            <boxGeometry args={[5.2, 0.07, 0.14]} />
            <meshStandardMaterial color="#1c1d1c" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position-y={-0.036} rotation-x={Math.PI / 2}>
            <planeGeometry args={[5.1, 0.09]} />
            <meshBasicMaterial color={glow} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          {[-1.8, 0, 1.8].map((x) => (
            <pointLight key={x} position={[x, -0.2, 0]} color={glow} intensity={2.2} distance={6} decay={1.6} />
          ))}
        </group>
      ) : (
        [-2.4, 0, 2.4].map((x) => (
          <group key={x} position={[x, y, 0.3]}>
            <Pendant style={style} accent={accent} glow={glow} cord={1.2} light={2.5} />
          </group>
        ))
      )}
      {theme.table !== "none" && (
        <group position={[LOUNGE.x, 2.75, LOUNGE.z]}>
          <Pendant style={style === "linear" ? "globe" : style} accent={accent} glow={glow} cord={1.9} light={2.3} />
        </group>
      )}
      {[-3.6, 0, 3.6].flatMap((x) =>
        [-2.6, 1.2, 4.4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, H - 0.005, z]} rotation-x={Math.PI / 2}>
            <circleGeometry args={[0.09, 20]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
        )),
      )}
    </Tappable>
  );
}

// ---------------------------------------------------------------- Wall art

/** Loads a picture as a texture, cropped to fill `aspect` (width / height). */
function useImageTexture(url: string | null, aspect: number) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, (tex) => {
      loaded = tex;
      if (!alive) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      const img = tex.image as { width: number; height: number };
      const ratio = img.width / img.height / aspect;
      if (ratio > 1) {
        tex.repeat.set(1 / ratio, 1);
        tex.offset.set((1 - 1 / ratio) / 2, 0);
      } else {
        tex.repeat.set(1, ratio);
        tex.offset.set(0, (1 - ratio) / 2);
      }
      setTexture(tex);
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [url, aspect]);
  return url ? texture : null;
}

/** A print in a thin oak frame: one of the presets, or the business's own picture. */
function ArtFrame({ art, accent, size, position, onTap }: { art: Art; accent: string; size: [number, number]; position: [number, number, number]; onTap?: () => void }) {
  const preset = useMemo(() => artTexture(accent, art.kind === "preset" ? art.id : "shapes"), [accent, art]);
  useDispose(preset);
  const photo = useImageTexture(art.kind === "image" ? art.url : null, (size[0] - 0.14) / (size[1] - 0.14));
  const picture = art.kind === "image" ? photo : preset;
  return (
    <Tappable onTap={onTap} position={position} rotationY={-Math.PI / 2}>
      <mesh castShadow>
        <boxGeometry args={[size[0] + 0.12, size[1] + 0.12, 0.04]} />
        <meshStandardMaterial color="#c9a37b" roughness={0.6} />
      </mesh>
      <mesh position-z={0.021}>
        <planeGeometry args={[size[0] + 0.02, size[1] + 0.02]} />
        <meshStandardMaterial color="#f7f4ee" roughness={0.9} />
      </mesh>
      <mesh position-z={0.023}>
        <planeGeometry args={[size[0] - 0.14, size[1] - 0.14]} />
        {/* A new material when the picture changes, so three.js redraws it with the picture. */}
        {picture ? <meshStandardMaterial key={picture.uuid} map={picture} roughness={0.8} /> : <meshStandardMaterial key="blank" color="#e7e2d8" roughness={0.9} />}
      </mesh>
    </Tappable>
  );
}

export function WallArt({ theme, accent, onTap }: { theme: StoreTheme; accent: string; onTap?: (index: 0 | 1) => void }) {
  return (
    <>
      <ArtFrame art={theme.art[0]} accent={accent} size={[1.2, 1.5]} position={[W / 2 - 0.04, 2.6, 0.9]} onTap={onTap ? () => onTap(0) : undefined} />
      <ArtFrame art={theme.art[1]} accent={accent} size={[1.2, 1.5]} position={[W / 2 - 0.04, 2.6, 2.5]} onTap={onTap ? () => onTap(1) : undefined} />
    </>
  );
}

// ---------------------------------------------------------------- Small things

/** The counter's name plaque, the clock and the OPEN sign by the door. */
export function Decor({ business, accent }: { business: StoreBusiness; accent: string }) {
  const plaque = useMemo(() => shopSignTexture(business.name, accent, business.logo_url), [business.name, accent, business.logo_url]);
  const neon = useMemo(() => neonTexture("OPEN", "#ff5c8a"), []);
  const clock = useMemo(() => clockTexture(), []);
  return (
    <>
      <Picture texture={plaque} size={[2.2, 0.55]} position={[0, 0.6, COUNTER_Z + 0.5]} />
      <Picture texture={clock} size={[0.7, 0.7]} position={[4.6, 3.3, BACK + 0.1]} />
      <Picture texture={neon} size={[1.5, 0.47]} position={[-W / 2 + 0.12, 3.05, 1.6]} rotation={[0, Math.PI / 2, 0]} />
    </>
  );
}

/** The bell on the counter: tap to ring it and get in touch. */
export function Bell({ onRing }: { onRing?: () => void }) {
  const group = useRef<THREE.Group>(null);
  const ringing = useRef(0);
  const hover = useHoverCursor(Boolean(onRing));
  useFrame(({ invalidate }, dt) => {
    if (ringing.current <= 0 || !group.current) return;
    ringing.current = Math.max(0, ringing.current - dt * 2.5);
    group.current.rotation.z = Math.sin(ringing.current * 30) * 0.25 * ringing.current;
    invalidate();
  });
  const m = useMaterials();
  return (
    <group
      ref={group}
      position={[0.35, 1.13, COUNTER_Z + 0.15]}
      scale={hover.hovered ? 1.15 : 1}
      onClick={(e) => {
        if (!onRing || e.delta > 8) return;
        e.stopPropagation();
        ringing.current = 1;
        onRing();
      }}
      {...hover.handlers}
    >
      <mesh material={m.brass}>
        <cylinderGeometry args={[0.2, 0.22, 0.05, 20]} />
      </mesh>
      <mesh position-y={0.03} material={m.brass}>
        <sphereGeometry args={[0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position-y={0.21} material={m.brass}>
        <sphereGeometry args={[0.04, 8, 6]} />
      </mesh>
    </group>
  );
}
