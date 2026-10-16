"use server";

import { currentUserId } from "@/lib/game";
import { secretBytes } from "@/lib/game-seal";
import { IMP_ROUNDS, impostorSecrets } from "@/lib/party/impostor";
import { createAdminClient } from "@/lib/supabase/admin";

// Impostor's secrets (docs/PARTY_GAMES.md): who the impostor is each round and the word. They come
// from the server's secret, never from the game's seed, so no phone can work them out. Each player
// is told only their own part (the word, or that they're the impostor); everyone gets the answer at
// the reveal.

type Fail = { ok: false; error: string };

/** The game, its players (in the order the table seats them) and its secrets. */
async function load(id: number) {
  const cid = Math.round(Number(id) || 0);
  const db = createAdminClient();
  const { data: c } = await db.from("challenges").select("id, game, seed, status").eq("id", cid).maybeSingle();
  if (!c || c.game !== "impostor" || (c.status !== "playing" && c.status !== "done")) return null;
  // The same order as the table's (challenge-actions views: by when they joined).
  const { data: ps } = await db.from("challenge_players").select("user_id").eq("challenge_id", cid).order("joined_at", { ascending: true });
  const players = ((ps ?? []) as { user_id: string }[]).map((p) => String(p.user_id));
  const secrets = impostorSecrets(secretBytes(`impostor:${cid}:${c.seed}`), players.length, IMP_ROUNDS);
  return { players, secrets };
}

/** Your part of each round: the word (its place on the board), or null when you're the impostor. */
export async function impostorDeal(id: number): Promise<{ ok: true; words: (number | null)[] } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const g = await load(id);
  if (!g) return { ok: false, error: "That game isn't being played." };
  const seat = g.players.indexOf(userId);
  if (seat < 0) return { ok: false, error: "You're not playing this one." };
  return { ok: true, words: g.secrets.map((r) => (r.imp === seat ? null : r.word)) };
}

/** The reveal for a round, once the table has voted: who the impostor was, and the word. */
export async function impostorReveal(id: number, round: number): Promise<{ ok: true; imp: number; word: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const g = await load(id);
  const r = g?.secrets[Math.round(Number(round) || 0)];
  if (!g || !r) return { ok: false, error: "That game isn't being played." };
  return { ok: true, imp: r.imp, word: r.word };
}
