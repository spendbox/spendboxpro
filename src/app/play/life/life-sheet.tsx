"use client";

import { useEffect, useState } from "react";
import { GraduationCap, HeartPulse, Sparkles, Stethoscope } from "@/components/icons";
import type { Prices } from "@/lib/world/region";
import {
  AUTO_CARE_BELOW,
  BEDRIDDEN_BELOW,
  CARE,
  CERT_LABEL,
  COURSES,
  healthWord,
  priceOf,
  PROCEDURES,
  SICK_BELOW,
  type Course,
} from "@/lib/world/living";
import type { LifeStatus } from "@/lib/world/property-api";
import { mintLocal } from "@/lib/world/value";
import { GAME_DAY_HOURS, skillLevel, WORK_SKILLS, type Cert } from "@/lib/world/work";
import { Sheet } from "../sheet";

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

type Tab = "health" | "school" | "looks";
const TABS: { id: Tab; label: string; icon: typeof HeartPulse }[] = [
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "school", label: "School", icon: GraduationCap },
  { id: "looks", label: "Looks", icon: Sparkles },
];

/** "90 game days (about 7½ real days)". */
function gameDays(days: number) {
  const hours = days * GAME_DAY_HOURS;
  const d = Math.round((hours / 24) * 2) / 2;
  const real = hours < 24 ? `${hours} real hours` : `about ${d} real ${d === 1 ? "day" : "days"}`;
  return `${days} game ${days === 1 ? "day" : "days"} (${real})`;
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
  skills,
  prices,
  busy,
  onCare,
  onEnrol,
  onProcedure,
  onClose,
}: {
  status: LifeStatus | null;
  /** Game days worked in each skill. */
  skills: Record<string, number>;
  prices: Prices;
  busy: boolean;
  onCare: (id: string) => void;
  onEnrol: (id: string) => void;
  onProcedure: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("health");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const health = status?.health ?? 80;
  const essentials = (status?.pots.essentials ?? 0) + (status?.wallet ?? 0);
  const savings = (status?.pots.savings ?? 0) + (status?.wallet ?? 0);
  const treats = (status?.pots.fun ?? 0) + (status?.pots.savings ?? 0) + (status?.wallet ?? 0);
  const recovering = status?.recoveringUntil ? Date.parse(status.recoveringUntil) > now : false;
  const studying = status?.courses.find((c) => !c.done) ?? null;
  const certs = (status?.courses ?? []).filter((c) => c.done && c.cert).map((c) => c.cert as Cert);
  const tone = health >= AUTO_CARE_BELOW ? "#2f9e44" : health >= SICK_BELOW ? "#f08c00" : "#e03131";

  return (
    <Sheet onClose={onClose} wide>
      <h2 className="font-display text-xl font-extrabold">Life</h2>
      <div className="mt-3 flex gap-1 rounded-full bg-ink/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "health" && (
        <div className="mt-4">
          <div className="flex items-center gap-4 rounded-3xl bg-ink/[0.04] p-4">
            <div className="relative grid size-20 shrink-0 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-ink/10" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={tone} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(health / 100) * 97.4} 97.4`} />
              </svg>
              <span className="font-display text-xl font-extrabold tabular-nums">{Math.round(health)}</span>
            </div>
            <div>
              <p className="font-semibold">{healthWord(health)}</p>
              <p className="text-xs text-muted">
                Health drops a little every game day. Below {SICK_BELOW} you&apos;re unwell (half pay); below {BEDRIDDEN_BELOW}, no work at all. Below {AUTO_CARE_BELOW}, a public clinic
                check-up happens by itself, paid from Essentials.
              </p>
            </div>
          </div>
          {recovering && (
            <p className="mt-3 rounded-2xl bg-gold/15 p-3 text-xs">Recovering until {new Date(status!.recoveringUntil!).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}: no work till then.</p>
          )}
          <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
            {CARE.map((c) => {
              const price = priceOf(c.fee, prices, !c.public);
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Stethoscope className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted">
                      {c.health >= 100 ? "Back to full health" : `+${c.health} health`} · {c.what}
                    </p>
                  </div>
                  <Price total={price.total} prices={prices} vat={price.tax > 0} />
                  <button disabled={busy || essentials < price.total || health >= 99} onClick={() => onCare(c.id)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
                    Go
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === "school" && (
        <div className="mt-4">
          {studying ? (
            <Studying course={studying} now={now} />
          ) : (
            <p className="text-sm text-muted">Study while you work. A course counts as experience in its skill and some give the certificate a better job needs. Fees come from Savings.</p>
          )}
          {certs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {certs.map((c) => (
                <span key={c} className="rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">
                  {CERT_LABEL[c]}
                </span>
              ))}
            </div>
          )}
          <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
            {COURSES.map((c) => (
              <CourseRow key={c.id} c={c} prices={prices} skills={skills} done={!!status?.courses.some((x) => x.course === c.id)} canPay={savings} busy={busy || !!studying} onEnrol={onEnrol} />
            ))}
          </ul>
        </div>
      )}

      {tab === "looks" && (
        <div className="mt-4">
          <p className="text-sm text-muted">At a private clinic (plus 7.5% VAT), paid from Treats, then Savings. Some take game days off work to recover. They&apos;ll show on your avatar when 3D avatars arrive.</p>
          <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
            {PROCEDURES.map((p) => {
              const price = priceOf(p.fee, prices, true);
              const had = status?.procedures.some((x) => x.procedure === p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Sparkles className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {p.title}
                      {had && <span className="ml-2 rounded-full bg-me/15 px-2 py-0.5 text-[11px] font-semibold text-me">Done</span>}
                    </p>
                    <p className="text-xs text-muted">{p.recovery ? `${gameDays(p.recovery)} to recover` : "No time off"}</p>
                  </div>
                  <Price total={price.total} prices={prices} vat />
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

function Price({ total, prices, vat }: { total: number; prices: Prices; vat?: boolean }) {
  return (
    <div className="shrink-0 text-right">
      <p className="text-sm font-semibold tabular-nums">₥{fmt(total)}</p>
      <p className="text-[11px] text-muted">
        {mintLocal(total, prices)}
        {vat ? " inc. VAT" : ""}
      </p>
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
        <p className="text-sm font-medium">
          {c.title}
          {done && <span className="ml-2 rounded-full bg-me/15 px-2 py-0.5 text-[11px] font-semibold text-me">Done</span>}
        </p>
        <p className="text-xs text-muted">
          {gameDays(c.days)} · {c.public ? "public" : "private"} · {WORK_SKILLS[c.skill]} to level {level}
          {c.cert ? ` · opens ${OPENS[c.cert]}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">₥{fmt(price.total)}</p>
        <p className="text-[11px] text-muted">{mintLocal(price.total, prices)}</p>
      </div>
      <button disabled={busy || done || canPay < price.total} onClick={() => onEnrol(c.id)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
        Enrol
      </button>
    </li>
  );
}
