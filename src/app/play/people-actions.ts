"use server";

import type { Avatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { reputationOf } from "@/lib/world/items";
import { ownedSpot } from "@/lib/world/owned";

// A city full of people (docs/PEOPLE.md; the database part is game-db/051_people.sql): who's
// about on the map, players' cards, doorsteps (knocks, notes, wrapped gifts, thanks), while you
// were away, and web push.

const n = (v: unknown) => Number(v ?? 0) || 0;
type Result = { ok: true } | { ok: false; error: string };

function say(message: string | undefined): { ok: false; error: string } {
  const code = (message ?? "").split(":")[0];
  const words: Record<string, string> = {
    self: "That's your own door!",
    no_home: "They don't have a home yet.",
    blocked: "They're not taking visits from you.",
    too_many: "That's enough visits for today. Come back tomorrow.",
    too_many_here: "You've been to that door a lot today. Give them a rest.",
    empty: "Write something first.",
    not_yours: "That isn't yours.",
    their_items_full: "Their things are full up.",
    already: "Done already.",
    bad_kind: "That can't be left at a door.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("People action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

export type PersonOnMap = { id: string; name: string; avatar: Avatar | null; status: "online" | "asleep" | "work" | "away"; x: number; z: number; job: string | null; friend: boolean };

/** Who's about round a spot (tiles), and you're about too (online for the next few minutes). */
export async function peopleNear(region: string, x: number, z: number): Promise<PersonOnMap[]> {
  const userId = await currentUserId();
  if (!userId || !regionMap(region)) return [];
  const db = createAdminClient();
  const R = 60;
  const cx = Math.round(n(x));
  const cz = Math.round(n(z));
  const [, { data }] = await Promise.all([
    db.rpc("people_here", { p_user: userId }),
    db.rpc("people_on_map", { p_viewer: userId, p_region: region, p_x0: cx - R, p_x1: cx + R, p_z0: cz - R, p_z1: cz + R, p_limit: 80 }),
  ]);
  return ((data ?? []) as Record<string, unknown>[])
    .filter((p) => p.x != null && p.z != null)
    .map((p) => ({ id: String(p.id), name: String(p.name), avatar: (p.avatar ?? null) as Avatar | null, status: p.status as PersonOnMap["status"], x: n(p.x), z: n(p.z), job: p.job == null ? null : String(p.job), friend: !!p.friend }));
}

export type PlayerCardData = {
  id: string;
  name: string;
  avatar: Avatar | null;
  online: boolean;
  seenAt: string | null;
  /** Their home: the area it's in, and where (to fly there). */
  home: { area: string; x: number; z: number } | null;
  job: { title: string; place: string } | null;
  car: string | null;
  things: number;
  inventions: { name: string; sold: number }[];
  friends: { id: string; name: string }[];
  friend: boolean;
  blocked: boolean;
  reputation: number;
};

/** Anyone's card: where they live, their job, car, inventions, friends and reputation. */
export async function playerCard(id: string): Promise<PlayerCardData | null> {
  const userId = await currentUserId();
  if (!userId || !/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const [{ data }, { data: liked }] = await Promise.all([
    createAdminClient().rpc("player_card", { p_viewer: userId, p_target: id }),
    createAdminClient().rpc("marks_liked", { p_user: id }),
  ]);
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const spot = d.home ? ownedSpot(String(d.home).split("/")[0]) : null;
  const map = spot ? regionMap(spot.region) : null;
  const rep = reputationOf({ propertyMint: n(d.property), homes: d.home ? 1 : 0, itemRep: n(d.thingsRep), inventionsSold: n(d.inventionsSold), penalty: n(d.penalty), marksLiked: n(liked) });
  return {
    id: String(d.id),
    name: String(d.name),
    avatar: (d.avatar ?? null) as Avatar | null,
    online: !!d.online,
    seenAt: d.seenAt == null ? null : String(d.seenAt),
    home: spot && map ? { area: map.areaAt(spot.x, spot.z), x: spot.x, z: spot.z } : null,
    job: (d.job ?? null) as PlayerCardData["job"],
    car: d.car == null ? null : String(d.car),
    things: n(d.things),
    inventions: ((d.inventions ?? []) as { name: string; sold: number }[]).map((k) => ({ name: String(k.name), sold: n(k.sold) })),
    friends: ((d.friends ?? []) as { id: string; name: string }[]).map((f) => ({ id: String(f.id), name: String(f.name ?? "Someone") })),
    friend: !!d.friend,
    blocked: !!d.blocked,
    reputation: rep.score,
  };
}

/** Knock on someone's door, leave a note, or leave one of your things as a wrapped gift. They get a push. */
export async function leaveAtDoor(to: string, kind: "knock" | "note" | "gift", body?: string, itemId?: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  if (!/^[0-9a-f-]{36}$/i.test(String(to))) return say("bad_kind");
  const { error } = await createAdminClient().rpc("doorstep_leave", {
    p_from: userId,
    p_to: to,
    p_kind: kind,
    p_body: String(body ?? "").replace(/\s+/g, " ").trim().slice(0, 280) || null,
    p_item: kind === "gift" ? Math.round(n(itemId)) : null,
  });
  if (error) return say(error.message);
  await pushTo(to);
  return { ok: true };
}

export type DoorstepEntry = { id: number; kind: "knock" | "note" | "gift"; body: string | null; item: string | null; at: string; opened: boolean; thanked: boolean; from: string | null; fromName: string; fromAvatar: Avatar | null };

/** What's at your door, newest first. */
export async function myDoorstep(): Promise<DoorstepEntry[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data } = await createAdminClient().rpc("doorstep_list", { p_user: userId });
  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: n(d.id),
    kind: d.kind as DoorstepEntry["kind"],
    body: d.body == null ? null : String(d.body),
    item: d.item == null ? null : String(d.item),
    at: String(d.at),
    opened: !!d.opened,
    thanked: !!d.thanked,
    from: d.from == null ? null : String(d.from),
    fromName: String(d.fromName),
    fromAvatar: (d.fromAvatar ?? null) as Avatar | null,
  }));
}

/** Open what's at your door (one, or everything). */
export async function openDoorstep(id?: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { error } = await createAdminClient().rpc("doorstep_open", { p_user: userId, p_id: id == null ? null : Math.round(n(id)) });
  return error ? say(error.message) : { ok: true };
}

/** Say thank you for something left at your door. */
export async function thankDoorstep(id: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = createAdminClient();
  const { data: row } = await db.from("doorstep").select("from_user").eq("id", Math.round(n(id))).maybeSingle();
  const { error } = await db.rpc("doorstep_thank", { p_user: userId, p_id: Math.round(n(id)) });
  if (error) return say(error.message);
  await pushTo(row?.from_user as string | undefined);
  return { ok: true };
}

export type AwayDigest = {
  since: string;
  doorstep: { kind: string; body: string | null; item: string | null; fromName: string; at: string }[];
  notices: { kind: string; body: string; at: string }[];
  money: Record<string, number>;
};

/** While you were away: what came to your door, what you were told, the money that moved. Shown once. */
export async function awayDigest(): Promise<AwayDigest | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data } = await createAdminClient().rpc("away_digest", { p_user: userId });
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    since: String(d.since),
    doorstep: (d.doorstep ?? []) as AwayDigest["doorstep"],
    notices: (d.notices ?? []) as AwayDigest["notices"],
    money: Object.fromEntries(Object.entries((d.money ?? {}) as Record<string, unknown>).map(([k, v]) => [k, n(v)])),
  };
}

/** Keep this phone or browser's push subscription (notifications on). */
export async function savePush(sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } }): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const endpoint = String(sub?.endpoint ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) return { ok: false, error: "That browser can't take notifications." };
  const { error } = await createAdminClient().rpc("push_subscribe", { p_user: userId, p_endpoint: endpoint, p_p256dh: sub.keys?.p256dh ?? null, p_auth: sub.keys?.auth ?? null });
  return error ? say(error.message) : { ok: true };
}
