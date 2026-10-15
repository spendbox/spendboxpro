"use server";

import { naira } from "@/lib/brand";
import type { Avatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { mintOf } from "@/lib/world/items";
import { BRIBE, PICK_CASH_MAX, PICK_FINE, PICK_ITEM_MAX, prankOf } from "@/lib/world/street";

// The street (docs/STREET.md; the database part is game-db/055_street.sql): picking pockets,
// jail and bribes, pranks at people's doors, rivals, and the gossip column.

const n = (v: unknown) => Number(v ?? 0) || 0;
type Result = { ok: true; text: string } | { ok: false; error: string };

function say(message: string | undefined): { ok: false; error: string } {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    self: "That's you!",
    no_life: "They (or you) haven't started a life yet.",
    no_home: "They don't have a home yet.",
    blocked: "You can't do that to them.",
    too_new: "They're new in town. Give them a few days.",
    too_many: "That's enough for today. Lie low until tomorrow.",
    too_many_here: "You've already tried them today. Leave them be until tomorrow.",
    in_jail: "You're in jail. Nothing doing from a cell.",
    not_in_jail: "You're not in jail.",
    not_enough: `You don't have enough for that (${naira(arg)}).`,
    frozen: "Your account is paused right now.",
    bad_kind: "That isn't a prank.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Street action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

async function pricesOf(userId: string) {
  const { data } = await createAdminClient().from("lives").select("region").eq("user_id", userId).maybeSingle();
  return data ? (regionMap(data.region as string)?.region.prices ?? null) : null;
}

/** Pick someone's pocket: a little of their cash or a small thing, or caught (a fine, reputation, maybe jail). */
export async function stealFrom(victim: string): Promise<Result & { caught?: boolean; jailed?: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const prices = await pricesOf(userId);
  if (!prices) return say("no_life");
  const { data, error } = await createAdminClient().rpc("street_steal", {
    p_thief: userId,
    p_victim: String(victim),
    p_cash_max: mintOf(PICK_CASH_MAX, prices),
    p_item_max: mintOf(PICK_ITEM_MAX, prices),
    p_fine: mintOf(PICK_FINE, prices),
  });
  if (error) return say(error.message);
  const d = data as Record<string, unknown>;
  await pushTo(String(victim));
  if (d.caught) return { ok: true, caught: true, jailed: !!d.jailed, text: `Caught! They saw you. Fined ${naira(n(d.fine))}, and your reputation took a hit.${d.jailed ? " The police took you in: 2 hours in jail." : ""}` };
  if (d.what === "cash") return { ok: true, text: `You got away with ${naira(n(d.amount))}. Nobody saw a thing... this time.` };
  if (d.what === "item") return { ok: true, text: `You got away with their ${String(d.item)}. It's in your things.` };
  return { ok: true, text: "Empty pockets. Nothing worth taking." };
}

/** Try to bribe your way out of jail. */
export async function bribeOut(): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const prices = await pricesOf(userId);
  if (!prices) return say("no_life");
  const { data, error } = await createAdminClient().rpc("jail_bribe", { p_user: userId, p_cost: mintOf(BRIBE, prices) });
  if (error) return say(error.message);
  return data ? { ok: true, text: "The officer looked the other way. You're out." } : { ok: false, error: "The officer took the money and kept you in. Wait it out." };
}

/** Prank someone's door (they see it was you). */
export async function prankDoor(to: string, prank: string, note?: string): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const p = prankOf(prank);
  const prices = await pricesOf(userId);
  if (!p) return say("bad_kind");
  if (!prices) return say("no_life");
  const words = String(note ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  const db = createAdminClient();
  const { data, error } = await db.rpc("street_prank", { p_from: userId, p_to: String(to), p_prank: p.id, p_cost: mintOf(p.price, prices) });
  if (error) return say(error.message);
  // The note left with it (they read it when they come home to the prank).
  if (words && data) await db.from("doorstep").update({ body: words }).eq("id", Number(data)).eq("from_user", userId);
  await pushTo(String(to));
  return { ok: true, text: `${p.emoji} Done. They'll know it was you.` };
}

/** Clean a prank off your door. */
export async function cleanPrank(id: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { error } = await createAdminClient().rpc("prank_clean", { p_user: userId, p_id: Math.round(n(id)) });
  return error ? say(error.message) : { ok: true, text: "All cleaned up." };
}

/** Name someone your rival (or stop). */
export async function setRival(other: string, on: boolean): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data, error } = await createAdminClient().rpc("rival_set", { p_user: userId, p_other: String(other), p_on: !!on });
  if (error) return say(error.message);
  if (on) await pushTo(String(other));
  return { ok: true, text: !on ? "Not rivals any more." : data ? "It's official: rivals, both ways. Game on." : "Rival named. They've been told." };
}

/** A rival: you named them, they named you, or both (a proper rivalry), and the score this month. */
export type Rival = { id: string; name: string; avatar: Avatar | null; named: boolean; namedMe: boolean; mine: number; theirs: number };
export async function myRivals(): Promise<Rival[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data } = await createAdminClient().rpc("rivals_of", { p_user: userId });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name), avatar: (r.avatar ?? null) as Avatar | null, named: !!r.named, namedMe: !!r.namedMe, mine: n(r.mine), theirs: n(r.theirs) }));
}

export type Gossip = { id: number; kind: string; body: string; people: string[]; at: string };
/** The gossip column for a city. */
export async function gossip(region: string): Promise<Gossip[]> {
  if (!regionMap(region)) return [];
  const userId = await currentUserId();
  const { data } = await createAdminClient().rpc("gossip_list", { p_viewer: userId ?? null, p_region: region });
  return ((data ?? []) as Record<string, unknown>[]).map((g) => ({ id: n(g.id), kind: String(g.kind), body: String(g.body), people: (g.people ?? []) as string[], at: String(g.at) }));
}
