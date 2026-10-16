// Other players in your story, on the server only (docs/LIFE_WHEEL.md, phase 6; game-db/116): who can
// be in someone's story right now, the next part of a story waiting for a player, and real money
// between them. Used by ./moment-actions.ts; not an action itself, so phones can't call it.
//
// Who can be in your story: your friends (unless either of you said nobody), or, if you both said
// anyone, someone else in your city. Never anyone either of you has blocked, never anyone away for
// more than a week, and nobody gets more than two parts of other people's stories in twelve hours.

import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;
const n = (v: unknown) => Number(v) || 0;
const HOUR = 3_600_000;

export type StoryOpen = "friends" | "everyone" | "nobody";
export const STORY_OPENS: StoryOpen[] = ["friends", "everyone", "nobody"];

/** Who someone lets into their story (friends when they haven't said; null before game-db/116 is run). */
export async function storyOpenOf(db: Db, userId: string): Promise<StoryOpen | null> {
  const { data, error } = await db.from("story_prefs").select("open").eq("user_id", userId).maybeSingle();
  if (error) return null;
  return STORY_OPENS.includes(data?.open as StoryOpen) ? (data!.open as StoryOpen) : "friends";
}

async function blockedEitherWay(db: Db, a: string, b: string) {
  const { data } = await db.from("blocks").select("blocker").or(`and(blocker.eq.${a},blocked.eq.${b}),and(blocker.eq.${b},blocked.eq.${a})`).limit(1);
  return (data ?? []).length > 0;
}

/** Someone who can be in this player's story now (null: nobody right now). */
export async function findPartner(db: Db, userId: string, region: string): Promise<{ id: string; name: string } | null> {
  const mine = await storyOpenOf(db, userId);
  if (!mine || mine === "nobody") return null;
  const { data: fr } = await db.from("friendships").select("requester, addressee").or(`requester.eq.${userId},addressee.eq.${userId}`).not("accepted_at", "is", null).limit(200);
  const friends = new Set((fr ?? []).map((f) => (String(f.requester) === userId ? String(f.addressee) : String(f.requester))));
  let open: string[] = [];
  if (mine === "everyone") {
    const { data: ev } = await db.from("story_prefs").select("user_id").eq("open", "everyone").neq("user_id", userId).limit(200);
    open = (ev ?? []).map((e) => String(e.user_id));
  }
  const pool = [...new Set([...friends, ...open])];
  if (!pool.length) return null;
  const weekAgo = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
  const [{ data: lives }, { data: prefs }, { data: busy }, { data: recent }] = await Promise.all([
    db.from("lives").select("user_id, region, seen_at").in("user_id", pool).gte("seen_at", weekAgo),
    db.from("story_prefs").select("user_id, open").in("user_id", pool),
    // Parts of other people's stories they've had lately.
    db.from("story_links").select("to_user").in("to_user", pool).gte("created_at", new Date(Date.now() - 12 * HOUR).toISOString()),
    // Stories you've started with someone lately: not the same person again within three days.
    db.from("story_links").select("to_user").eq("from_user", userId).gte("created_at", new Date(Date.now() - 72 * HOUR).toISOString()),
  ]);
  const prefOf = new Map((prefs ?? []).map((p) => [String(p.user_id), String(p.open) as StoryOpen]));
  const load = new Map<string, number>();
  for (const b of busy ?? []) load.set(String(b.to_user), (load.get(String(b.to_user)) ?? 0) + 1);
  const lately = new Set((recent ?? []).map((r) => String(r.to_user)));
  const ok = (lives ?? [])
    .map((l) => String(l.user_id))
    .filter((id) => {
      const theirs = prefOf.get(id) ?? "friends";
      if (theirs === "nobody") return false;
      if (!friends.has(id) && theirs !== "everyone") return false;
      if ((load.get(id) ?? 0) >= 2 || lately.has(id)) return false;
      return true;
    })
    .filter((id) => String((lives ?? []).find((l) => String(l.user_id) === id)?.region ?? region) === region || friends.has(id));
  // Friends first, then anyone; at random among them.
  const pick = (ids: string[]) => ids[Math.floor(Math.random() * ids.length)];
  const friendsOk = ok.filter((id) => friends.has(id));
  for (const candidates of [friendsOk, ok]) {
    const tries = [...candidates];
    while (tries.length) {
      const id = pick(tries);
      tries.splice(tries.indexOf(id), 1);
      if (await blockedEitherWay(db, userId, id)) continue;
      const { data: p } = await db.from("profiles").select("username, frozen, is_bot").eq("id", id).maybeSingle();
      if (!p?.username || p.frozen || p.is_bot) continue;
      return { id, name: String(p.username) };
    }
  }
  return null;
}

/** The next part of someone else's story waiting for this player (due, from the last week, from someone not blocked). */
export async function dueLink(db: Db, userId: string) {
  const { data, error } = await db
    .from("story_links")
    .select("id, moment, vars, from_user")
    .eq("to_user", userId)
    .is("opened_at", null)
    .lte("due_at", new Date().toISOString())
    .gte("created_at", new Date(Date.now() - 7 * 24 * HOUR).toISOString())
    .order("due_at")
    .limit(3);
  if (error) return null;
  for (const l of data ?? []) {
    const from = String(l.from_user);
    if (await blockedEitherWay(db, userId, from)) {
      await db.from("story_links").update({ opened_at: new Date().toISOString() }).eq("id", l.id);
      continue;
    }
    const { data: p } = await db.from("profiles").select("username").eq("id", from).maybeSingle();
    if (!p?.username) continue;
    return { id: n(l.id), moment: String(l.moment), vars: (l.vars ?? {}) as { ask?: number }, from, fromName: String(p.username) };
  }
  return null;
}

export async function openLink(db: Db, id: number) {
  await db.from("story_links").update({ opened_at: new Date().toISOString() }).eq("id", id);
}

/** Send the next part of the story to the other player, `hours` from now. */
export async function sendLink(db: Db, from: string, to: string, moment: string, ask: number, hours: number) {
  if (await blockedEitherWay(db, from, to)) return false;
  const { error } = await db.from("story_links").insert({
    from_user: from,
    to_user: to,
    moment,
    vars: { ask: Math.round(ask) },
    due_at: new Date(Date.now() + Math.max(0, hours) * HOUR).toISOString(),
  });
  return !error;
}

/** Real money from one player to another in a story (whole mint, at least 1), within the gift limits. Null: it went; else why not. */
export async function giveInStory(db: Db, from: string, to: string, naira: number, perMint: number): Promise<string | null> {
  const amount = Math.max(1, Math.round(naira / perMint));
  const { error } = await db.rpc("give_coins", { p_from: from, p_to: to, p_amount: amount, p_note: "In your story" });
  if (!error) return null;
  const msg = error.message ?? "";
  if (msg.includes("new_giver_cap")) return "It didn't go through: new accounts can only give so much a day.";
  if (msg.includes("not_enough")) return "It didn't go through: you don't have that much in your wallet.";
  if (msg.includes("new_player")) return "It didn't go through: you can give money once you've played a little longer.";
  return "It didn't go through.";
}

/** How you feel about them changes, and you've shared one more story. */
export async function bondWith(db: Db, user: string, other: string, feel: number) {
  const { data } = await db.rpc("player_bond_add", { p_user: user, p_other: other, p_feel: Math.round(feel) });
  return n(data);
}
