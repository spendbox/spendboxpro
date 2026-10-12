// Tests for your day, side hustles, interviews and breakthroughs. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { HUSTLE_BREAKTHROUGHS, JOB_BREAKTHROUGHS } from "../breakthrough-bank.ts";
import { drawEvent, markEvent, showEvent } from "../breakthroughs.ts";
import { commuteHours, dayPlan, workFactor } from "../day.ts";
import { HUSTLES } from "../hustles.ts";
import { drawInterview, hasInterview, markInterview, showInterview } from "../interviews.ts";
import { JOB_QUESTIONS } from "../interview-bank.ts";
import { jobsAtPlace, jobsInBuilding, needsInterview, WORK_SKILLS, type WorkJob } from "../work.ts";

const allJobs = (): WorkJob[] => [
  ...(["shops", "mixed", "plaza", "offices", "glass", "warehouse", "farm"] as const).flatMap((kind) => jobsInBuilding({ kind, state: "built" })),
  ...jobsInBuilding({ kind: "flats", state: "site" }),
  ...["market", "megamall", "hotel", "hospital", "intlairport", "airport", "port", "campus", "school", "capitol", "museum", "arena", "club", "bigpark", "worship", "fuel", "restaurant", "police", "fire"].flatMap((t) => jobsAtPlace(t)),
];

test("a day has 24 hours: sleep, work, travel, a hustle, study and exercise must fit", () => {
  const easy = dayPlan({ job: true, commute: { mode: "walk", km: 1 }, hustleHours: 0, studyHours: 0, exercise: "walk" });
  assert.equal(easy.busy, 8 + 8 + 0.5 + 0.5);
  assert.ok(easy.fits && easy.mind > 0);
  const packed = dayPlan({ job: true, commute: { mode: "walk", km: 12 }, hustleHours: 4, studyHours: 4, exercise: "gym" });
  assert.equal(packed.fits, false);
  assert.equal(commuteHours("danfo", 6), 1);
});

test("long days and no free time wear you down; exercise helps the body", () => {
  const long = dayPlan({ job: true, commute: { mode: "danfo", km: 12 }, hustleHours: 4, studyHours: 0, exercise: "none" });
  assert.ok(long.mind < 0 && long.body < -1.5);
  const gym = dayPlan({ job: true, commute: null, hustleHours: 0, studyHours: 0, exercise: "gym" });
  assert.ok(gym.body > 0);
  assert.equal(workFactor(80, 5), 0);
  assert.equal(workFactor(20, 80), 0.5);
});

test("every job that needs an interview has questions; the questions mark right", () => {
  for (const j of allJobs().filter(needsInterview)) assert.ok(hasInterview(j.job), j.job);
  const ids = drawInterview("nurse", () => 0.3);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  assert.ok(showInterview(ids).every((q) => !("answer" in q)));
  const right = ids.map((id) => [...JOB_QUESTIONS.nurse].find((q) => q.id === id)?.answer ?? -1);
  assert.ok(markInterview(ids, right) >= 4);
});

test("every skill and side hustle has breakthrough moments", () => {
  for (const s of new Set(allJobs().map((j) => j.skill))) assert.ok(JOB_BREAKTHROUGHS[s]?.length, s);
  for (const h of HUSTLES) assert.ok(HUSTLE_BREAKTHROUGHS[h.id]?.length, h.id);
  const e = drawEvent("hustle", "pos", () => 0)!;
  assert.ok(showEvent(e.id) && !("best" in showEvent(e.id)!));
  assert.equal(markEvent(e.id, e.best)!.won, true);
  assert.ok(Object.keys(WORK_SKILLS).length >= 13);
});

test("a long day eats into sleep: allowed, but short nights stress the mind", () => {
  const rested = dayPlan({ job: true, commute: { mode: "danfo", km: 6 }, hustleHours: 0, studyHours: 0, exercise: "none" });
  assert.equal(rested.sleep, 8);
  // A far job and two hustles: only 5 hours' sleep left, but it fits.
  const short = dayPlan({ job: true, commute: { mode: "danfo", km: 24 }, hustleHours: 7, studyHours: 0, exercise: "none" });
  assert.ok(short.fits, "allowed");
  assert.ok(short.sleep < 8 && short.sleep >= 4, String(short.sleep));
  assert.ok(short.mind < rested.mind - 2, "a stressed mind");
  assert.ok(short.body < rested.body, "a tired body");
});
