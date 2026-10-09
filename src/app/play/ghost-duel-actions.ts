"use server";

import { cleanAvatar, type Avatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { cleanBoard, cleanDuel, type DuelBoard, type DuelView, type RpsMove } from "@/lib/ghost-duels";
import { createAdminClient } from "@/lib/supabase/admin";

// Ghost duels: challenge a ghost, answer a challenge, throw, give up, and the live views the
// screens poll. The database (game-db/029_ghost_duels.sql) checks every rule.

type Fail = { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function say(message: string | undefined, fallback: string) {
  const [code, n] = (message ?? "").split(":");
  const map: Record<string, string> = {
    no_hunt: "Duels start when the hunt does.",
    self: "That's you!",
    unknown_player: "Please sign in again.",
    no_name: "Pick a player name first.",
    frozen: "Your account is paused right now.",
    you_are_ghost: "You're a ghost this game. Ghosts don't challenge each other: wait for hunters to come to you.",
    not_ghost: "That player isn't a ghost.",
    ghost_out: "That ghost is out of this game.",
    ghost_golden: "That ghost is golden: safe for the rest of this game.",
    busy: "That ghost is in a duel right now. Try again in a moment.",
    you_busy: "Finish your duel first.",
    cooldown: `Catch your breath: you can challenge again in ${n ?? "a few"} seconds.`,
    not_enough: `A challenge costs ${n ?? 10} mint, and you don't have enough.`,
    no_duel: "That duel isn't there any more.",
    not_yours: "That isn't your duel.",
    bad_move: "Pick rock, paper or scissors.",
    not_playing: "The duel hasn't started yet.",
  };
  if (map[code]) return map[code];
  console.error("Ghost duel action failed", message);
  return fallback;
}

async function call(fn: string, args: Record<string, unknown>, fallback: string): Promise<{ ok: true; data: unknown } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to duel." };
  const { data, error } = await createAdminClient().rpc(fn, { ...args, ...(fn === "duel_challenge" ? { p_hunter: userId } : fn === "duel_answer" ? { p_ghost: userId } : { p_user: userId }) });
  if (error) return { ok: false, error: say(error.message, fallback) };
  return { ok: true, data };
}

async function duelResult(fn: string, args: Record<string, unknown>, fallback: string): Promise<{ ok: true; duel: DuelView } | Fail> {
  const res = await call(fn, args, fallback);
  if (!res.ok) return res;
  const duel = cleanDuel(res.data);
  return duel ? { ok: true, duel } : { ok: false, error: fallback };
}

const okId = (id: unknown) => Number.isInteger(id) && (id as number) > 0;

/** Challenge a ghost (costs the fee; back if you win). */
export async function challengeGhost(ghostId: string) {
  if (typeof ghostId !== "string" || !UUID_RE.test(ghostId)) return { ok: false, error: "Pick a ghost." } as Fail;
  return duelResult("duel_challenge", { p_ghost: ghostId }, "Couldn't send the challenge. Try again.");
}

/** A ghost answers a challenge: the duel starts. */
export async function answerDuel(duelId: number) {
  if (!okId(duelId)) return { ok: false, error: "That duel isn't there any more." } as Fail;
  return duelResult("duel_answer", { p_duel: duelId }, "Couldn't start the duel. Try again.");
}

/** Throw rock, paper or scissors. */
export async function throwMove(duelId: number, move: RpsMove) {
  if (!okId(duelId)) return { ok: false, error: "That duel isn't there any more." } as Fail;
  if (!["rock", "paper", "scissors"].includes(move)) return { ok: false, error: "Pick rock, paper or scissors." } as Fail;
  return duelResult("duel_move", { p_duel: duelId, p_move: move }, "Couldn't throw. Try again.");
}

/** Give up (or, for a hunter whose challenge hasn't been answered, call it off). */
export async function giveUpDuel(duelId: number) {
  if (!okId(duelId)) return { ok: false, error: "That duel isn't there any more." } as Fail;
  return duelResult("duel_give_up", { p_duel: duelId }, "Couldn't do that. Try again.");
}

/** One duel now (the duel screen asks every second or so). */
export async function duelNow(duelId: number) {
  if (!okId(duelId)) return { ok: false, error: "That duel isn't there any more." } as Fail;
  return duelResult("duel_state", { p_duel: duelId }, "Couldn't load the duel.");
}

/** The ghosts on the map, your part in the game and your live duel. */
export async function duelBoardNow(): Promise<{ ok: true; board: DuelBoard } | Fail> {
  const res = await call("duel_board", {}, "Couldn't load the ghosts.");
  if (!res.ok) return res;
  const board = cleanBoard(res.data);
  return board ? { ok: true, board } : { ok: false, error: "Couldn't load the ghosts." };
}

export type GhostCard = {
  id: string;
  name: string;
  avatar: Avatar;
  level: number;
  status: "free" | "playing" | "golden" | "out";
  wins: number;
  losses: number;
  record: { ghostWins: number; ghostLosses: number; hunterWins: number; goldenGames: number; ghostGames: number };
  can: boolean;
  why: string | null;
  cooldownUntil: string | null;
  fee: number;
};

/** A ghost's card: their stats and whether you can challenge them right now. */
export async function ghostCard(ghostId: string): Promise<{ ok: true; card: GhostCard } | Fail> {
  if (typeof ghostId !== "string" || !UUID_RE.test(ghostId)) return { ok: false, error: "Pick a ghost." };
  const res = await call("ghost_card", { p_ghost: ghostId }, "Couldn't load that ghost.");
  if (!res.ok) return res;
  const c = (res.data ?? {}) as Record<string, unknown>;
  const r = (c.record ?? {}) as Record<string, unknown>;
  const name = String(c.name ?? "Ghost");
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    ok: true,
    card: {
      id: String(c.id),
      name,
      avatar: cleanAvatar(c.avatar, name),
      level: n(c.level) || 1,
      status: ["free", "playing", "golden", "out"].includes(String(c.status)) ? (String(c.status) as GhostCard["status"]) : "out",
      wins: n(c.wins),
      losses: n(c.losses),
      record: { ghostWins: n(r.ghost_wins), ghostLosses: n(r.ghost_losses), hunterWins: n(r.hunter_wins), goldenGames: n(r.golden_games), ghostGames: n(r.ghost_games) },
      can: Boolean(c.can),
      why: c.why ? String(c.why) : null,
      cooldownUntil: c.cooldown_until ? String(c.cooldown_until) : null,
      fee: n(c.fee) || 10,
    },
  };
}
