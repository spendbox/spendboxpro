import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Phase = "join" | "seek" | "done";

export type GameEvent = {
  id: number;
  kind: "moved" | "caught" | "searched" | "sweep";
  tile: number;
  at: string;
  detail: { how?: string; finder?: string | null; count?: number; bot?: boolean; radius?: number } | null;
};

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
    /** Price of a sweep by size (1 = 3×3, 2 = 5×5, 3 = 7×7) right now. */
    sweepPrices: Record<1 | 2 | 3, number>;
    botName: string;
  } | null;
  entry: {
    role: "hider" | "seeker";
    tile: number | null;
    moves: number;
    caught: boolean;
    visited: number[];
    lastMoveAt: string | null;
    lastSweepAt: string | null;
    lastSweptAt: string | null;
  } | null;
  mySearches: { tile: number; caught: number }[];
  /** The latest searches by anyone (no results), so everyone sees tiles light up. */
  recentSearches: { tile: number; at: string }[];
  /** Searched tiles everyone can see: only the most recent share (the oldest are forgotten). */
  knownSearched: number[];
  /** For a hider still hidden: what surviving would pay right now. */
  outlook: { stakeBack: number; share: number } | null;
  leftTiles: number[];
  caughtTiles: number[];
  /** Latest public happenings (moves, catches, searches, sweeps) for notices and animations. */
  events: GameEvent[];
  lastResult: { roundId: number; role: string; payout: number; caught: boolean } | null;
  results: RoundResults | null;
  prices: { stake: number; moveFee: number; moveCooldown: number; sweepCooldown: number };
};

export type RoundResults = {
  roundId: number;
  finishedAt: string;
  tileCount: number;
  hidersTotal: number;
  caught: number;
  searches: number;
  pool: number;
  botName: string;
  botFoundBy: string | null;
  winners: { name: string; role: string; won: number; detail: string }[];
  players: number;
  /** What the signed-in player got out of that round, if they played. */
  mine: { role: string; won: number; detail: string; caught: boolean } | null;
};

/** The signed-in player's id, or null. */
export async function currentUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (data?.claims?.sub) return data.claims.sub as string;
  if (!error) return null;
  // One more try (a brief network hiccup shouldn't sign anyone out).
  const retry = await supabase.auth.getUser();
  return retry.data.user?.id ?? null;
}

/** True when the browser still carries a login cookie (even if checking it just failed). */
export async function hasLoginCookie() {
  const { cookies } = await import("next/headers");
  return (await cookies()).getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

const num = (v: unknown) => Number(v ?? 0);
const money = (n: number) => Math.round(n * 100) / 100;

export async function loadGame(userId: string): Promise<GameState> {
  const db = createAdminClient();
  // Moves the round clock along (and lets the Seed Bot think). A scheduled job does this
  // too; calling it here keeps the game moving even if that job is not set up.
  await db.rpc("tick");

  const [{ data: profile, error: profileError }, { data: round }, { data: settings }] = await Promise.all([
    db.from("profiles").select("username, pin_set, coins, bonus_coins, seeker_rounds, free_search_day").eq("id", userId).single(),
    db.from("rounds").select("*").order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("game_settings").select("key, value"),
  ]);
  // Couldn't read the profile (network blip): fail loudly so the page retries, rather than
  // treating the player as brand new.
  if (profileError || !profile) throw new Error(`Profile not loaded: ${profileError?.message ?? "missing"}`);
  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, num(r.value)]));
  const today = new Date().toISOString().slice(0, 10);

  let entry: GameState["entry"] = null;
  let mySearches: GameState["mySearches"] = [];
  let leftTiles: number[] = [];
  let caughtTiles: number[] = [];
  let recentSearches: GameState["recentSearches"] = [];
  let knownSearched: number[] = [];
  let outlook: GameState["outlook"] = null;
  let events: GameEvent[] = [];
  if (round) {
    const [{ data: e }, { data: searches }, { data: allEvents }, { data: allSearches }] = await Promise.all([
      db
        .from("entries")
        .select("role, tile, moves, caught, stake, stake_weight, visited, last_move_at, last_sweep_at, last_swept_at")
        .eq("round_id", round.id)
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("searches").select("tile, caught").eq("round_id", round.id).eq("seeker_id", userId),
      db.from("events").select("id, kind, tile, detail, created_at").eq("round_id", round.id).order("id", { ascending: true }),
      db.from("searches").select("tile, created_at").eq("round_id", round.id).order("created_at", { ascending: true }),
    ]);
    if (e) {
      entry = {
        role: e.role,
        tile: e.tile,
        moves: e.moves,
        caught: e.caught,
        visited: e.visited ?? [],
        lastMoveAt: e.last_move_at,
        lastSweepAt: e.last_sweep_at,
        lastSweptAt: e.last_swept_at,
      };
    }
    mySearches = searches ?? [];
    const list = allSearches ?? [];
    recentSearches = list.slice(-12).reverse().map((r) => ({ tile: r.tile, at: r.created_at }));
    // Everyone sees the most recent 70% of searched tiles; the oldest are forgotten.
    const keep = Math.ceil(list.length * (s.searched_visible_fraction ?? 0.7));
    knownSearched = list.slice(list.length - keep).map((r) => r.tile);
    leftTiles = (allEvents ?? []).filter((x) => x.kind === "moved").map((x) => x.tile);
    caughtTiles = (allEvents ?? []).filter((x) => x.kind === "caught").map((x) => x.tile);
    events = (allEvents ?? []).slice(-40).map((x) => ({ id: x.id, kind: x.kind, tile: x.tile, at: x.created_at, detail: x.detail }));

    if (e?.role === "hider" && !e.caught) {
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

  const { data: last } = await db
    .from("entries")
    .select("round_id, role, payout, caught, rounds!inner(status)")
    .eq("user_id", userId)
    .eq("rounds.status", "done")
    .order("round_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const results = await loadResults(db, userId);
  const tileCount = round?.tile_count ?? 0;
  const frac = tileCount ? Math.min(1, (round?.searched_count ?? 0) / tileCount) : 0;
  const searchPrice = money(s.search_price_start + (s.search_price_max - s.search_price_start) * frac);
  const sweepPrice = (radius: number) =>
    money(((s.sweep_base_price * (2 * radius + 1) * (2 * radius + 1)) / 9) * (1 + s.sweep_price_growth * (round?.sweep_count ?? 0)));

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
          sweepPrices: { 1: sweepPrice(1), 2: sweepPrice(2), 3: sweepPrice(3) },
          botName: round.bot_name ?? "Seed Bot",
        }
      : null,
    entry,
    mySearches,
    recentSearches,
    knownSearched,
    outlook,
    leftTiles,
    caughtTiles,
    events,
    results,
    lastResult: last ? { roundId: last.round_id, role: last.role, payout: num(last.payout), caught: last.caught } : null,
    prices: {
      stake: s.hider_stake,
      moveFee: s.second_move_fee,
      moveCooldown: s.move_cooldown_seconds ?? 60,
      sweepCooldown: s.sweep_cooldown_seconds ?? 10,
    },
  };
}

const WIN_KINDS: Record<string, string> = {
  catch_reward: "found hiders",
  bot_bounty: "found the bot",
  pool_hider: "survived",
  stake_return: "got their stake back",
  pool_seeker: "seeker share",
};

/** Results of the most recently finished round: who won what (and what you won). */
async function loadResults(db: ReturnType<typeof createAdminClient>, userId: string): Promise<RoundResults | null> {
  const { data: round } = await db
    .from("rounds")
    .select("id, finished_at, tile_count, hiders_total, hiders_remaining, searched_count, pool, bot_name")
    .eq("status", "done")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round) return null;
  const [{ data: ledger }, { data: entries }] = await Promise.all([
    db.from("ledger").select("user_id, kind, amount").eq("round_id", round.id).in("kind", Object.keys(WIN_KINDS)),
    db.from("entries").select("user_id, role, caught, caught_by, profiles!entries_user_id_fkey(username, is_bot)").eq("round_id", round.id),
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
    if (l.kind !== "stake_return") t.reasons.add(WIN_KINDS[l.kind]);
    totals.set(l.user_id, t);
  }
  const describe = (t: { reasons: Set<string> }) => [...t.reasons].join(", ") || "got their stake back";
  const winners = [...totals.entries()]
    .map(([id, t]) => ({ name: nameOf.get(id) ?? "A player", role: roleOf.get(id) ?? "seeker", won: money(t.won), detail: describe(t) }))
    .sort((a, b) => b.won - a.won)
    .slice(0, 10);
  const bot = (entries ?? []).find((e) => (e.profiles as unknown as { is_bot: boolean } | null)?.is_bot);
  const myEntry = (entries ?? []).find((e) => e.user_id === userId);
  const myTotal = totals.get(userId);
  return {
    roundId: round.id,
    finishedAt: round.finished_at,
    tileCount: round.tile_count,
    hidersTotal: round.hiders_total,
    caught: round.hiders_total - round.hiders_remaining,
    searches: round.searched_count,
    pool: num(round.pool),
    botName: round.bot_name ?? "Seed Bot",
    botFoundBy: bot?.caught_by ? (nameOf.get(bot.caught_by) ?? "A player") : null,
    winners,
    players: entries?.length ? entries.length - (bot ? 1 : 0) : 0,
    mine: myEntry
      ? { role: myEntry.role, won: money(myTotal?.won ?? 0), detail: myTotal ? describe(myTotal) : "", caught: myEntry.caught }
      : null,
  };
}
