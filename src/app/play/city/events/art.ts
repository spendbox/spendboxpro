// Pictures for the world events, drawn once on canvases (no image files):
// - the art sheet: glows, sparkles, hearts, banknotes, birds, butterflies, a ghost, a rainbow,
//   a mural, a crop circle, signs... (mostly white, tinted when drawn, so one picture serves
//   many colours);
// - the badge sheet: the pin that floats over each event (its icon in the event's colour),
//   the bounty poster with the wanted ghost's name, and the countdown clock. Cells are handed
//   out while an event is on and given back when it ends.
// Icons are the game's Lucide line icons (no emoji).

import type { LucideIcon } from "lucide-react";
import * as THREE from "three";
import { drawIcon } from "../textures";

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const CELL = 128;
const SIZE = 1024;

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

function finish(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function rectOf(px: number, py: number, pw: number, ph: number, W: number, H: number) {
  // Half a pixel in from each edge, so neighbours never bleed in.
  return new Float32Array([(px + 0.5) / W, 1 - (py + ph - 0.5) / H, (px + pw - 0.5) / W, 1 - (py + 0.5) / H]);
}

const radial = (c: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};

function heartPath(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s * 0.1, y + s * 0.2, x - s * 0.55, y + s * 0.05, x - s * 0.5, y - s * 0.2);
  c.bezierCurveTo(x - s * 0.45, y - s * 0.48, x - s * 0.08, y - s * 0.5, x, y - s * 0.22);
  c.bezierCurveTo(x + s * 0.08, y - s * 0.5, x + s * 0.45, y - s * 0.48, x + s * 0.5, y - s * 0.2);
  c.bezierCurveTo(x + s * 0.55, y + s * 0.05, x + s * 0.1, y + s * 0.2, x, y + s * 0.35);
  c.closePath();
}

function sign(c: CanvasRenderingContext2D, w: number, h: number, text: string, bg: string, fg: string, size: number) {
  c.fillStyle = bg;
  c.beginPath();
  c.roundRect(6, h * 0.22, w - 12, h * 0.56, 12);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.lineWidth = 5;
  c.stroke();
  c.fillStyle = fg;
  c.textAlign = "center";
  c.textBaseline = "middle";
  let s = size;
  do {
    c.font = `800 ${s}px ${FONT}`;
    if (c.measureText(text).width <= w - 26) break;
    s -= 2;
  } while (s > 10);
  c.fillText(text, w / 2, h / 2 + 2);
}

/** Every picture on the art sheet: name → [column, row, width, height] (in 128 px cells) and how to draw it. */
const ART: Record<string, [number, number, number, number, Draw]> = {
  glow: [0, 0, 1, 1, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.55)"], [0.6, "rgba(255,255,255,0.12)"], [1, "rgba(255,255,255,0)"]]);
    c.fillRect(0, 0, w, w);
  }],
  ring: [1, 0, 1, 1, (c, w) => {
    c.strokeStyle = "#fff";
    c.lineWidth = 9;
    c.shadowColor = "#fff";
    c.shadowBlur = 14;
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 16, 0, Math.PI * 2);
    c.stroke();
  }],
  star: [2, 0, 1, 1, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, "rgba(255,255,255,1)"], [0.2, "rgba(255,255,255,0.4)"], [1, "rgba(255,255,255,0)"]]);
    c.fillRect(0, 0, w, w);
    c.fillStyle = "#fff";
    c.beginPath();
    const m = w / 2;
    c.moveTo(m, 4);
    c.quadraticCurveTo(m, m, w - 4, m);
    c.quadraticCurveTo(m, m, m, w - 4);
    c.quadraticCurveTo(m, m, 4, m);
    c.quadraticCurveTo(m, m, m, 4);
    c.fill();
  }],
  heart: [3, 0, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    heartPath(c, w / 2, w / 2 + 6, w * 0.9);
    c.fill();
  }],
  note: [4, 0, 1, 1, (c, w, h) => {
    c.fillStyle = "#3f9b4f";
    c.fillRect(8, h * 0.28, w - 16, h * 0.44);
    c.strokeStyle = "#cdebc5";
    c.lineWidth = 4;
    c.strokeRect(16, h * 0.28 + 8, w - 32, h * 0.44 - 16);
    c.fillStyle = "#cdebc5";
    c.beginPath();
    c.arc(w / 2, h / 2, 14, 0, Math.PI * 2);
    c.fill();
  }],
  coin: [5, 0, 1, 1, (c, w) => {
    c.fillStyle = radial(c, w * 0.42, w * 0.4, w * 0.5, [[0, "#fff3bf"], [0.5, "#fcc419"], [1, "#e67700"]]);
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#f59f00";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2);
    c.stroke();
  }],
  bird: [6, 0, 1, 1, (c, w) => {
    c.strokeStyle = "#fff";
    c.lineWidth = 10;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(14, 50);
    c.quadraticCurveTo(40, 40, w / 2, 70);
    c.quadraticCurveTo(w - 40, 40, w - 14, 50);
    c.stroke();
  }],
  butterfly: [7, 0, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    for (const s of [-1, 1]) {
      c.beginPath();
      c.ellipse(w / 2 + s * 26, 46, 26, 32, s * 0.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(w / 2 + s * 20, 86, 17, 22, -s * 0.4, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#333";
    c.fillRect(w / 2 - 3, 30, 6, 70);
  }],
  ghost: [0, 1, 1, 1, (c, w, h) => {
    c.fillStyle = "rgba(255,255,255,0.95)";
    c.beginPath();
    c.moveTo(24, h - 14);
    c.lineTo(24, 54);
    c.arc(w / 2, 54, w / 2 - 24, Math.PI, 0);
    c.lineTo(w - 24, h - 14);
    for (let k = 0; k < 4; k++) c.quadraticCurveTo(w - 24 - (k + 0.5) * 20, h - 34, w - 24 - (k + 1) * 20, h - 14);
    c.closePath();
    c.fill();
    c.fillStyle = "#22252b";
    c.beginPath();
    c.ellipse(w / 2 - 15, 54, 7, 11, 0, 0, Math.PI * 2);
    c.ellipse(w / 2 + 15, 54, 7, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(w / 2, 80, 8, 10, 0, 0, Math.PI * 2);
    c.fill();
  }],
  puff: [1, 1, 1, 1, (c, w) => {
    for (const [x, y, r] of [[0.5, 0.55, 0.32], [0.33, 0.6, 0.22], [0.68, 0.6, 0.22], [0.45, 0.4, 0.22], [0.6, 0.42, 0.2]]) {
      c.fillStyle = radial(c, x * w, y * w, r * w, [[0, "rgba(255,255,255,0.9)"], [0.7, "rgba(255,255,255,0.5)"], [1, "rgba(255,255,255,0)"]]);
      c.fillRect(0, 0, w, w);
    }
  }],
  splash: [2, 1, 1, 1, (c, w) => {
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#fff";
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      c.beginPath();
      c.arc(w / 2 + Math.cos(a) * (w / 2 - 8), w / 2 + Math.sin(a) * (w / 2 - 8), 4, 0, Math.PI * 2);
      c.fill();
    }
  }],
  crater: [3, 1, 1, 1, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, "rgba(20,12,8,1)"], [0.45, "rgba(60,40,28,0.95)"], [0.75, "rgba(120,96,70,0.6)"], [1, "rgba(120,96,70,0)"]]);
    c.fillRect(0, 0, w, w);
  }],
  corona: [4, 1, 1, 1, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, "rgba(255,255,255,1)"], [0.36, "rgba(255,250,230,1)"], [0.42, "rgba(255,236,190,0.7)"], [0.7, "rgba(255,220,160,0.2)"], [1, "rgba(255,220,160,0)"]]);
    c.fillRect(0, 0, w, w);
    c.fillStyle = "#0b0d14";
    c.beginPath();
    c.arc(w / 2, w / 2, w * 0.17, 0, Math.PI * 2);
    c.fill();
  }],
  hpad: [5, 1, 1, 1, (c, w) => {
    c.strokeStyle = "#fff";
    c.lineWidth = 8;
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 10, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#fff";
    c.font = `900 70px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("H", w / 2, w / 2 + 4);
  }],
  clover: [6, 1, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    for (let k = 0; k < 4; k++) {
      c.save();
      c.translate(w / 2, w / 2);
      c.rotate((k * Math.PI) / 2 + Math.PI / 4);
      heartPath(c, 0, -26, 54);
      c.fill();
      c.restore();
    }
    c.fillRect(w / 2 - 3, w / 2, 6, 52);
  }],
  bat: [7, 1, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(w / 2, 54);
    c.quadraticCurveTo(w / 2 - 20, 40, w / 2 - 54, 42);
    c.quadraticCurveTo(w / 2 - 44, 56, w / 2 - 50, 74);
    c.quadraticCurveTo(w / 2 - 30, 62, w / 2 - 22, 78);
    c.quadraticCurveTo(w / 2 - 10, 64, w / 2, 80);
    c.quadraticCurveTo(w / 2 + 10, 64, w / 2 + 22, 78);
    c.quadraticCurveTo(w / 2 + 30, 62, w / 2 + 50, 74);
    c.quadraticCurveTo(w / 2 + 44, 56, w / 2 + 54, 42);
    c.quadraticCurveTo(w / 2 + 20, 40, w / 2, 54);
    c.fill();
  }],
  petal: [0, 2, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.ellipse(w / 2, w / 2, 22, 40, 0.5, 0, Math.PI * 2);
    c.fill();
  }],
  paw: [1, 2, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.ellipse(w / 2, w / 2 + 16, 26, 22, 0, 0, Math.PI * 2);
    c.fill();
    for (const [x, y] of [[-30, -10], [-11, -28], [11, -28], [30, -10]]) {
      c.beginPath();
      c.ellipse(w / 2 + x, w / 2 + y, 10, 13, 0, 0, Math.PI * 2);
      c.fill();
    }
  }],
  cross: [2, 2, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.roundRect(10, 10, w - 20, w - 20, 22);
    c.fill();
    c.fillStyle = "#e03131";
    c.fillRect(w / 2 - 15, 26, 30, w - 52);
    c.fillRect(26, w / 2 - 15, w - 52, 30);
  }],
  sale: [3, 2, 1, 1, (c, w, h) => sign(c, w, h, "SALE", "#e03131", "#fff", 44)],
  free: [4, 2, 1, 1, (c, w, h) => sign(c, w, h, "FREE", "#2f9e44", "#fff", 44)],
  hazard: [5, 2, 1, 1, (c, w) => {
    c.fillStyle = "#ffd43b";
    c.strokeStyle = "#1c1c1c";
    c.lineWidth = 8;
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(w / 2, 14);
    c.lineTo(w - 12, w - 18);
    c.lineTo(12, w - 18);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#1c1c1c";
    c.fillRect(w / 2 - 6, 46, 12, 38);
    c.fillRect(w / 2 - 6, 92, 12, 12);
  }],
  delayed: [6, 2, 1, 1, (c, w, h) => sign(c, w, h, "DELAYED", "#1c1f26", "#ffb020", 30)],
  jolly: [7, 2, 1, 1, (c, w, h) => {
    c.fillStyle = "#15161a";
    c.fillRect(4, 14, w - 8, h - 28);
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(w / 2, 52, 22, 0, Math.PI * 2);
    c.fill();
    c.fillRect(w / 2 - 14, 64, 28, 16);
    c.fillStyle = "#15161a";
    c.beginPath();
    c.arc(w / 2 - 9, 50, 6, 0, Math.PI * 2);
    c.arc(w / 2 + 9, 50, 6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = 8;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(w / 2 - 30, 84);
    c.lineTo(w / 2 + 30, 104);
    c.moveTo(w / 2 + 30, 84);
    c.lineTo(w / 2 - 30, 104);
    c.stroke();
  }],
  music: [0, 3, 1, 1, (c) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.ellipse(40, 92, 18, 13, -0.4, 0, Math.PI * 2);
    c.ellipse(92, 80, 18, 13, -0.4, 0, Math.PI * 2);
    c.fill();
    c.fillRect(52, 26, 7, 66);
    c.fillRect(104, 14, 7, 66);
    c.beginPath();
    c.moveTo(52, 26);
    c.lineTo(111, 14);
    c.lineTo(111, 30);
    c.lineTo(52, 42);
    c.fill();
  }],
  x2: [1, 3, 1, 1, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, "#fff3bf"], [0.6, "#fcc419"], [1, "#f08c00"]]);
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#7a4a00";
    c.font = `900 56px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("x2", w / 2, w / 2 + 3);
  }],
  shh: [2, 3, 1, 1, (c, w, h) => sign(c, w, h, "Shhh", "#5f3dc4", "#fff", 44)],
  strike: [3, 3, 1, 1, (c, w, h) => sign(c, w, h, "STRIKE", "#fff", "#e03131", 36)],
  closed: [4, 3, 1, 1, (c, w, h) => sign(c, w, h, "CLOSED", "#e03131", "#fff", 34)],
  softsq: [5, 3, 1, 1, (c, w) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.18, "rgba(255,255,255,0.85)");
    g.addColorStop(0.82, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
    c.globalCompositeOperation = "destination-in";
    const v = c.createLinearGradient(0, 0, 0, w);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.18, "rgba(0,0,0,1)");
    v.addColorStop(0.82, "rgba(0,0,0,1)");
    v.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = v;
    c.fillRect(0, 0, w, w);
    c.globalCompositeOperation = "source-over";
  }],
  windows: [6, 3, 1, 1, (c) => {
    c.fillStyle = "#fff";
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) c.fillRect(10 + i * 29, 8 + j * 24, 20, 14);
  }],
  flag: [7, 3, 1, 1, (c, w, h) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(10, 24);
    c.bezierCurveTo(50, 8, 70, 40, w - 8, 24);
    c.lineTo(w - 8, h - 30);
    c.bezierCurveTo(70, h - 14, 50, h - 46, 10, h - 30);
    c.closePath();
    c.fill();
  }],
  cheque: [0, 4, 2, 1, (c, w, h) => {
    c.fillStyle = "#f8f3e6";
    c.strokeStyle = "#2f9e44";
    c.lineWidth = 8;
    c.beginPath();
    c.roundRect(6, 10, w - 12, h - 20, 10);
    c.fill();
    c.stroke();
    c.fillStyle = "#2f9e44";
    c.font = `800 26px ${FONT}`;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText("CITY LOTTERY", 22, 36);
    c.font = `900 44px ${FONT}`;
    c.fillStyle = "#1c1f26";
    c.fillText("1,000,000", 22, 82);
    c.fillStyle = "#2f9e44";
    c.fillRect(170, 98, 66, 4);
  }],
  married: [2, 4, 2, 1, (c, w, h) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.roundRect(4, 26, w - 8, h - 52, 14);
    c.fill();
    c.fillStyle = "#d6336c";
    c.font = `800 36px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("JUST MARRIED", w / 2, h / 2 + 2);
  }],
  mural: [4, 4, 2, 2, (c, w, h) => {
    const cols = ["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c", "#f783ac", "#845ef7", "#ff922b", "#20c997"];
    c.fillStyle = "#1f2a44";
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 9; k++) {
      c.fillStyle = cols[k % cols.length];
      c.beginPath();
      c.arc(((k * 97) % w) + 10, ((k * 61) % h) + 20, 34 + (k % 3) * 18, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = "#fff";
    c.lineWidth = 10;
    c.lineCap = "round";
    c.beginPath();
    for (let x = 0; x <= w; x += 8) c.lineTo(x, h / 2 + Math.sin(x / 22) * 30);
    c.stroke();
    // A big face, smiling.
    c.fillStyle = "#ffd8a8";
    c.beginPath();
    c.arc(w * 0.5, h * 0.48, 58, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1f2a44";
    c.beginPath();
    c.arc(w * 0.5 - 20, h * 0.44, 7, 0, Math.PI * 2);
    c.arc(w * 0.5 + 20, h * 0.44, 7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#e03131";
    c.lineWidth = 7;
    c.beginPath();
    c.arc(w * 0.5, h * 0.5, 26, 0.2, Math.PI - 0.2);
    c.stroke();
    c.strokeStyle = "#ffd43b";
    c.lineWidth = 6;
    c.strokeRect(6, 6, w - 12, h - 12);
  }],
  crop: [6, 4, 2, 2, (c, w, h) => {
    c.strokeStyle = "#fff";
    c.fillStyle = "#fff";
    c.lineWidth = 9;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 16, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(w / 2, h / 2, 34, 0, Math.PI * 2);
    c.fill();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const x = w / 2 + Math.cos(a) * 74;
      const y = h / 2 + Math.sin(a) * 74;
      c.beginPath();
      c.arc(x, y, 16, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 34);
      c.lineTo(x, y);
      c.stroke();
    }
    c.lineWidth = 5;
    c.beginPath();
    c.arc(w / 2, h / 2, 74, 0, Math.PI * 2);
    c.stroke();
  }],
  screen: [0, 5, 2, 1, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#7048e8");
    g.addColorStop(0.5, "#e64980");
    g.addColorStop(1, "#ffa94d");
    c.fillStyle = g;
    c.fillRect(4, 4, w - 8, h - 8);
    c.fillStyle = "rgba(255,255,255,0.85)";
    for (let k = 0; k < 12; k++) c.fillRect(20 + k * 19, h - 24 - ((k * 37) % 60), 10, 14 + ((k * 37) % 60));
  }],
  clap: [2, 5, 1, 1, (c, w) => {
    c.fillStyle = "#1c1f26";
    c.fillRect(14, 44, w - 28, 70);
    c.save();
    c.translate(14, 40);
    c.rotate(-0.25);
    c.fillRect(0, -16, w - 28, 18);
    c.fillStyle = "#fff";
    for (let k = 0; k < 5; k++) c.fillRect(6 + k * 20, -16, 10, 18);
    c.restore();
    c.fillStyle = "#fff";
    c.fillRect(24, 64, w - 48, 4);
    c.fillRect(24, 84, w - 48, 4);
  }],
  sun: [3, 5, 1, 1, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, w / 2, [[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,250,220,1)"], [0.36, "rgba(255,236,170,0.6)"], [1, "rgba(255,220,140,0)"]]);
    c.fillRect(0, 0, w, w);
  }],
  rainbow: [0, 6, 4, 2, (c, w, h) => {
    const cols = ["#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0a84ff", "#5e5ce6", "#bf5af2"];
    c.lineWidth = 15;
    c.globalAlpha = 0.85;
    cols.forEach((col, k) => {
      c.strokeStyle = col;
      c.beginPath();
      c.arc(w / 2, h - 4, w / 2 - 12 - k * 14, Math.PI, 0);
      c.stroke();
    });
    c.globalAlpha = 1;
  }],
  // Signs over a stage, a stall, a gate...
  stripes: [4, 6, 1, 1, (c, w) => {
    for (let k = 0; k < 8; k++) {
      c.fillStyle = k % 2 ? "#fff" : "#e03131";
      c.fillRect((k * w) / 8, 0, w / 8, w);
    }
  }],
  tape: [5, 6, 1, 1, (c, w) => {
    c.fillStyle = "#ffd43b";
    c.fillRect(0, w * 0.35, w, w * 0.3);
    c.fillStyle = "#1c1c1c";
    for (let k = -1; k < 8; k++) {
      c.beginPath();
      c.moveTo(k * 20, w * 0.65);
      c.lineTo(k * 20 + 10, w * 0.65);
      c.lineTo(k * 20 + 22, w * 0.35);
      c.lineTo(k * 20 + 12, w * 0.35);
      c.fill();
    }
  }],
  drop: [6, 6, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(w / 2, 12);
    c.quadraticCurveTo(w / 2 + 40, 70, w / 2, 112);
    c.quadraticCurveTo(w / 2 - 40, 70, w / 2, 12);
    c.fill();
  }],
  bolt: [7, 6, 1, 1, (c) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(72, 8);
    c.lineTo(30, 70);
    c.lineTo(60, 70);
    c.lineTo(46, 120);
    c.lineTo(98, 52);
    c.lineTo(66, 52);
    c.closePath();
    c.fill();
  }],
  zzz: [4, 7, 1, 1, (c) => {
    c.fillStyle = "#fff";
    c.font = `900 40px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("z", 36, 88);
    c.font = `900 54px ${FONT}`;
    c.fillText("z", 70, 60);
    c.font = `900 66px ${FONT}`;
    c.fillText("z", 100, 30);
  }],
  robot: [5, 7, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.roundRect(22, 34, w - 44, 70, 16);
    c.fill();
    c.fillRect(w / 2 - 4, 14, 8, 22);
    c.beginPath();
    c.arc(w / 2, 14, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e03131";
    c.beginPath();
    c.arc(w / 2 - 18, 62, 10, 0, Math.PI * 2);
    c.arc(w / 2 + 18, 62, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1c1f26";
    c.fillRect(w / 2 - 20, 84, 40, 7);
  }],
  pin: [6, 7, 1, 1, (c, w) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(w / 2, 50, 36, Math.PI, 0);
    c.quadraticCurveTo(w / 2 + 36, 80, w / 2, 120);
    c.quadraticCurveTo(w / 2 - 36, 80, w / 2 - 36, 50);
    c.fill();
  }],
  mask: [7, 7, 1, 1, (c, w) => {
    // A carnival mask.
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(10, 50);
    c.quadraticCurveTo(w / 2, 20, w - 10, 50);
    c.quadraticCurveTo(w - 20, 92, w / 2 + 10, 84);
    c.quadraticCurveTo(w / 2, 72, w / 2 - 10, 84);
    c.quadraticCurveTo(20, 92, 10, 50);
    c.fill();
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.ellipse(w / 2 - 24, 58, 14, 9, 0.2, 0, Math.PI * 2);
    c.ellipse(w / 2 + 24, 58, 14, 9, -0.2, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "source-over";
  }],
};

// Digits for clocks in the sky (half-cells: 64 × 128 px), white so they can glow in any colour.
"0123456789:".split("").forEach((ch, k) => {
  const at: [number, number] = k < 8 ? [4 + k * 0.5, 5] : [(k - 8) * 0.5, 7];
  ART[ch === ":" ? "dc" : `d${ch}`] = [at[0], at[1], 0.5, 1, (c, w, h) => {
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `900 ${ch === ":" ? 90 : 104}px ${FONT}`;
    c.shadowColor = "#fff";
    c.shadowBlur = 8;
    c.fillText(ch, w / 2, h / 2 + 6);
  }];
});

export type ArtSheet = { texture: THREE.CanvasTexture; rect: (name: string) => Float32Array; dispose: () => void };

export function createArtSheet(): ArtSheet {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const c = canvas.getContext("2d")!;
  const rects = new Map<string, Float32Array>();
  for (const [name, [col, row, w, h, draw]] of Object.entries(ART)) {
    c.save();
    c.translate(col * CELL, row * CELL);
    c.beginPath();
    c.rect(0, 0, w * CELL, h * CELL);
    c.clip();
    draw(c, w * CELL, h * CELL);
    c.restore();
    rects.set(name, rectOf(col * CELL, row * CELL, w * CELL, h * CELL, SIZE, SIZE));
  }
  const texture = finish(canvas);
  const fallback = rects.get("glow")!;
  return { texture, rect: (name) => rects.get(name) ?? fallback, dispose: () => texture.dispose() };
}

// ---------------------------------------------------------------- the badge sheet

const UI = 256;
const UI_COLS = 4;

export const CATEGORY_COLOR: Record<string, string> = {
  emergency: "#e5484d",
  weather: "#2f8fd8",
  party: "#d6409f",
  transport: "#0f9f8f",
  city: "#ee8a00",
  mystery: "#7c5cdb",
  twist: "#d9a400",
};

export type UiSheet = {
  texture: THREE.CanvasTexture;
  rect: (cell: number) => Float32Array;
  /** A free cell, or -1 when all are taken. */
  take: () => number;
  give: (cell: number) => void;
  badge: (cell: number, icon: LucideIcon, color: string, ring?: string) => void;
  poster: (cell: number, name: string) => void;
  dispose: () => void;
};

export function createUiSheet(): UiSheet {
  const canvas = document.createElement("canvas");
  canvas.width = UI * UI_COLS;
  canvas.height = UI * UI_COLS;
  const c = canvas.getContext("2d")!;
  const texture = finish(canvas);
  const free = Array.from({ length: UI_COLS * UI_COLS }, (_, k) => UI_COLS * UI_COLS - 1 - k);
  const rects = Array.from({ length: UI_COLS * UI_COLS }, (_, k) => rectOf((k % UI_COLS) * UI, Math.floor(k / UI_COLS) * UI, UI, UI, UI * UI_COLS, UI * UI_COLS));
  const begin = (cell: number) => {
    const x = (cell % UI_COLS) * UI;
    const y = Math.floor(cell / UI_COLS) * UI;
    c.save();
    c.clearRect(x, y, UI, UI);
    c.translate(x, y);
    c.beginPath();
    c.rect(0, 0, UI, UI);
    c.clip();
  };
  const done = () => {
    c.restore();
    texture.needsUpdate = true;
  };
  return {
    texture,
    rect: (cell) => rects[cell] ?? rects[0],
    take: () => free.pop() ?? -1,
    give: (cell) => {
      if (cell >= 0 && !free.includes(cell)) free.push(cell);
    },
    badge(cell, icon, color, ring = "#ffffff") {
      begin(cell);
      // A map pin: a round badge with the event's icon, pointing down at the spot.
      c.shadowColor = "rgba(10,14,24,0.45)";
      c.shadowBlur = 16;
      c.shadowOffsetY = 5;
      c.fillStyle = ring;
      c.beginPath();
      c.arc(128, 104, 92, Math.PI * 0.8, Math.PI * 0.2);
      c.lineTo(128, 244);
      c.closePath();
      c.fill();
      c.shadowColor = "transparent";
      c.fillStyle = color;
      c.beginPath();
      c.arc(128, 104, 80, 0, Math.PI * 2);
      c.fill();
      drawIcon(c, icon, 128 - 50, 104 - 50, 100, "#ffffff", 2.2);
      done();
    },
    poster(cell, name) {
      begin(cell);
      // An old-west "wanted" poster with the ghost's name and the bounty.
      c.fillStyle = "#f3e2b8";
      c.strokeStyle = "#8a5a2b";
      c.lineWidth = 8;
      c.beginPath();
      c.roundRect(20, 8, 216, 240, 8);
      c.fill();
      c.stroke();
      c.fillStyle = "#5c3a1e";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = `900 46px ${FONT}`;
      c.fillText("WANTED", 128, 46);
      c.strokeStyle = "#5c3a1e";
      c.lineWidth = 4;
      c.strokeRect(70, 74, 116, 86);
      c.fillStyle = "#c9a76f";
      c.beginPath();
      c.arc(128, 106, 22, 0, Math.PI * 2);
      c.fill();
      c.fillRect(98, 128, 60, 30);
      c.fillStyle = "#5c3a1e";
      let s = 34;
      const label = name.trim() || "The bot";
      do {
        c.font = `800 ${s}px ${FONT}`;
        if (c.measureText(label).width <= 196) break;
        s -= 2;
      } while (s > 12);
      c.fillText(label, 128, 186);
      c.font = `800 26px ${FONT}`;
      c.fillStyle = "#b8590b";
      c.fillText("+100 coins", 128, 222);
      done();
    },
    dispose: () => texture.dispose(),
  };
}
