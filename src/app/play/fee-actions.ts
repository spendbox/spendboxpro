"use server";

import { naira } from "@/lib/brand";
import { currentUserId } from "@/lib/game";
import { clubEntryMint, gameFeeMint, MONORAIL_FARE, RIDE_FARE_NAIRA, rideFare, TRAIN_FARE, visitFee } from "@/lib/fees";
import { spiralXY } from "@/lib/city/layout";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, regionMap } from "@/lib/world";
import { MINIGAME_BY_ID } from "./minigames/registry";

// Paying to go places: the first visit to a place in each town, and train fares (every time).
// The database (game-db/035_fees_and_jobs.sql) takes the mint and puts a share in the prize pool.

/** kick: you really can't go (not enough mint, a paused account); otherwise it's our problem, so let you in. */
type Fail = { ok: false; error: string; need?: number; kick?: boolean };
export type FeePaid = { ok: true; paid: number; coins: number };

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): Fail {
  const [code, arg] = (message ?? "").split(":");
  if (code === "not_enough") return { ok: false, error: `You need ${naira(arg)} for that.`, need: n(arg), kick: true };
  if (code === "frozen") return { ok: false, error: "Your account is paused right now.", kick: true };
  if (code === "unknown_player") return { ok: false, error: "Please sign in again." };
  console.error("Fee failed", message);
  return { ok: false, error: "Couldn't pay just now. Try again." };
}

/** Pay for a first visit to a place in this town (free if you've been before). */
export async function payVisit(place: string, type: string | undefined): Promise<FeePaid | Fail> {
  if (!/^b:\d{1,7}$/.test(place)) return { ok: false, error: "Unknown place." };
  const userId = await currentUserId();
  if (!userId) return { ok: true, paid: 0, coins: 0 };
  const { data, error } = await createAdminClient().rpc("pay_fee", { p_user: userId, p_kind: "visit", p_key: place, p_fee: visitFee(type) });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, paid: n(d.paid), coins: n(d.coins) };
}

/** Pay the fare to board a train (the monorail costs a little more). */
export async function payFare(index: number, monorail: boolean): Promise<FeePaid | Fail> {
  if (!Number.isInteger(index) || index < 0 || index > 99) return { ok: false, error: "Unknown train." };
  const userId = await currentUserId();
  if (!userId) return { ok: true, paid: 0, coins: 0 };
  const { data, error } = await createAdminClient().rpc("pay_fee", { p_user: userId, p_kind: "fare", p_key: `v:train:${index}`, p_fee: monorail ? MONORAIL_FARE : TRAIN_FARE });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, paid: n(d.paid), coins: n(d.coins) };
}

/**
 * Pay to board a ride on a real map (a train, a ferry, a balloon, a helicopter...), from your
 * Travel money then your wallet. The fare is the game's own (rideFare), never the browser's.
 */
export async function payRide(kind: string, index: number): Promise<FeePaid | Fail> {
  if (!(kind in RIDE_FARE_NAIRA) || !Number.isInteger(index) || index < 0 || index > 999) return { ok: false, error: "Unknown ride." };
  const userId = await currentUserId();
  if (!userId) return { ok: true, paid: 0, coins: 0 };
  const db = createAdminClient();
  const { data, error } = await db.rpc("life_ride", { p_user: userId, p_key: `v:${kind}:${index}`, p_fare: rideFare(kind) });
  if (error) {
    // Rides are never free: before part 61 is run they're switched off, and you need a life first.
    if (/life_ride/.test(error.message)) return { ok: false, error: "Rides are switched on soon.", kick: true };
    // The hourly towns (no life in the city): nothing to pay from, and nothing paid out either.
    if (error.message.startsWith("no_life")) return { ok: true, paid: 0, coins: 0 };
    return say(error.message);
  }
  const { data: me } = await db.from("profiles").select("coins").eq("id", userId).maybeSingle();
  return { ok: true, paid: n(data), coins: n(me?.coins) };
}

/**
 * Into a club on a real map: some charge at the door (the game's own price, never the browser's),
 * once every 24 hours. until: when your entry runs out.
 */
export async function payClubEntry(place: string, type: string | undefined): Promise<(FeePaid & { until: string | null }) | Fail> {
  if (!/^b:\d{1,7}$/.test(place)) return { ok: false, error: "Unknown place." };
  const userId = await currentUserId();
  if (!userId) return { ok: true, paid: 0, coins: 0, until: null };
  const db = createAdminClient();
  // A famous club has its own price (its landmark's): looked up on the map of the player's city.
  const { data: life } = await db.from("lives").select("region").eq("user_id", userId).maybeSingle();
  const region = String(life?.region ?? "");
  const map = REGIONS[region] ? regionMap(region) : null;
  const [x, z] = spiralXY(Number(place.slice(2)));
  const fee = clubEntryMint(place, type, REGIONS[region]?.prices.perMint ?? 1_500, map?.spotAt(x, z)?.door);
  const { data, error } = await db.rpc("life_club_entry", { p_user: userId, p_place: place, p_fee: fee });
  if (error) {
    // Never free at the door: before part 67 is run, entry is switched off; you need a life first.
    if (/life_club_entry|club_entries/.test(error.message)) return { ok: false, error: "Club entry is switched on soon.", kick: true };
    if (error.message.startsWith("no_life")) return { ok: false, error: "Start your life in the city first.", kick: true };
    return say(error.message);
  }
  const d = (data ?? {}) as Record<string, unknown>;
  const { data: me } = await db.from("profiles").select("coins").eq("id", userId).maybeSingle();
  return { ok: true, paid: n(d.paid), coins: n(me?.coins), until: d.until ? String(d.until) : null };
}

/** The places you've been to in this town (their first visit is paid). */
export async function myVisits(): Promise<string[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await createAdminClient().rpc("my_visits", { p_user: userId });
  if (error) return [];
  return Array.isArray(data) ? data.map(String) : [];
}

/** Games that aren't in the 100 (paintball, a card table's games). */
const EXTRA_GAMES = new Set(["paintball", "cards", "dice"]);

/**
 * Pay for a go at a game (the game's own price, never the browser's), from your Fun money, then
 * savings, then essentials. Games never pay out. off: the database part isn't run yet, so the
 * game is free until it is.
 */
export async function payToPlay(game: string): Promise<(FeePaid & { off?: boolean }) | Fail> {
  if (!EXTRA_GAMES.has(game) && !MINIGAME_BY_ID.has(game)) return { ok: false, error: "Unknown game." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play: each game costs a small fee.", kick: true };
  const db = createAdminClient();
  const { data, error } = await db.rpc("life_play_game", { p_user: userId, p_game: game, p_fee: gameFeeMint(game) });
  if (error) {
    if (/life_play_game/.test(error.message)) return { ok: true, paid: 0, coins: 0, off: true };
    // The hourly towns (no life in the city): nothing to pay from, and nothing paid out either.
    if (error.message.startsWith("no_life")) return { ok: true, paid: 0, coins: 0 };
    return say(error.message);
  }
  const { data: me } = await db.from("profiles").select("coins").eq("id", userId).maybeSingle();
  return { ok: true, paid: n(data), coins: n(me?.coins) };
}
