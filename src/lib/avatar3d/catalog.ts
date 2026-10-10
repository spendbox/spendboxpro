// The option lists the 3D avatar is built from. A player's avatar is saved as a recipe: one index
// into each of these lists (see recipe.ts).
//
// APPEND ONLY. A saved recipe points at entries by position, so never reorder, rename the id of,
// or delete an entry: add new ones at the end. tests/catalog-lock.ts holds the frozen order and the
// tests fail if an existing entry moves. Shape numbers (w, h, tilt, ...) may be tuned freely.
//
// Shape numbers come from the reference prototype (avatar-reference/newtown-avatar-studio).

export type Option = { id: string; n: string };
export type Swatch = Option & { c: string };

export const FACES = [
  { id: "oval", n: "Oval", w: 0.86, h: 1.08, d: 0.95, jaw: 0.32, chin: 0.1, cheek: 0.04, fore: 0.1 },
  { id: "round", n: "Round", w: 0.92, h: 1.0, d: 0.96, jaw: 0.18, chin: 0.0, cheek: 0.11, fore: 0.05 },
  { id: "square", n: "Square", w: 0.92, h: 1.04, d: 0.95, jaw: 0.1, chin: 0.03, cheek: 0.02, fore: 0.02, sq: 0.22 },
  { id: "heart", n: "Heart", w: 0.9, h: 1.06, d: 0.94, jaw: 0.46, chin: 0.12, cheek: 0.08, fore: 0 },
  { id: "long", n: "Long", w: 0.82, h: 1.15, d: 0.94, jaw: 0.28, chin: 0.12, cheek: 0, fore: 0.08 },
  { id: "diamond", n: "Diamond", w: 0.88, h: 1.08, d: 0.95, jaw: 0.4, chin: 0.1, cheek: 0.14, fore: 0.18 },
  { id: "wide", n: "Wide", w: 0.98, h: 1.0, d: 0.96, jaw: 0.22, chin: 0.02, cheek: 0.08, fore: 0.06 },
  { id: "soft-square", n: "Soft square", w: 0.9, h: 1.05, d: 0.95, jaw: 0.2, chin: 0.06, cheek: 0.06, fore: 0.04, sq: 0.12 },
];

export const CHINS = [
  { id: "soft", n: "Soft", fwd: 0.08, bump: 0.03, w: 0.24, p: 2 },
  { id: "rounded", n: "Rounded", fwd: 0.12, bump: 0.045, w: 0.26, p: 2 },
  { id: "pointed", n: "Pointed", fwd: 0.1, bump: 0.04, w: 0.15, p: 2, point: 0.15, drop: 0.012 },
  { id: "square", n: "Square", fwd: 0.12, bump: 0.04, w: 0.3, p: 4 },
  { id: "strong", n: "Strong", fwd: 0.17, bump: 0.055, w: 0.3, p: 3 },
  { id: "receding", n: "Receding", fwd: 0.02, bump: 0.015, w: 0.24, p: 2 },
  { id: "cleft", n: "Cleft", fwd: 0.12, bump: 0.045, w: 0.27, p: 2, cleft: 1 },
  { id: "long", n: "Long", fwd: 0.1, bump: 0.04, w: 0.24, p: 2, drop: 0.035 },
];

/** Face and body fullness. f is how much soft tissue is added (negative = leaner). */
export const FULLNESS = [
  { id: "slim", n: "Slim", f: -0.5 },
  { id: "average", n: "Average", f: 0 },
  { id: "full", n: "Full", f: 0.55 },
  { id: "chubby", n: "Chubby", f: 1 },
];

// Prototype order kept; lighter tones appended so older 2D avatars keep their skin tone.
export const SKINS: Swatch[] = [
  { id: "ebony", n: "Ebony", c: "#3A2118" },
  { id: "espresso", n: "Espresso", c: "#4A2B1E" },
  { id: "cocoa", n: "Cocoa", c: "#5B3725" },
  { id: "chestnut", n: "Chestnut", c: "#6C432F" },
  { id: "mahogany", n: "Mahogany", c: "#7E5039" },
  { id: "pecan", n: "Pecan", c: "#915E43" },
  { id: "caramel", n: "Caramel", c: "#A66E4E" },
  { id: "honey", n: "Honey", c: "#BA835E" },
  { id: "sand", n: "Sand", c: "#CE9B77" },
  { id: "ivory", n: "Ivory", c: "#E1B895" },
  { id: "fair", n: "Fair", c: "#EECBB0" },
  { id: "porcelain", n: "Porcelain", c: "#F6DCC8" },
];

/** a/b = lid cover, sx/sy = opening stretch, tilt = outer-corner lift, s = eyeball size. */
export const EYES = [
  { id: "almond", n: "Almond", a: 0.4, b: 0.36, sx: 1.12, sy: 0.92, tilt: 0.06, s: 1 },
  { id: "round", n: "Round", a: 0.25, b: 0.3, sx: 1, sy: 1, tilt: 0, s: 1.03 },
  { id: "hooded", n: "Hooded", a: 0.5, b: 0.36, sx: 1.08, sy: 0.95, tilt: 0.02, s: 1 },
  { id: "upturned", n: "Upturned", a: 0.42, b: 0.4, sx: 1.12, sy: 0.9, tilt: 0.16, s: 1 },
  { id: "downturned", n: "Downturned", a: 0.4, b: 0.34, sx: 1.1, sy: 0.92, tilt: -0.12, s: 1 },
  { id: "wide", n: "Wide", a: 0.3, b: 0.3, sx: 1.15, sy: 1, tilt: 0.03, s: 1.08 },
  { id: "narrow", n: "Narrow", a: 0.54, b: 0.46, sx: 1.15, sy: 0.85, tilt: 0.05, s: 0.95 },
  { id: "deep-set", n: "Deep-set", a: 0.46, b: 0.38, sx: 1.05, sy: 0.92, tilt: 0, s: 0.95, depth: 0.025 },
];

export const IRIS: Swatch[] = [
  { id: "dark-brown", n: "Dark brown", c: "#2A150A" },
  { id: "brown", n: "Brown", c: "#4A2812" },
  { id: "hazel", n: "Hazel", c: "#6B4A1F" },
  { id: "amber", n: "Amber", c: "#80571F" },
  { id: "green", n: "Green", c: "#3F5C38" },
  { id: "blue", n: "Blue", c: "#3C5A7C" },
  { id: "grey", n: "Grey", c: "#5D636B" },
];

/** Brow path: x0..x1 across the face, yb base height, h arch height peaking at p, th thickness, tp tail taper. */
export const BROWS = [
  { id: "natural", n: "Natural", x0: 0.12, x1: 0.55, yb: 0.25, rise: 0, h: 0.045, p: 0.62, drop: 1.1, th: 0.026, tp: 0.35 },
  { id: "straight-thick", n: "Straight thick", x0: 0.11, x1: 0.55, yb: 0.25, rise: 0.02, h: 0.012, p: 0.7, drop: 0.6, th: 0.036, tp: 0.5 },
  { id: "thin-arch", n: "Thin arch", x0: 0.14, x1: 0.55, yb: 0.25, rise: 0, h: 0.07, p: 0.6, drop: 1.4, th: 0.015, tp: 0.4 },
  { id: "high-arch", n: "High arch", x0: 0.13, x1: 0.54, yb: 0.24, rise: -0.01, h: 0.095, p: 0.68, drop: 1.6, th: 0.022, tp: 0.35 },
  { id: "angled", n: "Angled", x0: 0.12, x1: 0.55, yb: 0.23, rise: 0, h: 0.08, p: 0.72, drop: 2, th: 0.027, tp: 0.3 },
  { id: "bushy", n: "Bushy", x0: 0.1, x1: 0.57, yb: 0.25, rise: 0, h: 0.035, p: 0.6, drop: 1, th: 0.044, tp: 0.55 },
  { id: "rounded", n: "Rounded", x0: 0.13, x1: 0.54, yb: 0.24, rise: -0.02, h: 0.06, p: 0.5, drop: 1.6, th: 0.022, tp: 0.45 },
  { id: "short", n: "Short", x0: 0.15, x1: 0.47, yb: 0.26, rise: 0.01, h: 0.03, p: 0.6, drop: 1, th: 0.03, tp: 0.5 },
  { id: "low-flat", n: "Low flat", x0: 0.11, x1: 0.56, yb: 0.21, rise: 0, h: 0.015, p: 0.6, drop: 1, th: 0.032, tp: 0.45 },
];

/** w = nostril width, len = length, tip = tip size, proj = how far it sticks out, br = bridge width. */
export const NOSES = [
  { id: "button", n: "Button", w: 0.95, len: 0.85, tip: 0.9, proj: 0.8, br: 0.8 },
  { id: "small", n: "Small", w: 0.85, len: 0.9, tip: 0.8, proj: 0.9, br: 0.85 },
  { id: "straight", n: "Straight", w: 1, len: 1, tip: 0.95, proj: 1, br: 1 },
  { id: "wide", n: "Wide", w: 1.3, len: 0.95, tip: 1.05, proj: 0.85, br: 1.05 },
  { id: "broad", n: "Broad", w: 1.45, len: 0.9, tip: 1.15, proj: 0.8, br: 1.2 },
  { id: "long", n: "Long", w: 0.95, len: 1.2, tip: 0.95, proj: 1.1, br: 1 },
  { id: "pointed", n: "Pointed", w: 0.85, len: 1.1, tip: 0.8, proj: 1.25, br: 0.9 },
  { id: "round", n: "Round", w: 1.15, len: 0.95, tip: 1.25, proj: 0.95, br: 1 },
  { id: "flat-bridge", n: "Flat bridge", w: 1.25, len: 0.9, tip: 1.05, proj: 0.75, br: 0.75 },
];

/** w = width, up/low = upper/lower lip fullness, d = how far they stand out, bow = Cupid's bow. */
export const LIPS = [
  { id: "natural", n: "Natural", w: 1, up: 1, low: 1, d: 1 },
  { id: "full", n: "Full", w: 1.05, up: 1.35, low: 1.35, d: 1.15 },
  { id: "thin", n: "Thin", w: 0.95, up: 0.6, low: 0.7, d: 0.85 },
  { id: "wide", n: "Wide", w: 1.25, up: 1, low: 1, d: 1 },
  { id: "small", n: "Small", w: 0.8, up: 0.95, low: 1, d: 0.95 },
  { id: "heart", n: "Heart", w: 0.95, up: 1.15, low: 1.05, d: 1, bow: 1 },
  { id: "pouty", n: "Pouty", w: 0.95, up: 1.2, low: 1.45, d: 1.25 },
  { id: "broad-full", n: "Broad full", w: 1.2, up: 1.3, low: 1.4, d: 1.15, bow: 1 },
];

/** k = how strongly the tint is mixed into the skin tone. */
export const LIP_TINTS = [
  { id: "natural", n: "Natural", c: "#5A2A22", k: 0.42 },
  { id: "deep", n: "Deep", c: "#2C1310", k: 0.5 },
  { id: "rosy", n: "Rosy", c: "#A3474F", k: 0.45 },
  { id: "berry", n: "Berry", c: "#5C1830", k: 0.6 },
  { id: "nude", n: "Nude", c: "#A87562", k: 0.42 },
];

const named = (ids: string[], names: string[]): Option[] => ids.map((id, i) => ({ id, n: names[i] }));

export const HAIRS = named(
  ["bald", "buzz", "low-fade", "short-coils", "afro", "puff", "bun", "cornrows", "box-braids", "locs", "long", "headwrap", "ponytail"],
  ["Bald", "Buzz", "Low fade", "Short coils", "Afro", "Puff", "Bun", "Cornrows", "Box braids", "Locs", "Long", "Headwrap", "Ponytail"],
);

// Prototype order kept; extra colours appended so older 2D avatars keep their hair colour.
export const HAIR_COLORS: Swatch[] = [
  { id: "black", n: "Black", c: "#0D0907" },
  { id: "dark-brown", n: "Dark brown", c: "#2A1A10" },
  { id: "brown", n: "Brown", c: "#4A2D1A" },
  { id: "auburn", n: "Auburn", c: "#7A3B1F" },
  { id: "honey-blonde", n: "Honey blonde", c: "#B7863F" },
  { id: "grey", n: "Grey", c: "#8F8C88" },
  { id: "burgundy", n: "Burgundy", c: "#5A1F2A" },
  { id: "platinum", n: "Platinum", c: "#D8C79A" },
  { id: "red", n: "Red", c: "#9E2E26" },
  { id: "purple", n: "Purple", c: "#4E3790" },
  { id: "blue", n: "Blue", c: "#2A55B0" },
];

export const FACIAL_HAIR = named(
  ["none", "stubble", "mustache", "goatee", "short-beard", "full-beard"],
  ["None", "Stubble", "Mustache", "Goatee", "Short beard", "Full beard"],
);

/** Skeleton frame: sets shoulder/hip proportions, neck and default chest shape. */
export const FRAMES = named(["masculine", "feminine"], ["Masculine", "Feminine"]);

/**
 * Body types. Multipliers are relative to Average (1). sh/ch/rib/wa/hi = width at shoulders, chest,
 * ribs, waist, hips; chF/waF/hiF = front depth, chB/waB/hiB = back depth; belly = forward belly mass;
 * pec/abs = sculpted muscle; armT/armD/armB/armF = arm thickness, deltoid, bicep, forearm;
 * legT/calf = thigh and calf; limbL = limb length; h/w = overall height/width scale; stance = leg
 * spacing; trap = trapezius slope; neck = neck-base strength; gl = glute scale.
 */
export type BodyType = Option & Partial<Record<
  "sh" | "trap" | "ch" | "chF" | "chB" | "rib" | "wa" | "waF" | "waB" | "hi" | "hiF" | "hiB" | "belly" | "bellyY" |
  "gl" | "pec" | "abs" | "slump" | "armT" | "armD" | "armB" | "armF" | "legT" | "calf" | "limbL" | "h" | "w" |
  "stance" | "neck" | "shirtless",
  number
>>;
export const BUILDS: BodyType[] = [
  { id: "athletic", n: "Athletic", sh: 1.16, trap: 0.1, ch: 1.14, chF: 1.08, chB: 1.08, rib: 1.06, wa: 0.9, waF: 0.95, hi: 0.95, hiB: 1.02, pec: 0.035, armT: 1.22, armD: 1.28, armB: 1.3, armF: 1.15, legT: 1.22, calf: 1.15, neck: 0.25 },
  { id: "ectomorphic", n: "Ectomorphic", gl: 0.6, sh: 0.8, trap: -0.08, slump: 0.12, ch: 0.8, chF: 0.75, chB: 0.85, rib: 0.8, wa: 0.8, waF: 0.8, waB: 0.85, hi: 0.85, hiF: 0.85, hiB: 0.85, armT: 0.66, armD: 0.68, armB: 0.66, armF: 0.7, legT: 0.68, calf: 0.72, limbL: 1.07, h: 1.04, neck: -0.25 },
  { id: "sturdy", n: "Sturdy", sh: 1.14, trap: 0.12, ch: 1.14, chF: 1.15, chB: 1.12, rib: 1.2, wa: 1.3, waF: 1.35, waB: 1.15, hi: 1.25, hiF: 1.2, hiB: 1.15, belly: 0.68, bellyY: -5.35, gl: 1.2, armT: 1.3, armD: 1.2, armB: 1.3, armF: 1.25, legT: 1.38, calf: 1.35, neck: 0.25 },
  { id: "average", n: "Average", neck: 0 },
  { id: "bodybuilder", n: "Bodybuilder", sh: 1.4, trap: 0.35, ch: 1.28, chF: 1.18, chB: 1.2, rib: 1.12, wa: 0.84, waF: 0.9, waB: 0.95, hi: 1.12, hiF: 1.05, hiB: 1.18, gl: 1.4, pec: 0.13, abs: 1, armT: 1.5, armD: 1.6, armB: 1.65, armF: 1.45, legT: 1.55, calf: 1.6, stance: 1.15, shirtless: 1, neck: 0.6 },
  { id: "lean", n: "Lean", sh: 1.08, ch: 1.05, chF: 1.05, rib: 0.98, wa: 0.88, waF: 0.9, hi: 0.92, pec: 0.03, armT: 0.95, armD: 1.05, armF: 0.95, legT: 0.95, calf: 0.95, neck: 0.1 },
  { id: "stocky", n: "Stocky", sh: 1.1, trap: 0.22, ch: 1.2, chF: 1.25, chB: 1.15, rib: 1.35, wa: 1.5, waF: 1.5, waB: 1.25, hi: 1.45, hiF: 1.3, hiB: 1.25, belly: 0.82, bellyY: -5.1, gl: 1.2, armT: 1.38, armD: 1.25, armB: 1.35, armF: 1.3, legT: 1.55, calf: 1.5, stance: 1.22, limbL: 0.96, neck: 0.3 },
  { id: "petite", n: "Petite", sh: 0.9, ch: 0.92, rib: 0.92, wa: 0.92, hi: 0.94, armT: 0.85, legT: 0.88, calf: 0.88, limbL: 0.9, h: 0.87, w: 0.92, neck: -0.1 },
];

/** Chest size. "Natural" (no v) means the frame decides. */
export const BUSTS = [
  { id: "natural", n: "Natural" },
  { id: "flat", n: "Flat", v: 0 },
  { id: "small", n: "Small", v: 0.12 },
  { id: "medium", n: "Medium", v: 0.22 },
  { id: "large", n: "Large", v: 0.34 },
  { id: "extra-large", n: "Extra large", v: 0.48 },
];

export const BUTTS = [
  { id: "flat", n: "Flat", v: 0.04 },
  { id: "average", n: "Average", v: 0.14 },
  { id: "full", n: "Full", v: 0.24 },
  { id: "curvy", n: "Curvy", v: 0.34 },
  { id: "extra", n: "Extra", v: 0.46 },
];

/** sl = sleeve style; flags pick the garment pieces; match = trousers use the top colour; bare = legs show. */
export type Outfit = Option & {
  sl: "short" | "long" | "flare" | "puff" | "none";
  shoe: "light" | "dark";
} & Partial<Record<"hood" | "tunic" | "robe" | "match" | "skirt" | "bare" | "abaya" | "jalab" | "cute" | "mini" |
  "suit" | "tie" | "pencil" | "swim", 1>>;
export const OUTFITS: Outfit[] = [
  { id: "t-shirt", n: "T-shirt", sl: "short", shoe: "light" },
  { id: "long-sleeve", n: "Long sleeve", sl: "long", shoe: "light" },
  { id: "hoodie", n: "Hoodie", sl: "long", hood: 1, shoe: "light" },
  { id: "kaftan", n: "Kaftan", sl: "long", tunic: 1, match: 1, shoe: "dark" },
  { id: "agbada", n: "Agbada", sl: "flare", tunic: 1, robe: 1, match: 1, shoe: "dark" },
  { id: "dress", n: "Dress", sl: "short", skirt: 1, bare: 1, shoe: "dark" },
  { id: "abaya", n: "Abaya", sl: "flare", abaya: 1, match: 1, shoe: "dark" },
  { id: "jalabiya", n: "Jalabiya", sl: "long", jalab: 1, match: 1, shoe: "dark" },
  { id: "cute-dress", n: "Cute dress", sl: "puff", cute: 1, bare: 1, shoe: "dark" },
  { id: "short-dress", n: "Short dress", sl: "none", mini: 1, bare: 1, shoe: "dark" },
  { id: "suit", n: "Suit", sl: "long", suit: 1, tie: 1, match: 1, shoe: "dark" },
  { id: "skirt-suit", n: "Skirt suit", sl: "long", suit: 1, pencil: 1, bare: 1, shoe: "dark" },
  { id: "swimwear", n: "Swimwear", sl: "none", swim: 1, bare: 1, shoe: "light" },
];

// Clothing colours (also used for headwear). Prototype order kept; extra colours appended so older
// 2D avatars keep their top colour.
export const CLOTH_COLORS: Swatch[] = [
  { id: "navy", n: "Navy", c: "#1F2A44" },
  { id: "forest", n: "Forest", c: "#2F4F3A" },
  { id: "brick", n: "Brick", c: "#8B2E2E" },
  { id: "gold", n: "Gold", c: "#C9A227" },
  { id: "white", n: "White", c: "#E9E5DC" },
  { id: "black", n: "Black", c: "#161616" },
  { id: "plum", n: "Plum", c: "#5B3A7A" },
  { id: "teal", n: "Teal", c: "#2E7C8C" },
  { id: "orange", n: "Orange", c: "#C8641E" },
  { id: "royal-blue", n: "Royal blue", c: "#2F5FB8" },
  { id: "red", n: "Red", c: "#C23B3F" },
  { id: "green", n: "Green", c: "#1E8A64" },
  { id: "pink", n: "Pink", c: "#C8487A" },
];

export const PATTERNS = named(["plain", "ankara", "kente", "pinstripe"], ["Plain", "Ankara", "Kente", "Pinstripe"]);

export const BOTTOM_COLORS: Swatch[] = [
  { id: "charcoal", n: "Charcoal", c: "#1C1F26" },
  { id: "denim", n: "Denim", c: "#2B3A55" },
  { id: "khaki", n: "Khaki", c: "#6B5B45" },
  { id: "white", n: "White", c: "#E6E2D8" },
  { id: "grey", n: "Grey", c: "#4A4A4A" },
  { id: "brown", n: "Brown", c: "#4A2C1F" },
];

export const GLASSES = named(["none", "round", "square", "sunglasses"], ["None", "Round", "Square", "Sunglasses"]);
export const EARRINGS = named(["none", "studs", "hoops", "drops"], ["None", "Studs", "Hoops", "Drops"]);
export const PIERCINGS = named(
  ["none", "helix", "tragus", "second-lobe", "conch", "helix-tragus", "full-set"],
  ["None", "Helix", "Tragus", "Second lobe", "Conch", "Helix + tragus", "Full set"],
);
export const HEADWEAR = named(
  ["none", "face-cap", "head-tie", "gele", "kufi", "fila", "hijab"],
  ["None", "Face cap", "Head tie", "Gele", "Kufi", "Fila", "Hijab"],
);

export type Watch = Option & { band?: string; face?: string; metal?: 1; screen?: 1 };
export const WATCHES: Watch[] = [
  { id: "none", n: "None" },
  { id: "gold", n: "Gold", band: "#C99A3E", face: "#F3E6C4", metal: 1 },
  { id: "silver", n: "Silver", band: "#B9C0C8", face: "#1E2633", metal: 1 },
  { id: "smart", n: "Smart", band: "#1B1B1E", face: "#0B1A22", screen: 1 },
  { id: "leather", n: "Leather", band: "#5A341C", face: "#F2EEE6" },
];

/** r = link thickness, drop = how low it hangs. */
export type Chain = Option & { c?: string; r?: number; drop?: number; big?: 1; iced?: 1; pend?: 1; layer?: 1 };
export const CHAINS: Chain[] = [
  { id: "none", n: "None" },
  { id: "gold-chain", n: "Gold chain", c: "#D9A94E", r: 0.032, drop: 1.05 },
  { id: "silver-chain", n: "Silver chain", c: "#C9CED6", r: 0.032, drop: 1.05 },
  { id: "gold-cuban", n: "Gold Cuban", c: "#D9A94E", big: 1, r: 0.1, drop: 1.35 },
  { id: "iced-cuban", n: "Iced Cuban", c: "#E8EDF2", big: 1, iced: 1, r: 0.11, drop: 1.4 },
  { id: "pendant", n: "Pendant", c: "#D9A94E", r: 0.03, drop: 1.7, pend: 1 },
  { id: "layered", n: "Layered", c: "#D9A94E", r: 0.03, drop: 1.0, layer: 1 },
];

// ---- added after the prototype ----

/** Background behind the 2D picture (same colours the old 2D avatars used). */
export const BACKGROUNDS: Swatch[] = [
  { id: "butter", n: "Butter", c: "#FFE8A3" },
  { id: "sky", n: "Sky", c: "#CFE8FF" },
  { id: "mint", n: "Mint", c: "#D3F9D8" },
  { id: "blush", n: "Blush", c: "#FFD8E2" },
  { id: "lilac", n: "Lilac", c: "#E5DBFF" },
  { id: "peach", n: "Peach", c: "#FFE3CC" },
  { id: "aqua", n: "Aqua", c: "#C5F6FA" },
  { id: "cloud", n: "Cloud", c: "#EEF2F6" },
];

/**
 * Standing height, separate from body type (real people of any build come in any height).
 * s scales the skeleton. The head follows only HEAD_HEIGHT_SHARE of that change, because head size
 * varies far less between adults than height does. Index 0 must stay "Average".
 */
export const HEIGHTS = [
  { id: "average", n: "Average", s: 1 },
  { id: "short", n: "Short", s: 0.94 },
  { id: "tall", n: "Tall", s: 1.06 },
  { id: "very-short", n: "Very short", s: 0.89 },
  { id: "very-tall", n: "Very tall", s: 1.11 },
];
export const HEAD_HEIGHT_SHARE = 0.35;
