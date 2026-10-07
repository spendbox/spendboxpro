"use server";

import { cleanAvatar, type Avatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Pop a coin balloon. The server checks it really is your balloon, right now. */
export async function claimBalloon(slot: number): Promise<Result<{ coins: number; leftToday: number }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: settings } = await db.from("game_settings").select("key, value").in("key", ["balloon_minutes"]);
  const minutes = Number(settings?.[0]?.value ?? 4);
  const current = Math.floor(Date.now() / (minutes * 60_000));
  const lucky = parseInt(userId.replace(/-/g, "").slice(0, 6), 16) % 3 !== slot % 3;
  if (!Number.isInteger(slot) || slot < current - 1 || slot > current || !lucky) {
    return { ok: false, error: "That balloon has floated away." };
  }
  const { data: round } = await db.from("rounds").select("status").order("id", { ascending: false }).limit(1).maybeSingle();
  if (round?.status !== "seek") return { ok: false, error: "That balloon has floated away." };
  const { data, error } = await db.rpc("claim_balloon", { p_user: userId, p_slot: slot });
  if (error) return { ok: false, error: error.message };
  return { ok: true, coins: Number(data.coins), leftToday: Number(data.left_today) };
}

export async function saveAvatar(avatar: Avatar): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: me } = await db.from("profiles").select("username").eq("id", userId).single();
  const { error } = await db.from("profiles").update({ avatar: cleanAvatar(avatar, me?.username ?? userId) }).eq("id", userId);
  return error ? { ok: false, error: "Couldn't save your look. Try again." } : { ok: true };
}

/** Counts one visit (the page calls this once per browser session). */
export async function recordVisit(): Promise<Result<{ visits: number }>> {
  const { data, error } = await createAdminClient().rpc("count_visit");
  return error ? { ok: false, error: "" } : { ok: true, visits: Number(data) };
}

export type Badge = { id: number; badge: string; detail: string | null; roundId: number | null; at: string };
export type Leader = { id: string; name: string; avatar: Avatar; won: number };

const WIN_KINDS = ["catch_reward", "bot_bounty", "pool_hider", "pool_seeker"];

/** Your record, your badges, and the week's leaderboard (for the menu). */
export async function loadMyStats(): Promise<
  Result<{
    won: number;
    rounds: number;
    catches: number;
    survived: number;
    badges: Badge[];
    leaders: Leader[];
    myRank: number | null;
  }>
> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [mine, rounds, catches, survived, badges, week] = await Promise.all([
    db.from("ledger").select("amount").eq("user_id", userId).in("kind", WIN_KINDS).limit(10000),
    db.from("entries").select("round_id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("entries").select("user_id", { count: "exact", head: true }).eq("caught_by", userId),
    db.from("badges").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("badge", "survivor"),
    db.from("badges").select("id, badge, detail, round_id, earned_at").eq("user_id", userId).order("earned_at", { ascending: false }).limit(2000),
    db.from("ledger").select("user_id, amount").in("kind", WIN_KINDS).gt("created_at", weekAgo).not("user_id", "is", null).limit(20000),
  ]);
  const totals = new Map<string, number>();
  for (const row of week.data ?? []) totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + Number(row.amount));
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 10);
  const { data: people } = top.length
    ? await db.from("profiles").select("id, username, avatar, is_bot").in("id", top.map(([id]) => id))
    : { data: [] as { id: string; username: string | null; avatar: unknown; is_bot: boolean }[] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const leaders = top
    .map(([id, won]) => {
      const p = byId.get(id);
      if (!p || p.is_bot) return null;
      const name = p.username ?? "Player";
      return { id, name, avatar: cleanAvatar(p.avatar, name), won: Math.round(won * 100) / 100 };
    })
    .filter((x): x is Leader => x !== null);
  const rank = ranked.findIndex(([id]) => id === userId);
  return {
    ok: true,
    won: Math.round((mine.data ?? []).reduce((t, r) => t + Number(r.amount), 0) * 100) / 100,
    rounds: rounds.count ?? 0,
    catches: catches.count ?? 0,
    survived: survived.count ?? 0,
    badges: (badges.data ?? []).map((b) => ({ id: b.id, badge: b.badge, detail: b.detail, roundId: b.round_id, at: b.earned_at })),
    leaders,
    myRank: rank >= 0 ? rank + 1 : null,
  };
}

export type LevelInfo = {
  level: number;
  roundsPlayed: number;
  /** What the next level costs (coins) and how many rounds you need to have played first. */
  nextCost: number;
  nextRounds: number;
  canUpgrade: boolean;
  coins: number;
};

/** Your level and what it takes to reach the next one (rules live in the database). */
export async function loadLevel(): Promise<Result<{ info: LevelInfo }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc("level_info", { p_user: userId });
  if (error || !data) return { ok: false, error: "Couldn't load your level." };
  return {
    ok: true,
    info: {
      level: Number(data.level),
      roundsPlayed: Number(data.rounds_played),
      nextCost: Number(data.next_cost),
      nextRounds: Number(data.next_rounds),
      canUpgrade: Boolean(data.can_upgrade),
      coins: Number(data.coins),
    },
  };
}

/** Spend coins to go up a level (once you've played enough rounds). */
export async function upgradeLevel(): Promise<Result<{ level: number; cost: number }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc("upgrade_level", { p_user: userId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, level: Number(data.level), cost: Number(data.cost) };
}
