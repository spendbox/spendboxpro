// A player's face: a handful of choices that the avatar drawing (components/avatar.tsx) turns
// into a portrait. Kept small so it travels with chat messages and notifications.

export type Avatar = {
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  brows: number;
  mouth: number;
  beard: number;
  glasses: number;
  top: number;
  topColor: number;
  bg: number;
  earrings: number;
};

export const SKIN = ["#f6d7c3", "#eec3a0", "#d9a37a", "#c08458", "#9c6440", "#7a4a2c", "#5c3620", "#3f2416"];
export const HAIR_COLOR = ["#1b1b1b", "#3b2417", "#6a3d1f", "#a5652a", "#d9a441", "#e8d3a1", "#9aa0a6", "#b5332e", "#5b3fa0", "#2f6fd1"];
export const TOP_COLOR = ["#2f6fd1", "#e5484d", "#12a37a", "#f5a524", "#7048e8", "#18202b", "#f1f3f5", "#e64980", "#0b7285", "#a0522d"];
export const BG = ["#ffe8a3", "#cfe8ff", "#d3f9d8", "#ffd8e2", "#e5dbff", "#ffe3cc", "#c5f6fa", "#eef2f6"];

export const AVATAR_PARTS = {
  hair: ["Buzz", "Short", "Curly", "Afro", "Long", "Bun", "Braids", "Mohawk", "Side part", "Bald", "Locs", "Bob"],
  eyes: ["Friendly", "Happy", "Sleepy", "Wide", "Wink"],
  brows: ["Soft", "Bold", "Raised", "Focused"],
  mouth: ["Smile", "Grin", "Calm", "Smirk", "Laugh"],
  beard: ["None", "Stubble", "Full", "Goatee", "Moustache"],
  glasses: ["None", "Round", "Square", "Shades"],
  // Append only: a stored avatar keeps its outfit by index.
  top: [
    "T-shirt",
    "Hoodie",
    "Collar",
    "Jacket",
    "Agbada",
    "Polo",
    "Turtleneck",
    "V-neck",
    "Tank top",
    "Striped tee",
    "Football jersey",
    "Denim jacket",
    "Leather jacket",
    "Bomber",
    "Blazer & tie",
    "Suit & bow tie",
    "Puffer jacket",
    "Varsity jacket",
    "Flannel shirt",
    "Overalls",
    "Dashiki",
    "Kimono",
    "Scrubs",
    "Chef's whites",
    "Camo fatigues",
  ],
  earrings: ["None", "Studs", "Hoops"],
};

const pickN = (h: number, n: number) => Math.abs(h) % n;

/** A starting face for someone who hasn't designed one yet (based on their name). */
export function defaultAvatar(seed: string): Avatar {
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const next = () => (h = (Math.imul(h, 1103515245) + 12345) | 0) >>> 8;
  return {
    skin: pickN(next(), SKIN.length),
    hair: pickN(next(), AVATAR_PARTS.hair.length),
    hairColor: pickN(next(), 6),
    eyes: pickN(next(), 3),
    brows: pickN(next(), AVATAR_PARTS.brows.length),
    mouth: pickN(next(), 3),
    beard: next() % 4 === 0 ? 1 + pickN(next(), 4) : 0,
    glasses: next() % 5 === 0 ? 1 + pickN(next(), 3) : 0,
    top: pickN(next(), AVATAR_PARTS.top.length),
    topColor: pickN(next(), TOP_COLOR.length),
    bg: pickN(next(), BG.length),
    earrings: next() % 4 === 0 ? 1 + pickN(next(), 2) : 0,
  };
}

/** Makes sure a stored or submitted avatar only has known values. */
export function cleanAvatar(input: unknown, fallbackSeed: string): Avatar {
  const base = defaultAvatar(fallbackSeed);
  if (!input || typeof input !== "object") return base;
  const src = input as Record<string, unknown>;
  const limits: Record<keyof Avatar, number> = {
    skin: SKIN.length,
    hair: AVATAR_PARTS.hair.length,
    hairColor: HAIR_COLOR.length,
    eyes: AVATAR_PARTS.eyes.length,
    brows: AVATAR_PARTS.brows.length,
    mouth: AVATAR_PARTS.mouth.length,
    beard: AVATAR_PARTS.beard.length,
    glasses: AVATAR_PARTS.glasses.length,
    top: AVATAR_PARTS.top.length,
    topColor: TOP_COLOR.length,
    bg: BG.length,
    earrings: AVATAR_PARTS.earrings.length,
  };
  const out = { ...base };
  for (const key of Object.keys(limits) as (keyof Avatar)[]) {
    const v = Number(src[key]);
    if (Number.isInteger(v) && v >= 0 && v < limits[key]) out[key] = v;
  }
  return out;
}
