"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { DISPLAY_KINDS } from "@/lib/product-display";
import { formatMoney } from "@/lib/format";
import { mix } from "../geometry";
import { useDispose } from "../hooks";
import { canvas, fitText, fontFamily, roundRect, shade, toTexture } from "../textures";
import { FRAMES, frameSize, FRONT, SHELF, TABLE, type FrameKind, type Hall, type HallItem } from "./hall";
import { Built, Kit } from "./kit";
import { H, W } from "./layout";
import { FloorShadow } from "./room";
import { tap, useHoverCursor } from "./tap";

// The product hall's displays. Every product is a framed picture: walnut
// frames with an ivory mat and the name and price printed under the photo
// (videos get a slim black screen frame). Wall frames hang in a row with a
// brass picture light above each; small frames lean on the shelves of
// walnut-and-oak shelving units, and on marble-topped tables down the middle.
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

const MAT = "#f3eee5";
const SCREEN_MAT = "#151817";

/** The band of the mat under the photo: the product's name and its price. */
function captionTexture(frame: FrameKind, title: string, price: string | null, accent: string, video: boolean) {
  const f = FRAMES[frame];
  const mw = f.photo[0] + 2 * f.mat;
  const w = Math.round(Math.min(1024, Math.max(512, mw * 700)));
  const h = Math.round((w * f.caption) / mw);
  const { c, ctx } = canvas(w, h);
  const dark = frame === "screen";
  ctx.fillStyle = dark ? SCREEN_MAT : MAT;
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

const WALNUT = "#56392a";
const OAK = "#c6a279";
const INK = "#1a1d1c";

/** A straight rod between two points in the y-z plane (picture-light arms, frame struts). */
function rod(k: Kit, mat: "brass" | "wood" | "satin", a: Vec, b: Vec, size: [number, number], color?: string) {
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  k.box(mat, [size[0], Math.hypot(dy, dz), size[1]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], color, [Math.atan2(dz, dy), 0, 0]);
}

/** A frame's moulding and backing: its foot at the origin, its back on z = 0, facing +z. */
function frameKit(k: Kit, frame: FrameKind) {
  const f = FRAMES[frame];
  const [w, h] = frameSize(frame);
  const m = f.moulding;
  const d = f.depth;
  const screen = frame === "screen";
  const mat = screen ? "satin" : "wood";
  const color = screen ? INK : WALNUT;
  // Brown-paper backing, as on a real frame.
  k.box("matte", [w - 0.02, h - 0.02, d - 0.014], [0, h / 2, (d - 0.014) / 2], "#9c7b57");
  k.rbox(mat, [w, m, d], 0.006, [0, h - m / 2, d / 2], color);
  k.rbox(mat, [w, m, d], 0.006, [0, m / 2, d / 2], color);
  for (const s of [-1, 1]) k.rbox(mat, [m, h - 2 * m + 0.004, d], 0.006, [s * (w - m) / 2, h / 2, d / 2], color);
  if (screen) return;
  // A fine gilt fillet round the inside of the moulding.
  const t = frame === "small" ? 0.005 : 0.008;
  const iw = w - 2 * m;
  const ih = h - 2 * m;
  for (const y of [m + t / 2, h - m - t / 2]) k.box("brass", [iw, t, t], [0, y, d - 0.01]);
  for (const s of [-1, 1]) k.box("brass", [t, ih, t], [s * (iw - t) / 2, h / 2, d - 0.01]);
}

/** A brass picture light above a wall frame. */
function pictureLight(k: Kit, frame: FrameKind) {
  const [w, h] = frameSize(frame);
  const bar = Math.min(0.46, w * 0.42);
  k.cyl("brass", 0.022, 0.022, 0.02, [0, h + 0.07, 0.01], undefined, 16, [Math.PI / 2, 0, 0]);
  rod(k, "brass", [0, h + 0.07, 0.015], [0, h + 0.14, 0.17], [0.012, 0.012]);
  k.cyl("brass", 0.026, 0.022, bar, [0, h + 0.14, 0.18], undefined, 20, [0, 0, Math.PI / 2]);
}

/** The strut behind a frame that leans on a shelf or table. */
function strut(k: Kit, frame: FrameKind) {
  const h = frameSize(frame)[1];
  rod(k, "wood", [0, h * 0.55, -0.003], [0, 0.02, -0.12], [0.03, 0.008], WALNUT);
}

/** A shelving unit against the wall: walnut sides and cupboard, oak shelves with brass edges, a soft-coloured back. */
function shelfUnit(k: Kit, accent: string) {
  const { width: w, depth: d, height: h, shelves } = SHELF;
  const back = mix(accent, "#efe8dc", 0.82);
  k.box("matte", [w - 0.06, h - 0.08, 0.02], [0, 0.08 + (h - 0.08) / 2, 0.01], back);
  for (const s of [-1, 1]) k.rbox("wood", [0.04, h, d], 0.01, [s * (w / 2 - 0.02), h / 2, d / 2], WALNUT);
  k.rbox("wood", [w + 0.04, 0.05, d + 0.03], 0.012, [0, h + 0.025, (d + 0.03) / 2], WALNUT);
  // The cupboard under the bottom shelf, on a recessed plinth.
  k.box("satin", [w - 0.1, 0.08, d - 0.05], [0, 0.04, (d - 0.05) / 2], shade(WALNUT, -0.35));
  const top = shelves[0]! - 0.035;
  const doorH = top - 0.09;
  for (const s of [-1, 1]) {
    k.rbox("wood", [(w - 0.1) / 2 - 0.006, doorH, 0.025], 0.006, [s * ((w - 0.1) / 4 + 0.003), 0.085 + doorH / 2, d - 0.0125], WALNUT);
    k.cyl("brass", 0.008, 0.008, 0.12, [s * 0.05, 0.085 + doorH / 2, d + 0.008], undefined, 10);
  }
  for (const y of shelves) {
    k.rbox("wood", [w - 0.08, 0.035, d - 0.01], 0.008, [0, y - 0.0175, (d - 0.01) / 2 + 0.005], OAK);
    k.box("brass", [w - 0.08, 0.008, 0.006], [0, y - 0.012, d + 0.001]);
  }
}

/** A display table: a marble top with a brass edge on a plinth in a deep shade of the brand colour. */
function table(k: Kit, accent: string) {
  const { length: l, width: w, height: h } = TABLE;
  k.rbox("marble", [w, 0.04, l], 0.01, [0, h - 0.02, 0]);
  k.box("brass", [w + 0.004, 0.008, l + 0.004], [0, h - 0.044, 0]);
  k.rbox("satin", [w - 0.12, h - 0.09, l - 0.24], 0.02, [0, 0.04 + (h - 0.09) / 2, 0], mix(accent, "#23211f", 0.6));
  k.box("satin", [w - 0.16, 0.04, l - 0.28], [0, 0.02, 0], "#1d1c1a");
}

/** Every fixture, frame moulding, strut and picture light in one go. */
function useHallFurniture(hall: Hall, accent: string) {
  return useMemo(() => {
    const k = new Kit();
    for (const fx of hall.fixtures) k.place([fx.x, 0, fx.z], fx.rotY, () => (fx.kind === "shelf" ? shelfUnit(k, accent) : table(k, accent)));
    for (const item of hall.items)
      k.place(
        [item.x, item.y, item.z],
        item.rotY,
        () => {
          frameKit(k, item.frame);
          if (item.tilt) strut(k, item.frame);
          else pictureLight(k, item.frame);
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
  const f = FRAMES[item.frame];
  const [w, h] = frameSize(item.frame);
  const video = item.product.media_type === "video";
  const screen = item.frame === "screen";
  const aspect = f.photo[0] / f.photo[1];
  const near = useNear([item.x, item.z]);
  const still = useNearTexture(pictureUrl(item), aspect, [item.x, item.z]);
  const playing = useVideoTexture(item.product.media_url, aspect, video && focused);
  const picture = playing ?? still;
  const caption = useMemo(() => (near ? captionTexture(item.frame, item.product.title, priceOf(item), accent, video) : null), [near, item, accent, video]);
  useDispose(caption);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [caption, invalidate]);

  const m = f.moulding;
  const z = f.depth - 0.012;
  const photoY = m + f.caption + f.photo[1] / 2;
  const bevel = item.frame === "small" ? 0.004 : 0.007;
  return (
    <group position={[item.x, item.y, item.z]} rotation-y={item.rotY} onClick={onClick} {...hover.handlers}>
      <group rotation-x={-item.tilt}>
        <mesh position={[0, h / 2, z]}>
          <planeGeometry args={[w - 2 * m, h - 2 * m]} />
          <meshBasicMaterial color={screen ? SCREEN_MAT : MAT} toneMapped={false} />
        </mesh>
        {/* The mat's bevelled window. */}
        <mesh position={[0, photoY, z + 0.0015]}>
          <planeGeometry args={[f.photo[0] + 2 * bevel, f.photo[1] + 2 * bevel]} />
          <meshBasicMaterial color={screen ? "#2a2f2d" : "#ffffff"} toneMapped={false} />
        </mesh>
        <mesh position={[0, photoY, z + 0.003]}>
          <planeGeometry args={f.photo} />
          {picture ? <meshBasicMaterial key={picture.uuid} map={picture} toneMapped={false} /> : <meshBasicMaterial key="blank" color={screen ? "#1d2320" : "#e4ddd2"} toneMapped={false} />}
        </mesh>
        {video && !playing && (
          <mesh position={[0, photoY, z + 0.0045]}>
            <planeGeometry args={[f.photo[0] * 0.32, f.photo[0] * 0.32]} />
            <meshBasicMaterial map={playTexture()} transparent toneMapped={false} />
          </mesh>
        )}
        {caption && (
          <mesh position={[0, m + f.caption / 2, z + 0.0015]}>
            <planeGeometry args={[w - 2 * m, f.caption]} />
            <meshBasicMaterial map={caption} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
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
      {hall.fixtures.map((fx) =>
        fx.kind === "shelf" ? (
          <FloorShadow key={`${fx.x},${fx.z}`} size={[SHELF.depth + 0.45, SHELF.width + 0.3]} position={[fx.x - Math.sign(fx.x) * (SHELF.depth / 2), fx.z]} opacity={0.4} />
        ) : (
          <FloorShadow key={`${fx.x},${fx.z}`} size={[TABLE.width + 0.6, TABLE.length + 0.5]} position={[fx.x, fx.z]} opacity={0.45} />
        ),
      )}
      {hall.items.map((item) => (
        <ProductDisplay key={item.product.id} item={item} accent={accent} focused={focusedId === item.product.id} onPick={onPick} />
      ))}
      {hall.sections.map((s) =>
        s.placement === "table" ? (
          // Over the tables, facing people walking down the hall.
          [-TABLE.x, TABLE.x].map((x) => <SectionSign key={`${s.kind}${x}`} label={kinds.get(s.kind)!.section} count={s.count} accent={accent} position={[x, 3.4, s.z - 0.1]} rotationY={Math.PI} />)
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
