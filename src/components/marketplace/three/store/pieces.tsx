"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { formatMoney } from "@/lib/format";
import type { StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import { useDispose } from "../hooks";
import { chalkboardTexture, neonTexture, priceTagTexture, shopSignTexture, storeSignTexture } from "../textures";
import { COUNTER_Z, H, LOUNGE, W, BACK } from "./layout";
import { artTexture, clockTexture, labelTexture, newBadgeTexture, placeholderTexture } from "./store-textures";

// The pieces of the "Boutique" store with pictures on them (signs, products,
// the bell) and its lights. The room and furniture are in room.tsx and lounge.tsx.

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

export type StoreTarget = { kind: "product"; id: string } | { kind: "more" } | { kind: "bell" } | { kind: "about" } | { kind: "table" };

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

/** Brass pendants over the counter, an opal globe over the lounge table, and ceiling downlights. */
export function Lights({ theme, accent }: { theme: StoreTheme; accent: string }) {
  const warm = theme.lights === "warm";
  const glow = warm ? "#ffd9a0" : "#eaf3ff";
  const shade = useMemo(
    () => new THREE.LatheGeometry([[0.02, 0.2], [0.08, 0.19], [0.2, 0.08], [0.26, 0], [0.255, -0.005]].map(([r, y]) => new THREE.Vector2(r, y)), 32),
    [],
  );
  useDispose(shade);
  return (
    <>
      {/* Hung over the shop floor in front of the counter, so they never cover the sign. */}
      {[-2.4, 0, 2.4].map((x) => (
        <group key={x} position={[x, H - 1.4, 0.3]}>
          <mesh position-y={0.7}>
            <cylinderGeometry args={[0.006, 0.006, 1.2, 4]} />
            <meshStandardMaterial color="#1f1f1f" />
          </mesh>
          <mesh geometry={shade} castShadow>
            <meshStandardMaterial color={accent} metalness={0.35} roughness={0.35} side={THREE.DoubleSide} />
          </mesh>
          <mesh position-y={0.03}>
            <sphereGeometry args={[0.07, 16, 10]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
          <pointLight position-y={-0.05} color={glow} intensity={warm ? 2.6 : 2.2} distance={6} decay={1.6} />
        </group>
      ))}
      {theme.lounge && (
        <group position={[LOUNGE.x, 2.75, LOUNGE.z]}>
          <mesh position-y={1.13}>
            <cylinderGeometry args={[0.006, 0.006, 1.9, 4]} />
            <meshStandardMaterial color="#1f1f1f" />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.24, 32, 20]} />
            <meshStandardMaterial color="#fff6e8" emissive={glow} emissiveIntensity={1.4} roughness={0.4} />
          </mesh>
          <pointLight position-y={-0.3} color={glow} intensity={2.4} distance={5} decay={1.6} />
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
  return (
    <>
      <Picture texture={sign} size={[5.2, 1.3]} position={[0, H - 0.78, BACK + 0.1]} />
      <Picture texture={plaque} size={[2.2, 0.55]} position={[0, 0.6, COUNTER_Z + 0.5]} />
      <Picture texture={clock} size={[0.8, 0.8]} position={[4.6, H - 0.95, BACK + 0.1]} />
      <Picture texture={neon} size={[1.5, 0.47]} position={[-W / 2 + 0.12, 3.05, 1.6]} rotation={[0, Math.PI / 2, 0]} />
      <Picture texture={board} size={[1.3, 0.98]} position={[-4.0, 1.3, -0.1]} rotation={[-0.18, 0.5, 0]} onTap={onAbout} />
      <Picture texture={card} size={[0.36, 0.27]} position={[-1.05, 1.2, COUNTER_Z + 0.42]} rotation={[-0.35, 0.15, 0]} onTap={onAbout} />
      {theme.lounge && (
        <>
          <ArtFrame accent={accent} variant={1} size={[1.3, 1.0]} position={[W / 2 - 0.04, 2.55, 0.9]} />
          <ArtFrame accent={accent} variant={2} size={[0.9, 1.2]} position={[W / 2 - 0.04, 2.6, 2.4]} />
        </>
      )}
    </>
  );
}

/** A picture in a thin oak frame, hung on the right-hand wall. */
function ArtFrame({ accent, variant, size, position }: { accent: string; variant: number; size: [number, number]; position: [number, number, number] }) {
  const texture = useMemo(() => artTexture(accent, variant), [accent, variant]);
  useDispose(texture);
  return (
    <group position={position} rotation-y={-Math.PI / 2}>
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
        <meshStandardMaterial map={texture} roughness={0.8} />
      </mesh>
    </group>
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
        <meshStandardMaterial color="#d4ad5c" metalness={1} roughness={0.22} />
      </mesh>
      <mesh position-y={0.03}>
        <sphereGeometry args={[0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d4ad5c" metalness={1} roughness={0.22} />
      </mesh>
      <mesh position-y={0.21}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color="#d4ad5c" metalness={1} roughness={0.22} />
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
      {/* Gallery frame: thin black edge, white mat, the picture. */}
      <mesh castShadow>
        <boxGeometry args={[1.08, 1.08, 0.06]} />
        <meshStandardMaterial color="#1f1f1e" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position-z={0.031}>
        <planeGeometry args={[1.02, 1.02]} />
        <meshStandardMaterial color="#fbfaf7" roughness={0.85} />
      </mesh>
      <mesh position-z={0.036}>
        <planeGeometry args={[0.9, 0.9]} />
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
  ...[-3.5, -2.3, -1.1].map((z) => ({ position: [-W / 2 + 0.3, 1.47, z] as [number, number, number], rotationY: Math.PI / 2 })),
  ...[-3.5, -2.3, -1.1].map((z) => ({ position: [W / 2 - 0.3, 1.47, z] as [number, number, number], rotationY: -Math.PI / 2 })),
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
