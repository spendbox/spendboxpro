// Ghost duels (game-db/029_ghost_duels.sql): ghosts light up on the map, hunters challenge them
// to a quick game (Rock-Paper-Scissors for now). Three wins make a ghost golden (safe and in the
// prize pool), three losses put them out. These are the shapes the app works with, and the
// tidy-ups for what the database sends.

import { cleanAvatar, type Avatar } from "@/lib/avatar";

export type RpsMove = "rock" | "paper" | "scissors";
export const RPS_MOVES: RpsMove[] = ["rock", "paper", "scissors"];

/** One duel, as one of its two players sees it. */
export type DuelView = {
  id: number;
  game: "rps";
  status: "asked" | "playing" | "done" | "void";
  role: "ghost" | "hunter";
  opponent: { id: string; name: string; avatar: Avatar; level: number };
  me: number;
  them: number;
  firstTo: number;
  /** Each point thrown. A move is null when that player didn't throw in time (the point went to the other). */
  throws: { me: RpsMove | null; them: RpsMove | null; w: "me" | "them" | "tie" }[];
  myMove: RpsMove | null;
  theyMoved: boolean;
  answerBy: string;
  endsAt: string | null;
  /** Once one player has thrown: when the other must have thrown by, or lose the point. */
  moveBy: string | null;
  /** How long that is (seconds). */
  throwSeconds: number;
  /** The server's clock when this was read (for countdowns). */
  now: string;
  winner: "me" | "them" | null;
  reason: string | null;
  fee: number;
  reward: number;
  portion: number;
};

export type BoardGhost = { id: string; name: string; avatar: Avatar; level: number; tile: number; status: "free" | "playing" | "golden"; wins: number; losses: number };

export type DuelRules = {
  fee: number;
  answerSeconds: number;
  duelSeconds: number;
  firstTo: number;
  cooldown: number;
  goldenWins: number;
  outLosses: number;
  poolWins: number;
  stake: number;
};

/** The game as the duels see it (what the map and the bottom bar show). */
export type DuelBoard = {
  phase: "join" | "seek" | "none";
  rules: DuelRules;
  ghosts: BoardGhost[];
  me: { role: "ghost" | "hunter"; wins: number; losses: number; golden: boolean; out: boolean; stake: number; cooldownUntil: string | null; inPool: boolean };
  duel: DuelView | null;
};

export const DEFAULT_RULES: DuelRules = { fee: 10, answerSeconds: 30, duelSeconds: 60, firstTo: 2, cooldown: 30, goldenWins: 3, outLosses: 3, poolWins: 20, stake: 100 };

const num = (v: unknown, d = 0) => (v == null || Number.isNaN(Number(v)) ? d : Number(v));
const isMove = (v: unknown): v is RpsMove => v === "rock" || v === "paper" || v === "scissors";

/** duel_view() from the database, checked and tidied (null if it isn't one). */
export function cleanDuel(raw: unknown): DuelView | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const o = (d.opponent ?? {}) as Record<string, unknown>;
  if (!d.id || typeof o.id !== "string") return null;
  const status = ["asked", "playing", "done", "void"].includes(String(d.status)) ? (String(d.status) as DuelView["status"]) : "done";
  const name = String(o.name ?? "Player");
  return {
    id: num(d.id),
    game: "rps",
    status,
    role: d.role === "ghost" ? "ghost" : "hunter",
    opponent: { id: o.id, name, avatar: cleanAvatar(o.avatar, name), level: num(o.level, 1) },
    me: num(d.me),
    them: num(d.them),
    firstTo: num(d.first_to, 2),
    throws: (Array.isArray(d.throws) ? d.throws : []).flatMap((t: Record<string, unknown>) => {
      const me = isMove(t.me) ? t.me : null;
      const them = isMove(t.them) ? t.them : null;
      // A missed throw has one move; a point with no moves at all isn't one.
      return me || them ? [{ me, them, w: t.w === "me" || t.w === "them" ? t.w : ("tie" as const) }] : [];
    }),
    myMove: isMove(d.my_move) ? d.my_move : null,
    theyMoved: Boolean(d.they_moved),
    answerBy: String(d.answer_by ?? ""),
    endsAt: d.ends_at ? String(d.ends_at) : null,
    moveBy: d.move_by ? String(d.move_by) : null,
    throwSeconds: num(d.throw_seconds, 20),
    now: String(d.now ?? new Date().toISOString()),
    winner: d.winner === "me" || d.winner === "them" ? d.winner : null,
    reason: d.reason ? String(d.reason) : null,
    fee: num(d.fee),
    reward: num(d.reward),
    portion: num(d.portion),
  };
}

/** duel_board() from the database, checked and tidied. */
export function cleanBoard(raw: unknown): DuelBoard | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const r = (b.rules ?? {}) as Record<string, unknown>;
  const m = (b.me ?? {}) as Record<string, unknown>;
  const phase = b.phase === "join" || b.phase === "seek" ? b.phase : "none";
  return {
    phase,
    rules: {
      fee: num(r.fee, DEFAULT_RULES.fee),
      answerSeconds: num(r.answer_seconds, DEFAULT_RULES.answerSeconds),
      duelSeconds: num(r.duel_seconds, DEFAULT_RULES.duelSeconds),
      firstTo: num(r.first_to, DEFAULT_RULES.firstTo),
      cooldown: num(r.cooldown, DEFAULT_RULES.cooldown),
      goldenWins: num(r.golden_wins, DEFAULT_RULES.goldenWins),
      outLosses: num(r.out_losses, DEFAULT_RULES.outLosses),
      poolWins: num(r.pool_wins, DEFAULT_RULES.poolWins),
      stake: num(r.stake, DEFAULT_RULES.stake),
    },
    ghosts: (Array.isArray(b.ghosts) ? b.ghosts : []).flatMap((g: Record<string, unknown>) => {
      if (typeof g.id !== "string" || g.tile == null) return [];
      const name = String(g.name ?? "Ghost");
      const status = g.status === "playing" || g.status === "golden" ? g.status : ("free" as const);
      return [{ id: g.id, name, avatar: cleanAvatar(g.avatar, name), level: num(g.level, 1), tile: num(g.tile), status, wins: num(g.wins), losses: num(g.losses) }];
    }),
    me: {
      role: m.role === "ghost" ? "ghost" : "hunter",
      wins: num(m.wins),
      losses: num(m.losses),
      golden: Boolean(m.golden),
      out: Boolean(m.out),
      stake: num(m.stake),
      cooldownUntil: m.cooldown_until ? String(m.cooldown_until) : null,
      inPool: Boolean(m.in_pool),
    },
    duel: cleanDuel(b.duel),
  };
}
