"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Briefcase, Check, Coins, DoorOpen, GraduationCap, LoaderCircle, Lock, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { INTERVIEW_LENGTH, payWithSkill, SKILLS, type Job, type Skill } from "@/lib/jobs";
import { applyForJob, collectPay, jobOffer, jobStatus, quitJob, type JobOffer, type JobStatus, type Pay } from "./job-actions";
import { Sheet } from "./sheet";

// Jobs: apply at the place you're in (a short trivia interview about the town), or look at your
// job: pay waiting to be collected (taxed), quitting, and your skills.

type Step =
  | { kind: "loading" }
  | { kind: "error"; text: string }
  | { kind: "offer"; offer: JobOffer }
  | { kind: "interview"; offer: JobOffer; at: number; answers: number[] }
  | { kind: "result"; hired: boolean; score: number; outOf: number; pass: number; job: Job; skipped: boolean }
  | { kind: "status"; status: JobStatus; paid?: Pay; note?: string };

export function JobsSheet({
  place,
  onClose,
  onChanged,
}: {
  /** Apply here (the place you're in), or null to just see your job. */
  place: { id: string; name: string } | null;
  onClose: () => void;
  /** Mint changed (pay collected): refresh the screen. */
  onChanged: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (place ? jobOffer(place.id, place.name).then((r) => (r.ok ? ({ kind: "offer", offer: r.offer } as Step) : ({ kind: "error", text: r.error } as Step))) : jobStatus().then((r) => (r.ok ? ({ kind: "status", status: r.status } as Step) : ({ kind: "error", text: r.error } as Step))))
      .catch(() => ({ kind: "error", text: "The connection blinked. Try again." }) as Step)
      .then((s) => live && setStep(s));
    return () => {
      live = false;
    };
  }, [place]);

  async function apply(answers: number[] | null) {
    if (!place) return;
    setBusy(true);
    const r = await applyForJob(place.id, place.name, answers).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!r.ok) return setStep({ kind: "error", text: r.error });
    setStep({ kind: "result", hired: r.hired, score: r.score, outOf: r.outOf, pass: r.pass, job: r.job, skipped: !answers });
    onChanged();
  }
  async function showStatus(note?: string, run?: () => Promise<{ ok: true; pay: Pay } | { ok: false; error: string }>) {
    setBusy(true);
    let paid: Pay | undefined;
    if (run) {
      const r = await run().catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
      if (!r.ok) {
        setBusy(false);
        return setStep({ kind: "error", text: r.error });
      }
      paid = r.pay;
      onChanged();
    }
    const s = await jobStatus().catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    setStep(s.ok ? { kind: "status", status: s.status, paid, note } : { kind: "error", text: s.error });
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-[#e7f5ff] text-[#1971c2]">
          <Briefcase className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-extrabold leading-tight">{place && step.kind !== "status" ? "Jobs here" : "My job"}</h2>
          <p className="truncate text-xs text-muted">{place && step.kind !== "status" ? place.name : "Work, pay and skills"}</p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      {step.kind === "loading" && (
        <div className="grid place-items-center py-10 text-muted">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      )}

      {step.kind === "error" && (
        <div className="mt-4 space-y-3">
          <p className="rounded-2xl bg-panel-2 p-4 text-sm">{step.text}</p>
          <button onClick={() => showStatus()} className="w-full rounded-2xl bg-panel-2 py-2.5 text-sm font-semibold hover:bg-line">
            See my job
          </button>
        </div>
      )}

      {step.kind === "offer" && <Offer offer={step.offer} busy={busy} onStart={() => (step.offer.noInterview ? apply(null) : setStep({ kind: "interview", offer: step.offer, at: 0, answers: [] }))} onMine={() => showStatus()} />}

      {step.kind === "interview" && (
        <Interview
          step={step}
          busy={busy}
          onAnswer={(k) => {
            const answers = [...step.answers, k];
            if (answers.length >= step.offer.questions.length) void apply(answers);
            else setStep({ ...step, at: step.at + 1, answers });
          }}
        />
      )}

      {step.kind === "result" && (
        <div className="mt-4 space-y-3 text-center">
          {step.hired ? (
            <>
              <BadgeCheck className="mx-auto size-12 text-me" />
              <p className="font-display text-2xl font-extrabold">You&apos;re hired!</p>
              <p className="text-sm text-muted">
                {step.skipped ? `Your ${SKILLS[step.job.skill].label.toLowerCase()} skill got you straight in.` : `You scored ${step.score} out of ${step.outOf}.`} You&apos;re now a{/^[aeiou]/i.test(step.job.title) ? "n" : ""}{" "}
                <b>{step.job.title.toLowerCase()}</b>, earning <b>₥{short(step.job.pay)} an hour</b> while this town lasts. Collect your pay from My job.
              </p>
            </>
          ) : (
            <>
              <Lock className="mx-auto size-12 text-hit" />
              <p className="font-display text-2xl font-extrabold">Not this time</p>
              <p className="text-sm text-muted">
                You scored {step.score} out of {step.outOf}, and they needed {step.pass}. You can&apos;t apply here again in this town, but other places are hiring. Tip: look
                around the town (street signs, the station, famous places) before your next interview.
              </p>
            </>
          )}
          <button onClick={() => showStatus()} className="w-full rounded-2xl bg-ink py-2.5 text-sm font-semibold text-white">
            My job
          </button>
        </div>
      )}

      {step.kind === "status" && (
        <Status step={step} busy={busy} onCollect={() => showStatus(undefined, collectPay)} onQuit={() => showStatus("You left your job.", quitJob)} />
      )}
    </Sheet>
  );
}

function Offer({ offer, busy, onStart, onMine }: { offer: JobOffer; busy: boolean; onStart: () => void; onMine: () => void }) {
  const { job, status } = offer;
  const skill = status.skills.find((s) => s.skill === job.skill);
  const level = skill?.level ?? 0;
  const already = status.job;
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl bg-panel-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">They&apos;re hiring</p>
        <p className="font-display text-2xl font-extrabold">{job.title}</p>
        <p className="mt-1 text-sm">
          <b className="text-gold-dark">₥{short(payWithSkill(job.pay, level, status.skillBonus))} an hour</b>
          {level > 0 && <span className="text-muted"> (with your level {level} skill)</span>}, {Math.round(status.tax * 100)}% tax.
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <GraduationCap className="size-4 shrink-0" style={{ color: SKILLS[job.skill].colour }} />
          Builds your {SKILLS[job.skill].label.toLowerCase()} skill.
        </p>
      </div>
      <p className="text-sm text-muted">
        {offer.noInterview
          ? `You've worked in ${SKILLS[job.skill].label.toLowerCase()} before, so no interview: you can start now.`
          : `First, a quick interview: ${INTERVIEW_LENGTH} questions about this town. Get ${offer.passMark} right to get the job. Fail and you can't apply here again in this town.`}
        {already && ` Taking this job ends your job as ${already.title.toLowerCase()} at ${already.placeName} (you'll be paid what you've earned).`}
      </p>
      <button disabled={busy} onClick={onStart} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 font-semibold text-white disabled:opacity-60">
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Briefcase className="size-4" />}
        {offer.noInterview ? "Take the job" : "Start the interview"}
      </button>
      <button onClick={onMine} className="w-full rounded-2xl py-2 text-sm font-semibold text-muted hover:bg-panel-2">
        My job and skills
      </button>
    </div>
  );
}

function Interview({ step, busy, onAnswer }: { step: Extract<Step, { kind: "interview" }>; busy: boolean; onAnswer: (k: number) => void }) {
  const q = step.offer.questions[step.at];
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-1">
        {step.offer.questions.map((_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < step.at ? "bg-me" : i === step.at ? "bg-ink" : "bg-line")} />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Question {step.at + 1} of {step.offer.questions.length}
      </p>
      <p className="font-display text-lg font-bold leading-snug">{q.q}</p>
      <div className="grid gap-2">
        {q.options.map((o, k) => (
          <button key={k} disabled={busy} onClick={() => onAnswer(k)} className="rounded-2xl bg-panel-2 px-4 py-3 text-left text-sm font-semibold hover:bg-[#e7f5ff] disabled:opacity-60">
            {o}
          </button>
        ))}
      </div>
      {busy && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Marking your answers…
        </p>
      )}
    </div>
  );
}

function Status({ step, busy, onCollect, onQuit }: { step: Extract<Step, { kind: "status" }>; busy: boolean; onCollect: () => void; onQuit: () => void }) {
  const { status, paid, note } = step;
  const job = status.job;
  const level = (s: Skill) => status.skills.find((k) => k.skill === s)?.level ?? 0;
  return (
    <div className="mt-4 space-y-3">
      {note && <p className="rounded-2xl bg-panel-2 p-3 text-sm">{note}</p>}
      {paid && paid.gross > 0 && (
        <p className="rounded-2xl bg-[#d3f9d8] p-3 text-sm">
          Paid <b>₥{short(paid.net)}</b> (₥{short(paid.gross)} less ₥{short(paid.tax)} tax, which went into the prize pool).
          {paid.capped && " That's all the paid hours for today."}
        </p>
      )}
      {job ? (
        <div className="rounded-2xl bg-panel-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">You work at {job.placeName}</p>
          <p className="font-display text-2xl font-extrabold">{job.title}</p>
          <p className="text-sm">
            <b className="text-gold-dark">₥{short(payWithSkill(job.payHour, level(job.skill), status.skillBonus))} an hour</b> until this town ends.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl bg-panel-2 p-4 text-sm">
          No job right now. Go into any business (an office, a shop, a restaurant, a bank, a hotel, the station...) and tap <b>Jobs</b> to apply.
        </p>
      )}
      <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
        <Coins className="size-5 shrink-0 text-gold-dark" />
        <div className="min-w-0 flex-1 text-sm">
          <b>₥{short(status.owed)}</b> earned, waiting for you
          <span className="block text-xs text-muted">
            {Math.round(status.tax * 100)}% tax goes into the prize pool · {short(Math.floor(status.hoursLeftToday * 10) / 10)} paid hours left today
          </span>
        </div>
        <button disabled={busy || status.owed < 0.01} onClick={onCollect} className="shrink-0 rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Collect"}
        </button>
      </div>
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <GraduationCap className="size-4" /> Skills
        </h3>
        {status.skills.length ? (
          <ul className="mt-1.5 space-y-1.5">
            {status.skills.map((s) => {
              const into = (s.minutes % status.skillMinutes) / status.skillMinutes;
              return (
                <li key={s.skill} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{SKILLS[s.skill]?.label ?? s.skill}</span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      {s.minutes >= status.skipMinutes && <Check className="size-3 text-me" strokeWidth={3} />}
                      Level {s.level} · +{Math.round(s.level * status.skillBonus * 100)}% pay
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full" style={{ width: `${s.level >= 10 ? 100 : Math.round(into * 100)}%`, background: SKILLS[s.skill]?.colour ?? "#868e96" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">Work a job to earn skills. With a skill, the same kind of job needs no interview in the next town, and pays more as your skill grows.</p>
        )}
      </div>
      {job && (
        <button disabled={busy} onClick={onQuit} className="flex w-full items-center justify-center gap-2 rounded-2xl py-2 text-sm font-semibold text-hit hover:bg-panel-2 disabled:opacity-50">
          <DoorOpen className="size-4" /> Quit my job
        </button>
      )}
    </div>
  );
}
