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
