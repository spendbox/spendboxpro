// Interviews for skilled and better-paid jobs (docs/DAY.md): four questions about the job itself and
// one about Lagos, drawn fresh each time from src/lib/world/interview-bank.ts. Server only (the bank
// holds the answers): the screens get the questions without them, through src/app/play/interview-actions.ts.

import { JOB_QUESTIONS, LAGOS_QUESTIONS, type InterviewQ } from "./interview-bank.ts";

export const INTERVIEW_LENGTH = 5;
const ALL = new Map<string, InterviewQ>([...Object.values(JOB_QUESTIONS).flat(), ...LAGOS_QUESTIONS].map((q) => [q.id, q]));

function pick<T>(list: T[], n: number, rand: () => number) {
  const left = [...list];
  const out: T[] = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rand() * left.length), 1)[0]);
  return out;
}

/** Five question ids for this job: four about the job, one about Lagos. */
export function drawInterview(job: string, rand: () => number = Math.random): string[] {
  const own = JOB_QUESTIONS[job] ?? [];
  const lagos = pick(LAGOS_QUESTIONS, INTERVIEW_LENGTH - Math.min(4, own.length), rand);
  return [...pick(own, 4, rand), ...lagos].map((q) => q.id);
}

/** The questions as a player sees them (no answers). */
export function showInterview(ids: string[]) {
  return ids.map((id) => ALL.get(id)).filter((q): q is InterviewQ => !!q).map((q) => ({ id: q.id, q: q.q, options: q.options }));
}

/** How many answers were right. */
export function markInterview(ids: string[], answers: number[]) {
  return ids.reduce((n, id, k) => n + (ALL.get(id)?.answer === answers[k] ? 1 : 0), 0);
}

export const hasInterview = (job: string) => (JOB_QUESTIONS[job]?.length ?? 0) >= 4;
