// How a business's 3D store looks. Kept in businesses.store_theme as JSON and
// read the same way by the map, the store and the editor. Only the business
// changes it. Anything unknown or missing falls back to the defaults, and
// designs saved by older versions are read into the new shape.

import { customCategoryId, isKnownCategory, isPlacement, MAX_CUSTOM_CATEGORIES, type CustomCategory, type Placement } from "./product-categories";

export type FloorStyle = "oak" | "herringbone" | "checker" | "terrazzo" | "concrete" | "marble";
export type LightStyle = "dome" | "globe" | "cone" | "rattan" | "linear";
export type LightTone = "warm" | "neutral" | "cool";
export type TableStyle = "booth" | "marble" | "bistro" | "linen" | "garden" | "none";
export type BoardStyle = "lightbox" | "pill" | "neon" | "brass" | "letter";
export type BackdropStyle = "oak" | "walnut" | "fluted" | "marble" | "painted" | "brick" | "greenery" | "none";
export type RugStyle = "plain" | "border" | "stripes" | "geometric" | "jute" | "none";
export type PlantKind = "strelitzia" | "monstera" | "olive" | "snake" | "flowers" | "pampas" | "none";
export type PotColor = "white" | "terracotta" | "black" | "stone";
export type PlantSpot = "backLeft" | "backRight" | "front" | "counter";
export type ArtPreset = "shapes" | "stripes" | "arch" | "sun" | "leaf";
export type Art = { kind: "preset"; id: ArtPreset } | { kind: "image"; url: string };
export type BackFeature = "name" | "art" | "mirror" | "leaves" | "shelves" | "products" | "none";
/** Which side of the hall a category stands on, as you walk in ("auto" picks the side with more room). */
export type Side = "auto" | "left" | "right" | "back";
export type ShelfStyle = "brand" | "walnut" | "oak" | "white" | "black";
export type DisplayTableStyle = "brand" | "marble" | "oak" | "glass" | "black";
export type FrameStyle = "classic" | "gallery" | "gold" | "white" | "canvas";
export type FrameShape = "auto" | "portrait" | "square" | "landscape" | "tall" | "long";
export type DisplaySize = "s" | "m" | "l";
export type SignStyle = "dark" | "light" | "brand" | "brass";
export type DoorStyle = "steel" | "oak" | "arched" | "french" | "brand";
export type WindowStyle = "grid" | "arched" | "plain" | "shutters";

/** How one category looks in the hall; anything unset uses the usual. */
export interface CategoryLook {
  placement?: Placement;
  side?: Exclude<Side, "back">;
  shelf?: ShelfStyle;
  table?: DisplayTableStyle;
  frame?: FrameStyle;
  shape?: FrameShape;
  size?: DisplaySize;
}
export type BackLights = "sconces" | "globes" | "picture" | "none";
export type BackConsole = "flowers" | "books" | "none";

/** The far wall at the end of the product hall. */
export interface BackWall {
  /** The centrepiece: the business's name, a big framed picture, an arched mirror, a living wall or floating shelves. */
  feature: BackFeature;
  art: Art;
  /** Wall lights either side (or a picture light over the centrepiece). */
  lights: BackLights;
  /** A floor plant in each corner. */
  plants: PlantKind;
  pot: PotColor;
  /** A console table under the centrepiece, with flowers or books on it. */
  console: BackConsole;
  /** With feature "products": the category shown on the back wall. */
  category: string | null;
}

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
  /** The feature wall behind the product screen. */
  backdrop: BackdropStyle;
  /** The rug under the lounge table. */
  rug: { style: RugStyle; color: string };
  /** Show the business's name on the front of the counter. */
  counterName: boolean;
  /** The business's own product categories, and how each category looks in the hall (where, which side, which design and size). */
  categories: { custom: CustomCategory[]; looks: Record<string, CategoryLook> };
  backWall: BackWall;
  /** The hanging signs over each section. Null colour = the style's own. */
  signs: { style: SignStyle; color: string | null };
  /** The shop's door and window, and the colour of their frames. */
  entrance: { door: DoorStyle; window: WindowStyle; color: string };
}

export const SIDES: { id: Side; label: string }[] = [
  { id: "auto", label: "Automatic" },
  { id: "left", label: "Left aisle" },
  { id: "right", label: "Right aisle" },
  { id: "back", label: "Back wall" },
];
export const SHELF_STYLES: { id: ShelfStyle; label: string }[] = [
  { id: "brand", label: "Your colour" },
  { id: "walnut", label: "Walnut" },
  { id: "oak", label: "Light oak" },
  { id: "white", label: "White lacquer" },
  { id: "black", label: "Black & brass" },
];
export const DISPLAY_TABLES: { id: DisplayTableStyle; label: string }[] = [
  { id: "brand", label: "Marble on your colour" },
  { id: "marble", label: "White marble" },
  { id: "oak", label: "Oak" },
  { id: "glass", label: "Glass & brass" },
  { id: "black", label: "Black marble" },
];
export const FRAME_STYLES: { id: FrameStyle; label: string }[] = [
  { id: "classic", label: "Walnut & mat" },
  { id: "gallery", label: "Thin black" },
  { id: "gold", label: "Gold" },
  { id: "white", label: "White" },
  { id: "canvas", label: "Canvas, no frame" },
];
export const FRAME_SHAPES: { id: FrameShape; label: string }[] = [
  { id: "auto", label: "Fit each photo" },
  { id: "portrait", label: "Portrait" },
  { id: "square", label: "Square" },
  { id: "landscape", label: "Landscape" },
  { id: "tall", label: "Tall" },
  { id: "long", label: "Long" },
];
export const DISPLAY_SIZES: { id: DisplaySize; label: string }[] = [
  { id: "s", label: "Small" },
  { id: "m", label: "Medium" },
  { id: "l", label: "Large" },
];
export const SIGN_STYLES: { id: SignStyle; label: string; swatch: [string, string] }[] = [
  { id: "dark", label: "Dark", swatch: ["#1d2320", "#ffffff"] },
  { id: "light", label: "Light", swatch: ["#fbf8f2", "#1d2320"] },
  { id: "brand", label: "Your colour", swatch: ["#2A772C", "#ffffff"] },
  { id: "brass", label: "Brass", swatch: ["#c9a25a", "#2b2420"] },
];
export const DOOR_STYLES: { id: DoorStyle; label: string }[] = [
  { id: "steel", label: "Steel & glass" },
  { id: "oak", label: "Oak" },
  { id: "arched", label: "Arched glass" },
  { id: "french", label: "French doors" },
  { id: "brand", label: "Your colour" },
];
export const WINDOW_STYLES: { id: WindowStyle; label: string }[] = [
  { id: "grid", label: "Steel grid" },
  { id: "arched", label: "Arched" },
  { id: "plain", label: "Plain glass" },
  { id: "shutters", label: "With shutters" },
];
export const FRAME_COLORS = ["#232625", "#FFFFFF", "#6E4A2E", "#C9A25A", "#2F3A34", "#8C3B2E"];

export const BACK_FEATURES: { id: BackFeature; label: string; description: string }[] = [
  { id: "name", label: "Your name", description: "Your shop's name, big and centred" },
  { id: "art", label: "Big picture", description: "A large framed print, or a photo of your own" },
  { id: "mirror", label: "Arched mirror", description: "A tall brass-framed mirror" },
  { id: "leaves", label: "Living wall", description: "A framed panel of leaves" },
  { id: "shelves", label: "Floating shelves", description: "Oak shelves with vases, books and plants" },
  { id: "products", label: "Your products", description: "Use the wall to show one of your categories" },
  { id: "none", label: "Plain", description: "Just the wall" },
];
export const BACK_LIGHTS: { id: BackLights; label: string }[] = [
  { id: "sconces", label: "Brass sconces" },
  { id: "globes", label: "Opal globes" },
  { id: "picture", label: "Picture light" },
  { id: "none", label: "None" },
];
export const BACK_CONSOLES: { id: BackConsole; label: string }[] = [
  { id: "flowers", label: "Console with flowers" },
  { id: "books", label: "Console with books" },
  { id: "none", label: "None" },
];

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
  { id: "lightbox", label: "Light box", swatch: ["#ffffff", "#1c2420"] },
  { id: "pill", label: "Colour pill", swatch: ["#2A772C", "#ffffff"] },
  { id: "neon", label: "Neon", swatch: ["#17191a", "#ff7aa8"] },
  { id: "brass", label: "Brass letters", swatch: ["#d8b26a", "#f6efe6"] },
  { id: "letter", label: "Letter board", swatch: ["#232323", "#f2efe8"] },
];

export const BACKDROPS: { id: BackdropStyle; label: string; swatch: [string, string] }[] = [
  { id: "oak", label: "Oak slats", swatch: ["#caa47c", "#b98f66"] },
  { id: "walnut", label: "Walnut slats", swatch: ["#6e4a2e", "#4f3420"] },
  { id: "fluted", label: "White fluted", swatch: ["#f4f1ea", "#e2ddd3"] },
  { id: "marble", label: "Marble slab", swatch: ["#f4f2ee", "#b9b4aa"] },
  { id: "painted", label: "Accent panel", swatch: ["#2A772C", "#c9a25a"] },
  { id: "brick", label: "Brick", swatch: ["#b4654a", "#e9ddd0"] },
  { id: "greenery", label: "Living wall", swatch: ["#3f8a45", "#76b85e"] },
  { id: "none", label: "Plain wall", swatch: ["#efebe4", "#efebe4"] },
];

export const RUGS: { id: RugStyle; label: string }[] = [
  { id: "plain", label: "Plain" },
  { id: "border", label: "Border" },
  { id: "stripes", label: "Stripes" },
  { id: "geometric", label: "Geometric" },
  { id: "jute", label: "Woven jute" },
  { id: "none", label: "No rug" },
];
export const RUG_COLORS = ["#EFE9DE", "#D9CBB4", "#9FB08A", "#C98F75", "#8FA6B8", "#2F3A34", "#E7C9A9", "#B7A4C9"];

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
  board: { style: "lightbox", title: "Welcome", subtitle: "" },
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
  backdrop: "oak",
  rug: { style: "border", color: RUG_COLORS[0] },
  counterName: true,
  categories: { custom: [], looks: {} },
  backWall: { feature: "name", art: { kind: "preset", id: "arch" }, lights: "sconces", plants: "olive", pot: "white", console: "flowers", category: null },
  signs: { style: "dark", color: null },
  entrance: { door: "steel", window: "grid", color: "#232625" },
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
const OLD_BOARDS: Record<string, BoardStyle> = { acrylic: "lightbox", oak: "pill" };

/** A safe, complete theme from whatever is stored (or sent by the editor). */
export function readTheme(raw: unknown): StoreTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_THEME;
  const bw = (t.backWall && typeof t.backWall === "object" ? t.backWall : {}) as Record<string, unknown>;
  const sg = (t.signs && typeof t.signs === "object" ? t.signs : {}) as Record<string, unknown>;
  const en = (t.entrance && typeof t.entrance === "object" ? t.entrance : {}) as Record<string, unknown>;

  // Floor: { style, color }, or an older plain name.
  const f = (t.floor && typeof t.floor === "object" ? t.floor : {}) as Record<string, unknown>;
  const floorStyle = typeof t.floor === "string" ? (OLD_FLOORS[t.floor] ?? d.floor.style) : oneOf(f.style, FLOORS, d.floor.style);
  const floorColors = FLOORS.find((x) => x.id === floorStyle)!.colors;
  // Any colour from the picker, or the style's first.
  const floorColor = typeof f.color === "string" && HEX.test(f.color) ? f.color : floorColors[0]!;

  // Lights: { style, tone }, or an older "warm"/"cool".
  const l = (t.lights && typeof t.lights === "object" ? t.lights : {}) as Record<string, unknown>;
  const lights =
    typeof t.lights === "string"
      ? { style: d.lights.style, tone: t.lights === "cool" ? ("cool" as const) : ("warm" as const) }
      : { style: oneOf(l.style, LIGHT_STYLES, d.lights.style), tone: oneOf(l.tone, LIGHT_TONES, d.lights.tone) };

  const b = (t.board && typeof t.board === "object" ? t.board : {}) as Record<string, unknown>;
  const r = (t.rug && typeof t.rug === "object" ? t.rug : {}) as Record<string, unknown>;

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
    board: { style: oneOf(OLD_BOARDS[b.style as string] ?? b.style, BOARDS, d.board.style), title: text(b.title, d.board.title, 28), subtitle: text(b.subtitle, d.board.subtitle, 48) },
    plants,
    art: [readArt(art[0], d.art[0]), readArt(art[1], d.art[1])],
    backdrop: oneOf(t.backdrop, BACKDROPS, d.backdrop),
    rug: { style: oneOf(r.style, RUGS, d.rug.style), color: typeof r.color === "string" && HEX.test(r.color) ? r.color : d.rug.color },
    counterName: typeof t.counterName === "boolean" ? t.counterName : d.counterName,
    categories: readCategories(t.categories),
    backWall: {
      feature: oneOf(bw.feature, BACK_FEATURES, d.backWall.feature),
      art: readArt(bw.art, d.backWall.art),
      lights: oneOf(bw.lights, BACK_LIGHTS, d.backWall.lights),
      plants: oneOf(bw.plants, PLANTS, d.backWall.plants),
      pot: oneOf(bw.pot, POTS, d.backWall.pot),
      console: oneOf(bw.console, BACK_CONSOLES, d.backWall.console),
      category: typeof bw.category === "string" && /^[a-z0-9-]{1,40}$/.test(bw.category) ? bw.category : null,
    },
    signs: { style: oneOf(sg.style, SIGN_STYLES, d.signs.style), color: typeof sg.color === "string" && HEX.test(sg.color) ? sg.color : null },
    entrance: { door: oneOf(en.door, DOOR_STYLES, d.entrance.door), window: oneOf(en.window, WINDOW_STYLES, d.entrance.window), color: typeof en.color === "string" && HEX.test(en.color) ? en.color : d.entrance.color },
  };
}

/** A business's own categories (named, with where they show) and its choices of where categories show. */
function readCategories(raw: unknown): StoreTheme["categories"] {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const custom: CustomCategory[] = [];
  for (const c of Array.isArray(r.custom) ? r.custom : []) {
    if (!c || typeof c !== "object" || custom.length >= MAX_CUSTOM_CATEGORIES) continue;
    const { name, placement } = c as Record<string, unknown>;
    const clean = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 32) : "";
    if (clean.length < 2) continue;
    const id = customCategoryId(clean);
    if (!custom.some((x) => x.id === id)) custom.push({ id, name: clean, placement: isPlacement(placement) ? placement : "shelf" });
  }
  // How each category looks; designs saved before held only "placements".
  const looks: Record<string, CategoryLook> = {};
  const saved = r.looks && typeof r.looks === "object" ? (r.looks as Record<string, unknown>) : {};
  const old = r.placements && typeof r.placements === "object" ? (r.placements as Record<string, unknown>) : {};
  for (const id of [...new Set([...Object.keys(saved), ...Object.keys(old)])].slice(0, 80)) {
    if (!isKnownCategory(id, custom)) continue;
    const l = (saved[id] && typeof saved[id] === "object" ? saved[id] : {}) as Record<string, unknown>;
    const look: CategoryLook = {};
    const placement = l.placement ?? old[id];
    if (isPlacement(placement)) look.placement = placement;
    if (l.side === "left" || l.side === "right") look.side = l.side;
    if (SHELF_STYLES.some((x) => x.id === l.shelf)) look.shelf = l.shelf as ShelfStyle;
    if (DISPLAY_TABLES.some((x) => x.id === l.table)) look.table = l.table as DisplayTableStyle;
    if (FRAME_STYLES.some((x) => x.id === l.frame)) look.frame = l.frame as FrameStyle;
    if (FRAME_SHAPES.some((x) => x.id === l.shape)) look.shape = l.shape as FrameShape;
    if (DISPLAY_SIZES.some((x) => x.id === l.size)) look.size = l.size as DisplaySize;
    if (Object.keys(look).length) looks[id] = look;
  }
  return { custom, looks };
}

/** The colour used for trim: the theme's accent, or the brand colour. */
export function accentOf(theme: StoreTheme, brandColor: string) {
  return theme.accent ?? (HEX.test(brandColor) ? brandColor : "#2A772C");
}

/** The pictures a theme uses from storage (so replaced ones can be deleted). */
export function themeImages(theme: StoreTheme) {
  return [...theme.art, theme.backWall.art].flatMap((a) => (a.kind === "image" ? [a.url] : []));
}

/** What the category picker needs to know about a business. */
export function categoryOptionsOf(business: { id: string; categories?: string[] | null; store_theme?: unknown }) {
  return { bizId: business.id, businessCategories: business.categories ?? [], custom: readTheme(business.store_theme).categories.custom };
}
