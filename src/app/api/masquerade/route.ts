import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import {
  MASQ_AGE_MAX,
  MASQ_AGE_MIN,
  MASQ_DECIDE_SECONDS,
  MASQ_MINUTES,
  MASQ_MORE_MINUTES,
  MASQ_PER_DAY,
  MASQ_SAY_MAX,
  masqBlocked,
  masqQuestion,
  masqSpiceOf,
  type MasqMode,
  type MasqQuestion,
  type MasqSpice,
  type MasqWant,
} from "@/lib/masquerade";

// Masquerade (docs/MASQUERADE.md, game-db/131). Nobody learns who the other one is from here until
// both unmask: a masquerade is told as "a" and "b", with the other's area and nothing else.
//
// GET                 how many are masked now, how many you've had today, your live one (if any)
// GET ?id=            one of yours: how it's going, and what's been said
// POST {action: "join", mode, want, ageMin, ageMax, spice, region, x, z}
//                                             put on your mask (call every few seconds while waiting)
// POST {action: "cancel"}                     take it off the waiting list
// POST {action: "choose", id, choice}         unmask / more / pass / left
// POST {action: "say", id, text}              a message (kept for reports)
// POST {action: "next", id}                   another question
// POST {action: "report", id, note}           report them (it ends there, and you're never matched again)
// POST {action: "open", on, mode, want, ageMin, ageMax, spice, region, x, z}
//                                             Open to Masquerade on (again once a minute) or off:
//                                             your live channel, and anyone asking for you now
// POST {action: "answer", invite, yes}        "A masked guest wants to talk": yes or not now
//
// Someone masks up and nobody fitting is waiting: the database asks someone Open to Masquerade
// (masq_invites), and the server tells their phone at once on its own live channel
// (`masqopen:<token>`, the token told only to them) with what the pop-up shows: where, why and
// how spicy. No name, no face.

type Row = {
  id: number;
  a: string;
  b: string;
  mode: MasqMode;
  secret: string;
  a_area: string | null;
  b_area: string | null;
  a_spice: number;
  b_spice: number;
  question: number;
  started_at: string;
  ends_at: string;
  extended: boolean;
  a_choice: string | null;
  b_choice: string | null;
  status: "live" | "unmasked" | "ended";
  ended_by: string | null;
  ended_why: "pass" | "left" | "timeout" | "reported" | null;
};

export type MasqView = {
  stage: "live" | "deciding" | "unmasked" | "ended";
  id: number;
  side: "a" | "b";
  /** The live channel only the two of you know. */
  channel: string;
  mode: MasqMode;
  question: MasqQuestion;
  questionN: number;
  endsAt: string;
  serverNow: string;
  decideSeconds: number;
  theirArea: string | null;
  /** How spicy each of you asked for; the questions follow the average. */
  mySpice: MasqSpice;
  theirSpice: MasqSpice;
  spice: MasqSpice;
  extended: boolean;
  /** Your choice so far, and whether they've chosen (not what). */
  mine: string | null;
  theyChose: boolean;
  /** Ended: why, and whether it was you. A "pass" never says who. */
  why: Row["ended_why"];
  byMe: boolean;
  /** Only once you've both unmasked. */
  other: { id: string; name: string; avatar: unknown } | null;
  said: { side: "a" | "b"; text: string; at: string }[];
};
/** The pop-up: "A masked guest wants to talk". */
export type MasqInvite = { id: number; area: string | null; mode: MasqMode; spice: MasqSpice; seconds: number };
export type MasqIdle = {
  masked: number;
  today: number;
  perDay: number;
  datingOpen: boolean;
  /** Whether you've said you're a man or a woman (people asking for men or women only meet those who have). */
  gender: "male" | "female" | null;
  live: number | null;
  off?: boolean;
};

const ERRORS: Record<string, string> = {
  too_many: `That's ${MASQ_PER_DAY} masquerades today. Come back tomorrow!`,
  dating_off: "Dating and spicy link-ups are for people open to dating. Switch it on first (Dating, in the menu), or come for friends.",
  not_yet: "Wait for the time to run out first.",
  too_fast: "Slow down a little.",
  gone: "That masquerade is over.",
  missed: "Too late: they found someone else. You'll be asked again.",
  off: "Masquerade is switched on soon.",
};
const fail = (code: string) => NextResponse.json({ ok: false, error: ERRORS[code] ?? "That didn't work. Try again." });
/** The database's reason (too_many...), or "off" while part 131 isn't run yet. */
const codeOf = (msg: string) => {
  const code = msg.split(":")[0].trim();
  return code in ERRORS ? code : /masq_|does not exist/.test(msg) ? "off" : code;
};

const db = () => createAdminClient();

const prefsOf = (body: Record<string, unknown> | null) => ({
  mode: (body?.mode === "dating" || body?.mode === "linkup" ? body.mode : "friends") as MasqMode,
  want: (["men", "women", "anyone"].includes(String(body?.want)) ? body?.want : "anyone") as MasqWant,
  ageMin: Math.max(MASQ_AGE_MIN, Math.min(MASQ_AGE_MAX, Math.round(Number(body?.ageMin) || MASQ_AGE_MIN))),
  ageMax: Math.max(MASQ_AGE_MIN, Math.min(MASQ_AGE_MAX, Math.round(Number(body?.ageMax) || MASQ_AGE_MAX))),
  spice: Math.max(0, Math.min(3, Math.round(Number(body?.spice) || 0))),
});

type InviteRow = { id: number; to_user: string; mode: MasqMode; from_area: string | null; from_spice: number; expires_at: string };
const inviteOf = (i: InviteRow): MasqInvite => ({
  id: Number(i.id),
  area: i.from_area,
  mode: i.mode,
  spice: Math.max(0, Math.min(3, Math.round(i.from_spice ?? 1))) as MasqSpice,
  seconds: Math.max(0, Math.round((Date.parse(i.expires_at) - Date.now()) / 1000)),
});

/** Someone's just been asked for you: tell their phone now (once). */
async function tellAsked(fromUser: string) {
  const { data } = await db()
    .from("masq_invites")
    .update({ told: true })
    .eq("from_user", fromUser)
    .eq("status", "asking")
    .eq("told", false)
    .select("id, to_user, mode, from_area, from_spice, expires_at");
  for (const i of (data ?? []) as InviteRow[]) {
    const { data: open } = await db().from("masq_open").select("token").eq("user_id", i.to_user).maybeSingle();
    if (!open?.token) continue;
    const sb = db();
    const ch = sb.channel(`masqopen:${open.token}`);
    try {
      await ch.httpSend("asked", inviteOf(i));
    } catch (e) {
      // Their phone looks again within a minute anyway.
      console.error("Masquerade invite not sent", e instanceof Error ? e.message : e);
    } finally {
      void sb.removeChannel(ch);
    }
  }
}

async function viewOf(r: Row, userId: string): Promise<MasqView> {
  const side = r.a === userId ? "a" : "b";
  const now = Date.now();
  const ends = Date.parse(r.ends_at);
  let stage: MasqView["stage"] = r.status === "live" ? (now < ends ? "live" : "deciding") : r.status;
  if (stage === "deciding" && now > ends + MASQ_DECIDE_SECONDS * 1000) stage = "ended";
  const otherId = side === "a" ? r.b : r.a;
  let other: MasqView["other"] = null;
  if (stage === "unmasked") {
    const { data } = await db().from("profiles").select("id, username, avatar").eq("id", otherId).maybeSingle();
    if (data) other = { id: String(data.id), name: String(data.username ?? "Someone"), avatar: data.avatar ?? null };
  }
  const spiceA = Math.max(0, Math.min(3, Math.round(r.a_spice ?? 1))) as MasqSpice;
  const spiceB = Math.max(0, Math.min(3, Math.round(r.b_spice ?? 1))) as MasqSpice;
  const spice = masqSpiceOf(spiceA, spiceB);
  const { data: msgs } = await db().from("masq_messages").select("side, body, created_at").eq("session_id", r.id).order("id", { ascending: true }).limit(80);
  return {
    stage,
    id: r.id,
    side,
    channel: `masq:${r.id}:${r.secret}`,
    mode: r.mode,
    question: masqQuestion(r.id, r.question, spice),
    questionN: r.question,
    endsAt: r.ends_at,
    serverNow: new Date(now).toISOString(),
    decideSeconds: MASQ_DECIDE_SECONDS,
    theirArea: side === "a" ? r.b_area : r.a_area,
    mySpice: side === "a" ? spiceA : spiceB,
    theirSpice: side === "a" ? spiceB : spiceA,
    spice,
    extended: r.extended,
    mine: side === "a" ? r.a_choice : r.b_choice,
    theyChose: !!(side === "a" ? r.b_choice : r.a_choice),
    why: stage === "ended" ? (r.ended_why ?? "timeout") : null,
    byMe: r.ended_by === userId,
    other,
    said: (msgs ?? []).map((m) => ({ side: m.side === "a" ? "a" : "b", text: String(m.body), at: String(m.created_at) })),
  };
}

async function sessionOf(id: number, userId: string): Promise<Row | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { data } = await db().from("masq_sessions").select("*").eq("id", id).or(`a.eq.${userId},b.eq.${userId}`).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  // Now and then, not on every look: masquerades nobody decided on end by themselves.
  if (Math.random() < 0.2) await db().rpc("masq_expire", { p_decide: MASQ_DECIDE_SECONDS });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (id) {
    const r = await sessionOf(id, userId);
    return NextResponse.json({ view: r ? await viewOf(r, userId) : null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const fresh = new Date(Date.now() - 2 * 60_000).toISOString();
  const recent = new Date(Date.now() - (MASQ_MINUTES + MASQ_MORE_MINUTES + 2) * 60_000).toISOString();
  const [queued, live, today, me, mine] = await Promise.all([
    db().from("masq_queue").select("user_id", { count: "exact", head: true }).gte("seen_at", fresh),
    db().from("masq_sessions").select("id", { count: "exact", head: true }).eq("status", "live").gte("started_at", recent),
    db().from("masq_sessions").select("id", { count: "exact", head: true }).or(`a.eq.${userId},b.eq.${userId}`).gte("started_at", dayAgo),
    db().from("profiles").select("dating_open, gender").eq("id", userId).maybeSingle(),
    db().from("masq_sessions").select("id").or(`a.eq.${userId},b.eq.${userId}`).eq("status", "live").gte("started_at", recent).order("id", { ascending: false }).limit(1),
  ]);
  const idle: MasqIdle = {
    masked: (queued.count ?? 0) + 2 * (live.count ?? 0),
    today: today.count ?? 0,
    perDay: MASQ_PER_DAY,
    datingOpen: !!me.data?.dating_open,
    gender: me.data?.gender === "male" || me.data?.gender === "female" ? me.data.gender : null,
    live: mine.data?.[0]?.id ? Number(mine.data[0].id) : null,
    off: !!queued.error && /masq_/.test(queued.error.message),
  };
  return NextResponse.json(idle, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  const id = Number(body?.id);

  if (action === "join" || (action === "open" && body?.on)) {
    const p = prefsOf(body);
    const region = String(body?.region ?? "lagos");
    const map = regionMap(region);
    if (!map) return fail("bad_region");
    const x = Math.round(Number(body?.x) || 0);
    const z = Math.round(Number(body?.z) || 0);
    const area = map.areaAt(x, z) || null;
    if (action === "open") {
      const { data: token, error } = await db().rpc("masq_set_open", {
        p_user: userId,
        p_on: true,
        p_region: region,
        p_mode: p.mode,
        p_x: x,
        p_z: z,
        p_area: area,
        p_want: p.want,
        p_age_min: p.ageMin,
        p_age_max: p.ageMax,
        p_spice: p.spice,
        p_token: randomBytes(12).toString("base64url"),
      });
      if (error) return fail(codeOf(error.message));
      const { data: asking } = await db()
        .from("masq_invites")
        .select("id, to_user, mode, from_area, from_spice, expires_at")
        .eq("to_user", userId)
        .eq("status", "asking")
        .gt("expires_at", new Date().toISOString())
        .order("id", { ascending: false })
        .limit(1);
      const i = (asking?.[0] as InviteRow | undefined) ?? null;
      return NextResponse.json({ ok: true, channel: `masqopen:${token}`, invite: i ? inviteOf(i) : null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const { data, error } = await db().rpc("masq_join", {
      p_user: userId,
      p_region: region,
      p_mode: p.mode,
      p_x: x,
      p_z: z,
      p_area: area,
      p_secret: randomBytes(12).toString("base64url"),
      p_minutes: MASQ_MINUTES,
      p_per_day: MASQ_PER_DAY,
      p_want: p.want,
      p_age_min: p.ageMin,
      p_age_max: p.ageMax,
      p_spice: p.spice,
    });
    if (error) return fail(codeOf(error.message));
    if (!data) {
      await tellAsked(userId);
      return NextResponse.json({ ok: true, waiting: true });
    }
    const r = await sessionOf(Number(data), userId);
    return NextResponse.json({ ok: true, view: r ? await viewOf(r, userId) : null });
  }
  if (action === "open") {
    await db().rpc("masq_set_open", {
      p_user: userId,
      p_on: false,
      p_region: "",
      p_mode: "friends",
      p_x: 0,
      p_z: 0,
      p_area: null,
      p_want: "anyone",
      p_age_min: MASQ_AGE_MIN,
      p_age_max: MASQ_AGE_MAX,
      p_spice: 1,
      p_token: "",
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "answer") {
    const yes = body?.yes === true;
    const { data, error } = await db().rpc("masq_answer", {
      p_user: userId,
      p_invite: Math.round(Number(body?.invite) || 0),
      p_yes: yes,
      p_secret: randomBytes(12).toString("base64url"),
      p_minutes: MASQ_MINUTES,
      p_per_day: MASQ_PER_DAY,
    });
    if (error) return fail(codeOf(error.message));
    return NextResponse.json({ ok: true, id: data ? Number(data) : null });
  }
  if (action === "cancel") {
    await db().rpc("masq_cancel", { p_user: userId });
    return NextResponse.json({ ok: true });
  }

  const r = await sessionOf(id, userId);
  if (!r) return fail("gone");

  if (action === "choose") {
    const choice = String(body?.choice ?? "");
    if (!["unmask", "more", "pass", "left"].includes(choice)) return fail("bad_choice");
    const { error } = await db().rpc("masq_choose", { p_user: userId, p_session: r.id, p_choice: choice, p_more: MASQ_MORE_MINUTES });
    if (error) return fail(codeOf(error.message));
    const now = await sessionOf(r.id, userId);
    return NextResponse.json({ ok: true, view: now ? await viewOf(now, userId) : null });
  }
  if (action === "say") {
    const text = String(body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, MASQ_SAY_MAX);
    if (!text) return fail("empty");
    if (r.status !== "unmasked") {
      const why = masqBlocked(text);
      if (why) return NextResponse.json({ ok: false, error: why });
    }
    const { error } = await db().rpc("masq_say", { p_user: userId, p_session: r.id, p_body: text });
    if (error) return fail(codeOf(error.message));
    return NextResponse.json({ ok: true, text });
  }
  if (action === "next") {
    const { data, error } = await db().rpc("masq_next_question", { p_user: userId, p_session: r.id });
    if (error || data == null) return fail("gone");
    return NextResponse.json({ ok: true, n: Number(data), question: masqQuestion(r.id, Number(data), masqSpiceOf(r.a_spice ?? 1, r.b_spice ?? 1)) });
  }
  if (action === "report") {
    const side = r.a === userId ? "a" : "b";
    const otherId = side === "a" ? r.b : r.a;
    const { data: theirs } = await db().from("masq_messages").select("body").eq("session_id", r.id).neq("side", side).order("id", { ascending: false }).limit(8);
    const note = [String(body?.note ?? "").trim(), ...(theirs ?? []).reverse().map((m) => `"${m.body}"`)].filter(Boolean).join(" | ").slice(0, 300);
    await db().rpc("masq_choose", { p_user: userId, p_session: r.id, p_choice: "reported", p_more: MASQ_MORE_MINUTES });
    const { error } = await db().rpc("person_report", {
      p_user: userId,
      p_about_user: otherId,
      p_about_npc: null,
      p_name: "Masked guest",
      p_kind: "abuse",
      p_note: note || "Reported in a masquerade",
      p_place: `Masquerade #${r.id}`,
    });
    if (error && !/already/.test(error.message)) console.error("Masquerade report failed", error.message);
    return NextResponse.json({ ok: true });
  }
  return fail("bad_action");
}
