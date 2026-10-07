// Pictures drawn on canvases: the "your ad here" billboard designs, the banner on the hot-air
// balloons, and the little "👥 12" count pills shown over chat rooms.

import * as THREE from "three";

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";

/** Write text centred at (x, y), shrinking the font until it fits in maxWidth. */
function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, weight: number, maxWidth: number) {
  let s = size;
  do {
    c.font = `${weight} ${s}px ${FONT}`;
    if (c.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 10);
  c.fillText(text, x, y);
}

function finish(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The house billboard designs (shown when there's no ad to show): a clean "Your ad here",
 * with a small "tap to find out more" underneath. Four colour schemes, all 2:1.
 */
export function billboardTexture(design: number) {
  const W = 512;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const schemes = [
    { bg: ["#ffd43b", "#ffc078"], title: "#18202b", sub: "#3b2f12", accent: "#18202b" },
    { bg: ["#1c2541", "#3a506b"], title: "#ffc53d", sub: "#ffffff", accent: "#ffc53d" },
    { bg: ["#7048e8", "#e64980"], title: "#ffffff", sub: "#fff0f6", accent: "#ffffff" },
    { bg: ["#ffffff", "#f1f3f5"], title: "#e5484d", sub: "#18202b", accent: "#e5484d" },
  ];
  const sc = schemes[((design % 4) + 4) % 4];
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, sc.bg[0]);
  g.addColorStop(1, sc.bg[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // A frame inset from the edge.
  c.strokeStyle = sc.accent;
  c.globalAlpha = 0.85;
  c.lineWidth = 8;
  c.strokeRect(18, 18, W - 36, H - 36);
  c.globalAlpha = 1;
  c.fillStyle = sc.title;
  fitText(c, "Your ad here", W / 2, 112, 76, 900, W - 90);
  // A thin rule, then the small line.
  c.fillStyle = sc.accent;
  c.globalAlpha = 0.6;
  c.fillRect(W / 2 - 70, 160, 140, 4);
  c.globalAlpha = 1;
  c.fillStyle = sc.sub;
  fitText(c, "tap to find out more", W / 2, 193, 28, 600, W - 120);
  return finish(canvas);
}

/** The banner strapped round a hot-air balloon when it has no ad: "Your ad here". */
export function balloonBannerTexture() {
  const W = 512;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, W, H);
  c.strokeStyle = "#18202b";
  c.lineWidth = 10;
  c.strokeRect(10, 10, W - 20, H - 20);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#18202b";
  fitText(c, "Your ad here", W / 2, 118, 84, 900, W - 70);
  c.fillStyle = "#495057";
  fitText(c, "tap to find out more", W / 2, 192, 30, 600, W - 120);
  return finish(canvas);
}

const pillCache = new Map<string, THREE.CanvasTexture>();

/** "👥 12": how many people are in a chat room. Cached per text. */
export function pillTexture(count: number) {
  const text = count > 999 ? `${Math.floor(count / 100) / 10}k` : String(count);
  const cached = pillCache.get(text);
  if (cached) return cached;
  const W = 256;
  const H = 104;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.font = `800 52px ${FONT}`;
  const tw = c.measureText(text).width;
  const w = Math.min(W - 8, 96 + tw);
  const x0 = (W - w) / 2;
  c.fillStyle = "rgba(16, 22, 34, 0.86)";
  c.beginPath();
  c.roundRect(x0, 8, w, H - 16, (H - 16) / 2);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 4;
  c.stroke();
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.font = `44px ${EMOJI}, ${FONT}`;
  c.fillText("👥", x0 + 18, H / 2 + 2);
  c.fillStyle = "#ffffff";
  c.font = `800 52px ${FONT}`;
  c.fillText(text, x0 + 76, H / 2 + 3);
  const tex = finish(canvas);
  pillCache.set(text, tex);
  return tex;
}

/** Free the cached count pills (when the city view goes away). */
export function disposePills() {
  for (const t of pillCache.values()) t.dispose();
  pillCache.clear();
}
