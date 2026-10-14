"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { landmarkPriceMint } from "@/lib/world/landmark-price";
import { discounted } from "@/lib/world/rep-levels";
import { myThings } from "./item-actions";

// Buying a landmark (docs/LANDMARKS.md; the database part is game-db/082_landmarks.sql). The
// price is always worked out here, from the map, never taken from the phone.

export type LandmarkInfo = {
  /** "<region>:<landmark id>": what the database calls it. */
  id: string;
  name: string;
  /** Its full price (mint), before your reputation discount. */
  price: number;
  /** Who owns it (null: nobody yet, it's for sale). */
  owner: string | null;
  mine: boolean;
  /** What the owner paid (mint), when someone owns it. */
  paid: number | null;
};
export type LandmarkResult = { ok: true; coins?: number } | { ok: false; error: string };

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): LandmarkResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    not_enough: `You need ₥${arg} for that. Keep stacking!`,
    taken: "Someone has just bought that one.",
    no_life: "Start your life first.",
    bad_price: "That landmark isn't for sale right now.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Landmark action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

/**
 * The landmark a place id stands for: a landmark's corner tile as the map cards use it
 * ("lagos:12,-40"), or its own id ("lagos:national-stadium"). Null when it isn't a landmark.
 */
function landmarkFor(placeId: string) {
  const m = /^([a-z0-9-]+):(?:(-?\d+),(-?\d+)|([a-z0-9-]+))$/.exec(placeId ?? "");
  if (!m) return null;
  const map = regionMap(m[1]);
  if (!map) return null;
  const all = [
    ...map.landmarks.map((l) => ({ id: l.id, name: l.name, type: l.type as string, w: l.w, d: l.d, x: l.ax, z: l.az })),
    ...map.spotList.map((s) => ({ id: s.id, name: s.name, type: s.kind as string, w: 1, d: 1, x: s.x, z: s.z })),
  ];
  const l = m[4] ? all.find((a) => a.id === m[4]) : all.find((a) => a.x === Number(m[2]) && a.z === Number(m[3]));
  if (!l) return null;
  return { region: m[1], id: `${m[1]}:${l.id}`, name: l.name, price: landmarkPriceMint(l, map.region.prices.perMint) };
}

/** A landmark's price and who owns it (null if the place isn't a landmark). */
export async function landmarkOwner(landmarkId: string): Promise<LandmarkInfo | null> {
  const l = landmarkFor(landmarkId);
  if (!l) return null;
  const userId = await currentUserId();
  const { data } = await createAdminClient().from("landmark_owners").select("owner_id, price, profiles(username)").eq("landmark_id", l.id).maybeSingle();
  const ownerId = (data?.owner_id as string | null) ?? null;
  const prof = data?.profiles as { username?: string | null } | { username?: string | null }[] | null | undefined;
  const username = (Array.isArray(prof) ? prof[0]?.username : prof?.username) || "Someone";
  return {
    id: l.id,
    name: l.name,
    price: l.price,
    owner: ownerId ? username : null,
    mine: !!ownerId && ownerId === userId,
    paid: ownerId ? n(data?.price) : null,
  };
}

/** Buy a landmark nobody owns, at its price less your reputation discount. */
export async function buyLandmark(landmarkId: string): Promise<LandmarkResult> {
  const l = landmarkFor(landmarkId);
  if (!l) return { ok: false, error: "That isn't a landmark." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to buy a landmark." };
  // Your reputation level takes something off (src/lib/world/rep-levels.ts).
  const things = await myThings().catch(() => null);
  const price = discounted(l.price, things?.reputation.score ?? 0);
  const { data, error } = await createAdminClient().rpc("landmark_buy", { p_user: userId, p_region: l.region, p_landmark: l.id, p_name: l.name, p_price: price });
  if (error) return say(error.message);
  return { ok: true, coins: n((data as Record<string, unknown> | null)?.coins) };
}
