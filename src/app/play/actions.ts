"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

// Every game action runs inside the database (see game-db/), which checks all the rules.
async function run(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc(fn, { p_user: userId, ...args });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}

const isTile = (t: unknown): t is number => Number.isInteger(t) && (t as number) >= 0;

export async function joinRound(role: "hider" | "seeker") {
  if (role !== "hider" && role !== "seeker") return { ok: false, error: "Pick hider or seeker." } as ActionResult;
  return run("join_round", { p_role: role });
}

export async function searchTile(tile: number) {
  if (!isTile(tile)) return { ok: false, error: "Pick a tile." } as ActionResult;
  return run("search_tile", { p_tile: tile });
}

export async function moveTo(tile: number) {
  if (!isTile(tile)) return { ok: false, error: "Pick a tile." } as ActionResult;
  return run("move_hider", { p_tile: tile });
}

export async function sweepAround(tile: number, radius: number) {
  if (!isTile(tile) || ![1, 2, 3].includes(radius)) return { ok: false, error: "Pick a tile." } as ActionResult;
  return run("sweep", { p_tile: tile, p_radius: radius });
}
