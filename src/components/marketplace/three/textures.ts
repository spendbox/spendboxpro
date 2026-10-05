import * as THREE from "three";

// Pictures for the 3D scenes, drawn in code (no image downloads): shop signs,
// striped awnings, roads, floors and chalkboards.

/** The app's display font, when it has loaded (canvas can use page fonts by name). */
export function fontFamily(kind: "display" | "body") {
  if (typeof document === "undefined") return "system-ui, sans-serif";
  const name = getComputedStyle(document.documentElement).getPropertyValue(kind === "display" ? "--font-display-face" : "--font-body").trim();
  return name ? `${name}, system-ui, sans-serif` : "system-ui, sans-serif";
}

export function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}

export function toTexture(c: HTMLCanvasElement, repeat?: [number, number]) {
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

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: number, family: string) {
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

/**
 * The nameplate on the front of the counter: a deep lacquered panel in the
 * shop's colour, a fine gold border inset from the edge, the logo (or
 * initials) in a gold ring, and the name in gold with room to breathe.
 */
export function counterPlaqueTexture(name: string, color: string, logoUrl: string | null) {
  const W = 1200;
  const H = 280;
  const { c, ctx } = canvas(W, H);
  const display = fontFamily("display");
  // Lacquer: the shop's colour, deepened, with a soft sheen across the top.
  const deep = shade(color, -0.55);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, shade(color, -0.38));
  bg.addColorStop(0.55, deep);
  bg.addColorStop(1, shade(color, -0.65));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  sheen.addColorStop(0, "rgba(255,255,255,0.10)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H * 0.5);
  // Gold, as a gradient so it catches the light.
  const gold = ctx.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, "#f3d58a");
  gold.addColorStop(0.45, "#c9a24e");
  gold.addColorStop(0.7, "#f6e1a6");
  gold.addColorStop(1, "#b88c3a");
  // A fine double border, well inside the edge.
  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  roundRect(ctx, 26, 26, W - 52, H - 52, 18);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundRect(ctx, 38, 38, W - 76, H - 76, 12);
  ctx.stroke();
  // The badge: a gold ring with the initials (the logo replaces them when it loads).
  const bx = 150;
  const by = H / 2;
  const br = 74;
  ctx.beginPath();
  ctx.arc(bx, by, br + 7, 0, Math.PI * 2);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = shade(color, -0.25);
  ctx.fill();
  ctx.fillStyle = "#f6e1a6";
  ctx.font = `800 64px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials(name), bx, by + 3);
  // A thin gold rule between the badge and the name.
  ctx.fillStyle = gold;
  ctx.fillRect(bx + br + 42, by - 46, 3, 92);
  // The name, letter-spaced, in the room that's left.
  const left = bx + br + 80;
  const room = W - left - 90;
  const text = name.toUpperCase();
  ctx.textAlign = "left";
  let size = 96;
  const spacing = (s: number) => s * 0.08;
  const widthAt = (s: number) => {
    ctx.font = `800 ${s}px ${display}`;
    return ctx.measureText(text).width + spacing(s) * Math.max(0, text.length - 1);
  };
  while (size > 30 && widthAt(size) > room) size -= 2;
  ctx.font = `800 ${size}px ${display}`;
  const sp = spacing(size);
  // Gently shadowed so the gold reads as raised lettering.
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 6;
  ctx.fillStyle = gold;
  let x = left + Math.max(0, (room - widthAt(size)) / 2);
  for (const ch of text) {
    ctx.fillText(ch, x, by + 4);
    x += ctx.measureText(ch).width + sp;
  }
  ctx.shadowColor = "transparent";
  const texture = toTexture(c);
  texture.anisotropy = 8;
  drawLogoWhenReady(
    logoUrl,
    (img) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, br - 4, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      const s = Math.max((br * 2) / img.width, (br * 2) / img.height);
      ctx.drawImage(img, bx - (img.width * s) / 2, by - (img.height * s) / 2, img.width * s, img.height * s);
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

export { shade };
