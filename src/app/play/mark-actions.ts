"use server";

import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { mintOf } from "@/lib/world/items";
import { makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { ADOPT_SHARE, cleanMarkText, dayCost, graffiti, INKS, MARK_MIN_REP, markKind, marksAllowed, markSpot, personalInfo, REACTIONS, website, type GraffitiStyle, type MarkKind, type Reaction, type SpotLook } from "@/lib/world/marks";
import { myThings } from "./item-actions";

// Marks on the map (docs/MARKS.md; the database part is game-db/052_marks.sql): writing, reviews,
// trees, benches, statues, fountains, plaques and time capsules, with reactions and votes to take
// them down. Costs and checks are worked out here, never taken from the phone.

const n = (v: unknown) => Number(v ?? 0) || 0;
type Result = { ok: true; text?: string } | { ok: false; error: string };

function say(message: string | undefined): { ok: false; error: string } {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    no_life: "Start your life first.",
    too_many: "That's all the marks for today. Come back tomorrow.",
    empty: "Write something first.",
    not_enough: `You don't have enough for that (${arg} mint).`,
    not_yours: "That isn't yours.",
    gone: "That's no longer there.",
    own: "That's yours: take it down yourself if you like.",
    not_yet: "It isn't time to open it yet.",
    frozen: "Your account is paused right now.",
    bad_kind: "That can't go on the map.",
    bad_item: "That can't go on the map.",
    low_rep: `You need ${MARK_MIN_REP} reputation to leave anything on the map${arg ? ` (you have ${arg})` : ""}. Tap your ★ to see how to raise it.`,
    mark_limit: `You have ${arg} mark${arg === "1" ? "" : "s"} up, the most your reputation allows. Take one down in My marks, or earn 50 more reputation for another.`,
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Mark action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

/** Each region's plan (what stands on each tile), worked out once per server. */
const plans = new Map<string, CityPlan>();
function lookFor(region: string): ((x: number, z: number) => SpotLook | null) | null {
  const map = regionMap(region);
  if (!map) return null;
  let plan = plans.get(region);
  if (!plan) {
    plan = makePlan(map.region.seed, map);
    plans.set(region, plan);
  }
  const p = plan;
  return (x, z) =>
    map.inside(x, z)
      ? {
          water: map.waterAt(x, z) > 0,
          road: !!map.roadAt(x, z) || map.flyoverAt(x, z),
          kept: !!map.clearAt(x, z),
          landmark: map.landmarks.some((l) => x >= l.ax && x < l.ax + l.w && z >= l.az && z < l.az + l.d),
          tile: tileAt(p, spiralIndex(x, z)).kind,
        }
      : null;
}

/** How many of your marks are up now (not taken down, not run out, not an opened capsule). */
async function marksUp(userId: string) {
  const { data } = await createAdminClient()
    .from("marks")
    .select("kind, expires_at, taken_by")
    .eq("author", userId)
    .is("removed_at", null)
    .limit(500);
  const now = Date.now();
  return ((data ?? []) as { kind: string; expires_at: string | null; taken_by: string | null }[]).filter((m) => (!m.expires_at || Date.parse(m.expires_at) > now) && !(m.kind === "capsule" && m.taken_by)).length;
}

export type MyMark = { id: number; kind: MarkKind; body: string | null; place: string | null; x: number; z: number; at: string; expiresAt: string | null; up: boolean; removed: boolean };
/** Your marks (newest first), whether each is up, and how many you can have up with your reputation. */
export async function myMarks(): Promise<{ marks: MyMark[]; up: number; allowed: number; reputation: number } | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const [{ data }, things] = await Promise.all([
    createAdminClient().from("marks").select("id, kind, body, place, x, z, created_at, expires_at, removed_at, taken_by").eq("author", userId).order("created_at", { ascending: false }).limit(60),
    myThings(),
  ]);
  const now = Date.now();
  const marks = ((data ?? []) as Record<string, unknown>[]).map((m) => {
    const removed = m.removed_at != null;
    const expired = m.expires_at != null && Date.parse(String(m.expires_at)) <= now;
    const opened = m.kind === "capsule" && m.taken_by != null;
    return {
      id: n(m.id),
      kind: m.kind as MarkKind,
      body: m.body == null ? null : String(m.body),
      place: m.place == null ? null : String(m.place),
      x: n(m.x),
      z: n(m.z),
      at: String(m.created_at),
      expiresAt: m.expires_at == null ? null : String(m.expires_at),
      up: !removed && !expired && !opened,
      removed,
    };
  });
  const reputation = things?.reputation.score ?? 0;
  return { marks, up: marks.filter((m) => m.up).length, allowed: marksAllowed(reputation), reputation };
}

export type MapMark = {
  id: number;
  x: number;
  z: number;
  kind: MarkKind;
  author: string | null;
  authorName: string;
  body: string | null;
  colour: string | null;
  /** Writing's graffiti style. */
  style: GraffitiStyle;
  rating: number | null;
  place: string | null;
  expiresAt: string | null;
  opensAt: string | null;
  item: string | null;
  takenBy: string | null;
  at: string;
  reactions: Partial<Record<Reaction, number>>;
  mine: Reaction | null;
  voted: boolean;
  votes: number;
};

/** Marks round a spot (tiles) that are up now. */
export async function marksNear(region: string, x: number, z: number): Promise<MapMark[]> {
  const userId = await currentUserId();
  // Marks are for signed-in players only.
  if (!userId || !regionMap(region)) return [];
  const R = 50;
  const { data } = await createAdminClient().rpc("marks_near", {
    p_viewer: userId ?? "00000000-0000-0000-0000-000000000000",
    p_region: region,
    p_x0: Math.round(n(x)) - R,
    p_x1: Math.round(n(x)) + R,
    p_z0: Math.round(n(z)) - R,
    p_z1: Math.round(n(z)) + R,
  });
  return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: n(m.id),
    x: n(m.x),
    z: n(m.z),
    kind: m.kind as MarkKind,
    author: m.author == null ? null : String(m.author),
    authorName: String(m.authorName),
    body: m.body == null ? null : String(m.body),
    colour: m.colour == null ? null : String(m.colour),
    style: graffiti(m.style == null ? null : String(m.style)),
    rating: m.rating == null ? null : n(m.rating),
    place: m.place == null ? null : String(m.place),
    expiresAt: m.expiresAt == null ? null : String(m.expiresAt),
    opensAt: m.opensAt == null ? null : String(m.opensAt),
    item: m.item == null ? null : String(m.item),
    takenBy: m.takenBy == null ? null : String(m.takenBy),
    at: String(m.at),
    reactions: (m.reactions ?? {}) as MapMark["reactions"],
    mine: (m.mine ?? null) as Reaction | null,
    voted: !!m.voted,
    votes: n(m.votes),
  }));
}

/** Leave a mark at a spot: what kind, the words, a colour, stars, when a capsule opens, a thing in it. */
export async function leaveMark(f: { region: string; x: number; z: number; kind: string; body: string; colour?: string; style?: string; rating?: number; place?: string; opensInDays?: number; itemId?: number }): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to leave a mark." };
  const map = regionMap(f.region);
  const k = markKind(f.kind);
  if (!map || !k) return say("bad_kind");
  if (!map.inside(Math.round(n(f.x)), Math.round(n(f.z)))) return { ok: false, error: "That spot isn't on the map." };
  // Never on water; trees, benches, statues and fountains never on a road, a railway or a landmark
  // (moved to the nearest spot that will do).
  const spot = markSpot(k.kind, Math.round(n(f.x)), Math.round(n(f.z)), lookFor(f.region)!);
  if (!spot) return { ok: false, error: k.kind === "writing" || k.kind === "review" || k.kind === "plaque" || k.kind === "capsule" ? "That's water: pick a spot on land." : `There's no room for a ${k.label.toLowerCase()} here: try a park, a garden or open ground off the road.` };
  const { x, z } = spot;
  const body = cleanMarkText(f.body);
  if (k.text === "need" && !body) return say("empty");
  const found = personalInfo(body) ?? website(body);
  if (found) return { ok: false, error: `Take out ${found}: ${found.includes("website") || found.includes("handle") ? "links and handles" : "real contact details"} can't go on the map.` };
  // Reputation decides how many marks you can have up at once.
  const rep = (await myThings())?.reputation.score ?? 0;
  const allowed = marksAllowed(rep);
  if (allowed < 1) return say(`low_rep:${rep}`);
  const colour = f.colour && INKS.includes(f.colour) ? f.colour : null;
  const rating = k.kind === "review" ? Math.min(5, Math.max(1, Math.round(n(f.rating) || 5))) : null;
  const opens = k.kind === "capsule" ? new Date(Date.now() + Math.min(365, Math.max(0, Math.round(n(f.opensInDays)))) * 86_400_000).toISOString() : null;
  const db = createAdminClient();
  const up = await marksUp(userId);
  if (up >= allowed) return say(`mark_limit:${allowed}`);
  const args = {
    p_user: userId,
    p_region: f.region,
    p_x: x,
    p_z: z,
    p_kind: k.kind,
    p_body: body || null,
    p_colour: colour,
    p_rating: rating,
    p_place: String(f.place ?? map.areaAt(x, z)).slice(0, 120),
    p_cost: mintOf(spot.adopt ? k.price * ADOPT_SHARE : k.price, map.region.prices),
    p_days: k.days,
    p_opens_at: opens,
    p_item: k.kind === "capsule" && f.itemId ? Math.round(n(f.itemId)) : null,
    p_style: k.kind === "writing" ? graffiti(f.style) : null,
    p_allowed: allowed,
  };
  let { error } = await db.rpc("mark_place", args);
  // Before game-db/053 is run there are no styles or limits in the database: leave it the old way
  // (the limit was checked above).
  if (error && /could not find the function|PGRST202/i.test(`${error.message} ${error.code ?? ""}`)) {
    const { p_style: _style, p_allowed: _allowed, ...old } = args;
    void _style;
    void _allowed;
    ({ error } = await db.rpc("mark_place", old));
  }
  if (error) return say(error.message);
  return { ok: true, text: spot.adopt ? "adopted" : spot.x !== Math.round(n(f.x)) || spot.z !== Math.round(n(f.z)) ? "moved" : undefined };
}

/** React to a mark (the same again takes it back). */
export async function reactMark(id: number, emoji: string): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to react." };
  if (!REACTIONS.some((r) => r.id === emoji)) return say("bad_kind");
  const db = createAdminClient();
  const { data: m } = await db.from("marks").select("author").eq("id", Math.round(n(id))).maybeSingle();
  const { error } = await db.rpc("mark_react", { p_user: userId, p_mark: Math.round(n(id)), p_emoji: emoji });
  if (error) return say(error.message);
  if (m?.author && m.author !== userId) await pushTo(m.author as string);
  return { ok: true };
}

/** Vote to take a mark down. Says if that was the vote that did it. */
export async function voteMark(id: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to vote." };
  const { data, error } = await createAdminClient().rpc("mark_vote", { p_user: userId, p_mark: Math.round(n(id)) });
  if (error) return say(error.message);
  return { ok: true, text: data ? "Taken down. Thanks for keeping the city nice." : "Vote counted. Enough votes and it comes down." };
}

/** Take your own mark down. */
export async function removeMark(id: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { error } = await createAdminClient().rpc("mark_remove", { p_user: userId, p_mark: Math.round(n(id)) });
  return error ? say(error.message) : { ok: true };
}

/** Chip in to keep a tree, statue... standing for more days. */
export async function chipIn(id: number, days: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = createAdminClient();
  const { data: m } = await db.from("marks").select("kind, region").eq("id", Math.round(n(id))).maybeSingle();
  const map = m ? regionMap(m.region as string) : null;
  if (!m || !map) return say("gone");
  const d = Math.min(90, Math.max(1, Math.round(n(days))));
  const { error } = await db.rpc("mark_chip_in", { p_user: userId, p_mark: Math.round(n(id)), p_amount: mintOf(dayCost(m.kind as MarkKind) * d, map.region.prices), p_days: d });
  return error ? say(error.message) : { ok: true, text: `Thanks! It stands ${d} more day${d === 1 ? "" : "s"}.` };
}

/** Open a time capsule once it's due (the first gets what's inside). */
export async function openCapsule(id: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data, error } = await createAdminClient().rpc("capsule_open", { p_user: userId, p_mark: Math.round(n(id)) });
  if (error) return say(error.message);
  return { ok: true, text: data ? `You found ${String(data)} inside! It's in your things.` : "Opened. Someone got to what was inside first." };
}
