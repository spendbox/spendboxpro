"use server";

import { currentUserId } from "@/lib/game";
import { cleanHouseName, validDesign, type HouseDesign } from "@/lib/houses";
import { loadMyHouse, parseMyHouse, type MyHouse as House } from "@/lib/houses.server";
import { createAdminClient } from "@/lib/supabase/admin";

// The player's house: load it, save a design, and switch "Show my house in the game" on or off.
// The database (save_house / set_house_published in game-db/023_houses.sql) checks every choice
// against the catalog, filters rude names and limits edits to 30 a day. Houses are free for now.
// Nothing here throws: every failure comes back as { ok: false, error } in plain words.

export type MyHouse = House;

type Fail = { ok: false; error: string };
type Ok = { ok: true; house: MyHouse };

function friendly(message: string | undefined, fallback: string) {
  const m = message ?? "";
  if (m.startsWith("too_many_saves")) return "That's all the changes you can save today. Come back tomorrow!";
  const map: Record<string, string> = {
    unknown_player: "Please sign in again.",
    bot: "The bot can't have a house.",
    frozen: "Your account is paused right now.",
    bad_style: "Pick one of the house styles.",
    bad_wall: "Pick one of the wall colours.",
    bad_roof: "Pick one of the roof colours.",
    bad_interior: "Pick one of the room styles.",
    rude_name: "Please pick a kinder name for your house.",
    no_house: "Save your house first.",
    no_name: "Pick a player name first, then you can show your house.",
  };
  const code = Object.keys(map).find((k) => m.startsWith(k));
  if (!code) console.error("House action failed", m);
  return code ? map[code] : fallback;
}

/** The signed-in player's house (their saved design, whether it's shown, and whether it stands now). */
export async function getMyHouse(): Promise<Ok | Fail> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "Sign in to build your house." };
    const house = await loadMyHouse(createAdminClient(), userId);
    return house ? { ok: true, house } : { ok: false, error: "Couldn't load your house. Try again." };
  } catch (e) {
    console.error("getMyHouse failed", e);
    return { ok: false, error: "Couldn't load your house. Try again." };
  }
}

/** Save a house design. Changes show in the town from the next game. */
export async function saveHouse(design: HouseDesign): Promise<(Ok & { changed: boolean }) | Fail> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "Sign in to build your house." };
    if (!design || typeof design !== "object") return { ok: false, error: "Pick a style, colours and a room first." };
    const d: Partial<HouseDesign> = {
      name: cleanHouseName(typeof design.name === "string" ? design.name : ""),
      style: design.style,
      wall: typeof design.wall === "string" ? design.wall.toLowerCase() : design.wall,
      roof: typeof design.roof === "string" ? design.roof.toLowerCase() : design.roof,
      interior: design.interior,
    };
    if (!validDesign(d)) return { ok: false, error: "Pick a style, colours and a room from the lists." };
    const { data, error } = await createAdminClient().rpc("save_house", {
      p_user: userId,
      p_name: d.name,
      p_style: d.style,
      p_wall: d.wall,
      p_roof: d.roof,
      p_interior: d.interior,
    });
    const house = error ? null : parseMyHouse(data);
    if (!house) return { ok: false, error: friendly(error?.message, "Couldn't save your house. Try again.") };
    return { ok: true, house, changed: (data as { changed?: unknown }).changed === true };
  } catch (e) {
    console.error("saveHouse failed", e);
    return { ok: false, error: "Couldn't save your house. Try again." };
  }
}

/**
 * Switch "Show my house in the game" on or off. It counts from the next game: a house already
 * standing in this game stays until it ends. Free for now (and switching off refunds nothing).
 */
export async function setHousePublished(on: boolean): Promise<Ok | Fail> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "Sign in to show your house." };
    if (typeof on !== "boolean") return { ok: false, error: "Couldn't change that. Try again." };
    const { data, error } = await createAdminClient().rpc("set_house_published", { p_user: userId, p_on: on });
    const house = error ? null : parseMyHouse(data);
    if (!house) return { ok: false, error: friendly(error?.message, "Couldn't change that. Try again.") };
    return { ok: true, house };
  } catch (e) {
    console.error("setHousePublished failed", e);
    return { ok: false, error: "Couldn't change that. Try again." };
  }
}
