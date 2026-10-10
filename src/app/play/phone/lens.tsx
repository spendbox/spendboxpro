"use client";

import { renderToStaticMarkup } from "react-dom/server";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { captureScene } from "../city/snapshot";

// The phone camera's "lens": copies what the 3D view shows (no buttons or labels, just the
// world), crops it like a phone photo (3:4 standing up, 4:3 on its side) and gives it the look
// of a real phone picture: a touch warmer and punchier, soft corners, fine grain. Selfies put
// your avatar up front with the town softly blurred behind, like portrait mode.

export type ShotKind = "photo" | "selfie";
export type Shot = { blob: Blob; url: string; width: number; height: number; kind: ShotKind };

/** The shape of the picture for this screen: standing up (3:4) or on its side (4:3). */
export function shotAspect(viewW: number, viewH: number) {
  return viewH >= viewW ? 3 / 4 : 4 / 3;
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
function grade(ctx: CanvasRenderingContext2D, w: number, h: number, selfie: boolean) {
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
export async function takeShot(kind: ShotKind, avatar: Avatar, view: { w: number; h: number }): Promise<Shot | null> {
  const scene = await captureScene();
  if (!scene) return null;
  const tall = shotAspect(view.w, view.h) < 1;
  const w = tall ? SHORT : LONG;
  const h = tall ? LONG : SHORT;
  const c = document.createElement("canvas");
  c.dataset.photo = "1";
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  if (kind === "selfie") {
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
    grade(ctx, w, h, true);

    const face = await avatarCutout(avatar);
    if (face) {
      // Up close, arm's length from the camera, a little off-centre.
      const size = Math.min(w * (tall ? 0.95 : 0.62), h * 0.86);
      const x = w / 2 - size / 2 + w * (tall ? 0.03 : 0.08);
      const y = h - size;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = size * 0.06;
      ctx.shadowOffsetY = size * 0.015;
      ctx.drawImage(face, x, y, size, size);
      ctx.restore();
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
