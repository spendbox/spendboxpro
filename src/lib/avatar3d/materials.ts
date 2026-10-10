// Materials (colour, shine, textures) for an avatar's parts. Made on the page, not in the worker,
// because textures are drawn on a canvas. Materials for the same recipe colours are shared.

import {
  BackSide, CanvasTexture, Color, DoubleSide, type Material, MeshBasicMaterial, MeshStandardMaterial,
  type MeshStandardMaterialParameters, RepeatWrapping, SRGBColorSpace,
} from "three";
import { CLOTH_COLORS, HAIR_COLORS, IRIS, SKINS } from "./catalog.ts";
import type { MatKey } from "./parts.ts";
import type { Recipe } from "./recipe.ts";

/** Soft warm glow under the skin (a cheap stand-in for light scattering through skin). */
const SKIN_GLOW = { emissive: new Color("#3a1006"), emissiveIntensity: 0.14 };

function std(color: Color | string, roughness: number, extra: MeshStandardMaterialParameters = {}) {
  return new MeshStandardMaterial({ color: color instanceof Color ? color : new Color(color), roughness, metalness: 0, ...extra });
}

/** Iris: radial fibres, a dark pupil and a darker limbal ring. Drawn in strips because the iris cap's UVs run around it. */
function irisTexture(hex: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const x = c.getContext("2d")!;
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = hex;
  x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 170; i++) {
    const light = r() > 0.45;
    x.fillStyle = light ? `rgba(255,226,180,${0.05 + r() * 0.14})` : `rgba(0,0,0,${0.08 + r() * 0.18})`;
    x.fillRect(r() * 256, 30 + r() * 20, 1 + r() * 2.5, 50 + r() * 45);
  }
  x.fillStyle = "rgba(255,210,150,.16)";
  x.fillRect(0, 30, 256, 16);
  x.fillStyle = "#050302";
  x.fillRect(0, 0, 256, 30);
  let g = x.createLinearGradient(0, 28, 0, 40);
  g.addColorStop(0, "rgba(5,3,2,1)");
  g.addColorStop(1, "rgba(5,3,2,0)");
  x.fillStyle = g;
  x.fillRect(0, 28, 256, 12);
  g = x.createLinearGradient(0, 94, 0, 128);
  g.addColorStop(0, "rgba(8,4,2,0)");
  g.addColorStop(0.7, "rgba(8,4,2,.85)");
  g.addColorStop(1, "rgba(8,4,2,.95)");
  x.fillStyle = g;
  x.fillRect(0, 94, 256, 34);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, rx: number, ry: number) {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Fabric patterns (PATTERNS: 1 Ankara, 2 Kente, 3 pinstripe) drawn over a base colour; null for plain. */
function patternTexture(hex: string, kind: number) {
  if (!kind) return null;
  const [c, x] = canvas(256, 256);
  x.fillStyle = hex;
  x.fillRect(0, 0, 256, 256);
  if (kind === 1) {
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const cx = gx * 64 + 32 + (gy % 2) * 32, cy = gy * 64 + 32;
        for (const [rr, cc] of [[28, "#E0A82E"], [21, "#F3E7CC"], [14, hex], [8, "#1B1B1B"]] as const) {
          x.fillStyle = cc;
          x.beginPath();
          x.arc(cx % 256, cy, rr, 0, Math.PI * 2);
          x.fill();
        }
        x.fillStyle = "#1B1B1B";
        x.beginPath();
        x.moveTo(gx * 64, gy * 64);
        x.lineTo(gx * 64 + 7, gy * 64 + 7);
        x.lineTo(gx * 64, gy * 64 + 14);
        x.lineTo(gx * 64 - 7, gy * 64 + 7);
        x.fill();
      }
    }
  } else if (kind === 2) {
    const band = ["#E0A82E", "#1F6B3A", "#A8282A"];
    for (let i = 0; i < 8; i++) {
      if (!(i % 2)) continue;
      x.fillStyle = band[(i >> 1) % 3];
      x.fillRect(i * 32 + 6, 0, 20, 256);
      for (let j = 0; j < 16; j++) {
        x.fillStyle = j % 2 ? "#151515" : hex;
        x.fillRect(i * 32 + 6, j * 16, 20, 6);
      }
    }
    for (let j = 0; j < 8; j++) {
      x.fillStyle = "rgba(224,168,46,.55)";
      x.fillRect(0, j * 32 + 14, 256, 4);
    }
  } else {
    for (let i = 0; i < 256; i += 16) {
      x.fillStyle = "rgba(255,255,255,.28)";
      x.fillRect(i, 0, 2, 256);
    }
  }
  return texture(c, 5, 3);
}

/** Kufi: cap colour with a gold embroidered band at the rim and a light dotted pattern. */
function kufiTexture(hex: string) {
  const [c, x] = canvas(256, 128);
  x.fillStyle = hex;
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = "#D9B45A";
  x.fillRect(0, 104, 256, 14);
  for (let i = 0; i < 16; i++) {
    x.beginPath();
    x.moveTo(i * 16 + 2, 100);
    x.lineTo(i * 16 + 8, 86);
    x.lineTo(i * 16 + 14, 100);
    x.fill();
  }
  x.globalAlpha = 0.25;
  x.fillStyle = "#ffffff";
  for (let i = 0; i < 32; i++) x.fillRect(i * 8, 20 + (i % 2) * 14, 3, 3);
  return texture(c, 6, 1);
}

export type MaterialSet = { get(key: MatKey): Material; dispose(): void };

/** All materials one avatar needs. Call dispose() when the avatar is removed. */
export function makeMaterials(r: Recipe): MaterialSet {
  const skin = new Color(SKINS[r.skin].c), hair = new Color(HAIR_COLORS[r.hairC].c);
  const hwHex = CLOTH_COLORS[r.hwC].c, hwPattern = r.hw === 2 || r.hw === 3 ? patternTexture(hwHex, r.pattern) : null;
  const made = new Map<MatKey, Material>();
  const make = (key: MatKey): Material => {
    switch (key) {
      case "skin": return std(skin, 0.56, SKIN_GLOW);
      // Same shine as the head skin, so the face patch's edge doesn't show.
      case "skinVC": return std("#ffffff", 0.56, { ...SKIN_GLOW, vertexColors: true });
      case "earVC": return std("#ffffff", 0.56, { ...SKIN_GLOW, vertexColors: true, side: DoubleSide });
      case "lidVC": return std("#ffffff", 0.55, { ...SKIN_GLOW, vertexColors: true, side: DoubleSide });
      case "sclera": return std("#ffffff", 0.3, { vertexColors: true });
      case "iris": return std("#ffffff", 0.25, { map: irisTexture(IRIS[r.eyeC].c) });
      case "cornea": return std("#ffffff", 0.03, { transparent: true, opacity: 0.12, depthWrite: false });
      case "catchlight": return new MeshBasicMaterial({ color: 0xffffff });
      case "caruncle": return std("#B46E66", 0.5);
      // Grey hair keeps darker brows, as it does in life.
      case "brow": return std(hair.clone().multiplyScalar(r.hairC === 5 ? 0.8 : 1), 0.9);
      case "mouthCavity": return std("#1E0A08", 0.9, { side: BackSide });
      case "teeth": return std("#EEE7DA", 0.35, { side: DoubleSide });
      case "tongue": return std("#8E3B3B", 0.45);
      case "gold": return std("#D9A94E", 0.28, { metalness: 0.9 });
      case "glassesFrame": return std("#1A1512", 0.4);
      case "lens": return std("#0D1013", 0.08, { transparent: true, opacity: 0.82 });
      case "beard": return std(hair, 0.72);
      // Stubble: a faint, see-through shadow of hair (each point's alpha fades it out at the edges).
      case "stubble": return std(hair, 0.95, { transparent: true, opacity: 0.4, depthWrite: false, vertexColors: true });
      // Headwear fabric: the gele is stiff and a little shiny; patterns show on head ties and gele.
      case "hw": return std(hwPattern ? "#ffffff" : hwHex, r.hw === 3 ? 0.38 : 0.75, { side: DoubleSide, map: hwPattern, metalness: r.hw === 3 ? 0.25 : 0 });
      case "hwDark": return std(new Color(hwHex).multiplyScalar(0.62), 0.8);
      case "hwSheen": return std(new Color(hwHex).lerp(new Color("#ffffff"), 0.25), 0.32, { side: DoubleSide, metalness: 0.3 });
      case "kufi": return std("#ffffff", 0.7, { side: DoubleSide, map: kufiTexture(hwHex) });
    }
  };
  return {
    get(key) {
      let m = made.get(key);
      if (!m) made.set(key, (m = make(key)));
      return m;
    },
    dispose() {
      for (const m of made.values()) {
        const map = (m as MeshStandardMaterial).map;
        if (map) map.dispose();
        m.dispose();
      }
      made.clear();
    },
  };
}
