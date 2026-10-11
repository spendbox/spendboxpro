"use client";

import { Briefcase } from "@/components/icons";
import type { Prices } from "@/lib/world/region";
import { mintLocal } from "@/lib/world/value";
import { cheapestCommute, COMMUTE_LABEL, fareMint, INCOME_TAX, payDay, skillLevel, tripKmBetween, WORK_SKILLS, type Commute, type WorkJob } from "@/lib/world/work";
import type { Workplace } from "@/lib/world/workplace";

/** What the jobs list needs to know about you, and what to do when you take one. */
export type JobsContext = {
  prices: Prices;
  homeUnit: string | null;
  /** Game days worked in each skill. */
  skills: Record<string, number>;
  /** Your job now. */
  current: { place: string; job: string } | null;
  busy: boolean;
  onTake: (place: Workplace, job: WorkJob, mode: Commute) => void;
};

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** How far a workplace is from your home and the cheapest way there ("2.1 km · walk, free"). */
export function tripLine(homeUnit: string | null, placeId: string, prices: Prices) {
  const km = homeUnit ? tripKmBetween(homeUnit, placeId) : null;
  if (km === null) return { km: null, mode: "walk" as Commute, fare: 0, text: "Buy a home to see the trip" };
  const mode = cheapestCommute(km);
  const fare = fareMint(mode, km, prices) ?? 0;
  return { km, mode, fare, text: `${km} km from home · ${COMMUTE_LABEL[mode].toLowerCase()}${fare ? ` ₥${fmt(fare)} a trip` : ", free"}` };
}

/** The jobs at a place: pay, the skill they need, the trip from your home, and a button to take one. */
export function JobsHere({ place, ctx }: { place: Workplace; ctx: JobsContext }) {
  const trip = tripLine(ctx.homeUnit, place.id, ctx.prices);
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Briefcase className="size-4 text-muted" /> Jobs here
      </h3>
      <p className="mt-0.5 text-xs text-muted">{trip.text}</p>
      <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
        {place.jobs.map((j) => {
          const day = payDay(j, ctx.prices);
          const net = day * (1 - INCOME_TAX) - 2 * trip.fare;
          const level = skillLevel(ctx.skills[j.skill] ?? 0);
          const short = level < j.level;
          const mine = ctx.current?.place === place.id && ctx.current.job === j.job;
          return (
            <li key={j.job} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{j.title}</p>
                <p className="truncate text-xs text-muted">
                  {WORK_SKILLS[j.skill]}
                  {j.level > 0 ? ` level ${j.level}` : ", no experience needed"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">₥{fmt(day)}/day</p>
                <p className="text-[11px] text-muted">
                  {mintLocal(day * 30, ctx.prices)}/month{ctx.homeUnit ? ` · ₥${fmt(net)} after tax & fares` : ""}
                </p>
              </div>
              {mine ? (
                <span className="shrink-0 rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">Yours</span>
              ) : (
                <button
                  disabled={ctx.busy || !ctx.homeUnit || short}
                  onClick={() => ctx.onTake(place, j, trip.mode)}
                  title={!ctx.homeUnit ? "Buy a home first" : short ? `Needs ${WORK_SKILLS[j.skill]} level ${j.level} (you have ${level})` : `Start as ${j.title}`}
                  className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {short ? `Lvl ${j.level}` : "Take"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted">A game day is 2 real hours. Pay waits up to a game week (14 hours); collect it from Work.</p>
    </div>
  );
}
