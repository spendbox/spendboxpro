"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAST_BY_ID } from "@/lib/world/cast";
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
  isDayInLagos,
  momentVars,
  pickMoment,
  rollOutcome,
  type Bond,
  type CastWorld,
  type EffectId,
  type MomentSpot,
  type MomentVars,
  type TraitAnswer,
} from "@/lib/world/moments";

// Moments (docs/MOMENTS.md, game-db/109_moments.sql): the game picks one that fits where you are
// and fills it in; when you answer, it rolls what happens (never the phone) and the database
// settles the money and reputation, within the day's limits.

const SPOTS: MomentSpot[] = ["street", "home", "food", "night", "sport", "shop", "worship", "outdoors", "work", "road"];
const n = (v: unknown) => Number(v) || 0;

/** A moment to show: its id, which story, what's filled in, and how much you can spend (mint). */
export type MomentShown = { id: number; moment: string; vars: MomentVars & { seed: number }; perMint: number; canSpend: number };

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

async function me() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region").eq("user_id", userId).maybeSingle();
  if (!life) return null;
  const perMint = regionMap(String(life.region ?? "lagos"))?.region.prices.perMint ?? 1500;
  return { userId, db, perMint };
}

/**
 * The next moment, if it's time for one (null: not now). On the road (the trip film, docs/TRIPS.md),
 * `ride`: how you're going; they can come closer together there, and nothing from before comes back.
 */
export async function momentNext(input: { spot: MomentSpot; place?: string; ride?: Commute }): Promise<MomentShown | null> {
  const m = await me().catch(() => null);
  if (!m) return null;
  const spot: MomentSpot = SPOTS.includes(input?.spot) ? input.spot : "street";
  const ride = COMMUTES.includes(input?.ride as Commute) ? input.ride : undefined;
  const road = spot === "road";
  if (road && !ride) return null;
  const gap = road ? ROAD_RULES.gapSeconds : MOMENT_RULES.gapSeconds;
  const place = typeof input?.place === "string" ? input.place.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const [{ data: prof }, recentRes, dueRes, spendRes, effects, bonds, world] = await Promise.all([
    m.db.from("profiles").select("level, frozen").eq("id", m.userId).maybeSingle(),
    // Every one you've had lately (up to 500): the last 25 don't come again, ones never had come first.
    m.db.from("moments").select("moment, created_at").eq("user_id", m.userId).order("created_at", { ascending: false }).limit(500),
    m.db.from("moment_followups").select("id, moment, vars").eq("user_id", m.userId).lte("due_at", new Date().toISOString()).order("due_at").limit(1),
    m.db.rpc("life_can_spend", { p_user: m.userId, p_pots: ["fun"] }),
    effectsOf(m.db, m.userId),
    bondsOf(m.db, m.userId),
    castWorld(m.db),
  ]);
  // Part 109 not run yet: no moments.
  if (recentRes.error) return null;
  if (prof?.frozen) return null;
  const last = recentRes.data?.[0]?.created_at as string | undefined;
  if (last && Date.now() - Date.parse(last) < gap * 1000) return null;
  const level = Math.max(1, n(prof?.level));
  const seed = Math.floor(Math.random() * 2 ** 31);
  // Something coming back from before comes first.
  const due = road ? undefined : dueRes.data?.[0];
  const followed = due ? MOMENT_BY_ID.get(String(due.moment)) : undefined;
  const had = recentRes.data ?? [];
  const bigSince = Date.now() - MOMENT_RULES.bigEveryDays * 86_400_000;
  const bigOk = !had.some((r) => (MOMENT_BY_ID.get(String(r.moment))?.size ?? "small") !== "small" && Date.parse(String(r.created_at)) > bigSince);
  const def =
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
  const full = { ...vars, seed };
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
  return { id: n(id), moment: def.id, vars: full, perMint: m.perMint, canSpend: spendRes.error ? 0 : n(spendRes.data) };
}

/** What came of your choice: which outcome, and the money (mint) and reputation that came of it. */
export type MomentResult =
  | { ok: true; outcome: number; cash: number; rep: number; effect: EffectId | null; cast: { who: string; feeling: number; bond: number } | null }
  | { ok: false; error: string };

export async function momentAnswer(id: number, choice: number): Promise<MomentResult> {
  const m = await me().catch(() => null);
  if (!m) return { ok: false, error: "Sign in first." };
  const { data: row } = await m.db.from("moments").select("moment, vars, answered_at").eq("id", Math.round(n(id))).eq("user_id", m.userId).maybeSingle();
  if (!row || row.answered_at) return { ok: false, error: "That moment has passed." };
  const def = MOMENT_BY_ID.get(String(row.moment));
  const vars = (row.vars ?? {}) as MomentVars & { seed?: number };
  const pick = Math.round(n(choice));
  // Only the answers that were shown can be chosen.
  const c = def && choiceOrder(def, n(vars.seed)).includes(pick) ? def.choices[pick] : undefined;
  if (!def || !c) return { ok: false, error: "That moment has passed." };
  // The same answer doesn't always turn out the same: who you are and what's on you shift it.
  const [answers, effects] = await Promise.all([answersOf(m.db, m.userId), effectsOf(m.db, m.userId)]);
  const outcome = rollOutcome(c, Math.random, { character: characterOf(answers), effects: effects.map((e) => e.effect) });
  const naira = ((outcome.get ?? 0) - (outcome.pay ?? 0)) * n(vars.ask);
  const mint = Math.round((naira / m.perMint) * 100) / 100;
  const text = outcome.text
    .replace(/\{name\}/g, String(vars.name ?? ""))
    .replace(/\{ask\}/g, `₦${Math.round(n(vars.ask)).toLocaleString("en-GB")}`)
    .replace(/\{place\}/g, String(vars.place ?? ""));
  const { data, error } = await m.db.rpc("moment_answer", {
    p_user: m.userId,
    p_id: Math.round(n(id)),
    p_choice: pick,
    p_text: text,
    p_cash: mint,
    p_rep: outcome.rep ?? 0,
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
  const d = (data ?? {}) as { cash?: number; rep?: number };
  return { ok: true, outcome: c.outcomes.indexOf(outcome), cash: n(d.cash), rep: n(d.rep), effect, cast };
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
  perMint: number;
};

/** Your wheel (docs/LIFE_WHEEL.md): the moments you've lived (the last 120), the stories still going, what's on you, and who you're becoming. */
export async function myWheel(): Promise<Wheel | null> {
  const m = await me().catch(() => null);
  if (!m) return null;
  const [rowsRes, countRes, dueRes, effects, answers, bondsRes] = await Promise.all([
    m.db.from("moments").select("*").eq("user_id", m.userId).not("answered_at", "is", null).gte("choice", 0).order("created_at", { ascending: false }).limit(120),
    m.db.from("moments").select("id", { count: "exact", head: true }).eq("user_id", m.userId).gte("choice", 0),
    m.db.from("moment_followups").select("*").eq("user_id", m.userId).order("due_at").limit(30),
    effectsOf(m.db, m.userId),
    answersOf(m.db, m.userId),
    m.db.from("cast_bonds").select("who, step, feeling, last_at").eq("user_id", m.userId).order("last_at", { ascending: false }),
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
  return { moments, total: countRes.count ?? moments.length, stories, effects, people, words: characterWords(characterOf(answers)), perMint: m.perMint };
}
