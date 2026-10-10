// Materials (colour, shine, textures) for an avatar's parts. Made on the page, not in the worker,
// because textures are drawn on a canvas. Materials for the same recipe colours are shared.

import {
  BackSide, CanvasTexture, Color, DoubleSide, type Material, MeshBasicMaterial, MeshStandardMaterial,
  type MeshStandardMaterialParameters, SRGBColorSpace,
} from "three";
import { HAIR_COLORS, IRIS, SKINS } from "./catalog.ts";
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

export type MaterialSet = { get(key: MatKey): Material; dispose(): void };

/** All materials one avatar needs. Call dispose() when the avatar is removed. */
export function makeMaterials(r: Recipe): MaterialSet {
  const skin = new Color(SKINS[r.skin].c), hair = new Color(HAIR_COLORS[r.hairC].c);
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
