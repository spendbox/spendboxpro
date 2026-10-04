// How a business's 3D store looks. Kept in businesses.store_theme as JSON and
// read the same way by the map, the store and the designer. New themes are
// added to THEMES; anything unknown falls back to the defaults.

export type FloorStyle = "wood" | "tiles" | "terrazzo";
export type LightStyle = "warm" | "cool";

export interface StoreTheme {
  theme: "boutique";
  /** Wall colour. */
  wall: string;
  floor: FloorStyle;
  /** Counter, awning and trim. Null = the business's brand colour. */
  accent: string | null;
  lounge: boolean;
  plants: boolean;
  lights: LightStyle;
}

export const THEMES = [
  {
    id: "boutique" as const,
    name: "Boutique",
    description: "A bright shop with a counter, shelves of your products and a cosy lounge.",
  },
];

export const WALL_COLORS = ["#F6EFE6", "#EEF3EC", "#EAF0F6", "#F7E9EC", "#F3EEDF", "#ECE9F5", "#E9E4DC", "#2F3A34"];
export const ACCENT_COLORS = ["#2A772C", "#1C2B24", "#4338A0", "#A33A0B", "#A3214E", "#0F5E8C", "#7A4B12", "#C98A1B"];
export const FLOORS: { id: FloorStyle; label: string }[] = [
  { id: "wood", label: "Wood" },
  { id: "tiles", label: "Tiles" },
  { id: "terrazzo", label: "Terrazzo" },
];

const HEX = /^#[0-9a-f]{6}$/i;

export const DEFAULT_THEME: StoreTheme = { theme: "boutique", wall: WALL_COLORS[0], floor: "wood", accent: null, lounge: true, plants: true, lights: "warm" };

/** A safe, complete theme from whatever is stored (or sent by the designer). */
export function readTheme(raw: unknown): StoreTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    theme: "boutique",
    wall: typeof t.wall === "string" && HEX.test(t.wall) ? t.wall : DEFAULT_THEME.wall,
    floor: FLOORS.some((f) => f.id === t.floor) ? (t.floor as FloorStyle) : DEFAULT_THEME.floor,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent : null,
    lounge: typeof t.lounge === "boolean" ? t.lounge : DEFAULT_THEME.lounge,
    plants: typeof t.plants === "boolean" ? t.plants : DEFAULT_THEME.plants,
    lights: t.lights === "cool" ? "cool" : "warm",
  };
}

/** The colour used for trim: the theme's accent, or the brand colour. */
export function accentOf(theme: StoreTheme, brandColor: string) {
  return theme.accent ?? (HEX.test(brandColor) ? brandColor : "#2A772C");
}
