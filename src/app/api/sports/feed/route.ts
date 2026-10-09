import { after, connection, NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { matchById } from "@/lib/sports/schedule";
import { feed } from "@/lib/sports/sim.server";
import type { FeedResponse, MatchInfo } from "@/lib/sports/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleIfDue } from "../settle";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MATCH_RE = /^(football|basketball|boxing|wrestling):[A-Za-z0-9_-]{1,40}$/;

const reply = (body: FeedResponse, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * GET /api/sports/feed?match=<id>&from=<t> → FeedResponse
 * A match as it stands right now: its info, the scoreline, the betting pool, and (for signed-in
 * players holding a ticket) the frames of play after time t. Never anything from the future.
 * Add &lite=1 to skip the frames (for score tickers on the match list).
 * When the match is over, its bets are paid out just after the reply goes back.
 */
export async function GET(request: Request) {
  await connection(); // always live, never cached
  const url = new URL(request.url);
  const id = url.searchParams.get("match") ?? "";
  const fromRaw = Number(url.searchParams.get("from") ?? 0);
  const from = Number.isFinite(fromRaw) && fromRaw > 0 ? fromRaw : 0;
  const lite = url.searchParams.get("lite") === "1";

  let match: MatchInfo | null = null;
  try {
    match = MATCH_RE.test(id) ? (matchById(id) ?? null) : null;
  } catch {
    match = null;
  }
  if (!match) return reply({ ok: false, error: "That match doesn't exist." }, 404);

  try {
    const now = Date.now();
    const userId = await currentUserId().catch(() => null);
    // One small read: the pool, this player's ticket, and whether the bets are paid out yet.
    // If it fails, the match itself is still shown (no frames, an empty pool).
    let state: { pool?: Record<string, unknown>; ticket?: boolean; settled?: boolean } = {};
    try {
      const { data, error } = await createAdminClient().rpc("match_state", { p_match: match.id, p_user: userId });
      if (error) console.error("Match feed: reading the pool failed", error.message);
      else state = (data ?? {}) as typeof state;
    } catch (error) {
      console.error("Match feed: reading the pool failed", error);
    }
    const ticket = Boolean(userId && state.ticket);

    const f = feed(match.id, now, from);
    if (f.done && !state.settled) {
      const matchId = match.id;
      after(() => settleIfDue(matchId));
    }

    const pool: Record<string, number> = {};
    for (const o of match.options) pool[o.key] = 0;
    for (const [k, v] of Object.entries(state.pool ?? {})) pool[k] = Number(v) || 0;

    return reply({
      ok: true,
      now,
      match,
      ticket,
      frames: ticket && !lite ? f.frames : [],
      done: f.done,
      result: f.done ? f.result : null,
      scoreline: f.scoreline,
      pool,
    });
  } catch (error) {
    console.error("Match feed failed", id, error);
    return reply({ ok: false, error: "Couldn't load the match. Try again." }, 500);
  }
}
