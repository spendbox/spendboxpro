"use server";

import { naira } from "@/lib/brand";
import { cleanAvatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { after } from "next/server";
import { notifyMany } from "@/lib/notify-many";
import { pushToMany } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { CHALLENGE_COOLDOWN_SECS, CHALLENGE_FEE_NAIRA, NEAR_TILES, STAKE_MAX_NAIRA, STAKE_MIN_NAIRA, challengeGame, cleanStake, minPlayers, stakeBounds } from "@/lib/world/challenges";
import { tidy } from "@/lib/world/value";

// Challenges on the map (docs/CHALLENGES.md; the database part is game-db/070_challenges.sql).
// Money only moves in the database: the stakes, the fee, the pool and the winner's prize.

type Fail = { ok: false; error: string };
const n = (v: unknown) => Number(v ?? 0) || 0;
const missing = (m: string) => /challenge_|challenges/.test(m);
const OFF = "Challenges are switched on soon (the game's owner has one update to run).";

function say(message: string): Fail {
  const [code, arg] = message.split(":");
  if (code === "not_enough") return { ok: false, error: `You need ${arg ? naira(arg) : "more"} for that.` };
  if (code === "busy") return { ok: false, error: "You're already in a challenge. Finish that one first." };
  if (code === "started") return { ok: false, error: "Too late: that one has started." };
  if (code === "full") return { ok: false, error: "That one is full." };
  if (code === "gone") return { ok: false, error: "That challenge is gone." };
  if (code === "no_life") return { ok: false, error: "Start your life in the city first." };
  if (code === "frozen") return { ok: false, error: "Your account is paused right now." };
  if (code === "target_busy") return { ok: false, error: "They're in another game right now. Try again in a bit." };
  if (code === "blocked") return { ok: false, error: "You can't play with this person." };
  if (code === "unknown_target" || code === "self") return { ok: false, error: "That player can't play right now." };
  if (code === "need_players") return { ok: false, error: "Wait for someone to join first." };
  if (code === "not_host") return { ok: false, error: "Only the host can start it." };
  if (missing(message)) return { ok: false, error: OFF };
  console.error("Challenge failed", message);
  return { ok: false, error: "That didn't work. Try again." };
}

const perMintOf = (region: string) => REGIONS[region]?.prices.perMint ?? 1_500;
const spotOf = (id: string | null) => {
  const m = /:(-?\d+),(-?\d+)/.exec(id ?? "");
  return m ? { x: Number(m[1]), z: Number(m[2]) } : null;
};

export type ChallengeQuote = {
  free: boolean;
  feeMint: number;
  secsLeft: number;
  first: boolean;
  /** Naira in a mint here. */
  perMint: number;
  /** The smallest and biggest stake (mint). */
  minStake: number;
  maxStake: number;
  /** What you can spend on it: your Fun money and wallet (mint), or null if it couldn't be read. */
  canSpend: number | null;
  /** Your challenges so far, for reputation: hosted (played to a winner) and won. */
  rep: { hosted: number; won: number } | null;
};

/** Your challenges hosted (played to a winner) and won, for reputation (null if it couldn't be read). */
async function repOf(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await db.rpc("challenge_rep", { p_user: userId });
  if (error || !data) return null;
  const d = data as { hosted?: number; won?: number };
  return { hosted: n(d.hosted), won: n(d.won) };
}

/** Before you challenge: free now, or the fee and how long until it's free again; the stakes allowed and what you have. */
export async function challengeQuote(region: string): Promise<ChallengeQuote> {
  const perMint = perMintOf(region);
  const feeMint = Math.round((CHALLENGE_FEE_NAIRA / perMint) * 100) / 100;
  const { min: minStake, max: maxStake } = stakeBounds(perMint);
  const base = { perMint, feeMint, minStake, maxStake };
  const userId = await currentUserId();
  if (!userId) return { ...base, free: true, secsLeft: 0, first: true, canSpend: null, rep: null };
  const db = createAdminClient();
  const [{ data }, spend, rep] = await Promise.all([
    db.from("challenges").select("created_at").eq("host_id", userId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1),
    db.rpc("life_can_spend", { p_user: userId, p_pots: ["fun"] }),
    repOf(db, userId),
  ]);
  const last = data?.[0]?.created_at ? Date.parse(String(data[0].created_at)) : null;
  const secsLeft = last ? Math.max(0, Math.ceil((last + CHALLENGE_COOLDOWN_SECS * 1000 - Date.now()) / 1000)) : 0;
  return { ...base, free: secsLeft === 0, secsLeft, first: last === null, canSpend: spend.error || spend.data == null ? null : n(spend.data), rep };
}

/** Your challenges hosted and won so far (to show what a result added to your reputation). */
export async function myChallengeRep(): Promise<{ hosted: number; won: number } | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  return repOf(createAdminClient(), userId);
}

/** Challenge everyone nearby. stakeMint: what each player puts into the pool (any amount from ₦1,000 to ₦1m, in mint). */
export async function openChallenge(game: string, stakeMint: number, x: number, z: number, region: string): Promise<{ ok: true; id: number; fee: number } | (Fail & { busyId?: number })> {
  const g = challengeGame(game);
  if (!g?.engine) return { ok: false, error: "That game is coming soon." };
  if (!REGIONS[region] || !Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: "Unknown place." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to challenge people." };
  const perMint = perMintOf(region);
  const stake = cleanStake(Number(stakeMint), perMint);
  if (stake === null) return { ok: false, error: `Pick a stake from ₦${STAKE_MIN_NAIRA.toLocaleString("en-GB")} to ₦${STAKE_MAX_NAIRA.toLocaleString("en-GB")}.` };
  const db = createAdminClient();
  const { data, error } = await db.rpc("challenge_open", {
    p_user: userId,
    p_region: region,
    p_game: g.id,
    p_stake: stake,
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
  // Who's within reach: from the kept positions (game-db/102), else the old way.
  const box = await db
    .from("lives")
    .select("user_id")
    .eq("region", region)
    .neq("user_id", userId)
    .gte("at_x", x - NEAR_TILES)
    .lte("at_x", x + NEAR_TILES)
    .gte("at_z", z - NEAR_TILES)
    .lte("at_z", z + NEAR_TILES)
    .limit(2000);
  let near: string[];
  if (!box.error) near = ((box.data ?? []) as { user_id: string }[]).map((l) => l.user_id);
  else {
    const { data: lives } = await db.from("lives").select("user_id, at_place, home_unit").eq("region", region).neq("user_id", userId).limit(1000);
    near = ((lives ?? []) as { user_id: string; at_place: string | null; home_unit: string | null }[])
      .filter((l) => {
        const s = spotOf(l.at_place ?? l.home_unit);
        return s && Math.hypot(s.x - x, s.z - z) <= NEAR_TILES;
      })
      .map((l) => l.user_id)
      .slice(0, 60);
  }
  const body = stake > 0 ? `${name} challenged everyone nearby to ${g.title}! ₦${tidy(stake * perMint).toLocaleString("en-GB")} each into the pool. Join within a minute.` : `${name} challenged everyone nearby to ${g.title}, just for fun! Join within a minute.`;
  await notifyMany(db, near, "challenge", body);
  // Phones are tapped after the host has their answer (the minute is already running).
  after(() => pushToMany(near));
  return { ok: true, id: n(d.id), fee: n(d.fee) };
}

export async function joinChallenge(id: number): Promise<{ ok: true; paid: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to join." };
  const db = createAdminClient();
  // Accepting an invitation starts the game soon after (game-db/110); joining anything else, as
  // before. A game that needs more than two (Impostor) keeps its whole time for others to join.
  const { data: c } = await db.from("challenges").select("game").eq("id", Math.round(n(id))).maybeSingle();
  if (c && minPlayers(String(c.game)) > 2) {
    const r = await db.rpc("challenge_join", { p_user: userId, p_id: Math.round(n(id)) });
    if (r.error) return say(r.error.message);
    return { ok: true, paid: n((r.data as { paid?: number })?.paid) };
  }
  let res = await db.rpc("challenge_accept", { p_user: userId, p_id: Math.round(n(id)) });
  if (res.error && /challenge_accept/.test(res.error.message)) res = await db.rpc("challenge_join", { p_user: userId, p_id: Math.round(n(id)) });
  if (res.error) return say(res.error.message);
  return { ok: true, paid: n((res.data as { paid?: number })?.paid) };
}

/**
 * Challenge one player to a game for a stake (game-db/110): they're asked to accept or decline,
 * anyone nearby can still join, and anyone can watch.
 */
export async function inviteChallenge(target: string, game: string, stakeMint: number, x: number, z: number, region: string): Promise<{ ok: true; id: number } | (Fail & { busyId?: number })> {
  const g = challengeGame(game);
  if (!g?.engine) return { ok: false, error: "That game is coming soon." };
  if (!/^[0-9a-f-]{36}$/i.test(String(target))) return { ok: false, error: "That player can't play right now." };
  if (!REGIONS[region] || !Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: "Unknown place." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play." };
  const perMint = perMintOf(region);
  const stake = cleanStake(Number(stakeMint), perMint);
  if (stake === null) return { ok: false, error: `Pick a stake from ₦${STAKE_MIN_NAIRA.toLocaleString("en-GB")} to ₦${STAKE_MAX_NAIRA.toLocaleString("en-GB")}.` };
  const db = createAdminClient();
  const { data, error } = await db.rpc("challenge_invite", { p_user: userId, p_target: target, p_region: region, p_game: g.id, p_stake: stake, p_x: Math.round(x), p_z: Math.round(z), p_seats: g.seats });
  if (error) {
    if (error.message.startsWith("busy")) {
      const { data: busy } = await db.rpc("challenge_busy", { p_user: userId });
      return { ok: false, error: "You're still in another game.", busyId: busy == null ? undefined : n(busy) };
    }
    if (/challenge_invite/.test(error.message)) return { ok: false, error: OFF };
    return say(error.message);
  }
  after(() => pushToMany([String(target)]));
  return { ok: true, id: n((data as { id?: number })?.id) };
}

/** Say no to an invitation (the host's stake goes back if nobody else has joined). */
export async function declineChallenge(id: number): Promise<{ ok: true } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { error } = await createAdminClient().rpc("challenge_decline", { p_user: userId, p_id: Math.round(n(id)) });
  return error ? say(error.message) : { ok: true };
}

/** The host starts the game now (two or more in). */
export async function startChallengeNow(id: number): Promise<{ ok: true; status: string } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("challenge_start_now", { p_user: userId, p_id: Math.round(n(id)) });
  if (error) return say(error.message);
  if (data === "playing") {
    const { data: players } = await db.from("challenge_players").select("user_id").eq("challenge_id", Math.round(n(id))).is("left_at", null);
    after(() => pushToMany(((players ?? []) as { user_id: string }[]).map((p) => String(p.user_id)).filter((u) => u !== userId)));
  }
  return { ok: true, status: String(data) };
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
  /** The one player it's for (game-db/110), or null: everyone nearby. */
  invited: ChallengePlayer | null;
};

async function views(db: ReturnType<typeof createAdminClient>, rows: Record<string, unknown>[]): Promise<ChallengeView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => n(r.id));
  const { data: ps } = await db.from("challenge_players").select("challenge_id, user_id, joined_at").in("challenge_id", ids).order("joined_at", { ascending: true });
  const players = (ps ?? []) as { challenge_id: number; user_id: string }[];
  const people = [...new Set([...players.map((p) => p.user_id), ...rows.map((r) => (r.invited ? String(r.invited) : "")).filter(Boolean)])];
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
      invited: r.invited
        ? (() => {
            const pr = byId.get(String(r.invited));
            const name = pr?.username ?? "Player";
            return { id: String(r.invited), name, avatar: cleanAvatar(pr?.avatar, name) };
          })()
        : null,
    };
  });
}

/** One challenge, as it is now (starting it, or calling it off, once its minute is up). */
export async function challengeView(id: number): Promise<ChallengeView | null> {
  const db = createAdminClient();
  const cid = Math.round(n(id));
  const first = await db.from("challenges").select("status, starts_at").eq("id", cid).maybeSingle();
  if (first.data?.status === "open" && Date.parse(String(first.data.starts_at)) <= Date.now()) {
    const begun = await db.rpc("challenge_begin", { p_id: cid });
    // Started (or called off): every player is told, on their phone too.
    if (!begun.error && begun.data !== "open") {
      const { data: players } = await db.from("challenge_players").select("user_id").eq("challenge_id", cid).is("left_at", null);
      await pushToMany(((players ?? []) as { user_id: string }[]).map((p) => String(p.user_id)));
    }
  }
  const { data } = await db.from("challenges").select("*").eq("id", cid).maybeSingle();
  return data ? ((await views(db, [data as Record<string, unknown>]))[0] ?? null) : null;
}

/** When each region's challenges were last tidied (on this server). */
const lastSweep = new Map<string, number>();

/** Challenges near a spot (open to join, or being played), and the one you're in, if any. */
export async function nearbyChallenges(region: string, x: number, z: number): Promise<{ list: ChallengeView[]; mine: number | null; invites?: ChallengeView[] }> {
  if (!REGIONS[region]) return { list: [], mine: null };
  const db = createAdminClient();
  // Tidying up finished and expired challenges: at most every 10 s per region on this server (every
  // player looking at challenges asks every few seconds).
  if (Date.now() - (lastSweep.get(region) ?? 0) > 10_000) {
    lastSweep.set(region, Date.now());
    const sweep = await db.rpc("challenge_sweep", { p_region: region });
    if (sweep.error && missing(sweep.error.message)) return { list: [], mine: null };
  }
  const since = new Date(Date.now() - 50 * 60_000).toISOString();
  const { data } = await db.from("challenges").select("*").eq("region", region).in("status", ["open", "playing"]).gt("created_at", since).order("created_at", { ascending: false }).limit(40);
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => Math.hypot(n(r.x) - x, n(r.z) - z) <= NEAR_TILES * 2);
  const userId = await currentUserId().catch(() => null);
  let mine: number | null = null;
  let invites: ChallengeView[] = [];
  if (userId) {
    const [{ data: busy }, inv] = await Promise.all([
      db.rpc("challenge_busy", { p_user: userId }),
      // Invitations to you, still waiting (game-db/110; none before it's run).
      db.from("challenges").select("*").eq("invited", userId).eq("status", "open").gt("starts_at", new Date().toISOString()).limit(5),
    ]);
    mine = busy == null ? null : n(busy);
    if (!inv.error) invites = await views(db, (inv.data ?? []) as Record<string, unknown>[]);
  }
  return { list: await views(db, rows), mine, invites };
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
