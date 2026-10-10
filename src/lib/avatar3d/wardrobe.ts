// What an avatar is wearing, worked out from its recipe: a one-piece outfit, or separates (a top
// and a bottom), with an optional outer layer, and shoes. Option 0 of each wardrobe list means
// "whatever the outfit already had", so recipes saved before the wardrobe existed look the same.

import { BOTTOMS, type BottomStyle, LAYERS, type LayerStyle, OUTFITS, type Outfit, SHOES, type ShoeStyle, TOPS, type TopStyle } from "./catalog.ts";
import type { MatKey } from "./parts.ts";
import type { Recipe } from "./recipe.ts";

export type Look = {
  /**
   * The outfit. For separates its sleeve style and hood come from the top, so the shared pieces
   * (sleeves, hood) work the same way for both.
   */
  O: Outfit;
  /** The top, for separates (null for one-piece outfits, which make their own). */
  top: TopStyle | null;
  /** What is on the hips and legs (null when the outfit covers them itself: dresses, swimwear). */
  bottom: BottomStyle | null;
  /** Its material: the bottom colour, the top's fabric (matching suits and kaftans), denim or a native print. */
  bottomMat: MatKey;
  layer: LayerStyle | null;
  shoe: ShoeStyle;
};

/** Default top for the separates outfits: T-shirt, long sleeve, hoodie. */
const OUTFIT_TOP = [1, 2, 3];
const TROUSERS = 1;

export function resolveLook(r: Recipe): Look {
  const base = OUTFITS[r.outfit];
  const sep = !!base.sep;
  const top = sep ? TOPS[r.topStyle || OUTFIT_TOP[r.outfit]] : null;
  const O: Outfit = top ? { ...base, sl: top.sl ?? base.sl, hood: top.hood } : base;
  let bottom: BottomStyle | null = null, match = false;
  if (sep) bottom = BOTTOMS[r.bottomStyle || TROUSERS];
  else if (base.tunic || base.jalab || base.abaya || (base.suit && !base.pencil)) {
    // Robes and suits have trousers under them: matching the outfit unless a bottom is chosen.
    const chosen = BOTTOMS[r.bottomStyle];
    bottom = r.bottomStyle && chosen.kind !== "skirt" && !base.suit ? chosen : BOTTOMS[TROUSERS];
    match = !r.bottomStyle || !!base.suit;
  }
  const bottomMat: MatKey = !bottom ? "bottom" : match ? "top" : bottom.denim ? "jeans" : bottom.native ? "bottomPat" : "bottom";
  // A jacket goes over separates and dresses, not over robes, suits or swimwear.
  const layer = r.layer && (sep || base.skirt || base.cute || base.mini) ? LAYERS[r.layer] : null;
  const shoe = r.shoes ? SHOES[r.shoes] : SHOES[base.shoe === "light" ? 1 : 2];
  return { O, top, bottom, bottomMat, layer, shoe };
}
