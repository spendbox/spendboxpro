// Real-world places on the game's map. One tile is 100 × 100 metres everywhere.
//
// Each region (a city to start with, later whole countries) is laid out on its own flat map
// centred on its origin, so shapes and distances inside it are true. Where the region sits on the
// world map (for zooming out to the whole world) comes from where its origin is on Earth.
// x runs east, z runs south (north is -z), as in the city layout (see roadMask).

export const TILE_M = 100;
/** Metres in one degree of latitude (and of longitude at the equator). */
const M_PER_DEG = 111_320;
const RAD = Math.PI / 180;

export type LatLon = { lat: number; lon: number };
/** A box in degrees: south, west, north, east. */
export type LatLonBox = { south: number; west: number; north: number; east: number };

/** How a region turns latitude and longitude into its own tiles. */
export type Frame = { origin: LatLon };

/** Tiles per degree of longitude in this frame (fewer away from the equator). */
const lonScale = (f: Frame) => (M_PER_DEG * Math.cos(f.origin.lat * RAD)) / TILE_M;
const latScale = M_PER_DEG / TILE_M;

/** Where a real place is, in the region's tiles (not rounded: tile (x, z) covers x-0.5 to x+0.5). */
export function toTile(f: Frame, p: LatLon): { x: number; z: number } {
  return { x: (p.lon - f.origin.lon) * lonScale(f), z: -(p.lat - f.origin.lat) * latScale };
}

/** The real place at a point in the region's tiles. */
export function toLatLon(f: Frame, x: number, z: number): LatLon {
  return { lat: f.origin.lat - z / latScale, lon: f.origin.lon + x / lonScale(f) };
}

/** The region's tiles covering a box of latitude and longitude (inclusive, rounded outwards). */
export function tileBounds(f: Frame, b: LatLonBox) {
  const a = toTile(f, { lat: b.north, lon: b.west });
  const c = toTile(f, { lat: b.south, lon: b.east });
  return { x0: Math.floor(a.x + 0.5), x1: Math.ceil(c.x - 0.5), z0: Math.floor(a.z + 0.5), z1: Math.ceil(c.z - 0.5) };
}

/**
 * Where a region's origin sits on the world map, in world tiles. An equal-area (sinusoidal) map:
 * a tile is 100 m across everywhere, so regions keep their real sizes next to each other.
 */
export function worldOffset(f: Frame): { x: number; z: number } {
  return {
    x: Math.round((f.origin.lon * M_PER_DEG * Math.cos(f.origin.lat * RAD)) / TILE_M),
    z: Math.round((-f.origin.lat * M_PER_DEG) / TILE_M),
  };
}
