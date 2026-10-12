"use client";

import { cash } from "@/lib/world/value";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Coins, MapPin } from "@/components/icons";
import type { CityPlan } from "@/lib/city/layout";
import type { RegionMap } from "@/lib/world/compile";
import { dayPlan, type DayInput } from "@/lib/world/day";
import { HUSTLES, hustleDay, hustleStart } from "@/lib/world/hustles";
import type { LifeStatus, MoneyFlow, WorkStatus } from "@/lib/world/property-api";
import type { Prices } from "@/lib/world/region";
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
  type WorkJob,
  type WorkSkill,
} from "@/lib/world/work";
import { ferryKmBetween } from "@/lib/world/trips";
import { workplacesNear, type Workplace } from "@/lib/world/workplace";
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
  loadMoney,
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
  /** Money in and out by kind over the last hours (for the totals at the top). */
  loadMoney: (hours: number) => Promise<MoneyFlow>;
}) {
  const prices = region.region.prices;
  const job = status?.job ?? null;
  const skills = useMemo(() => status?.skills ?? {}, [status]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const [tab, setTab] = useState<"job" | "hustles" | "assets" | "invest">("job");
  const [finding, setFinding] = useState(false);
  // What came in over the last 7 days, by where it came from.
  const [week, setWeek] = useState<MoneyFlow | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMoney(7 * 24).then((m) => alive && setWeek(m));
    return () => {
      alive = false;
    };
  }, [loadMoney]);

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

  const skillList = Object.entries(skills)
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1]);
  const w = (kinds: string[]) => kinds.reduce((t, k) => t + (week?.[k] ?? 0), 0);
  const fromJob = w(["work_pay", "public_pay", "bonus"]);
  const fromHustles = w(["hustle_pay"]);
  const fromRent = w(["rent"]);
  const taxes = -w(["income_tax", "rent_tax"]);
  const travel = -w(["commute"]);
  const kept = fromJob + fromHustles + fromRent - taxes - travel;
  const hustlePer2h = hustles.reduce((t, h) => t + h.payDay, 0) * (1 - INCOME_TAX);
  const rentPer2h = rent.daily / 12;
  const per2h = (job ? keep : 0) + hustlePer2h + rentPer2h;

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
      {/* What you make: now (every 2 hours, after tax and fares) and over the last 7 days. */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-2xl p-3 ${per2h >= 0 ? "bg-[#2f9e44]/10" : "bg-[#e03131]/10"}`}>
          <p className="text-[11px] text-muted">Every 2 hours now</p>
          <p className={`font-display text-xl font-extrabold tabular-nums ${per2h >= 0 ? "text-[#2b8a3e]" : "text-[#c92a2a]"}`}>{money(per2h)}</p>
          <p className="text-[11px] text-muted">after tax and fares</p>
        </div>
        <div className="rounded-2xl bg-ink/[0.04] p-3">
          <p className="text-[11px] text-muted">Kept in the last 7 days</p>
          <p className="font-display text-xl font-extrabold tabular-nums">{week ? money(kept) : "…"}</p>
          <p className="text-[11px] text-muted">real days</p>
        </div>
      </div>
      {week && fromJob + fromHustles + fromRent > 0 && (
        <ul className="mt-2 space-y-1 rounded-2xl bg-ink/[0.03] px-3 py-2 text-xs">
          {(
            [
              ["Job", fromJob, "#2f9e44"],
              ["Side hustles", fromHustles, "#d6336c"],
              ["Rent", fromRent, "#37b24d"],
              ["Tax", -taxes, "#7048e8"],
              ["Getting to work", -travel, "#f08c00"],
            ] as const
          )
            .filter(([, v]) => Math.abs(v) >= 0.01)
            .map(([label, v, colour]) => (
              <li key={label} className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: colour }} />
                <span className="flex-1 text-muted">{label}</span>
                <span className="tabular-nums">{money(v)}</span>
              </li>
            ))}
        </ul>
      )}

      <div className="mt-4 flex gap-1 rounded-full bg-ink/5 p-1">
        {(
          [
            ["job", "Job"],
            ["hustles", `Hustles${hustles.length ? ` (${hustles.length})` : ""}`],
            ["assets", "Assets"],
            ["invest", "Invest"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${tab === id ? "bg-panel shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "job" && (
        <div className="mt-3">
          {!ctx.homeUnit ? (
            <p className="py-6 text-center text-sm text-muted">Buy a home first, then find a job.</p>
          ) : job ? (
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
                {keep < 0 ? `Losing ${money(-keep)} every 2 hours` : <>You keep <b>{money(keep)}</b> every 2 hours</>}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <Coins className="size-3.5 shrink-0" />
                Paid in every 14 hours{waiting && waiting.net >= 0.01 ? ` (${money(waiting.net)} so far)` : ""} · next in {hoursLeft(nextPay)}
              </p>
              <button onClick={() => setDetails((d) => !d)} className="mt-2 text-xs font-semibold text-gold-dark">
                {details ? "Hide details" : "Details"}
              </button>
              {details && (
                <>
                  <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                    <Tile label="Pay" value={money(gross)} />
                    <Tile label={`Tax ${Math.round(INCOME_TAX * 100)}%`} value={`−${money(tax)}`} />
                    <Tile label="Fares" value={`−${money(2 * fare)}`} />
                    <Tile label="You keep" value={money(keep)} bad={keep < 0} strong />
                  </div>
                  <p className="mt-1 text-center text-[11px] text-muted">Every 2 hours.</p>
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
                  <button disabled={ctx.busy} onClick={onQuit} className="mt-4 text-xs font-semibold text-hit disabled:opacity-50">
                    Leave this job
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-muted">No job yet.</p>
          )}
          {plannedDay.sleep < 8 && (
            <p className="mt-2 rounded-xl bg-hit/10 px-3 py-2 text-xs text-hit">Only {fmt(plannedDay.sleep)}h sleep a night: your mind will feel it.</p>
          )}
          {ctx.homeUnit && (
            <button
              onClick={() => setFinding(true)}
              className={`relative mt-3 h-12 w-full rounded-2xl text-sm font-semibold ${job ? "bg-ink/5" : "bg-gold text-ink"} ${glow ? "ring-2 ring-ink" : ""}`}
            >
              Find jobs
              {glow && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-2xl ring-4 ring-gold/60" />}
            </button>
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
        </div>
      )}

      {tab === "hustles" && (
        <div className="mt-3 space-y-2">
          {!ctx.homeUnit && <p className="py-6 text-center text-sm text-muted">Buy a home first.</p>}
          {ctx.homeUnit &&
            hustles.map((h) => (
              <div key={h.hustle} className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="text-xs text-muted">
                    {money(h.payDay)} every 2h · {fmt(h.hours)}h of your day
                    {h.boostUntil && Date.parse(h.boostUntil) > now ? " · boosted ×2" : ""}
                    {h.stalledUntil && Date.parse(h.stalledUntil) > now ? " · stalled" : ""}
                  </p>
                </div>
                <button disabled={ctx.busy} onClick={() => onStopHustle(h.hustle)} className="h-8 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold text-hit disabled:opacity-40">
                  Stop
                </button>
              </div>
            ))}
          {ctx.homeUnit &&
            (hustles.length < MAX_HUSTLES ? (
              <>
                <p className="pt-1 text-xs text-muted">Run up to 3. Each costs once to start.</p>
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
                        {after.fits && !short && after.sleep < plannedDay.sleep && <p className="mt-1 text-[11px] text-hit">Leaves {fmt(after.sleep)}h sleep a night.</p>}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="text-xs text-muted">That&apos;s 3: stop one to start another.</p>
            ))}
        </div>
      )}

      {tab === "assets" && (
        <div className="mt-3">
          {rent.units === 0 ? (
            <p className="rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-muted">Buy a room or a shop and let it out: tenants pay you rent.</p>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{rent.daily > 0 ? `${cash(rent.daily)} a day in rent` : "No tenants yet"}</p>
                <p className="text-xs text-muted">
                  {rent.let} of {rent.units} let ·{" "}
                  <button onClick={onProperty} className="font-semibold text-gold-dark">
                    See your property
                  </button>
                </p>
              </div>
              {rent.waiting >= 0.01 && (
                <button disabled={ctx.busy} onClick={onRent} className="h-8 shrink-0 rounded-full bg-gold px-3 text-xs font-semibold text-ink disabled:opacity-40">
                  Collect {cash(rent.waiting)}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "invest" && (
        <div className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-6 text-center">
          <p className="font-display text-lg font-extrabold">Investments</p>
          <p className="mt-1 text-sm text-muted">Coming soon: shares, savings plans and more.</p>
        </div>
      )}

      {finding && plan && ctx.homeUnit && (
        <FindJobs
          plan={plan}
          home={ctx.homeUnit}
          prices={prices}
          skills={skills}
          current={job ? { place: job.place, job: job.job } : null}
          busy={ctx.busy}
          onShow={(id) => {
            setFinding(false);
            onShow(id);
          }}
          onTake={(place, j, mode) => {
            setFinding(false);
            ctx.onTake(place, j, mode);
          }}
          onClose={() => setFinding(false)}
        />
      )}
    </Sheet>
  );
}

/** How far to look for jobs (tiles of 100 m), and how finely (far rings look at every other tile). */
const RANGES = [
  { id: "near", label: "Near", radius: 15, step: 1, note: "within 1.5 km" },
  { id: "town", label: "Across town", radius: 45, step: 2, note: "within 4.5 km" },
  { id: "far", label: "Far", radius: 90, step: 3, note: "within 9 km" },
] as const;

/** Find jobs: near and far, sorted by what you'd keep or by pay, only ones you can take now if you like. */
function FindJobs({
  plan,
  home,
  prices,
  skills,
  current,
  busy,
  onShow,
  onTake,
  onClose,
}: {
  plan: CityPlan;
  home: string;
  prices: Prices;
  skills: Record<string, number>;
  current: { place: string; job: string } | null;
  busy: boolean;
  onShow: (placeId: string) => void;
  onTake: (place: Workplace, job: WorkJob, mode: Commute) => void;
  onClose: () => void;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("near");
  const [sort, setSort] = useState<"keep" | "pay">("keep");
  const [canTake, setCanTake] = useState(true);
  const [skill, setSkill] = useState<WorkSkill | "all">("all");
  const [rows, setRows] = useState<{ place: Workplace; job: WorkJob; trip: ReturnType<typeof tripLine>; net: number; pay: number }[] | null>(null);
  // Looking further takes a moment: done after the pop-up has drawn, so it never freezes the tap.
  useEffect(() => {
    let alive = true;
    const r = RANGES.find((x) => x.id === range)!;
    const t = setTimeout(() => {
      const m = /:(-?\d+),(-?\d+)/.exec(home);
      if (!m) return;
      const found = workplacesNear(plan, Number(m[1]), Number(m[2]), r.radius, r.step).flatMap((p) =>
        p.jobs.map((j) => {
          const trip = tripLine(home, p.id, prices);
          const pay = payDay(j, prices);
          return { place: p as Workplace, job: j, trip, pay, net: dayNet(pay, skills[j.skill] ?? 0, trip.fare) };
        }),
      );
      if (alive) setRows(found);
    }, 30);
    setRows(null);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [range, plan, home, prices, skills]);
  const shown = (rows ?? [])
    .filter((r) => !(current?.place === r.place.id && current.job === r.job.job))
    .filter((r) => !canTake || skillLevel(skills[r.job.skill] ?? 0) >= r.job.level)
    .filter((r) => skill === "all" || r.job.skill === skill)
    .sort((a, b) => (sort === "keep" ? b.net - a.net : b.pay - a.pay))
    .slice(0, 40);
  const skillsHere = [...new Set((rows ?? []).map((r) => r.job.skill))];
  return (
    <Sheet onClose={onClose} wide title="Find jobs" above>
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setRange(r.id)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${range === r.id ? "bg-panel shadow-sm" : "text-muted"}`}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <select value={sort} onChange={(e) => setSort(e.target.value as "keep" | "pay")} className="h-8 rounded-full bg-ink/5 px-3 font-semibold" aria-label="Sort by">
          <option value="keep">Most you keep</option>
          <option value="pay">Highest pay</option>
        </select>
        <select value={skill} onChange={(e) => setSkill(e.target.value as WorkSkill | "all")} className="h-8 rounded-full bg-ink/5 px-3 font-semibold" aria-label="Kind of work">
          <option value="all">Any kind of work</option>
          {skillsHere.map((k) => (
            <option key={k} value={k}>
              {WORK_SKILLS[k]}
            </option>
          ))}
        </select>
        <label className="flex h-8 items-center gap-1.5 rounded-full bg-ink/5 px-3 font-semibold">
          <input type="checkbox" checked={canTake} onChange={(e) => setCanTake(e.target.checked)} /> I can do it now
        </label>
      </div>
      {rows === null ? (
        <p className="py-8 text-center text-sm text-muted">Looking {RANGES.find((r) => r.id === range)!.note}…</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nothing here. Try further away, or another kind of work.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {shown.map(({ place, job: j, trip, net, pay }) => {
            const short = skillLevel(skills[j.skill] ?? 0) < j.level;
            return (
              <li key={`${place.id}/${j.job}`} className="flex items-center gap-3 px-3 py-2.5">
                <button onClick={() => onShow(place.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{j.title}</p>
                  <p className="truncate text-xs text-muted">
                    {place.name} · {trip.km} km
                  </p>
                </button>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-semibold tabular-nums ${net < 0 ? "text-hit" : ""}`}>{money(sort === "keep" ? net : pay)}</p>
                  <p className="text-[10px] text-muted">{sort === "keep" ? "you keep / 2h" : "pay / 2h"}</p>
                </div>
                <button
                  disabled={busy || short}
                  onClick={() => onTake(place, j, trip.mode)}
                  className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {short ? `Lvl ${j.level}` : needsInterview(j) ? "Interview" : current ? "Switch" : "Take"}
                </button>
              </li>
            );
          })}
        </ul>
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
