// What the city's moving parts need to know about the city they live in. City-view keeps one
// of these up to date (on every build and every frame), and the helper modules read it.

import type { CityPlan, Tile, TileKind } from "@/lib/city/layout";

export type World = {
  tiles: Tile[];
  plan: CityPlan | null;
  /** Half the width of the built city (in tiles), plus a margin. */
  radius: number;
  kindAt: Map<string, TileKind>;
  tileIndex: Map<string, number>;
  /** The drawn tiles by tile number (a big town only draws the part around the camera). */
  byIndex: Map<number, Tile>;
  /** Road tiles closed for road works. */
  blocked: Set<string>;
  /** When each tile started rising (performance.now() ms). */
  born: Map<number, number>;
  /** 0 = day, 1 = night (street lights on). */
  night: number;
  /** 0 = dry, up to 1 = pouring. */
  rain: number;
  /** How far through the hunt (0..1). */
  progress: number;
  /** False while the map is still a building site (the join window). */
  revealed: boolean;
};

export function makeWorld(): World {
  return {
    tiles: [],
    plan: null,
    radius: 10,
    kindAt: new Map(),
    tileIndex: new Map(),
    byIndex: new Map(),
    blocked: new Set(),
    born: new Map(),
    night: 0,
    rain: 0,
    progress: 0,
    revealed: true,
  };
}

export const keyOf = (x: number, z: number) => `${x},${z}`;

/** A road (or bridge) tile cars and people can use. */
export function roadAt(w: World, x: number, z: number) {
  const key = keyOf(x, z);
  const k = w.kindAt.get(key);
  return (k === "road" || k === "bridge") && !w.blocked.has(key);
}

export const isBridgeAt = (w: World, x: number, z: number) => w.kindAt.get(keyOf(x, z)) === "bridge";

/** Has this tile finished rising out of the ground? */
export function grown(w: World, tile: number, now: number) {
  const b = w.born.get(tile);
  return b !== undefined && now >= b + 700;
}

/** A street crossing with traffic lights and zebra crossings (not a bend, straight or roundabout). */
export function signalJunction(t: Tile) {
  if (t.kind !== "road" || t.roundabout) return false;
  const m = t.mask ?? 0;
  return ![3, 6, 12, 9, 5, 10, 1, 4, 2, 8].includes(m);
}

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
export const BRIDGE_TOP = 0.24;

/** Height of the road surface at a point along a stretch (bridges hump up in the middle). */
export function roadY(bridgeFrom: boolean, bridgeTo: boolean, t: number, base = 0.06) {
  const onBridge = t < 0.5 ? bridgeFrom : bridgeTo;
  if (!onBridge) return base;
  const off = Math.abs(t < 0.5 ? t : 1 - t);
  return base + (BRIDGE_TOP - 0.06) * Math.min(1, Math.max(0, (0.5 - off) / 0.3));
}
