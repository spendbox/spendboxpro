// Pictures painted on canvases for the insides of buildings: one "picture sheet" per room
// (paintings, rugs, book spines, signs, screens, departure boards...) and one repeating floor
// texture (wooden boards, parquet, marble, terrazzo, carpet, tiles...). All drawn from the
// room's random numbers and colour palette, so every room is different but hangs together.

import * as THREE from "three";
import { cssHex, mixHex, shadeHex, type Rng, type UvRect } from "./kit";

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

/** A picture sheet: allocate a rectangle, paint into it, get its texture coordinates. */
export class Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly c: CanvasRenderingContext2D;
  private x = 0;
  private y = 0;
  private rowH = 0;
  readonly size: number;
  texture: THREE.CanvasTexture | null = null;

  constructor(size = 1024) {
    this.size = size;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = size;
    this.c = this.canvas.getContext("2d")!;
    this.c.fillStyle = "#808080";
    this.c.fillRect(0, 0, size, size);
  }

  /** Paint a w × h picture (pixels) with draw(c, w, h) and get where it went. */
  paint(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): UvRect {
    const pad = 4;
    if (this.x + w + pad > this.size) {
      this.x = 0;
      this.y += this.rowH + pad;
      this.rowH = 0;
    }
    if (this.y + h > this.size) {
      // Out of room: squeeze into the last corner (rare; small rooms never get here).
      this.x = 0;
      this.y = Math.max(0, this.size - h);
    }
    const x = this.x;
    const y = this.y;
    this.x += w + pad;
    this.rowH = Math.max(this.rowH, h);
    const c = this.c;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.translate(x, y);
    draw(c, w, h);
    c.restore();
    const S = this.size;
    // Canvas y goes down, texture v goes up.
    return { u0: (x + 0.5) / S, v0: 1 - (y + h - 0.5) / S, u1: (x + w - 0.5) / S, v1: 1 - (y + 0.5) / S };
  }

  finish() {
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    this.texture = tex;
    return tex;
  }
}

// ---------------------------------------------------------------- paintings

export type ArtStyle = "blocks" | "circles" | "landscape" | "waves" | "arches" | "botanical" | "stripes" | "sunset";
export const ART_STYLES: ArtStyle[] = ["blocks", "circles", "landscape", "waves", "arches", "botanical", "stripes", "sunset"];

/** An abstract or landscape painting in the given colours (calm, modern, gallery style). */
export function painting(c: CanvasRenderingContext2D, w: number, h: number, style: ArtStyle, colors: number[], rnd: Rng) {
  const pick = () => cssHex(colors[Math.floor(rnd() * colors.length) % colors.length]);
  const paper = cssHex(mixHex(colors[0], 0xfaf6ef, 0.85));
  c.fillStyle = paper;
  c.fillRect(0, 0, w, h);
  switch (style) {
    case "blocks": {
      // Soft overlapping colour fields.
      for (let k = 0; k < 4; k++) {
        c.globalAlpha = 0.85;
        c.fillStyle = pick();
        const bw = w * (0.3 + rnd() * 0.4);
        const bh = h * (0.25 + rnd() * 0.4);
        c.fillRect(w * 0.08 + rnd() * (w * 0.84 - bw), h * 0.08 + rnd() * (h * 0.84 - bh), bw, bh);
      }
      c.globalAlpha = 1;
      break;
    }
    case "circles": {
      for (let k = 0; k < 3; k++) {
        c.globalAlpha = 0.8;
        c.fillStyle = pick();
        c.beginPath();
        c.arc(w * (0.25 + rnd() * 0.5), h * (0.3 + rnd() * 0.4), Math.min(w, h) * (0.16 + rnd() * 0.2), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      c.strokeStyle = cssHex(shadeHex(colors[0], 0.5));
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(w * 0.1, h * 0.82);
      c.lineTo(w * 0.9, h * 0.82);
      c.stroke();
      break;
    }
    case "landscape":
    case "sunset": {
      const sky = c.createLinearGradient(0, 0, 0, h);
      if (style === "sunset") {
        sky.addColorStop(0, "#f6c38f");
        sky.addColorStop(0.6, "#f4a28c");
        sky.addColorStop(1, "#e9c9a8");
      } else {
        sky.addColorStop(0, "#cfe3ee");
        sky.addColorStop(1, "#f3efe4");
      }
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      c.fillStyle = style === "sunset" ? "#fff1c9" : "#fbe6b0";
      c.beginPath();
      c.arc(w * (0.25 + rnd() * 0.5), h * 0.38, h * 0.1, 0, Math.PI * 2);
      c.fill();
      // Layers of hills, darker towards the front.
      for (let layer = 0; layer < 3; layer++) {
        const base = colors[(layer + 1) % colors.length];
        c.fillStyle = cssHex(shadeHex(mixHex(base, 0x9fb7a4, 0.4), layer * 0.15 - 0.15));
        c.beginPath();
        const y0 = h * (0.5 + layer * 0.13);
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += w / 12) {
          c.lineTo(x, y0 - Math.sin(x / w * Math.PI * (1.5 + layer) + rnd() * 0.4 + layer) * h * 0.08);
        }
        c.lineTo(w, h);
        c.fill();
      }
      break;
    }
    case "waves": {
      for (let k = 0; k < 6; k++) {
        c.strokeStyle = pick();
        c.lineWidth = h * 0.05;
        c.lineCap = "round";
        c.beginPath();
        const y = h * (0.18 + k * 0.13);
        for (let x = w * 0.08; x <= w * 0.92; x += 4) c.lineTo(x, y + Math.sin(x / w * Math.PI * 3 + k) * h * 0.04);
        c.stroke();
      }
      break;
    }
    case "arches": {
      const n = 3;
      for (let k = 0; k < n; k++) {
        c.fillStyle = pick();
        const aw = (w * 0.7) / n;
        const x = w * 0.15 + k * aw;
        const top = h * (0.25 + rnd() * 0.2);
        c.beginPath();
        c.moveTo(x + 4, h * 0.85);
        c.lineTo(x + 4, top + aw / 2);
        c.arc(x + aw / 2, top + aw / 2, aw / 2 - 4, Math.PI, 0);
        c.lineTo(x + aw - 4, h * 0.85);
        c.fill();
      }
      break;
    }
    case "botanical": {
      c.strokeStyle = cssHex(0x3f6b4f);
      c.fillStyle = cssHex(mixHex(0x5f8f6a, colors[1] ?? 0x5f8f6a, 0.25));
      c.lineWidth = 3;
      const stems = 3;
      for (let s = 0; s < stems; s++) {
        const x = w * (0.3 + s * 0.2);
        c.beginPath();
        c.moveTo(x, h * 0.9);
        c.quadraticCurveTo(x + (rnd() - 0.5) * w * 0.2, h * 0.5, x + (rnd() - 0.5) * w * 0.2, h * 0.12);
        c.stroke();
        for (let k = 0; k < 5; k++) {
          const ly = h * (0.25 + k * 0.13);
          const side = k % 2 ? 1 : -1;
          c.save();
          c.translate(x, ly);
          c.rotate(side * 0.8);
          c.beginPath();
          c.ellipse(side * w * 0.05, 0, w * 0.06, h * 0.025, 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
      }
      break;
    }
    case "stripes": {
      const n = 5 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        c.fillStyle = pick();
        c.fillRect(w * 0.1 + (k * w * 0.8) / n, h * 0.12, (w * 0.8) / n - 3, h * 0.76);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- rugs

export type RugStyle = "border" | "diamonds" | "stripes" | "medallion" | "grid";
export const RUG_STYLES: RugStyle[] = ["border", "diamonds", "stripes", "medallion", "grid"];

export function rug(c: CanvasRenderingContext2D, w: number, h: number, style: RugStyle, base: number, accent: number, rnd: Rng) {
  c.fillStyle = cssHex(base);
  c.fillRect(0, 0, w, h);
  // A woven look: fine noise.
  const img = c.getImageData(0, 0, w, h);
  for (let k = 0; k < img.data.length; k += 4) {
    const n = (rnd() - 0.5) * 14;
    img.data[k] += n;
    img.data[k + 1] += n;
    img.data[k + 2] += n;
  }
  c.putImageData(img, 0, 0);
  const a = cssHex(accent);
  const soft = cssHex(mixHex(base, accent, 0.35));
  c.strokeStyle = a;
  c.fillStyle = a;
  const m = Math.min(w, h) * 0.07;
  switch (style) {
    case "border":
      c.lineWidth = m * 0.5;
      c.strokeRect(m, m, w - 2 * m, h - 2 * m);
      c.lineWidth = m * 0.18;
      c.strokeRect(m * 2, m * 2, w - 4 * m, h - 4 * m);
      break;
    case "diamonds": {
      c.lineWidth = 3;
      const s = Math.min(w, h) / 5;
      for (let y = s / 2; y < h; y += s) {
        for (let x = s / 2; x < w; x += s) {
          c.beginPath();
          c.moveTo(x, y - s * 0.35);
          c.lineTo(x + s * 0.35, y);
          c.lineTo(x, y + s * 0.35);
          c.lineTo(x - s * 0.35, y);
          c.closePath();
          c.stroke();
        }
      }
      c.lineWidth = m * 0.4;
      c.strokeRect(m * 0.6, m * 0.6, w - 1.2 * m, h - 1.2 * m);
      break;
    }
    case "stripes": {
      const n = 6;
      for (let k = 0; k < n; k++) {
        c.fillStyle = k % 2 ? a : soft;
        c.fillRect(0, (k * h) / n + h / n / 3, w, h / n / 3);
      }
      break;
    }
    case "medallion": {
      c.lineWidth = m * 0.35;
      c.strokeRect(m, m, w - 2 * m, h - 2 * m);
      c.fillStyle = soft;
      c.beginPath();
      c.ellipse(w / 2, h / 2, w * 0.22, h * 0.22, 0, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(w / 2, h / 2, w * 0.28, h * 0.28, 0, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = a;
      c.beginPath();
      c.ellipse(w / 2, h / 2, w * 0.08, h * 0.08, 0, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case "grid": {
      c.lineWidth = 2;
      c.globalAlpha = 0.7;
      const s = Math.min(w, h) / 6;
      for (let x = s; x < w; x += s) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, h);
        c.stroke();
      }
      for (let y = s; y < h; y += s) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(w, y);
        c.stroke();
      }
      c.globalAlpha = 1;
      break;
    }
  }
}

// ---------------------------------------------------------------- books, products, boards

/** Rows of book spines (fills the picture; one shelf's worth per row). */
export function books(c: CanvasRenderingContext2D, w: number, h: number, rows: number, colors: number[], rnd: Rng) {
  c.fillStyle = "#3b2f28";
  c.fillRect(0, 0, w, h);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = 2;
    const y1 = (r + 1) * rh - 2;
    while (x < w - 4) {
      const bw = 5 + rnd() * 9;
      const bh = rh * (0.62 + rnd() * 0.3);
      if (rnd() < 0.06) {
        x += bw * 2; // a gap
        continue;
      }
      const col = colors[Math.floor(rnd() * colors.length) % colors.length];
      c.fillStyle = cssHex(shadeHex(col, rnd() * 0.3 - 0.1));
      c.fillRect(x, y1 - bh, bw - 1, bh);
      if (rnd() < 0.5) {
        c.fillStyle = "rgba(255,240,200,0.55)";
        c.fillRect(x + 1, y1 - bh * 0.75, bw - 3, 2);
      }
      x += bw;
    }
  }
}

/** Shop shelves full of colourful products. */
export function products(c: CanvasRenderingContext2D, w: number, h: number, rows: number, rnd: Rng) {
  c.fillStyle = "#f1f3f5";
  c.fillRect(0, 0, w, h);
  const hues = ["#e5484d", "#f5a524", "#2f9e44", "#1c7ed6", "#ffffff", "#f783ac", "#7048e8", "#fab005", "#0ca678", "#e8590c"];
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = 3;
    const y1 = (r + 1) * rh - 3;
    while (x < w - 6) {
      const bw = 7 + rnd() * 10;
      const bh = rh * (0.45 + rnd() * 0.4);
      const hue = hues[Math.floor(rnd() * hues.length)];
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n && x < w - 6; k++) {
        c.fillStyle = hue;
        c.fillRect(x, y1 - bh, bw - 1.5, bh);
        c.fillStyle = "rgba(255,255,255,0.6)";
        c.fillRect(x + 1, y1 - bh * 0.7, bw - 3.5, bh * 0.18);
        x += bw;
      }
    }
    c.fillStyle = "#adb5bd";
    c.fillRect(0, y1, w, 3);
  }
}

/** A text sign: words centred on a coloured board. */
export function sign(c: CanvasRenderingContext2D, w: number, h: number, text: string, bg: number, fg: number, opts?: { weight?: number; sub?: string; serif?: boolean }) {
  c.fillStyle = cssHex(bg);
  c.fillRect(0, 0, w, h);
  c.fillStyle = cssHex(fg);
  c.textAlign = "center";
  c.textBaseline = "middle";
  const family = opts?.serif ? "Georgia, 'Times New Roman', serif" : FONT;
  let size = h * (opts?.sub ? 0.42 : 0.58);
  do {
    c.font = `${opts?.weight ?? 700} ${size}px ${family}`;
    if (c.measureText(text).width <= w * 0.88) break;
    size -= 2;
  } while (size > 8);
  c.fillText(text, w / 2, opts?.sub ? h * 0.4 : h * 0.54);
  if (opts?.sub) {
    c.globalAlpha = 0.75;
    c.font = `500 ${h * 0.2}px ${family}`;
    c.fillText(opts.sub, w / 2, h * 0.76);
    c.globalAlpha = 1;
  }
}

/** A departures board: amber rows on black (times, places, platforms, status). */
export function departures(c: CanvasRenderingContext2D, w: number, h: number, places: string[], title: string, rnd: Rng) {
  c.fillStyle = "#0e1116";
  c.fillRect(0, 0, w, h);
  const rows = 6;
  const rh = h / (rows + 1.3);
  c.fillStyle = "#ffffff";
  c.font = `700 ${rh * 0.62}px ${FONT}`;
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.fillText(title, w * 0.03, rh * 0.62);
  c.fillStyle = "#ffb020";
  c.font = `600 ${rh * 0.55}px ui-monospace, Menlo, monospace`;
  let hour = 6 + Math.floor(rnd() * 14);
  let min = Math.floor(rnd() * 4) * 15;
  for (let r = 0; r < rows; r++) {
    const y = rh * (1.6 + r);
    min += 10 + Math.floor(rnd() * 3) * 5;
    if (min >= 60) {
      min -= 60;
      hour = (hour + 1) % 24;
    }
    const place = places[Math.floor(rnd() * places.length) % places.length] ?? "Express";
    c.fillStyle = "#ffb020";
    c.fillText(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`, w * 0.03, y);
    c.fillText(place.toUpperCase().slice(0, 16), w * 0.2, y);
    c.fillText(String(1 + Math.floor(rnd() * 4)), w * 0.7, y);
    const late = rnd() < 0.2;
    c.fillStyle = late ? "#ff6b6b" : "#69db7c";
    c.fillText(late ? "DELAYED" : "ON TIME", w * 0.78, y);
  }
}

/** A screen showing charts (offices, control rooms). */
export function dashboard(c: CanvasRenderingContext2D, w: number, h: number, accent: number, rnd: Rng) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#16202e");
  g.addColorStop(1, "#0d141d");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const a = cssHex(accent);
  // A line chart, some bars, a few rows.
  c.strokeStyle = a;
  c.lineWidth = Math.max(2, h * 0.02);
  c.beginPath();
  for (let k = 0; k <= 12; k++) {
    const x = w * 0.06 + (k / 12) * w * 0.5;
    const y = h * (0.55 - 0.3 * (k / 12) + (rnd() - 0.5) * 0.12);
    if (k) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.stroke();
  c.fillStyle = "#4dabf7";
  for (let k = 0; k < 6; k++) {
    const bh = h * (0.12 + rnd() * 0.3);
    c.fillRect(w * (0.64 + k * 0.055), h * 0.62 - bh, w * 0.035, bh);
  }
  c.fillStyle = "rgba(255,255,255,0.35)";
  for (let k = 0; k < 3; k++) c.fillRect(w * 0.06, h * (0.72 + k * 0.08), w * (0.3 + rnd() * 0.5), h * 0.03);
}

/** A TV picture: a calm nature scene. */
export function tvPicture(c: CanvasRenderingContext2D, w: number, h: number, rnd: Rng) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#5aa0d8");
  g.addColorStop(0.55, "#bfe0f2");
  g.addColorStop(0.56, "#3f7d4e");
  g.addColorStop(1, "#2b5a37");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#e8f4fb";
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    c.ellipse(w * (0.2 + rnd() * 0.6), h * (0.18 + rnd() * 0.15), w * 0.08, h * 0.04, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#2f6b3e";
  c.beginPath();
  c.moveTo(0, h * 0.62);
  c.quadraticCurveTo(w * 0.3, h * 0.42, w * 0.6, h * 0.6);
  c.quadraticCurveTo(w * 0.8, h * 0.5, w, h * 0.58);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
}

/** A whiteboard or blackboard with a few scribbles. */
export function board(c: CanvasRenderingContext2D, w: number, h: number, dark: boolean, rnd: Rng) {
  c.fillStyle = dark ? "#2f3d35" : "#fbfbf8";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = dark ? "rgba(255,255,255,0.75)" : "#1c7ed6";
  c.lineWidth = 3;
  c.lineCap = "round";
  for (let k = 0; k < 5; k++) {
    c.beginPath();
    const y = h * (0.18 + k * 0.15);
    c.moveTo(w * 0.08, y);
    for (let x = w * 0.08; x < w * (0.35 + rnd() * 0.5); x += 6) c.lineTo(x, y + Math.sin(x * 0.5) * 2);
    c.stroke();
  }
  c.strokeStyle = dark ? "rgba(255,230,150,0.8)" : "#e5484d";
  c.beginPath();
  c.arc(w * 0.78, h * 0.5, h * 0.18, 0, Math.PI * 2);
  c.stroke();
}

/** A city map (police stations, control rooms). */
export function cityMap(c: CanvasRenderingContext2D, w: number, h: number, rnd: Rng) {
  c.fillStyle = "#eef1e8";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#cfe5c4";
  for (let k = 0; k < 4; k++) c.fillRect(rnd() * w, rnd() * h, w * 0.15, h * 0.12);
  c.strokeStyle = "#b9c0c8";
  c.lineWidth = 4;
  for (let k = 1; k < 6; k++) {
    c.beginPath();
    c.moveTo((k * w) / 6 + (rnd() - 0.5) * 10, 0);
    c.lineTo((k * w) / 6 + (rnd() - 0.5) * 10, h);
    c.stroke();
    c.beginPath();
    c.moveTo(0, (k * h) / 6);
    c.lineTo(w, (k * h) / 6 + (rnd() - 0.5) * 10);
    c.stroke();
  }
  c.strokeStyle = "#7cc4e8";
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(0, h * 0.7);
  c.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.9, w, h * 0.6);
  c.stroke();
  for (let k = 0; k < 5; k++) {
    c.fillStyle = "#e5484d";
    c.beginPath();
    c.arc(rnd() * w, rnd() * h, 5, 0, Math.PI * 2);
    c.fill();
  }
}

/** A clock face (the back of a clock tower's dial, lit from outside: seen from inside). */
export function clockFace(c: CanvasRenderingContext2D, w: number, h: number, mirrored: boolean) {
  const r = Math.min(w, h) / 2;
  c.fillStyle = "#3a2f25";
  c.fillRect(0, 0, w, h);
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
  g.addColorStop(0, "#fff8e3");
  g.addColorStop(1, "#f0dfb3");
  c.fillStyle = g;
  c.beginPath();
  c.arc(w / 2, h / 2, r * 0.96, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.translate(w / 2, h / 2);
  if (mirrored) c.scale(-1, 1);
  c.fillStyle = "#3a2f25";
  for (let k = 0; k < 12; k++) {
    c.save();
    c.rotate((k / 12) * Math.PI * 2);
    c.fillRect(-r * 0.02, -r * 0.9, r * 0.04, r * (k % 3 ? 0.08 : 0.16));
    c.restore();
  }
  c.lineCap = "round";
  c.strokeStyle = "#2a221b";
  c.lineWidth = r * 0.05;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(r * 0.3, -r * 0.35);
  c.stroke();
  c.lineWidth = r * 0.035;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-r * 0.1, -r * 0.7);
  c.stroke();
  c.restore();
  c.strokeStyle = "#3a2f25";
  c.lineWidth = r * 0.06;
  c.beginPath();
  c.arc(w / 2, h / 2, r * 0.93, 0, Math.PI * 2);
  c.stroke();
}

/** Woven wicker (the balloon basket). */
export function wicker(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = "#8a6238";
  c.fillRect(0, 0, w, h);
  const cell = 12;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const odd = ((x + y) / cell) % 2 === 0;
      const g = c.createLinearGradient(x, y, odd ? x + cell : x, odd ? y : y + cell);
      g.addColorStop(0, "#7a5430");
      g.addColorStop(0.5, "#c08c55");
      g.addColorStop(1, "#7a5430");
      c.fillStyle = g;
      c.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }
}

// ---------------------------------------------------------------- floors

export type FloorStyle = "planks" | "parquet" | "marble" | "terrazzo" | "carpet" | "checker" | "stone" | "concrete" | "hex";

/** A repeating floor texture. Returns the texture and how many metres one repeat covers. */
export function floorTexture(style: FloorStyle, a: number, b: number, rnd: Rng): { tex: THREE.CanvasTexture; metres: number } {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const c = canvas.getContext("2d")!;
  c.fillStyle = cssHex(a);
  c.fillRect(0, 0, S, S);
  let metres = 2;
  const grain = (x: number, y: number, w: number, h: number, base: number, lines: number) => {
    c.fillStyle = cssHex(base);
    c.fillRect(x, y, w, h);
    c.strokeStyle = cssHex(shadeHex(base, 0.12));
    c.globalAlpha = 0.35;
    c.lineWidth = 1;
    for (let k = 0; k < lines; k++) {
      const yy = y + rnd() * h;
      c.beginPath();
      c.moveTo(x, yy);
      c.bezierCurveTo(x + w * 0.3, yy + (rnd() - 0.5) * 4, x + w * 0.7, yy + (rnd() - 0.5) * 4, x + w, yy + (rnd() - 0.5) * 3);
      c.stroke();
    }
    c.globalAlpha = 1;
  };
  switch (style) {
    case "planks": {
      // 8 rows of boards per repeat (2 m → 25 cm boards), staggered joints.
      metres = 2.4;
      const rows = 8;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rnd() * S * 0.5;
        while (x < S) {
          const len = S * (0.35 + rnd() * 0.4);
          const tone = shadeHex(mixHex(a, b, rnd() * 0.6), (rnd() - 0.5) * 0.12);
          grain(x, r * rh, len, rh, tone, 4);
          // wrap round so the texture tiles
          if (x + len > S) grain(x - S, r * rh, len, rh, tone, 4);
          c.fillStyle = cssHex(shadeHex(a, 0.35));
          c.globalAlpha = 0.5;
          c.fillRect(x, r * rh, 1.5, rh);
          c.globalAlpha = 1;
          x += len;
        }
        c.fillStyle = cssHex(shadeHex(a, 0.4));
        c.globalAlpha = 0.45;
        c.fillRect(0, r * rh, S, 1.5);
        c.globalAlpha = 1;
      }
      break;
    }
    case "parquet": {
      // Basket-weave parquet: squares of three boards, turned every other square.
      metres = 1.6;
      const n = 4;
      const t = S / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const across = (i + j) % 2 === 0;
          for (let k = 0; k < 3; k++) {
            const tone = shadeHex(mixHex(a, b, rnd() * 0.6), (rnd() - 0.5) * 0.12);
            if (across) grain(i * t, j * t + (k * t) / 3, t, t / 3, tone, 2);
            else {
              c.save();
              c.translate(i * t + (k * t) / 3 + t / 3, j * t);
              c.rotate(Math.PI / 2);
              grain(0, 0, t, t / 3, tone, 2);
              c.restore();
            }
          }
          c.strokeStyle = cssHex(shadeHex(a, 0.4));
          c.globalAlpha = 0.45;
          c.lineWidth = 1.2;
          for (let k = 0; k < 3; k++) {
            if (across) c.strokeRect(i * t, j * t + (k * t) / 3, t, t / 3);
            else c.strokeRect(i * t + (k * t) / 3, j * t, t / 3, t);
          }
          c.globalAlpha = 1;
        }
      }
      break;
    }
    case "marble":
    case "stone": {
      metres = style === "marble" ? 2.4 : 3;
      const n = 2;
      const t = S / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const tone = mixHex(a, b, rnd() * 0.25);
          c.fillStyle = cssHex(tone);
          c.fillRect(i * t, j * t, t, t);
          if (style === "marble") {
            // Soft veins.
            for (let v = 0; v < 4; v++) {
              c.strokeStyle = cssHex(shadeHex(b, 0.05 + rnd() * 0.12));
              c.globalAlpha = 0.1 + rnd() * 0.12;
              c.lineWidth = 2 + rnd() * 5;
              c.filter = "blur(1.5px)";
              c.beginPath();
              let x = i * t + rnd() * t;
              let y = j * t;
              c.moveTo(x, y);
              for (let s = 0; s < 14; s++) {
                x += (rnd() - 0.45) * t * 0.18;
                y += t / 14;
                c.lineTo(x, y);
              }
              c.stroke();
            }
            c.filter = "none";
            c.globalAlpha = 1;
          } else {
            for (let k = 0; k < 600; k++) {
              c.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`;
              c.fillRect(i * t + rnd() * t, j * t + rnd() * t, 2, 2);
            }
          }
          c.strokeStyle = cssHex(shadeHex(a, 0.2));
          c.globalAlpha = 0.6;
          c.lineWidth = 2;
          c.strokeRect(i * t + 1, j * t + 1, t - 2, t - 2);
          c.globalAlpha = 1;
        }
      }
      break;
    }
    case "terrazzo": {
      metres = 1.5;
      const chips = [b, shadeHex(a, 0.25), shadeHex(b, -0.3), 0xffffff, 0x9aa5b1];
      for (let k = 0; k < 1400; k++) {
        c.fillStyle = cssHex(chips[k % chips.length]);
        c.globalAlpha = 0.55 + rnd() * 0.4;
        const r = 1 + rnd() * 4;
        c.beginPath();
        c.ellipse(rnd() * S, rnd() * S, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
    }
    case "carpet": {
      metres = 2;
      const img = c.getImageData(0, 0, S, S);
      for (let k = 0; k < img.data.length; k += 4) {
        const n = (rnd() - 0.5) * 18;
        img.data[k] += n;
        img.data[k + 1] += n;
        img.data[k + 2] += n;
      }
      c.putImageData(img, 0, 0);
      // Carpet tiles, half turned (a subtle check).
      c.fillStyle = cssHex(b);
      c.globalAlpha = 0.12;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) c.fillRect((i * S) / 4, (j * S) / 4, S / 4, S / 4);
      c.globalAlpha = 0.25;
      c.strokeStyle = cssHex(shadeHex(a, 0.25));
      for (let i = 0; i <= 4; i++) {
        c.beginPath();
        c.moveTo((i * S) / 4, 0);
        c.lineTo((i * S) / 4, S);
        c.moveTo(0, (i * S) / 4);
        c.lineTo(S, (i * S) / 4);
        c.stroke();
      }
      c.globalAlpha = 1;
      break;
    }
    case "checker": {
      metres = 1.2;
      const n = 4;
      const t = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        c.fillStyle = cssHex((i + j) % 2 ? a : b);
        c.fillRect(i * t, j * t, t, t);
      }
      c.strokeStyle = "rgba(0,0,0,0.12)";
      c.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        c.beginPath();
        c.moveTo(i * t, 0);
        c.lineTo(i * t, S);
        c.moveTo(0, i * t);
        c.lineTo(S, i * t);
        c.stroke();
      }
      break;
    }
    case "concrete": {
      metres = 3;
      for (let k = 0; k < 90; k++) {
        c.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${rnd() * 0.05})`;
        c.beginPath();
        c.arc(rnd() * S, rnd() * S, 10 + rnd() * 60, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = "rgba(0,0,0,0.15)";
      c.lineWidth = 2;
      c.strokeRect(1, 1, S - 2, S - 2);
      break;
    }
    case "hex": {
      metres = 1.2;
      const r = S / 8;
      const hgt = Math.sqrt(3) * r;
      for (let row = -1; row < S / hgt + 1; row++) {
        for (let col = -1; col < S / (r * 1.5) + 1; col++) {
          const cx = col * r * 1.5;
          const cy = row * hgt + (col % 2 ? hgt / 2 : 0);
          c.fillStyle = cssHex(shadeHex(mixHex(a, b, rnd() * 0.5), (rnd() - 0.5) * 0.1));
          c.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2;
            const px = cx + Math.cos(ang) * (r - 1.5);
            const py = cy + Math.sin(ang) * (r - 1.5);
            if (k) c.lineTo(px, py);
            else c.moveTo(px, py);
          }
          c.closePath();
          c.fill();
        }
      }
      break;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return { tex, metres };
}
