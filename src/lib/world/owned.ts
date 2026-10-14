// Properties people own are kept exactly as they were bought, whatever happens to the map
// around them (docs/PROPERTY.md). When a property is bought, its whole building (kind, storeys,
// units, look) is saved with the purchase; on the map, a saved property always stands where it
// was, even if the map data is baked again, an area is corrected, or the rules that make
// buildings change. Owners can also give their property its own name.
//
// Before any map update goes out, checkOwned() lists every owned property the new map would put
// something else on (a road, water, a bridge, another building), so the update can be routed
// round it, or the owner offered a swap, instead of anyone's property disappearing.

import type { Building } from "./buildings.ts";

export type OwnedProperty = {
  /** The building's id ("lagos:12,-40"): where it stands, for good. */
  id: string;
  /** The building as it was when bought (or as its owner has since changed it). */
  building: Building;
  /** Its owner's name for it ("Ada's Place"), if they've given it one. */
  name?: string;
};

/** Where an owned property's building id says it stands. */
export function ownedSpot(id: string): { region: string; x: number; z: number } | null {
  const m = /^([a-z0-9-]+):(-?\d+),(-?\d+)$/.exec(id);
  return m ? { region: m[1], x: Number(m[2]), z: Number(m[3]) } : null;
}

/** A name owners can give: 2 to 40 letters, numbers, spaces and simple punctuation, tidied. */
export function cleanPropertyName(raw: string): string | null {
  // Phones type curly quotes ("Ada’s Palace"): the same as a straight one.
  const name = raw.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) return null;
  if (!/^[\p{L}\p{N} '&.,()-]+$/u.test(name)) return null;
  return name;
}

export type OwnedConflict = { id: string; name?: string; problem: string };

/**
 * Owned properties a new map would change: `now(x, z)` is what the new map puts on the tile
 * ("road", "water", "deck", "landmark", or the building there). Empty when the update is safe.
 */
export function checkOwned(owned: OwnedProperty[], now: (x: number, z: number) => Building | "road" | "water" | "deck" | "landmark" | "open"): OwnedConflict[] {
  const out: OwnedConflict[] = [];
  for (const o of owned) {
    const spot = ownedSpot(o.id);
    if (!spot) {
      out.push({ id: o.id, name: o.name, problem: "its id doesn't say where it stands" });
      continue;
    }
    const there = now(spot.x, spot.z);
    if (typeof there === "string") {
      out.push({ id: o.id, name: o.name, problem: `the new map puts ${there === "open" ? "open ground" : there === "deck" ? "a bridge or railway" : `a ${there}`} there` });
    } else if (there.kind !== o.building.kind || there.units.length !== o.building.units.length) {
      // Not a problem for the owner (theirs stays as it is), but worth knowing: the map would
      // have made it something else.
      out.push({ id: o.id, name: o.name, problem: `the new map would make it a ${there.kind} (it stays a ${o.building.kind})` });
    }
  }
  return out;
}
