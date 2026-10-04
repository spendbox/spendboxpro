import * as THREE from "three";
import type { ArtPreset, BoardStyle } from "@/lib/store-theme";
import { fitText, fontFamily, shade } from "../textures";

// Small pictures used inside the store, drawn in code.

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

/** Modern art prints in the shop's colours, for the lounge wall. */
export function artTexture(accent: string, preset: ArtPreset) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 640;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, 512, 640);
  const soft = shade(accent, 0.35);
  if (preset === "shapes") {
    [[accent, 190, 330, 120], ["#e9a86a", 320, 260, 90], ["#2f3532", 300, 420, 60], [soft, 170, 200, 70]].forEach(([col, x, y, r]) => {
      ctx.fillStyle = col as string;
      ctx.beginPath();
      ctx.arc(x as number, y as number, r as number, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (preset === "stripes") {
    [accent, soft, "#e9a86a", "#2f3532", "#d9cbb4"].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(96 + (i % 2) * 60, 120 + i * 84, 260 - (i % 3) * 40, 52);
    });
  } else if (preset === "arch") {
    [accent, "#e9a86a", soft, "#2f3532"].forEach((col, i) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 36;
      ctx.beginPath();
      ctx.arc(256, 470, 190 - i * 44, Math.PI, 0);
      ctx.stroke();
    });
  } else if (preset === "sun") {
    const g = ctx.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, "#f6d9b8");
    g.addColorStop(1, "#f4efe6");
    ctx.fillStyle = g;
    ctx.fillRect(40, 40, 432, 560);
    ctx.fillStyle = "#e07a4f";
    ctx.beginPath();
    ctx.arc(256, 330, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(40, 380, 432, 220);
    ctx.fillStyle = soft;
    ctx.fillRect(40, 440, 432, 160);
  } else {
    ctx.strokeStyle = accent;
    ctx.fillStyle = soft;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(256, 560);
    ctx.bezierCurveTo(200, 400, 230, 200, 256, 90);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const y = 480 - i * 55;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(250 + side * 6, y);
        ctx.rotate(side * (0.9 - i * 0.05));
        ctx.beginPath();
        ctx.ellipse(0, -48, 22, 52, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? accent : soft;
        ctx.fill();
        ctx.restore();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The welcome board's face, in the chosen style (wide: 3.6 × 0.85 on the wall). */
export function boardTexture(style: BoardStyle, title: string, subtitle: string, accent: string) {
  const W = 2048;
  const H = 484;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const display = fontFamily("display");
  const body = fontFamily("body");
  const t = title || "Welcome";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const titleY = subtitle ? H * 0.42 : H * 0.52;
  const subY = H * 0.76;
  if (style === "letter") {
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 8; y < H; y += 16) ctx.fillRect(0, y, W, 3);
    ctx.fillStyle = "#f7f5f0";
    const size = fitText(ctx, t.toUpperCase(), W - 220, 200, 600, body);
    ctx.font = `600 ${size}px ${body}`;
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "18px";
    ctx.fillText(t.toUpperCase(), W / 2, titleY);
    if (subtitle) {
      ctx.font = `500 64px ${body}`;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "10px";
      ctx.fillText(subtitle.toUpperCase(), W / 2, subY);
    }
  } else if (style === "acrylic") {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#1c2420";
    const size = fitText(ctx, t, W - 240, 210, 700, display);
    ctx.font = `700 ${size}px ${display}`;
    ctx.fillText(t, W / 2, titleY);
    if (subtitle) {
      ctx.fillStyle = "#4b5550";
      ctx.font = `500 70px ${body}`;
      ctx.fillText(subtitle, W / 2, subY);
    }
  } else if (style === "neon") {
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, W, H);
    const glow = shade(accent, 0.45);
    const size = fitText(ctx, t, W - 260, 220, 700, display);
    ctx.font = `italic 700 ${size}px ${display}`;
    ctx.shadowColor = glow;
    for (const blur of [60, 30, 12]) {
      ctx.shadowBlur = blur;
      ctx.fillStyle = glow;
      ctx.fillText(t, W / 2, titleY);
    }
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(t, W / 2, titleY);
    if (subtitle) {
      ctx.font = `600 66px ${body}`;
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#fff4f8";
      ctx.fillText(subtitle, W / 2, subY);
    }
    ctx.shadowBlur = 0;
  } else if (style === "brass") {
    ctx.clearRect(0, 0, W, H);
    const size = fitText(ctx, t, W - 200, 230, 700, display);
    ctx.font = `700 ${size}px ${display}`;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillText(t, W / 2 + 8, titleY + 12);
    const g = ctx.createLinearGradient(0, titleY - size / 2, 0, titleY + size / 2);
    g.addColorStop(0, "#f3d58c");
    g.addColorStop(0.5, "#c9a25a");
    g.addColorStop(1, "#8f6b2c");
    ctx.fillStyle = g;
    ctx.fillText(t, W / 2, titleY);
    if (subtitle) {
      ctx.font = `600 66px ${body}`;
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillText(subtitle, W / 2 + 4, subY + 6);
      ctx.fillStyle = "#b08a45";
      ctx.fillText(subtitle, W / 2, subY);
    }
  } else {
    ctx.clearRect(0, 0, W, H);
    const size = fitText(ctx, t, W - 240, 200, 700, display);
    ctx.font = `700 ${size}px ${display}`;
    ctx.fillStyle = "rgba(255,240,215,0.35)";
    ctx.fillText(t, W / 2 + 3, titleY + 4);
    ctx.fillStyle = "#4a2f1c";
    ctx.fillText(t, W / 2, titleY);
    if (subtitle) {
      ctx.font = `600 64px ${body}`;
      ctx.fillStyle = "#5e3e28";
      ctx.fillText(subtitle, W / 2, subY);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

