// Marks players leave on the map (docs/MARKS.md): writing on a wall, a review of a place, a tree,
// a bench, a statue, a fountain, a plaque, or a time capsule. Shared by the server (which works
// out costs and checks the writing here) and the screens. Database: game-db/052_marks.sql and
// 053_marks_rules.sql (graffiti styles, trees that stay).

import type { TileKind } from "../city/layout";

export type MarkKind = "writing" | "review" | "tree" | "bench" | "statue" | "fountain" | "plaque" | "capsule";

/** What each kind costs (naira) and how long it stands (days; 0 for as long as people let it). */
export const MARK_KINDS: { kind: MarkKind; label: string; what: string; price: number; days: number; text: "need" | "optional" | "none" }[] = [
  { kind: "writing", label: "Writing", what: "Write anything on a wall or the pavement. Your name goes with it.", price: 0, days: 0, text: "need" },
  { kind: "review", label: "Review", what: "Stars and a few words about this place, for everyone who comes by.", price: 0, days: 0, text: "need" },
  { kind: "tree", label: "Tree", what: "Adopt one of a park's trees, or plant a new one on open ground outside the built-up streets. Yours for good, with your words on it.", price: 20_000, days: 0, text: "optional" },
  { kind: "bench", label: "Bench", what: "A bench with your words on a little plate. Stands 30 days.", price: 50_000, days: 30, text: "optional" },
  { kind: "plaque", label: "Plaque", what: "A brass plaque on the wall: who, what, when. Stands 60 days.", price: 100_000, days: 60, text: "need" },
  { kind: "statue", label: "Statue", what: "A statue of you, with your words under it. Stands 30 days.", price: 500_000, days: 30, text: "optional" },
  { kind: "fountain", label: "Fountain", what: "A fountain for the whole street, in your name. Stands 30 days.", price: 2_000_000, days: 30, text: "optional" },
  { kind: "capsule", label: "Time capsule", what: "Bury a message (and one of your things) that opens on a date. The first to open it gets the thing.", price: 5_000, days: 0, text: "need" },
];
export const markKind = (k: string) => MARK_KINDS.find((m) => m.kind === k);

/** Adopting a tree that's already there (in a park or a wood) costs half of planting one. */
export const ADOPT_SHARE = 0.5;

/** Writing is short: a sentence, not an essay. */
export const MARK_MAX = 100;

/** Graffiti styles to pick from for writing on a wall. */
export const GRAFFITI = [
  { id: "spray", label: "Spray", hint: "Classic spray paint" },
  { id: "bubble", label: "Bubble", hint: "Fat round letters with an outline" },
  { id: "tag", label: "Tag", hint: "A quick slanted signature" },
  { id: "drip", label: "Drip", hint: "Fresh paint, still running" },
  { id: "stencil", label: "Stencil", hint: "Sharp capitals through a cut-out" },
  { id: "neon", label: "Neon", hint: "Glowing like a sign at night" },
  { id: "chalk", label: "Chalk", hint: "Soft, on the pavement" },
] as const;
export type GraffitiStyle = (typeof GRAFFITI)[number]["id"];
export const graffiti = (id: string | null | undefined): GraffitiStyle => (GRAFFITI.some((g) => g.id === id) ? (id as GraffitiStyle) : "spray");

/**
 * How a style looks (CSS, camelCase so it can go on a React style or straight onto an element):
 * the same on the map's wall tags and in the preview while you write.
 */
export function graffitiLook(style: GraffitiStyle, ink: string): Record<string, string> {
  const dark = ink === "#212529";
  const glow = (c: string, r: number) => `0 0 ${r}px ${c}, 0 0 ${r * 2}px ${c}`;
  switch (style) {
    case "bubble":
      return { fontFamily: "'Arial Rounded MT Bold','Trebuchet MS',system-ui,sans-serif", fontWeight: "900", letterSpacing: "0.5px", color: ink, textShadow: `-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff, 3px 3px 0 ${dark ? "#868e96" : "#212529"}` };
    case "tag":
      return { fontFamily: "'Brush Script MT','Segoe Script','Comic Sans MS',cursive", fontWeight: "700", fontStyle: "italic", color: ink, transform: "skewX(-12deg)", letterSpacing: "-0.5px" };
    case "drip":
      return { fontFamily: "Impact,'Arial Black',system-ui,sans-serif", fontWeight: "900", color: ink, textShadow: `0 2px 0 ${ink}, 0 5px 1px ${ink}99, 0 8px 2px ${ink}44` };
    case "stencil":
      return { fontFamily: "'Stencil','Courier New',monospace", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1.5px", color: ink };
    case "neon":
      return { fontFamily: "system-ui,sans-serif", fontWeight: "700", color: "#fff", textShadow: glow(ink === "#ffffff" ? "#22b8cf" : ink, 4) };
    case "chalk":
      return { fontFamily: "'Comic Sans MS','Chalkboard SE',cursive", fontWeight: "600", color: ink === "#212529" ? "#f1f3f5" : ink, opacity: "0.9", textShadow: "0 0 1px rgba(255,255,255,.8)" };
    default:
      return { fontFamily: "'Arial Black',system-ui,sans-serif", fontWeight: "900", color: ink, textShadow: `0 0 2px ${ink}88` };
  }
}
/** The wall behind a style (neon and chalk want a dark one). */
export const graffitiWall = (style: GraffitiStyle) => (style === "neon" || style === "chalk" ? "#212529" : style === "stencil" ? "#e9ecef" : "#f8f1e5");

/**
 * How many marks you can have up at once: none below 20 reputation, then one, and one more for
 * every 50 reputation points.
 */
export const MARK_MIN_REP = 20;
export function marksAllowed(reputation: number) {
  return reputation < MARK_MIN_REP ? 0 : 1 + Math.floor(reputation / 50);
}

/**
 * Where a mark can go without spoiling the map: never on water; trees, benches, statues and
 * fountains never on a road, a bridge, a railway or a station's site, nor on a landmark. Writing,
 * reviews, plaques and capsules go on any wall or pavement on land. A spot that won't do is moved to
 * the nearest one (2 tiles at most) that will; null when there's none.
 */
export type SpotLook = { water: boolean; road: boolean; kept: boolean; landmark: boolean; tile: TileKind };
export const STANDS = new Set<MarkKind>(["tree", "bench", "statue", "fountain"]);
export function markSpot(kind: MarkKind, x: number, z: number, look: (x: number, z: number) => SpotLook | null): { x: number; z: number; adopt: boolean } | null {
  const ok = (l: SpotLook | null) => !!l && !l.water && (!STANDS.has(kind) || (!l.road && !l.kept && !l.landmark && l.tile !== "road" && l.tile !== "bridge" && !(kind === "tree" && (l.tile === "tower" || l.tile === "office"))));
  for (let r = 0; r <= 2; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const l = look(x + dx, z + dz);
        if (ok(l)) return { x: x + dx, z: z + dz, adopt: kind === "tree" && (l!.tile === "park" || l!.tile === "trees") };
      }
  return null;
}

/** Websites and links aren't allowed on the map. Says what it found, or null. */
export function website(text: string): string | null {
  if (/https?:\/\/|www\.|\b[a-z0-9-]{2,}(\.|\s+dot\s+)(com|ng|net|org|io|co|xyz|app|me|info|biz|link|ly|gg|tv|dev|site|online|store|shop|uk|us|africa)\b/i.test(text)) return "a website";
  if (/(^|\s)@[a-z0-9_.]{3,}/i.test(text)) return "a social media handle";
  return null;
}

/** Colours for writing. */
export const INKS = ["#e03131", "#1971c2", "#2f9e44", "#f08c00", "#7048e8", "#212529", "#d6336c", "#ffffff"];

/** Chipping in to keep a paid mark standing: what a day costs (naira), a thirtieth of its price. */
export const dayCost = (kind: MarkKind) => Math.max(500, Math.round((markKind(kind)?.price ?? 0) / 30));

export const REACTIONS = [
  { id: "like", label: "👍" },
  { id: "laugh", label: "😂" },
  { id: "fire", label: "🔥" },
  { id: "love", label: "❤️" },
] as const;
export type Reaction = (typeof REACTIONS)[number]["id"];

/**
 * Real-world contact details aren't allowed on the map (anything else is, and players vote on it):
 * phone numbers (7+ digits, with spaces, dashes or +) and email addresses. Says what it found, or null.
 */
export function personalInfo(text: string): string | null {
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return "an email address";
  const digits = text.replace(/[\s().-]/g, "");
  if (/\+?\d{7,}/.test(digits)) return "a phone number";
  return null;
}

/** Writing tidied: one line of spaces, at most MARK_MAX letters. */
export function cleanMarkText(raw: string) {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MARK_MAX);
}
