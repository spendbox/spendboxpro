"use server";

import { cleanAvatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import {
  DAYS_AHEAD,
  EARLY_DOORS_MINS,
  HOSTS_A_DAY,
  MINUTES_MAX,
  MINUTES_MIN,
  NEAR_TILES,
  TICKET_MAX_NAIRA,
  cleanAbout,
  cleanStage,
  cleanTitle,
  eventFormat,
  eventStatus,
  type EventStatus,
  type StageState,
} from "@/lib/world/events";
import { tidy } from "@/lib/world/value";

// Events on the map (docs/EVENTS.md; the database part is game-db/095_events.sql). Money only moves
// in the database: tickets, refunds and the host's share.

type Fail = { ok: false; error: string };
type Db = ReturnType<typeof createAdminClient>;
const n = (v: unknown) => Number(v ?? 0) || 0;
const missing = (m: string) => /hosted_event|event_(open|rsvp|enter|sweep|cancel|end|stage|rep|hosting|player|settle)/.test(m);
const OFF = "Events are switched on soon (the game's owner has one update to run).";
const SLIDE_BUCKET = "events";

function say(message: string): Fail {
  const [code, arg] = message.split(":");
  const words: Record<string, string> = {
    busy: "You're already hosting an event. One at a time: end or call off that one first.",
    too_many: `That's ${HOSTS_A_DAY} events today. Host another tomorrow.`,
    bad_title: "Give it a name (3 to 60 letters).",
    bad_kind: "Pick what kind of event it is.",
    too_far: `Pick a time in the next ${DAYS_AHEAD} days.`,
    bad_length: `It can run from ${MINUTES_MIN} minutes to ${MINUTES_MAX / 60} hours.`,
    bad_price: "That ticket price isn't allowed.",
    bad_capacity: "Pick how many people can come.",
    full: "It's full. Try another one.",
    over: "That event is over.",
    cancelled: "The host called that one off.",
    gone: "That event is gone.",
    host: "You're the host: you're always going.",
    not_host: "Only the host can do that.",
    not_yet: `The doors open ${EARLY_DOORS_MINS} minutes before it starts. Say you're going and you'll be told.`,
    not_started: "It hasn't started yet. Call it off instead?",
    bad_stage: "That's too much for the stage. Try fewer slides.",
    no_life: "Start your life in the city first.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
  };
  if (code === "not_enough") return { ok: false, error: `You need ${arg ? `₥${arg}` : "more"} for the ticket.` };
  if (words[code]) return { ok: false, error: words[code] };
  if (missing(message)) return { ok: false, error: OFF };
  console.error("Event failed", message);
  return { ok: false, error: "That didn't work. Try again." };
}

const perMintOf = (region: string) => REGIONS[region]?.prices.perMint ?? 1_500;
const spotOf = (id: string | null) => {
  const m = /:(-?\d+),(-?\d+)/.exec(id ?? "");
  return m ? { x: Number(m[1]), z: Number(m[2]) } : null;
};
/** Where slides live (only pictures from here are shown on a stage). */
const slideBase = (db: Db) => db.storage.from(SLIDE_BUCKET).getPublicUrl("x").data.publicUrl.replace(/x$/, "");

export type EventPerson = { id: string; name: string; avatar: unknown };
export type EventView = {
  id: number;
  region: string;
  category: "party" | "stage";
  format: string;
  title: string;
  about: string;
  x: number;
  z: number;
  place: string;
  onStreet: boolean;
  startsAt: string;
  endsAt: string;
  /** The ticket (mint; 0 free) and the most people. */
  price: number;
  capacity: number;
  status: EventStatus;
  host: EventPerson;
  going: number;
  came: number;
  /** A few faces of the people going (the host first). */
  faces: EventPerson[];
  /** You: going, came in, hosting. */
  me: { going: boolean; in: boolean; host: boolean };
  stage: StageState;
};

async function views(db: Db, rows: Record<string, unknown>[], userId: string | null): Promise<EventView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => n(r.id));
  const { data: gs } = await db.from("hosted_event_guests").select("event_id, user_id, going, entered_at").in("event_id", ids).order("going_at", { ascending: true }).limit(5000);
  const guests = (gs ?? []) as { event_id: number; user_id: string; going: boolean; entered_at: string | null }[];
  const faceIds = new Set<string>(rows.map((r) => String(r.host_id)));
  for (const id of ids) guests.filter((g) => n(g.event_id) === id && g.going).slice(0, 8).forEach((g) => faceIds.add(g.user_id));
  const { data: profs } = await db.from("profiles").select("id, username, avatar").in("id", [...faceIds]);
  const byId = new Map(((profs ?? []) as { id: string; username: string | null; avatar: unknown }[]).map((p) => [p.id, p]));
  const person = (id: string): EventPerson => {
    const p = byId.get(id);
    const name = p?.username ?? "Player";
    return { id, name, avatar: cleanAvatar(p?.avatar, name) };
  };
  const base = slideBase(db);
  return rows.map((r) => {
    const id = n(r.id);
    const mine = guests.filter((g) => n(g.event_id) === id);
    const hostId = String(r.host_id);
    const me = userId ? mine.find((g) => g.user_id === userId) : undefined;
    const going = mine.filter((g) => g.going);
    return {
      id,
      region: String(r.region),
      category: r.category === "stage" ? "stage" : "party",
      format: String(r.format),
      title: String(r.title),
      about: String(r.about ?? ""),
      x: n(r.x),
      z: n(r.z),
      place: String(r.place ?? ""),
      onStreet: !!r.on_street,
      startsAt: String(r.starts_at),
      endsAt: String(r.ends_at),
      price: n(r.price),
      capacity: n(r.capacity),
      status: eventStatus(Date.parse(String(r.starts_at)), Date.parse(String(r.ends_at)), r.status === "cancelled"),
      host: person(hostId),
      going: going.length,
      came: mine.filter((g) => g.entered_at).length,
      faces: [hostId, ...going.map((g) => g.user_id).filter((u) => u !== hostId)].slice(0, 8).map(person),
      me: { going: !!me?.going, in: !!me?.entered_at, host: userId === hostId },
      stage: cleanStage(r.stage, base),
    };
  });
}

/** Tell the people going that their event started (on their phones too). */
async function sweep(db: Db, region: string) {
  const r = await db.rpc("event_sweep", { p_region: region });
  if (r.error) return r.error;
  const told = (Array.isArray(r.data) ? r.data : []) as string[];
  if (told.length) await Promise.all(told.slice(0, 200).map((u) => pushTo(String(u)).catch(() => {})));
  return null;
}

/** The events in a region that aren't over (on now first, then coming up), nearest first among those on now. */
export async function eventsAround(region: string, x: number, z: number): Promise<{ list: EventView[]; off?: boolean }> {
  if (!REGIONS[region]) return { list: [] };
  const db = createAdminClient();
  const err = await sweep(db, region);
  if (err && missing(err.message)) return { list: [], off: true };
  const until = new Date(Date.now() + (DAYS_AHEAD + 1) * 86_400_000).toISOString();
  const { data } = await db
    .from("hosted_events")
    .select("*")
    .eq("region", region)
    .eq("status", "on")
    .gt("ends_at", new Date().toISOString())
    .lt("starts_at", until)
    .order("starts_at", { ascending: true })
    .limit(80);
  const userId = await currentUserId().catch(() => null);
  const list = await views(db, (data ?? []) as Record<string, unknown>[], userId);
  const now = Date.now();
  const d = (e: EventView) => Math.hypot(e.x - x, e.z - z);
  list.sort((a, b) => {
    const la = Date.parse(a.startsAt) <= now ? 0 : 1;
    const lb = Date.parse(b.startsAt) <= now ? 0 : 1;
    if (la !== lb) return la - lb;
    return la === 0 ? d(a) - d(b) : Date.parse(a.startsAt) - Date.parse(b.startsAt);
  });
  return { list };
}

/** One event as it is now. */
export async function eventView(id: number): Promise<EventView | null> {
  const db = createAdminClient();
  const { data } = await db.from("hosted_events").select("*").eq("id", Math.round(n(id))).maybeSingle();
  if (!data) return null;
  const userId = await currentUserId().catch(() => null);
  return (await views(db, [data as Record<string, unknown>], userId))[0] ?? null;
}

export type EventQuote = {
  perMint: number;
  /** The most a ticket can cost here (mint). */
  priceMax: number;
  /** Your event that isn't over, if any. */
  hosting: number | null;
  /** Events you hosted in the last day. */
  today: number;
  rep: { hosted: number; attended: number } | null;
};

export async function eventQuote(region: string): Promise<EventQuote> {
  const perMint = perMintOf(region);
  const priceMax = Math.round((TICKET_MAX_NAIRA / perMint) * 100) / 100;
  const userId = await currentUserId();
  if (!userId) return { perMint, priceMax, hosting: null, today: 0, rep: null };
  const db = createAdminClient();
  const [hosting, today, rep] = await Promise.all([
    db.rpc("event_hosting", { p_user: userId }),
    db.from("hosted_events").select("id", { count: "exact", head: true }).eq("host_id", userId).gt("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    myEventRep(),
  ]);
  return { perMint, priceMax, hosting: hosting.error || hosting.data == null ? null : n(hosting.data), today: today.count ?? 0, rep };
}

/** Events you hosted that people came to, and events you went to (for reputation). */
export async function myEventRep(): Promise<{ hosted: number; attended: number } | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await createAdminClient().rpc("event_rep", { p_user: userId });
  if (error || !data) return null;
  const d = data as { hosted?: number; attended?: number };
  return { hosted: n(d.hosted), attended: n(d.attended) };
}

export type NewEvent = {
  region: string;
  format: string;
  title: string;
  about: string;
  x: number;
  z: number;
  place: string;
  onStreet: boolean;
  /** When it starts (ms). */
  startsAt: number;
  minutes: number;
  /** The ticket (mint; 0 free). */
  price: number;
  capacity: number;
};

/** Host an event. Everyone near the spot is told if it's starting soon; your friends are told either way. */
export async function hostEvent(input: NewEvent): Promise<{ ok: true; id: number; startsAt: string } | Fail> {
  const f = eventFormat(String(input.format));
  if (!f) return { ok: false, error: "Pick what kind of event it is." };
  const region = String(input.region);
  if (!REGIONS[region] || !Number.isFinite(input.x) || !Number.isFinite(input.z)) return { ok: false, error: "Pick where it is." };
  const title = cleanTitle(String(input.title ?? ""));
  if (!title) return say("bad_title");
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to host an event." };
  const perMint = perMintOf(region);
  const db = createAdminClient();
  const starts = Number.isFinite(input.startsAt) ? new Date(Math.max(Date.now(), input.startsAt)) : new Date();
  const { data, error } = await db.rpc("event_open", {
    p_user: userId,
    p_region: region,
    p_category: f.category,
    p_format: f.id,
    p_title: title,
    p_about: cleanAbout(String(input.about ?? "")),
    p_x: Math.round(input.x),
    p_z: Math.round(input.z),
    p_place: String(input.place ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    p_on_street: !!input.onStreet,
    p_starts: starts.toISOString(),
    p_minutes: Math.round(n(input.minutes)),
    p_price: Math.max(0, Math.round(n(input.price) * 100) / 100),
    p_price_max: Math.round((TICKET_MAX_NAIRA / perMint) * 100) / 100,
    p_capacity: Math.round(n(input.capacity)),
    p_per_day: HOSTS_A_DAY,
  });
  if (error) return say(error.message);
  const d = (data ?? {}) as { id?: number; starts_at?: string };
  const id = n(d.id);
  const startsAt = String(d.starts_at ?? starts.toISOString());

  // Who hears about it: friends always; everyone near the spot if it starts within 15 minutes.
  const { data: me } = await db.from("profiles").select("username").eq("id", userId).maybeSingle();
  const name = (me?.username as string | null) ?? "Someone";
  const soon = Date.parse(startsAt) - Date.now() < 15 * 60_000;
  const [{ data: fr }, near] = await Promise.all([
    db.from("friendships").select("requester, addressee").or(`requester.eq.${userId},addressee.eq.${userId}`).not("accepted_at", "is", null).limit(500),
    soon
      ? db.from("lives").select("user_id, at_place, home_unit").eq("region", region).neq("user_id", userId).limit(1000)
      : Promise.resolve({ data: [] as { user_id: string; at_place: string | null; home_unit: string | null }[] }),
  ]);
  const friends = new Set(((fr ?? []) as { requester: string; addressee: string }[]).map((r) => (r.requester === userId ? r.addressee : r.requester)));
  const nearby = ((near.data ?? []) as { user_id: string; at_place: string | null; home_unit: string | null }[])
    .filter((l) => {
      const s = spotOf(l.at_place ?? l.home_unit);
      return s && Math.hypot(s.x - input.x, s.z - input.z) <= NEAR_TILES;
    })
    .map((l) => l.user_id);
  const where = input.place ? ` at ${String(input.place).slice(0, 60)}` : "";
  const ticket = input.price > 0 ? ` Tickets ₦${tidy(input.price * perMint).toLocaleString("en-GB")}.` : " Free to come.";
  const told = new Map<string, string>();
  for (const u of nearby.slice(0, 60)) told.set(u, `${name} is hosting "${title}" (${f.title})${where}, starting now!${ticket} Tap Events to go.`);
  for (const u of [...friends].slice(0, 100))
    told.set(u, soon ? `Your friend ${name} is hosting "${title}"${where}, starting now!${ticket}` : `Your friend ${name} is hosting "${title}"${where}. Tap Events and say you're going.${ticket}`);
  await Promise.all(
    [...told].map(async ([u, body]) => {
      await db.rpc("notify", { p_user: u, p_round: null, p_kind: "event", p_body: body });
      await pushTo(u).catch(() => {});
    }),
  );
  return { ok: true, id, startsAt };
}

/** Going (or not any more). */
export async function rsvpEvent(id: number, going: boolean): Promise<{ ok: true; count: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to say you're going." };
  const { data, error } = await createAdminClient().rpc("event_rsvp", { p_user: userId, p_id: Math.round(n(id)), p_going: !!going });
  if (error) return say(error.message);
  return { ok: true, count: n((data as { count?: number })?.count) };
}

/** Come in (the ticket is paid the first time). */
export async function enterEvent(id: number): Promise<{ ok: true; paid: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to go in." };
  const { data, error } = await createAdminClient().rpc("event_enter", { p_user: userId, p_id: Math.round(n(id)), p_early: EARLY_DOORS_MINS });
  if (error) return say(error.message);
  return { ok: true, paid: n((data as { paid?: number })?.paid) };
}

/** The host calls it off (tickets back). */
export async function cancelEvent(id: number): Promise<{ ok: true } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: going } = await db.from("hosted_event_guests").select("user_id").eq("event_id", Math.round(n(id))).eq("going", true).neq("user_id", userId).limit(300);
  const { error } = await db.rpc("event_cancel", { p_user: userId, p_id: Math.round(n(id)) });
  if (error) return say(error.message);
  await Promise.all(((going ?? []) as { user_id: string }[]).map((g) => pushTo(g.user_id).catch(() => {})));
  return { ok: true };
}

/** The host ends it now (and is paid their share). */
export async function endEvent(id: number): Promise<{ ok: true } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { error } = await createAdminClient().rpc("event_end", { p_user: userId, p_id: Math.round(n(id)) });
  if (error) return say(error.message);
  return { ok: true };
}

/** The host sets what's on the stage (people who come in later see the same). */
export async function setStage(id: number, stage: StageState): Promise<{ ok: true } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const clean = cleanStage(stage, slideBase(db));
  const { error } = await db.rpc("event_stage", { p_user: userId, p_id: Math.round(n(id)), p_stage: clean });
  if (error) return say(error.message);
  return { ok: true };
}
