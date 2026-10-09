"use server";

import { settleIfDue } from "@/app/api/sports/settle";
import { currentUserId } from "@/lib/game";
import { matchById } from "@/lib/sports/schedule";
import type { MatchInfo, Sport } from "@/lib/sports/types";
import { createAdminClient } from "@/lib/supabase/admin";

// The stadium's coins: tickets to watch a match, bets on who wins, and the player's bets.
// The database (game-db/020_sports.sql) checks every rule and keeps the coin books; the match
// schedule (src/lib/sports/schedule.ts) says when betting closes and what can be bet on.
// Nothing here throws: every failure comes back as { ok: false, error } in plain words.

type Fail = { ok: false; error: string };
type DbError = { message?: string; code?: string } | null | undefined;

const MATCH_RE = /^(football|basketball|boxing|wrestling):[A-Za-z0-9_-]{1,40}$/;

/** Messages the database raises on purpose (plain RAISE EXCEPTION, code P0001) are already written for players. */
function friendly(error: DbError, fallback: string) {
  if (error?.code === "P0001" && error.message) return error.message;
  console.error("Sports action failed", error?.message ?? error);
  return fallback;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** { option: coins } from the database, with every one of the match's options present. */
function poolOf(raw: unknown, match?: MatchInfo | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of match?.options ?? []) out[o.key] = 0;
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = num(v);
  return out;
}

function findMatch(matchId: unknown): MatchInfo | null {
  if (typeof matchId !== "string" || !MATCH_RE.test(matchId)) return null;
  try {
    return matchById(matchId) ?? null;
  } catch {
    return null;
  }
}

/** The colour of the side an option backs (home or away), if it backs one. */
function optionColor(match: MatchInfo, key: string): string | null {
  if (key === "home") return match.home.colour ?? null;
  if (key === "away") return match.away.colour ?? null;
  return null;
}

// ---------------------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------------------

/** Buy a ticket to watch a match (once per match; buying again is free). */
export async function buyTicket(
  matchId: string,
): Promise<{ ok: true; already: boolean; price: number; balance: number } | Fail> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "Sign in to watch matches." };
    const match = findMatch(matchId);
    if (!match) return { ok: false, error: "That match doesn't exist." };
    if (Date.now() >= match.endsAt) return { ok: false, error: "This match is over. Pick another one!" };
    const { data, error } = await createAdminClient().rpc("buy_ticket", { p_user: userId, p_match: match.id });
    if (error || !data) return { ok: false, error: friendly(error, "Couldn't buy the ticket. Try again.") };
    const d = data as { already?: boolean; price?: number; balance?: number };
    return { ok: true, already: Boolean(d.already), price: num(d.price), balance: num(d.balance) };
  } catch (error) {
    console.error("Buying a ticket failed", error);
    return { ok: false, error: "Couldn't buy the ticket. Try again." };
  }
}

// ---------------------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------------------

/** Bet coins on one option of a match (until kick-off). */
export async function placeBet(
  matchId: string,
  option: string,
  amount: number,
): Promise<
  | { ok: true; id: number; option: string; amount: number; pool: Record<string, number>; mine: number; leftToday: number; balance: number }
  | Fail
> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "Sign in to bet." };
    const match = findMatch(matchId);
    if (!match) return { ok: false, error: "That match doesn't exist." };
    if (typeof option !== "string" || !match.options.some((o) => o.key === option)) {
      return { ok: false, error: "Pick who you think will win." };
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) return { ok: false, error: "Pick a whole number of coins." };
    const now = Date.now();
    if (now >= match.kickoffAt) return { ok: false, error: "Bets are closed: it's kicked off" };
    if (now < match.opensAt) {
      const mins = Math.max(1, Math.ceil((match.opensAt - now) / 60_000));
      return { ok: false, error: `Betting on this one opens in ${mins} min.` };
    }
    const { data, error } = await createAdminClient().rpc("place_bet", {
      p_user: userId,
      p_match: match.id,
      p_option: option,
      p_amount: amount,
      p_kickoff: new Date(match.kickoffAt).toISOString(),
      p_options: match.options.map((o) => o.key),
    });
    if (error || !data) return { ok: false, error: friendly(error, "Couldn't place the bet. Try again.") };
    const d = data as { id?: number; option?: string; amount?: number; pool?: unknown; mine?: number; left_today?: number; balance?: number };
    return {
      ok: true,
      id: num(d.id),
      option: String(d.option ?? option),
      amount: num(d.amount),
      pool: poolOf(d.pool, match),
      mine: num(d.mine),
      leftToday: num(d.left_today),
      balance: num(d.balance),
    };
  } catch (error) {
    console.error("Placing a bet failed", error);
    return { ok: false, error: "Couldn't place the bet. Try again." };
  }
}

/** One of the player's bets, ready to show. */
export type MyBet = {
  id: number;
  matchId: string;
  sport: Sport | null;
  /** "Lions vs Eagles" (or the match id if the schedule doesn't know it any more). */
  title: string;
  option: string;
  optionLabel: string;
  /** The backed side's colour (null for a draw). */
  color: string | null;
  amount: number;
  placedAt: number;
  kickoffAt: number | null;
  endsAt: number | null;
  settled: boolean;
  /** Coins paid back (winnings or a refund); 0 for a lost bet, null while it's open. */
  payout: number | null;
  winner: string | null;
  winnerLabel: string | null;
  score: string | null;
  refunded: boolean;
};

type BetRow = {
  id: number;
  match: string;
  option: string;
  amount: number;
  at: string;
  settled: boolean;
  payout: number | null;
  winner: string | null;
  score: string | null;
  refunded: boolean;
};

/** The player's last 30 bets, newest first (bets on matches that just ended are paid out first). */
export async function myBets(): Promise<{ ok: true; bets: MyBet[] } | Fail> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "Sign in to see your bets." };
    const db = createAdminClient();
    const load = async () => {
      const { data, error } = await db.rpc("my_bets", { p_user: userId });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as BetRow[];
    };
    let rows = await load();
    const now = Date.now();
    const due = [...new Set(rows.filter((r) => !r.settled).map((r) => r.match))]
      .filter((id) => {
        const m = findMatch(id);
        return m && now >= m.endsAt;
      })
      .slice(0, 6);
    if (due.length) {
      const done = await Promise.all(due.map((id) => settleIfDue(id, now)));
      if (done.some(Boolean)) rows = await load();
    }
    return {
      ok: true,
      bets: rows.map((r) => {
        const m = findMatch(r.match);
        const label = (key: string | null) => (key ? (m?.options.find((o) => o.key === key)?.label ?? key) : null);
        return {
          id: num(r.id),
          matchId: String(r.match),
          sport: m?.sport ?? null,
          title: m?.title ?? String(r.match),
          option: String(r.option),
          optionLabel: label(r.option) ?? String(r.option),
          color: m ? optionColor(m, r.option) : null,
          amount: num(r.amount),
          placedAt: Date.parse(r.at) || 0,
          kickoffAt: m?.kickoffAt ?? null,
          endsAt: m?.endsAt ?? null,
          settled: Boolean(r.settled),
          payout: r.payout === null || r.payout === undefined ? null : num(r.payout),
          winner: r.winner ?? null,
          winnerLabel: label(r.winner ?? null),
          score: r.score ?? null,
          refunded: Boolean(r.refunded),
        };
      }),
    };
  } catch (error) {
    console.error("Loading bets failed", error);
    return { ok: false, error: "Couldn't load your bets. Try again." };
  }
}

/** Coins bet on each option of a match so far. */
export async function matchPool(matchId: string): Promise<{ ok: true; pool: Record<string, number> } | Fail> {
  try {
    const match = findMatch(matchId);
    if (!match) return { ok: false, error: "That match doesn't exist." };
    const { data, error } = await createAdminClient().rpc("match_pool", { p_match: match.id });
    if (error) return { ok: false, error: friendly(error, "Couldn't load the pool. Try again.") };
    return { ok: true, pool: poolOf(data, match) };
  } catch (error) {
    console.error("Loading a pool failed", error);
    return { ok: false, error: "Couldn't load the pool. Try again." };
  }
}

/** What the sportsbook shows for a few matches at once. */
export type SportsBoard = {
  signedIn: boolean;
  /** match → option → coins. */
  pools: Record<string, Record<string, number>>;
  /** What this player has bet: match → option → coins. */
  mine: Record<string, Record<string, number>>;
  tickets: string[];
  settled: string[];
  coins: number | null;
  /** Coins this player has bet today. */
  today: number;
  limits: { min: number; max: number; dailyMax: number; burnShare: number };
  prices: Record<Sport, number>;
};

/** Pools, the player's own bets and tickets, their coins and the betting limits, for up to 20 matches. */
export async function sportsBoard(matchIds: string[]): Promise<({ ok: true } & SportsBoard) | Fail> {
  try {
    const matches = (Array.isArray(matchIds) ? matchIds : [])
      .map(findMatch)
      .filter((m): m is MatchInfo => m !== null)
      .slice(0, 20);
    const userId = await currentUserId().catch(() => null);
    const { data, error } = await createAdminClient().rpc("sports_board", {
      p_user: userId,
      p_matches: matches.map((m) => m.id),
    });
    if (error || !data) return { ok: false, error: friendly(error, "Couldn't load the matches. Try again.") };
    const d = data as {
      pools?: Record<string, unknown>;
      mine?: Record<string, unknown>;
      tickets?: string[];
      settled?: string[];
      coins?: number | null;
      today?: number;
      limits?: { min?: number; max?: number; daily_max?: number; burn_share?: number };
      prices?: Partial<Record<Sport, number>>;
    };
    const pools: SportsBoard["pools"] = {};
    const mine: SportsBoard["mine"] = {};
    for (const m of matches) {
      pools[m.id] = poolOf(d.pools?.[m.id], m);
      if (d.mine?.[m.id]) mine[m.id] = poolOf(d.mine[m.id]);
    }
    return {
      ok: true,
      signedIn: Boolean(userId),
      pools,
      mine,
      tickets: Array.isArray(d.tickets) ? d.tickets.map(String) : [],
      settled: Array.isArray(d.settled) ? d.settled.map(String) : [],
      coins: userId && d.coins !== null && d.coins !== undefined ? num(d.coins) : null,
      today: num(d.today),
      limits: {
        min: num(d.limits?.min ?? 10),
        max: num(d.limits?.max ?? 500),
        dailyMax: num(d.limits?.daily_max ?? 2000),
        burnShare: num(d.limits?.burn_share ?? 0.1),
      },
      prices: {
        football: num(d.prices?.football ?? 20),
        basketball: num(d.prices?.basketball ?? 15),
        boxing: num(d.prices?.boxing ?? 15),
        wrestling: num(d.prices?.wrestling ?? 15),
      },
    };
  } catch (error) {
    console.error("Loading the sportsbook failed", error);
    return { ok: false, error: "Couldn't load the matches. Try again." };
  }
}
