"use server";

import { currentUserId } from "@/lib/game";
import { cleanCounters, isStyle, STYLE_KEYS, type Counters, type LifetimeStyle, type StyleKey, type StyleScores } from "@/lib/play-style";
import { createAdminClient } from "@/lib/supabase/admin";

// Play styles on the server (game-db/024_play_style.sql): save a game's diary once (the server
// adds what it knows for sure and picks the style), read your mix over time, and check in while
// a game is on. Nothing here moves mint, and nothing throws: failures come back in plain words.

type Fail = { ok: false; error: string };

function lifetimeOf(raw: unknown): LifetimeStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const shares = Object.fromEntries(STYLE_KEYS.map((k) => [k, Math.max(0, num(obj(r.shares)[k]))])) as Record<StyleKey, number>;
  const tops = Object.fromEntries(STYLE_KEYS.map((k) => [k, Math.max(0, Math.floor(num(obj(r.tops)[k])))])) as Record<StyleKey, number>;
  const recent = (Array.isArray(r.recent) ? r.recent : [])
    .map((x) => obj(x))
    .filter((x) => isStyle(x.style))
    .map((x) => ({ round: num(x.round), style: x.style as StyleKey, at: String(x.at ?? "") }));
  return { games: Math.max(0, Math.floor(num(r.games))), shares, tops, recent };
}

function scoresOf(raw: unknown): Partial<StyleScores> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<StyleScores> = {};
  for (const k of STYLE_KEYS) {
    const n = Number(r[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

const FRIENDLY: Record<string, string> = {
  unknown_player: "Sign in to keep track of your play style.",
  unknown_round: "That game wasn't found.",
  not_finished: "That game isn't over yet.",
  too_late: "That game was too long ago.",
  not_in_game: "You weren't in that game.",
};

/**
 * Save what you did in a game (your phone's diary) and get your play style for it, plus your mix
 * over all your games. Saving again for the same game just returns what was saved.
 */
export async function savePlayDiary(
  roundId: number,
  diary: Counters,
): Promise<{ ok: true; style: StyleKey; scores: Partial<StyleScores>; counters: Counters; lifetime: LifetimeStyle } | Fail> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: FRIENDLY.unknown_player };
    if (!Number.isSafeInteger(roundId) || roundId <= 0) return { ok: false, error: FRIENDLY.unknown_round };
    const db = createAdminClient();
    const { data, error } = await db.rpc("save_play_diary", { p_user: userId, p_round: roundId, p_counters: cleanCounters(diary) });
    if (error) {
      const code = Object.keys(FRIENDLY).find((k) => error.message.startsWith(k));
      if (!code) console.error("Saving the play diary failed", error.message);
      return { ok: false, error: code ? FRIENDLY[code] : "Couldn't work out your play style. Try again." };
    }
    const d = (data ?? {}) as { style?: unknown; scores?: unknown; counters?: unknown };
    const { data: life } = await db.rpc("my_play_style", { p_user: userId });
    return {
      ok: true,
      style: isStyle(d.style) ? d.style : "explorer",
      scores: scoresOf(d.scores),
      counters: cleanCounters(d.counters),
      lifetime: lifetimeOf(life),
    };
  } catch (e) {
    console.error("savePlayDiary failed", e);
    return { ok: false, error: "Couldn't work out your play style. Try again." };
  }
}

/** Your play style mix over all your games. */
export async function getMyPlayStyle(): Promise<{ ok: true; lifetime: LifetimeStyle } | Fail> {
  try {
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: FRIENDLY.unknown_player };
    const { data, error } = await createAdminClient().rpc("my_play_style", { p_user: userId });
    if (error) {
      console.error("Loading the play style failed", error.message);
      return { ok: false, error: "Couldn't load your play style. Try again." };
    }
    return { ok: true, lifetime: lifetimeOf(data) };
  } catch (e) {
    console.error("getMyPlayStyle failed", e);
    return { ok: false, error: "Couldn't load your play style. Try again." };
  }
}

/** "I'm in town": once while a game is on, so a diary of just walking around still counts. */
export async function checkInToGame(): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const { error } = await createAdminClient().rpc("play_check_in", { p_user: userId });
    if (error && !error.message.startsWith("unknown_player")) console.error("Checking in failed", error.message);
  } catch (e) {
    console.error("checkInToGame failed", e);
  }
}
