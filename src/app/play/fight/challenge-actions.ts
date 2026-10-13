"use server";

import { cleanAvatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { CHALLENGE_COOLDOWN_SECS, CHALLENGE_FEE_NAIRA, NEAR_TILES, STAKES_NAIRA, challengeGame } from "@/lib/world/challenges";

// Challenges on the map (docs/CHALLENGES.md; the database part is game-db/070_challenges.sql).
// Money only moves in the database: the stakes, the fee, the pool and the winner's prize.

type Fail = { ok: false; error: string };
const n = (v: unknown) => Number(v ?? 0) || 0;
const missing = (m: string) => /challenge_|challenges/.test(m);
const OFF = "Challenges are switched on soon (the game's owner has one update to run).";

function say(message: string): Fail {
  const [code, arg] = message.split(":");
  if (code === "not_enough") return { ok: false, error: `You need ${arg ? `₥${arg}` : "more"} in your Fun money and wallet for that.` };
  if (code === "busy") return { ok: false, error: "You're already in a challenge. Finish that one first." };
  if (code === "started") return { ok: false, error: "Too late: that one has started." };
  if (code === "full") return { ok: false, error: "That one is full." };
  if (code === "gone") return { ok: false, error: "That challenge is gone." };
  if (code === "no_life") return { ok: false, error: "Start your life in the city first." };
  if (code === "frozen") return { ok: false, error: "Your account is paused right now." };
  if (missing(message)) return { ok: false, error: OFF };
  console.error("Challenge failed", message);
  return { ok: false, error: "That didn't work. Try again." };
}

const perMintOf = (region: string) => REGIONS[region]?.prices.perMint ?? 1_500;
const spotOf = (id: string | null) => {
  const m = /:(-?\d+),(-?\d+)/.exec(id ?? "");
  return m ? { x: Number(m[1]), z: Number(m[2]) } : null;
};

/** Before you challenge: free now, or the fee and how long until it's free again. */
export async function challengeQuote(region: string): Promise<{ free: boolean; feeMint: number; secsLeft: number; first: boolean }> {
  const feeMint = Math.round((CHALLENGE_FEE_NAIRA / perMintOf(region)) * 100) / 100;
  const userId = await currentUserId();
  if (!userId) return { free: true, feeMint, secsLeft: 0, first: true };
  const { data } = await createAdminClient().from("challenges").select("created_at").eq("host_id", userId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1);
  const last = data?.[0]?.created_at ? Date.parse(String(data[0].created_at)) : null;
  const secsLeft = last ? Math.max(0, Math.ceil((last + CHALLENGE_COOLDOWN_SECS * 1000 - Date.now()) / 1000)) : 0;
  return { free: secsLeft === 0, feeMint, secsLeft, first: last === null };
}

/** Challenge everyone nearby. */
export async function openChallenge(game: string, stakeNaira: number, x: number, z: number, region: string): Promise<{ ok: true; id: number; fee: number } | (Fail & { busyId?: number })> {
  const g = challengeGame(game);
  if (!g?.engine) return { ok: false, error: "That game is coming soon." };
  if (!STAKES_NAIRA.includes(stakeNaira)) return { ok: false, error: "Pick a stake." };
  if (!REGIONS[region] || !Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: "Unknown place." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to challenge people." };
  const perMint = perMintOf(region);
  const db = createAdminClient();
  const { data, error } = await db.rpc("challenge_open", {
    p_user: userId,
    p_region: region,
    p_game: g.id,
    p_stake: Math.round((stakeNaira / perMint) * 100) / 100,
    p_x: Math.round(x),
    p_z: Math.round(z),
    p_seats: g.seats,
    p_fee: Math.round((CHALLENGE_FEE_NAIRA / perMint) * 100) / 100,
    p_cooldown: CHALLENGE_COOLDOWN_SECS,
  });
  if (error) {
    // Still in another one: say which, so it can be opened or left from here.
    if (error.message.startsWith("busy")) {
      const { data: busy } = await db.rpc("challenge_busy", { p_user: userId });
      return { ok: false, error: "You're still in another challenge.", busyId: busy == null ? undefined : n(busy) };
    }
    return say(error.message);
  }
  const d = (data ?? {}) as { id?: number; fee?: number };
  // Everyone nearby hears about it (a notice, and a push).
  const { data: me } = await db.from("profiles").select("username").eq("id", userId).maybeSingle();
  const name = (me?.username as string | null) ?? "Someone";
  const { data: lives } = await db.from("lives").select("user_id, at_place, home_unit").eq("region", region).neq("user_id", userId).limit(1000);
  const near = ((lives ?? []) as { user_id: string; at_place: string | null; home_unit: string | null }[]).filter((l) => {
    const s = spotOf(l.at_place ?? l.home_unit);
    return s && Math.hypot(s.x - x, s.z - z) <= NEAR_TILES;
  });
  for (const l of near.slice(0, 60)) {
    await db.rpc("notify", { p_user: l.user_id, p_round: null, p_kind: "challenge", p_body: `${name} challenged everyone nearby to ${g.title}! ₦${stakeNaira.toLocaleString("en-GB")} each into the pool. Join within a minute.` });
    await pushTo(l.user_id).catch(() => {});
  }
  return { ok: true, id: n(d.id), fee: n(d.fee) };
}

export async function joinChallenge(id: number): Promise<{ ok: true; paid: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to join." };
  const { data, error } = await createAdminClient().rpc("challenge_join", { p_user: userId, p_id: Math.round(n(id)) });
  if (error) return say(error.message);
  return { ok: true, paid: n((data as { paid?: number })?.paid) };
}

export type ChallengePlayer = { id: string; name: string; avatar: unknown };
export type ChallengeView = {
  id: number;
  game: string;
  host: string;
  stake: number;
  pool: number;
  seats: number;
  seed: number;
  x: number;
  z: number;
  status: "open" | "playing" | "done" | "cancelled";
  startsAt: string;
  /** It got as far as being played (a game called off after it started was a draw or never finished). */
  started: boolean;
  players: ChallengePlayer[];
  winner: string | null;
  prize: number | null;
};

async function views(db: ReturnType<typeof createAdminClient>, rows: Record<string, unknown>[]): Promise<ChallengeView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => n(r.id));
  const { data: ps } = await db.from("challenge_players").select("challenge_id, user_id, joined_at").in("challenge_id", ids).order("joined_at", { ascending: true });
  const players = (ps ?? []) as { challenge_id: number; user_id: string }[];
  const people = [...new Set(players.map((p) => p.user_id))];
  const { data: profs } = people.length ? await db.from("profiles").select("id, username, avatar").in("id", people) : { data: [] };
  const byId = new Map(((profs ?? []) as { id: string; username: string | null; avatar: unknown }[]).map((p) => [p.id, p]));
  return rows.map((r) => {
    const mine = players.filter((p) => n(p.challenge_id) === n(r.id));
    return {
      id: n(r.id),
      game: String(r.game),
      host: String(r.host_id),
      stake: n(r.stake),
      pool: n(r.pool),
      seats: n(r.seats),
      seed: n(r.seed),
      x: n(r.x),
      z: n(r.z),
      status: r.status as ChallengeView["status"],
      startsAt: String(r.starts_at),
      started: !!r.started_at,
      players: mine.map((p) => {
        const pr = byId.get(p.user_id);
        const name = pr?.username ?? "Player";
        return { id: p.user_id, name, avatar: cleanAvatar(pr?.avatar, name) };
      }),
      winner: r.winner_id ? String(r.winner_id) : null,
      prize: r.prize == null ? null : n(r.prize),
    };
  });
}

/** One challenge, as it is now (starting it, or calling it off, once its minute is up). */
export async function challengeView(id: number): Promise<ChallengeView | null> {
  const db = createAdminClient();
  const cid = Math.round(n(id));
  const first = await db.from("challenges").select("status, starts_at").eq("id", cid).maybeSingle();
  if (first.data?.status === "open" && Date.parse(String(first.data.starts_at)) <= Date.now()) await db.rpc("challenge_begin", { p_id: cid });
  const { data } = await db.from("challenges").select("*").eq("id", cid).maybeSingle();
  return data ? ((await views(db, [data as Record<string, unknown>]))[0] ?? null) : null;
}

/** Challenges near a spot (open to join, or being played), and the one you're in, if any. */
export async function nearbyChallenges(region: string, x: number, z: number): Promise<{ list: ChallengeView[]; mine: number | null }> {
  if (!REGIONS[region]) return { list: [], mine: null };
  const db = createAdminClient();
  const sweep = await db.rpc("challenge_sweep", { p_region: region });
  if (sweep.error && missing(sweep.error.message)) return { list: [], mine: null };
  const since = new Date(Date.now() - 50 * 60_000).toISOString();
  const { data } = await db.from("challenges").select("*").eq("region", region).in("status", ["open", "playing"]).gt("created_at", since).order("created_at", { ascending: false }).limit(40);
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => Math.hypot(n(r.x) - x, n(r.z) - z) <= NEAR_TILES * 2);
  const userId = await currentUserId().catch(() => null);
  let mine: number | null = null;
  if (userId) {
    const { data: busy } = await db.rpc("challenge_busy", { p_user: userId });
    mine = busy == null ? null : n(busy);
  }
  return { list: await views(db, rows), mine };
}

/**
 * How it ended, as this player saw it: who won, or a draw (draw true, winner null), or just asking
 * whether it's settled yet (both null). The pool is paid once the players agree (see
 * challenge_report): the phones keep asking until it's settled.
 */
export async function reportWinner(id: number, winner: string | null, draw = false): Promise<{ ok: true; winner: string | null; prize: number; draw: boolean; settled: boolean } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc("challenge_report", { p_user: userId, p_id: Math.round(n(id)), p_winner: winner, p_draw: !!draw });
  if (error) {
    if (error.message.startsWith("not_playing")) return { ok: true, winner: null, prize: 0, draw: false, settled: true };
    return say(error.message);
  }
  const d = (data ?? {}) as { winner?: string | null; prize?: number; draw?: boolean; waiting?: boolean };
  return { ok: true, winner: d.winner ?? null, prize: n(d.prize), draw: !!d.draw, settled: !!d.winner || !!d.draw };
}

/**
 * Leave a challenge: before it starts, your stake back (the host calls it off for everyone);
 * during the game, you give up (with one other player left, they win).
 */
export async function leaveChallenge(id: number): Promise<{ ok: true; result: string } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc("challenge_leave", { p_user: userId, p_id: Math.round(n(id)) });
  if (error) return say(error.message);
  return { ok: true, result: String(data ?? "left") };
}
