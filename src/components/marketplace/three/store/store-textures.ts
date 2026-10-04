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

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

/** Draws text with even letter spacing (where the browser supports it). */
function spaced(ctx: Ctx, text: string, x: number, y: number, spacing: number, mode: "fill" | "stroke" = "fill") {
  ctx.letterSpacing = `${spacing}px`;
  // Letter spacing adds space after the last letter too; nudge to stay centred.
  const nudge = ctx.textAlign === "center" ? spacing / 2 : 0;
  if (mode === "fill") ctx.fillText(text, x + nudge, y);
  else ctx.strokeText(text, x + nudge, y);
  ctx.letterSpacing = "0px";
}

/**
 * The lettering on the welcome board (3.6 × 0.85 on the wall). The board's
 * body (light box, pill, glass, frame) is a real shape in the scene; this is
 * what's printed or lit on it.
 */
export function boardTexture(style: BoardStyle, title: string, subtitle: string, accent: string) {
  const W = 2048;
  const H = 484;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")! as Ctx;
  const display = fontFamily("display");
  const body = fontFamily("body");
  const t = title || "Welcome";
  const sub = subtitle.toUpperCase();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const titleY = sub ? H * 0.42 : H * 0.5;
  const subY = H * 0.77;

  if (style === "lightbox") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#f3f1ec");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1b231f";
    const size = fitText(ctx, t, W - 300, 190, 700, display);
    ctx.font = `700 ${size}px ${display}`;
    spaced(ctx, t, W / 2, titleY, -2);
    if (sub) {
      ctx.fillStyle = accent;
      ctx.fillRect(W / 2 - 60, H * 0.62, 120, 6);
      ctx.fillStyle = "#5f6863";
      ctx.font = `600 50px ${body}`;
      spaced(ctx, sub, W / 2, subY + 14, 14);
    }
  } else if (style === "pill") {
    ctx.fillStyle = "#ffffff";
    const size = fitText(ctx, t, W - 420, 180, 700, display);
    ctx.font = `700 ${size}px ${display}`;
    spaced(ctx, t, W / 2, titleY, -1);
    if (sub) {
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = `600 50px ${body}`;
      spaced(ctx, sub, W / 2, subY, 14);
    }
  } else if (style === "neon") {
    // Glowing glass tubes in a vivid version of the accent colour.
    const hsl = new THREE.Color(accent).getHSL({ h: 0, s: 0, l: 0 });
    const glow = `#${new THREE.Color().setHSL(hsl.h, 1, 0.62).getHexString()}`;
    const tube = `#${new THREE.Color().setHSL(hsl.h, 1, 0.88).getHexString()}`;
    const size = fitText(ctx, t, W - 360, 200, 600, display);
    ctx.font = `italic 600 ${size}px ${display}`;
    ctx.shadowColor = glow;
    ctx.fillStyle = glow;
    for (const blur of [80, 44, 20]) {
      ctx.shadowBlur = blur;
      spaced(ctx, t, W / 2, titleY, 4);
    }
    ctx.shadowBlur = 6;
    ctx.fillStyle = tube;
    spaced(ctx, t, W / 2, titleY, 4);
    if (sub) {
      ctx.font = `600 52px ${body}`;
      ctx.shadowBlur = 22;
      ctx.fillStyle = tube;
      spaced(ctx, sub, W / 2, subY + 10, 16);
    }
    ctx.shadowBlur = 0;
  } else if (style === "brass") {
    // Brushed brass letters standing off the wall, with their shadow.
    const size = fitText(ctx, t.toUpperCase(), W - 260, 190, 700, display);
    ctx.font = `700 ${size}px ${display}`;
    const brass = ctx.createLinearGradient(0, titleY - size / 2, 0, titleY + size / 2);
    brass.addColorStop(0, "#f6dc9a");
    brass.addColorStop(0.45, "#d4ad5c");
    brass.addColorStop(0.55, "#b88d3e");
    brass.addColorStop(1, "#e8c77c");
    ctx.save();
    ctx.shadowColor = "rgba(40,28,10,0.38)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = brass;
    spaced(ctx, t.toUpperCase(), W / 2, titleY, 12);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,246,220,0.55)";
    ctx.lineWidth = 2;
    spaced(ctx, t.toUpperCase(), W / 2, titleY, 12, "stroke");
    if (sub) {
      ctx.font = `600 50px ${body}`;
      ctx.save();
      ctx.shadowColor = "rgba(40,28,10,0.3)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#c39a4f";
      spaced(ctx, sub, W / 2, subY + 10, 18);
      ctx.restore();
    }
  } else {
    // Felt letter board: fine grooves, white peg letters set slightly by hand.
    ctx.fillStyle = "#232323";
    ctx.fillRect(0, 0, W, H);
    for (let y = 6; y < H; y += 14) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fillRect(0, y + 3, W, 2);
    }
    const word = t.toUpperCase();
    const size = fitText(ctx, word, W - 300, 150, 600, body);
    ctx.font = `600 ${size}px ${body}`;
    const letters = [...word];
    const widths = letters.map((l) => ctx.measureText(l).width + size * 0.12);
    let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
    letters.forEach((l, i) => {
      const w = widths[i]!;
      ctx.save();
      ctx.translate(x + w / 2, titleY + ((i * 37) % 7) - 3);
      ctx.rotate((((i * 53) % 9) - 4) * 0.006);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText(l, 3, 5);
      ctx.fillStyle = "#f2efe8";
      ctx.fillText(l, 0, 0);
      ctx.restore();
      x += w;
    });
    if (sub) {
      ctx.font = `600 54px ${body}`;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      spaced(ctx, sub, W / 2 + 2, subY + 4, 12);
      ctx.fillStyle = "#e9e5dc";
      spaced(ctx, sub, W / 2, subY, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

