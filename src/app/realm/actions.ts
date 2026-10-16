"use server";

import { naira } from "@/lib/brand";
import { currentUserId } from "@/lib/game";
import { armyCost, cleanArmy, type Army } from "@/lib/realm/fighters";
import { ARENA_SIZE, GATES, nextBattleAt } from "@/lib/realm/schedule";
import { storedArmy } from "@/lib/realm/server";
import { createAdminClient } from "@/lib/supabase/admin";

// The Spirit Realm (docs/REALM.md; the database part is game-db/118_spirit_realm.sql). Money only
// moves in the database: what an army costs, the difference when it changes, and the prize.

type Fail = { ok: false; error: string };
const OFF = "The Spirit Realm opens soon (the game's owner has one update to run).";
const missing = (m: string) => /realm_/.test(m);

function say(message: string): Fail {
  const [code, arg] = message.split(":");
  if (code === "not_enough") return { ok: false, error: `You need ${arg ? naira(arg) : "more"} more for that army.` };
  if (code === "started") return { ok: false, error: "Too late: that battle has begun. Get ready for the next one." };
  if (code === "too_soon" || code === "bad_time") return { ok: false, error: "That battle isn't open yet." };
  if (code === "no_life") return { ok: false, error: "Start your life in the city first." };
  if (code === "frozen") return { ok: false, error: "Your account is paused right now." };
  if (code === "bad_gate" || code === "bad_army") return { ok: false, error: "Pick some fighters and a gate first." };
  if (missing(message)) return { ok: false, error: OFF };
  console.error("Spirit Realm failed", message);
  return { ok: false, error: "That didn't work. Try again." };
}

export type MyArmy = Army & { gate: number; spent: number; arena: number; seq: number };

export type RealmMe = {
  signedIn: boolean;
  /** Not set up yet (the database part isn't run). */
  off?: boolean;
  /** What you can spend (Fun money and wallet, in mint); null if it couldn't be read. */
  canSpend: number | null;
  /** The next battle and your army in it (null: not joined yet). */
  next: { at: number; army: MyArmy | null };
  /** Your armies in the last few battles: where to watch them, and how they did. */
  past: { at: number; arena: number; seq: number; rank: number | null; prize: number | null }[];
};

type Row = { at: string; seq: number; arena: number; gate: number; fighters: unknown; weapons: number; armour: number; spent: number; rank: number | null; prize: number | null };

/** You in the Spirit Realm: your army for the next battle, your last ones, and what you can spend. */
export async function realmMe(): Promise<RealmMe> {
  const next = nextBattleAt(Date.now());
  const userId = await currentUserId();
  if (!userId) return { signedIn: false, canSpend: null, next: { at: next, army: null }, past: [] };
  const db = createAdminClient();
  const [rows, spend] = await Promise.all([
    db.from("realm_armies").select("at, seq, arena, gate, fighters, weapons, armour, spent, rank, prize").eq("user_id", userId).order("at", { ascending: false }).limit(6),
    db.rpc("life_can_spend", { p_user: userId, p_pots: ["fun"] }),
  ]);
  const canSpend = spend.error || spend.data == null ? null : Number(spend.data);
  if (rows.error) return { signedIn: true, off: missing(rows.error.message), canSpend, next: { at: next, army: null }, past: [] };
  const list = (rows.data ?? []) as Row[];
  const mine = list.find((r) => Date.parse(r.at) === next);
  return {
    signedIn: true,
    canSpend,
    next: {
      at: next,
      army: mine ? { ...storedArmy(mine.fighters, mine.weapons, mine.armour), gate: mine.gate, spent: Number(mine.spent), arena: mine.arena, seq: mine.seq } : null,
    },
    past: list
      .filter((r) => Date.parse(r.at) < next)
      .map((r) => ({ at: Date.parse(r.at), arena: r.arena, seq: r.seq, rank: r.rank, prize: r.prize == null ? null : Number(r.prize) })),
  };
}

/** Join the next battle with this army from this gate, or change your army for it. */
export async function enlist(at: number, gate: number, raw: unknown): Promise<{ ok: true; me: RealmMe; paid: number } | Fail> {
  if (at !== nextBattleAt(Date.now())) return { ok: false, error: "That battle has begun. Get ready for the next one." };
  const g = Math.floor(Number(gate));
  if (!Number.isFinite(g) || g < 0 || g >= GATES) return { ok: false, error: "Pick the gate you start from." };
  const army = cleanArmy(raw);
  if (!army) return { ok: false, error: "That army isn't allowed: pick at least one fighter, and keep within the limits." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to fight in the Spirit Realm." };
  const { data, error } = await createAdminClient().rpc("realm_enlist", {
    p_user: userId,
    p_at: new Date(at).toISOString(),
    p_gate: g,
    p_fighters: army.fighters,
    p_weapons: army.weapons,
    p_armour: army.armour,
    p_cost: armyCost(army),
    p_arena_size: ARENA_SIZE,
  });
  if (error) return say(error.message);
  return { ok: true, me: await realmMe(), paid: Number((data as { paid?: number } | null)?.paid ?? 0) };
}

/** Leave the next battle before it begins: everything you spent on the army comes back. */
export async function leaveRealm(at: number): Promise<{ ok: true; me: RealmMe; back: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data, error } = await createAdminClient().rpc("realm_leave", { p_user: userId, p_at: new Date(at).toISOString() });
  if (error) return say(error.message);
  return { ok: true, me: await realmMe(), back: Number(data ?? 0) };
}
