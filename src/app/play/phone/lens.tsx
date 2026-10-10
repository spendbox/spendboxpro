"use client";

import { renderToStaticMarkup } from "react-dom/server";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { captureScene } from "../city/snapshot";

// The phone camera's "lens": copies what the 3D view shows (no buttons or labels, just the
// world), crops it like a phone photo (3:4 standing up, 4:3 on its side) and gives it the look
// of a real phone picture: a touch warmer and punchier, soft corners, fine grain. Selfies put
// your avatar up front (and the friends you add next to you), with the town behind softly
// blurred (portrait mode), sharp, or in black and white. Pictures can be tall, square or wide.

export type ShotKind = "photo" | "selfie";
export type Shot = { blob: Blob; url: string; width: number; height: number; kind: ShotKind };
/** The picture's shape: "auto" follows the screen (3:4 standing up, 4:3 on its side). */
export type ShotFrame = "auto" | "tall" | "square" | "wide";
/** Behind you in a selfie: the town softly blurred, sharp, or in black and white. */
export type ShotBackground = "blur" | "clear" | "mono";
export type ShotStyle = { frame: ShotFrame; background: ShotBackground };
export const DEFAULT_STYLE: ShotStyle = { frame: "auto", background: "blur" };

/** The shape of the picture (width ÷ height) for this screen and frame. */
export function shotAspect(viewW: number, viewH: number, frame: ShotFrame = "auto") {
  if (frame === "tall") return 3 / 4;
  if (frame === "square") return 1;
  if (frame === "wide") return 16 / 9;
  return viewH >= viewW ? 3 / 4 : 4 / 3;
}

/**
 * Where everyone stands in a selfie (in a w × h picture): you first, up front in the middle,
 * then the others either side of you, a step back (a little smaller) each. Draw back to front
 * (the list comes back in drawing order, with `k` = who it is: 0 is you).
 */
export function selfieLayout(n: number, w: number, h: number) {
  const tall = w < h;
  const others = Math.max(0, n - 1);
  // Everyone has to fit across the picture.
  const me = Math.min(w * (tall ? 0.95 : 0.62), h * 0.86, (w * 0.98) / (1 + 0.62 * others));
  const out: { k: number; x: number; y: number; size: number }[] = [];
  const centre = w / 2 + (others ? 0 : w * (tall ? 0.03 : 0.08));
  for (let k = n - 1; k >= 0; k--) {
    if (k === 0) {
      out.push({ k, x: centre - me / 2, y: h - me, size: me });
      continue;
    }
    const rank = Math.ceil(k / 2);
    const side = k % 2 ? -1 : 1;
    const size = me * 0.82 * 0.92 ** (rank - 1);
    const dx = me * 0.36 + (rank - 0.5) * size * 0.62;
    out.push({ k, x: centre + side * dx - size / 2, y: h - size * 0.97, size });
  }
  return out;
}

const LONG = 1440;
const SHORT = 1080;
const MAX_BYTES = 1_400_000;

/** The avatar as a picture (just the person, no round backdrop). */
export function avatarCutout(avatar: Avatar, size = 720): Promise<HTMLImageElement | null> {
  const svg = renderToStaticMarkup(<AvatarFace avatar={avatar} size={size} cutout />).replace(/^<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Draw `img` to fill the box, cropping the middle (like CSS object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
}

/** A soft blur that works in every browser: shrink it right down, then stretch it back. */
function softBlur(src: HTMLCanvasElement, amount: number) {
  const small = document.createElement("canvas");
  small.dataset.photo = "1";
  small.width = Math.max(8, Math.round(src.width / amount));
  small.height = Math.max(8, Math.round(src.height / amount));
  const s = small.getContext("2d")!;
  s.imageSmoothingQuality = "high";
  s.drawImage(src, 0, 0, small.width, small.height);
  return small;
}

/** The phone look: warmer, a little more contrast and colour, fine grain. */
function grade(ctx: CanvasRenderingContext2D, w: number, h: number, selfie: boolean, mono = false) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const contrast = 1.07;
  const sat = selfie ? 1.08 : 1.14;
  const warm = selfie ? 7 : 5;
  let seed = 1234567;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mono) {
      // Black and white, a little contrasty, the way phone "mono" looks.
      const v = (l - 128) * 1.12 + 128;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = ((seed >> 16) % 9) - 4;
      d[i] = d[i + 1] = d[i + 2] = v + n;
      continue;
    }
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    r = (r - 128) * contrast + 128 + warm;
    g = (g - 128) * contrast + 128 + warm * 0.35;
    b = (b - 128) * contrast + 128 - warm * 0.6;
    // Fine sensor grain (a quick pseudo-random number per pixel).
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = ((seed >> 16) % 9) - 4;
    d[i] = r + n;
    d[i + 1] = g + n;
    d[i + 2] = b + n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Darker, softer corners, like a real lens. */
function vignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function toJpeg(c: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", q));
}

/**
 * Take a picture of what's on screen right now. Null when the 3D view can't be copied (some
 * phones won't hand it over).
 */
export async function takeShot(
  kind: ShotKind,
  avatar: Avatar,
  view: { w: number; h: number },
  style: ShotStyle = DEFAULT_STYLE,
  /** Other people in the selfie with you. */
  friends: Avatar[] = [],
): Promise<Shot | null> {
  const scene = await captureScene();
  if (!scene) return null;
  const aspect = shotAspect(view.w, view.h, style.frame);
  const w = aspect < 1 ? SHORT : aspect === 1 ? 1200 : aspect > 1.5 ? 1600 : LONG;
  const h = Math.round(w / aspect);
  const c = document.createElement("canvas");
  c.dataset.photo = "1";
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  if (kind === "selfie") {
    if (style.background === "blur") {
      // Portrait mode: the town softly out of focus behind you, a little zoomed in.
      const sharp = document.createElement("canvas");
      sharp.width = w;
      sharp.height = h;
      cover(sharp.getContext("2d")!, scene, w, h);
      const blurred = softBlur(sharp, 7);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(1.06, 1.06);
      ctx.drawImage(blurred, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else cover(ctx, scene, w, h);
    grade(ctx, w, h, true, style.background === "mono");

    const faces = await Promise.all([avatar, ...friends].map((a) => avatarCutout(a)));
    for (const { k, x, y, size } of selfieLayout(faces.length, w, h)) {
      const face = faces[k];
      if (!face) continue;
      // Up close, arm's length from the camera (the others a step behind).
      ctx.save();
      if (style.background === "mono") ctx.filter = "grayscale(1)";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = size * 0.06;
      ctx.shadowOffsetY = size * 0.015;
      ctx.drawImage(face, x, y, size, size);
      ctx.restore();
      if (style.background === "mono") continue;
      // A soft light from the screen falling on the face.
      const glow = ctx.createRadialGradient(x + size * 0.48, y + size * 0.42, 0, x + size * 0.48, y + size * 0.42, size * 0.55);
      glow.addColorStop(0, "rgba(255,244,230,0.14)");
      glow.addColorStop(1, "rgba(255,244,230,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, size, size);
    }
  } else {
    cover(ctx, scene, w, h);
    grade(ctx, w, h, false);
  }
  vignette(ctx, w, h);

  let blob = await toJpeg(c, 0.88);
  if (blob && blob.size > MAX_BYTES) blob = await toJpeg(c, 0.76);
  if (blob && blob.size > MAX_BYTES) blob = await toJpeg(c, 0.62);
  if (!blob) return null;
  return { blob, url: URL.createObjectURL(blob), width: w, height: h, kind };
}
