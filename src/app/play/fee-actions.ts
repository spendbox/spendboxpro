"use server";

import { currentUserId } from "@/lib/game";
import { MONORAIL_FARE, RIDE_FARE_NAIRA, rideFare, TRAIN_FARE, visitFee } from "@/lib/fees";
import { createAdminClient } from "@/lib/supabase/admin";

// Paying to go places: the first visit to a place in each town, and train fares (every time).
// The database (game-db/035_fees_and_jobs.sql) takes the mint and puts a share in the prize pool.

/** kick: you really can't go (not enough mint, a paused account); otherwise it's our problem, so let you in. */
type Fail = { ok: false; error: string; need?: number; kick?: boolean };
export type FeePaid = { ok: true; paid: number; coins: number };

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): Fail {
  const [code, arg] = (message ?? "").split(":");
  if (code === "not_enough") return { ok: false, error: `You need ₥${arg} for that.`, need: n(arg), kick: true };
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
    // Before part 61 is run: the old fare (only charged during an hourly game).
    if (/life_ride/.test(error.message)) return payFare(Math.min(index, 99), false);
    // No life on the map yet (just watching the city): the ride's on the house.
    if (error.message.startsWith("no_life")) return { ok: true, paid: 0, coins: 0 };
    return say(error.message);
  }
  const { data: me } = await db.from("profiles").select("coins").eq("id", userId).maybeSingle();
  return { ok: true, paid: n(data), coins: n(me?.coins) };
}

/** The places you've been to in this town (their first visit is paid). */
export async function myVisits(): Promise<string[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await createAdminClient().rpc("my_visits", { p_user: userId });
  if (error) return [];
  return Array.isArray(data) ? data.map(String) : [];
}
