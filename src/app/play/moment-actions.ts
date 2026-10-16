"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { seasonsAt } from "@/lib/world/calendar";
import { CAST_BY_ID } from "@/lib/world/cast";
import { applyChange, inCrisis, readyToGrow } from "@/lib/world/ventures";
import { STORY_OPENS, bondWith, dueLink, findPartner, giveInStory, openLink, sendLink, storyOpenOf, type StoryOpen } from "./stories-server";
import { openVenture, settleVenture, stageScale, type VentureRow } from "./ventures-server";
import { writtenMoments } from "./written-server";
import { BADGE_DELAY_HOURS, LIFE_BADGES, LIFE_BADGE_BY_ID, fameWord, lifeFacts, type LivedMoment } from "@/lib/world/standing";
import { regionMap } from "@/lib/world";
import { COMMUTES, type Commute } from "@/lib/world/work";
import {
  EFFECTS,
  EFFECT_IDS,
  MOMENT_BY_ID,
  MOMENT_RULES,
  ROAD_RULES,
  characterOf,
  characterWords,
  choiceOrder,
  choiceTraits,
  fillMoment,
  isDayInLagos,
  momentVars,
  niceNaira,
  pickMoment,
  rollOutcome,
  type Bond,
  type CastWorld,
  type EffectId,
  type Fit,
  type MomentDef,
  type MomentSpot,
  type MomentVars,
  type TraitAnswer,
  type VentureState,
} from "@/lib/world/moments";

// Moments (docs/MOMENTS.md, game-db/109_moments.sql): the game picks one that fits where you are
// and fills it in; when you answer, it rolls what happens (never the phone) and the database
// settles the money and reputation, within the day's limits.

const SPOTS: MomentSpot[] = ["street", "home", "food", "night", "sport", "shop", "worship", "outdoors", "work", "road"];
const n = (v: unknown) => Number(v) || 0;

/** A moment to show: its id, which story, what's filled in, and how much you can spend (mint). */
export type MomentShown = {
  id: number;
  moment: string;
  vars: MomentVars & { seed: number };
  perMint: number;
  canSpend: number;
  /** A player-written moment (docs/LIFE_WHEEL.md, phase 7): the phone doesn't have it, so it comes along. */
  def?: MomentDef;
};

/** What's on someone now (game-db/112; none before it's run): each effect, who it's about, and until when. */
async function effectsOf(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await db.from("life_effects").select("effect, who, until").eq("user_id", userId).gt("until", new Date().toISOString()).order("until", { ascending: false }).limit(20);
  if (error) return [];
  return (data ?? []).filter((e) => EFFECT_IDS.includes(e.effect as EffectId)).map((e) => ({ effect: e.effect as EffectId, who: e.who ? String(e.who) : null, until: String(e.until) }));
}

/** The answers someone gave that carry who they are (game-db/111), the last year's. */
async function answersOf(db: ReturnType<typeof createAdminClient>, userId: string): Promise<TraitAnswer[]> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { data, error } = await db.from("moments").select("traits, answered_at").eq("user_id", userId).not("traits", "is", null).gte("answered_at", since).order("answered_at", { ascending: false }).limit(1000);
  if (error) return [];
  return (data ?? []).map((r) => ({ traits: (r.traits ?? {}) as TraitAnswer["traits"], at: Date.parse(String(r.answered_at)) }));
}

/** Where someone is with the cast (game-db/113; null before it's run, and then no character's story comes). */
async function bondsOf(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await db.from("cast_bonds").select("who, step, feeling, last_at").eq("user_id", userId);
  if (error) return null;
  const out: Record<string, Bond> = {};
  for (const b of data ?? []) out[String(b.who)] = { step: n(b.step), feeling: n(b.feeling), last: Date.parse(String(b.last_at)) };
  return out;
}

/** How much the whole city has helped and hurt each character. */
async function castWorld(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from("cast_world").select("who, good, bad");
  const out: Record<string, CastWorld> = {};
  for (const w of data ?? []) out[String(w.who)] = { good: n(w.good), bad: n(w.bad) };
  return out;
}

/** The badges someone has that show (game-db/114): earned, shown up by now, not faded. */
async function badgesOf(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await db.from("life_badges").select("badge").eq("user_id", userId).is("faded_at", null).lte("visible_at", new Date().toISOString());
  return error ? [] : (data ?? []).map((b) => String(b.badge));
}

/** Rich: this much in your wallet (naira). */
const RICH = 20_000_000;

/** What kind of person someone is now, for moments meant for people like them (docs/LIFE_WHEEL.md, phase 7). */
async function fitsOf(db: ReturnType<typeof createAdminClient>, userId: string, perMint: number): Promise<Fit[]> {
  const [{ data: p }, standing, car, answers] = await Promise.all([
    db.from("profiles").select("coins, created_at").eq("id", userId).maybeSingle(),
    db.from("life_standing").select("fame").eq("user_id", userId).maybeSingle(),
    db.from("items").select("id").eq("owner", userId).eq("category", "car").limit(1),
    answersOf(db, userId),
  ]);
  const out: Fit[] = [];
  if (n(p?.coins) * perMint >= RICH) out.push("rich");
  if (!standing.error && n(standing.data?.fame) >= 60) out.push("famous");
  if (characterOf(answers).giving <= -40) out.push("stingy");
  if (!car.error && (car.data ?? []).length > 0) out.push("car");
  if (p?.created_at && Date.now() - Date.parse(String(p.created_at)) < 7 * 86_400_000) out.push("newcomer");
  return out;
}

/** How long between business moments (two or three a week), and in a crisis. */
const BUSINESS_EVERY_H = 56;
const CRISIS_EVERY_H = 12;

/** Someone's business, its days counted, as moment picking needs it (undefined before game-db/115). */
async function businessOf(db: ReturnType<typeof createAdminClient>, userId: string, perMint: number): Promise<{ row: VentureRow | null; state: VentureState | undefined }> {
  const found = await openVenture(db, userId);
  if (found.missing) return { row: null, state: undefined };
  if (!found.row) return { row: null, state: { open: false, stage: 0, crisis: false, grow: false, due: false } };
  const s = await settleVenture(db, userId, perMint, found.row);
  if (!s.row) return { row: null, state: { open: false, stage: 0, crisis: false, grow: false, due: false } };
  const v = s.row.venture;
  const crisis = inCrisis(v);
  const since = (Date.now() - Date.parse(s.row.lastMomentAt)) / 3_600_000;
  return { row: s.row, state: { open: true, stage: v.stage, crisis, grow: readyToGrow(v), due: since >= (crisis ? CRISIS_EVERY_H : BUSINESS_EVERY_H) } };
}

/** How often at most standing and badges are worked out again for someone (ms), unless asked. */
const STANDING_EVERY = 5 * 60_000;

/**
 * Work out someone's Trust, Fame and Legacy and their badges again (docs/LIFE_WHEEL.md, phase 4):
 * new badges are kept to show up quietly later; character badges fade if they no longer fit, and
 * come back if they do again. Legacy never goes down. Null before game-db/114 is run.
 */
async function refreshStanding(db: ReturnType<typeof createAdminClient>, userId: string, force = false) {
  const { data: was, error } = await db.from("life_standing").select("trust, fame, legacy, updated_at").eq("user_id", userId).maybeSingle();
  if (error) return null;
  if (was && !force && Date.now() - Date.parse(String(was.updated_at)) < STANDING_EVERY) return { trust: n(was.trust), fame: n(was.fame), legacy: n(was.legacy) };
  const [rowsRes, bondsRes, badgesRes, venturesRes, linksRes, alliesRes] = await Promise.all([
    db.from("moments").select("moment, choice, answered_at, traits, outcome, marks, from_id").eq("user_id", userId).gte("choice", 0).order("answered_at", { ascending: false }).limit(2000),
    db.from("cast_bonds").select("who, step, feeling").eq("user_id", userId),
    db.from("life_badges").select("badge, faded_at").eq("user_id", userId),
    db.from("ventures").select("state, started_at, closed_at").eq("user_id", userId),
    // Parts of other players' stories you've been in.
    db.from("story_links").select("from_user").eq("to_user", userId).limit(2000),
    db.from("player_bonds").select("feeling").eq("user_id", userId).gte("feeling", 5),
  ]);
  if (rowsRes.error) return null;
  const lived: LivedMoment[] = (rowsRes.data ?? []).map((r) => {
    const o = (r.outcome ?? {}) as { cash?: number; rep?: number };
    return {
      moment: String(r.moment),
      choice: n(r.choice),
      at: Date.parse(String(r.answered_at)),
      traits: (r.traits ?? null) as LivedMoment["traits"],
      cash: n(o.cash),
      rep: n(o.rep),
      marks: (r.marks ?? null) as LivedMoment["marks"],
      followed: !!r.from_id,
    };
  });
  const bonds = bondsRes.error ? [] : (bondsRes.data ?? []).map((b) => ({ who: String(b.who), step: n(b.step), feeling: n(b.feeling) }));
  const ventures = venturesRes.error
    ? []
    : (venturesRes.data ?? []).map((v) => {
        const st = (v.state ?? {}) as { best?: number; staff?: number; paid?: number };
        return { best: n(st.best), staff: n(st.staff), paid: n(st.paid), startedAt: Date.parse(String(v.started_at)), closed: !!v.closed_at };
      });
  const links = linksRes.error ? [] : (linksRes.data ?? []);
  const others = { links: links.length, people: new Set(links.map((l) => String(l.from_user))).size, stood: lived.filter((x) => x.marks?.stood).length, allies: alliesRes.error ? 0 : (alliesRes.data ?? []).length };
  const facts = lifeFacts(lived, bonds, Date.now(), ventures, others);
  const had = new Map((badgesRes.data ?? []).map((b) => [String(b.badge), b.faded_at as string | null]));
  const now = Date.now();
  for (const b of LIFE_BADGES) {
    const earned = b.earned(facts);
    if (earned && !had.has(b.id)) {
      const hours = BADGE_DELAY_HOURS[0] + Math.random() * (BADGE_DELAY_HOURS[1] - BADGE_DELAY_HOURS[0]);
      await db.from("life_badges").insert({ user_id: userId, badge: b.id, visible_at: new Date(now + hours * 3_600_000).toISOString() });
    } else if (earned && had.get(b.id)) {
      await db.from("life_badges").update({ faded_at: null }).eq("user_id", userId).eq("badge", b.id);
    } else if (!earned && b.fades && had.has(b.id) && !had.get(b.id)) {
      await db.from("life_badges").update({ faded_at: new Date(now).toISOString() }).eq("user_id", userId).eq("badge", b.id);
    }
  }
  // Badges count towards Legacy too.
  const legacy = Math.max(n(was?.legacy), facts.legacy + 10 * [...had.keys()].length);
  await db.from("life_standing").upsert({ user_id: userId, trust: facts.trust, fame: facts.fame, legacy, updated_at: new Date(now).toISOString() });
  return { trust: facts.trust, fame: facts.fame, legacy };
}

async function me() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region").eq("user_id", userId).maybeSingle();
  if (!life) return null;
  const region = String(life.region ?? "lagos");
  const perMint = regionMap(region)?.region.prices.perMint ?? 1500;
  return { userId, db, perMint, region };
}

/**
 * The next moment, if it's time for one (null: not now). On the road (the trip film, docs/TRIPS.md),
 * `ride`: how you're going; they can come closer together there, and nothing from before comes back.
 */
export async function momentNext(input: { spot: MomentSpot; place?: string; area?: string; ride?: Commute }): Promise<MomentShown | null> {
  const m = await me().catch(() => null);
  if (!m) return null;
  const spot: MomentSpot = SPOTS.includes(input?.spot) ? input.spot : "street";
  const ride = COMMUTES.includes(input?.ride as Commute) ? input.ride : undefined;
  const road = spot === "road";
  if (road && !ride) return null;
  const gap = road ? ROAD_RULES.gapSeconds : MOMENT_RULES.gapSeconds;
  const place = typeof input?.place === "string" ? input.place.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const area = typeof input?.area === "string" ? input.area.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const [{ data: prof }, recentRes, dueRes, spendRes, effects, bonds, world, badges, business, fits, written] = await Promise.all([
    m.db.from("profiles").select("level, frozen").eq("id", m.userId).maybeSingle(),
    // Every one you've had lately (up to 500): the last 25 don't come again, ones never had come first.
    m.db.from("moments").select("moment, created_at").eq("user_id", m.userId).order("created_at", { ascending: false }).limit(500),
    m.db.from("moment_followups").select("id, moment, vars").eq("user_id", m.userId).lte("due_at", new Date().toISOString()).order("due_at").limit(1),
    m.db.rpc("life_can_spend", { p_user: m.userId, p_pots: ["fun"] }),
    effectsOf(m.db, m.userId),
    bondsOf(m.db, m.userId),
    castWorld(m.db),
    badgesOf(m.db, m.userId),
    businessOf(m.db, m.userId, m.perMint).catch(() => ({ row: null, state: undefined })),
    fitsOf(m.db, m.userId, m.perMint).catch(() => [] as Fit[]),
    // Written by players and approved (game-db/117).
    writtenMoments(m.db).catch(() => [] as MomentDef[]),
  ]);
  // Part 109 not run yet: no moments.
  if (recentRes.error) return null;
  if (prof?.frozen) return null;
  const last = recentRes.data?.[0]?.created_at as string | undefined;
  if (last && Date.now() - Date.parse(last) < gap * 1000) return null;
  const level = Math.max(1, n(prof?.level));
  const seed = Math.floor(Math.random() * 2 ** 31);
  // Something coming back from before comes first.
  // The next part of another player's story comes first of all (game-db/116), then your own follow-ups.
  const link = road ? null : await dueLink(m.db, m.userId).catch(() => null);
  const linked = link ? MOMENT_BY_ID.get(link.moment) : undefined;
  const due = road || linked ? undefined : dueRes.data?.[0];
  const followed = due ? MOMENT_BY_ID.get(String(due.moment)) : undefined;
  // Someone who could be in your story, if a new one is to start.
  const partner = linked || followed ? null : await findPartner(m.db, m.userId, m.region).catch(() => null);
  const had = recentRes.data ?? [];
  const bigSince = Date.now() - MOMENT_RULES.bigEveryDays * 86_400_000;
  const bigOk = !had.some((r) => (MOMENT_BY_ID.get(String(r.moment))?.size ?? "small") !== "small" && Date.parse(String(r.created_at)) > bigSince);
  const def =
    linked ??
    followed ??
    pickMoment({
      spot,
      day: isDayInLagos(),
      level,
      recent: had.slice(0, 25).map((r) => String(r.moment)),
      seen: new Set(had.map((r) => String(r.moment))),
      bigOk,
      effects: effects.map((e) => e.effect),
      bonds: bonds ?? undefined,
      castWorld: world,
      badges,
      business: business.state,
      partner: !!partner,
      seasons: seasonsAt(Date.now(), m.region),
      area,
      fits,
      extra: written,
      rand: Math.random,
      ride,
    });
  if (!def) return null;
  const vars = momentVars(def, seed, level, place);
  // A follow-up keeps the name from before.
  const kept = (due?.vars ?? {}) as Partial<MomentVars>;
  if (followed && typeof kept.name === "string") vars.name = kept.name;
  // Someone from the cast is themselves.
  const who = def.cast ? CAST_BY_ID.get(def.cast) : undefined;
  if (who) vars.name = who.name;
  // A business's problems grow with it.
  if (def.venture && !def.venture.none && business.row) vars.ask = niceNaira(vars.ask * stageScale(business.row.venture.stage));
  // Another player in it: them by name, and who they are (for what you choose to reach them).
  let other: string | null = null;
  if (linked && link) {
    vars.name = link.fromName;
    if (n(link.vars.ask) > 0) vars.ask = n(link.vars.ask);
    other = link.from;
  } else if (def.player?.start && partner) {
    vars.name = partner.name;
    other = partner.id;
  }
  const full = { ...vars, seed, ...(other ? { partner: other } : {}) };
  const { data: id, error } = await m.db.rpc("moment_open", {
    p_user: m.userId,
    p_moment: def.id,
    p_vars: full,
    p_spot: spot,
    p_gap: gap,
    p_per_day: road ? ROAD_RULES.perDay : MOMENT_RULES.perDay,
    p_follow: followed ? due!.id : null,
  });
  if (error || id == null) return null;
  if (linked && link) await openLink(m.db, link.id);
  return { id: n(id), moment: def.id, vars: full, perMint: m.perMint, canSpend: spendRes.error ? 0 : n(spendRes.data), ...(def.by ? { def } : {}) };
}

/** What came of your choice: which outcome, and the money (mint) and reputation that came of it. */
export type MomentResult =
  | {
      ok: true;
      outcome: number;
      cash: number;
      rep: number;
      effect: EffectId | null;
      cast: { who: string; feeling: number; bond: number } | null;
      /** Another player in it: their name and whether money you gave them went through (`note`: why not). */
      player: { name: string; gave: number; note: string | null } | null;
    }
  | { ok: false; error: string };

export async function momentAnswer(id: number, choice: number): Promise<MomentResult> {
  const m = await me().catch(() => null);
  if (!m) return { ok: false, error: "Sign in first." };
  const { data: row } = await m.db.from("moments").select("moment, vars, answered_at").eq("id", Math.round(n(id))).eq("user_id", m.userId).maybeSingle();
  if (!row || row.answered_at) return { ok: false, error: "That moment has passed." };
  if (String(row.moment).startsWith("w_")) await writtenMoments(m.db).catch(() => []);
  const def = MOMENT_BY_ID.get(String(row.moment));
  const vars = (row.vars ?? {}) as MomentVars & { seed?: number };
  const pick = Math.round(n(choice));
  // Only the answers that were shown can be chosen.
  const c = def && choiceOrder(def, n(vars.seed)).includes(pick) ? def.choices[pick] : undefined;
  if (!def || !c) return { ok: false, error: "That moment has passed." };
  // The same answer doesn't always turn out the same: who you are and what's on you shift it.
  const [answers, effects, biz] = await Promise.all([
    answersOf(m.db, m.userId),
    effectsOf(m.db, m.userId),
    def.venture && !def.venture.none ? openVenture(m.db, m.userId).catch(() => ({ row: null, missing: true })) : Promise.resolve({ row: null, missing: false }),
  ]);
  const outcome = rollOutcome(c, Math.random, {
    character: characterOf(answers),
    effects: effects.map((e) => e.effect),
    venture: biz.row ? { quality: biz.row.venture.quality } : undefined,
    tags: Array.isArray(vars.tags) ? vars.tags.map(String) : [],
  });
  const naira = ((outcome.get ?? 0) - (outcome.pay ?? 0)) * n(vars.ask);
  const mint = Math.round((naira / m.perMint) * 100) / 100;
  const text = fillMoment(
    outcome.text,
    { name: String(vars.name ?? ""), ask: n(vars.ask), place: String(vars.place ?? ""), parts: vars.parts },
    (v) => `₦${Math.round(v).toLocaleString("en-GB")}`,
  );
  const { data, error } = await m.db.rpc("moment_answer", {
    p_user: m.userId,
    p_id: Math.round(n(id)),
    p_choice: pick,
    p_text: text,
    p_cash: mint,
    // Nobody saw it: who you are moves, your reputation doesn't.
    p_rep: outcome.unseen ? 0 : (outcome.rep ?? 0),
    p_follow: outcome.follow ?? null,
    p_follow_vars: outcome.follow ? { name: vars.name, place: vars.place } : null,
    // Back some hours later: half a day to two days.
    p_follow_hours: outcome.follow ? 12 + Math.random() * 36 : null,
    p_answer_secs: MOMENT_RULES.answerSeconds,
    p_gain_day: MOMENT_RULES.gainPerDay / m.perMint,
    p_rep_day: MOMENT_RULES.repPerDay,
    p_rep_min: MOMENT_RULES.repMin,
    p_rep_max: MOMENT_RULES.repMax,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_enough")) return { ok: false, error: "You don't have that much on you right now." };
    if (msg.includes("too_late") || msg.includes("no_moment")) return { ok: false, error: "That moment has passed." };
    console.error("Moment answer", msg);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  // Who you are (docs/LIFE_WHEEL.md): how this answer nudges the six sliders. Quietly; before
  // game-db/111 is run there's nowhere to keep it, and nothing else depends on it yet.
  await m.db.from("moments").update({ traits: choiceTraits(c) }).eq("id", Math.round(n(id))).eq("user_id", m.userId).then(
    () => null,
    () => null,
  );
  // Something that stays on you for a while (game-db/112): a new one replaces the same one.
  let effect: EffectId | null = null;
  if (outcome.effect && EFFECTS[outcome.effect]) {
    const until = new Date(Date.now() + EFFECTS[outcome.effect].hours * 3_600_000).toISOString();
    const who = outcome.effect === "owed_favour" || outcome.effect === "in_debt" ? String(vars.name ?? "").slice(0, 40) || null : null;
    await m.db.from("life_effects").delete().eq("user_id", m.userId).eq("effect", outcome.effect).then(
      () => null,
      () => null,
    );
    const { error: fxError } = await m.db.from("life_effects").insert({ user_id: m.userId, effect: outcome.effect, who, moment_id: Math.round(n(id)), until });
    if (!fxError) effect = outcome.effect;
  }
  // A character's story moves on (game-db/113): how they feel about you, what comes next, and the city's count.
  let cast: { who: string; feeling: number; bond: number } | null = null;
  if (def.cast) {
    const { data: after, error: castError } = await m.db.rpc("cast_after", {
      p_user: m.userId,
      p_who: def.cast,
      p_bond: Math.round(outcome.bond ?? 0),
      p_next: outcome.next ?? (def.step ?? 0) + 1,
      p_world: outcome.world ?? null,
      p_memory: { moment: def.id, choice: pick, at: new Date().toISOString() },
    });
    if (!castError) cast = { who: def.cast, feeling: n((after as { feeling?: number } | null)?.feeling), bond: Math.round(outcome.bond ?? 0) };
  }
  // Your business (game-db/115): what you chose does to it; and its next moment is a few days off.
  if (biz.row) {
    const changed = outcome.biz ? applyChange(biz.row.venture, outcome.biz, n(vars.ask)) : { venture: biz.row.venture, closed: false };
    await m.db
      .rpc("venture_save", { p_user: m.userId, p_id: biz.row.id, p_was: biz.row.settledAt, p_state: changed.venture, p_pay: 0, p_settled: null, p_moment: true, p_close: changed.closed })
      .then(
        () => null,
        () => null,
      );
  }
  // Another player in it (game-db/116): money to them, how you feel about them, and the next part of the story, theirs now.
  let player: { name: string; gave: number; note: string | null } | null = null;
  const other = typeof (vars as { partner?: unknown }).partner === "string" ? String((vars as { partner?: string }).partner) : null;
  if (def.player && other) {
    let note: string | null = null;
    let gave = 0;
    if (outcome.give) {
      note = await giveInStory(m.db, m.userId, other, outcome.give * n(vars.ask), m.perMint).catch(() => "It didn't go through.");
      if (!note) gave = Math.max(1, Math.round((outcome.give * n(vars.ask)) / m.perMint));
    }
    await bondWith(m.db, m.userId, other, outcome.feel ?? 0).catch(() => 0);
    // Money that didn't go doesn't need paying back.
    if (outcome.link && !(outcome.give && note)) await sendLink(m.db, m.userId, other, outcome.link.send, n(vars.ask) * (outcome.link.ask ?? 1), outcome.link.hours).catch(() => false);
    player = { name: String(vars.name ?? ""), gave, note };
  }
  // What the game noted (game-db/114), then standing and badges worked out again now and then.
  const marks: Record<string, unknown> = { i: c.outcomes.indexOf(outcome) };
  if (outcome.trust != null) marks.trust = outcome.trust;
  if (outcome.unseen) marks.unseen = true;
  if (outcome.stood) marks.stood = true;
  if (outcome.effect) marks.effect = outcome.effect;
  await m.db.from("moments").update({ marks }).eq("id", Math.round(n(id))).eq("user_id", m.userId).then(
    () => null,
    () => null,
  );
  await refreshStanding(m.db, m.userId).catch(() => null);
  const d = (data ?? {}) as { cash?: number; rep?: number };
  return { ok: true, outcome: c.outcomes.indexOf(outcome), cash: n(d.cash), rep: n(d.rep), effect, cast, player };
}

/** One moment you lived, for the wheel: what it was, what you chose and what came of it. */
export type WheelMoment = {
  id: number;
  moment: string;
  at: string;
  vars: MomentVars & { seed?: number };
  /** The answer you chose (-1: you walked away). */
  choice: number;
  outcome: { text: string; cash: number; rep: number } | null;
  /** The moment it came from, when it's the next step of a story. */
  from: number | null;
  /** It started a story that's still going (its next step hasn't come yet). */
  going: boolean;
};
export type Wheel = {
  moments: WheelMoment[];
  /** How many you've lived in all. */
  total: number;
  /** Stories still going whose start isn't among `moments` (or from before game-db/112). */
  stories: { moment: string; name: string; from: number | null }[];
  effects: { effect: EffectId; who: string | null; until: string }[];
  /** People who know you: how they feel, whether your story together is still going, and when you last met. */
  people: { who: string; feeling: number; going: boolean; last: string }[];
  /** Who you're becoming, in words (empty: too soon to say). */
  words: string[];
  /** Trust (0 to 100), Fame (in words) and Legacy, and where your Legacy ranks (null before game-db/114). */
  standing: { trust: number; fame: number; fameWord: string; legacy: number; rank: number } | null;
  /** Your badges that have shown up: new ones you haven't seen, faded ones, and whether they're on your card. */
  badges: { id: string; isNew: boolean; faded: boolean; shown: boolean }[];
  /** The most legendary lives. */
  board: { name: string; legacy: number; me: boolean }[];
  /** Who can be in your story (null before game-db/116). */
  storyOpen: StoryOpen | null;
  /** Player-written moments you lived (the phone doesn't have them). */
  written: MomentDef[];
  /** Other players you've shared stories with: how you feel about them, how they feel about you, and how many stories. */
  players: { name: string; mine: number; theirs: number; together: number }[];
  region: string;
  perMint: number;
};

/** Your wheel (docs/LIFE_WHEEL.md): the moments you've lived (the last 120), the stories still going, what's on you, and who you're becoming. */
export async function myWheel(): Promise<Wheel | null> {
  const m = await me().catch(() => null);
  if (!m) return null;
  const standing = await refreshStanding(m.db, m.userId, true).catch(() => null);
  const writtenAll = await writtenMoments(m.db).catch(() => [] as MomentDef[]);
  const [storyOpen, myBondsRes] = await Promise.all([
    storyOpenOf(m.db, m.userId).catch(() => null),
    m.db.from("player_bonds").select("other, feeling, together").eq("user_id", m.userId).order("last_at", { ascending: false }).limit(30),
  ]);
  const others = myBondsRes.error ? [] : (myBondsRes.data ?? []);
  const [{ data: theirBonds }, { data: otherNames }] = others.length
    ? await Promise.all([
        m.db.from("player_bonds").select("user_id, feeling").eq("other", m.userId).in("user_id", others.map((o) => String(o.other))),
        m.db.from("profiles").select("id, username").in("id", others.map((o) => String(o.other))),
      ])
    : [{ data: [] }, { data: [] }];
  const theirOf = new Map((theirBonds ?? []).map((b) => [String(b.user_id), n(b.feeling)]));
  const otherName = new Map((otherNames ?? []).map((p) => [String(p.id), String(p.username ?? "Someone")]));
  const players = others.map((o) => ({ name: otherName.get(String(o.other)) ?? "Someone", mine: n(o.feeling), theirs: theirOf.get(String(o.other)) ?? 0, together: n(o.together) }));
  const nowIso = new Date().toISOString();
  const [rowsRes, countRes, dueRes, effects, answers, bondsRes, myBadges, boardRes, aboveRes] = await Promise.all([
    m.db.from("moments").select("*").eq("user_id", m.userId).not("answered_at", "is", null).gte("choice", 0).order("created_at", { ascending: false }).limit(120),
    m.db.from("moments").select("id", { count: "exact", head: true }).eq("user_id", m.userId).gte("choice", 0),
    m.db.from("moment_followups").select("*").eq("user_id", m.userId).order("due_at").limit(30),
    effectsOf(m.db, m.userId),
    answersOf(m.db, m.userId),
    m.db.from("cast_bonds").select("who, step, feeling, last_at").eq("user_id", m.userId).order("last_at", { ascending: false }),
    m.db.from("life_badges").select("badge, seen_at, faded_at, shown, visible_at").eq("user_id", m.userId).lte("visible_at", nowIso).order("visible_at", { ascending: false }),
    m.db.from("life_standing").select("legacy, user_id").order("legacy", { ascending: false }).limit(10),
    standing ? m.db.from("life_standing").select("user_id", { count: "exact", head: true }).gt("legacy", standing.legacy) : Promise.resolve({ count: 0 }),
  ]);
  // Part 109 not run yet: nothing to show.
  if (rowsRes.error) return null;
  const pending = dueRes.data ?? [];
  const startedFrom = new Set(pending.map((f) => n(f.from_id)).filter(Boolean));
  const moments: WheelMoment[] = (rowsRes.data ?? []).map((r) => {
    const o = (r.outcome ?? null) as { text?: string; cash?: number; rep?: number } | null;
    return {
      id: n(r.id),
      moment: String(r.moment),
      at: String(r.created_at),
      vars: (r.vars ?? {}) as WheelMoment["vars"],
      choice: n(r.choice),
      outcome: o ? { text: String(o.text ?? ""), cash: n(o.cash), rep: n(o.rep) } : null,
      from: r.from_id ? n(r.from_id) : null,
      going: startedFrom.has(n(r.id)),
    };
  });
  const shownIds = new Set(moments.map((x) => x.id));
  const stories = pending
    .filter((f) => !f.from_id || !shownIds.has(n(f.from_id)))
    .map((f) => ({ moment: String(f.moment), name: String((f.vars as { name?: string } | null)?.name ?? ""), from: f.from_id ? n(f.from_id) : null }));
  const people = (bondsRes.error ? [] : (bondsRes.data ?? []))
    .filter((b) => CAST_BY_ID.has(String(b.who)))
    .map((b) => ({ who: String(b.who), feeling: n(b.feeling), going: n(b.step) >= 0, last: String(b.last_at) }));
  const badges = (myBadges.error ? [] : (myBadges.data ?? []))
    .filter((b) => LIFE_BADGE_BY_ID.has(String(b.badge)))
    .map((b) => ({ id: String(b.badge), isNew: !b.seen_at, faded: !!b.faded_at, shown: !!b.shown }));
  // Seen now.
  if (badges.some((b) => b.isNew)) await m.db.from("life_badges").update({ seen_at: nowIso }).eq("user_id", m.userId).is("seen_at", null).lte("visible_at", nowIso);
  const top = boardRes.error ? [] : (boardRes.data ?? []);
  const { data: names } = top.length ? await m.db.from("profiles").select("id, username").in("id", top.map((b) => String(b.user_id))) : { data: [] };
  const nameOf = new Map((names ?? []).map((p) => [String(p.id), String(p.username ?? "Someone")]));
  const board = top.map((b) => ({ name: nameOf.get(String(b.user_id)) ?? "Someone", legacy: n(b.legacy), me: String(b.user_id) === m.userId }));
  return {
    moments,
    total: countRes.count ?? moments.length,
    stories,
    effects,
    people,
    words: characterWords(characterOf(answers)),
    standing: standing ? { ...standing, fameWord: fameWord(standing.fame), rank: n((aboveRes as { count?: number | null }).count) + 1 } : null,
    badges,
    board,
    storyOpen,
    written: writtenAll.filter((w) => moments.some((x) => x.moment === w.id)),
    players,
    region: m.region,
    perMint: m.perMint,
  };
}

/** Show one of your badges on your card, or hide it (they're private until you choose). */
export async function setBadgeShown(badge: string, shown: boolean): Promise<{ ok: boolean }> {
  const m = await me().catch(() => null);
  if (!m || !LIFE_BADGE_BY_ID.has(String(badge))) return { ok: false };
  const { error } = await m.db.from("life_badges").update({ shown: !!shown }).eq("user_id", m.userId).eq("badge", String(badge));
  return { ok: !error };
}

/** Who can be in your story: friends, anyone in your city who says so too, or nobody (docs/LIFE_WHEEL.md, phase 6). */
export async function setStoryOpen(open: StoryOpen): Promise<{ ok: boolean }> {
  const m = await me().catch(() => null);
  if (!m || !STORY_OPENS.includes(open)) return { ok: false };
  const { error } = await m.db.from("story_prefs").upsert({ user_id: m.userId, open, updated_at: new Date().toISOString() });
  return { ok: !error };
}
