"use server";

import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { mintOf } from "@/lib/world/items";
import { cleanMarkText, dayCost, INKS, markKind, personalInfo, REACTIONS, type MarkKind, type Reaction } from "@/lib/world/marks";

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
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Mark action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
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
  if (!regionMap(region)) return [];
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
export async function leaveMark(f: { region: string; x: number; z: number; kind: string; body: string; colour?: string; rating?: number; place?: string; opensInDays?: number; itemId?: number }): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to leave a mark." };
  const map = regionMap(f.region);
  const k = markKind(f.kind);
  if (!map || !k) return say("bad_kind");
  const x = Math.round(n(f.x));
  const z = Math.round(n(f.z));
  if (!map.inside(x, z)) return { ok: false, error: "That spot isn't on the map." };
  const body = cleanMarkText(f.body);
  if (k.text === "need" && !body) return say("empty");
  const found = personalInfo(body);
  if (found) return { ok: false, error: `Take out ${found}: real contact details can't go on the map.` };
  const colour = f.colour && INKS.includes(f.colour) ? f.colour : null;
  const rating = k.kind === "review" ? Math.min(5, Math.max(1, Math.round(n(f.rating) || 5))) : null;
  const opens = k.kind === "capsule" ? new Date(Date.now() + Math.min(365, Math.max(0, Math.round(n(f.opensInDays)))) * 86_400_000).toISOString() : null;
  const { error } = await createAdminClient().rpc("mark_place", {
    p_user: userId,
    p_region: f.region,
    p_x: x,
    p_z: z,
    p_kind: k.kind,
    p_body: body || null,
    p_colour: colour,
    p_rating: rating,
    p_place: String(f.place ?? map.areaAt(x, z)).slice(0, 120),
    p_cost: mintOf(k.price, map.region.prices),
    p_days: k.days,
    p_opens_at: opens,
    p_item: k.kind === "capsule" && f.itemId ? Math.round(n(f.itemId)) : null,
  });
  return error ? say(error.message) : { ok: true };
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
