import * as THREE from "three";
import { shade } from "../textures";

// Small pictures used inside the store, drawn in code.

/** Placeholder picture for a product whose image can't load (or a video without a still). */
export function placeholderTexture(color: string, video: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, color);
  g.addColorStop(1, shade(color, 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  if (video) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(105, 85);
    ctx.lineTo(175, 128);
    ctx.lineTo(105, 171);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A round wall clock showing the time it is now. */
export function clockTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2f3532";
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fbfaf6";
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f3532";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(128 + Math.sin(a) * 92 - 4, 128 - Math.cos(a) * 92 - 4, 8, 8);
  }
  const now = new Date();
  const hand = (angle: number, length: number, width: number) => {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(angle);
    ctx.fillRect(-width / 2, -length, width, length);
    ctx.restore();
  };
  hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), 55, 10);
  hand(now.getMinutes() * (Math.PI / 30), 82, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Simple abstract art in the shop's colours, for the walls. */
export function artTexture(accent: string, variant: number) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3b2a1e";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#f7f2ea";
  ctx.fillRect(14, 14, 228, 228);
  const tones = [accent, shade(accent, 0.25), "#f2c14e", "#e4572e", "#2f3532"];
  if (variant === 1) {
    tones.forEach((t, i) => {
      ctx.fillStyle = t;
      ctx.beginPath();
      ctx.arc(70 + i * 30, 150 - (i % 2) * 50, 46 - i * 5, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    tones.forEach((t, i) => {
      ctx.fillStyle = t;
      ctx.fillRect(40 + (i % 2) * 70, 40 + i * 34, 120 - i * 10, 26);
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function newBadgeTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 56;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e5484d";
  ctx.beginPath();
  ctx.roundRect(2, 2, 124, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NEW", 64, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The "+3 / See all" card for products that don't fit on the shelves. */
export function labelTexture(big: string, small: string, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#fff";
  ctx.font = "800 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(big, 128, 110);
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(small, 128, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
