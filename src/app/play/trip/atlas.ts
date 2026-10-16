// One picture sheet for the whole street in the trip film (docs/TRIPS.md): windows (with burglar
// bars, curtains, lit up at night), office glass, shopfronts, the shop signs, the billboards, the
// bus stop and the name of where you're going. Everything textured in the street shares it, so the
// whole street draws in a handful of calls.

import * as THREE from "three";
import type { UvRect } from "../city/kit";

const SIZE = 2048;
const PAD = 4;

export const SHOP_SIGNS: [string, string, string][] = [
  ["MAMA NKECHI PROVISIONS", "#c92a2a", "#ffffff"],
  ["BLESSED HANDS SALON", "#862e9c", "#fff0f6"],
  ["GOD'S TIME PHONES", "#1864ab", "#ffd43b"],
  ["IYA BASIRA BUKA", "#2b8a3e", "#ffffff"],
  ["DIVINE PHARMACY", "#0b7285", "#ffffff"],
  ["EZINNE FABRICS", "#e8590c", "#ffffff"],
  ["NO WAHALA POS", "#212529", "#ffd43b"],
  ["OLUWASEUN AUTOS", "#364fc7", "#ffffff"],
  ["FAVOUR BOUTIQUE", "#d6336c", "#ffffff"],
  ["SUYA SPOT", "#5c3a1e", "#ffd8a8"],
  ["MIGHTY GRACE ELECTRICALS", "#f08c00", "#212529"],
  ["JOLLOF CORNER", "#e03131", "#fff3bf"],
  ["KINGS CUT BARBERS", "#1c7ed6", "#ffffff"],
  ["AJOKE PAINT & BUILDING", "#5f3dc4", "#ffffff"],
  ["CHOP LIFE CAFE", "#099268", "#ffffff"],
  ["TOLU PRINTS & COPY", "#495057", "#ffffff"],
];

export const BILLBOARDS: [string, string, string, string][] = [
  ["NEWTOWN", "Your city. Your story.", "#7048e8", "#ffffff"],
  ["SUPER MALT", "Energy for the hustle", "#7c2d12", "#ffd43b"],
  ["NAIJANET 5G", "Faster than okada", "#1971c2", "#ffffff"],
  ["OWAMBE HALLS", "Book your party today", "#c2255c", "#fff0f6"],
  ["EKO RICE", "Party jollof starts here", "#2b8a3e", "#ffffff"],
];

export type Atlas = {
  texture: THREE.CanvasTexture;
  uv: Record<string, UvRect>;
  /** A shop sign (by index), a billboard (by index). */
  sign(i: number): UvRect;
  board(i: number): UvRect;
};

function fitText(g: CanvasRenderingContext2D, text: string, max: number, size: number, weight = 800) {
  let s = size;
  g.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  while (g.measureText(text).width > max && s > 10) g.font = `${weight} ${(s -= 2)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  return s;
}

/**
 * Draw the sheet. night: lit windows glow warm; toName: where you're going; area: the area of
 * the welcome sign.
 */
export function buildAtlas(o: { night: boolean; toName: string; area: string }): Atlas {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, SIZE, SIZE);
  const uv: Record<string, UvRect> = {};
  // Shelf packing, top to bottom.
  let x = 0;
  let y = 0;
  let row = 0;
  const add = (key: string, w: number, h: number, draw: (x: number, y: number, w: number, h: number) => void) => {
    if (x + w + PAD > SIZE) {
      x = 0;
      y += row + PAD;
      row = 0;
    }
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    draw(x, y, w, h);
    g.restore();
    // Texture v runs bottom-up.
    uv[key] = { u0: (x + 1) / SIZE, u1: (x + w - 1) / SIZE, v0: 1 - (y + h - 1) / SIZE, v1: 1 - (y + 1) / SIZE };
    x += w + PAD;
    row = Math.max(row, h);
  };

  // Windows: a frame, glass, burglar bars; a curtain in some. Lit ones glow warm.
  const windowCell = (lit: boolean, curtain: string | null) => (x0: number, y0: number, w: number, h: number) => {
    g.fillStyle = "#f1f3f5";
    g.fillRect(x0, y0, w, h);
    const gx = x0 + w * 0.1;
    const gy = y0 + h * 0.08;
    const gw = w * 0.8;
    const gh = h * 0.8;
    const glass = g.createLinearGradient(gx, gy, gx + gw, gy + gh);
    if (lit) {
      glass.addColorStop(0, "#ffe8a3");
      glass.addColorStop(1, "#ffb84d");
    } else if (o.night) {
      glass.addColorStop(0, "#1b2433");
      glass.addColorStop(1, "#0e141d");
    } else {
      glass.addColorStop(0, "#9fb8cc");
      glass.addColorStop(0.45, "#4d6378");
      glass.addColorStop(1, "#2c3a48");
    }
    g.fillStyle = glass;
    g.fillRect(gx, gy, gw, gh);
    if (curtain) {
      g.fillStyle = curtain;
      g.globalAlpha = lit ? 0.55 : 0.85;
      g.fillRect(gx, gy, gw * 0.32, gh);
      g.fillRect(gx + gw * 0.68, gy, gw * 0.32, gh);
      g.globalAlpha = 1;
    }
    // Louvres and burglar-proof bars.
    g.strokeStyle = "rgba(40,40,40,0.75)";
    g.lineWidth = 3;
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(gx + (gw * i) / 5, gy);
      g.lineTo(gx + (gw * i) / 5, gy + gh);
      g.stroke();
    }
    g.lineWidth = 4;
    g.strokeStyle = "#dee2e6";
    g.strokeRect(gx, gy, gw, gh);
    g.beginPath();
    g.moveTo(gx, gy + gh / 2);
    g.lineTo(gx + gw, gy + gh / 2);
    g.stroke();
    // A sill.
    g.fillStyle = "#ced4da";
    g.fillRect(x0 + w * 0.05, y0 + h * 0.89, w * 0.9, h * 0.07);
  };
  add("win", 128, 144, windowCell(false, null));
  add("winC", 128, 144, windowCell(false, "#c2255c"));
  add("winC2", 128, 144, windowCell(false, "#1971c2"));
  add("winLit", 128, 144, windowCell(true, "#e8590c"));
  add("winLit2", 128, 144, windowCell(true, null));

  // Office glass: four panes, blue sky reflected by day; some floors lit at night.
  const glassCell = (lit: number) => (x0: number, y0: number, w: number, h: number) => {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const px = x0 + (w / 2) * i;
        const py = y0 + (h / 2) * j;
        const gr = g.createLinearGradient(px, py, px + w / 2, py + h / 2);
        const on = lit > 0 && (i + j * 2) % 4 < lit;
        if (on) {
          gr.addColorStop(0, "#fff4d6");
          gr.addColorStop(1, "#ffd27a");
        } else if (o.night) {
          gr.addColorStop(0, "#1d2b45");
          gr.addColorStop(1, "#0b1220");
        } else {
          gr.addColorStop(0, "#d0ebff");
          gr.addColorStop(0.5, "#5c8fbf");
          gr.addColorStop(1, "#24476b");
        }
        g.fillStyle = gr;
        g.fillRect(px + 2, py + 2, w / 2 - 4, h / 2 - 4);
      }
    g.strokeStyle = "#adb5bd";
    g.lineWidth = 4;
    g.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
  };
  add("glass", 128, 128, glassCell(0));
  add("glassLit", 128, 128, glassCell(3));

  // Shopfronts: an open front with shelves of goods, a dark inside.
  const shopCell = (tones: string[], lit: boolean) => (x0: number, y0: number, w: number, h: number) => {
    g.fillStyle = lit ? "#5a4632" : "#2b2622";
    g.fillRect(x0, y0, w, h);
    for (let s = 0; s < 4; s++) {
      const sy = y0 + h * (0.18 + s * 0.2);
      g.fillStyle = "#8d6e63";
      g.fillRect(x0 + 6, sy + h * 0.12, w - 12, 4);
      for (let k = 0; k < 9; k++) {
        g.fillStyle = tones[(k + s) % tones.length];
        g.fillRect(x0 + 10 + k * ((w - 20) / 9), sy, (w - 20) / 9 - 3, h * 0.12);
      }
    }
    if (lit) {
      const glow = g.createRadialGradient(x0 + w / 2, y0 + h * 0.1, 4, x0 + w / 2, y0 + h * 0.4, w * 0.7);
      glow.addColorStop(0, "rgba(255,240,200,0.5)");
      glow.addColorStop(1, "rgba(255,240,200,0)");
      g.fillStyle = glow;
      g.fillRect(x0, y0, w, h);
    }
  };
  add("shop1", 192, 160, shopCell(["#e03131", "#fab005", "#1c7ed6", "#f8f9fa", "#2f9e44"], o.night));
  add("shop2", 192, 160, shopCell(["#f783ac", "#e599f7", "#ffd43b", "#74c0fc", "#212529"], o.night));
  add("shop3", 192, 160, shopCell(["#ced4da", "#495057", "#ffa94d", "#8ce99a", "#ffe066"], o.night));

  // A gate (corrugated, painted) and a door.
  add("gate", 128, 128, (x0, y0, w, h) => {
    g.fillStyle = "#2b3a67";
    g.fillRect(x0, y0, w, h);
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < w; i += 10) g.fillRect(x0 + i, y0, 4, h);
    g.fillStyle = "#ffd43b";
    g.fillRect(x0 + w / 2 - 2, y0, 4, h);
  });
  add("door", 96, 160, (x0, y0, w, h) => {
    g.fillStyle = "#6b4226";
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = "#3e2716";
    g.lineWidth = 4;
    g.strokeRect(x0 + 10, y0 + 12, w - 20, h * 0.38);
    g.strokeRect(x0 + 10, y0 + h * 0.55, w - 20, h * 0.38);
    g.fillStyle = "#ffd43b";
    g.fillRect(x0 + w - 22, y0 + h * 0.5, 8, 8);
  });
  // Lobby glass doors.
  add("lobby", 192, 128, (x0, y0, w, h) => {
    const gr = g.createLinearGradient(x0, y0, x0, y0 + h);
    gr.addColorStop(0, o.night ? "#ffe8b0" : "#a5d8ff");
    gr.addColorStop(1, o.night ? "#e8a23a" : "#3b5b78");
    g.fillStyle = gr;
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = "#e9ecef";
    g.lineWidth = 6;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(x0 + (w * i) / 4, y0);
      g.lineTo(x0 + (w * i) / 4, y0 + h);
      g.stroke();
    }
  });

  // Shop signs.
  SHOP_SIGNS.forEach(([text, bg, fg], i) =>
    add(`sign${i}`, 384, 80, (x0, y0, w, h) => {
      g.fillStyle = bg;
      g.fillRect(x0, y0, w, h);
      g.fillStyle = "rgba(255,255,255,0.15)";
      g.fillRect(x0, y0, w, h * 0.12);
      g.fillStyle = fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, text, w * 0.9, 40);
      g.fillText(text, x0 + w / 2, y0 + h / 2 + 2);
    }),
  );
  // Billboards.
  BILLBOARDS.forEach(([big, small, bg, fg], i) =>
    add(`board${i}`, 512, 256, (x0, y0, w, h) => {
      const gr = g.createLinearGradient(x0, y0, x0 + w, y0 + h);
      gr.addColorStop(0, bg);
      gr.addColorStop(1, "#111111");
      g.fillStyle = gr;
      g.fillRect(x0, y0, w, h);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.beginPath();
      g.arc(x0 + w * 0.85, y0 + h * 0.2, h * 0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, big, w * 0.86, 96, 900);
      g.fillText(big, x0 + w / 2, y0 + h * 0.42);
      fitText(g, small, w * 0.8, 40, 700);
      g.fillText(small, x0 + w / 2, y0 + h * 0.76);
    }),
  );
  const label = (key: string, text: string, w: number, h: number, bg: string, fg: string, size: number) =>
    add(key, w, h, (x0, y0, ww, hh) => {
      g.fillStyle = bg;
      g.fillRect(x0, y0, ww, hh);
      g.fillStyle = fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, text, ww * 0.9, size, 900);
      g.fillText(text, x0 + ww / 2, y0 + hh / 2 + 2);
    });
  label("dest", o.toName.toUpperCase(), 1024, 140, "#0b7285", "#ffffff", 92);
  label("welcome", `WELCOME TO ${o.area.toUpperCase()}`, 1024, 128, "#2b8a3e", "#ffffff", 76);
  label("busstop", "BUS STOP", 256, 72, "#f5c518", "#111111", 48);
  label("police", "POLICE", 256, 64, "#1c2d5a", "#ffffff", 50);
  label("vulc", "VULCANIZER • TYRE", 384, 72, "#e8590c", "#ffffff", 44);
  label("fuel", "NEWTOWN OIL", 512, 96, "#c92a2a", "#ffffff", 64);
  label("church", "CHRIST LIGHT ASSEMBLY", 512, 80, "#ffffff", "#364fc7", 46);
  label("brt", "BRT", 128, 64, "#1864ab", "#ffffff", 48);
  label("route", "OBALENDE • CMS", 384, 72, "#111111", "#f5c518", 50);
  label("lagos", "LAGOS", 384, 96, "#2b8a3e", "#ffffff", 72);
  label("price", "PMS ₦ 999", 256, 96, "#111111", "#69db7c", 56);
  // A soft round blob (smoke, lamp glow), white.
  add("blob", 128, 128, (x0, y0, w) => {
    const gr = g.createRadialGradient(x0 + w / 2, y0 + w / 2, 0, x0 + w / 2, y0 + w / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.clearRect(x0, y0, w, w);
    g.fillStyle = gr;
    g.fillRect(x0, y0, w, w);
  });
  // Zebra stripes and road marks are plain colour; a striped drum band is drawn here.
  add("drum", 64, 64, (x0, y0, w, h) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : "#e8590c";
      g.fillRect(x0, y0 + (h * i) / 4, w, h / 4);
    }
  });

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture, uv, sign: (i) => uv[`sign${i % SHOP_SIGNS.length}`], board: (i) => uv[`board${i % BILLBOARDS.length}`] };
}
