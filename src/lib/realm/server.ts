import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { arenaSeed, fightOut, type BattleArmy } from "./battle";
import { FIGHTERS, UPGRADE_MAX, type Army, type FighterId } from "./fighters";
import { ARENA_SIZE, BATTLE_SECS, SETTLE_GRACE_MS, WINNER_SHARE, canSettle } from "./schedule";

// The Spirit Realm on the server (docs/REALM.md; the database part is game-db/118_spirit_realm.sql):
// reading a battle's armies, and paying it out once it's been fought.

type Db = ReturnType<typeof createAdminClient>;
type Row = { user_id: string; name: string; seq: number; arena: number; gate: number; fighters: unknown; weapons: number; armour: number; rank: number | null; prize: number | null };

/** An army as kept (already checked when it joined; kept lenient so old battles still replay if prices change). */
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

/** A battle's armies as the phones get them: no player ids, just their place in the queue (seq). */
export const toBattleArmy = (r: Pick<Row, "seq" | "name" | "gate" | "fighters" | "weapons" | "armour">): BattleArmy => ({
  id: String(r.seq),
  name: r.name,
  gate: r.gate,
  army: storedArmy(r.fighters, r.weapons, r.armour),
});

const COLS = "user_id, name, seq, arena, gate, fighters, weapons, armour, rank, prize";

/** Every army in a battle, in join order (a page at a time, so a big battle is read whole). */
async function allArmies(db: Db, at: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("realm_armies").select(COLS).eq("at", at).order("seq").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Work out every arena's battle and pay the winners. Safe to call any number of times: the database pays once. */
export async function settleBattle(at: number) {
  const db = createAdminClient();
  const iso = new Date(at).toISOString();
  const { data: battle } = await db.from("realm_battles").select("seed, status").eq("at", iso).maybeSingle();
  if (!battle || battle.status !== "open") return;
  const rows = await allArmies(db, iso);
  const arenas = new Map<number, Row[]>();
  for (const r of rows) arenas.set(r.arena, [...(arenas.get(r.arena) ?? []), r]);
  const results = [...arenas].map(([arena, list]) => {
    const { ranks } = fightOut({ seed: arenaSeed(Number(battle.seed), arena), armies: list.map(toBattleArmy) });
    const bySeq = new Map(list.map((r) => [String(r.seq), r.user_id]));
    return { arena, ranks: ranks.map((s) => bySeq.get(s)) };
  });
  const { error } = await db.rpc("realm_settle", { p_at: iso, p_results: results, p_share: WINNER_SHARE });
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
  /** Paid out: each army's place and prize (by seq). */
  results: { id: string; rank: number; prize: number }[] | null;
};

/** One arena of a battle that has begun (null: no such battle, or nobody joined it). */
export async function arenaView(at: number, arena: number): Promise<ArenaView | null> {
  const db = createAdminClient();
  const iso = new Date(at).toISOString();
  const { data: battle, error } = await db.from("realm_battles").select("seed, status").eq("at", iso).maybeSingle();
  if (error) throw new Error(error.message);
  if (!battle) return null;
  const [{ data: last }, { data: rows, error: e2 }] = await Promise.all([
    db.from("realm_armies").select("arena").eq("at", iso).order("arena", { ascending: false }).limit(1),
    db.from("realm_armies").select(COLS).eq("at", iso).eq("arena", arena).order("seq").limit(ARENA_SIZE * 2),
  ]);
  if (e2) throw new Error(e2.message);
  const list = (rows ?? []) as Row[];
  const arenas = last?.[0] ? Number(last[0].arena) + 1 : 0;
  if (!arenas) return null;
  return {
    at,
    seed: arenaSeed(Number(battle.seed), arena),
    arena,
    arenas,
    armies: list.map(toBattleArmy),
    results: battle.status === "settled" ? list.map((r) => ({ id: String(r.seq), rank: Number(r.rank ?? 0), prize: Number(r.prize ?? 0) })) : null,
  };
}

/** How many armies are waiting for a battle that hasn't begun. */
export async function waitingCount(at: number) {
  const { count, error } = await createAdminClient().from("realm_armies").select("user_id", { count: "exact", head: true }).eq("at", new Date(at).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}
