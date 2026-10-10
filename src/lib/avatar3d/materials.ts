// Materials (colour, shine, textures) for an avatar's parts. Made on the page, not in the worker,
// because textures are drawn on a canvas. Materials for the same recipe colours are shared.

import {
  BackSide, CanvasTexture, Color, DoubleSide, FrontSide, type Material, type Side, MeshBasicMaterial, MeshStandardMaterial,
  type MeshStandardMaterialParameters, NoColorSpace, RepeatWrapping, SRGBColorSpace,
} from "three";
import { BOTTOM_COLORS, CHAINS, CLOTH_COLORS, HAIR_COLORS, IRIS, SHOE_COLORS, SKINS, WATCHES } from "./catalog.ts";
import { resolveLook } from "./wardrobe.ts";
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
    // Kente (Ghana): narrow woven strips sewn side by side. Each strip alternates blocks of bold
    // weft bars with plainer warp-striped blocks, and neighbouring strips are offset by a block, so
    // the cloth reads as a checkerboard of motifs. Gold, green, red and black, with the chosen colour.
    const GOLD = "#E2A92B", GREEN = "#1E7A3C", RED = "#B8262B", BLACK = "#141414", strip = 32, block = 42;
    for (let sx = 0; sx < 256 / strip; sx++) {
      for (let by = -1; by < 256 / block + 1; by++) {
        const x0 = sx * strip, y0 = by * block + (sx % 2) * (block / 2), motif = (sx + by) % 2 === 0;
        if (motif) {
          // Weft-faced block: stacked bars across the strip.
          const bars = [GOLD, BLACK, GREEN, BLACK, RED, BLACK, GOLD];
          bars.forEach((c, k) => {
            x.fillStyle = c;
            x.fillRect(x0, y0 + (k * block) / bars.length, strip, block / bars.length + 0.5);
          });
          x.fillStyle = hex;
          x.fillRect(x0 + strip / 2 - 3, y0 + 4, 6, block - 8);
        } else {
          // Warp-faced block: the base colour with fine lengthwise stripes.
          x.fillStyle = hex;
          x.fillRect(x0, y0, strip, block);
          for (const [dx, c] of [[4, GOLD], [9, GREEN], [strip - 11, RED], [strip - 6, GOLD]] as const) {
            x.fillStyle = c;
            x.fillRect(x0 + dx, y0, 2, block);
          }
        }
      }
      // The seam between strips.
      x.fillStyle = "rgba(0,0,0,.35)";
      x.fillRect(sx * strip, 0, 1, 256);
    }
  } else {
    for (let i = 0; i < 256; i += 16) {
      x.fillStyle = "rgba(255,255,255,.28)";
      x.fillRect(i, 0, 2, 256);
    }
  }
  // Kente's woven blocks are large; the other patterns repeat smaller.
  return kind === 2 ? texture(c, 3, 2) : texture(c, 5, 3);
}

/** Fine strands for straighter hair (grey streaks, tinted by the hair colour). */
function strandTexture() {
  const [c, x] = canvas(256, 64);
  let seed = 3;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = "#d9d9d9";
  x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 420; i++) {
    const v = 140 + Math.floor(r() * 115);
    x.fillStyle = `rgba(${v},${v},${v},.55)`;
    x.fillRect(r() * 256, 0, 1 + r() * 1.5, 64);
  }
  return texture(c, 6, 1);
}

/** Tiny coils and kinks, as a bump map: makes coily hair read as hair rather than a smooth shell. */
function coilTexture() {
  const [c, x] = canvas(256, 256);
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = "#808080";
  x.fillRect(0, 0, 256, 256);
  x.lineWidth = 2;
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(70 + r() * 140);
    x.strokeStyle = `rgb(${v},${v},${v})`;
    x.beginPath();
    x.arc(r() * 256, r() * 256, 2 + r() * 4, r() * 6.3, r() * 6.3 + 3 + r() * 3);
    x.stroke();
  }
  const t = texture(c, 10, 6);
  t.colorSpace = NoColorSpace; // a height map, not a colour
  return t;
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

/** Denim: a diagonal twill weave with faint fading, in the given colour. */
function denimTexture(hex: string) {
  const [c, x] = canvas(128, 128);
  x.fillStyle = hex;
  x.fillRect(0, 0, 128, 128);
  let seed = 5;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.lineWidth = 1;
  for (let i = -128; i < 128; i += 3) {
    x.strokeStyle = `rgba(255,255,255,${0.06 + r() * 0.06})`;
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 128, 128);
    x.stroke();
  }
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
    x.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1);
  }
  return texture(c, 8, 8);
}

/** Native embroidery: a dark band with gold geometric stitching and a thin line of the cloth's colour. */
function embroideryTexture(hex: string) {
  const [c, x] = canvas(128, 64);
  x.fillStyle = "#1A1410";
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = "#D9B45A";
  for (let i = 0; i < 8; i++) {
    const cx = i * 16 + 8;
    x.beginPath();
    x.moveTo(cx, 12);
    x.lineTo(cx + 7, 32);
    x.lineTo(cx, 52);
    x.lineTo(cx - 7, 32);
    x.closePath();
    x.fill();
    x.fillStyle = "#1A1410";
    x.fillRect(cx - 2, 28, 4, 8);
    x.fillStyle = "#D9B45A";
  }
  x.fillRect(0, 3, 128, 3);
  x.fillRect(0, 58, 128, 3);
  x.fillStyle = hex;
  x.fillRect(0, 0, 128, 2);
  x.fillRect(0, 62, 128, 2);
  return texture(c, 6, 1);
}

export type MaterialSet = { get(key: MatKey): Material; dispose(): void };

/** All materials one avatar needs. Call dispose() when the avatar is removed. */
export function makeMaterials(r: Recipe): MaterialSet {
  const skin = new Color(SKINS[r.skin].c), hair = new Color(HAIR_COLORS[r.hairC].c);
  const topHex = CLOTH_COLORS[r.top].c, wrapPattern = r.hair === 11 ? patternTexture(topHex, r.pattern) : null;
  const hwHex = CLOTH_COLORS[r.hwC].c, hwPattern = r.hw === 2 || r.hw === 3 ? patternTexture(hwHex, r.pattern) : null;
  const topC = new Color(topHex), topPattern = patternTexture(topHex, r.pattern), bottomC = new Color(BOTTOM_COLORS[r.bottom].c);
  const W = WATCHES[r.watch], chainHex = CHAINS[r.chain].c ?? "#D9A94E", look = resolveLook(r);
  const shoeHex = r.shoeC ? SHOE_COLORS[r.shoeC].c : look.shoe.c ?? "#2A1C14", soleHex = look.shoe.sole ?? "#120C08";
  const L = look.layer, layerC = new Color(CLOTH_COLORS[r.layerC].c), bottomPattern = patternTexture(BOTTOM_COLORS[r.bottom].c, r.pattern || 1);
  const layerMap = L?.denim ? denimTexture(CLOTH_COLORS[r.layerC].c) : null;
  const layerMat = (side: Side, tint = 1) =>
    std(layerMap ? new Color(tint, tint, tint) : layerC.clone().multiplyScalar(tint), L?.leather ? 0.38 : 0.8, { side, map: layerMap });
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
      case "hair": return std(hair, 0.86, { side: DoubleSide, bumpMap: coilTexture(), bumpScale: 2.5 });
      case "hairStrand": return std(hair, 0.5, { side: DoubleSide, map: strandTexture() });
      // A hairstyle's body: see-through by a set amount per point (each point's alpha), so the scalp
      // shows through towards the hairline and down a fade.
      case "hairBody": return std(hair, 0.86, { side: DoubleSide, bumpMap: coilTexture(), bumpScale: 2.5, transparent: true, vertexColors: true });
      case "hairBodyStrand": return std(hair, 0.5, { side: DoubleSide, map: strandTexture(), transparent: true, vertexColors: true });
      case "hairTie": return std(new Color(topHex).multiplyScalar(0.6), 0.8);
      // The headwrap hairstyle is made of the same fabric as the top.
      case "wrap": return std(wrapPattern ? "#ffffff" : topHex, 0.8, { side: DoubleSide, map: wrapPattern });
      // Fingernails: pale pink-beige tinted by the skin, a little glossy.
      case "nail": return std(new Color("#E9C9B4").lerp(skin, 0.5), 0.3);
      // Clothes. The top's fabric carries the chosen pattern; topDS is the same cloth seen from both sides.
      case "top": return std(topPattern ? "#ffffff" : topC, 0.8, { map: topPattern });
      case "topDS": return std(topPattern ? "#ffffff" : topC, 0.8, { map: topPattern, side: DoubleSide });
      // Ribbed knit collar: a little darker than the top, matt.
      case "rib": return std(topPattern ? new Color(0.93, 0.93, 0.93) : topC.clone().multiplyScalar(0.93), 0.9, { side: DoubleSide, map: topPattern });
      case "topEdgeDS": return std(topC.clone().multiplyScalar(0.8), 0.6, { side: DoubleSide });
      case "topEdge": return std(topC.clone().multiplyScalar(0.8), 0.6);
      case "trim": return std(topC.clone().multiplyScalar(0.6), 0.75);
      case "lapel": return std(topC.clone().multiplyScalar(0.75), 0.6);
      case "sash": return std(topC.clone().lerp(new Color("#ffffff"), 0.75), 0.7, { side: DoubleSide });
      case "bottom": return std(bottomC, 0.85);
      case "bottomDark": return std(bottomC.clone().multiplyScalar(0.6), 0.85);
      case "shirt": return std("#F4F2EE", 0.7);
      case "tie": return std("#7A1F2B", 0.55);
      case "collarWhite": return std("#FFFFFF", 0.7, { side: DoubleSide });
      case "shoe": return std(shoeHex, look.shoe.kind === "heel" || look.shoe.kind === "dress" ? 0.3 : 0.6);
      case "shoeDS": return std(shoeHex, look.shoe.kind === "heel" ? 0.3 : 0.6, { side: DoubleSide });
      case "sole": return std(soleHex, 0.8);
      // Bottoms: denim, a native print (wrapper, sokoto: the chosen pattern, or Ankara), skirts seen from both sides.
      case "jeans": return std("#ffffff", 0.9, { map: denimTexture(BOTTOM_COLORS[r.bottom].c) });
      case "jeansDark": return std(bottomC.clone().multiplyScalar(0.55), 0.9);
      case "bottomPat": return std("#ffffff", 0.8, { map: bottomPattern });
      case "bottomPatDS": return std("#ffffff", 0.8, { map: bottomPattern, side: DoubleSide });
      case "bottomDS": return std(bottomC, 0.85, { side: DoubleSide });
      // Outer layer: its colour; leather is smoother and shinier; denim has its weave.
      case "layer": return layerMat(FrontSide);
      case "layerDS": return layerMat(DoubleSide);
      case "layerTrim": return layerMat(DoubleSide, 0.78);
      case "layerRib": return std(layerC.clone().multiplyScalar(0.82), 0.9, { side: DoubleSide });
      // Embroidery on native tops: gold thread on a dark band.
      case "embroid": return std("#ffffff", 0.55, { map: embroideryTexture(topHex), metalness: 0.15, side: DoubleSide });
      // Jewellery.
      case "watchBand": return std(W.band ?? "#1B1B1E", W.metal ? 0.3 : 0.7, { metalness: W.metal ? 0.85 : 0 });
      case "watchCase": return std(W.metal ? W.band! : "#2A2A2E", 0.3, { metalness: 0.85 });
      case "watchFace": return std(W.face ?? "#ffffff", 0.3, W.screen ? { emissive: new Color("#1E8A7A"), emissiveIntensity: 0.6 } : {});
      case "chainMetal": return std(chainHex, 0.22, { metalness: 0.95 });
      // A flat medallion: less mirror-like than the chain, or with nothing to reflect it looks black.
      case "medal": return std(chainHex, 0.38, { metalness: 0.55 });
      case "iced": return std("#ffffff", 0.08, { metalness: 0.4, emissive: new Color("#BFD9FF"), emissiveIntensity: 0.35 });
      case "gem": return std("#2E6FD8", 0.1, { metalness: 0.3 });
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
