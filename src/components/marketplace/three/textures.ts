import * as THREE from "three";
import type { FloorStyle } from "@/lib/store-theme";

// Pictures for the 3D scenes, drawn in code (no image downloads): shop signs,
// striped awnings, roads, floors and chalkboards.

/** The app's display font, when it has loaded (canvas can use page fonts by name). */
function fontFamily(kind: "display" | "body") {
  if (typeof document === "undefined") return "system-ui, sans-serif";
  const name = getComputedStyle(document.documentElement).getPropertyValue(kind === "display" ? "--font-display-face" : "--font-body").trim();
  return name ? `${name}, system-ui, sans-serif` : "system-ui, sans-serif";
}

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}

function toTexture(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "S"
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: number, family: string) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 10);
  return s;
}

/** Draws a logo into a circle once it loads (logos are public, so CORS allows it). */
function drawLogoWhenReady(logoUrl: string | null, draw: (img: HTMLImageElement) => void, texture: THREE.Texture) {
  if (!logoUrl) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      draw(img);
      texture.needsUpdate = true;
    } catch {
      // A logo that can't be drawn just leaves the initials.
    }
  };
  img.src = logoUrl;
}

/** The sign over a shop on the map: logo (or initials) and name. */
export function shopSignTexture(name: string, color: string, logoUrl: string | null) {
  const { c, ctx } = canvas(512, 128);
  const display = fontFamily("display");
  roundRect(ctx, 4, 4, 504, 120, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const badge = () => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(66, 64, 46, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };
  badge();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 38px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials(name), 66, 66);
  ctx.textAlign = "left";
  ctx.fillStyle = "#14201a";
  fitText(ctx, name, 380, 46, 800, display);
  ctx.fillText(name, 126, 66);
  const texture = toTexture(c);
  drawLogoWhenReady(
    logoUrl,
    (img) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(66, 64, 46, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(20, 18, 92, 92);
      ctx.drawImage(img, 20, 18, 92, 92);
      ctx.restore();
    },
    texture,
  );
  return texture;
}

/** Striped awning, with a scalloped edge. */
export function awningTexture(color: string) {
  const { c, ctx } = canvas(256, 96);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : color;
    ctx.fillRect(i * 32, 0, 32, 72);
    ctx.beginPath();
    ctx.arc(i * 32 + 16, 72, 16, 0, Math.PI);
    ctx.fill();
  }
  const t = toTexture(c);
  return t;
}

/** Asphalt with a dashed centre line, repeated along the road. */
export function roadTexture() {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = "#4b5150";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  ctx.fillStyle = "#f2d16b";
  ctx.fillRect(0, 60, 60, 8);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(0, 3, 128, 4);
  ctx.fillRect(0, 121, 128, 4);
  return toTexture(c, [1, 1]);
}

function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

/** Store floors. */
export function floorTexture(style: FloorStyle) {
  const { c, ctx } = canvas(512, 512);
  if (style === "wood") {
    const tones = ["#c99a6a", "#bf8f5f", "#d4a676", "#b8875a", "#c5966a"];
    for (let row = 0; row < 8; row++) {
      let x = row % 2 ? -90 : 0;
      while (x < 512) {
        const w = 150 + ((row * 37 + x) % 80);
        ctx.fillStyle = tones[(row + Math.round(x / 50)) % tones.length]!;
        ctx.fillRect(x, row * 64, w, 64);
        ctx.strokeStyle = "rgba(60,35,15,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, row * 64, w, 64);
        for (let g = 0; g < 4; g++) {
          ctx.strokeStyle = "rgba(90,55,25,0.12)";
          ctx.beginPath();
          ctx.moveTo(x + 6, row * 64 + 12 + g * 12);
          ctx.bezierCurveTo(x + w / 3, row * 64 + 8 + g * 13, x + (2 * w) / 3, row * 64 + 16 + g * 11, x + w - 6, row * 64 + 12 + g * 12);
          ctx.stroke();
        }
        x += w;
      }
    }
    return toTexture(c, [3, 2.5]);
  }
  if (style === "tiles") {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#f3f1ec" : "#2f3532";
        ctx.fillRect(x * 64, y * 64, 64, 64);
      }
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, 512);
      ctx.moveTo(0, i * 64);
      ctx.lineTo(512, i * 64);
      ctx.stroke();
    }
    return toTexture(c, [3, 2.5]);
  }
  ctx.fillStyle = "#ece6dc";
  ctx.fillRect(0, 0, 512, 512);
  const chips = ["#c9b8a4", "#8f9a92", "#d98f6b", "#5f6f66", "#f2d6b3", "#a7b9c9"];
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = chips[i % chips.length]!;
    const r = 1.5 + Math.random() * 5;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, Math.random() * 512, r, r * (0.5 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, [2.5, 2]);
}

/** The big sign on the store's back wall: logo, name and what they do. */
export function storeSignTexture(name: string, tagline: string, color: string, logoUrl: string | null) {
  const { c, ctx } = canvas(1024, 256);
  const display = fontFamily("display");
  const body = fontFamily("body");
  roundRect(ctx, 4, 4, 1016, 248, 36);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `800 80px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials(name), 128, 132);
  ctx.textAlign = "left";
  ctx.fillStyle = shade(color, -0.12);
  fitText(ctx, name, 740, 104, 800, display);
  ctx.fillText(name, 256, 110);
  if (tagline) {
    ctx.fillStyle = "rgba(20,32,26,0.7)";
    fitText(ctx, tagline, 740, 40, 600, body);
    ctx.fillText(tagline, 260, 186);
  }
  const texture = toTexture(c);
  drawLogoWhenReady(
    logoUrl,
    (img) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(128, 128, 96, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(32, 32, 192, 192);
      ctx.drawImage(img, 32, 32, 192, 192);
      ctx.restore();
    },
    texture,
  );
  return texture;
}

/** A chalkboard with a few short lines (address, what they do…). */
export function chalkboardTexture(title: string, lines: string[]) {
  const { c, ctx } = canvas(512, 384);
  const display = fontFamily("display");
  const body = fontFamily("body");
  ctx.fillStyle = "#7a5534";
  roundRect(ctx, 0, 0, 512, 384, 22);
  ctx.fill();
  ctx.fillStyle = "#26302b";
  roundRect(ctx, 18, 18, 476, 348, 12);
  ctx.fill();
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    ctx.fillRect(18 + Math.random() * 476, 18 + Math.random() * 348, 30, 2);
  }
  ctx.fillStyle = "#f6f1e6";
  ctx.font = `800 44px ${display}`;
  ctx.fillText(title, 46, 84);
  ctx.strokeStyle = "rgba(246,241,230,0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(46, 104);
  ctx.lineTo(300, 104);
  ctx.stroke();
  ctx.fillStyle = "rgba(246,241,230,0.92)";
  let y = 156;
  for (const line of lines.filter(Boolean).slice(0, 4)) {
    fitText(ctx, line, 420, 32, 600, body);
    ctx.fillText(line, 46, y);
    y += 52;
  }
  return toTexture(c);
}

/** Glowing "OPEN" sign. */
export function neonTexture(text: string, color: string) {
  const { c, ctx } = canvas(512, 160);
  ctx.font = `800 104px ${fontFamily("display")}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 84);
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 256, 84);
  return toTexture(c);
}

/** A price tag for a shelf. */
export function priceTagTexture(text: string) {
  const { c, ctx } = canvas(256, 80);
  roundRect(ctx, 2, 2, 252, 76, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = "#14201a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, text, 220, 40, 800, fontFamily("body"));
  ctx.fillText(text, 128, 42);
  return toTexture(c);
}

export { shade };
