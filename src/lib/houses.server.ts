import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_HOUSE, TILES_PER_HOUSE, validDesign, type HouseDesign, type TownHouse } from "@/lib/houses";

// Player houses on the server: the houses standing in a game (a snapshot the database takes when
// each game starts, see game-db/023_houses.sql) and the signed-in player's own house.

type Db = ReturnType<typeof createAdminClient>;

/** The signed-in player's house, as the house editor and the game screen need it. */
export type MyHouse = {
  /** True once they've saved a design. */
  saved: boolean;
  /** Their saved design (the starter design if they haven't saved one yet). */
  design: HouseDesign;
  /** "Show my house in the game" is on: it goes into every new game. */
  published: boolean;
  /** Their house stands in the current game (switching off doesn't remove it from this one). */
  standing: boolean;
  /** Its slot in the current game (0, 1, 2…), or null. */
  slot: number | null;
  /** The current game. */
  roundId: number | null;
  /** The player's name (for the sign when the house has no name). */
  owner: string | null;
  /** Design changes they can still save today. */
  savesLeft: number;
  /** Extra spots each house adds to a town. */
  tilesPerHouse: number;
};

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return v !== null && v !== undefined && Number.isFinite(n) ? n : fallback;
};

/** A saved design from the database (null if it no longer fits the catalog). */
function designOf(raw: unknown): HouseDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const d = {
    name: typeof r.name === "string" ? r.name : "",
    style: r.style,
    wall: typeof r.wall === "string" ? r.wall.toLowerCase() : r.wall,
    roof: typeof r.roof === "string" ? r.roof.toLowerCase() : r.roof,
    interior: r.interior,
  } as Partial<HouseDesign>;
  return validDesign(d) ? { name: d.name, style: d.style, wall: d.wall, roof: d.roof, interior: d.interior } : null;
}

/** Turns my_house / save_house / set_house_published output into a MyHouse (null if it isn't one). */
export function parseMyHouse(raw: unknown): MyHouse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const design = designOf(r.design);
  return {
    saved: r.saved === true && design !== null,
    design: design ?? DEFAULT_HOUSE,
    published: r.published === true,
    standing: r.standing === true,
    slot: r.slot === null || r.slot === undefined ? null : num(r.slot),
    roundId: r.round_id === null || r.round_id === undefined ? null : num(r.round_id),
    owner: typeof r.owner === "string" && r.owner.trim() ? r.owner : null,
    savesLeft: Math.max(0, Math.floor(num(r.saves_left))),
    tilesPerHouse: num(r.tiles_per_house, TILES_PER_HOUSE),
  };
}

/** A game's houses are fixed when it starts, so each server keeps them for a minute. */
const roundCache = new Map<number, { at: number; houses: TownHouse[] }>();
const ROUND_CACHE_MS = 60_000;

/**
 * The houses standing in one game, in slot order (one query, then kept for a minute). A house
 * with no name gets "<owner>'s house" on its sign. Never throws: a problem just means no houses
 * this time.
 */
export async function loadRoundHouses(db: Db, roundId: number): Promise<TownHouse[]> {
  if (!Number.isSafeInteger(roundId) || roundId <= 0) return [];
  const hit = roundCache.get(roundId);
  if (hit && Date.now() - hit.at < ROUND_CACHE_MS) return hit.houses;
  const houses = await fetchRoundHouses(db, roundId);
  if (!houses) return [];
  if (roundCache.size > 8) roundCache.clear();
  roundCache.set(roundId, { at: Date.now(), houses });
  return houses;
}

/** null: it couldn't be loaded (not remembered, so the next call tries again). */
async function fetchRoundHouses(db: Db, roundId: number): Promise<TownHouse[] | null> {
  try {
    const { data, error } = await db.rpc("round_houses_of", { p_round: roundId });
    if (error) {
      console.error("Couldn't load the houses for game", roundId, error.message);
      return null;
    }
    if (!Array.isArray(data)) return [];
    const out: TownHouse[] = [];
    for (const row of data as Record<string, unknown>[]) {
      const design = designOf(row);
      if (!design || typeof row.user_id !== "string") continue;
      const owner = typeof row.owner === "string" && row.owner.trim() ? row.owner : "A player";
      out.push({ ...design, name: design.name || `${owner}'s house`, slot: num(row.slot), ownerId: row.user_id, owner });
    }
    return out;
  } catch (e) {
    console.error("Couldn't load the houses for game", roundId, e);
    return null;
  }
}

/** A player's own house (one query), or null if it couldn't be loaded. Never throws. */
export async function loadMyHouse(db: Db, userId: string): Promise<MyHouse | null> {
  try {
    const { data, error } = await db.rpc("my_house", { p_user: userId });
    if (error) {
      console.error("Couldn't load the player's house", error.message);
      return null;
    }
    return parseMyHouse(data);
  } catch (e) {
    console.error("Couldn't load the player's house", e);
    return null;
  }
}
