"use server";

import { naira } from "@/lib/brand";
import { after } from "next/server";
import { cleanAvatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { notifyMany } from "@/lib/notify-many";
import { pushToMany } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, regionMap } from "@/lib/world";
import {
  DAYS_AHEAD,
  EARLY_DOORS_MINS,
  HOSTS_A_DAY,
  MINUTES_MAX,
  MINUTES_MIN,
  NEAR_TILES,
  PARTY_SIZES,
  PARTY_SIZE_DEFAULT,
  STREET_GAP_TILES,
  TICKET_MAX_NAIRA,
  VENUE_COST,
  areaK,
  cleanAbout,
  cleanStage,
  cleanTitle,
  eventFormat,
  eventStatus,
  partyCost,
  partySize,
  type EventStatus,
  type VenueKind,
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
    street_taken: "Another street party is on that stretch of road then (or so close your parties would meet). Pick another road, further along, a smaller size, or another time.",
    bad_size: "Pick how big the party is.",
    not_road: "That spot isn't on a road. Pick a street from the list.",
    bad_stage: "That's too much for the stage. Try fewer slides.",
    no_life: "Start your life in the city first.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
  };
  if (code === "not_enough") return { ok: false, error: `You need ${arg ? naira(arg) : "more"} for that.` };
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
  /** How far a party reaches (metres): one spot (50) up to a carnival (2,500). */
  radiusM: number;
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

/** Per event: how many are going and came in, you, and the first few going (their ids). */
type Counts = { going: number; came: number; meGoing: boolean; meIn: boolean; faces: string[] };

/**
 * The counts for a list of events: from the database's event_counts (game-db/097: just the numbers,
 * however many guests), or before that runs, worked out from the guests themselves.
 */
async function countsOf(db: Db, ids: number[], userId: string | null): Promise<Map<number, Counts>> {
  const out = new Map<number, Counts>();
  const r = await db.rpc("event_counts", { p_ids: ids, p_user: userId ?? "00000000-0000-0000-0000-000000000000" });
  if (!r.error && Array.isArray(r.data)) {
    for (const c of r.data as { id: number; going: number; came: number; me_going: boolean; me_in: boolean; faces: string[] }[]) {
      out.set(n(c.id), { going: n(c.going), came: n(c.came), meGoing: !!c.me_going, meIn: !!c.me_in, faces: (c.faces ?? []).map(String) });
    }
    return out;
  }
  const { data: gs } = await db.from("hosted_event_guests").select("event_id, user_id, going, entered_at").in("event_id", ids).order("going_at", { ascending: true }).limit(5000);
  const guests = (gs ?? []) as { event_id: number; user_id: string; going: boolean; entered_at: string | null }[];
  for (const id of ids) {
    const mine = guests.filter((g) => n(g.event_id) === id);
    const me = userId ? mine.find((g) => g.user_id === userId) : undefined;
    const going = mine.filter((g) => g.going);
    out.set(id, { going: going.length, came: mine.filter((g) => g.entered_at).length, meGoing: !!me?.going, meIn: !!me?.entered_at, faces: going.map((g) => g.user_id) });
  }
  return out;
}

async function views(db: Db, rows: Record<string, unknown>[], userId: string | null): Promise<EventView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => n(r.id));
  const counts = await countsOf(db, ids, userId);
  const faceIds = new Set<string>(rows.map((r) => String(r.host_id)));
  for (const id of ids) (counts.get(id)?.faces ?? []).slice(0, 8).forEach((u) => faceIds.add(u));
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
    const c = counts.get(id) ?? { going: 0, came: 0, meGoing: false, meIn: false, faces: [] };
    const hostId = String(r.host_id);
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
      radiusM: n(r.radius_m) || PARTY_SIZE_DEFAULT,
      status: eventStatus(Date.parse(String(r.starts_at)), Date.parse(String(r.ends_at)), r.status === "cancelled"),
      host: person(hostId),
      going: c.going,
      came: c.came,
      faces: [hostId, ...c.faces.filter((u) => u !== hostId)].slice(0, 8).map(person),
      me: { going: c.meGoing, in: c.meIn, host: userId === hostId },
      stage: cleanStage(r.stage, base),
    };
  });
}

/** When each region's events were last swept (on this server), and how often to. */
const lastSweep = new Map<string, number>();
const SWEEP_MS = 30_000;

/** Tell the people going that their event started (on their phones too). */
async function sweep(db: Db, region: string) {
  const r = await db.rpc("event_sweep", { p_region: region });
  if (r.error) return r.error;
  const told = (Array.isArray(r.data) ? r.data : []) as string[];
  if (told.length) await pushToMany(told.map(String));
  return null;
}

/** The events in a region that aren't over (on now first, then coming up), nearest first among those on now. */
export async function eventsAround(region: string, x: number, z: number): Promise<{ list: EventView[]; off?: boolean }> {
  if (!REGIONS[region]) return { list: [] };
  const db = createAdminClient();
  // Telling people their event started and settling the ones that are over: once every 30 s per
  // server is plenty (every player asks every 20 s; at thousands of players that was the database's
  // busiest job).
  if (Date.now() - (lastSweep.get(region) ?? 0) > SWEEP_MS) {
    lastSweep.set(region, Date.now());
    const err = await sweep(db, region);
    if (err && missing(err.message)) return { list: [], off: true };
  }
  const until = new Date(Date.now() + (DAYS_AHEAD + 1) * 86_400_000).toISOString();
  const { data, error } = await db
    .from("hosted_events")
    .select("*")
    .eq("region", region)
    .eq("status", "on")
    .gt("ends_at", new Date().toISOString())
    .lt("starts_at", until)
    .order("starts_at", { ascending: true })
    .limit(80);
  if (error && missing(error.message)) return { list: [], off: true };
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
  /** What you can spend on it (Fun money and your wallet, mint), or null if not known. */
  canSpend: number | null;
};

export async function eventQuote(region: string): Promise<EventQuote> {
  const perMint = perMintOf(region);
  const priceMax = Math.round((TICKET_MAX_NAIRA / perMint) * 100) / 100;
  const userId = await currentUserId();
  if (!userId) return { perMint, priceMax, hosting: null, today: 0, rep: null, canSpend: null };
  const db = createAdminClient();
  const [hosting, today, rep, spend] = await Promise.all([
    db.rpc("event_hosting", { p_user: userId }),
    db.from("hosted_events").select("id", { count: "exact", head: true }).eq("host_id", userId).gt("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    myEventRep(),
    db.rpc("life_can_spend", { p_user: userId, p_pots: ["fun"] }),
  ]);
  return {
    perMint,
    priceMax,
    hosting: hosting.error || hosting.data == null ? null : n(hosting.data),
    today: today.count ?? 0,
    rep,
    canSpend: spend.error || spend.data == null ? null : n(spend.data),
  };
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

/**
 * What kind of place a spot is, as the map says (the server's word, not the phone's): a road, a
 * landmark, a famous spot; for an everyday place the map can't name here, what the phone says, but
 * never cheaper than a park. null: "on the street" but no road there.
 */
function venueAt(region: string, x: number, z: number, onStreet: boolean, said: VenueKind): VenueKind | null {
  const map = regionMap(region);
  if (!map) return said;
  const near = (f: (dx: number, dz: number) => boolean) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (f(dx, dz)) return true;
    return false;
  };
  if (onStreet) return near((dx, dz) => !!map.roadAt(x + dx, z + dz)) ? "street" : null;
  const l = map.landmarks.find((m) => x >= m.ax - 1 && x <= m.ax + m.w && z >= m.az - 1 && z <= m.az + m.d);
  // Every landmark on the map (Eko Hotel, Freedom Park, the National Stadium...) costs the landmark rate.
  if (l) return "landmark";
  let spot: string | null = null;
  for (let dz = -1; dz <= 1 && !spot; dz++) for (let dx = -1; dx <= 1 && !spot; dx++) spot = map.spotAt(x + dx, z + dz)?.kind ?? null;
  if (spot === "club") return "nightlife";
  if (spot === "restaurant") return "food";
  if (spot === "park" || spot === "plaza" || spot === "playground") return "outdoors";
  if (spot) return "landmark";
  return VENUE_COST[said] && VENUE_COST[said].k >= VENUE_COST.outdoors.k ? said : "outdoors";
}

/** What hosting a party costs (naira), worked out here from the map. null: not on a road. */
function hostingNaira(region: string, x: number, z: number, onStreet: boolean, said: VenueKind, minutes: number, capacity: number, radiusM: number) {
  const venue = venueAt(region, x, z, onStreet, said);
  if (!venue) return null;
  const map = regionMap(region);
  return partyCost({ minutes, capacity, venue, area: map ? areaK(map.centres, x, z) : 1, radiusM }).naira;
}
/** A size the host can pick (one of PARTY_SIZES), and the crowd it can hold; null for anything else. */
const sizeOf = (radiusM: unknown) => PARTY_SIZES.find((s) => s.m === Math.round(n(radiusM))) ?? null;

/** What a party would cost to host (naira), for the host's form (the same sum as when it's hosted). */
export async function partyPrice(input: { region: string; x: number; z: number; onStreet: boolean; venue: VenueKind; minutes: number; capacity: number; radiusM?: number }): Promise<number | null> {
  if (!REGIONS[input.region]) return null;
  return hostingNaira(input.region, Math.round(input.x), Math.round(input.z), !!input.onStreet, input.venue, Math.round(n(input.minutes)), Math.round(n(input.capacity)), partySize(n(input.radiusM)).m);
}

/** Street parties on now or coming up (for the host's road list: which stretches are taken, and when). */
export async function streetParties(region: string): Promise<{ x: number; z: number; start: number; end: number; title: string; radiusM: number }[]> {
  if (!REGIONS[region]) return [];
  const { data } = await createAdminClient()
    .from("hosted_events")
    .select("*")
    .eq("region", region)
    .eq("category", "party")
    .eq("on_street", true)
    .eq("status", "on")
    .gt("ends_at", new Date().toISOString())
    .limit(300);
  // (Every column: radius_m is only there once game-db/097 has run.)
  return ((data ?? []) as { x: number; z: number; starts_at: string; ends_at: string; title: string; radius_m?: number }[]).map((r) => ({
    x: n(r.x),
    z: n(r.z),
    start: Date.parse(r.starts_at),
    end: Date.parse(r.ends_at),
    title: String(r.title),
    radiusM: n(r.radius_m) || PARTY_SIZE_DEFAULT,
  }));
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
  /** What kind of place the phone says it is (checked against the map). */
  venue: VenueKind;
  /** When it starts (ms). */
  startsAt: number;
  minutes: number;
  /** The ticket (mint; 0 free). */
  price: number;
  capacity: number;
  /** A party's size (metres round the spot, one of PARTY_SIZES); talks are one spot. */
  radiusM?: number;
};

/** Host an event. Your friends are told, and the nearest people (twice as many as it holds, or everyone within 4 km). */
export async function hostEvent(input: NewEvent): Promise<{ ok: true; id: number; startsAt: string; fee: number; view: EventView | null } | Fail> {
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
  const x = Math.round(input.x);
  const z = Math.round(input.z);
  // Parties cost money to host (stages are free for now).
  let feeMint = 0;
  const size = f.category === "party" ? sizeOf(input.radiusM ?? PARTY_SIZE_DEFAULT) : PARTY_SIZES[0];
  if (!size) return say("bad_size");
  if (f.category === "party" && Math.round(n(input.capacity)) > size.most) return { ok: false, error: `A party that size holds up to ${size.most.toLocaleString("en-GB")} people. Pick a bigger size for more.` };
  if (f.category === "party") {
    const naira = hostingNaira(region, x, z, !!input.onStreet, input.venue, Math.round(n(input.minutes)), Math.round(n(input.capacity)), size.m);
    if (naira === null) return say("not_road");
    feeMint = Math.round((naira / perMint) * 100) / 100;
  }
  const { data, error } = await db.rpc("event_open", {
    p_user: userId,
    p_region: region,
    p_category: f.category,
    p_format: f.id,
    p_title: title,
    p_about: cleanAbout(String(input.about ?? "")),
    p_x: x,
    p_z: z,
    p_place: String(input.place ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    p_on_street: !!input.onStreet,
    p_starts: starts.toISOString(),
    p_minutes: Math.round(n(input.minutes)),
    p_price: Math.max(0, Math.round(n(input.price) * 100) / 100),
    p_price_max: Math.round((TICKET_MAX_NAIRA / perMint) * 100) / 100,
    p_capacity: Math.round(n(input.capacity)),
    p_per_day: HOSTS_A_DAY,
    p_fee: feeMint,
    p_gap: STREET_GAP_TILES,
    // Only bigger than one spot is sent (so hosting one-spot parties works before game-db/097 runs).
    ...(size.m !== PARTY_SIZE_DEFAULT ? { p_radius: size.m } : {}),
  });
  if (error) return say(error.message);
  const d = (data ?? {}) as { id?: number; starts_at?: string; fee?: number };
  const id = n(d.id);
  const startsAt = String(d.starts_at ?? starts.toISOString());
  // The new event, so the phone can open it at once (no second trip).
  const { data: row } = await db.from("hosted_events").select("*").eq("id", id).maybeSingle();
  const view = row ? ((await views(db, [row as Record<string, unknown>], userId))[0] ?? null) : null;
  // Telling people happens after the answer goes back, so the host isn't kept waiting.
  after(() => tellPeople(db, { userId, region, title, f, input, startsAt, perMint }).catch((e) => console.error("Event notices failed", e)));
  return { ok: true, id, startsAt, fee: n(d.fee), view };
}

async function tellPeople(
  db: Db,
  { userId, region, title, f, input, startsAt, perMint }: { userId: string; region: string; title: string; f: { title: string }; input: NewEvent; startsAt: string; perMint: number },
) {
  // Who hears about it: friends always (their own message), and nobody near misses out: the
  // nearest people however far, twice as many as it holds, or everyone within 4 km if that's
  // more (game-db/101 event_tell).
  const { data: me } = await db.from("profiles").select("username").eq("id", userId).maybeSingle();
  const name = (me?.username as string | null) ?? "Someone";
  const soon = Date.parse(startsAt) - Date.now() < 15 * 60_000;
  const { data: fr } = await db.from("friendships").select("requester, addressee").or(`requester.eq.${userId},addressee.eq.${userId}`).not("accepted_at", "is", null).limit(500);
  const friends = [...new Set(((fr ?? []) as { requester: string; addressee: string }[]).map((r) => (r.requester === userId ? r.addressee : r.requester)))];
  const where = input.place ? ` at ${String(input.place).slice(0, 60)}` : "";
  const ticket = input.price > 0 ? ` Tickets ₦${tidy(input.price * perMint).toLocaleString("en-GB")}.` : " Free to come.";
  const when = soon ? "starting now!" : `starting ${new Date(startsAt).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}.`;
  const nearBody = `${name} is hosting "${title}" (${f.title})${where} near you, ${when}${ticket} Tap Events to ${soon ? "go" : "say you're going"}.`;
  const told = await db.rpc("event_tell", {
    p_region: region,
    p_x: Math.round(input.x),
    p_z: Math.round(input.z),
    p_want: Math.max(0, Math.round(n(input.capacity))) * 2,
    p_tiles: NEAR_TILES,
    p_skip: [userId, ...friends],
    p_body: nearBody,
  });
  let near = (told.data ?? []) as string[];
  if (told.error) {
    // game-db/101 not run yet: the old way (people within 4 km, if it starts soon).
    const { data } = soon ? await db.from("lives").select("user_id, at_place, home_unit").eq("region", region).neq("user_id", userId).limit(1000) : { data: [] };
    const skip = new Set(friends);
    near = ((data ?? []) as { user_id: string; at_place: string | null; home_unit: string | null }[])
      .filter((l) => {
        const s = spotOf(l.at_place ?? l.home_unit);
        return !skip.has(l.user_id) && s && Math.hypot(s.x - input.x, s.z - input.z) <= NEAR_TILES;
      })
      .map((l) => l.user_id)
      .slice(0, 60);
    await notifyMany(db, near, "event", nearBody);
  }
  const friendBody = soon ? `Your friend ${name} is hosting "${title}"${where}, starting now!${ticket}` : `Your friend ${name} is hosting "${title}"${where}. Tap Events and say you're going.${ticket}`;
  await notifyMany(db, friends.slice(0, 500), "event", friendBody);
  await pushToMany([...friends.slice(0, 500), ...near]);
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
  // Everyone going, and everyone who came in: they're told (and paid back) by event_cancel.
  const { data: going } = await db.from("hosted_event_guests").select("user_id").eq("event_id", Math.round(n(id))).or("going.eq.true,entered_at.not.is.null").neq("user_id", userId).limit(10_000);
  const { error } = await db.rpc("event_cancel", { p_user: userId, p_id: Math.round(n(id)) });
  if (error) return say(error.message);
  // Their phones are tapped after the host has their answer.
  after(() => pushToMany(((going ?? []) as { user_id: string }[]).map((g) => g.user_id)));
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
