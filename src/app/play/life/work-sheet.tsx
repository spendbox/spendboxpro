"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, ChevronDown, ChevronUp, Coins, MapPin } from "@/components/icons";
import type { CityPlan } from "@/lib/city/layout";
import type { RegionMap } from "@/lib/world/compile";
import { DAY_HOURS, dayPlan, type DayInput } from "@/lib/world/day";
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
import { tripLine, type JobsContext } from "./jobs-here";

const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (n: number) => (n < 0 ? `−₥${fmt(-n)}` : `₥${fmt(n)}`);

const DAY_COLOUR: Record<string, string> = { sleep: "#adb5bd", job: "#2f9e44", commute: "#f08c00", hustle: "#d6336c", study: "#1971c2", exercise: "#12b886", free: "#ffd43b" };

/** Work, kept simple: your job and what you keep, collect, how you travel, your day, a side hustle. */
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
  life: LifeStatus | null;
  day: DayInput;
  region: RegionMap;
  /** The map's plan (for finding jobs near your home). */
  plan: CityPlan | null;
  ctx: JobsContext;
  onStartHustle: (id: string) => void;
  onStopHustle: () => void;
  onCollect: () => void;
  /** Switch how you get to work (the game asks first); `perDay` is what it would cost a game day. */
  onMode: (mode: Commute, perDay: number) => void;
  onQuit: () => void;
  onShow: (placeId: string) => void;
  onClose: () => void;
}) {
  const prices = region.region.prices;
  const job = status?.job ?? null;
  const skills = useMemo(() => status?.skills ?? {}, [status]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const [hustles, setHustles] = useState(false);

  const km = job && ctx.homeUnit ? tripKmBetween(ctx.homeUnit, job.place) : null;
  const fare = job && km !== null ? fareOrBus(job.mode, km, prices) : 0;
  const hustle = life?.hustle ?? null;
  const hustleWaiting = hustle ? hustle.payDay * Math.min(7, Math.max(0, (now - Date.parse(hustle.paidUntil)) / 7_200_000)) * (1 - INCOME_TAX) : 0;
  const waiting = job ? settle({ payDay: job.payDay, paidUntil: Date.parse(job.paidUntil) }, now, skills[job.skill] ?? 0, fare) : null;
  const toCollect = (waiting?.net ?? 0) + hustleWaiting;
  const keep = job ? dayNet(job.payDay, skills[job.skill] ?? 0, fare) : 0;
  const today = dayPlan(day);

  const best = useMemo(() => {
    if (job || !plan || !ctx.homeUnit) return [];
    const m = /:(-?\d+),(-?\d+)/.exec(ctx.homeUnit);
    if (!m) return [];
    const rows = workplacesNear(plan, Number(m[1]), Number(m[2]), 14).flatMap((p) =>
      p.jobs
        .filter((j) => skillLevel(skills[j.skill] ?? 0) >= j.level)
        .map((j) => {
          const trip = tripLine(ctx.homeUnit, p.id, prices);
          return { place: p, job: j, trip, net: dayNet(payDay(j, prices), skills[j.skill] ?? 0, trip.fare) };
        }),
    );
    return rows.sort((a, b) => b.net - a.net).slice(0, 8);
  }, [job, plan, ctx.homeUnit, skills, prices]);

  const skillList = Object.entries(skills)
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1]);
  const blocks = [...today.blocks, { id: "free", label: "Free", hours: today.free }].filter((b) => b.hours > 0);

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
      {job ? (
        <div className="rounded-3xl bg-ink/[0.04] p-4">
          <p className="font-display text-lg font-extrabold leading-tight">{job.title}</p>
          <button onClick={() => onShow(job.place)} className="flex max-w-full items-center gap-1 text-sm text-muted hover:text-ink">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{job.placeName}</span>
          </button>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Tile label="Pay" value={money(job.payDay)} />
            <Tile label="Fares" value={money(2 * fare)} />
            <Tile label="You keep" value={money(keep)} bad={keep < 0} strong />
          </div>
          <p className="mt-1 text-center text-[11px] text-muted">a game day, after tax</p>
          {keep < 0 && <p className="mt-2 rounded-xl bg-hit/10 px-3 py-2 text-center text-xs font-semibold text-hit">Losing money: travel cheaper or work nearer home</p>}
          <button
            disabled={ctx.busy || toCollect < 0.01}
            onClick={onCollect}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gold font-semibold text-ink disabled:opacity-50"
          >
            <Coins className="size-4" /> {toCollect >= 0.01 ? `Collect ${money(toCollect)}` : "Nothing to collect yet"}
          </button>
        </div>
      ) : (
        <>
          {hustleWaiting >= 0.01 && (
            <button disabled={ctx.busy} onClick={onCollect} className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gold font-semibold text-ink disabled:opacity-50">
              <Coins className="size-4" /> Collect {money(hustleWaiting)}
            </button>
          )}
          {!ctx.homeUnit ? (
            <p className="py-6 text-center text-sm text-muted">Buy a home first, then find a job.</p>
          ) : (
            <>
              <p className="text-sm font-semibold">Jobs near you</p>
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
                        {needsInterview(j) ? "Interview" : "Take"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-muted">What you keep a game day, after tax and fares.</p>
            </>
          )}
        </>
      )}

      {job && (
        <Section title="Travel">
          <div className="flex flex-wrap gap-1.5">
            {COMMUTES.map((mode) => {
              const f = km === null ? null : fareMint(mode, km, prices);
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

      <Section title="Your day" right={`${fmt(today.free)}h free`}>
        <div className="flex h-3 overflow-hidden rounded-full">
          {blocks.map((b) => (
            <div key={b.id} title={`${b.label} ${fmt(b.hours)}h`} style={{ width: `${(b.hours / DAY_HOURS) * 100}%`, background: DAY_COLOUR[b.id] }} />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
          {blocks.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: DAY_COLOUR[b.id] }} />
              {b.label} {fmt(b.hours)}h
            </span>
          ))}
        </div>
      </Section>

      {ctx.homeUnit && (
        <Section title="Side hustle">
          {hustle ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{hustle.title}</p>
                <p className="text-xs text-muted">
                  about {money(hustle.payDay)} a day · {fmt(hustle.hours)}h
                  {hustle.boostUntil && Date.parse(hustle.boostUntil) > now ? " · boosted ×2" : ""}
                  {hustle.stalledUntil && Date.parse(hustle.stalledUntil) > now ? " · stalled" : ""}
                </p>
              </div>
              <button disabled={ctx.busy} onClick={onStopHustle} className="h-8 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold text-hit disabled:opacity-40">
                Stop
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setHustles(!hustles)} className="flex w-full items-center justify-between rounded-2xl bg-ink/[0.04] px-3 py-2.5 text-sm font-semibold">
                Add a side hustle {hustles ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              {hustles && (
                <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
                  {HUSTLES.map((h) => {
                    const cost = hustleStart(h, prices);
                    const fits = dayPlan({ ...day, hustleHours: h.hours }).fits;
                    const short = !!h.level && skillLevel(skills[h.skill] ?? 0) < h.level;
                    return (
                      <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{h.title}</p>
                          <p className="truncate text-xs text-muted">
                            ~{money(hustleDay(h, prices, skills[h.skill] ?? 0))}/day · {h.hours}h · start {money(cost)}
                          </p>
                        </div>
                        <button
                          disabled={ctx.busy || !fits || short}
                          onClick={() => onStartHustle(h.id)}
                          className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-35"
                        >
                          {!fits ? "No time" : short ? `Lvl ${h.level}` : "Start"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Section>
      )}

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

function Tile({ label, value, bad, strong }: { label: string; value: string; bad?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-2xl px-2 py-2 ${strong ? "bg-panel shadow-sm" : ""}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-display text-base font-extrabold tabular-nums ${bad ? "text-hit" : ""}`}>{value}</p>
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
