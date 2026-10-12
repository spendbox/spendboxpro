"use client";

import { cash } from "@/lib/world/value";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Coins, MapPin } from "@/components/icons";
import type { CityPlan } from "@/lib/city/layout";
import type { RegionMap } from "@/lib/world/compile";
import { dayPlan, type DayInput } from "@/lib/world/day";
import { HUSTLES, hustleDay, hustleStart } from "@/lib/world/hustles";
import type { LifeStatus, WorkStatus } from "@/lib/world/property-api";
import {
  COMMUTE_LABEL,
  COMMUTES,
  dayNet,
  fareMint,
  fareOrBus,
  INCOME_TAX,
  needsInterview,
  SKILL_BONUS,
  payDay,
  settle,
  skillLevel,
  tripKmBetween,
  WORK_SKILLS,
  type Commute,
  type WorkSkill,
} from "@/lib/world/work";
import { ferryKmBetween } from "@/lib/world/trips";
import { workplacesNear } from "@/lib/world/workplace";
import { Sheet } from "../sheet";
import { tripLine, type JobsContext } from "./jobs-here";

const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (n: number) => (n < 0 ? `−${cash(-n)}` : `${cash(n)}`);


/** Income, kept simple: your job at a glance (paid in by itself each game week), other jobs, side hustles, travel, rent, skills. */
export function WorkSheet({
  status,
  life,
  day,
  region,
  plan,
  ctx,
  onStartHustle,
  onStopHustle,
  onMode,
  onQuit,
  onShow,
  onClose,
  glow,
  rent,
  onRent,
  onProperty,
  onGoToWork,
}: {
  status: WorkStatus | null;
  life: LifeStatus | null;
  day: DayInput;
  region: RegionMap;
  /** The map's plan (for finding jobs near your home). */
  plan: CityPlan | null;
  ctx: JobsContext;
  onStartHustle: (id: string) => void;
  /** Stop one side hustle. */
  onStopHustle: (id: string) => void;
  /** Switch how you get to work (the game asks first); `perDay` is what it would cost a game day. */
  onMode: (mode: Commute, perDay: number) => void;
  onQuit: () => void;
  onShow: (placeId: string) => void;
  onClose: () => void;
  /** The guide's next step: make "Jobs near me" glow. */
  glow?: boolean;
  /** Your property's income: rent a day from tenants, and rent waiting to collect. */
  rent: { daily: number; waiting: number; units: number; let: number };
  onRent: () => void;
  /** Open your property (Finance). */
  onProperty: () => void;
  /** Go to your workplace on the map. */
  onGoToWork: (placeId: string) => void;
}) {
  const prices = region.region.prices;
  const job = status?.job ?? null;
  const skills = useMemo(() => status?.skills ?? {}, [status]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const [open, setOpen] = useState<"jobs" | "hustle" | null>(null);

  const km = job && ctx.homeUnit ? tripKmBetween(ctx.homeUnit, job.place) : null;
  const ferry = job && ctx.homeUnit ? ferryKmBetween(ctx.homeUnit, job.place) : 0;
  const fare = job && km !== null ? fareOrBus(job.mode, km, prices, ferry) : 0;
  const hustles = life?.hustles ?? (life?.hustle ? [life.hustle] : []);
  const running = new Set(hustles.map((h) => h.hustle));
  const waiting = job ? settle({ payDay: job.payDay, paidUntil: Date.parse(job.paidUntil) }, now, skills[job.skill] ?? 0, fare) : null;
  // Pay goes into your wallet by itself at the end of each game week (14 real hours).
  const WEEK = 7 * 7_200_000;
  const nextPay = job ? Math.max(0, Date.parse(job.paidUntil) + WEEK - now) : 0;
  const [details, setDetails] = useState(false);
  const plannedDay = dayPlan(day);
  const keep = job ? dayNet(job.payDay, skills[job.skill] ?? 0, fare) : 0;
  const gross = job ? Math.round(job.payDay * (1 + skillLevel(skills[job.skill] ?? 0) * SKILL_BONUS) * 100) / 100 : 0;
  const tax = Math.round(gross * INCOME_TAX * 100) / 100;

  // Worked out only when "Jobs near me" is open (it looks at every place round your home).
  const best = useMemo(() => {
    if (open !== "jobs" || !plan || !ctx.homeUnit) return [];
    const m = /:(-?\d+),(-?\d+)/.exec(ctx.homeUnit);
    if (!m) return [];
    const rows = workplacesNear(plan, Number(m[1]), Number(m[2]), 14).flatMap((p) =>
      p.jobs
        .filter((j) => skillLevel(skills[j.skill] ?? 0) >= j.level && !(job?.place === p.id && job.job === j.job))
        .map((j) => {
          const trip = tripLine(ctx.homeUnit, p.id, prices);
          return { place: p, job: j, trip, net: dayNet(payDay(j, prices), skills[j.skill] ?? 0, trip.fare) };
        }),
    );
    return rows.sort((a, b) => b.net - a.net).slice(0, 8);
  }, [open, job, plan, ctx.homeUnit, skills, prices]);

  const skillList = Object.entries(skills)
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <Sheet
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Briefcase className="size-5" /> Income
        </span>
      }
    >
      {job ? (
        // Your job, at a glance: what and where, Go to work, what you keep, and when it's paid in.
        <div className="rounded-3xl bg-ink/[0.04] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg font-extrabold leading-tight">{job.title}</p>
              <p className="flex max-w-full items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{job.placeName}</span>
              </p>
            </div>
            <button onClick={() => onGoToWork(job.place)} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#f08c00] px-4 text-sm font-semibold text-white">
              <MapPin className="size-4" /> Go to work
            </button>
          </div>
          <p className={`mt-3 text-sm ${keep < 0 ? "font-semibold text-hit" : ""}`}>
            {keep < 0 ? `Losing ${money(-keep)} every 2 hours: go a cheaper way or work nearer home.` : <>You keep <b>{money(keep)}</b> every 2 hours</>}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <Coins className="size-3.5 shrink-0" />
            Paid into your wallet every 14 hours{waiting && waiting.net >= 0.01 ? ` (${money(waiting.net)} so far)` : ""} · next in {hoursLeft(nextPay)}
          </p>
          <button onClick={() => setDetails((d) => !d)} className="mt-2 text-xs font-semibold text-gold-dark">
            {details ? "Hide the details" : "Pay, tax and fares"}
          </button>
          {details && (
            <>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                <Tile label="Pay" value={money(gross)} />
                <Tile label={`Tax ${Math.round(INCOME_TAX * 100)}%`} value={`−${money(tax)}`} />
                <Tile label="Fares" value={`−${money(2 * fare)}`} />
                <Tile label="You keep" value={money(keep)} bad={keep < 0} strong />
              </div>
              <p className="mt-1 text-center text-[11px] text-muted">Every 2 hours. Tax goes to Lagos State.</p>
            </>
          )}
        </div>
      ) : (
        !ctx.homeUnit && <p className="py-6 text-center text-sm text-muted">Buy a home first, then find a job.</p>
      )}
      {plannedDay.sleep < 8 && (
        <p className="mt-2 rounded-xl bg-hit/10 px-3 py-2 text-xs text-hit">
          Your days leave {fmt(plannedDay.sleep)} hours&apos; sleep a night. Short nights wear your mind down and make interviews harder.
        </p>
      )}

      {ctx.homeUnit && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setOpen(open === "jobs" ? null : "jobs")}
            className={`relative h-12 rounded-2xl text-sm font-semibold ${open === "jobs" ? "bg-ink text-white" : job ? "bg-ink/5" : "bg-gold text-ink"} ${glow && open !== "jobs" ? "ring-2 ring-ink" : ""}`}
          >
            {job ? "Other jobs near me" : "Jobs near me"}
            {glow && open !== "jobs" && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-2xl ring-4 ring-gold/60" />}
          </button>
          <button onClick={() => setOpen(open === "hustle" ? null : "hustle")} className={`h-12 rounded-2xl text-sm font-semibold ${open === "hustle" ? "bg-ink text-white" : "bg-ink/5"}`}>
            Side hustles{hustles.length ? ` (${hustles.length})` : ""}
          </button>
        </div>
      )}

      {open === "jobs" && ctx.homeUnit && (
        <>
          {best.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{plan ? "None close by. Tap buildings on the map." : "Looking…"}</p>
          ) : (
            <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
              {best.map(({ place, job: j, trip, net }) => (
                <li key={`${place.id}/${j.job}`} className="flex items-center gap-3 px-3 py-2.5">
                  <button onClick={() => onShow(place.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{j.title}</p>
                    <p className="truncate text-xs text-muted">
                      {trip.km} km · {COMMUTE_LABEL[trip.mode].toLowerCase()}
                    </p>
                  </button>
                  <p className={`shrink-0 text-sm font-semibold tabular-nums ${net < 0 ? "text-hit" : ""}`}>{money(net)}</p>
                  <button disabled={ctx.busy} onClick={() => ctx.onTake(place, j, trip.mode)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
                    {needsInterview(j) ? "Interview" : job ? "Switch" : "Take"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-muted">What you keep every 2 hours, after tax and fares.</p>
        </>
      )}

      {open === "hustle" && ctx.homeUnit && (
        <div className="mt-2 space-y-2">
          {hustles.map((h) => (
            <div key={h.hustle} className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{h.title}</p>
                <p className="text-xs text-muted">
                  about {money(h.payDay)} every 2 hours · {fmt(h.hours)}h of your day
                  {h.boostUntil && Date.parse(h.boostUntil) > now ? " · boosted ×2" : ""}
                  {h.stalledUntil && Date.parse(h.stalledUntil) > now ? " · stalled" : ""}
                </p>
              </div>
              <button disabled={ctx.busy} onClick={() => onStopHustle(h.hustle)} className="h-8 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold text-hit disabled:opacity-40">
                Stop
              </button>
            </div>
          ))}
          {hustles.length < MAX_HUSTLES ? (
            <>
              <p className="pt-1 text-xs text-muted">
                {hustles.length ? "Add another (up to 3)." : "Run up to 3 beside your job."} Each has a one-off start-up cost from your Savings.
              </p>
              <ul className="divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
                {HUSTLES.filter((h) => !running.has(h.id)).map((h) => {
                  const cost = hustleStart(h, prices);
                  const after = dayPlan({ ...day, hustleHours: day.hustleHours + h.hours });
                  const short = !!h.level && skillLevel(skills[h.skill] ?? 0) < h.level;
                  return (
                    <li key={h.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{h.title}</p>
                          <p className="text-xs text-muted">
                            ~{money(hustleDay(h, prices, skills[h.skill] ?? 0))} every 2h · {h.hours}h of your day
                          </p>
                        </div>
                        <button
                          disabled={ctx.busy || !after.fits || short}
                          onClick={() => onStartHustle(h.id)}
                          className="min-h-8 shrink-0 rounded-full bg-ink px-3 py-1 text-xs font-semibold leading-tight text-white disabled:opacity-35"
                        >
                          {!after.fits ? "No time" : short ? `Lvl ${h.level}` : `Start · ${money(cost)}`}
                        </button>
                      </div>
                      {after.fits && !short && after.sleep < plannedDay.sleep && (
                        <p className="mt-1 text-[11px] text-hit">Leaves {fmt(after.sleep)}h sleep a night: your mind will feel it.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted">That&apos;s 3 side hustles: stop one to start another.</p>
          )}
        </div>
      )}
      {hustles.length > 0 && open !== "hustle" && (
        <p className="mt-2 text-xs text-muted">
          Side hustles: <b className="text-ink">{hustles.map((h) => h.title).join(", ")}</b>, about {money(hustles.reduce((t, h) => t + h.payDay, 0))} every 2 hours, paid in every 14 hours
        </p>
      )}

      {job && (
        <Section title="Getting to work">
          <div className="flex flex-wrap gap-1.5">
            {COMMUTES.map((mode) => {
              const f = km === null ? null : fareMint(mode, km, prices, ferry);
              const on = job.mode === mode;
              const losing = f !== null && dayNet(job.payDay, skills[job.skill] ?? 0, f) < 0;
              return (
                <button
                  key={mode}
                  disabled={ctx.busy || f === null || on}
                  onClick={() => onMode(mode, f === null ? 0 : 2 * f)}
                  className={`flex flex-col items-start rounded-2xl px-3 py-1.5 text-xs ${on ? "bg-ink text-white" : "bg-ink/5 disabled:opacity-35"}`}
                >
                  <span className="font-semibold">{COMMUTE_LABEL[mode]}</span>
                  <span className={on ? "opacity-70" : losing ? "font-semibold text-hit" : "text-muted"}>{f === null ? "too far" : f === 0 ? "free" : money(2 * f)}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}


      <Section title="Assets" right={rent.units ? `${rent.let} of ${rent.units} let` : undefined}>
        {rent.units === 0 ? (
          <p className="text-xs text-muted">Property you let out earns rent here. Buy a room or a shop to rent out.</p>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{rent.daily > 0 ? `${cash(rent.daily)} a day in rent` : "No tenants yet"}</p>
              <button onClick={onProperty} className="text-xs font-semibold text-gold-dark">
                See your property
              </button>
            </div>
            {rent.waiting >= 0.01 && (
              <button disabled={ctx.busy} onClick={onRent} className="h-8 shrink-0 rounded-full bg-gold px-3 text-xs font-semibold text-ink disabled:opacity-40">
                Collect {cash(rent.waiting)}
              </button>
            )}
          </div>
        )}
      </Section>

      {skillList.length > 0 && (
        <Section title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {skillList.map(([skill, d]) => (
              <span key={skill} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs">
                {WORK_SKILLS[skill as WorkSkill] ?? skill} <b>Lv {skillLevel(d)}</b>
              </span>
            ))}
          </div>
        </Section>
      )}

      {job && (
        <button disabled={ctx.busy} onClick={onQuit} className="mt-5 w-full text-center text-xs font-semibold text-hit disabled:opacity-50">
          Leave this job
        </button>
      )}
    </Sheet>
  );
}

/** At most this many side hustles at once (the database's hustles_max). */
const MAX_HUSTLES = 3;

/** "3h 20m", "45m": time until something. */
function hoursLeft(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
}

function Tile({ label, value, bad, strong }: { label: string; value: string; bad?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-2xl px-2 py-2 ${strong ? "bg-panel shadow-sm" : ""}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-display text-sm font-extrabold tabular-nums sm:text-base ${bad ? "text-hit" : ""}`}>{value}</p>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right && <span className="text-xs text-muted">{right}</span>}
      </div>
      {children}
    </section>
  );
}
