"use server";

import { naira } from "@/lib/brand";
import { COPS_TICKET_NAIRA, copsMint, GEAR_BY_ID, type GearId, type Loadout } from "@/lib/cops";
import { currentUserId } from "@/lib/game";
import { sessionAt, sessionsNow } from "@/lib/scheduled";
import { createAdminClient } from "@/lib/supabase/admin";

// Police & Thieves on the server (game-db/123_scheduled_games.sql): the lobby's numbers, signing
// up on a side, the shop (prices from src/lib/cops.ts, never the phone's), pulling out, your
// match, and the result your phone saw. Before part 123 is run, every call says it's switched on
// soon (practice against bots still works).

const GAME = "cops-robbers";
const n = (v: unknown) => Number(v ?? 0) || 0;

type Fail = { ok: false; error: string; off?: boolean };

function say(message: string | undefined): Fail {
  const [code, arg] = (message ?? "").split(":");
  if (/sched_/.test(message ?? "") && /does not exist|Could not find/i.test(message ?? "")) return { ok: false, error: "Police & Thieves is switched on soon.", off: true };
  if (code === "not_enough") return { ok: false, error: `You need ${naira(arg)} for that.` };
  if (code === "side_full") return { ok: false, error: "That side is ahead: pick the other side, or wait for someone to join it." };
  if (code === "started") return { ok: false, error: "This game has started: sign-ups and the shop are closed." };
  if (code === "too_many") return { ok: false, error: "You have as many of those as you can take." };
  if (code === "spend_cap") return { ok: false, error: "That's the most you can spend on one game." };
  if (code === "not_in") return { ok: false, error: "Sign up for the game first." };
  if (code === "too_early") return { ok: false, error: "The game isn't over yet." };
  if (code === "frozen") return { ok: false, error: "Your account is paused right now." };
  if (code === "unknown_player") return { ok: false, error: "Please sign in again." };
  if (code === "bad_time") return { ok: false, error: "That game isn't open for sign-ups." };
  console.error("Police & Thieves failed", message);
  // The database's own reason, short, so a problem can be told apart from a blip (and fixed).
  const why = (message ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return { ok: false, error: `Couldn't do that just now. Try again.${why ? ` (${why})` : ""}` };
}

export type Mine = { in: boolean; side?: number; gear?: Loadout; spent?: number; room?: number | null; prize?: number; reported?: boolean };
export type BoardRow = { i: string; n: string; tm: number; a: number; k: number; d: number; l: number; p: number };
export type CopsStatus = {
  ok: true;
  /** The session being played now (if any) and the next one, as the server sees them. */
  live: { key: string; status: string; police: number; thieves: number; pool: number; rooms: number; me: Mine } | null;
  next: { key: string; police: number; thieves: number; pool: number; me: Mine };
  jackpot: number;
  /** The last finished game: its leaderboard (top 10) and what you won. */
  last: { starts_at: string; rows: BoardRow[]; wins: { room: number; w: number; pool: number }[]; me: { side: number; prize: number; room: number } | null } | null;
};

function mine(v: unknown): Mine {
  const m = (v ?? {}) as Record<string, unknown>;
  if (!m.in) return { in: false };
  return { in: true, side: n(m.side), gear: (m.gear ?? {}) as Loadout, spent: n(m.spent), room: m.room == null ? null : n(m.room), prize: n(m.prize), reported: !!m.reported };
}

/** The lobby: now and next, the jackpot, the last game's leaderboard. */
export async function copsStatus(): Promise<CopsStatus | Fail> {
  const userId = await currentUserId();
  const db = createAdminClient();
  const { live, next } = sessionsNow(GAME);
  const ask = (key: string) => db.rpc("sched_status", { p_user: userId, p_game: GAME, p_starts: key });
  const [a, b] = await Promise.all([live ? ask(live.key) : Promise.resolve(null), ask(next.key)]);
  const err = a?.error ?? b.error;
  if (err) return say(err.message);
  const L = (a?.data ?? null) as Record<string, unknown> | null;
  const N = (b.data ?? {}) as Record<string, unknown>;
  const last = (N.last ?? null) as CopsStatus["last"];
  return {
    ok: true,
    live: live && L ? { key: live.key, status: String(L.status), police: n(L.police), thieves: n(L.thieves), pool: n(L.pool), rooms: n(L.rooms), me: mine(L.me) } : null,
    next: { key: next.key, police: n(N.police), thieves: n(N.thieves), pool: n(N.pool), me: mine(N.me) },
    jackpot: n(N.jackpot),
    last: last ? { ...last, rows: (last.rows ?? []).map((r) => ({ ...r, a: n(r.a), k: n(r.k), d: n(r.d), l: n(r.l), p: n(r.p), tm: n(r.tm) })), wins: last.wins ?? [] } : null,
  };
}

/** Only the next game takes sign-ups and shopping. */
function nextKey(key: string) {
  const s = sessionAt(GAME, key);
  return s && s.starts > Date.now() && s.key === sessionsNow(GAME).next.key ? s.key : null;
}

/** Sign up (or change side) for the next game: 0 police, 1 thieves. The ticket is paid once. */
export async function copsJoin(key: string, side: number): Promise<{ ok: true; me: Mine } | Fail> {
  const k = nextKey(key);
  if (!k || (side !== 0 && side !== 1)) return { ok: false, error: "That game isn't open for sign-ups." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play." };
  const { data, error } = await createAdminClient().rpc("sched_join", { p_user: userId, p_game: GAME, p_starts: k, p_side: side, p_ticket: copsMint(COPS_TICKET_NAIRA) });
  if (error) return say(error.message);
  return { ok: true, me: mine(data) };
}

/** Buy gear for the next game (the price is the game's own). */
export async function copsBuy(key: string, item: GearId, qty = 1): Promise<{ ok: true; me: Mine } | Fail> {
  const k = nextKey(key);
  const g = GEAR_BY_ID.get(item);
  if (!k || !g || !Number.isInteger(qty) || qty < 1 || qty > g.max) return { ok: false, error: "You can't buy that now." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play." };
  const { data, error } = await createAdminClient().rpc("sched_buy", { p_user: userId, p_game: GAME, p_starts: k, p_item: item, p_qty: qty, p_price: copsMint(g.naira), p_max: g.max });
  if (error) return say(error.message);
  return { ok: true, me: mine(data) };
}

/** Pull out of the next game before it starts: everything you spent comes back. */
export async function copsLeave(key: string): Promise<{ ok: true } | Fail> {
  const k = nextKey(key);
  if (!k) return { ok: false, error: "Too late to pull out." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play." };
  const { error } = await createAdminClient().rpc("sched_leave", { p_user: userId, p_game: GAME, p_starts: k });
  if (error) return say(error.message);
  return { ok: true };
}

/** a: the player's own avatar (worn in their side's uniform). */
export type RosterSeat = { i: string; n: string; tm: number; g: Loadout; a?: unknown };
export type CopsResult = { w: number; pool: number; jackpot: boolean; rows: BoardRow[] };
export type CopsRoom = {
  ok: true;
  status: string;
  room: number;
  rooms: number;
  seed: number;
  pool: number;
  fightAt: number;
  endsAt: number;
  done: boolean;
  result: CopsResult | null;
  me: Mine;
  roster: RosterSeat[];
};

/** A match of the game being played: yours (room null), or another one to watch. */
export async function copsRoom(key: string, room: number | null = null): Promise<CopsRoom | { ok: true; status: string; rooms?: number } | Fail> {
  const s = sessionAt(GAME, key);
  if (!s) return { ok: false, error: "Unknown game." };
  if (room !== null && (!Number.isInteger(room) || room < 1 || room > 500)) return { ok: false, error: "Unknown match." };
  const userId = await currentUserId();
  const { data, error } = await createAdminClient().rpc("sched_room", { p_user: userId, p_game: GAME, p_starts: s.key, p_room: room });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.seed == null) return { ok: true, status: String(d.status ?? "none"), rooms: n(d.rooms) };
  return {
    ok: true,
    status: String(d.status),
    room: n(d.room),
    rooms: n(d.rooms),
    seed: n(d.seed),
    pool: n(d.pool),
    fightAt: Date.parse(String(d.fight_at)),
    endsAt: Date.parse(String(d.ends_at)),
    done: !!d.done,
    result: (d.result ?? null) as CopsResult | null,
    me: mine(d.me),
    roster: ((d.roster ?? []) as RosterSeat[]).map((r) => ({ i: String(r.i), n: String(r.n).slice(0, 24), tm: n(r.tm), g: (r.g ?? {}) as Loadout, a: r.a ?? undefined })),
  };
}

/** What your phone saw at the end: the winning side (-1 a draw) and everyone's numbers. */
export async function copsReport(key: string, winner: number, scores: Record<string, [number, number, number, number]>): Promise<{ ok: true; result: CopsResult | null } | Fail> {
  const s = sessionAt(GAME, key);
  if (!s || ![-1, 0, 1].includes(winner)) return { ok: false, error: "Unknown game." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play." };
  // Only well-formed numbers, for the players of a match (at most 20).
  const clean: Record<string, number[]> = {};
  for (const [id, v] of Object.entries(scores ?? {}).slice(0, 20)) {
    if (!/^[0-9a-f-]{36}$/.test(id) || !Array.isArray(v)) continue;
    clean[id] = v.slice(0, 4).map((x) => Math.max(0, Math.min(1_000_000, Math.round(Number(x) || 0))));
  }
  const { data, error } = await createAdminClient().rpc("sched_report", { p_user: userId, p_game: GAME, p_starts: s.key, p_winner: winner, p_scores: clean });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, result: d.waiting ? null : (d as unknown as CopsResult) };
}
