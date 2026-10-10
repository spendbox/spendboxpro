// Little drawings for the action games, all made from canvas shapes (no image files): balls,
// ducks, clays, moles, fruit, cars, people, coins, gems, lasers... Each draws centred on (x, y)
// at size s (about its width), facing right unless it says otherwise.

type C = CanvasRenderingContext2D;

export function circle(c: C, x: number, y: number, r: number, fill: string, stroke?: string, lw = 2) {
  c.beginPath();
  c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

export function rrect(c: C, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, lw = 2) {
  // A bar that has shrunk past nothing draws nothing (a negative corner would throw).
  if (!(w > 0 && h > 0)) return;
  c.beginPath();
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

export function text(c: C, s: string, x: number, y: number, size: number, colour = "#fff", align: CanvasTextAlign = "center", weight = 800) {
  c.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillStyle = colour;
  c.fillText(s, x, y);
}

export function line(c: C, x1: number, y1: number, x2: number, y2: number, colour: string, lw = 2) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = colour;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.stroke();
}

/** A ball: football, basketball, tennis, cricket, volleyball, bowling, golf, pingpong, beach. */
export function ball(c: C, x: number, y: number, r: number, kind: string, spin = 0) {
  const colours: Record<string, [string, string]> = {
    football: ["#ffffff", "#212529"],
    basketball: ["#f76707", "#6b2d00"],
    tennis: ["#d8f5a2", "#82c91e"],
    cricket: ["#c92a2a", "#fff5f5"],
    baseball: ["#ffffff", "#e03131"],
    volley: ["#fff3bf", "#1c7ed6"],
    bowling: ["#364fc7", "#91a7ff"],
    golf: ["#ffffff", "#ced4da"],
    pingpong: ["#ff922b", "#ffe8cc"],
    rugby: ["#8d5524", "#ffffff"],
    puck: ["#212529", "#495057"],
  };
  const [a, b] = colours[kind] ?? ["#ffffff", "#212529"];
  c.save();
  c.translate(x, y);
  c.rotate(spin);
  if (kind === "rugby") {
    c.beginPath();
    c.ellipse(0, 0, r * 1.4, r, 0, 0, Math.PI * 2);
    c.fillStyle = a;
    c.fill();
    line(c, -r * 0.5, 0, r * 0.5, 0, b, 2);
    for (let k = -2; k <= 2; k++) line(c, k * r * 0.2, -r * 0.15, k * r * 0.2, r * 0.15, b, 1.5);
    c.restore();
    return;
  }
  circle(c, 0, 0, r, a);
  c.strokeStyle = b;
  c.lineWidth = Math.max(1, r * 0.12);
  if (kind === "football") {
    circle(c, 0, 0, r * 0.35, b);
    for (let k = 0; k < 5; k++) {
      const an = (k / 5) * Math.PI * 2;
      circle(c, Math.cos(an) * r * 0.82, Math.sin(an) * r * 0.82, r * 0.22, b);
    }
  } else if (kind === "basketball") {
    c.beginPath();
    c.moveTo(-r, 0);
    c.lineTo(r, 0);
    c.moveTo(0, -r);
    c.lineTo(0, r);
    c.stroke();
    c.beginPath();
    c.arc(-r * 1.3, 0, r, -0.8, 0.8);
    c.stroke();
    c.beginPath();
    c.arc(r * 1.3, 0, r, Math.PI - 0.8, Math.PI + 0.8);
    c.stroke();
  } else if (kind === "tennis" || kind === "baseball") {
    c.beginPath();
    c.arc(-r * 1.1, 0, r * 0.8, -1, 1);
    c.stroke();
    c.beginPath();
    c.arc(r * 1.1, 0, r * 0.8, Math.PI - 1, Math.PI + 1);
    c.stroke();
  } else if (kind === "cricket") {
    line(c, 0, -r, 0, r, b, Math.max(1, r * 0.15));
  } else if (kind === "volley") {
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      c.arc(0, 0, r * 0.7, (k * Math.PI * 2) / 3, (k * Math.PI * 2) / 3 + 1.4);
      c.stroke();
    }
  } else if (kind === "bowling") {
    circle(c, -r * 0.25, -r * 0.3, r * 0.14, "#1b1f3b");
    circle(c, r * 0.15, -r * 0.4, r * 0.14, "#1b1f3b");
    circle(c, 0, -r * 0.05, r * 0.14, "#1b1f3b");
  } else if (kind === "puck") {
    circle(c, 0, 0, r * 0.65, b);
  }
  c.restore();
}

/** A duck flying (wings flap with t). Faces right; flip with dir -1. */
export function duck(c: C, x: number, y: number, s: number, t: number, dir = 1, hit = false) {
  c.save();
  c.translate(x, y);
  c.scale(dir, hit ? -1 : 1);
  const body = hit ? "#868e96" : "#7a5230";
  c.beginPath();
  c.ellipse(0, 0, s * 0.42, s * 0.24, 0, 0, Math.PI * 2);
  c.fillStyle = body;
  c.fill();
  circle(c, s * 0.38, -s * 0.18, s * 0.16, hit ? "#adb5bd" : "#2b8a3e");
  c.beginPath();
  c.moveTo(s * 0.5, -s * 0.2);
  c.lineTo(s * 0.68, -s * 0.14);
  c.lineTo(s * 0.5, -s * 0.1);
  c.fillStyle = "#f59f00";
  c.fill();
  circle(c, s * 0.42, -s * 0.22, s * 0.03, "#000");
  const flap = Math.sin(t * 18) * 0.9;
  c.beginPath();
  c.moveTo(-s * 0.1, -s * 0.05);
  c.lineTo(-s * 0.3, -s * 0.05 - s * 0.45 * flap);
  c.lineTo(s * 0.15, -s * 0.05);
  c.fillStyle = hit ? "#495057" : "#5c3d22";
  c.fill();
  c.restore();
}

/** A clay pigeon (an orange disc, tilted). */
export function clay(c: C, x: number, y: number, s: number, broken = 0) {
  if (broken > 0) {
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      circle(c, x + Math.cos(a) * broken * s, y + Math.sin(a) * broken * s, s * 0.12, "#e8590c");
    }
    return;
  }
  c.beginPath();
  c.ellipse(x, y, s * 0.5, s * 0.18, 0, 0, Math.PI * 2);
  c.fillStyle = "#e8590c";
  c.fill();
  c.beginPath();
  c.ellipse(x, y - s * 0.05, s * 0.3, s * 0.08, 0, 0, Math.PI * 2);
  c.fillStyle = "#ff922b";
  c.fill();
}

/** A round target: rings, red middle. */
export function target(c: C, x: number, y: number, r: number) {
  const rings = ["#ffffff", "#212529", "#1c7ed6", "#e03131", "#ffd43b"];
  rings.forEach((col, i) => circle(c, x, y, r * (1 - i * 0.19), col));
}

/** A mole popping out of a hole (up 0 to 1). */
export function mole(c: C, x: number, y: number, s: number, up: number, kind: "mole" | "gold" | "bomb" = "mole", bonked = false) {
  c.save();
  c.beginPath();
  c.ellipse(x, y + s * 0.05, s * 0.5, s * 0.16, 0, 0, Math.PI * 2);
  c.fillStyle = "#2b1d0e";
  c.fill();
  c.beginPath();
  c.rect(x - s * 0.6, y - s * 1.3, s * 1.2, s * 1.35);
  c.clip();
  const top = y - s * 0.95 * up;
  if (kind === "bomb") {
    circle(c, x, top + s * 0.35, s * 0.34, "#212529");
    line(c, x + s * 0.15, top + s * 0.05, x + s * 0.3, top - s * 0.1, "#ffd43b", 3);
  } else {
    const fur = kind === "gold" ? "#fab005" : "#8d6e63";
    c.beginPath();
    c.ellipse(x, top + s * 0.45, s * 0.36, s * 0.48, 0, 0, Math.PI * 2);
    c.fillStyle = fur;
    c.fill();
    circle(c, x, top + s * 0.38, s * 0.12, "#f8c4b4");
    circle(c, x - s * 0.13, top + s * 0.22, s * 0.05, bonked ? "#e03131" : "#000");
    circle(c, x + s * 0.13, top + s * 0.22, s * 0.05, bonked ? "#e03131" : "#000");
    circle(c, x, top + s * 0.33, s * 0.06, "#c2255c");
  }
  c.restore();
}

const FRUIT: Record<string, [string, string]> = {
  watermelon: ["#2f9e44", "#ff6b6b"],
  orange: ["#fd7e14", "#ffc078"],
  apple: ["#e03131", "#fff5f5"],
  pineapple: ["#fab005", "#fff3bf"],
  mango: ["#f59f00", "#ffe066"],
  coconut: ["#6b4f35", "#ffffff"],
};
export const FRUITS = Object.keys(FRUIT);

/** A piece of fruit (or half of one, when cut: side -1 / 1). */
export function fruit(c: C, x: number, y: number, r: number, kind: string, spin = 0, half = 0) {
  const [skin, flesh] = FRUIT[kind] ?? FRUIT.apple;
  c.save();
  c.translate(x, y);
  c.rotate(spin);
  if (half) {
    c.beginPath();
    c.arc(0, 0, r, half > 0 ? -Math.PI / 2 : Math.PI / 2, half > 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    c.closePath();
    c.fillStyle = skin;
    c.fill();
    c.beginPath();
    c.arc(0, 0, r * 0.82, half > 0 ? -Math.PI / 2 : Math.PI / 2, half > 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    c.closePath();
    c.fillStyle = flesh;
    c.fill();
  } else {
    circle(c, 0, 0, r, skin);
    circle(c, -r * 0.3, -r * 0.3, r * 0.25, "rgba(255,255,255,.35)");
    if (kind === "pineapple") line(c, 0, -r, 0, -r * 1.5, "#2f9e44", 4);
    if (kind === "apple" || kind === "mango") line(c, 0, -r, r * 0.2, -r * 1.3, "#5c3d22", 3);
  }
  c.restore();
}

/** A bomb with a lit fuse. */
export function bomb(c: C, x: number, y: number, r: number, t: number) {
  circle(c, x, y, r, "#212529");
  circle(c, x - r * 0.3, y - r * 0.3, r * 0.2, "rgba(255,255,255,.25)");
  line(c, x + r * 0.5, y - r * 0.7, x + r * 0.9, y - r * 1.1, "#868e96", 3);
  circle(c, x + r * 0.95, y - r * 1.15, r * (0.18 + 0.08 * Math.sin(t * 30)), "#ffd43b");
}

/** A car seen from above, pointing up (the way it drives). */
export function carTop(c: C, x: number, y: number, w: number, h: number, colour: string, kind: "car" | "police" | "taxi" | "bus" | "truck" = "car") {
  rrect(c, x - w / 2, y - h / 2, w, h, w * 0.25, colour);
  rrect(c, x - w * 0.36, y - h * 0.28, w * 0.72, h * 0.2, 3, "#a5d8ff");
  rrect(c, x - w * 0.36, y + h * 0.12, w * 0.72, h * 0.14, 3, "#74c0fc");
  if (kind === "police") {
    rrect(c, x - w * 0.3, y - h * 0.04, w * 0.3, h * 0.1, 2, "#e03131");
    rrect(c, x, y - h * 0.04, w * 0.3, h * 0.1, 2, "#1c7ed6");
  }
  if (kind === "taxi") rrect(c, x - w * 0.2, y - h * 0.05, w * 0.4, h * 0.1, 2, "#212529");
  circle(c, x - w * 0.32, y - h * 0.46, w * 0.09, "#fff3bf");
  circle(c, x + w * 0.32, y - h * 0.46, w * 0.09, "#fff3bf");
}

/** A simple person seen from the side: head, body, moving legs (phase t). */
export function runner(c: C, x: number, y: number, s: number, colour: string, t: number, pose: "run" | "swim" | "row" | "ride" | "stand" = "run") {
  c.save();
  c.translate(x, y);
  c.lineCap = "round";
  if (pose === "swim") {
    c.beginPath();
    c.ellipse(0, 0, s * 0.45, s * 0.12, 0, 0, Math.PI * 2);
    c.fillStyle = colour;
    c.fill();
    circle(c, s * 0.5, -s * 0.02, s * 0.12, "#f1c27d");
    const a = t * 8;
    line(c, s * 0.2, 0, s * 0.2 + Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.35, "#f1c27d", s * 0.08);
    line(c, -s * 0.4, 0, -s * 0.7, Math.sin(t * 16) * s * 0.1, "#f1c27d", s * 0.08);
    c.restore();
    return;
  }
  if (pose === "row") {
    rrect(c, -s * 0.8, s * 0.1, s * 1.6, s * 0.22, s * 0.1, "#8d5524");
    circle(c, 0, -s * 0.45, s * 0.13, "#f1c27d");
    line(c, 0, -s * 0.3, -s * 0.05, s * 0.1, colour, s * 0.16);
    const a = Math.sin(t * 6) * 0.6;
    line(c, 0, -s * 0.15, Math.cos(a) * s * 0.9, s * 0.35 + Math.sin(a) * s * 0.2, "#495057", s * 0.05);
    c.restore();
    return;
  }
  if (pose === "ride") {
    circle(c, -s * 0.4, s * 0.35, s * 0.25, "transparent", "#212529", s * 0.06);
    circle(c, s * 0.4, s * 0.35, s * 0.25, "transparent", "#212529", s * 0.06);
    line(c, -s * 0.4, s * 0.35, 0, 0, colour, s * 0.07);
    line(c, 0, 0, s * 0.4, s * 0.35, colour, s * 0.07);
    line(c, 0, -s * 0.05, s * 0.25, -s * 0.15, "#212529", s * 0.06);
    circle(c, -s * 0.05, -s * 0.6, s * 0.13, "#f1c27d");
    line(c, -s * 0.05, -s * 0.45, -s * 0.1, -s * 0.05, colour, s * 0.14);
    const a = t * 10;
    line(c, -s * 0.1, -s * 0.05, Math.cos(a) * s * 0.18, s * 0.15 + Math.sin(a) * s * 0.18, "#343a40", s * 0.07);
    c.restore();
    return;
  }
  const sw = pose === "stand" ? 0 : Math.sin(t * 14);
  circle(c, 0, -s * 0.78, s * 0.15, "#f1c27d");
  line(c, 0, -s * 0.62, 0, -s * 0.15, colour, s * 0.18);
  line(c, 0, -s * 0.5, sw * s * 0.3, -s * 0.25, "#f1c27d", s * 0.08);
  line(c, 0, -s * 0.5, -sw * s * 0.3, -s * 0.25, "#f1c27d", s * 0.08);
  line(c, 0, -s * 0.15, sw * s * 0.28, s * 0.3, "#343a40", s * 0.1);
  line(c, 0, -s * 0.15, -sw * s * 0.28, s * 0.3, "#343a40", s * 0.1);
  c.restore();
}

/** A horse galloping (side view) with its rider's colours. */
export function horse(c: C, x: number, y: number, s: number, colour: string, t: number) {
  c.save();
  c.translate(x, y);
  const g = Math.sin(t * 12);
  c.beginPath();
  c.ellipse(0, 0, s * 0.45, s * 0.2, 0, 0, Math.PI * 2);
  c.fillStyle = "#6b4226";
  c.fill();
  line(c, s * 0.35, -s * 0.05, s * 0.55, -s * 0.4, "#6b4226", s * 0.16);
  c.beginPath();
  c.ellipse(s * 0.62, -s * 0.42, s * 0.14, s * 0.08, 0.4, 0, Math.PI * 2);
  c.fill();
  for (const [lx, ph] of [[-0.3, 0], [-0.2, 1.5], [0.25, 3], [0.35, 4.5]] as const) {
    line(c, s * lx, s * 0.1, s * lx + Math.sin(t * 12 + ph) * s * 0.15, s * 0.45, "#5a3820", s * 0.06);
  }
  line(c, -s * 0.45, -s * 0.05, -s * 0.65, s * 0.1 + g * s * 0.05, "#3b2314", s * 0.06);
  circle(c, 0, -s * 0.5, s * 0.1, "#f1c27d");
  line(c, 0, -s * 0.4, s * 0.05, -s * 0.15, colour, s * 0.14);
  c.restore();
}

/** A coin (spins with t). */
export function coin(c: C, x: number, y: number, r: number, t = 0) {
  const sx = Math.max(0.15, Math.abs(Math.cos(t * 4)));
  c.save();
  c.translate(x, y);
  c.scale(sx, 1);
  circle(c, 0, 0, r, "#fcc419", "#e67700", 2);
  text(c, "₥", 0, 1, r * 1.1, "#e67700");
  c.restore();
}

/** A cut gem. */
export function gem(c: C, x: number, y: number, s: number, colour = "#66d9e8") {
  c.beginPath();
  c.moveTo(x - s * 0.5, y - s * 0.15);
  c.lineTo(x - s * 0.25, y - s * 0.45);
  c.lineTo(x + s * 0.25, y - s * 0.45);
  c.lineTo(x + s * 0.5, y - s * 0.15);
  c.lineTo(x, y + s * 0.5);
  c.closePath();
  c.fillStyle = colour;
  c.fill();
  c.strokeStyle = "rgba(255,255,255,.7)";
  c.lineWidth = 1.5;
  c.stroke();
  line(c, x - s * 0.5, y - s * 0.15, x + s * 0.5, y - s * 0.15, "rgba(255,255,255,.6)", 1);
}

/** A money bag. */
export function moneyBag(c: C, x: number, y: number, s: number) {
  c.beginPath();
  c.ellipse(x, y + s * 0.1, s * 0.4, s * 0.38, 0, 0, Math.PI * 2);
  c.fillStyle = "#c9a227";
  c.fill();
  rrect(c, x - s * 0.15, y - s * 0.4, s * 0.3, s * 0.2, 4, "#b08d1e");
  text(c, "₥", x, y + s * 0.12, s * 0.45, "#5c4a0b");
}

/** A boat or jet ski seen from above, pointing up. */
export function boatTop(c: C, x: number, y: number, w: number, h: number, colour: string) {
  c.beginPath();
  c.moveTo(x, y - h / 2);
  c.quadraticCurveTo(x + w / 2, y - h * 0.2, x + w / 2, y + h / 2);
  c.lineTo(x - w / 2, y + h / 2);
  c.quadraticCurveTo(x - w / 2, y - h * 0.2, x, y - h / 2);
  c.fillStyle = colour;
  c.fill();
  circle(c, x, y + h * 0.1, w * 0.18, "#f1c27d");
}

/** A fish (for fishing): faces right. */
export function fish(c: C, x: number, y: number, s: number, colour = "#4dabf7", dir = 1) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.beginPath();
  c.ellipse(0, 0, s * 0.45, s * 0.22, 0, 0, Math.PI * 2);
  c.fillStyle = colour;
  c.fill();
  c.beginPath();
  c.moveTo(-s * 0.4, 0);
  c.lineTo(-s * 0.65, -s * 0.2);
  c.lineTo(-s * 0.65, s * 0.2);
  c.closePath();
  c.fill();
  circle(c, s * 0.25, -s * 0.05, s * 0.05, "#fff");
  c.restore();
}

/** A space invader-style alien (two frames). */
export function alien(c: C, x: number, y: number, s: number, colour: string, frame: number) {
  const px = s / 8;
  const rows = frame % 2
    ? ["00100100", "00011000", "00111100", "01011010", "11111111", "10111101", "10100101", "00100100"]
    : ["00100100", "10011001", "10111101", "11011011", "11111111", "01111110", "00100100", "01000010"];
  c.fillStyle = colour;
  rows.forEach((r, j) => {
    for (let i = 0; i < 8; i++) if (r[i] === "1") c.fillRect(x - s / 2 + i * px, y - s / 2 + j * px, px + 0.5, px + 0.5);
  });
}

/** A playing-card face (rank and suit text). */
export function cardFace(c: C, x: number, y: number, w: number, h: number, label: string, red: boolean) {
  rrect(c, x - w / 2, y - h / 2, w, h, 6, "#fff", "#adb5bd", 1);
  text(c, label, x, y, h * 0.32, red ? "#e03131" : "#212529");
}

/** A star. */
export function star(c: C, x: number, y: number, r: number, fill: string) {
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Floating "+3" style text that rises and fades (age 0 to 1). */
export function popText(c: C, s: string, x: number, y: number, age: number, colour = "#ffd43b") {
  c.globalAlpha = Math.max(0, 1 - age);
  text(c, s, x, y - age * 30, 16, colour);
  c.globalAlpha = 1;
}

/** Sky-to-ground background for outdoor scenes. */
export function sky(c: C, w: number, h: number, top = "#74c0fc", bottom = "#d0ebff") {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}
