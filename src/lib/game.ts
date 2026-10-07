import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Phase = "join" | "seek" | "done";

export type GameState = {
  serverNow: string;
  me: { id: string; coins: number; bonusCoins: number; canHide: boolean; freeSearch: boolean };
  round: {
    id: number;
    status: Phase;
    joinEndsAt: string;
    seekEndsAt: string;
    tileCount: number;
    width: number;
    hidersTotal: number;
    hidersRemaining: number;
    pool: number;
    searchPrice: number;
  } | null;
  entry: { role: "hider" | "seeker"; tile: number | null; moves: number; caught: boolean } | null;
  mySearches: { tile: number; caught: number }[];
  leftTiles: number[];
  caughtTiles: number[];
  lastResult: { roundId: number; role: string; payout: number; caught: boolean } | null;
  prices: { stake: number; moveFee: number; sweepBase: number };
};

/** The signed-in player's id, or null. */
export async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

const num = (v: unknown) => Number(v ?? 0);

export async function loadGame(userId: string): Promise<GameState> {
  const db = createAdminClient();
  // Moves the round clock along. A scheduled job does this too; calling it here keeps
  // the game moving even if that job is not set up.
  await db.rpc("tick");

  const [{ data: profile }, { data: round }, { data: settings }] = await Promise.all([
    db.from("profiles").select("coins, bonus_coins, seeker_rounds, free_search_day").eq("id", userId).single(),
    db.from("rounds").select("*").order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("game_settings").select("key, value"),
  ]);
  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, num(r.value)]));
  const today = new Date().toISOString().slice(0, 10);

  let entry: GameState["entry"] = null;
  let mySearches: GameState["mySearches"] = [];
  let leftTiles: number[] = [];
  let caughtTiles: number[] = [];
  if (round) {
    const [{ data: e }, { data: searches }, { data: events }] = await Promise.all([
      db.from("entries").select("role, tile, moves, caught").eq("round_id", round.id).eq("user_id", userId).maybeSingle(),
      db.from("searches").select("tile, caught").eq("round_id", round.id).eq("seeker_id", userId),
      db.from("events").select("kind, tile").eq("round_id", round.id),
    ]);
    if (e) entry = { role: e.role, tile: e.tile, moves: e.moves, caught: e.caught };
    mySearches = searches ?? [];
    leftTiles = (events ?? []).filter((x) => x.kind === "moved").map((x) => x.tile);
    caughtTiles = (events ?? []).filter((x) => x.kind === "caught").map((x) => x.tile);
  }

  const { data: last } = await db
    .from("entries")
    .select("round_id, role, payout, caught, rounds!inner(status)")
    .eq("user_id", userId)
    .eq("rounds.status", "done")
    .order("round_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tileCount = round?.tile_count ?? 0;
  const frac = tileCount ? Math.min(1, (round?.searched_count ?? 0) / tileCount) : 0;
  const searchPrice =
    Math.round((s.search_price_start + (s.search_price_max - s.search_price_start) * frac) * 100) / 100;

  return {
    serverNow: new Date().toISOString(),
    me: {
      id: userId,
      coins: num(profile?.coins),
      bonusCoins: num(profile?.bonus_coins),
      canHide: (profile?.seeker_rounds ?? 0) >= 1,
      freeSearch: profile?.free_search_day !== today,
    },
    round: round
      ? {
          id: round.id,
          status: round.status,
          joinEndsAt: round.join_ends_at,
          seekEndsAt: round.seek_ends_at,
          tileCount,
          width: Math.max(1, Math.ceil(Math.sqrt(Math.max(tileCount, 1)))),
          hidersTotal: round.hiders_total,
          hidersRemaining: round.hiders_remaining,
          pool: num(round.pool),
          searchPrice,
        }
      : null,
    entry,
    mySearches,
    leftTiles,
    caughtTiles,
    lastResult: last ? { roundId: last.round_id, role: last.role, payout: num(last.payout), caught: last.caught } : null,
    prices: { stake: s.hider_stake, moveFee: s.second_move_fee, sweepBase: s.sweep_base_price },
  };
}
