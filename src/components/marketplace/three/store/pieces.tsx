"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { formatMoney } from "@/lib/format";
import type { StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import { blob, box, cylinder, disc, merge, mix } from "../geometry";
import { useDispose } from "../hooks";
import { chalkboardTexture, floorTexture, neonTexture, priceTagTexture, shade, shopSignTexture, storeSignTexture } from "../textures";
import { artTexture, clockTexture, labelTexture, newBadgeTexture, placeholderTexture } from "./store-textures";

// The pieces of the "Boutique" store, each a React component.

export const W = 12; // room width (x)
export const D = 9; // room depth (z)
export const H = 5; // wall height
export const BACK = -D / 2;
export const COUNTER_Z = -1.5;

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

export type StoreTarget = { kind: "product"; id: string } | { kind: "more" } | { kind: "bell" } | { kind: "about" };

/** Runs a handler for a tap, but not at the end of a drag (which looks around). */
function tap(handler: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    handler();
  };
}

function useHoverCursor() {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);
  return {
    hovered,
    handlers: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      },
      onPointerOut: () => setHovered(false),
    },
  };
}

/** A flat picture (sign, chalkboard, art) that always shows its true colours. */
export function Picture({
  texture,
  size,
  position,
  rotation = [0, 0, 0],
  transparent = true,
  onTap,
}: {
  texture: THREE.Texture;
  size: [number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  transparent?: boolean;
  onTap?: () => void;
}) {
  useDispose(texture);
  const hover = useHoverCursor();
  return (
    <mesh position={position} rotation={rotation} onClick={onTap ? tap(onTap) : undefined} {...(onTap ? hover.handlers : {})} scale={onTap && hover.hovered ? 1.05 : 1}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} transparent={transparent} toneMapped={false} />
    </mesh>
  );
}

/** Walls, floor, ceiling, counter, shelves, entrance, lounge furniture and plants. */
export function Room({ theme, accent }: { theme: StoreTheme; accent: string }) {
  const dark = theme.wall === "#2F3A34";
  const solid = useMemo(() => {
    const wall = theme.wall;
    const cz = COUNTER_Z;
    const parts = [
      box(W, H, 0.2, 0, H / 2, BACK - 0.1, wall),
      box(0.2, H, D + 4, -W / 2 - 0.1, H / 2, 2, shade(wall, -0.03)),
      box(0.2, H, D + 4, W / 2 + 0.1, H / 2, 2, shade(wall, -0.03)),
      box(W, 0.22, 0.06, 0, 0.11, BACK + 0.03, shade(accent, -0.1)),
      box(0.06, 0.22, D + 4, -W / 2 + 0.03, 0.11, 2, shade(accent, -0.1)),
      box(0.06, 0.22, D + 4, W / 2 - 0.03, 0.11, 2, shade(accent, -0.1)),
      box(W, 0.12, 0.08, 0, H - 0.4, BACK + 0.04, shade(accent, -0.05)),
      // Counter, with a till and a little plant.
      box(3.8, 1.0, 1.0, 0, 0.5, cz, accent),
      box(4.0, 0.1, 1.15, 0, 1.05, cz, "#c39a6b"),
      box(3.5, 0.06, 0.04, 0, 0.75, cz + 0.52, shade(accent, 0.15)),
      box(0.5, 0.24, 0.4, 1.55, 1.22, cz + 0.1, "#2f3532"),
      box(0.42, 0.12, 0.04, 1.55, 1.36, cz - 0.08, "#9fd3b8"),
      cylinder(0.12, 0.1, 0.2, -1.6, 1.2, cz + 0.15, "#b86f4b", 10),
      blob(0.16, -1.6, 1.38, cz + 0.15, "#4f9b4a"),
      // Shelves and side cabinets.
      box(5.6, 0.07, 0.42, 0, 2.02 - 0.5, BACK + 0.22, "#a87b52"),
      box(5.6, 0.07, 0.42, 0, 3.0 - 0.5, BACK + 0.22, "#a87b52"),
      box(0.5, 0.9, 3.4, -W / 2 + 0.3, 0.45, -2.4, "#a87b52"),
      box(0.5, 0.9, 3.4, W / 2 - 0.3, 0.45, -2.4, "#a87b52"),
      // Entrance: door, window, mat.
      box(0.12, 2.5, 1.5, -W / 2 + 0.06, 1.25, 1.6, "#5b3d29"),
      box(0.14, 2.3, 1.3, -W / 2 + 0.07, 1.2, 1.6, "#cfe8f3"),
      box(0.14, 1.3, 2.0, -W / 2 + 0.07, 1.9, -0.6, "#cfe8f3"),
      box(0.16, 0.1, 2.2, -W / 2 + 0.08, 1.2, -0.6, "#ffffff"),
      box(1.4, 0.03, 0.9, -W / 2 + 0.9, 0.015, 1.6, shade(accent, -0.15)),
      // Chalkboard easel legs.
      box(0.06, 1.6, 0.06, -4.4, 0.8, 0.0, "#7a5534", 0.5),
      box(0.06, 1.6, 0.06, -3.6, 0.8, -0.35, "#7a5534", 0.5),
      // Pendant cords.
      ...[-2.2, 0, 2.2].map((x) => cylinder(0.012, 0.012, 0.7, x, H - 0.35, -0.3, "#2f3532", 4)),
    ];
    if (theme.lounge) {
      const sofa = shade(accent, 0.18);
      parts.push(
        box(1.0, 0.45, 2.6, 4.9, 0.32, 1.3, sofa),
        box(0.3, 0.9, 2.6, 5.35, 0.65, 1.3, shade(sofa, -0.05)),
        box(1.0, 0.65, 0.3, 4.9, 0.4, 0.1, shade(sofa, -0.08)),
        box(1.0, 0.65, 0.3, 4.9, 0.4, 2.5, shade(sofa, -0.08)),
        cylinder(0.65, 0.65, 0.06, 3.4, 0.5, 1.3, "#c39a6b", 20),
        cylinder(0.08, 0.12, 0.48, 3.4, 0.25, 1.3, "#5b3d29", 8),
        cylinder(0.03, 0.03, 1.9, 5.3, 0.95, 3.2, "#2f3532", 6),
        disc(1.7, 3.9, 0.012, 1.3, mix(accent, "#f4ece0", 0.62)),
      );
    }
    if (theme.plants) {
      for (const [x, z, s] of [
        [-5.3, -3.8, 1],
        [5.3, -3.8, 1.1],
        [-5.2, 3.6, 0.9],
      ] as const) {
        parts.push(
          cylinder(0.32 * s, 0.25 * s, 0.6 * s, x, 0.3 * s, z, "#b86f4b", 12),
          blob(0.55 * s, x, 0.95 * s, z, "#4f9b4a"),
          blob(0.42 * s, x + 0.2, 1.35 * s, z - 0.1, "#5fae55"),
          blob(0.35 * s, x - 0.2, 1.25 * s, z + 0.15, "#3f8a3f"),
        );
      }
    }
    return merge(parts);
  }, [theme.wall, theme.lounge, theme.plants, accent]);
  useDispose(solid);
  const floor = useMemo(() => floorTexture(theme.floor), [theme.floor]);
  useDispose(floor);

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-z={2}>
        <planeGeometry args={[W, D + 4]} />
        <meshLambertMaterial map={floor} />
      </mesh>
      <mesh geometry={solid}>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, H, 2]}>
        <planeGeometry args={[W, D + 4]} />
        <meshBasicMaterial color={dark ? "#2a332e" : shade(theme.wall, 0.02)} />
      </mesh>
    </>
  );
}

/** Lamps over the counter, and the floor lamp in the lounge. */
export function Lights({ theme, accent }: { theme: StoreTheme; accent: string }) {
  const glow = theme.lights === "warm" ? "#ffe2a8" : "#e8f3ff";
  return (
    <>
      {[-2.2, 0, 2.2].map((x) => (
        <group key={x} position={[x, 0, -0.3]}>
          <mesh position-y={H - 0.85}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshBasicMaterial color={glow} />
          </mesh>
          <mesh position-y={H - 0.72}>
            <coneGeometry args={[0.24, 0.24, 16, 1, true]} />
            <meshLambertMaterial color={accent} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {theme.lounge && (
        <mesh position={[5.3, 2.05, 3.2]}>
          <coneGeometry args={[0.38, 0.45, 16, 1, true]} />
          <meshBasicMaterial color={glow} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}

/** Signs and decorations with pictures on them. */
export function Signs({ business, theme, accent, onAbout }: { business: StoreBusiness; theme: StoreTheme; accent: string; onAbout: () => void }) {
  const tagline = [business.categories.slice(0, 2).join(" · "), business.location].filter(Boolean).join("  ·  ");
  const sign = useMemo(() => storeSignTexture(business.name, tagline, accent, business.logo_url), [business.name, tagline, accent, business.logo_url]);
  const plaque = useMemo(() => shopSignTexture(business.name, accent, business.logo_url), [business.name, accent, business.logo_url]);
  const neon = useMemo(() => neonTexture("OPEN", "#ff5c8a"), []);
  const clock = useMemo(() => clockTexture(), []);
  const board = useMemo(
    () =>
      chalkboardTexture("Welcome!", [
        business.categories.slice(0, 3).join(", ") || "Come in and look around",
        business.location ? `📍 ${business.location}` : "",
        business.whatsapp ? "Ring the bell to chat" : "Tap a product to see more",
      ]),
    [business.categories, business.location, business.whatsapp],
  );
  const card = useMemo(() => chalkboardTexture("Hello", [business.about?.slice(0, 40) ?? "Thanks for stopping by", "Tap to learn more"]), [business.about]);
  const art1 = useMemo(() => artTexture(accent, 1), [accent]);
  const art2 = useMemo(() => artTexture(accent, 2), [accent]);
  return (
    <>
      <Picture texture={sign} size={[5.2, 1.3]} position={[0, H - 0.78, BACK + 0.1]} />
      <Picture texture={plaque} size={[2.6, 0.65]} position={[0, 0.55, COUNTER_Z + 0.51]} />
      <Picture texture={clock} size={[0.8, 0.8]} position={[4.6, H - 0.95, BACK + 0.1]} />
      <Picture texture={neon} size={[1.5, 0.47]} position={[-W / 2 + 0.12, 3.05, 1.6]} rotation={[0, Math.PI / 2, 0]} />
      <Picture texture={board} size={[1.3, 0.98]} position={[-4.0, 1.25, -0.1]} rotation={[-0.18, 0.5, 0]} onTap={onAbout} />
      {theme.lounge && (
        <>
          <Picture texture={card} size={[0.55, 0.41]} position={[3.4, 0.54, 1.3]} rotation={[-Math.PI / 2 + 0.25, 0, 0]} onTap={onAbout} />
          <Picture texture={art1} size={[1.3, 1.0]} position={[W / 2 - 0.02, 2.55, 0.7]} rotation={[0, -Math.PI / 2, 0]} transparent={false} />
          <Picture texture={art2} size={[0.9, 1.2]} position={[W / 2 - 0.02, 2.6, 2.1]} rotation={[0, -Math.PI / 2, 0]} transparent={false} />
        </>
      )}
    </>
  );
}

/** The bell on the counter: tap to ring it and get in touch. */
export function Bell({ onRing }: { onRing: () => void }) {
  const group = useRef<THREE.Group>(null);
  const ringing = useRef(0);
  const hover = useHoverCursor();
  useFrame(({ invalidate }, dt) => {
    if (ringing.current <= 0 || !group.current) return;
    ringing.current = Math.max(0, ringing.current - dt * 2.5);
    group.current.rotation.z = Math.sin(ringing.current * 30) * 0.25 * ringing.current;
    invalidate();
  });
  return (
    <group
      ref={group}
      position={[0.35, 1.13, COUNTER_Z + 0.15]}
      scale={hover.hovered ? 1.15 : 1}
      onClick={(e) => {
        if (e.delta > 8) return;
        e.stopPropagation();
        ringing.current = 1;
        onRing();
      }}
      {...hover.handlers}
    >
      <mesh>
        <cylinderGeometry args={[0.2, 0.22, 0.05, 20]} />
        <meshLambertMaterial color="#e0b341" emissive="#3a2a00" />
      </mesh>
      <mesh position-y={0.03}>
        <sphereGeometry args={[0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color="#e0b341" emissive="#3a2a00" />
      </mesh>
      <mesh position-y={0.21}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshLambertMaterial color="#e0b341" emissive="#3a2a00" />
      </mesh>
    </group>
  );
}

/** Loads a product's picture as a texture, cropped to a square; shows the fallback until then. */
function useProductTexture(url: string | null, fallback: THREE.Texture) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let loaded: THREE.Texture | null = null;
    loader.load(url, (tex) => {
      loaded = tex;
      if (!alive) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      const img = tex.image as { width: number; height: number };
      const ratio = img.width / img.height;
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
  }, [url]);
  return texture ?? fallback;
}

function ProductFrame({ product, accent, position, rotationY, onSelect }: { product: StoreProduct; accent: string; position: [number, number, number]; rotationY: number; onSelect: (t: StoreTarget) => void }) {
  const fallback = useMemo(() => placeholderTexture(accent, product.media_type === "video"), [accent, product.media_type]);
  useDispose(fallback);
  const picture = useProductTexture(product.media_type === "image" ? product.media_url : product.poster_url, fallback);
  const tag = useMemo(() => (product.price !== null ? priceTagTexture(formatMoney(product.price, product.currency)) : null), [product.price, product.currency]);
  useDispose(tag);
  const badge = useMemo(() => (product.viewed === false ? newBadgeTexture() : null), [product.viewed]);
  useDispose(badge);
  const hover = useHoverCursor();
  return (
    <group position={position} rotation-y={rotationY} scale={hover.hovered ? 1.06 : 1} onClick={tap(() => onSelect({ kind: "product", id: product.id }))} {...hover.handlers}>
      <mesh>
        <boxGeometry args={[1.08, 1.08, 0.07]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>
      <mesh position-z={0.04}>
        <planeGeometry args={[0.94, 0.94]} />
        <meshBasicMaterial map={picture} toneMapped={false} />
      </mesh>
      {tag && (
        <mesh position={[0, -0.66, 0.05]}>
          <planeGeometry args={[0.62, 0.19]} />
          <meshBasicMaterial map={tag} transparent toneMapped={false} />
        </mesh>
      )}
      {badge && (
        <mesh position={[0.38, 0.48, 0.06]}>
          <planeGeometry args={[0.34, 0.15]} />
          <meshBasicMaterial map={badge} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

const SLOTS: { position: [number, number, number]; rotationY: number }[] = [
  ...[2.02, 3.0].flatMap((y) => [-2.1, -0.7, 0.7, 2.1].map((x) => ({ position: [x, y, BACK + 0.32] as [number, number, number], rotationY: 0 }))),
  ...[-3.5, -2.3, -1.1].map((z) => ({ position: [-W / 2 + 0.3, 1.55, z] as [number, number, number], rotationY: Math.PI / 2 })),
  ...[-3.5, -2.3, -1.1].map((z) => ({ position: [W / 2 - 0.3, 1.55, z] as [number, number, number], rotationY: -Math.PI / 2 })),
];

/** Products framed on the shelves (and side cabinets), with a "+N more" card if they don't all fit. */
export function Shelves({ products, accent, onSelect }: { products: StoreProduct[]; accent: string; onSelect: (t: StoreTarget) => void }) {
  const overflow = products.length > SLOTS.length;
  const shown = overflow ? products.slice(0, SLOTS.length - 1) : products;
  const more = useMemo(() => (overflow ? labelTexture(`+${products.length - shown.length}`, "See all", accent) : null), [overflow, products.length, shown.length, accent]);
  const last = SLOTS[SLOTS.length - 1]!;
  return (
    <>
      {shown.map((p, i) => (
        <ProductFrame key={p.id} product={p} accent={accent} position={SLOTS[i]!.position} rotationY={SLOTS[i]!.rotationY} onSelect={onSelect} />
      ))}
      {more && (
        <Picture texture={more} size={[0.9, 0.9]} position={[last.position[0] - 0.04, last.position[1], last.position[2]]} rotation={[0, last.rotationY, 0]} transparent={false} onTap={() => onSelect({ kind: "more" })} />
      )}
    </>
  );
}
