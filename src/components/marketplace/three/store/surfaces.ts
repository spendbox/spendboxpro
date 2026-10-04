import * as THREE from "three";
import type { FloorStyle } from "@/lib/store-theme";
import { canvas, toTexture } from "../textures";

// Realistic surfaces for the store, drawn in code so nothing extra downloads:
// marble, wood grain, cane weave, linen, leaves, floors and soft shadows.
// The ones that never change are made once per visit and shared.

/** Same "random" numbers every time, so surfaces don't shimmer between visits. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function once<T>(make: () => T) {
  let value: T | null = null;
  return () => (value ??= make());
}

/** Fine speckle, for stone and plaster. */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, colors: string[], rand: () => number, size = 1.2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    ctx.fillRect(rand() * w, rand() * h, size + rand() * size, size + rand() * size);
  }
  ctx.globalAlpha = 1;
}

/** Wandering veins, like real marble. */
function veins(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, rand: () => number, width = 2.2) {
  for (let v = 0; v < count; v++) {
    const x = rand() * w;
    const y = rand() * h;
    const angle = rand() * Math.PI * 2;
    const length = 40 + rand() * 90;
    const thick = width * (0.4 + rand());
    ctx.strokeStyle = color;
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass ? 0.55 : 0.12;
      ctx.lineWidth = pass ? thick : thick * 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let px = x;
      let py = y;
      let a = angle;
      for (let i = 0; i < length; i++) {
        a += (rand() - 0.5) * 0.35;
        px += Math.cos(a) * 6;
        py += Math.sin(a) * 6;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

export const whiteMarble = once(() => {
  const { c, ctx } = canvas(1024, 1024);
  const rand = seeded(7);
  const g = ctx.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, "#f7f5f1");
  g.addColorStop(1, "#ece9e3");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  speckle(ctx, 1024, 1024, 9000, ["#9a978f", "#c9c4ba"], rand);
  veins(ctx, 1024, 1024, 14, "#8d8a84", rand, 1.6);
  veins(ctx, 1024, 1024, 8, "#b9a98a", rand, 1);
  return toTexture(c);
});

export const darkMarble = once(() => {
  const { c, ctx } = canvas(1024, 1024);
  const rand = seeded(11);
  ctx.fillStyle = "#1d1c1b";
  ctx.fillRect(0, 0, 1024, 1024);
  speckle(ctx, 1024, 1024, 9000, ["#3a3734", "#4a4540"], rand, 1.6);
  veins(ctx, 1024, 1024, 16, "#c9a86a", rand, 1.4);
  veins(ctx, 1024, 1024, 10, "#f2efe8", rand, 0.9);
  return toTexture(c);
});

/** Wood grain running along the length (u). Tinted by each piece's colour. */
export const woodGrain = once(() => {
  const { c, ctx } = canvas(1024, 256);
  const rand = seeded(3);
  ctx.fillStyle = "#d8b48c";
  ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 70; i++) {
    const y = rand() * 256;
    const dark = rand() > 0.5;
    ctx.strokeStyle = dark ? "rgba(92,56,26,0.28)" : "rgba(255,236,205,0.22)";
    ctx.lineWidth = 0.6 + rand() * 2.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    const wobble = 2 + rand() * 6;
    for (let x = 0; x <= 1024; x += 32) ctx.lineTo(x, y + Math.sin(x / (60 + rand() * 40) + i) * wobble);
    ctx.stroke();
  }
  // A couple of knots.
  for (let k = 0; k < 3; k++) {
    const x = rand() * 1024;
    const y = rand() * 256;
    for (let r = 14; r > 2; r -= 3) {
      ctx.strokeStyle = "rgba(92,56,26,0.25)";
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.2, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});

/** Woven cane, with see-through gaps (used with alphaTest). */
export const caneWeave = once(() => {
  const { c, ctx } = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  const cell = 32;
  ctx.lineCap = "round";
  for (let pass = 0; pass < 3; pass++) {
    ctx.strokeStyle = ["#c8a46a", "#d9b97f", "#b98f57"][pass]!;
    ctx.lineWidth = 7;
    for (let i = -8; i < 16; i++) {
      ctx.beginPath();
      if (pass === 0) {
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, 256);
      } else if (pass === 1) {
        ctx.moveTo(0, i * cell);
        ctx.lineTo(256, i * cell);
      } else {
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell + 256, 256);
        ctx.moveTo(i * cell + 256, 0);
        ctx.lineTo(i * cell, 256);
      }
      ctx.stroke();
    }
  }
  const t = toTexture(c, [3, 3]);
  return t;
});

/** Soft linen weave for tablecloths and cushions. */
export const linen = once(() => {
  const { c, ctx } = canvas(256, 256);
  const rand = seeded(5);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    ctx.fillStyle = `rgba(120,110,95,${0.03 + rand() * 0.05})`;
    ctx.fillRect(0, i, 256, 1);
    ctx.fillStyle = `rgba(120,110,95,${0.03 + rand() * 0.05})`;
    ctx.fillRect(i, 0, 1, 256);
  }
  return toTexture(c, [4, 4]);
});

/** A big tropical leaf (strelitzia), on a see-through background. */
export const leaf = once(() => {
  const { c, ctx } = canvas(128, 256);
  ctx.clearRect(0, 0, 128, 256);
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, "#2f6b34");
  g.addColorStop(0.5, "#4f9a4c");
  g.addColorStop(1, "#2c6330");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, 254);
  ctx.bezierCurveTo(6, 200, 4, 70, 64, 2);
  ctx.bezierCurveTo(124, 70, 122, 200, 64, 254);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,240,190,0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 254);
  ctx.lineTo(64, 8);
  ctx.stroke();
  ctx.strokeStyle = "rgba(20,60,25,0.35)";
  ctx.lineWidth = 1;
  for (let y = 30; y < 240; y += 9) {
    ctx.beginPath();
    ctx.moveTo(64, y + 10);
    ctx.lineTo(16, y - 6);
    ctx.moveTo(64, y + 10);
    ctx.lineTo(112, y - 6);
    ctx.stroke();
  }
  return toTexture(c);
});

/** A soft round shadow, for under furniture (it reads as the light being blocked). */
export const softShadow = once(() => {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
});

/** Floors: long oak planks, marble checks, or terrazzo. */
export function floorSurface(style: FloorStyle) {
  const { c, ctx } = canvas(1024, 1024);
  const rand = seeded(style.length * 31);
  if (style === "wood") {
    const tones = ["#c7a07a", "#bd9570", "#cfa985", "#b88f69", "#c49c76", "#d2ae8a"];
    const rowH = 1024 / 8;
    for (let row = 0; row < 8; row++) {
      let x = -((row * 389) % 700);
      while (x < 1024) {
        const w = 520 + rand() * 300;
        ctx.fillStyle = tones[Math.floor(rand() * tones.length)]!;
        ctx.fillRect(x, row * rowH, w, rowH);
        for (let g = 0; g < 22; g++) {
          const y = row * rowH + 4 + rand() * (rowH - 8);
          ctx.strokeStyle = rand() > 0.5 ? "rgba(95,60,30,0.16)" : "rgba(255,240,215,0.14)";
          ctx.lineWidth = 0.6 + rand() * 1.8;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + w / 3, y + (rand() - 0.5) * 8, x + (2 * w) / 3, y + (rand() - 0.5) * 8, x + w, y + (rand() - 0.5) * 4);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(60,38,20,0.45)";
        ctx.fillRect(x, row * rowH, 2, rowH);
        x += w;
      }
      ctx.fillStyle = "rgba(60,38,20,0.4)";
      ctx.fillRect(0, row * rowH, 1024, 2);
    }
    return toTexture(c, [2.2, 2.4]);
  }
  if (style === "tiles") {
    const cell = 1024 / 4;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const dark = (x + y) % 2 === 1;
        ctx.fillStyle = dark ? "#2b2a28" : "#f3f1ec";
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x * cell, y * cell, cell, cell);
        ctx.clip();
        speckle(ctx, 1024, 1024, 1500, dark ? ["#4a4743"] : ["#b8b3aa"], rand);
        ctx.translate(x * cell, y * cell);
        veins(ctx, cell, cell, 3, dark ? "#d9d4c9" : "#9d988f", rand, 1);
        ctx.restore();
      }
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, 1024);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(1024, i * cell);
      ctx.stroke();
    }
    return toTexture(c, [3, 3.2]);
  }
  ctx.fillStyle = "#ece7de";
  ctx.fillRect(0, 0, 1024, 1024);
  speckle(ctx, 1024, 1024, 12000, ["#b5aa9c", "#d6cfc4"], rand, 1.5);
  const chips = ["#c9b8a4", "#8f9a92", "#d98f6b", "#5f6f66", "#e8cfae", "#a7b9c9", "#ffffff"];
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = chips[i % chips.length]!;
    const r = 1.5 + rand() * 6;
    ctx.beginPath();
    ctx.ellipse(rand() * 1024, rand() * 1024, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, [2.4, 2.4]);
}
