"use server";

import { cleanAvatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Badge, Leader } from "../profile-actions";

// The menu's two heavier reads, split so each sheet only asks for what it shows: opening
// "Badges" doesn't pay for the leaderboard, and the other way round. Same numbers as
// loadMyStats in ../profile-actions.ts (which is left as it was).

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** What counts as "mint won". Keep in step with WIN_KINDS in ../profile-actions.ts. */
const WIN_KINDS = ["catch_reward", "bot_bounty", "pool_hider", "pool_seeker"];

export type MyRecord = { won: number; rounds: number; catches: number; survived: number; badges: Badge[] };
export type Leaderboard = { leaders: Leader[]; myRank: number | null };

/** Your record and every badge you've won, newest first (for the Badges sheet). */
export async function loadMyRecord(): Promise<Result<MyRecord>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const [mine, rounds, catches, survived, badges] = await Promise.all([
    db.from("ledger").select("amount").eq("user_id", userId).in("kind", WIN_KINDS).limit(10000),
    db.from("entries").select("round_id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("entries").select("user_id", { count: "exact", head: true }).eq("caught_by", userId),
    db.from("badges").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("badge", "survivor"),
    db.from("badges").select("id, badge, detail, round_id, earned_at").eq("user_id", userId).order("earned_at", { ascending: false }).limit(2000),
  ]);
  if (badges.error) return { ok: false, error: "Couldn't load your badges." };
  return {
    ok: true,
    won: Math.round((mine.data ?? []).reduce((t, r) => t + Number(r.amount), 0) * 100) / 100,
    rounds: rounds.count ?? 0,
    catches: catches.count ?? 0,
    survived: survived.count ?? 0,
    badges: (badges.data ?? []).map((b) => ({ id: b.id, badge: b.badge, detail: b.detail, roundId: b.round_id, at: b.earned_at })),
  };
}

/** The week's top 10 by mint won (no bots), and where you stand (for the Leaderboard sheet). */
export async function loadLeaderboard(): Promise<Result<Leaderboard>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const week = await db.from("ledger").select("user_id, amount").in("kind", WIN_KINDS).gt("created_at", weekAgo).not("user_id", "is", null).limit(20000);
  if (week.error) return { ok: false, error: "Couldn't load the leaderboard." };
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
  // Your place counts people only (bots left out), so it matches the list you see.
  const onBoard = leaders.findIndex((l) => l.id === userId);
  const rank = ranked.findIndex(([id]) => id === userId);
  const myRank = onBoard >= 0 ? onBoard + 1 : rank >= 0 ? rank + 1 - (top.length - leaders.length) : null;
  return { ok: true, leaders, myRank };
}
