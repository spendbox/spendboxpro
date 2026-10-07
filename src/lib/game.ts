import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Phase = "join" | "seek" | "done";

export type GameState = {
  serverNow: string;
  me: { id: string; name: string | null; pinSet: boolean; coins: number; bonusCoins: number; canHide: boolean; freeSearch: boolean };
  round: {
    id: number;
    status: Phase;
    joinEndsAt: string;
    seekEndsAt: string;
    tileCount: number;
    hidersTotal: number;
    hidersRemaining: number;
    pool: number;
    searchPrice: number;
  } | null;
  entry: { role: "hider" | "seeker"; tile: number | null; moves: number; caught: boolean } | null;
  mySearches: { tile: number; caught: number }[];
  /** The latest searches by anyone (no results), so everyone sees tiles light up. */
  recentSearches: { tile: number; at: string }[];
  /** Every searched tile: only sent to hiders, who need to know where they can't move. */
  allSearched: number[];
  /** For a hider still hidden: what surviving would pay right now. */
  outlook: { stakeBack: number; share: number } | null;
  leftTiles: number[];
  caughtTiles: number[];
  lastResult: { roundId: number; role: string; payout: number; caught: boolean } | null;
  results: RoundResults | null;
  prices: { stake: number; moveFee: number; sweepBase: number };
};

export type RoundResults = {
  roundId: number;
  finishedAt: string;
  tileCount: number;
  hidersTotal: number;
  caught: number;
  searches: number;
  pool: number;
  botFoundBy: string | null;
  winners: { name: string; role: string; won: number; detail: string }[];
  players: number;
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
    db.from("profiles").select("username, pin_set, coins, bonus_coins, seeker_rounds, free_search_day").eq("id", userId).single(),
    db.from("rounds").select("*").order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("game_settings").select("key, value"),
  ]);
  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, num(r.value)]));
  const today = new Date().toISOString().slice(0, 10);

  let entry: GameState["entry"] = null;
  let mySearches: GameState["mySearches"] = [];
  let leftTiles: number[] = [];
  let caughtTiles: number[] = [];
  let recentSearches: GameState["recentSearches"] = [];
  let allSearched: number[] = [];
  let outlook: GameState["outlook"] = null;
  if (round) {
    const [{ data: e }, { data: searches }, { data: events }, { data: recent }] = await Promise.all([
      db.from("entries").select("role, tile, moves, caught, stake, stake_weight").eq("round_id", round.id).eq("user_id", userId).maybeSingle(),
      db.from("searches").select("tile, caught").eq("round_id", round.id).eq("seeker_id", userId),
      db.from("events").select("kind, tile").eq("round_id", round.id),
      db.from("searches").select("tile, created_at").eq("round_id", round.id).order("created_at", { ascending: false }).limit(12),
    ]);
    if (e) entry = { role: e.role, tile: e.tile, moves: e.moves, caught: e.caught };
    recentSearches = (recent ?? []).map((r) => ({ tile: r.tile, at: r.created_at }));
    if (e?.role === "hider") {
      const { data: all } = await db.from("searches").select("tile").eq("round_id", round.id);
      allSearched = (all ?? []).map((r) => r.tile);
      if (!e.caught) {
        const { data: alive } = await db
          .from("entries")
          .select("stake_weight")
          .eq("round_id", round.id)
          .eq("role", "hider")
          .eq("caught", false)
          .gt("stake_weight", 0);
        const total = (alive ?? []).reduce((t, r) => t + num(r.stake_weight), 0);
        const share = total > 0 ? (num(round.pool) * s.pool_hiders * num(e.stake_weight)) / total : 0;
        outlook = { stakeBack: num(e.stake), share: Math.floor(share * 100) / 100 };
      }
    }
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

  const results = await loadResults(db);
  const tileCount = round?.tile_count ?? 0;
  const frac = tileCount ? Math.min(1, (round?.searched_count ?? 0) / tileCount) : 0;
  const searchPrice =
    Math.round((s.search_price_start + (s.search_price_max - s.search_price_start) * frac) * 100) / 100;

  return {
    serverNow: new Date().toISOString(),
    me: {
      id: userId,
      name: profile?.username ?? null,
      pinSet: Boolean(profile?.pin_set),
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
          hidersTotal: round.hiders_total,
          hidersRemaining: round.hiders_remaining,
          pool: num(round.pool),
          searchPrice,
        }
      : null,
    entry,
    mySearches,
    recentSearches,
    allSearched,
    outlook,
    leftTiles,
    caughtTiles,
    results,
    lastResult: last ? { roundId: last.round_id, role: last.role, payout: num(last.payout), caught: last.caught } : null,
    prices: { stake: s.hider_stake, moveFee: s.second_move_fee, sweepBase: s.sweep_base_price },
  };
}

const WIN_KINDS: Record<string, string> = {
  catch_reward: "found hiders",
  bot_bounty: "found the Seed Bot",
  pool_hider: "survived",
  stake_return: "survived",
  pool_seeker: "seeker share",
};

/** Results of the most recently finished round: who won what. */
async function loadResults(db: ReturnType<typeof createAdminClient>): Promise<RoundResults | null> {
  const { data: round } = await db
    .from("rounds")
    .select("id, finished_at, tile_count, hiders_total, hiders_remaining, searched_count, pool")
    .eq("status", "done")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return null;
  const [{ data: ledger }, { data: entries }] = await Promise.all([
    db.from("ledger").select("user_id, kind, amount").eq("round_id", round.id).in("kind", Object.keys(WIN_KINDS)),
    db.from("entries").select("user_id, role, caught_by, profiles!entries_user_id_fkey(username, is_bot)").eq("round_id", round.id),
  ]);
  const ids = new Set<string>();
  for (const l of ledger ?? []) if (l.user_id) ids.add(l.user_id);
  for (const e of entries ?? []) if (e.caught_by) ids.add(e.caught_by);
  const { data: people } = ids.size
    ? await db.from("profiles").select("id, username").in("id", [...ids])
    : { data: [] as { id: string; username: string | null }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.username ?? "A player"]));
  const roleOf = new Map((entries ?? []).map((e) => [e.user_id, e.role as string]));

  const totals = new Map<string, { won: number; reasons: Set<string> }>();
  for (const l of ledger ?? []) {
    if (!l.user_id) continue;
    const t = totals.get(l.user_id) ?? { won: 0, reasons: new Set<string>() };
    t.won += num(l.amount);
    t.reasons.add(WIN_KINDS[l.kind]);
    totals.set(l.user_id, t);
  }
  const winners = [...totals.entries()]
    .map(([id, t]) => ({
      name: nameOf.get(id) ?? "A player",
      role: roleOf.get(id) ?? "seeker",
      won: Math.round(t.won * 100) / 100,
      detail: [...t.reasons].join(", "),
    }))
    .sort((a, b) => b.won - a.won)
    .slice(0, 10);
  const bot = (entries ?? []).find((e) => (e.profiles as unknown as { is_bot: boolean } | null)?.is_bot);
  return {
    roundId: round.id,
    finishedAt: round.finished_at,
    tileCount: round.tile_count,
    hidersTotal: round.hiders_total,
    caught: round.hiders_total - round.hiders_remaining,
    searches: round.searched_count,
    pool: num(round.pool),
    botFoundBy: bot?.caught_by ? (nameOf.get(bot.caught_by) ?? "A player") : null,
    winners,
    players: entries?.length ? entries.length - (bot ? 1 : 0) : 0,
  };
}
