"use server";

import { currentUserId } from "@/lib/game";
import { makePlan, tileAt } from "@/lib/city/layout";
import { buildInterview, INTERVIEW_LENGTH, jobAt, type InterviewQuestion, type Job, type Skill } from "@/lib/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

// Jobs: the interview (asked and marked here, so the answers never reach the phone), getting
// hired, collecting pay and quitting. The database (game-db/035_fees_and_jobs.sql) keeps the
// jobs, pay, tax, skills and who can't apply where.

type Fail = { ok: false; error: string };

export type MyJob = { place: string; placeName: string; job: string; title: string; skill: Skill; payHour: number; hiredAt: string; endsAt: string };
export type JobStatus = {
  job: MyJob | null;
  owed: number;
  tax: number;
  hoursLeftToday: number;
  skipMinutes: number;
  skillBonus: number;
  skillMinutes: number;
  skills: { skill: Skill; minutes: number; level: number }[];
  banned: string[];
};
export type JobOffer = {
  job: Job;
  /** Your skill in this kind of work means no interview. */
  noInterview: boolean;
  questions: InterviewQuestion[];
  passMark: number;
  status: JobStatus;
};
export type Pay = { gross: number; tax: number; net: number; hours: number; capped: boolean; coins: number };

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): Fail {
  const code = (message ?? "").split(":")[0];
  const map: Record<string, string> = {
    no_game: "Jobs open when the town is up and running.",
    too_late: "This town is about to end. Apply in the next one!",
    unknown_player: "Please sign in again.",
    no_name: "Pick a player name first.",
    frozen: "Your account is paused right now.",
    banned: "You didn't pass the interview here, so they won't see you again in this town. Try somewhere else!",
    already: "You already work here.",
    interview_needed: "This one needs an interview.",
    bad_job: "That place isn't hiring.",
  };
  if (map[code]) return { ok: false, error: map[code] };
  console.error("Job action failed", message);
  return { ok: false, error: "Couldn't do that. Try again." };
}

function toStatus(d: Record<string, unknown>): JobStatus {
  const j = d.job as Record<string, unknown> | null;
  return {
    job: j
      ? { place: String(j.place), placeName: String(j.place_name), job: String(j.job), title: String(j.title), skill: String(j.skill) as Skill, payHour: n(j.pay_hour), hiredAt: String(j.hired_at), endsAt: String(j.ends_at) }
      : null,
    owed: n(d.owed),
    tax: n(d.tax),
    hoursLeftToday: n(d.hours_left_today),
    skipMinutes: n(d.skip_minutes),
    skillBonus: n(d.skill_bonus),
    skillMinutes: n(d.skill_minutes) || 30,
    skills: (Array.isArray(d.skills) ? d.skills : []).map((s: Record<string, unknown>) => ({ skill: String(s.skill) as Skill, minutes: n(s.minutes), level: n(s.level) })),
    banned: Array.isArray(d.banned) ? d.banned.map(String) : [],
  };
}

/** The town now, and what kind of place b:<i> is in it (worked out here, not taken from the phone). */
async function placeHere(place: string) {
  const m = /^b:(\d{1,7})$/.exec(place);
  if (!m) return null;
  const db = createAdminClient();
  const { data: round } = await db.from("rounds").select("id, status").in("status", ["join", "seek"]).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!round) return null;
  const plan = makePlan(Number(round.id));
  const t = tileAt(plan, Number(m[1]));
  const type = t.station ? "station" : t.kind === "structure" && t.structure ? t.structure.type : t.kind;
  return { roundId: Number(round.id), plan, type, job: jobAt(type) };
}

async function status(userId: string): Promise<JobStatus | null> {
  const { data, error } = await createAdminClient().rpc("job_status", { p_user: userId });
  if (error) return null;
  return toStatus((data ?? {}) as Record<string, unknown>);
}

/** Your job, pay waiting, skills. */
export async function jobStatus(): Promise<{ ok: true; status: JobStatus } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to get a job." };
  const s = await status(userId);
  return s ? { ok: true, status: s } : { ok: false, error: "Couldn't load your job. Try again." };
}

/** What job a place offers you, and its interview questions (or none, if you have the skill). */
export async function jobOffer(place: string, placeName: string): Promise<{ ok: true; offer: JobOffer } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to get a job." };
  const here = await placeHere(place);
  if (!here) return { ok: false, error: "Jobs open when the town is up and running." };
  if (!here.job) return { ok: false, error: "This place isn't hiring. Try an office, a shop, a restaurant, a bank or another business." };
  const s = await status(userId);
  if (!s) return { ok: false, error: "Couldn't load jobs. Try again." };
  if (s.banned.includes(place)) return say("banned");
  const skill = s.skills.find((k) => k.skill === here.job!.skill);
  const noInterview = !!skill && skill.minutes >= s.skipMinutes;
  const { questions } = noInterview ? { questions: [] } : buildInterview(here.plan, placeName.slice(0, 80), here.job, `${userId}|${here.roundId}|${place}`);
  return { ok: true, offer: { job: here.job, noInterview, questions, passMark: here.job.pass, status: s } };
}

/** Apply: with your interview answers (an index per question), or none if your skill lets you skip it. */
export async function applyForJob(place: string, placeName: string, answers: number[] | null): Promise<{ ok: true; hired: boolean; score: number; outOf: number; pass: number; job: Job } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to get a job." };
  const here = await placeHere(place);
  if (!here?.job) return { ok: false, error: "This place isn't hiring." };
  const name = placeName.slice(0, 80) || "Work";
  let score = 0;
  let outOf = 0;
  if (answers) {
    const { answers: right } = buildInterview(here.plan, name, here.job, `${userId}|${here.roundId}|${place}`);
    outOf = right.length;
    if (!Array.isArray(answers) || answers.length !== right.length) return { ok: false, error: "Answer every question." };
    score = right.reduce((t, a, i) => t + (answers[i] === a ? 1 : 0), 0);
  }
  const { data, error } = await createAdminClient().rpc("job_hire", {
    p_user: userId,
    p_place: place,
    p_place_name: name,
    p_job: here.job.job,
    p_title: here.job.title,
    p_skill: here.job.skill,
    p_pay: here.job.pay,
    p_interviewed: !!answers,
    p_score: score,
    p_pass: answers ? here.job.pass : 0,
  });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, hired: Boolean(d.hired), score, outOf: outOf || INTERVIEW_LENGTH, pass: here.job.pass, job: here.job };
}

function toPay(d: Record<string, unknown>): Pay {
  return { gross: n(d.gross), tax: n(d.tax), net: n(d.net), hours: n(d.hours), capped: Boolean(d.capped), coins: n(d.coins) };
}

/** Collect the pay you've earned (taxed). */
export async function collectPay(): Promise<{ ok: true; pay: Pay } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data, error } = await createAdminClient().rpc("job_collect", { p_user: userId });
  if (error) return say(error.message);
  return { ok: true, pay: toPay((data ?? {}) as Record<string, unknown>) };
}

/** Leave your job (your pay is collected first). */
export async function quitJob(): Promise<{ ok: true; pay: Pay } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data, error } = await createAdminClient().rpc("job_quit", { p_user: userId });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, pay: toPay((d.collected ?? {}) as Record<string, unknown>) };
}
