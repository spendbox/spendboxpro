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

/** How many leaf pictures sit side by side in the leaf texture. */
export const LEAF_CELLS = 5;
export type LeafCell = 0 | 1 | 2 | 3 | 4; // strelitzia, monstera, olive, snake plant, pampas plume

/** Leaves, side by side on a see-through background (one texture for every plant). */
export const leaf = once(() => {
  const cw = 128;
  const { c, ctx } = canvas(cw * LEAF_CELLS, 256);
  ctx.clearRect(0, 0, c.width, 256);
  const veinsAcross = (x0: number, from: number, to: number, step: number, spread: number) => {
    ctx.strokeStyle = "rgba(20,60,25,0.32)";
    ctx.lineWidth = 1;
    for (let y = from; y < to; y += step) {
      ctx.beginPath();
      ctx.moveTo(x0 + 64, y + 10);
      ctx.lineTo(x0 + 64 - spread, y - 6);
      ctx.moveTo(x0 + 64, y + 10);
      ctx.lineTo(x0 + 64 + spread, y - 6);
      ctx.stroke();
    }
  };
  const midrib = (x0: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 + 64, 254);
    ctx.lineTo(x0 + 64, 8);
    ctx.stroke();
  };
  const green = (x0: number, a: string, b: string) => {
    const g = ctx.createLinearGradient(x0, 0, x0 + cw, 0);
    g.addColorStop(0, a);
    g.addColorStop(0.5, b);
    g.addColorStop(1, a);
    return g;
  };
  // 0: strelitzia, long and glossy.
  ctx.fillStyle = green(0, "#2c6330", "#4f9a4c");
  ctx.beginPath();
  ctx.moveTo(64, 254);
  ctx.bezierCurveTo(6, 200, 4, 70, 64, 2);
  ctx.bezierCurveTo(124, 70, 122, 200, 64, 254);
  ctx.fill();
  midrib(0, "rgba(220,240,190,0.65)");
  veinsAcross(0, 30, 240, 9, 48);
  // 1: monstera, a broad heart with splits.
  let x0 = cw;
  ctx.fillStyle = green(x0, "#1f5a2c", "#3c8a45");
  ctx.beginPath();
  ctx.moveTo(x0 + 64, 250);
  ctx.bezierCurveTo(x0 - 4, 200, x0 - 4, 40, x0 + 64, 10);
  ctx.bezierCurveTo(x0 + 132, 40, x0 + 132, 200, x0 + 64, 250);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = 7;
  for (let i = 0; i < 5; i++) {
    const y = 60 + i * 38;
    ctx.beginPath();
    ctx.moveTo(x0, y - 10);
    ctx.lineTo(x0 + 44, y + 6);
    ctx.moveTo(x0 + 128, y - 10);
    ctx.lineTo(x0 + 84, y + 6);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x0 + 44 + (i % 2) * 40, 100 + i * 40, 4, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  midrib(x0, "rgba(200,230,170,0.5)");
  // 2: olive, slim and silvery.
  x0 = cw * 2;
  ctx.fillStyle = green(x0, "#5d7550", "#8ea47c");
  ctx.beginPath();
  ctx.moveTo(x0 + 64, 254);
  ctx.bezierCurveTo(x0 + 40, 190, x0 + 40, 60, x0 + 64, 2);
  ctx.bezierCurveTo(x0 + 88, 60, x0 + 88, 190, x0 + 64, 254);
  ctx.fill();
  midrib(x0, "rgba(230,240,220,0.5)");
  // 3: snake plant, an upright sword with yellow edges and bands.
  x0 = cw * 3;
  ctx.fillStyle = "#d4c25a";
  ctx.beginPath();
  ctx.moveTo(x0 + 64, 2);
  ctx.bezierCurveTo(x0 + 116, 60, x0 + 112, 200, x0 + 100, 254);
  ctx.lineTo(x0 + 28, 254);
  ctx.bezierCurveTo(x0 + 16, 200, x0 + 12, 60, x0 + 64, 2);
  ctx.fill();
  ctx.fillStyle = "#2d5a32";
  ctx.beginPath();
  ctx.moveTo(x0 + 64, 12);
  ctx.bezierCurveTo(x0 + 104, 60, x0 + 100, 200, x0 + 92, 254);
  ctx.lineTo(x0 + 36, 254);
  ctx.bezierCurveTo(x0 + 28, 200, x0 + 24, 60, x0 + 64, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(170,200,140,0.45)";
  ctx.lineWidth = 4;
  for (let y = 40; y < 250; y += 18) {
    ctx.beginPath();
    ctx.moveTo(x0 + 32, y);
    ctx.quadraticCurveTo(x0 + 64, y - 8, x0 + 96, y);
    ctx.stroke();
  }
  // 4: pampas plume, soft and feathery.
  x0 = cw * 4;
  const rand = seeded(19);
  for (let i = 0; i < 900; i++) {
    const t = rand();
    const y = 6 + t * 200;
    const w = Math.sin(t * Math.PI) * 50 + 6;
    ctx.strokeStyle = `rgba(${226 + rand() * 20},${206 + rand() * 20},${170 + rand() * 20},0.55)`;
    ctx.lineWidth = 1.2;
    const x = x0 + 64 + (rand() - 0.5) * 2 * w;
    ctx.beginPath();
    ctx.moveTo(x0 + 64, y + 14);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#b7a27a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0 + 64, 254);
  ctx.lineTo(x0 + 64, 20);
  ctx.stroke();
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

/** Floors in the business's chosen style and colour. */
export function floorSurface(style: FloorStyle, color: string) {
  const { c, ctx } = canvas(1024, 1024);
  const rand = seeded(style.length * 31 + color.length);
  const base = new THREE.Color(color);
  const tone = (amount: number) => `#${base.clone().offsetHSL(0, 0, amount).getHexString()}`;
  const grain = (x: number, y: number, w: number, h: number, horizontal: boolean) => {
    for (let g = 0; g < 18; g++) {
      ctx.strokeStyle = rand() > 0.5 ? "rgba(60,35,15,0.14)" : "rgba(255,240,215,0.12)";
      ctx.lineWidth = 0.6 + rand() * 1.6;
      ctx.beginPath();
      if (horizontal) {
        const gy = y + 3 + rand() * (h - 6);
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(x + w / 3, gy + (rand() - 0.5) * 6, x + (2 * w) / 3, gy + (rand() - 0.5) * 6, x + w, gy);
      } else {
        const gx = x + 3 + rand() * (w - 6);
        ctx.moveTo(gx, y);
        ctx.bezierCurveTo(gx + (rand() - 0.5) * 6, y + h / 3, gx + (rand() - 0.5) * 6, y + (2 * h) / 3, gx, y + h);
      }
      ctx.stroke();
    }
  };
  if (style === "oak") {
    const rowH = 1024 / 8;
    for (let row = 0; row < 8; row++) {
      let x = -((row * 389) % 700);
      while (x < 1024) {
        const w = 520 + rand() * 300;
        ctx.fillStyle = tone((rand() - 0.5) * 0.08);
        ctx.fillRect(x, row * rowH, w, rowH);
        grain(x, row * rowH, w, rowH, true);
        ctx.fillStyle = "rgba(40,25,12,0.4)";
        ctx.fillRect(x, row * rowH, 2, rowH);
        x += w;
      }
      ctx.fillStyle = "rgba(40,25,12,0.35)";
      ctx.fillRect(0, row * rowH, 1024, 2);
    }
    return toTexture(c, [2.2, 2.4]);
  }
  if (style === "herringbone") {
    // Planks 4:1, laid in steps of (T, T); rows repeat every (L + T, T - L). Both fit 1024 exactly, so it tiles seamlessly.
    const T = 32;
    const L = 128;
    ctx.fillStyle = tone(-0.12);
    ctx.fillRect(0, 0, 1024, 1024);
    const plank = (x: number, y: number, w: number, h: number) => {
      for (const dx of [-1024, 0, 1024])
        for (const dy of [-1024, 0, 1024]) {
          const px = x + dx;
          const py = y + dy;
          if (px > 1024 || py > 1024 || px + w < 0 || py + h < 0) continue;
          ctx.fillStyle = tone(((px * 7 + py * 13) % 9) / 100 - 0.04);
          ctx.fillRect(px, py, w, h);
          grain(px, py, w, h, w > h);
          ctx.strokeStyle = "rgba(40,25,12,0.4)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px, py, w, h);
        }
    };
    // The pattern repeats, so many (b, k) land on the same spot; draw each spot once.
    const seen = new Set<number>();
    for (let b = 0; b < 16; b++)
      for (let k = 0; k < 40; k++) {
        const x = (((b * (L + T) + k * T) % 1024) + 1024) % 1024;
        const y = (((b * (T - L) + k * T) % 1024) + 1024) % 1024;
        if (seen.has(x * 2048 + y)) continue;
        seen.add(x * 2048 + y);
        plank(x, y, L, T);
        plank(x + L, y + T - L, T, L);
      }
    return toTexture(c, [2.4, 2.6]);
  }
  if (style === "checker") {
    const cell = 1024 / 4;
    const dark = base.getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const odd = (x + y) % 2 === 1;
        ctx.fillStyle = odd ? color : "#f3f1ec";
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x * cell, y * cell, cell, cell);
        ctx.clip();
        speckle(ctx, 1024, 1024, 1500, odd ? [dark ? "#ffffff" : "#000000"] : ["#b8b3aa"], rand);
        ctx.translate(x * cell, y * cell);
        veins(ctx, cell, cell, 3, odd ? (dark ? "#d9d4c9" : "#5a5650") : "#9d988f", rand, 1);
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
  if (style === "concrete") {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 60; i++) {
      const g = ctx.createRadialGradient(rand() * 1024, rand() * 1024, 0, rand() * 1024, rand() * 1024, 80 + rand() * 220);
      g.addColorStop(0, rand() > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1024, 1024);
    }
    speckle(ctx, 1024, 1024, 14000, ["#000000", "#ffffff"], rand, 1);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(512, 0);
    ctx.lineTo(512, 1024);
    ctx.moveTo(0, 512);
    ctx.lineTo(1024, 512);
    ctx.stroke();
    return toTexture(c, [1.6, 1.8]);
  }
  if (style === "marble") {
    const dark = base.getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
    const half = 512;
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x * half, y * half, half, half);
        ctx.clip();
        ctx.fillStyle = tone((rand() - 0.5) * 0.03);
        ctx.fillRect(x * half, y * half, half, half);
        speckle(ctx, 1024, 1024, 3000, [dark ? "#ffffff" : "#8d8a84"], rand);
        ctx.translate(x * half, y * half);
        veins(ctx, half, half, 7, dark ? "#e6dcc7" : "#8d8a84", rand, 1.3);
        veins(ctx, half, half, 3, "#c9a86a", rand, 0.8);
        ctx.restore();
      }
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 1024, 1024);
    ctx.beginPath();
    ctx.moveTo(512, 0);
    ctx.lineTo(512, 1024);
    ctx.moveTo(0, 512);
    ctx.lineTo(1024, 512);
    ctx.stroke();
    return toTexture(c, [2.2, 2.4]);
  }
  ctx.fillStyle = color;
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
