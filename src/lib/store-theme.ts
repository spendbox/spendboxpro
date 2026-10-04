// How a business's 3D store looks. Kept in businesses.store_theme as JSON and
// read the same way by the map, the store and the editor. Only the business
// changes it. Anything unknown or missing falls back to the defaults, and
// designs saved by older versions are read into the new shape.

export type FloorStyle = "oak" | "herringbone" | "checker" | "terrazzo" | "concrete" | "marble";
export type LightStyle = "dome" | "globe" | "cone" | "rattan" | "linear";
export type LightTone = "warm" | "neutral" | "cool";
export type TableStyle = "booth" | "marble" | "bistro" | "linen" | "garden" | "none";
export type BoardStyle = "letter" | "acrylic" | "neon" | "brass" | "oak";
export type PlantKind = "strelitzia" | "monstera" | "olive" | "snake" | "flowers" | "pampas" | "none";
export type PotColor = "white" | "terracotta" | "black" | "stone";
export type PlantSpot = "backLeft" | "backRight" | "front" | "counter";
export type ArtPreset = "shapes" | "stripes" | "arch" | "sun" | "leaf";
export type Art = { kind: "preset"; id: ArtPreset } | { kind: "image"; url: string };

export interface StoreTheme {
  theme: "boutique";
  /** Wall colour. */
  wall: string;
  /** Counter, lamps and trim. Null = the business's brand colour. */
  accent: string | null;
  floor: { style: FloorStyle; color: string };
  lights: { style: LightStyle; tone: LightTone };
  /** The table set in the lounge corner ("none" leaves the corner empty). */
  table: TableStyle;
  /** The welcome board at the top of the back wall. */
  board: { style: BoardStyle; title: string; subtitle: string };
  plants: Record<PlantSpot, { kind: PlantKind; pot: PotColor }>;
  /** The two pictures on the lounge wall. */
  art: [Art, Art];
}

export const THEMES = [
  {
    id: "boutique" as const,
    name: "Boutique",
    description: "A bright shop with a marble counter, a screen of your products and a cosy lounge.",
  },
];

export const WALL_COLORS = ["#F6EFE6", "#EEF3EC", "#EAF0F6", "#F7E9EC", "#F3EEDF", "#ECE9F5", "#E9E4DC", "#2F3A34"];
export const ACCENT_COLORS = ["#2A772C", "#1C2B24", "#4338A0", "#A33A0B", "#A3214E", "#0F5E8C", "#7A4B12", "#C98A1B"];

export const FLOORS: { id: FloorStyle; label: string; colors: string[] }[] = [
  { id: "oak", label: "Oak planks", colors: ["#C9A27A", "#E0C49F", "#9A6B45", "#5E3E28", "#B9B2A6"] },
  { id: "herringbone", label: "Herringbone", colors: ["#C9A27A", "#E0C49F", "#9A6B45", "#5E3E28", "#B9B2A6"] },
  { id: "checker", label: "Checker tiles", colors: ["#2B2A28", "#2F5D46", "#8C3B2E", "#2D4A6B", "#B98F5B"] },
  { id: "terrazzo", label: "Terrazzo", colors: ["#ECE7DE", "#F2E3DA", "#E3E9E2", "#DDE3EA", "#D8D2C8"] },
  { id: "concrete", label: "Polished concrete", colors: ["#C9C6C0", "#A9A6A0", "#D9D2C5", "#8E918C", "#5E605C"] },
  { id: "marble", label: "Marble", colors: ["#F4F2EE", "#E9E1D6", "#E4E8E6", "#2A2826", "#3C4A43"] },
];

export const LIGHT_STYLES: { id: LightStyle; label: string }[] = [
  { id: "dome", label: "Dome" },
  { id: "globe", label: "Opal globe" },
  { id: "cone", label: "Brass cone" },
  { id: "rattan", label: "Rattan" },
  { id: "linear", label: "Linear bar" },
];
export const LIGHT_TONES: { id: LightTone; label: string; color: string }[] = [
  { id: "warm", label: "Warm", color: "#FFD9A0" },
  { id: "neutral", label: "Neutral", color: "#FFF1DE" },
  { id: "cool", label: "Cool", color: "#EAF3FF" },
];

export const TABLES: { id: TableStyle; label: string; description: string; swatch: [string, string] }[] = [
  { id: "booth", label: "Sage booth", description: "A curved, tufted leather booth round a marble table.", swatch: ["#9fb08a", "#f1eee8"] },
  { id: "marble", label: "Marble & cane", description: "A dark marble table with cane-back chairs.", swatch: ["#24221f", "#c9a46a"] },
  { id: "bistro", label: "Bistro", description: "A round walnut table with bentwood chairs.", swatch: ["#7a4f30", "#d9b97f"] },
  { id: "linen", label: "Linen dinner", description: "A white tablecloth set between two rattan sofas.", swatch: ["#f4f1ea", "#9fb08a"] },
  { id: "garden", label: "Garden ring", description: "Round seating wrapped around a big planter.", swatch: ["#4f9a4c", "#9fb08a"] },
  { id: "none", label: "No table", description: "Keep the corner open.", swatch: ["#e7e2d8", "#ffffff"] },
];

export const BOARDS: { id: BoardStyle; label: string; swatch: [string, string] }[] = [
  { id: "letter", label: "Letter board", swatch: ["#1f1f1f", "#ffffff"] },
  { id: "acrylic", label: "Frosted acrylic", swatch: ["#eef1f0", "#1c2b24"] },
  { id: "neon", label: "Neon", swatch: ["#151515", "#ff5c8a"] },
  { id: "brass", label: "Brass letters", swatch: ["#c9a25a", "#f6efe6"] },
  { id: "oak", label: "Engraved oak", swatch: ["#c9a27a", "#5e3e28"] },
];

export const PLANTS: { id: PlantKind; label: string }[] = [
  { id: "strelitzia", label: "Bird of paradise" },
  { id: "monstera", label: "Monstera" },
  { id: "olive", label: "Olive tree" },
  { id: "snake", label: "Snake plant" },
  { id: "flowers", label: "Flowers" },
  { id: "pampas", label: "Pampas grass" },
  { id: "none", label: "None" },
];
export const POTS: { id: PotColor; label: string; color: string }[] = [
  { id: "white", label: "White", color: "#EFEBE4" },
  { id: "terracotta", label: "Terracotta", color: "#B9785A" },
  { id: "black", label: "Black", color: "#2A2B2A" },
  { id: "stone", label: "Stone", color: "#A9A49A" },
];
export const PLANT_SPOTS: { id: PlantSpot; label: string }[] = [
  { id: "backLeft", label: "Back left" },
  { id: "backRight", label: "Back right" },
  { id: "front", label: "By the door" },
  { id: "counter", label: "On the counter" },
];

export const ART_PRESETS: { id: ArtPreset; label: string }[] = [
  { id: "shapes", label: "Shapes" },
  { id: "stripes", label: "Stripes" },
  { id: "arch", label: "Arches" },
  { id: "sun", label: "Sunset" },
  { id: "leaf", label: "Leaf" },
];

const HEX = /^#[0-9a-f]{6}$/i;

export const DEFAULT_THEME: StoreTheme = {
  theme: "boutique",
  wall: WALL_COLORS[0],
  accent: null,
  floor: { style: "oak", color: FLOORS[0].colors[0] },
  lights: { style: "dome", tone: "warm" },
  table: "booth",
  board: { style: "acrylic", title: "Welcome", subtitle: "" },
  plants: {
    backLeft: { kind: "strelitzia", pot: "white" },
    backRight: { kind: "olive", pot: "white" },
    front: { kind: "monstera", pot: "terracotta" },
    counter: { kind: "flowers", pot: "white" },
  },
  art: [
    { kind: "preset", id: "shapes" },
    { kind: "preset", id: "stripes" },
  ],
};

function oneOf<T extends string>(value: unknown, list: readonly { id: T }[], fallback: T): T {
  return list.some((x) => x.id === value) ? (value as T) : fallback;
}

function text(value: unknown, fallback: string, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : fallback;
}

/** Only pictures uploaded to Spendbox's own storage, so a store never loads images from elsewhere. */
export function isStoreImage(url: unknown): url is string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return typeof url === "string" && url.length < 400 && !!base && url.startsWith(`${base}/storage/v1/object/public/logos/`) && !/[\s"'<>]/.test(url);
}

function readArt(raw: unknown, fallback: Art): Art {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (a.kind === "image" && isStoreImage(a.url)) return { kind: "image", url: a.url };
  if (a.kind === "preset" && ART_PRESETS.some((p) => p.id === a.id)) return { kind: "preset", id: a.id as ArtPreset };
  return fallback;
}

const OLD_FLOORS: Record<string, FloorStyle> = { wood: "oak", tiles: "checker", terrazzo: "terrazzo" };

/** A safe, complete theme from whatever is stored (or sent by the editor). */
export function readTheme(raw: unknown): StoreTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_THEME;

  // Floor: { style, color }, or an older plain name.
  const f = (t.floor && typeof t.floor === "object" ? t.floor : {}) as Record<string, unknown>;
  const floorStyle = typeof t.floor === "string" ? (OLD_FLOORS[t.floor] ?? d.floor.style) : oneOf(f.style, FLOORS, d.floor.style);
  const floorColors = FLOORS.find((x) => x.id === floorStyle)!.colors;
  const floorColor = typeof f.color === "string" && floorColors.includes(f.color) ? f.color : floorColors[0]!;

  // Lights: { style, tone }, or an older "warm"/"cool".
  const l = (t.lights && typeof t.lights === "object" ? t.lights : {}) as Record<string, unknown>;
  const lights =
    typeof t.lights === "string"
      ? { style: d.lights.style, tone: t.lights === "cool" ? ("cool" as const) : ("warm" as const) }
      : { style: oneOf(l.style, LIGHT_STYLES, d.lights.style), tone: oneOf(l.tone, LIGHT_TONES, d.lights.tone) };

  const b = (t.board && typeof t.board === "object" ? t.board : {}) as Record<string, unknown>;

  // Plants per spot; an older "plants: false" means none anywhere.
  const p = (t.plants && typeof t.plants === "object" ? t.plants : {}) as Record<string, unknown>;
  const plants = {} as StoreTheme["plants"];
  for (const spot of PLANT_SPOTS) {
    const s = (p[spot.id] && typeof p[spot.id] === "object" ? p[spot.id] : {}) as Record<string, unknown>;
    plants[spot.id] =
      t.plants === false
        ? { kind: "none", pot: d.plants[spot.id].pot }
        : { kind: oneOf(s.kind, PLANTS, d.plants[spot.id].kind), pot: oneOf(s.pot, POTS, d.plants[spot.id].pot) };
  }

  const art = Array.isArray(t.art) ? t.art : [];
  // An older "lounge: false" means no table.
  const table = t.lounge === false && t.table === undefined ? "none" : oneOf(t.table, TABLES, d.table);

  return {
    theme: "boutique",
    wall: typeof t.wall === "string" && HEX.test(t.wall) ? t.wall : d.wall,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent : null,
    floor: { style: floorStyle, color: floorColor },
    lights,
    table,
    board: { style: oneOf(b.style, BOARDS, d.board.style), title: text(b.title, d.board.title, 28), subtitle: text(b.subtitle, d.board.subtitle, 48) },
    plants,
    art: [readArt(art[0], d.art[0]), readArt(art[1], d.art[1])],
  };
}

/** The colour used for trim: the theme's accent, or the brand colour. */
export function accentOf(theme: StoreTheme, brandColor: string) {
  return theme.accent ?? (HEX.test(brandColor) ? brandColor : "#2A772C");
}

/** The pictures a theme uses from storage (so replaced ones can be deleted). */
export function themeImages(theme: StoreTheme) {
  return theme.art.flatMap((a) => (a.kind === "image" ? [a.url] : []));
}
