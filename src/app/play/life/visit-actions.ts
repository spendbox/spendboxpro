"use server";

import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

// Visiting each other's homes (game-db/066_home_visits.sql): knock, and the people who live
// there let you in (or not). Friends walk straight in, and so does everyone during a party.
// A guest book for the visitors.

type Db = ReturnType<typeof createAdminClient>;
type Fail = { ok: false; error: string };

const BUILDING_RE = /^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$/;
/** Let in lasts this long (come and go without knocking again). */
const LET_IN_MS = 45 * 60_000;
/** A knock waits this long for an answer. */
const KNOCK_MS = 5 * 60_000;
const PARTY_MS = 2 * 3_600_000;

const missing = (msg?: string) => /home_knocks|home_guestbook|home_parties/.test(msg ?? "");

async function nameOf(db: Db, id: string) {
  const { data } = await db.from("profiles").select("username").eq("id", id).maybeSingle();
  return (data?.username as string | null) ?? "Someone";
}

/** Who lives in a building (their homes are units in it), not counting you. */
async function residents(db: Db, building: string, me: string | null) {
  const { data } = await db.from("lives").select("user_id, home_unit").like("home_unit", `${building}/%`).limit(20);
  const all = ((data ?? []) as { user_id: string; home_unit: string }[]).filter((r) => r.home_unit.startsWith(`${building}/`));
  return { all, mine: !!me && all.some((r) => r.user_id === me), others: all.filter((r) => r.user_id !== me) };
}

export type Door =
  | { open: true; party?: string | null }
  | { open: false; owner: string; ownerId: string; signedIn: boolean };

/** Going into a building: straight in, or a door to knock at (someone else's home). */
export async function homeDoor(building: string): Promise<Door> {
  if (typeof building !== "string" || !BUILDING_RE.test(building)) return { open: true };
  const db = createAdminClient();
  const me = await currentUserId().catch(() => null);
  const { mine, others } = await residents(db, building, me);
  if (mine || !others.length) return { open: true };
  const ids = others.map((r) => r.user_id);
  // A party on: everyone's welcome.
  const party = await db.from("home_parties").select("owner_id, title, until").in("owner_id", ids).gt("until", new Date().toISOString()).limit(1);
  if (party.error && missing(party.error.message)) return { open: true };
  if (party.data?.length) return { open: true, party: (party.data[0].title as string | null) ?? "A party" };
  if (me) {
    // Friends walk straight in.
    const { data: f } = await db
      .from("friendships")
      .select("requester")
      .not("accepted_at", "is", null)
      .or(ids.map((id) => `and(requester.eq.${me},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${me})`).join(","))
      .limit(1);
    if (f?.length) return { open: true };
    // Let in a little while ago.
    const { data: k } = await db.from("home_knocks").select("id").eq("visitor_id", me).in("owner_id", ids).eq("status", "in").gt("answered_at", new Date(Date.now() - LET_IN_MS).toISOString()).limit(1);
    if (k?.length) return { open: true };
  }
  return { open: false, owner: await nameOf(db, others[0].user_id), ownerId: others[0].user_id, signedIn: !!me };
}

/** Knock at a home's door: the people who live there are told (a notice, and a push). */
export async function knock(building: string): Promise<{ ok: true; ids: number[] } | Fail> {
  const me = await currentUserId();
  if (!me) return { ok: false, error: "Sign in to knock." };
  if (!BUILDING_RE.test(building)) return { ok: false, error: "There's no door there." };
  const db = createAdminClient();
  const { others } = await residents(db, building, me);
  if (!others.length) return { ok: false, error: "Nobody lives there." };
  // Not too often.
  const recent = await db.from("home_knocks").select("id").eq("visitor_id", me).gt("created_at", new Date(Date.now() - 30_000).toISOString()).limit(1);
  if (recent.error && missing(recent.error.message)) return { ok: false, error: "Knocking is switched on soon (the game's owner has one update to run)." };
  if (recent.data?.length) return { ok: false, error: "You just knocked. Give them a moment." };
  const name = await nameOf(db, me);
  const rows = others.slice(0, 4).map((r) => ({ owner_id: r.user_id, unit: r.home_unit, visitor_id: me, visitor_name: name.slice(0, 40) }));
  const { data, error } = await db.from("home_knocks").insert(rows).select("id");
  if (error) return { ok: false, error: "Couldn't knock. Try again." };
  for (const r of rows) {
    await db.rpc("notify", { p_user: r.owner_id, p_round: null, p_kind: "door", p_body: `${name} is at your door. Let them in?` });
    await pushTo(r.owner_id).catch(() => {});
  }
  return { ok: true, ids: (data ?? []).map((d) => Number(d.id)) };
}

/** How your knock went: let in, not now, or still waiting. */
export async function knockStatus(ids: number[]): Promise<"in" | "not_now" | "waiting" | "gone"> {
  const me = await currentUserId();
  if (!me || !Array.isArray(ids) || !ids.length) return "gone";
  const { data } = await createAdminClient().from("home_knocks").select("status, created_at").eq("visitor_id", me).in("id", ids.slice(0, 4).map(Number));
  const rows = (data ?? []) as { status: string; created_at: string }[];
  if (rows.some((r) => r.status === "in")) return "in";
  if (rows.length && rows.every((r) => r.status === "not_now")) return "not_now";
  if (rows.every((r) => Date.now() - Date.parse(r.created_at) > KNOCK_MS)) return "gone";
  return "waiting";
}

export type Knock = { id: number; name: string; at: string };

/** Who's at your door now. */
export async function myDoor(): Promise<Knock[]> {
  const me = await currentUserId().catch(() => null);
  if (!me) return [];
  const { data } = await createAdminClient()
    .from("home_knocks")
    .select("id, visitor_name, created_at")
    .eq("owner_id", me)
    .eq("status", "waiting")
    .gt("created_at", new Date(Date.now() - KNOCK_MS).toISOString())
    .order("id", { ascending: true })
    .limit(5);
  return ((data ?? []) as { id: number; visitor_name: string; created_at: string }[]).map((k) => ({ id: Number(k.id), name: k.visitor_name, at: k.created_at }));
}

/** Let them in, or not now. */
export async function answerKnock(id: number, letIn: boolean): Promise<{ ok: true } | Fail> {
  const me = await currentUserId();
  if (!me) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data: k } = await db.from("home_knocks").select("id, visitor_id, status").eq("id", Number(id)).eq("owner_id", me).maybeSingle();
  if (!k) return { ok: false, error: "They've gone." };
  await db.from("home_knocks").update({ status: letIn ? "in" : "not_now", answered_at: new Date().toISOString() }).eq("id", k.id);
  const name = await nameOf(db, me);
  await db.rpc("notify", { p_user: k.visitor_id, p_round: null, p_kind: "door", p_body: letIn ? `${name} let you in. Come on in!` : `${name} can't come to the door right now.` });
  await pushTo(k.visitor_id as string).catch(() => {});
  return { ok: true };
}

export type GuestLine = { id: number; name: string; body: string; atDoor: boolean; at: string };

/** Sign a home's guest book (or leave a note at the door). */
export async function signGuestBook(building: string, body: string, atDoor = false): Promise<{ ok: true } | Fail> {
  const me = await currentUserId();
  if (!me) return { ok: false, error: "Sign in to write in the guest book." };
  const text = String(body ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text) return { ok: false, error: "Write something first." };
  if (!BUILDING_RE.test(building)) return { ok: false, error: "There's no home there." };
  const db = createAdminClient();
  const { others } = await residents(db, building, me);
  if (!others.length) return { ok: false, error: "Nobody lives there." };
  const name = (await nameOf(db, me)).slice(0, 40);
  const { error } = await db.from("home_guestbook").insert(others.slice(0, 4).map((r) => ({ owner_id: r.user_id, author_id: me, author_name: name, body: text, at_door: atDoor })));
  if (error) return { ok: false, error: missing(error.message) ? "The guest book is switched on soon (the game's owner has one update to run)." : "Couldn't write it. Try again." };
  for (const r of others.slice(0, 4)) await db.rpc("notify", { p_user: r.user_id, p_round: null, p_kind: "door", p_body: atDoor ? `${name} left you a note at the door: “${text.slice(0, 80)}”` : `${name} signed your guest book: “${text.slice(0, 80)}”` });
  return { ok: true };
}

/** Your home's guest book, newest first. */
export async function myGuestBook(): Promise<GuestLine[]> {
  const me = await currentUserId().catch(() => null);
  if (!me) return [];
  const { data } = await createAdminClient().from("home_guestbook").select("id, author_name, body, at_door, created_at").eq("owner_id", me).order("id", { ascending: false }).limit(60);
  return ((data ?? []) as { id: number; author_name: string; body: string; at_door: boolean; created_at: string }[]).map((g) => ({ id: Number(g.id), name: g.author_name, body: g.body, atDoor: g.at_door, at: g.created_at }));
}

/** Throw a party: your home's open to everyone for two hours, and your friends are invited. */
export async function startParty(title?: string): Promise<{ ok: true; until: string } | Fail> {
  const me = await currentUserId();
  if (!me) return { ok: false, error: "Sign in to throw a party." };
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("home_unit").eq("user_id", me).maybeSingle();
  const unit = life?.home_unit as string | null;
  if (!unit) return { ok: false, error: "Find a home first, then throw a party in it." };
  const until = new Date(Date.now() + PARTY_MS).toISOString();
  const what = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  const { error } = await db.from("home_parties").upsert({ owner_id: me, unit, title: what, until });
  if (error) return { ok: false, error: missing(error.message) ? "Parties are switched on soon (the game's owner has one update to run)." : "Couldn't start the party. Try again." };
  const name = await nameOf(db, me);
  const { data: f } = await db.from("friendships").select("requester, addressee").not("accepted_at", "is", null).or(`requester.eq.${me},addressee.eq.${me}`).limit(60);
  for (const row of (f ?? []) as { requester: string; addressee: string }[]) {
    const friend = row.requester === me ? row.addressee : row.requester;
    await db.rpc("notify", { p_user: friend, p_round: null, p_kind: "party", p_body: `${name} is having a party at home${what ? `: ${what}` : ""}. Come round! (Meet friends, then Meet.)` });
    await pushTo(friend).catch(() => {});
  }
  return { ok: true, until };
}

export async function stopParty(): Promise<{ ok: true } | Fail> {
  const me = await currentUserId();
  if (!me) return { ok: false, error: "Please sign in again." };
  await createAdminClient().from("home_parties").delete().eq("owner_id", me);
  return { ok: true };
}

/** When your party ends (null: no party on). */
export async function myParty(): Promise<string | null> {
  const me = await currentUserId().catch(() => null);
  if (!me) return null;
  const { data } = await createAdminClient().from("home_parties").select("until").eq("owner_id", me).gt("until", new Date().toISOString()).maybeSingle();
  return (data?.until as string | null) ?? null;
}
