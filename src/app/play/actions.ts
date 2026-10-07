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

/** "Advertise here": someone tapped a billboard and left their details. */
export async function requestAd(input: { billboard: string; name: string; contact: string; message: string }) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." } as ActionResult;
  const name = input.name.trim().slice(0, 80);
  const contact = input.contact.trim().slice(0, 120);
  const message = input.message.trim().slice(0, 1000);
  if (name.length < 2 || contact.length < 5) return { ok: false, error: "Add your name and an email or phone number." } as ActionResult;
  const db = createAdminClient();
  const { count } = await db
    .from("ad_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 5) return { ok: false, error: "Thanks! We already have your requests." } as ActionResult;
  const { data: round } = await db.from("rounds").select("id").order("id", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db
    .from("ad_requests")
    .insert({ round_id: round?.id ?? null, billboard: input.billboard.slice(0, 40), user_id: userId, name, contact, message: message || null });
  if (error) return { ok: false, error: "Couldn't send that. Try again." } as ActionResult;
  return { ok: true, data: {} } as ActionResult;
}
