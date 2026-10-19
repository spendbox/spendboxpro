"use server";

import { mintify } from "@/lib/brand";
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
  if (error) return { ok: false, error: mintify(error.message, true) };
  return { ok: true, coins: Number(data.coins), leftToday: Number(data.left_today) };
}

export async function saveAvatar(avatar: Avatar): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: me } = await db.from("profiles").select("username").eq("id", userId).single();
  const clean = cleanAvatar(avatar, me?.username ?? userId);
  // Saving a drawn look uses it (a profile photo is only ever set by /api/profile-photo).
  delete clean.photo;
  const { error } = await db.from("profiles").update({ avatar: clean }).eq("id", userId);
  return error ? { ok: false, error: "Couldn't save your look. Try again." } : { ok: true };
}

/** Counts one visit (the page calls this once per browser session). */
export async function recordVisit(): Promise<Result<{ visits: number }>> {
  const db = createAdminClient();
  const member = !!(await currentUserId().catch(() => null));
  // By day (guests and players apart) once part 59 is in; the plain count before that.
  const by = await db.rpc("count_visit_by", { p_member: member });
  if (!by.error) return { ok: true, visits: Number(by.data) };
  const { data, error } = await db.rpc("count_visit");
  return error ? { ok: false, error: "" } : { ok: true, visits: Number(data) };
}

export type SiteStats = { visits: number; registered: number; days: { day: string; visits: number; guests: number; members: number; signups: number }[] };

/** The numbers behind the online button: visits (everyone, signed in or not), players, and the last 30 days. */
export async function siteStats(): Promise<SiteStats> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("site_stats");
  if (!error && data) {
    const d = data as { visits?: unknown; registered?: unknown; days?: Record<string, unknown>[] };
    return {
      visits: Number(d.visits ?? 0),
      registered: Number(d.registered ?? 0),
      days: (d.days ?? []).map((x) => ({ day: String(x.day), visits: Number(x.visits ?? 0), guests: Number(x.guests ?? 0), members: Number(x.members ?? 0), signups: Number(x.signups ?? 0) })),
    };
  }
  // Before part 59: the totals only.
  const [{ data: v }, { count }] = await Promise.all([
    db.from("site_counters").select("value").eq("key", "visits").maybeSingle(),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("is_bot", false),
  ]);
  return { visits: Number(v?.value ?? 0), registered: count ?? 0, days: [] };
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
  /** XP towards the next level and what it needs (null before game-db/027 is run: rounds only). */
  xp: number | null;
  nextXp: number | null;
  /** At the top level. */
  max: boolean;
  /** XP for a game, a side quest and a streak day. */
  xpFor: { game: number; quest: number; streak: number };
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
      xp: data.xp == null ? null : Number(data.xp),
      nextXp: data.next_xp == null ? null : Number(data.next_xp),
      max: Boolean(data.max),
      xpFor: { game: Number(data.xp_game ?? 10), quest: Number(data.xp_quest ?? 10), streak: Number(data.xp_streak ?? 5) },
    },
  };
}

/** Spend coins to go up a level (once you have the XP for it). */
export async function upgradeLevel(): Promise<Result<{ level: number; cost: number }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc("upgrade_level", { p_user: userId });
  if (error) return { ok: false, error: mintify(error.message, true) };
  return { ok: true, level: Number(data.level), cost: Number(data.cost) };
}

/** "About you" (up to 160 letters) and who sees your profile photos (game-db/130). */
export async function saveAbout(about: string, photosFor: "everyone" | "friends"): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const text = String(about ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ about: text || null, photos_for: photosFor === "friends" ? "friends" : "everyone" })
    .eq("id", userId);
  if (error) return { ok: false, error: /about|photos_for/.test(error.message) ? "Saving this is switched on soon." : "That didn't save. Try again." };
  return { ok: true };
}
