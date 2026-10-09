import "server-only";
import { mintify } from "@/lib/brand";
import { after } from "next/server";
import { settleRecent } from "@/app/api/sports/settle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { botNameFor } from "@/lib/bot-names";
import { friendLists, NO_FRIENDS, type FriendLists } from "@/lib/friends";
import { cleanAvatar, type Avatar } from "@/lib/avatar";
import type { WorldEvent } from "@/lib/world-events";
import type { TownHouse } from "@/lib/houses";
import { loadRoundHouses } from "@/lib/houses.server";

export type Phase = "join" | "seek" | "done";

export type GameEvent = {
  id: number;
  kind: "moved" | "caught" | "searched" | "sweep" | "shielded" | "decoy" | "decoy_found" | "respawn" | "area_search";
  /** Where it happened (-1 when it's secret, like a decoy going down or a respawn). */
  tile: number;
  at: string;
  detail: {
    how?: string;
    finder?: string | null;
    count?: number;
    bot?: boolean;
    radius?: number;
    /** Who moved (for "moved"). */
    name?: string | null;
    user?: string | null;
    /** Who was found (for "caught"). */
    hiders?: { name: string | null; avatar: unknown; bot: boolean; user?: string | null; level?: number | null }[];
    /** A decoy that was searched: did it go bang, or was it a toy? */
    outcome?: "explode" | "toy";
    avatar?: unknown;
  } | null;
};

export type GameState = {
  serverNow: string;
  me: {
    id: string;
    /** Watching without signing in. */
    guest: boolean;
    name: string | null;
    pinSet: boolean;
    coins: number;
    bonusCoins: number;
    canHide: boolean;
    freeSearch: boolean;
    avatar: Avatar;
    /** Coins that just trickled in from passive income (under 100 coins). */
    passiveGained: number;
    level: number;
    /** When your next search is allowed (it waits longer if you search too fast). */
    searchReadyAt: string | null;
    /** Holding 10,000+ coins. */
    bigFish: boolean;
  };
  /** Everyone in this round (not the bot), for finding people to chat with. */
  players: { id: string; name: string; role: "hider" | "seeker"; caught: boolean; avatar: Avatar; bigFish: boolean }[];
  /** This hunt's town events (rare happenings around the city), past, present and coming. */
  worldEvents: WorldEvent[];
  /** Players' houses standing in this game's town, in slot order. */
  houses: TownHouse[];
  /** Your friends (they stay friends from one town to the next) and friend requests. */
  friends: FriendLists;
  /** A coin balloon drifting by just for you, if one's due (slot = which one). */
  balloon: { slot: number; coins: number } | null;
  site: { visits: number; players: number };
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
    /** A brand that put coins into this round's prize pool. */
    sponsor: { name: string; logo: string | null; coins: number } | null;
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
    /** A sweep pinned this hider: no moving until then. */
    frozenUntil: string | null;
    /** Bought a shield this round, and whether it has already saved them. */
    shieldBought: boolean;
    shieldSaved: boolean;
    /** Your decoy this round (only you know where it is). */
    decoyUsed: boolean;
    decoyTile: number | null;
    respawned: boolean;
    /** Moves this ghost may make this game (by level). */
    movesAllowed: number;
    /** When this hunter's drone is ready again (longer after it spotted someone). */
    sweepReadyAt: string | null;
    /** Caught early enough (and high enough level) to pay to come back in. */
    canRespawn: boolean;
  } | null;
  mySearches: { tile: number; caught: number }[];
  /** The latest searches by anyone (no results), so everyone sees tiles light up. */
  recentSearches: { tile: number; at: string }[];
  /** Searched tiles everyone can see: only the most recent share (the oldest are forgotten). */
  knownSearched: number[];
  /** Seekers: their own sweeps that are still active as traps. */
  mySweeps: { id: number; tile: number; radius: number; found: boolean; at: string }[];
  /** How many drone traps are active in the city right now (not where they are). */
  activeTraps: number;
  /** Private notices for this player this round (trap alerts, sweeps, being caught). */
  notifications: { id: number; kind: string; body: string; tile: number | null; at: string }[];
  /** For a hider still hidden: what surviving would pay right now. */
  outlook: { stakeBack: number; share: number } | null;
  leftTiles: number[];
  caughtTiles: number[];
  /** Everyone caught this round: where, and who (so you can see their face and message them). */
  caughtFaces: { tile: number; name: string | null; avatar: unknown; user: string | null; level: number | null }[];
  /** Latest public happenings (moves, catches, searches, sweeps) for notices and animations. */
  events: GameEvent[];
  lastResult: { roundId: number; role: string; payout: number; caught: boolean } | null;
  results: RoundResults | null;
  prices: {
    stake: number;
    moveFee: number;
    moveCooldown: number;
    sweepCooldown: number;
    freezeSeconds: number;
    shield: number;
    decoy: number;
    respawn: number;
    bigSearch: number;
    passiveTarget: number;
    passivePerDay: number;
    winShare: number;
    otherShare: number;
  };
  /** Levels at which power-ups unlock. */
  unlocks: { decoy: number; shield: number; bigSearch: number; respawn: number };
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
  mine: { role: string; won: number; detail: string; caught: boolean; badges: { badge: string; detail: string | null }[] } | null;
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

/** Someone watching the city without an account (the home page). */
const GUEST = "00000000-0000-0000-0000-000000000000";

/** When this server last moved the round clock (see loadGame). */
let lastTickAt = 0;

/** Moves the round clock along, but gives up after a few seconds rather than hold the page. */
async function tickSoon(db: ReturnType<typeof createAdminClient>) {
  const ticked = await db.rpc("tick_with_extras").abortSignal(AbortSignal.timeout(5000));
  if (ticked.error && !/abort/i.test(ticked.error.message)) await db.rpc("tick").abortSignal(AbortSignal.timeout(5000));
}

export async function loadGame(userIdOrGuest: string | null): Promise<GameState> {
  const db = createAdminClient();
  const guest = !userIdOrGuest;
  const userId = userIdOrGuest ?? GUEST;
  // The round clock (and the Seed Bot's thinking): a scheduled job moves it every minute.
  // Page loads only nudge it when it's due (a deadline has passed) or when this server hasn't
  // for a while: every screen refreshes every few seconds, and nudging it on every refresh made
  // everyone queue behind each other (pages timing out).
  // Passive income for players running low runs alongside (best effort).
  const { data: head } = await db.from("rounds").select("status, join_ends_at, seek_ends_at").order("id", { ascending: false }).limit(1).maybeSingle();
  const nowMs = Date.now();
  const due =
    !head ||
    head.status === "done" ||
    (head.status === "join" && Date.parse(head.join_ends_at) <= nowMs) ||
    (head.status === "seek" && Date.parse(head.seek_ends_at) <= nowMs);
  const nudge = due || nowMs - lastTickAt > 20_000;
  if (nudge) {
    lastTickAt = nowMs;
    // Pay out finished sports matches, after the page has gone back (never slows it down;
    // not while the app is being built).
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      after(() => settleRecent(nowMs).catch((e) => console.error("settling matches failed", e)));
    }
  }
  const [, passive] = await Promise.all([
    nudge ? tickSoon(db).catch((e) => console.error("tick failed", e)) : null,
    guest ? Promise.resolve({ data: 0 }) : db.rpc("accrue_passive", { p_user: userId }).abortSignal(AbortSignal.timeout(5000)),
  ]);
  const passiveGained = Number(passive.data ?? 0);

  const [{ data: profile, error: profileError }, { data: round }, { data: settings }] = await Promise.all([
    guest
      ? Promise.resolve({
          data: { username: null, pin_set: true, coins: 0, bonus_coins: 0, seeker_rounds: 0, free_search_day: null, avatar: null, level: 1, shield_uses: 0, decoy_uses: 0, search_heat: 0, last_search_at: null },
          error: null,
        })
      : db.from("profiles").select("*").eq("id", userId).single(),
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
  let caughtFaces: GameState["caughtFaces"] = [];
  let worldEvents: GameState["worldEvents"] = [];
  let recentSearches: GameState["recentSearches"] = [];
  let knownSearched: number[] = [];
  let outlook: GameState["outlook"] = null;
  let events: GameEvent[] = [];
  const mySweeps: GameState["mySweeps"] = [];
  let activeTraps = 0;
  let notifications: GameState["notifications"] = [];
  // Everything below only needs the round, so it's fetched all at once (fewer round trips =
  // a faster first paint when you come back to the game).
  const roundPart = async () => {
    if (!round) return;
    const trapsPer = s.traps_per_seeker ?? 5;
    const [{ data: e }, { data: searches }, { data: allEvents }, { data: allSearches }, { data: sweepRows }, { data: notes }, { data: alive }, { data: myDecoy }] = await Promise.all([
      db
        .from("entries")
        .select("*")
        .eq("round_id", round.id)
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("searches").select("tile, caught").eq("round_id", round.id).eq("seeker_id", userId),
      db.from("events").select("id, kind, tile, detail, created_at").eq("round_id", round.id).order("id", { ascending: true }),
      db.from("searches").select("tile, created_at").eq("round_id", round.id).order("created_at", { ascending: true }),
      db.from("sweeps").select("id, seeker_id, tile, radius, found, created_at").eq("round_id", round.id).order("id", { ascending: false }).limit(2000),
      guest
        ? Promise.resolve({ data: [] as { id: number; kind: string; body: string; tile: number | null; created_at: string }[] })
        : db.from("notifications").select("id, kind, body, tile, created_at").eq("user_id", userId).eq("round_id", round.id).order("id", { ascending: false }).limit(40),
      guest
        ? Promise.resolve({ data: [] as { stake_weight: number }[] })
        : db.from("entries").select("stake_weight").eq("round_id", round.id).eq("role", "hider").eq("caught", false).gt("stake_weight", 0),
      guest
        ? Promise.resolve({ data: null })
        : db.from("decoys").select("tile").eq("round_id", round.id).eq("user_id", userId).is("found_at", null).maybeSingle(),
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
        frozenUntil: e.frozen_until,
        shieldBought: Boolean(e.shield_bought),
        shieldSaved: Boolean(e.shield_saved),
        decoyUsed: Boolean(e.decoy_used),
        decoyTile: myDecoy?.tile ?? null,
        respawned: Boolean(e.respawned),
        movesAllowed:
          num(profile.level ?? 1) >= 20 ? (s.ghost_moves_level_20 ?? 3) : num(profile.level ?? 1) >= 10 ? (s.ghost_moves_level_10 ?? 2) : (s.ghost_moves_level_1 ?? 1),
        sweepReadyAt: e.last_sweep_at
          ? new Date(
              Date.parse(e.last_sweep_at) + (e.last_sweep_found ? (s.sweep_found_cooldown_seconds ?? 90) : (s.sweep_cooldown_seconds ?? 10)) * 1000,
            ).toISOString()
          : null,
        canRespawn:
          e.role === "hider" &&
          e.caught &&
          !e.respawned &&
          round.status === "seek" &&
          num(profile.level ?? 1) >= (s.respawn_level ?? 20) &&
          !!e.caught_at &&
          Date.parse(e.caught_at) <= Date.parse(round.join_ends_at) + (s.respawn_window_minutes ?? 30) * 60_000,
      };
    }
    mySearches = searches ?? [];
    const list = allSearches ?? [];
    recentSearches = list.slice(-12).reverse().map((r) => ({ tile: r.tile, at: r.created_at }));
    // Searched spots, oldest first, each once. Hiders see them all (they can't move onto
    // them); seekers only see the most recent 70%.
    const firstSeen = new Map<number, number>();
    list.forEach((r, k) => firstSeen.has(r.tile) || firstSeen.set(r.tile, k));
    const unique = [...firstSeen.keys()];
    const keep = e?.role === "hider" ? unique.length : Math.ceil(unique.length * (s.searched_visible_fraction ?? 0.7));
    knownSearched = unique.slice(unique.length - keep);

    // World events this hunt (and which rewards you already took).
    const [{ data: wev }, { data: myClaims }] = await Promise.all([
      db.from("world_events").select("id, key, tile, starts_at, ends_at, reward_slots, claimed, detail").eq("round_id", round.id).order("starts_at"),
      guest ? Promise.resolve({ data: [] as { event_id: number }[] }) : db.from("world_event_claims").select("event_id").eq("user_id", userId),
    ]);
    const mine = new Set((myClaims ?? []).map((c) => c.event_id));
    worldEvents = (wev ?? []).map((w) => ({
      id: w.id,
      key: w.key,
      tile: w.tile,
      startsAt: w.starts_at,
      endsAt: w.ends_at,
      name: (w.detail as { name?: string } | null)?.name ?? null,
      slotsLeft: Math.max(0, num(w.reward_slots) - num(w.claimed)),
      claimed: mine.has(w.id),
    }));
    // Fog of war: hunters lose sight of recent searches while it lasts.
    const nowMs = Date.now();
    const fog = worldEvents.some((w) => w.key === "fog_of_war" && Date.parse(w.startsAt) <= nowMs && nowMs < Date.parse(w.endsAt));
    if (fog && e?.role !== "hider") {
      recentSearches = [];
      knownSearched = [];
    }
    leftTiles = (allEvents ?? []).filter((x) => x.kind === "moved" && x.tile !== null).map((x) => x.tile);
    caughtTiles = (allEvents ?? []).filter((x) => x.kind === "caught" && x.tile !== null).map((x) => x.tile);
    caughtFaces = (allEvents ?? [])
      .filter((x) => x.kind === "caught" && x.tile !== null)
      .flatMap((x) =>
        ((x.detail?.hiders ?? []) as { name: string | null; avatar: unknown; bot: boolean; user?: string | null; level?: number | null }[])
          .filter((h) => !h.bot)
          .map((h) => ({ tile: x.tile as number, name: h.name, avatar: h.avatar, user: h.user ?? null, level: h.level ?? null })),
      );
    events = (allEvents ?? []).slice(-40).map((x) => ({ id: x.id, kind: x.kind, tile: x.tile ?? -1, at: x.created_at, detail: x.detail }));

    const perSeeker = new Map<string, number>();
    for (const sw of sweepRows ?? []) {
      const n = (perSeeker.get(sw.seeker_id) ?? 0) + 1;
      perSeeker.set(sw.seeker_id, n);
      if (n > trapsPer) continue;
      activeTraps++;
      if (sw.seeker_id === userId) mySweeps.push({ id: sw.id, tile: sw.tile, radius: sw.radius, found: sw.found, at: sw.created_at });
    }
    notifications = (notes ?? []).map((n) => ({ id: n.id, kind: n.kind, body: mintify(n.body), tile: n.tile, at: n.created_at }));
    // Your own sweeps play the drone animation for you (nobody else sees them).
    events = [
      ...events.filter((x) => x.kind !== "sweep"),
      ...mySweeps.map((sw) => ({ id: -sw.id, kind: "sweep" as const, tile: sw.tile, at: sw.at, detail: { radius: sw.radius } })),
    ];

    if (e?.role === "hider" && !e.caught) {
      const total = (alive ?? []).reduce((t, r) => t + num(r.stake_weight), 0);
      const share = total > 0 ? (num(round.pool) * (s.pool_win_share ?? s.pool_hiders) * num(e.stake_weight)) / total : 0;
      outlook = { stakeBack: num(e.stake), share: Math.floor(share * 100) / 100 };
    }
  };

  const lastPart = async () =>
    guest
      ? null
      : (
          await db
            .from("entries")
            .select("round_id, role, payout, caught, rounds!inner(status)")
            .eq("user_id", userId)
            .eq("rounds.status", "done")
            .order("round_id", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data;

  // Everyone in the round, so you can find people to message.
  let players: GameState["players"] = [];
  const playersPart = async () => {
    if (!round) return;
    const { data: rows } = await db
      .from("entries")
      .select("user_id, role, caught, profiles!entries_user_id_fkey(username, avatar, is_bot, coins)")
      .eq("round_id", round.id)
      .limit(500);
    players = (rows ?? [])
      .map((r) => {
        const p = r.profiles as unknown as { username: string | null; avatar: unknown; is_bot: boolean; coins: number } | null;
        if (!p || p.is_bot || !p.username) return null;
        return {
          id: r.user_id,
          name: p.username,
          role: r.role,
          caught: r.caught,
          avatar: cleanAvatar(p.avatar, p.username),
          bigFish: num(p.coins) >= (s.big_fish_coins ?? 10000),
        };
      })
      .filter((x): x is GameState["players"][number] => x !== null);
  };

  // Coin balloons: one can drift by every few minutes, for you alone, up to a daily limit.
  let balloon: GameState["balloon"] = null;
  const slotMs = (s.balloon_minutes ?? 4) * 60_000;
  const slot = Math.floor(Date.now() / slotMs);
  const balloonPart = async () => {
    if (round?.status !== "seek" || guest) return;
    const { data: claims } = await db.from("balloon_claims").select("slot").eq("user_id", userId).eq("day", today);
    const claimed = new Set((claims ?? []).map((c) => c.slot));
    // Not every window has one: about two in three do, picked per player.
    const lucky = parseInt(userId.replace(/-/g, "").slice(0, 6), 16) % 3 !== slot % 3;
    if ((claims?.length ?? 0) < (s.balloons_per_day ?? 10) && !claimed.has(slot) && lucky) {
      balloon = { slot, coins: s.balloon_coins ?? 5 };
    }
  };

  // Friends (best effort: before part 26 is run, there are none).
  const friendsPart = async (): Promise<FriendLists> => {
    if (guest) return NO_FRIENDS;
    const { data, error } = await db.rpc("friends_of", { p_user: userId });
    return error ? NO_FRIENDS : friendLists(data);
  };

  const [, last, results, , , { data: visits }, { count: playerCount }, houses, friends] = await Promise.all([
    roundPart(),
    lastPart(),
    loadResults(db, userId),
    playersPart(),
    balloonPart(),
    db.from("site_counters").select("value").eq("key", "visits").maybeSingle(),
    db.from("profiles").select("id", { count: "estimated", head: true }).eq("is_bot", false),
    round ? loadRoundHouses(db, round.id) : Promise.resolve([] as TownHouse[]),
    friendsPart(),
  ]);
  const site = { visits: Number(visits?.value ?? 0), players: playerCount ?? 0 };
  const tileCount = round?.tile_count ?? 0;
  const frac = tileCount ? Math.min(1, (round?.searched_count ?? 0) / tileCount) : 0;
  const searchPrice = money(s.search_price_start + (s.search_price_max - s.search_price_start) * frac);
  const sweepPrice = (radius: number) =>
    money(((s.sweep_base_price * (2 * radius + 1) * (2 * radius + 1)) / 9) * (1 + s.sweep_price_growth * (round?.sweep_count ?? 0)));

  return {
    serverNow: new Date().toISOString(),
    players,
    balloon,
    site,
    me: {
      id: userId,
      guest,
      passiveGained,
      level: num(profile.level ?? 1),
      bigFish: num(profile.coins) >= (s.big_fish_coins ?? 10000),
      searchReadyAt: profile.last_search_at
        ? new Date(
            Date.parse(profile.last_search_at) +
              Math.min(s.search_cooldown_max ?? 30, (s.search_cooldown_seconds ?? 2) * 2 ** num(profile.search_heat)) * 1000,
          ).toISOString()
        : null,
      name: profile?.username ?? null,
      avatar: cleanAvatar(profile?.avatar, profile?.username ?? userId),
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
          botName: botNameFor(round.id, round.bot_name),
          sponsor: round.sponsor_name
            ? { name: round.sponsor_name, logo: round.sponsor_logo ?? null, coins: num(round.sponsor_coins) }
            : null,
        }
      : null,
    entry,
    mySearches,
    recentSearches,
    knownSearched,
    mySweeps,
    activeTraps,
    notifications,
    outlook,
    leftTiles,
    caughtTiles,
    caughtFaces,
    worldEvents,
    houses,
    friends,
    events,
    results,
    lastResult: last ? { roundId: last.round_id, role: last.role, payout: num(last.payout), caught: last.caught } : null,
    unlocks: { decoy: s.decoy_level ?? 3, shield: s.shield_level ?? 5, bigSearch: s.big_search_level ?? 10, respawn: s.respawn_level ?? 20 },
    prices: {
      stake: s.hider_stake,
      moveFee: money((s.move_fee_start ?? s.second_move_fee) * (1 + (s.move_fee_growth ?? 0) * num(round?.move_count))),
      moveCooldown: s.move_cooldown_seconds ?? 60,
      sweepCooldown: s.sweep_cooldown_seconds ?? 10,
      freezeSeconds: s.sweep_freeze_seconds ?? 60,
      shield: money((s.shield_price ?? 100) * (1 + 0.5 * num(profile.shield_uses))),
      decoy: money((s.decoy_price ?? 20) * (1 + 0.5 * num(profile.decoy_uses))),
      respawn: s.respawn_price ?? 300,
      bigSearch: money(searchPrice * (s.big_search_multiplier ?? 7)),
      passiveTarget: s.passive_target ?? 100,
      passivePerDay: s.passive_per_day ?? 100,
      winShare: s.pool_win_share ?? 0.8,
      otherShare: s.pool_other_share ?? 0.1,
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
  const { data: myBadges } = myEntry
    ? await db.from("badges").select("badge, detail").eq("user_id", userId).eq("round_id", round.id)
    : { data: [] as { badge: string; detail: string | null }[] };
  const myTotal = totals.get(userId);
  return {
    roundId: round.id,
    finishedAt: round.finished_at,
    tileCount: round.tile_count,
    hidersTotal: round.hiders_total,
    caught: round.hiders_total - round.hiders_remaining,
    searches: round.searched_count,
    pool: num(round.pool),
    botName: botNameFor(round.id, round.bot_name),
    botFoundBy: bot?.caught_by ? (nameOf.get(bot.caught_by) ?? "A player") : null,
    winners,
    players: entries?.length ? entries.length - (bot ? 1 : 0) : 0,
    mine: myEntry
      ? { role: myEntry.role, won: money(myTotal?.won ?? 0), detail: myTotal ? describe(myTotal) : "", caught: myEntry.caught, badges: myBadges ?? [] }
      : null,
  };
}
