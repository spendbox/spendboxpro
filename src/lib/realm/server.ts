import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { arenaSeed, fightOut, type BattleArmy, type Wave } from "./battle";
import { FIGHTERS, UPGRADE_MAX, type Army, type FighterId } from "./fighters";
import { ARENA_SIZE, BATTLE_SECS, MAX_SENDS, PRIZE_SHARES, SETTLE_GRACE_MS, canSettle } from "./schedule";

// The Spirit Realm on the server (docs/REALM.md; the database part is game-db/118_spirit_realm.sql):
// reading an arena's players and the troops they sent, and paying the battle out once it's over.

type ArmyRow = { user_id: string; name: string; seq: number; arena: number; rank: number | null; prize: number | null; points: number | null };
type WaveRow = { user_id: string; n: number; step: number; x: number; y: number; fighters: unknown; weapons: number; armour: number };

/** Troops as kept (already checked when sent; kept lenient so old battles still replay if prices change). */
export function storedArmy(fighters: unknown, weapons: unknown, armour: unknown): Army {
  const given = fighters && typeof fighters === "object" ? (fighters as Record<string, unknown>) : {};
  const out: Partial<Record<FighterId, number>> = {};
  for (const f of FIGHTERS) {
    const n = Math.floor(Number(given[f.id] ?? 0));
    if (Number.isFinite(n) && n > 0) out[f.id] = n;
  }
  const level = (v: unknown) => Math.max(0, Math.min(UPGRADE_MAX, Math.floor(Number(v) || 0)));
  return { fighters: out, weapons: level(weapons), armour: level(armour) };
}

/** An arena's players (in queue order) and their waves, as the battle takes them. No player ids: players are known by their place in the queue. */
function toBattle(armies: ArmyRow[], waves: WaveRow[]): { armies: BattleArmy[]; waves: Wave[] } {
  const list = [...armies].sort((a, b) => a.seq - b.seq);
  const index = new Map(list.map((a, i) => [a.user_id, i]));
  return {
    armies: list.map((a) => ({ id: String(a.seq), name: a.name })),
    waves: waves
      .filter((w) => index.has(w.user_id))
      .map((w) => ({ by: index.get(w.user_id)!, n: w.n, step: w.step, x: Number(w.x), y: Number(w.y), troops: storedArmy(w.fighters, w.weapons, w.armour) })),
  };
}

const ARMY_COLS = "user_id, name, seq, arena, rank, prize, points";
const WAVE_COLS = "user_id, n, step, x, y, fighters, weapons, armour";

/** Every row of a query, a page at a time (so a big battle is read whole). */
async function every<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Work out every arena's battle and pay the winners. Safe to call any number of times: the database pays once. */
export async function settleBattle(at: number) {
  const db = createAdminClient();
  const iso = new Date(at).toISOString();
  const { data: battle } = await db.from("realm_battles").select("seed, status").eq("at", iso).maybeSingle();
  if (!battle || battle.status !== "open") return;
  const [armies, waves] = await Promise.all([
    every<ArmyRow>((f, t) => db.from("realm_armies").select(ARMY_COLS).eq("at", iso).order("seq").range(f, t)),
    every<WaveRow>((f, t) => db.from("realm_waves").select(WAVE_COLS).eq("at", iso).order("user_id").order("n").range(f, t)),
  ]);
  const arenas = new Map<number, ArmyRow[]>();
  for (const a of armies) arenas.set(a.arena, [...(arenas.get(a.arena) ?? []), a]);
  const results = [...arenas].map(([arena, list]) => {
    const ids = new Set(list.map((a) => a.user_id));
    const input = toBattle(list, waves.filter((w) => ids.has(w.user_id)));
    const { ranks, points } = fightOut({ seed: arenaSeed(Number(battle.seed), arena), ...input });
    const bySeq = new Map(list.map((a) => [String(a.seq), a.user_id]));
    return {
      arena,
      ranks: ranks.map((s) => bySeq.get(s)),
      points: Object.fromEntries(Object.entries(points).map(([s, p]) => [bySeq.get(s), p])),
    };
  });
  const { error } = await db.rpc("realm_settle", { p_at: iso, p_results: results, p_shares: [...PRIZE_SHARES] });
  if (error) console.error("Settling the Spirit Realm failed", error.message);
}

const settling = new Set<number>();
/** Pay out any battle that's over but not yet paid (up to a day of them), each at most once at a time on this server. */
export async function settleDue(now = Date.now()) {
  const db = createAdminClient();
  const { data } = await db
    .from("realm_battles")
    .select("at")
    .eq("status", "open")
    .lt("at", new Date(now - BATTLE_SECS * 1000 - SETTLE_GRACE_MS).toISOString())
    .order("at", { ascending: false })
    .limit(30);
  for (const b of (data ?? []) as { at: string }[]) {
    const at = Date.parse(b.at);
    if (!canSettle(at, now) || settling.has(at)) continue;
    settling.add(at);
    try {
      await settleBattle(at);
    } catch (e) {
      console.error("Settling the Spirit Realm failed", e);
    } finally {
      settling.delete(at);
    }
  }
}

export type ArenaView = {
  at: number;
  seed: number;
  arena: number;
  /** How many arenas the battle has. */
  arenas: number;
  armies: BattleArmy[];
  waves: Wave[];
  /** Paid out: each player's place, points and prize (by seq). */
  results: { id: string; rank: number; points: number; prize: number }[] | null;
};

/** One arena of a battle (null: no such battle, or nobody in it). */
export async function arenaView(at: number, arena: number): Promise<ArenaView | null> {
  const db = createAdminClient();
  const iso = new Date(at).toISOString();
  const { data: battle, error } = await db.from("realm_battles").select("seed, status").eq("at", iso).maybeSingle();
  if (error) throw new Error(error.message);
  if (!battle) return null;
  const [{ data: last }, { data: rows, error: e2 }] = await Promise.all([
    db.from("realm_armies").select("arena").eq("at", iso).order("arena", { ascending: false }).limit(1),
    db.from("realm_armies").select(ARMY_COLS).eq("at", iso).eq("arena", arena).order("seq").limit(ARENA_SIZE * 2),
  ]);
  if (e2) throw new Error(e2.message);
  const list = (rows ?? []) as ArmyRow[];
  const arenas = last?.[0] ? Number(last[0].arena) + 1 : 0;
  if (!arenas) return null;
  const ids = list.map((a) => a.user_id);
  const waves = ids.length ? await every<WaveRow>((f, t) => db.from("realm_waves").select(WAVE_COLS).eq("at", iso).in("user_id", ids).order("step").order("n").range(f, t)) : [];
  return {
    at,
    seed: arenaSeed(Number(battle.seed), arena),
    arena,
    arenas,
    ...toBattle(list, waves.slice(0, ARENA_SIZE * 2 * MAX_SENDS)),
    results: battle.status === "settled" ? list.map((r) => ({ id: String(r.seq), rank: Number(r.rank ?? 0), points: Number(r.points ?? 0), prize: Number(r.prize ?? 0) })) : null,
  };
}

/** How many players are in a battle. */
export async function playerCount(at: number) {
  const { count, error } = await createAdminClient().from("realm_armies").select("user_id", { count: "exact", head: true }).eq("at", new Date(at).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}
