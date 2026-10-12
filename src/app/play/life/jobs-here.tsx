"use client";

import { Briefcase } from "@/components/icons";
import type { Prices } from "@/lib/world/region";
import { cash } from "@/lib/world/value";
import { CERT_LABEL } from "@/lib/world/living";
import { cheapestCommute, COMMUTE_LABEL, dayNet, fareMint, needsInterview, payDay, skillLevel, tripKmBetween, tripWords, WORK_SKILLS, type Commute, type WorkJob } from "@/lib/world/work";
import { ferryKmBetween } from "@/lib/world/trips";
import type { Workplace } from "@/lib/world/workplace";

/** What the jobs list needs to know about you, and what to do when you take one. */
export type JobsContext = {
  prices: Prices;
  homeUnit: string | null;
  /** Game days worked in each skill. */
  skills: Record<string, number>;
  /** Certificates you've earned (from finished courses). */
  certs: string[];
  /** Your job now. */
  current: { place: string; job: string } | null;
  busy: boolean;
  onTake: (place: Workplace, job: WorkJob, mode: Commute) => void;
};


/** How far a workplace is from your home and the cheapest way there ("2.1 km · walk, free"). */
export function tripLine(homeUnit: string | null, placeId: string, prices: Prices) {
  const km = homeUnit ? tripKmBetween(homeUnit, placeId) : null;
  if (km === null || !homeUnit) return { km: null, mode: "walk" as Commute, fare: 0, text: "Buy a home to see the trip" };
  const ferry = ferryKmBetween(homeUnit, placeId);
  const mode = cheapestCommute(km, ferry);
  const fare = fareMint(mode, km, prices, ferry) ?? 0;
  return { km, mode, fare, text: `${km} km from home · ${tripWords(mode, ferry)}${fare ? ` ${cash(fare)} a trip` : ", free"}` };
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
          const net = dayNet(day, ctx.skills[j.skill] ?? 0, trip.fare);
          const level = skillLevel(ctx.skills[j.skill] ?? 0);
          const noCert = !!j.cert && !ctx.certs.includes(j.cert);
          const short = level < j.level || noCert;
          const mine = ctx.current?.place === place.id && ctx.current.job === j.job;
          return (
            <li key={j.job} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{j.title}</p>
                <p className="truncate text-xs text-muted">
                  {j.level > 0 ? `Needs ${WORK_SKILLS[j.skill].toLowerCase()} level ${j.level}` : "No experience needed"}
                  {j.cert ? ` and a ${CERT_LABEL[j.cert]}` : ""}
                  {needsInterview(j) ? " · interview" : ""}
                  {j.state ? " · paid by the state" : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{cash(day)} / 2h</p>
                <p className="text-[11px] text-muted">≈ {cash(day * 12)} a day</p>
              </div>
              {mine ? (
                <span className="shrink-0 rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">Yours</span>
              ) : (
                <button
                  disabled={ctx.busy || !ctx.homeUnit || short}
                  onClick={() => ctx.onTake(place, j, trip.mode)}
                  title={!ctx.homeUnit ? "Buy a home first" : noCert ? `Needs a ${CERT_LABEL[j.cert!]}: see Life → Education` : short ? `Needs ${WORK_SKILLS[j.skill]} level ${j.level} (you have ${level})` : ctx.current ? `Leave your job and start as ${j.title}` : `Start as ${j.title}`}
                  className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {noCert ? "Course" : level < j.level ? `Lvl ${j.level}` : needsInterview(j) ? "Interview" : ctx.current ? "Switch" : "Take"}
                </button>
              )}
              </div>
              {ctx.homeUnit &&
                (net < 0 ? (
                  <p className="mt-1 text-[11px] font-semibold text-hit">You&apos;d lose {cash(-net)} every 2 hours: fares cost more than it pays.</p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted">You keep {cash(net)} every 2 hours after tax and fares.</p>
                ))}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted">Amounts are for every 2 hours of play. Pay goes into your wallet every 14 hours.</p>
    </div>
  );
}
