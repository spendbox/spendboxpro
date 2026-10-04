import * as THREE from "three";
import { formatMoney } from "@/lib/format";
import type { StoreProduct } from "@/lib/types";
import { fitText, fontFamily, initials, roundRect } from "../textures";

// The big screen on the back wall: the shop's logo and name across the top,
// then its newest products as tiles. Drawn on a canvas; taps are matched to
// tiles by where they land on the screen.

export const SCREEN_W = 1920;
export const SCREEN_H = 1080;
const HEADER = 190;
const PAD = 56;
const GAP = 28;

/** Most tiles the screen shows; with more products, the last tile is "+N See all". */
export const MAX_TILES = 8;

/** How many tiles go in each row: up to 4 in one row, then two rows (5 = 3 + 2, 6 = 3 + 3, 7 = 4 + 3, 8 = 4 + 4). */
export function rowsFor(count: number) {
  const n = Math.min(count, MAX_TILES);
  if (n <= 4) return [n];
  return [Math.ceil(n / 2), Math.floor(n / 2)];
}

export type ScreenHit = { kind: "product"; id: string } | { kind: "more" } | null;

interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  hit: ScreenHit;
}

/** The tiles, row by row; each row's tiles stretch to fill the screen's width. */
function tileRects(count: number) {
  const rows = rowsFor(count);
  const h = (SCREEN_H - HEADER - PAD - GAP * (rows.length - 1)) / rows.length;
  const out: { x: number; y: number; w: number; h: number }[] = [];
  rows.forEach((inRow, r) => {
    const w = (SCREEN_W - PAD * 2 - GAP * (inRow - 1)) / inRow;
    for (let c = 0; c < inRow; c++) out.push({ x: PAD + c * (w + GAP), y: HEADER + r * (h + GAP), w, h });
  });
  return out;
}

function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** The screen's picture, redrawn as product pictures and the logo arrive. */
export class ScreenCanvas {
  readonly texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement | "failed">();
  private tiles: Tile[] = [];

  constructor(private onChange: () => void) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  /** Starts loading a picture (once), and redraws when it arrives. */
  private image(url: string | null, redraw: () => void) {
    if (!url) return null;
    const known = this.images.get(url);
    if (known) return known === "failed" ? null : known.complete ? known : null;
    const img = new Image();
    // Pictures come from Spendbox storage, which allows this; others just show a placeholder.
    img.crossOrigin = "anonymous";
    img.onload = () => redraw();
    img.onerror = () => {
      this.images.set(url, "failed");
    };
    img.src = url;
    this.images.set(url, img);
    return null;
  }

  draw(business: { name: string; tagline: string; logo_url: string | null; brand_color: string }, products: StoreProduct[], accent: string) {
    const { ctx } = this;
    const redraw = () => this.draw(business, products, accent);
    const display = fontFamily("display");
    const body = fontFamily("body");

    const bg = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
    bg.addColorStop(0, "#fbfaf7");
    bg.addColorStop(1, "#efece6");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // Header: logo, name, what they do.
    const logo = this.image(business.logo_url, redraw);
    const lx = PAD;
    const ly = 42;
    const ls = 108;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx + ls / 2, ly + ls / 2, ls / 2, 0, Math.PI * 2);
    ctx.clip();
    if (logo) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(lx, ly, ls, ls);
      cover(ctx, logo, lx, ly, ls, ls);
    } else {
      ctx.fillStyle = business.brand_color;
      ctx.fillRect(lx, ly, ls, ls);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 44px ${display}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(business.name), lx + ls / 2, ly + ls / 2 + 2);
    }
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#16201b";
    const nameSize = fitText(ctx, business.name, SCREEN_W - 700, 72, 700, display);
    ctx.font = `700 ${nameSize}px ${display}`;
    ctx.fillText(business.name, lx + ls + 32, ly + (business.tagline ? 62 : 74));
    if (business.tagline) {
      ctx.fillStyle = "#5b655f";
      ctx.font = `500 32px ${body}`;
      ctx.fillText(business.tagline.slice(0, 70), lx + ls + 34, ly + 104);
    }
    // "N products" pill.
    const label = products.length === 1 ? "1 product" : `${products.length} products`;
    ctx.font = `600 30px ${body}`;
    const pw = ctx.measureText(label).width + 56;
    roundRect(ctx, SCREEN_W - PAD - pw, 70, pw, 60, 30);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, SCREEN_W - PAD - pw + 28, 111);

    // Tiles.
    const rects = tileRects(products.length);
    this.tiles = [];
    if (products.length === 0) {
      ctx.fillStyle = "#5b655f";
      ctx.font = `600 44px ${body}`;
      ctx.textAlign = "center";
      ctx.fillText("New products coming soon", SCREEN_W / 2, HEADER + (SCREEN_H - HEADER) / 2);
      ctx.textAlign = "left";
    }
    // One product: its picture on the left, its details on the right (the whole screen opens it).
    if (products.length === 1) {
      const p = products[0]!;
      const full = { x: PAD, y: HEADER, w: SCREEN_W - PAD * 2, h: SCREEN_H - HEADER - PAD };
      rects[0] = { ...full, w: full.w * 0.48 };
      const tx = PAD + full.w * 0.48 + 64;
      const tw = full.w * 0.52 - 64;
      ctx.fillStyle = "#16201b";
      ctx.font = `700 ${fitText(ctx, p.title, tw, 76, 700, display)}px ${display}`;
      ctx.fillText(p.title, tx, full.y + 120);
      let y = full.y + 120;
      if (p.price !== null) {
        y += 90;
        ctx.font = `700 52px ${body}`;
        ctx.fillStyle = accent;
        ctx.fillText(formatMoney(p.price, p.currency), tx, y);
      }
      roundRect(ctx, tx, full.y + full.h - 120, 360, 92, 46);
      ctx.fillStyle = "#16201b";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 36px ${body}`;
      ctx.fillText("Tap to see it", tx + 56, full.y + full.h - 60);
      this.tiles.push({ ...full, hit: { kind: "product", id: p.id } });
    }
    const overflow = products.length > rects.length;
    const shown = overflow ? products.slice(0, rects.length - 1) : products;
    shown.forEach((p, i) => {
      const r = rects[i]!;
      this.tiles.push({ ...r, hit: { kind: "product", id: p.id } });
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 28);
      ctx.clip();
      const pic = this.image(p.media_type === "image" ? p.media_url : p.poster_url, redraw);
      if (pic) cover(ctx, pic, r.x, r.y, r.w, r.h);
      else {
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
        g.addColorStop(0, accent);
        g.addColorStop(1, "#d9d4c9");
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      if (p.media_type === "video") {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2 - 20, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(r.x + r.w / 2 - 14, r.y + r.h / 2 - 44);
        ctx.lineTo(r.x + r.w / 2 + 22, r.y + r.h / 2 - 20);
        ctx.lineTo(r.x + r.w / 2 - 14, r.y + r.h / 2 + 4);
        ctx.fill();
      }
      const shadeH = 130;
      const g = ctx.createLinearGradient(0, r.y + r.h - shadeH, 0, r.y + r.h);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y + r.h - shadeH, r.w, shadeH);
      ctx.fillStyle = "#ffffff";
      const ts = fitText(ctx, p.title, r.w - 44, 32, 700, body);
      ctx.font = `700 ${ts}px ${body}`;
      ctx.fillText(p.title, r.x + 22, r.y + r.h - (p.price !== null ? 58 : 26));
      if (p.price !== null) {
        ctx.font = `600 28px ${body}`;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(formatMoney(p.price, p.currency), r.x + 22, r.y + r.h - 22);
      }
      if (p.viewed === false) {
        roundRect(ctx, r.x + 18, r.y + 18, 104, 46, 23);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `800 26px ${body}`;
        ctx.fillText("NEW", r.x + 40, r.y + 51);
      }
      ctx.restore();
    });
    if (overflow) {
      const r = rects[rects.length - 1]!;
      this.tiles.push({ ...r, hit: { kind: "more" } });
      roundRect(ctx, r.x, r.y, r.w, r.h, 28);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = `700 84px ${display}`;
      ctx.fillText(`+${products.length - shown.length}`, r.x + r.w / 2, r.y + r.h / 2 + 10);
      ctx.font = `600 32px ${body}`;
      ctx.fillText("See all", r.x + r.w / 2, r.y + r.h / 2 + 64);
      ctx.textAlign = "left";
    }
    this.texture.needsUpdate = true;
    this.onChange();
  }

  /** Which tile a tap landed on (u, v from 0 to 1, v going up). */
  hit(u: number, v: number): ScreenHit {
    const x = u * SCREEN_W;
    const y = (1 - v) * SCREEN_H;
    return this.tiles.find((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h)?.hit ?? null;
  }

  dispose() {
    this.texture.dispose();
  }
}
