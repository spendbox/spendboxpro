"use server";

import { seal, unseal } from "@/lib/game-seal";
import { currentUserId } from "@/lib/game";
import { makePlan, type CityPlan } from "@/lib/city/layout";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { drawEvent, EVENT_HOURS, markEvent, showEvent, WIN } from "@/lib/world/breakthroughs";
import { STRESSED_BELOW } from "@/lib/world/day";
import { drawInterview, markInterview, showInterview } from "@/lib/world/interviews";
import type { EventResult, InterviewResult, InterviewStart } from "@/lib/world/property-api";
import { interviewPass, needsInterview } from "@/lib/world/work";
import { workplaceById } from "@/lib/world/workplace";
import { tickLife } from "./life-tick";
import { NO_JOBS, SIMPLE_LIFE } from "@/lib/world/simple-life";

// Interviews and breakthrough moments (docs/DAY.md). Questions and answers stay on the server: the
// phone gets the questions in a sealed note (src/lib/game-seal.ts) and sends its answers back; a pass
// comes back as a sealed ticket that takeJob checks. The world lab (no sign-in) uses the same.

const plans = new Map<string, CityPlan>();
function planFor(region: string) {
  const map = regionMap(region);
  if (!map) return null;
  let p = plans.get(region);
  if (!p) {
    p = makePlan(map.region.seed, map);
    plans.set(region, p);
  }
  return p;
}

const LAB = "lab";

/** Who's asking: signed in, or nobody (the world lab). */
async function who() {
  try {
    return await currentUserId();
  } catch {
    return null;
  }
}

/** Start an interview for a job at a place: five questions, and how many must be right. */
export async function interviewStart(placeId: string, jobId: string): Promise<InterviewStart> {
  if (SIMPLE_LIFE) return { ok: false, error: NO_JOBS };
  try {
    return await startInterview(placeId, jobId);
  } catch (e) {
    // Say what went wrong in the server's logs, and something useful on the phone (never a blank failure).
    console.error("Interview start failed", placeId, jobId, e);
    return { ok: false, error: "The interview room isn't ready just now. Try again in a minute." };
  }
}

async function startInterview(placeId: string, jobId: string): Promise<InterviewStart> {
  const region = /^([a-z0-9-]+):/.exec(placeId ?? "")?.[1];
  const plan = region ? planFor(region) : null;
  const job = plan ? workplaceById(plan, placeId)?.jobs.find((j) => j.job === jobId) : undefined;
  if (!job) return { ok: false, error: "That job isn't on offer there any more. Close the place and open it again." };
  if (!needsInterview(job)) return { ok: false, error: "That job doesn't need an interview." };
  const userId = await who();
  let stressed = false;
  if (userId) {
    const { data: wait } = await createAdminClient().rpc("life_interview_wait", { p_user: userId, p_place: placeId, p_job: jobId });
    if (wait) return { ok: false, error: `You can try this interview again at ${new Date(String(wait)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.` };
    const { data: life } = await createAdminClient().from("lives").select("mind").eq("user_id", userId).maybeSingle();
    stressed = Number(life?.mind ?? 100) < STRESSED_BELOW;
  }
  const ids = drawInterview(jobId);
  const need = interviewPass(job, stressed);
  return { ok: true, token: seal({ user: userId ?? LAB, place: placeId, job: jobId, ids, need }, 20), questions: showInterview(ids), need, title: job.title };
}

/** Hand in your answers: passed or not, and a ticket to take the job when passed. */
export async function interviewSubmit(token: string, answers: number[]): Promise<InterviewResult> {
  const t = unseal<{ user: string; place: string; job: string; ids: string[]; need: number }>(token);
  if (!t) return { ok: false, error: "That interview has run out of time. Start again." };
  const userId = await who();
  if (t.user !== (userId ?? LAB)) return { ok: false, error: "That interview isn't yours." };
  const score = markInterview(t.ids, (answers ?? []).map((a) => Number(a)));
  const passed = score >= t.need;
  if (!passed && userId) await createAdminClient().rpc("life_interview_fail", { p_user: userId, p_place: t.place, p_job: t.job });
  return { ok: true, passed, score, need: t.need, ticket: passed ? seal({ user: t.user, place: t.place, job: t.job }, 60) : undefined };
}

/** Answer the breakthrough waiting for you. */
export async function answerEvent(choice: number): Promise<EventResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const status = await tickLife(userId);
  const e = status?.event;
  if (!e) return { ok: false, error: "That moment has passed." };
  const mark = markEvent(e.key, Number(choice));
  if (!mark) return { ok: false, error: "That moment has passed." };
  const db = createAdminClient();
  let bonus = 0;
  let skill: string | null = null;
  if (e.source === "job" && mark.won) {
    const { data: job } = await db.from("life_jobs").select("pay_day, skill").eq("user_id", userId).maybeSingle();
    bonus = Math.round(Number(job?.pay_day ?? 0) * WIN.bonusDays * 100) / 100;
    skill = (job?.skill as string) ?? null;
  }
  const { error } = await db.rpc("life_event_close", {
    p_user: userId,
    p_id: e.id,
    p_won: mark.won,
    p_bonus: bonus,
    p_skill: skill,
    p_skill_days: skill ? WIN.skillDays : 0,
    p_boost: e.source === "hustle" && mark.won ? WIN.boost : 1,
    p_boost_days: e.source === "hustle" && mark.won ? WIN.boostDays : 0,
    p_stall_days: mark.stall,
  });
  if (error) return { ok: false, error: "That moment has passed." };
  return { ok: true, won: mark.won, said: mark.said, bonus, stall: e.source === "hustle" ? mark.stall : 0 };
}

// ---------------------------------------------------------------- the world lab's moments

/** A moment for the lab's pretend life (sealed so the best answer stays here). */
export async function labDrawEvent(source: "job" | "hustle", of: string) {
  const b = drawEvent(source, of);
  const shown = b ? showEvent(b.id) : null;
  if (!b || !shown) return null;
  return { token: seal({ key: b.id }, EVENT_HOURS * 60), ...shown };
}

/** How the lab's answer went. */
export async function labMarkEvent(token: string, choice: number) {
  const t = unseal<{ key: string }>(token);
  return t ? markEvent(t.key, Number(choice)) : null;
}
