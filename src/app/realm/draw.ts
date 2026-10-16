// Drawings of the Spirit Realm's fighters (docs/REALM.md), on a canvas: small and simple, so a
// battle of hundreds of them draws smoothly on any phone. Used by the shop and the battle.

import type { FighterId } from "@/lib/realm/fighters";

type Ctx = CanvasRenderingContext2D;

/** How big each kind is drawn, compared with a soldier. */
export const DRAW_SCALE: Record<FighterId, number> = { soldier: 1, archer: 1, wolf: 1, ghost: 1.05, angel: 1.15, devil: 1.15, giant: 1.9, dragon: 1.8 };

function circle(c: Ctx, x: number, y: number, r: number, fill: string) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function eyes(c: Ctx, x: number, y: number, s: number, colour = "#111") {
  circle(c, x - s * 0.18, y, s * 0.08, colour);
  circle(c, x + s * 0.18, y, s * 0.08, colour);
}

/**
 * One fighter, standing at (x, y) (its feet), s pixels tall. `flip` faces it left. `team` is a
 * ring at its feet in its army's colour, so you can tell the armies apart.
 */
export function drawFighter(c: Ctx, kind: FighterId, x: number, y: number, s: number, opts: { team?: string; flip?: boolean; flash?: boolean } = {}) {
  s *= DRAW_SCALE[kind];
  c.save();
  c.translate(x, y);
  if (opts.flip) c.scale(-1, 1);
  if (opts.team) {
    c.beginPath();
    c.ellipse(0, 0, s * 0.42, s * 0.14, 0, 0, Math.PI * 2);
    c.fillStyle = opts.team;
    c.fill();
  }
  const top = -s;
  switch (kind) {
    case "soldier": {
      c.fillStyle = "#4f6b2b";
      c.fillRect(-s * 0.2, top + s * 0.4, s * 0.4, s * 0.55);
      circle(c, 0, top + s * 0.3, s * 0.17, "#e0b48a");
      c.fillStyle = "#3a4f1f";
      c.fillRect(-s * 0.22, top + s * 0.1, s * 0.44, s * 0.13);
      c.strokeStyle = "#c9c9c9";
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.moveTo(s * 0.3, top + s * 0.95);
      c.lineTo(s * 0.3, top);
      c.stroke();
      break;
    }
    case "archer": {
      c.fillStyle = "#7a5230";
      c.fillRect(-s * 0.18, top + s * 0.42, s * 0.36, s * 0.53);
      circle(c, 0, top + s * 0.3, s * 0.16, "#c98f62");
      c.fillStyle = "#2f6b3a";
      c.beginPath();
      c.moveTo(-s * 0.2, top + s * 0.28);
      c.lineTo(0, top + s * 0.02);
      c.lineTo(s * 0.2, top + s * 0.28);
      c.fill();
      c.strokeStyle = "#d9a441";
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.arc(s * 0.22, top + s * 0.6, s * 0.3, -Math.PI / 2, Math.PI / 2);
      c.stroke();
      break;
    }
    case "wolf": {
      c.fillStyle = "#8aa4c8";
      c.beginPath();
      c.ellipse(-s * 0.05, top + s * 0.7, s * 0.4, s * 0.2, 0, 0, Math.PI * 2);
      c.fill();
      circle(c, s * 0.33, top + s * 0.5, s * 0.17, "#9fb7d8");
      c.beginPath();
      c.moveTo(s * 0.26, top + s * 0.38);
      c.lineTo(s * 0.3, top + s * 0.2);
      c.lineTo(s * 0.38, top + s * 0.36);
      c.fill();
      c.fillStyle = "#6f88ad";
      c.fillRect(-s * 0.35, top + s * 0.8, s * 0.1, s * 0.2);
      c.fillRect(s * 0.15, top + s * 0.8, s * 0.1, s * 0.2);
      circle(c, s * 0.38, top + s * 0.48, s * 0.04, "#c9f0ff");
      break;
    }
    case "ghost": {
      c.globalAlpha *= 0.85;
      c.fillStyle = "#e8eeff";
      c.beginPath();
      c.arc(0, top + s * 0.4, s * 0.32, Math.PI, 0);
      c.lineTo(s * 0.32, top + s * 0.95);
      for (let i = 0; i < 4; i++) {
        const xx = s * 0.32 - (i + 0.5) * s * 0.16;
        c.quadraticCurveTo(xx, top + s * (i % 2 ? 0.95 : 0.8), xx - s * 0.08, top + s * 0.95);
      }
      c.closePath();
      c.fill();
      eyes(c, 0, top + s * 0.4, s, "#2b2f4a");
      break;
    }
    case "angel": {
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.ellipse(-s * 0.3, top + s * 0.5, s * 0.25, s * 0.12, -0.5, 0, Math.PI * 2);
      c.ellipse(s * 0.3, top + s * 0.5, s * 0.25, s * 0.12, 0.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffe9a8";
      c.beginPath();
      c.moveTo(-s * 0.2, top + s * 0.95);
      c.lineTo(0, top + s * 0.38);
      c.lineTo(s * 0.2, top + s * 0.95);
      c.fill();
      circle(c, 0, top + s * 0.32, s * 0.15, "#f2c9a0");
      c.strokeStyle = "#ffd65a";
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.ellipse(0, top + s * 0.1, s * 0.16, s * 0.05, 0, 0, Math.PI * 2);
      c.stroke();
      break;
    }
    case "devil": {
      c.fillStyle = "#b3262b";
      c.fillRect(-s * 0.2, top + s * 0.42, s * 0.4, s * 0.53);
      circle(c, 0, top + s * 0.32, s * 0.19, "#e5484d");
      c.fillStyle = "#3b0d0f";
      c.beginPath();
      c.moveTo(-s * 0.16, top + s * 0.2);
      c.lineTo(-s * 0.22, top);
      c.lineTo(-s * 0.06, top + s * 0.16);
      c.moveTo(s * 0.16, top + s * 0.2);
      c.lineTo(s * 0.22, top);
      c.lineTo(s * 0.06, top + s * 0.16);
      c.fill();
      eyes(c, 0, top + s * 0.32, s, "#ffd65a");
      c.strokeStyle = "#ff9b3d";
      c.lineWidth = Math.max(1, s * 0.05);
      c.beginPath();
      c.moveTo(s * 0.3, top + s * 0.95);
      c.lineTo(s * 0.3, top + s * 0.25);
      c.moveTo(s * 0.2, top + s * 0.3);
      c.lineTo(s * 0.3, top + s * 0.18);
      c.lineTo(s * 0.4, top + s * 0.3);
      c.stroke();
      break;
    }
    case "giant": {
      c.fillStyle = "#7d6047";
      c.beginPath();
      c.ellipse(0, top + s * 0.62, s * 0.34, s * 0.34, 0, 0, Math.PI * 2);
      c.fill();
      circle(c, 0, top + s * 0.22, s * 0.17, "#a8865f");
      c.fillStyle = "#4a3726";
      c.fillRect(-s * 0.34, top + s * 0.62, s * 0.68, s * 0.08);
      eyes(c, 0, top + s * 0.22, s * 0.7);
      c.fillStyle = "#5a4330";
      c.fillRect(s * 0.3, top + s * 0.35, s * 0.12, s * 0.55);
      break;
    }
    case "dragon": {
      c.fillStyle = "#5b21b6";
      c.beginPath();
      c.moveTo(-s * 0.1, top + s * 0.5);
      c.lineTo(-s * 0.5, top + s * 0.1);
      c.lineTo(-s * 0.35, top + s * 0.55);
      c.moveTo(s * 0.05, top + s * 0.5);
      c.lineTo(s * 0.35, top + s * 0.05);
      c.lineTo(s * 0.3, top + s * 0.55);
      c.fill();
      c.fillStyle = "#7c3aed";
      c.beginPath();
      c.ellipse(0, top + s * 0.65, s * 0.32, s * 0.2, 0, 0, Math.PI * 2);
      c.fill();
      circle(c, s * 0.34, top + s * 0.42, s * 0.14, "#8b5cf6");
      circle(c, s * 0.38, top + s * 0.4, s * 0.035, "#ffd65a");
      c.strokeStyle = "#7c3aed";
      c.lineWidth = Math.max(1, s * 0.08);
      c.beginPath();
      c.moveTo(-s * 0.3, top + s * 0.7);
      c.quadraticCurveTo(-s * 0.55, top + s * 0.8, -s * 0.5, top + s * 0.95);
      c.stroke();
      break;
    }
  }
  if (opts.flash) {
    c.globalCompositeOperation = "lighter";
    circle(c, 0, top + s * 0.5, s * 0.45, "rgba(255,255,255,0.35)");
  }
  c.restore();
}

/** Each army's colour, from its place in the queue (spread round the colour wheel). */
export const armyColour = (seq: number) => `hsl(${Math.round((seq * 137.508) % 360)} 85% 60%)`;
