"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { LIGHT_TONES, type Art, type PlantSpot, type StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import { mix } from "../geometry";
import { useDispose } from "../hooks";
import { counterPlaqueTexture, fontFamily, neonTexture, shade } from "../textures";
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
  /** From the hall (`far` when tapped from a distance) or the screen on the back wall. */
  | { kind: "product"; id: string; far?: boolean; from?: "hall" | "screen" }
  /** Editing: a product in the hall, to choose how it stands. */
  | { kind: "display"; id: string }
  | { kind: "more" }
  | { kind: "bell" }
  | { kind: "board" }
  | { kind: "screen" }
  | { kind: "table" }
  | { kind: "plant"; spot: PlantSpot }
  | { kind: "lights" }
  | { kind: "art"; index: 0 | 1 }
  | { kind: "floor" }
  | { kind: "walls" }
  | { kind: "backdrop" }
  | { kind: "rug" }
  | { kind: "counter" }
  | { kind: "gift" }
  | { kind: "partners" }
  /** Editing: the far wall at the end of the hall. */
  | { kind: "backWall" }
  /** Editing: the door and window. */
  | { kind: "entrance" };

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

/** A soft glow on the wall behind a lit sign. */
const halo = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 32, 4, 128, 32, 128);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.setTransform(1, 0, 0, 0.25, 0, 24);
    ctx.fillStyle = g;
    ctx.fillRect(0, -96, 256, 256);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

/** The welcome board at the top of the back wall, in the business's chosen style and words. */
export function Board({ theme, business, accent, onTap }: { theme: StoreTheme; business: StoreBusiness; accent: string; onTap: () => void }) {
  const { style, title } = theme.board;
  const subtitle = theme.board.subtitle || businessTagline(business);
  const face = useMemo(() => boardTexture(style, title, subtitle, accent), [style, title, subtitle, accent]);
  useDispose(face);
  const body = useMemo(() => {
    if (style === "pill") {
      // A true pill: a stadium shape, extruded with soft edges.
      const w = BOARD_W + 0.3 - BOARD_H;
      const r = BOARD_H / 2 - 0.02;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -r);
      shape.lineTo(w / 2, -r);
      shape.absarc(w / 2, 0, r, -Math.PI / 2, Math.PI / 2, false);
      shape.lineTo(-w / 2, r);
      shape.absarc(-w / 2, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
      return new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 32 }).translate(0, 0, -0.05);
    }
    if (style === "lightbox") return new RoundedBoxGeometry(BOARD_W, BOARD_H, 0.14, 4, 0.05);
    if (style === "neon") return new RoundedBoxGeometry(BOARD_W + 0.16, BOARD_H + 0.12, 0.03, 4, 0.012);
    if (style === "letter") return new RoundedBoxGeometry(BOARD_W + 0.16, BOARD_H + 0.16, 0.07, 4, 0.02);
    return null;
  }, [style]);
  useDispose(body);
  const m = useMaterials();
  const hsl = new THREE.Color(accent).getHSL({ h: 0, s: 0, l: 0 });
  const glow = `#${new THREE.Color().setHSL(hsl.h, 1, 0.62).getHexString()}`;
  return (
    <Tappable onTap={onTap} position={[0, BOARD_Y, BACK + 0.02]}>
      {style === "lightbox" && (
        <>
          {/* A backlit box: its face glows softly, and lights the wall around it. */}
          <mesh geometry={body!} position-z={0.07} castShadow>
            <meshStandardMaterial color="#f6f5f1" roughness={0.5} />
          </mesh>
          <mesh position-z={0.141}>
            <planeGeometry args={[BOARD_W - 0.06, BOARD_H - 0.06]} />
            <meshBasicMaterial map={face} toneMapped={false} />
          </mesh>
          <mesh position-z={0.005}>
            <planeGeometry args={[BOARD_W + 1.2, BOARD_H + 0.7]} />
            <meshBasicMaterial map={halo()} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
      {style === "pill" && (
        <>
          <mesh geometry={body!} position-z={0.06} castShadow>
            {/* Signs keep their exact colour (like a lit sign), whatever the shop's lighting. */}
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          {/* A slightly darker rim, so the pill reads as a solid shape. */}
          <mesh geometry={body!} position-z={0.045} scale={[1.025, 1.08, 1]}>
            <meshBasicMaterial color={shade(accent, -0.18)} toneMapped={false} />
          </mesh>
          <mesh position-z={0.111}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
            <meshBasicMaterial map={face} transparent toneMapped={false} />
          </mesh>
        </>
      )}
      {style === "neon" && (
        <>
          {/* Smoked glass on brass stand-offs, with glowing tubes in front. */}
          <mesh geometry={body!} position-z={0.07}>
            <meshBasicMaterial color="#111213" toneMapped={false} />
          </mesh>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sy) => (
              <mesh key={`${sx}${sy}`} position={[(sx * BOARD_W) / 2.05, (sy * BOARD_H) / 2.15, 0.045]} rotation-x={Math.PI / 2} material={m.brass}>
                <cylinderGeometry args={[0.022, 0.022, 0.09, 16]} />
              </mesh>
            )),
          )}
          <mesh position-z={0.09}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
            <meshBasicMaterial map={face} transparent toneMapped={false} />
          </mesh>
          <mesh position-z={0.004}>
            <planeGeometry args={[BOARD_W + 1.6, BOARD_H + 1.0]} />
            <meshBasicMaterial map={halo()} color={glow} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
      {style === "brass" && (
        <mesh position-z={0.02}>
          <planeGeometry args={[BOARD_W, BOARD_H]} />
          <meshBasicMaterial map={face} transparent toneMapped={false} />
        </mesh>
      )}
      {style === "letter" && (
        <>
          <mesh geometry={body!} position-z={0.035} castShadow material={m.wood} />
          <mesh position-z={0.071}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
            <meshStandardMaterial map={face} roughness={0.95} />
          </mesh>
        </>
      )}
      {/* An invisible pad, so the whole board is easy to tap. */}
      <mesh position-z={0.16}>
        <planeGeometry args={[BOARD_W + 0.3, BOARD_H + 0.2]} />
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
export function useImageTexture(url: string | null, aspect: number) {
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

/** The counter's name plaque (if the business shows it), the clock and the OPEN sign by the door. */
export function Decor({ business, accent, counterName }: { business: StoreBusiness; accent: string; counterName: boolean }) {
  const plaque = useMemo(() => counterPlaqueTexture(business.name, accent, business.logo_url), [business.name, accent, business.logo_url]);
  useDispose(plaque);
  const neon = useMemo(() => neonTexture("OPEN", "#ff5c8a"), []);
  const clock = useMemo(() => clockTexture(), []);
  return (
    <>
      {counterName && <CounterPlaque texture={plaque} />}
      <Picture texture={clock} size={[0.6, 0.6]} position={[4.75, 3.45, BACK + 0.1]} />
      <Picture texture={neon} size={[1.5, 0.47]} position={[-W / 2 + 0.12, 3.05, 1.6]} rotation={[0, Math.PI / 2, 0]} />
    </>
  );
}

/** The nameplate on the counter front, in a raised brass frame. */
function CounterPlaque({ texture }: { texture: THREE.Texture }) {
  const [w, h] = [2.5, 0.583];
  const z = COUNTER_Z + 0.49;
  return (
    <group position={[0, 0.6, z]}>
      <mesh>
        <boxGeometry args={[w + 0.07, h + 0.07, 0.03]} />
        <meshStandardMaterial color="#d2ab5c" metalness={0.85} roughness={0.28} />
      </mesh>
      <mesh position-z={0.0155}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={texture} roughness={0.35} metalness={0.05} />
      </mesh>
    </group>
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

/** A wrapped gift on the counter, when the business has perks: tap it to see them. */
export function GiftBox({ accent, onOpen }: { accent: string; onOpen?: () => void }) {
  const group = useRef<THREE.Group>(null);
  const hover = useHoverCursor(Boolean(onOpen));
  const m = useMaterials();
  const wrap = mix(accent, "#ffffff", 0.08);
  return (
    <group
      ref={group}
      position={[0.95, 1.06, COUNTER_Z + 0.12]}
      rotation-y={-0.35}
      scale={hover.hovered ? 1.12 : 1}
      onClick={(e) => {
        if (!onOpen || e.delta > 8) return;
        e.stopPropagation();
        onOpen();
      }}
      {...hover.handlers}
    >
      <mesh position-y={0.13} castShadow>
        <boxGeometry args={[0.3, 0.26, 0.3]} />
        <meshPhysicalMaterial color={wrap} roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position-y={0.275}>
        <boxGeometry args={[0.32, 0.05, 0.32]} />
        <meshPhysicalMaterial color={wrap} roughness={0.35} clearcoat={0.6} />
      </mesh>
      {/* Ribbon round both ways, and a bow. */}
      <mesh position-y={0.15} material={m.brass}>
        <boxGeometry args={[0.05, 0.31, 0.325]} />
      </mesh>
      <mesh position-y={0.15} material={m.brass}>
        <boxGeometry args={[0.325, 0.31, 0.05]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.055, 0.33, 0]} rotation={[0, 0, side * 0.6]} scale={[1.3, 1, 0.5]} material={m.brass}>
          <torusGeometry args={[0.045, 0.014, 8, 20]} />
        </mesh>
      ))}
    </group>
  );
}

/** The little lit sign over the partners door. */
function doorSignTexture(count: number, accent: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 148;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#16201b";
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 140, 28);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(28, 38, 72, 72, 20);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 46px ${fontFamily("display")}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), 64, 76);
  ctx.textAlign = "left";
  ctx.font = `700 50px ${fontFamily("display")}`;
  ctx.fillText("Partners", 124, 64);
  ctx.font = `500 26px ${fontFamily("body")}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Step through to visit", 126, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const DOOR_X = 4.75;
const DOOR_W = 1.03;
const DOOR_H = 2.38;

/**
 * A door at the back of the shop to the business's partners. Tap it: it
 * swings open onto warm light, and the partners appear.
 */
export function PartnersDoor({ count, accent, onOpen }: { count: number; accent: string; onOpen: () => void }) {
  const leaf = useRef<THREE.Group>(null);
  const state = useRef({ target: 0, fired: false });
  const invalidate = useThree((st) => st.invalidate);
  const hover = useHoverCursor();
  const m = useMaterials();
  const sign = useMemo(() => doorSignTexture(count, accent), [count, accent]);
  useDispose(sign);
  useFrame(({ invalidate }, dt) => {
    const g = leaf.current;
    if (!g) return;
    const s = state.current;
    const goal = -1.25 * s.target;
    if (Math.abs(g.rotation.y - goal) < 0.002) return;
    g.rotation.y += (goal - g.rotation.y) * Math.min(1, dt * 5);
    if (s.target === 1 && !s.fired && g.rotation.y < -0.9) {
      s.fired = true;
      onOpen();
    }
    invalidate();
  });
  const open = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    const s = state.current;
    if (s.target === 1 && s.fired) return onOpen();
    s.target = 1;
    s.fired = false;
    invalidate();
  };
  const steel = "#1d1f1e";
  return (
    <group position={[DOOR_X, 0, BACK + 0.02]} onClick={open} {...hover.handlers}>
      {/* Frame */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (DOOR_W + 0.07)) / 2, DOOR_H / 2 + 0.035, 0.04]} castShadow>
          <boxGeometry args={[0.07, DOOR_H + 0.07, 0.1]} />
          <meshStandardMaterial color={steel} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, DOOR_H + 0.035, 0.04]} castShadow>
        <boxGeometry args={[DOOR_W + 0.14, 0.07, 0.1]} />
        <meshStandardMaterial color={steel} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* What's beyond: warm light from the next shop. */}
      <mesh position={[0, DOOR_H / 2, 0.005]}>
        <planeGeometry args={[DOOR_W, DOOR_H]} />
        <meshBasicMaterial color="#ffe7bf" toneMapped={false} />
      </mesh>
      {/* The door itself, hinged on the left. */}
      <group ref={leaf} position={[-DOOR_W / 2, 0, 0.04]}>
        <mesh position={[DOOR_W / 2, DOOR_H / 2, 0]} castShadow>
          <boxGeometry args={[DOOR_W - 0.01, DOOR_H - 0.01, 0.05]} />
          <meshStandardMaterial color={shade(accent, -0.22)} roughness={0.45} />
        </mesh>
        {/* Raised panels and a round window glowing with the light beyond. */}
        <mesh position={[DOOR_W / 2, 0.62, 0.027]}>
          <boxGeometry args={[DOOR_W - 0.26, 0.78, 0.012]} />
          <meshStandardMaterial color={shade(accent, -0.15)} roughness={0.5} />
        </mesh>
        <mesh position={[DOOR_W / 2, 1.68, 0.028]}>
          <circleGeometry args={[0.24, 40]} />
          <meshBasicMaterial color="#ffe7bf" toneMapped={false} />
        </mesh>
        <mesh position={[DOOR_W / 2, 1.68, 0.029]} material={m.brass}>
          <torusGeometry args={[0.24, 0.022, 10, 48]} />
        </mesh>
        <mesh position={[DOOR_W - 0.12, 1.05, 0.07]} material={m.brass}>
          <cylinderGeometry args={[0.018, 0.018, 0.34, 12]} />
        </mesh>
      </group>
      {/* Sign */}
      <mesh position={[0, DOOR_H + 0.33, 0.06]}>
        <planeGeometry args={[0.95, 0.275]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      {/* A soft pool of light on the floor in front. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.007, 0.7]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial map={halo()} color="#ffe7bf" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
