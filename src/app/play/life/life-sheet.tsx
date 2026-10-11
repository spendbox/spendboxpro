"use client";

import { useEffect, useState } from "react";
import { Clock, GraduationCap, HeartPulse, Sparkles, Stethoscope } from "@/components/icons";
import type { Prices } from "@/lib/world/region";
import {
  AUTO_CARE_BELOW,
  BEDRIDDEN_BELOW,
  CARE,
  CERT_LABEL,
  COURSE_KINDS,
  COURSES,
  healthWord,
  priceOf,
  PROCEDURES,
  SICK_BELOW,
  type Course,
} from "@/lib/world/living";
import { dayEffectsOf, dayPlan, EXERCISE, EXERCISES, mindWord, STRESSED_BELOW, type DayInput, type Exercise } from "@/lib/world/day";
import type { LifeStatus } from "@/lib/world/property-api";
import { cash } from "@/lib/world/value";
import { GAME_DAY_HOURS, skillLevel, WORK_SKILLS, type Cert } from "@/lib/world/work";
import { Sheet } from "../sheet";

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

type Tab = "day" | "health" | "school" | "looks";
const TABS: { id: Tab; label: string; icon: typeof HeartPulse }[] = [
  { id: "day", label: "Your day", icon: Clock },
  { id: "health", label: "Body & Mind", icon: HeartPulse },
  { id: "school", label: "Education", icon: GraduationCap },
  { id: "looks", label: "Looks", icon: Sparkles },
];
const DAY_COLOUR: Record<string, string> = { sleep: "#adb5bd", job: "#2f9e44", commute: "#f08c00", hustle: "#d6336c", study: "#1971c2", exercise: "#12b886", free: "#ffd43b" };

/** How long a course takes in real time: "7½ days", "10 hours". */
function gameDays(days: number) {
  const hours = days * GAME_DAY_HOURS;
  const d = Math.round((hours / 24) * 2) / 2;
  return hours < 24 ? `${hours} hours` : `${String(d).replace(".5", "½")} ${d === 1 ? "day" : "days"}`;
}

/** Which jobs a certificate opens (by title). */
const OPENS: Partial<Record<Cert, string>> = {
  nursing: "Nurse",
  mbbs: "Doctor",
  pilot: "Pilot",
  teaching: "Teacher",
  masters: "Lecturer",
  ican: "Accountant",
};

/** Your life: health and care, school, and treats. */
export function LifeSheet({
  status,
  day,
  skills,
  prices,
  busy,
  onExercise,
  onCare,
  onEnrol,
  onProcedure,
  onClose,
}: {
  status: LifeStatus | null;
  /** Your day as you live it now. */
  day: DayInput | null;
  onExercise: (e: Exercise) => void;
  /** Game days worked in each skill. */
  skills: Record<string, number>;
  prices: Prices;
  busy: boolean;
  onCare: (id: string) => void;
  onEnrol: (id: string) => void;
  onProcedure: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("day");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const health = status?.health ?? 80;
  const mind = status?.mind ?? 70;
  const plan = day ? dayPlan(day) : null;
  const essentials = (status?.pots.essentials ?? 0) + (status?.wallet ?? 0);
  const savings = (status?.pots.savings ?? 0) + (status?.wallet ?? 0);
  const treats = (status?.pots.fun ?? 0) + (status?.pots.savings ?? 0) + (status?.wallet ?? 0);
  const recovering = status?.recoveringUntil ? Date.parse(status.recoveringUntil) > now : false;
  const studying = status?.courses.find((c) => !c.done) ?? null;
  const certs = (status?.courses ?? []).filter((c) => c.done && c.cert).map((c) => c.cert as Cert);
  const tone = health >= AUTO_CARE_BELOW ? "#2f9e44" : health >= SICK_BELOW ? "#f08c00" : "#e03131";

  const [kind, setKind] = useState(COURSE_KINDS[0].kind);
  const [explain, setExplain] = useState<"body" | "mind" | null>(null);
  const effects = day ? dayEffectsOf(day).filter((e) => (explain === "body" ? e.body : e.mind) !== 0) : [];
  const exercise = status?.exercise ?? "none";

  return (
    <Sheet onClose={onClose} wide title="Life">
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-full text-[11px] font-semibold transition sm:text-xs ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}
          >
            <t.icon className="size-3.5 max-[380px]:hidden" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "day" && plan && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">A game day (2 real hours)</p>
            <p className="text-xs text-muted">{fmt(plan.free)}h free</p>
          </div>
          <div className="mt-2 flex h-4 overflow-hidden rounded-full">
            {[...plan.blocks, { id: "free", label: "Free time", hours: plan.free }]
              .filter((b) => b.hours > 0)
              .map((b) => (
                <div key={b.id} title={`${b.label} ${fmt(b.hours)}h`} style={{ width: `${(b.hours / 24) * 100}%`, background: DAY_COLOUR[b.id] }} />
              ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {[...plan.blocks, { id: "free", label: "Free time", hours: plan.free }]
              .filter((b) => b.hours > 0)
              .map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: DAY_COLOUR[b.id] }} />
                  <span className="flex-1">{b.label}</span>
                  <b className="tabular-nums">{fmt(b.hours)}h</b>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {plan.free < 4 ? "Not much free time: your mind wears down. Drop a side hustle or work nearer home." : "Free time keeps your mind well. Exercise is in Body & Mind."}
          </p>
        </div>
      )}

      {tab === "health" && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2">
            <Meter label="Body" value={health} word={healthWord(health)} colour={tone} change={plan?.body} on={explain === "body"} onTap={() => setExplain(explain === "body" ? null : "body")} />
            <Meter
              label="Mind"
              value={mind}
              word={mindWord(mind)}
              colour={mind >= 50 ? "#7048e8" : mind >= STRESSED_BELOW ? "#f08c00" : "#e03131"}
              change={plan?.mind}
              on={explain === "mind"}
              onTap={() => setExplain(explain === "mind" ? null : "mind")}
            />
          </div>
          {explain ? (
            <div className="mt-2 rounded-2xl bg-ink/[0.04] p-3">
              <p className="text-xs font-semibold">Your {explain} each game day</p>
              <ul className="mt-1.5 space-y-1">
                {effects.map((e) => {
                  const v = explain === "body" ? e.body : e.mind;
                  return (
                    <li key={e.label} className="flex justify-between gap-2 text-xs">
                      <span>{e.label}</span>
                      <b className={`tabular-nums ${v > 0 ? "text-me" : "text-hit"}`}>
                        {v > 0 ? "+" : ""}
                        {fmt(v)}
                      </b>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted">
                {explain === "body" ? "Exercise and seeing a doctor (below) build it up." : "Free time, exercise, talking to someone and a weekend away (below) build it up."}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-center text-[11px] text-muted">Tap Body or Mind to see what adds to it and what uses it up.</p>
          )}
          {health < SICK_BELOW && <p className="mt-2 text-xs font-semibold text-hit">{health < BEDRIDDEN_BELOW ? "Too ill to work. See a doctor." : "Unwell: half pay until you're better."}</p>}
          {mind < STRESSED_BELOW && <p className="mt-2 text-xs font-semibold text-hit">Stressed: interviews are harder. Rest or talk to someone.</p>}
          {recovering && (
            <p className="mt-2 rounded-2xl bg-gold/15 p-3 text-xs">Away until {new Date(status!.recoveringUntil!).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}: no work till then.</p>
          )}

          <h3 className="mt-5 text-sm font-semibold">Exercise</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXERCISES.map((e) => {
              const fits = !day || dayPlan({ ...day, exercise: e }).fits;
              return (
                <button
                  key={e}
                  disabled={busy || exercise === e || !fits}
                  onClick={() => onExercise(e)}
                  title={fits ? EXERCISE[e].what : "Won't fit in your day"}
                  className={`h-8 rounded-full px-3 text-xs font-semibold ${exercise === e ? "bg-ink text-white" : "bg-ink/5 disabled:opacity-40"}`}
                >
                  {EXERCISE[e].label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{EXERCISE[exercise].what}</p>

          <h3 className="mt-5 text-sm font-semibold">Feel better</h3>
          <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
            {CARE.map((c) => {
              const price = priceOf(c.fee, prices, !c.public);
              const can = c.away ? treats : essentials;
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                  {c.meter === "body" ? <Stethoscope className="size-4 shrink-0 text-muted" /> : <HeartPulse className="size-4 shrink-0 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="mt-0.5 flex flex-wrap gap-1">
                      {c.health > 0 && <Chip strong>{c.health >= 100 ? "Body full" : `+${c.health} body`}</Chip>}
                      {!!c.mind && <Chip strong>+{c.mind} mind</Chip>}
                      {!!c.away && <Chip>{c.away} days off</Chip>}
                    </p>
                  </div>
                  <Price total={price.total} prices={prices} />
                  <button disabled={busy || can < price.total || (c.away ? recovering : false)} onClick={() => onCare(c.id)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
                    Go
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">Below {AUTO_CARE_BELOW} body, a clinic check-up happens by itself.</p>
        </div>
      )}

      {tab === "school" && (
        <div className="mt-4">
          {studying && <Studying course={studying} now={now} />}
          {certs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {certs.map((c) => (
                <span key={c} className="rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">
                  {CERT_LABEL[c]}
                </span>
              ))}
            </div>
          )}
          <div className={`${studying || certs.length ? "mt-4" : ""} flex flex-wrap gap-1.5`}>
            {COURSE_KINDS.filter((k) => COURSES.some((c) => c.kind === k.kind)).map((k) => (
              <button key={k.kind} onClick={() => setKind(k.kind)} className={`h-8 rounded-full px-3 text-xs font-semibold ${kind === k.kind ? "bg-ink text-white" : "bg-ink/5"}`}>
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{COURSE_KINDS.find((k) => k.kind === kind)?.what}. Study while you work; fees from Savings.</p>
          <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
            {COURSES.filter((c) => c.kind === kind).map((c) => (
              <CourseRow key={c.id} c={c} prices={prices} skills={skills} done={!!status?.courses.some((x) => x.course === c.id)} canPay={savings} busy={busy || !!studying} onEnrol={onEnrol} />
            ))}
          </ul>
        </div>
      )}

      {tab === "looks" && (
        <div className="mt-4">
          <p className="text-xs text-muted">Private clinic, paid from Treats, then Savings.</p>
          <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
            {PROCEDURES.map((p) => {
              const price = priceOf(p.fee, prices, true);
              const had = status?.procedures.some((x) => x.procedure === p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Sparkles className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.title}
                      {had && <span className="ml-2 rounded-full bg-me/15 px-2 py-0.5 text-[11px] font-semibold text-me">Done</span>}
                    </p>
                    <p className="text-xs text-muted">{p.recovery ? `${p.recovery} days off` : "No time off"}</p>
                  </div>
                  <Price total={price.total} prices={prices} />
                  <button disabled={busy || recovering || treats < price.total} onClick={() => onProcedure(p.id)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
                    Book
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

function Meter({ label, value, word, colour, change, on, onTap }: { label: string; value: number; word: string; colour: string; change?: number; on?: boolean; onTap?: () => void }) {
  return (
    <button onClick={onTap} className={`flex items-center gap-3 rounded-3xl p-3 text-left ${on ? "bg-ink/[0.08] ring-2 ring-ink/20" : "bg-ink/[0.04]"}`}>
      <div className="relative grid size-14 shrink-0 place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-ink/10" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={colour} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(value / 100) * 97.4} 97.4`} />
        </svg>
        <span className="font-display text-base font-extrabold tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-semibold leading-tight">{word}</p>
        {change !== undefined && (
          <p className={`text-[11px] font-semibold ${change > 0 ? "text-me" : change < 0 ? "text-hit" : "text-muted"}`}>
            {change > 0 ? "+" : ""}
            {fmt(change)} a day
          </p>
        )}
      </div>
    </button>
  );
}

function Price({ total, vat }: { total: number; prices?: Prices; vat?: boolean }) {
  return (
    <div className="shrink-0 text-right">
      <p className="text-sm font-semibold tabular-nums">{cash(total)}</p>
      {vat && <p className="text-[11px] text-muted">inc. VAT</p>}
    </div>
  );
}

function Studying({ course, now }: { course: LifeStatus["courses"][number]; now: number }) {
  const start = Date.parse(course.startedAt);
  const end = Date.parse(course.endsAt);
  const done = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  return (
    <div className="rounded-2xl bg-ink/[0.04] p-3.5">
      <p className="text-xs text-muted">Studying</p>
      <p className="font-semibold">{course.title}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-gold" style={{ width: `${done * 100}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {Math.round(done * 100)}% · finishes {new Date(end).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

function CourseRow({ c, prices, skills, done, canPay, busy, onEnrol }: { c: Course; prices: Prices; skills: Record<string, number>; done: boolean; canPay: number; busy: boolean; onEnrol: (id: string) => void }) {
  const price = priceOf(c.fee, prices, false);
  const level = skillLevel((skills[c.skill] ?? 0) + c.grants);
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <GraduationCap className="size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{c.title}</p>
        <p className="mt-0.5 flex flex-wrap gap-1">
          {c.cert && <Chip strong>Opens {OPENS[c.cert]}</Chip>}
          <Chip>
            {WORK_SKILLS[c.skill]} Lv {level}
          </Chip>
          <Chip>{gameDays(c.days)}</Chip>
        </p>
      </div>
      <Price total={price.total} prices={prices} />
      {done ? (
        <span className="shrink-0 rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">Done</span>
      ) : (
        <button disabled={busy || canPay < price.total} onClick={() => onEnrol(c.id)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
          Enrol
        </button>
      )}
    </li>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${strong ? "bg-gold/20 font-semibold text-gold-dark" : "bg-ink/5 text-muted"}`}>{children}</span>;
}
