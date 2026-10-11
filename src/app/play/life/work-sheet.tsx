"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Coins, MapPin } from "@/components/icons";
import type { CityPlan } from "@/lib/city/layout";
import type { RegionMap } from "@/lib/world/compile";
import { dayPlan, type DayInput } from "@/lib/world/day";
import type { LifeStatus, WorkStatus } from "@/lib/world/property-api";
import { mintLocal } from "@/lib/world/value";
import {
  COMMUTE_LABEL,
  COMMUTES,
  daysForLevel,
  fareMint,
  fareOrBus,
  INCOME_TAX,
  needsInterview,
  payDay,
  settle,
  skillLevel,
  tripKmBetween,
  WORK_SKILLS,
  type Commute,
  type WorkSkill,
} from "@/lib/world/work";
import { workplacesNear } from "@/lib/world/workplace";
import { Sheet } from "../sheet";
import { DayBar, HustleSection } from "./day-ui";
import { tripLine, type JobsContext } from "./jobs-here";

const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Your job: pay waiting, how you get there and what it costs, your skills; or the best jobs near home. */
export function WorkSheet({
  status,
  life,
  day,
  region,
  plan,
  ctx,
  onStartHustle,
  onStopHustle,
  onCollect,
  onMode,
  onQuit,
  onShow,
  onClose,
}: {
  status: WorkStatus | null;
  /** Your life now (side hustle, body and mind). */
  life: LifeStatus | null;
  /** Your day as you live it now. */
  day: DayInput;
  region: RegionMap;
  /** The map's plan (for finding jobs near your home). */
  plan: CityPlan | null;
  ctx: JobsContext;
  onStartHustle: (id: string) => void;
  onStopHustle: () => void;
  onCollect: () => void;
  /** Switch how you get to work (the game asks you to confirm first); `perDay` is what it would cost a game day. */
  onMode: (mode: Commute, perDay: number) => void;
  onQuit: () => void;
  onShow: (placeId: string) => void;
  onClose: () => void;
}) {
  const prices = region.region.prices;
  const job = status?.job ?? null;
  const skills = useMemo(() => status?.skills ?? {}, [status]);
  // The pay waiting goes up as you watch (a game day every 2 hours).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const km = job && ctx.homeUnit ? tripKmBetween(ctx.homeUnit, job.place) : null;
  const fare = job && km !== null ? fareOrBus(job.mode, km, prices) : 0;
  const hustle = life?.hustle ?? null;
  const hustleWaiting = hustle ? hustle.payDay * Math.min(7, Math.max(0, (now - Date.parse(hustle.paidUntil)) / 7_200_000)) : 0;
  const waiting = job ? settle({ payDay: job.payDay, paidUntil: Date.parse(job.paidUntil) }, now, skills[job.skill] ?? 0, fare) : null;

  const best = useMemo(() => {
    if (job || !plan || !ctx.homeUnit) return [];
    const m = /:(-?\d+),(-?\d+)/.exec(ctx.homeUnit);
    if (!m) return [];
    const places = workplacesNear(plan, Number(m[1]), Number(m[2]), 14);
    const rows = places.flatMap((p) =>
      p.jobs
        .filter((j) => skillLevel(skills[j.skill] ?? 0) >= j.level)
        .map((j) => {
          const trip = tripLine(ctx.homeUnit, p.id, prices);
          return { place: p, job: j, trip, net: payDay(j, prices) * (1 - INCOME_TAX) - 2 * trip.fare };
        }),
    );
    return rows.sort((a, b) => b.net - a.net).slice(0, 10);
  }, [job, plan, ctx.homeUnit, skills, prices]);

  return (
    <Sheet
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Briefcase className="size-5" /> Work
        </span>
      }
    >

      <DayBar plan={dayPlan(day)} />
      {!job && hustleWaiting >= 0.01 && (
        <button disabled={ctx.busy} onClick={onCollect} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-gold text-sm font-semibold text-ink disabled:opacity-50">
          <Coins className="size-4" /> Collect about ₥{fmt(hustleWaiting * 0.93)} from your hustle
        </button>
      )}
      {job ? (
        <>
          <div className="mt-3 rounded-2xl bg-ink/[0.04] p-3.5">
            <p className="font-semibold">{job.title}</p>
            <p className="flex items-center gap-1 text-sm text-muted">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{job.placeName}</span>
            </p>
            <p className="mt-2 text-sm">
              <b className="tabular-nums">₥{fmt(job.payDay)}</b> a game day <span className="text-muted">({mintLocal(job.payDay * 30, prices)} a month)</span>
            </p>
            {waiting && (
              <div className="mt-3 border-t border-ink/5 pt-3 text-sm">
                <p className="text-muted">
                  {waiting.gross < 0.01
                    ? "Nothing waiting yet: pay builds up every game day (2 hours)."
                    : `Waiting: ${fmt(waiting.days)} game ${waiting.days === 1 ? "day" : "days"} · ₥${fmt(waiting.gross)} pay − ₥${fmt(waiting.tax)} tax − ₥${fmt(waiting.fares)} fares`}
                </p>
                <button
                  disabled={ctx.busy || waiting.gross + hustleWaiting < 0.01}
                  onClick={onCollect}
                  className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-gold font-semibold text-ink disabled:opacity-50"
                >
                  <Coins className="size-4" /> Collect ₥{fmt(waiting.net)}
                  {hustleWaiting >= 0.01 ? ` + about ₥${fmt(hustleWaiting * 0.93)} from your hustle` : ""}
                </button>
                {waiting.days >= 6 && <p className="mt-1 text-center text-[11px] text-hit">Pay only waits a game week: collect it soon.</p>}
              </div>
            )}
          </div>

          <h3 className="mt-5 text-sm font-semibold">Getting there</h3>
          {(() => {
            const cur = km === null ? null : fareMint(job.mode, km, prices);
            return (
              <div className="mt-2 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white">
                <div>
                  <p className="text-[11px] opacity-70">You go by</p>
                  <p className="font-semibold">{COMMUTE_LABEL[job.mode]}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{!cur ? "Free" : `₥${fmt(2 * cur)} a day`}</p>
                  <p className="text-[11px] opacity-70">{km === null ? "" : `${km} km each way`}</p>
                </div>
              </div>
            );
          })()}
          <p className="mt-3 text-xs text-muted">Or go another way (tap to switch):</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {COMMUTES.filter((m) => m !== job.mode).map((mode) => {
              const f = km === null ? null : fareMint(mode, km, prices);
              return (
                <button
                  key={mode}
                  disabled={ctx.busy || f === null}
                  onClick={() => onMode(mode, f === null ? 0 : 2 * f)}
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-xs hover:bg-ink/10 disabled:opacity-40"
                >
                  <span className="font-semibold">{COMMUTE_LABEL[mode]}</span>
                  <span className="tabular-nums text-muted">{f === null ? "too far" : f === 0 ? "free" : `₥${fmt(2 * f)}/day`}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={() => onShow(job.place)} className="h-10 flex-1 rounded-full bg-ink/5 text-sm font-semibold">
              Show on the map
            </button>
            <button disabled={ctx.busy} onClick={onQuit} className="h-10 flex-1 rounded-full bg-ink/5 text-sm font-semibold text-hit disabled:opacity-50">
              Leave this job
            </button>
          </div>
        </>
      ) : !ctx.homeUnit ? (
        <p className="mt-4 text-sm text-muted">Buy a home first: you need somewhere to live before you can work. Then shops, offices, markets and more will hire you.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">The best jobs near your home that you can do now, after tax and fares. Tap any shop, office, market or landmark on the map to see its jobs too.</p>
          {best.length === 0 ? (
            <p className="mt-4 text-center text-sm text-muted">{plan ? "No jobs close by. Look further out on the map." : "Looking…"}</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
              {best.map(({ place, job: j, trip, net }) => (
                <li key={`${place.id}/${j.job}`} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{j.title}</p>
                    <button onClick={() => onShow(place.id)} className="block max-w-full truncate text-left text-xs text-muted underline-offset-2 hover:underline">
                      {place.name} · {trip.km} km
                    </button>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">₥{fmt(net)}/day</p>
                    <p className="text-[11px] text-muted">{COMMUTE_LABEL[trip.mode].toLowerCase()}</p>
                  </div>
                  <button disabled={ctx.busy} onClick={() => ctx.onTake(place, j, trip.mode)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
                    {needsInterview(j) ? "Interview" : "Take"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {ctx.homeUnit && (
        <HustleSection
          status={life}
          day={{ ...day, hustleHours: 0 }}
          skills={skills}
          prices={prices}
          busy={ctx.busy}
          now={now}
          onStart={onStartHustle}
          onStop={onStopHustle}
        />
      )}

      {Object.keys(skills).length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Your skills</h3>
          <ul className="mt-2 space-y-2">
            {Object.entries(skills)
              .sort((a, b) => b[1] - a[1])
              .map(([skill, days]) => {
                const level = skillLevel(days);
                const from = daysForLevel(level);
                const to = daysForLevel(level + 1);
                return (
                  <li key={skill} className="text-sm">
                    <div className="flex justify-between">
                      <span>{WORK_SKILLS[skill as WorkSkill] ?? skill}</span>
                      <span className="text-muted">level {level}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/5">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, ((days - from) / (to - from)) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">Every game day worked counts. Higher levels open better jobs and pay 3% more each.</p>
        </>
      )}
    </Sheet>
  );
}
