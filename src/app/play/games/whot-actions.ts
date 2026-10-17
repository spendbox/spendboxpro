"use server";

import { randomInt } from "node:crypto";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { hideFor, rules, type M, type S } from "@/lib/whot";

// Whot! for a pool, dealt and refereed here (docs/GAME_TABLES.md; game-db/124 whot_games). The
// shuffle and everyone's hands stay on the server: each player is sent only their own hand (the
// others' cards and the market as blanks, -1), a move counts only from the player whose turn it
// is and only if the rules allow it, and the server pays the winner. A turn left to run out is a
// trip to market; a player who has left, or let two turns run out in a row, is played by the
// computer. The phones only ask for the game as it is now (and tell each other to ask again).

type Db = ReturnType<typeof createAdminClient>;
type Game = { s: S; pile: number[]; at: number; missed: number[] };

/** The game as one player (or a watcher, seat -1) may see it. off: before game-db/124 is run (the phones play it among themselves). */
export type WhotView = { off?: false; s: S; pile: number[]; n: number; at: number; bots: number[]; seat: number } | { off: true };

/** Seconds a turn lasts (as the table shows), and a little grace for slow phones. */
const TURN_MS = 30_000;
const GRACE_MS = 4_000;
/** How long the computer takes over a turn. */
const BOT_MS = 1_200;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const missing = (m: string) => /whot_games|challenge_award/.test(m);

type Seat = { user_id: string; left_at: string | null };

/** The challenge, its players in seat order (as the table lists them: by when they joined) and the game, if it's a Whot! game being played. */
async function load(db: Db, id: number) {
  const [{ data: c }, { data: ps }, g] = await Promise.all([
    db.from("challenges").select("status, game, started_at").eq("id", id).maybeSingle(),
    db.from("challenge_players").select("user_id, left_at").eq("challenge_id", id).order("joined_at", { ascending: true }),
    db.from("whot_games").select("game, n").eq("challenge_id", id).maybeSingle(),
  ]);
  if (g.error && missing(g.error.message)) return "off" as const;
  if (!c || c.game !== "whot") return null;
  return { status: String(c.status), started: Date.parse(String(c.started_at ?? "")) || 0, seats: (ps ?? []) as Seat[], game: (g.data?.game as Game | undefined) ?? null, n: Number(g.data?.n ?? 0) };
}

/** Saved only onto the game it was worked out from (another phone's move in between: nothing saved). */
async function save(db: Db, id: number, was: number, game: Game) {
  const { data } = await db.from("whot_games").update({ game, n: game.s.n, updated_at: new Date().toISOString() }).eq("challenge_id", id).eq("n", was).select("n");
  return !!data?.length;
}

/** Play a move onto the game. */
function apply(game: Game, m: M, missedTurn: boolean): Game {
  const seat = game.s.turn;
  const s = rules.play(game.s, m);
  const missed = [...game.missed];
  missed[seat] = missedTurn ? (missed[seat] ?? 0) + 1 : 0;
  return { s, pile: "play" in m ? [...game.pile.slice(-5), m.play] : game.pile, at: Date.now(), missed };
}

/** Seats the computer plays: their player left, or let two turns in a row run out. */
const botSeats = (game: Game, seats: Seat[]) => seats.map((p, i) => (p.left_at || (game.missed[i] ?? 0) >= 2 ? i : -1)).filter((i) => i >= 0);

/**
 * Bring the game up to now: the computer's turn for a seat it plays, or a trip to market for a
 * turn that ran out (one move at a time: the phones ask every few seconds). Returns the game and
 * its move count as saved (another phone may have got there first: then as that one left it).
 */
async function catchUp(db: Db, id: number, seats: Seat[], game: Game, n: number): Promise<{ game: Game; n: number }> {
  const t = rules.turn(game.s);
  if (t < 0) return { game, n };
  const waited = Date.now() - game.at;
  const late = waited > TURN_MS + GRACE_MS;
  // The computer moves after a moment (so people can follow it); anyone else after their time.
  let g: Game;
  if (botSeats(game, seats).includes(t) && waited > BOT_MS) g = apply(game, rules.bot(game.s), !seats[t]?.left_at && late);
  else if (late) g = apply(game, { draw: true }, true);
  else return { game, n };
  if (await save(db, id, n, g)) return { game: g, n: g.s.n };
  const again = await db.from("whot_games").select("game, n").eq("challenge_id", id).maybeSingle();
  return { game: (again.data?.game as Game) ?? game, n: Number(again.data?.n ?? n) };
}

/** Over: the server pays the winner (a tie when the market ran dry: stakes back). */
async function settle(db: Db, id: number, seats: Seat[], game: Game) {
  const won = rules.winners(game.s);
  if (!won) return;
  const winner = won.length === 1 ? (seats[won[0]]?.user_id ?? null) : null;
  await db.rpc("challenge_award", { p_id: id, p_winner: winner });
}

/** What this seat may see: its own hand; the others' cards and the market as blanks; no seed. */
function seen(game: Game, n: number, seats: Seat[], seat: number): WhotView {
  return { s: hideFor(game.s, seat), pile: game.pile, n, at: game.at, bots: botSeats(game, seats), seat };
}

/** Start the game once it's being played: a shuffle nobody's phone knows. */
async function deal(db: Db, id: number, players: number) {
  const s = rules.init(randomInt(1, 2_000_000_000), Math.max(2, players), {});
  const game: Game = { s, pile: [s.top], at: Date.now(), missed: [] };
  const { error } = await db.from("whot_games").insert({ challenge_id: id, game, n: 0 });
  if (error && missing(error.message)) return false;
  return true;
}

async function view(id: number): Promise<WhotView | null> {
  const cid = Math.round(Number(id) || 0);
  const db = createAdminClient();
  const userId = await currentUserId().catch(() => null);
  let c = await load(db, cid);
  if (c === "off") return { off: true };
  if (!c || c.status === "open") return null;
  if (!c.game) {
    if (c.status !== "playing") return null;
    // One that was already being played the old way when game-db/124 was run goes on that way.
    if (Date.now() - c.started > 2 * 60_000) return { off: true };
    if (!(await deal(db, cid, c.seats.length))) return { off: true };
    c = await load(db, cid);
    if (!c || c === "off" || !c.game) return null;
  }
  let { game, n } = c;
  if (c.status === "playing") {
    ({ game, n } = await catchUp(db, cid, c.seats, game, n));
    if (rules.turn(game.s) < 0) await settle(db, cid, c.seats, game);
  }
  return seen(game, n, c.seats, c.seats.findIndex((p) => p.user_id === userId));
}

/** The game as you may see it now (null: not a Whot! game being played, or not started yet). */
export async function whotState(id: number): Promise<WhotView | null> {
  return view(id);
}

/** Play your move (k: the moves played so far, as your phone has it). The game as it is after. */
export async function whotMove(id: number, k: number, m: M): Promise<{ ok: true; view: WhotView | null } | { ok: false; error: string; view: WhotView | null }> {
  const cid = Math.round(Number(id) || 0);
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again.", view: null };
  const db = createAdminClient();
  const c = await load(db, cid);
  if (c === "off" || !c?.game || c.status !== "playing") return { ok: false, error: "That game is over.", view: await view(cid) };
  const seat = c.seats.findIndex((p) => p.user_id === userId && !p.left_at);
  const s = c.game.s;
  // A move from another moment (someone else moved first), or not yours to make: the game as it is.
  if (seat < 0 || c.n !== Math.round(Number(k)) || rules.turn(s) !== seat) return { ok: false, error: "", view: await view(cid) };
  const move: M | null = m && typeof m === "object" && "draw" in m ? { draw: true } : m && typeof m === "object" && "play" in m ? { play: Math.round(Number(m.play)), ...(m.ask === undefined ? {} : { ask: Math.round(Number(m.ask)) }) } : null;
  if (!move || !rules.moves(s).some((x) => same(x, move))) return { ok: false, error: "You can't play that card now.", view: await view(cid) };
  const next = apply(c.game, move, false);
  if (!(await save(db, cid, c.n, next))) return { ok: false, error: "", view: await view(cid) };
  if (rules.turn(next.s) < 0) await settle(db, cid, c.seats, next);
  return { ok: true, view: seen(next, next.s.n, c.seats, seat) };
}
