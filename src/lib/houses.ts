// Player houses (phase 1): built from what the city already draws. Shared by the house editor,
// the server (it checks every saved choice against these lists) and the 3D city.

export type HouseStyle = "cottage" | "bungalow" | "modern" | "duplex" | "villa";
export type HouseInterior = "living" | "lounge" | "studio" | "party" | "dining";

export const HOUSE_STYLES: { id: HouseStyle; label: string; blurb: string }[] = [
  { id: "cottage", label: "Cottage", blurb: "Cosy, one floor, pitched roof" },
  { id: "bungalow", label: "Bungalow", blurb: "Wide and roomy, one floor" },
  { id: "modern", label: "Modern", blurb: "Flat roof, pool, roof terrace" },
  { id: "duplex", label: "Duplex", blurb: "Two floors and a garage" },
  { id: "villa", label: "Villa", blurb: "Big, bright, with a pool" },
];

export const WALL_COLOURS = ["#f8f9fa", "#ffe8cc", "#fff3bf", "#d3f9d8", "#d0ebff", "#e5dbff", "#ffdeeb", "#e9ecef", "#c5a880", "#868e96"];
export const ROOF_COLOURS = ["#c92a2a", "#e8590c", "#5c3d2e", "#2b8a3e", "#1864ab", "#5f3dc4", "#343a40", "#adb5bd"];

export const HOUSE_INTERIORS: { id: HouseInterior; label: string; blurb: string }[] = [
  { id: "living", label: "Living room", blurb: "Sofas, rug, TV" },
  { id: "lounge", label: "Lounge", blurb: "Low lights, a small bar" },
  { id: "studio", label: "Studio", blurb: "Desks and a big window" },
  { id: "party", label: "Party room", blurb: "Dance floor and speakers" },
  { id: "dining", label: "Dining room", blurb: "Big table, kitchen pass" },
];

/** A house as saved by its owner. */
export type HouseDesign = {
  name: string;
  style: HouseStyle;
  wall: string;
  roof: string;
  interior: HouseInterior;
};

/** A house standing in this game's town: its design, whose it is, and its slot (0, 1, 2…). */
export type TownHouse = HouseDesign & { slot: number; ownerId: string; owner: string };

export const HOUSE_NAME_MAX = 24;
/** Extra spots each house adds to the town. */
export const TILES_PER_HOUSE = 5;

export const DEFAULT_HOUSE: HouseDesign = { name: "", style: "cottage", wall: WALL_COLOURS[1], roof: ROOF_COLOURS[0], interior: "living" };

/** Tidies a house name: letters, numbers, spaces and simple punctuation, at most 24 characters. */
export function cleanHouseName(raw: string) {
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} '&.,!-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HOUSE_NAME_MAX);
}

/** True if a design only uses choices from the lists above. */
export function validDesign(d: Partial<HouseDesign>): d is HouseDesign {
  return (
    typeof d.name === "string" &&
    HOUSE_STYLES.some((s) => s.id === d.style) &&
    WALL_COLOURS.includes(d.wall as string) &&
    ROOF_COLOURS.includes(d.roof as string) &&
    HOUSE_INTERIORS.some((i) => i.id === d.interior)
  );
}

/** "Sunny Side · Ada's house" (just "Ada's house" when it has no name of its own). */
export function homeLabel(h: { name: string; owner: string }) {
  const theirs = `${h.owner}'s house`;
  return h.name && h.name !== theirs ? `${h.name} · ${theirs}` : theirs;
}
