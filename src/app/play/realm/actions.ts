"use server";

import { naira } from "@/lib/brand";
import { currentUserId } from "@/lib/game";
import { inArena } from "@/lib/realm/battle";
import { armyCost, cleanArmy } from "@/lib/realm/fighters";
import { ARENA_SIZE, ARRIVE_SECS, CLOSE_SECS, MAX_SENDS, MAX_SPEND_PER_BATTLE, SEND_GAP_SECS, battleAt, canSend } from "@/lib/realm/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

// The Spirit Realm (docs/REALM.md; the database part is game-db/118_spirit_realm.sql). Money only
// moves in the database: what troops cost, and the prizes.

type Fail = { ok: false; error: string };
const OFF = "The Spirit Realm opens soon (the game's owner has one update to run).";
const missing = (m: string) => /realm_/.test(m);

function say(message: string): Fail {
  const [code, arg] = message.split(":");
  if (code === "not_enough") return { ok: false, error: `You need ${arg ? naira(arg) : "more"} for those troops.` };
  if (code === "too_much") return { ok: false, error: arg && Number(arg) > 0 ? `You can spend ${naira(arg)} more in this battle.` : "You've spent all you can in this battle." };
  if (code === "too_many") return { ok: false, error: "You've sent all the troops you can this battle." };
  if (code === "too_quick") return { ok: false, error: "Your last troops are still coming through. Try again in a few seconds." };
  if (code === "closed") return { ok: false, error: "This battle is nearly over: no more troops. The next one starts on the hour." };
  if (code === "not_yet" || code === "bad_time") return { ok: false, error: "That battle isn't on." };
  if (code === "outside") return { ok: false, error: "Pick a spot inside the ring." };
  if (code === "no_life") return { ok: false, error: "Start your life in the city first." };
  if (code === "frozen") return { ok: false, error: "Your account is paused right now." };
  if (code === "bad_army") return { ok: false, error: "Pick some troops first." };
  if (missing(message)) return { ok: false, error: OFF };
  console.error("Spirit Realm failed", message);
  return { ok: false, error: "That didn't work. Try again." };
}

export type RealmMe = {
  signedIn: boolean;
  /** Not set up yet (the database part isn't run). */
  off?: boolean;
  /** What you can spend (Fun money and wallet, in mint); null if it couldn't be read. */
  canSpend: number | null;
  /** The battle on now, and you in it (null: you haven't sent troops yet). */
  now: { at: number; mine: { arena: number; seq: number; spent: number; sends: number } | null };
  /** Your last battle that's been paid out. */
  last: { at: number; rank: number | null; prize: number; points: number; players: number } | null;
};

type Row = { at: string; seq: number; arena: number; spent: number; sends: number; rank: number | null; prize: number | null; points: number | null };

/** You in the Spirit Realm: you in the battle on now, how your last one went, and what you can spend. */
export async function realmMe(): Promise<RealmMe> {
  const at = battleAt(Date.now());
  const userId = await currentUserId();
  if (!userId) return { signedIn: false, canSpend: null, now: { at, mine: null }, last: null };
  const db = createAdminClient();
  const [rows, spend] = await Promise.all([
    db.from("realm_armies").select("at, seq, arena, spent, sends, rank, prize, points").eq("user_id", userId).order("at", { ascending: false }).limit(3),
    db.rpc("life_can_spend", { p_user: userId, p_pots: ["fun"] }),
  ]);
  const canSpend = spend.error || spend.data == null ? null : Number(spend.data);
  if (rows.error) return { signedIn: true, off: missing(rows.error.message), canSpend, now: { at, mine: null }, last: null };
  const list = (rows.data ?? []) as Row[];
  const mine = list.find((r) => Date.parse(r.at) === at);
  const done = list.find((r) => Date.parse(r.at) < at && r.rank != null);
  let players = 0;
  if (done) {
    const { count } = await db.from("realm_armies").select("user_id", { count: "exact", head: true }).eq("at", done.at).eq("arena", done.arena);
    players = count ?? 0;
  }
  return {
    signedIn: true,
    canSpend,
    now: { at, mine: mine ? { arena: mine.arena, seq: mine.seq, spent: Number(mine.spent), sends: mine.sends } : null },
    last: done ? { at: Date.parse(done.at), rank: done.rank, prize: Number(done.prize ?? 0), points: Number(done.points ?? 0), players } : null,
  };
}

/** Send troops into the battle on now, at (x, y) in the arena (battle units from its middle). */
export async function sendTroops(at: number, x: number, y: number, raw: unknown): Promise<{ ok: true; me: RealmMe; secs: number } | Fail> {
  const now = Date.now();
  if (at !== battleAt(now)) return { ok: false, error: "That battle is over. Send troops into the one on now." };
  if (!canSend(at, now)) return say("closed");
  if (!Number.isFinite(x) || !Number.isFinite(y) || !inArena(x, y)) return say("outside");
  const troops = cleanArmy(raw);
  if (!troops) return { ok: false, error: "Those troops aren't allowed: pick at least one, and keep within the limits." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to fight in the Spirit Realm." };
  const { error } = await createAdminClient().rpc("realm_send", {
    p_user: userId,
    p_at: new Date(at).toISOString(),
    p_x: Math.round(x * 10) / 10,
    p_y: Math.round(y * 10) / 10,
    p_fighters: troops.fighters,
    p_weapons: troops.weapons,
    p_armour: troops.armour,
    p_cost: armyCost(troops),
    p_arena_size: ARENA_SIZE,
    p_delay: ARRIVE_SECS,
    p_gap: SEND_GAP_SECS,
    p_close: CLOSE_SECS,
    p_max_spend: MAX_SPEND_PER_BATTLE,
    p_max_sends: MAX_SENDS,
  });
  if (error) return say(error.message);
  return { ok: true, me: await realmMe(), secs: ARRIVE_SECS };
}
