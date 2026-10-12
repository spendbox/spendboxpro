"use client";

import { cash } from "@/lib/world/value";
import { useState } from "react";
import { Briefcase, Star } from "@/components/icons";
import type { EventResult, InterviewResult, InterviewStart, LifeStatus } from "@/lib/world/property-api";
import { Sheet } from "../sheet";

/**
 * A job interview: five questions, one at a time (four about the job, one about Lagos). Passing
 * hands back a ticket to take the job; failing means waiting before trying that job there again.
 */
export function InterviewSheet({
  start,
  onSubmit,
  onPassed,
  onClose,
}: {
  start: Extract<InterviewStart, { ok: true }>;
  onSubmit: (answers: number[]) => Promise<InterviewResult>;
  onPassed: (ticket: string) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [sending, setSending] = useState(false);
  const k = answers.length;
  const q = start.questions[k];

  async function choose(i: number) {
    const next = [...answers, i];
    setAnswers(next);
    if (next.length < start.questions.length) return;
    setSending(true);
    setResult(await onSubmit(next));
    setSending(false);
  }

  return (
    <Sheet onClose={onClose} title={<span className="flex items-center gap-2"><Briefcase className="size-5" /> Interview</span>}>
      <p className="text-sm text-muted">
        For <b className="text-ink">{start.title}</b>. Get {start.need} of {start.questions.length} right.
      </p>
      {result ? (
        result.ok ? (
          <div className="mt-4 text-center">
            <p className="font-display text-4xl font-extrabold tabular-nums">
              {result.score}/{start.questions.length}
            </p>
            <p className={`mt-1 font-semibold ${result.passed ? "text-me" : "text-hit"}`}>{result.passed ? "You got the job offer!" : "Not this time."}</p>
            <p className="mt-1 text-sm text-muted">{result.passed ? "Take it now, before the offer runs out." : "You can try this job here again in 14 hours. Other jobs are open."}</p>
            {result.passed ? (
              <button onClick={() => onPassed(result.ticket!)} className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white">
                Take the job
              </button>
            ) : (
              <button onClick={onClose} className="mt-4 h-11 w-full rounded-full bg-ink/5 font-semibold">
                Close
              </button>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-hit">{result.error}</p>
        )
      ) : q ? (
        <div className="mt-4">
          <div className="flex gap-1">
            {start.questions.map((x, i) => (
              <span key={x.id} className={`h-1.5 flex-1 rounded-full ${i < k ? "bg-gold" : i === k ? "bg-ink/40" : "bg-ink/10"}`} />
            ))}
          </div>
          <p className="mt-4 font-semibold">{q.q}</p>
          <div className="mt-3 space-y-2">
            {q.options.map((o, i) => (
              <button key={i} disabled={sending} onClick={() => void choose(i)} className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-left text-sm hover:bg-ink/10 disabled:opacity-50">
                {o}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted">Marking…</p>
      )}
    </Sheet>
  );
}

/** A breakthrough moment: the moment, three choices, and how it went. */
export function MomentSheet({ event, onAnswer, onClose }: { event: NonNullable<LifeStatus["event"]>; onAnswer: (choice: number) => Promise<EventResult>; onClose: () => void }) {
  const [result, setResult] = useState<EventResult | null>(null);
  const [sending, setSending] = useState(false);
  return (
    <Sheet onClose={onClose} title={<span className="flex items-center gap-2"><Star className="size-5 text-gold-dark" /> Breakthrough</span>}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{event.source === "job" ? "At work" : "In your side hustle"}</p>
      <p className="mt-1 font-display text-lg font-extrabold">{event.title}</p>
      <p className="mt-1 text-sm text-muted">{event.text}</p>
      {result ? (
        result.ok ? (
          <div className={`mt-4 rounded-2xl p-4 ${result.won ? "bg-me/10" : "bg-hit/10"}`}>
            <p className={`font-semibold ${result.won ? "text-me" : "text-hit"}`}>{result.won ? "Breakthrough!" : "Not this time"}</p>
            <p className="mt-1 text-sm">{result.said}</p>
            {!result.won && (result.stall ?? 0) > 0 && (
              <p className="mt-1 text-sm font-semibold text-hit">
                Your hustle stops earning for {result.stall} game {result.stall === 1 ? "day" : "days"}.
              </p>
            )}
            {result.won && (
              <p className="mt-1 text-sm font-semibold">
                {event.source === "job" ? `+${cash(result.bonus)} bonus and extra experience.` : "Double earnings for the next 6 hours."}
              </p>
            )}
            <button onClick={onClose} className="mt-3 h-10 w-full rounded-full bg-ink text-sm font-semibold text-white">
              Carry on
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-hit">{result.error}</p>
        )
      ) : (
        <div className="mt-4 space-y-2">
          {event.choices.map((c, i) => (
            <button
              key={i}
              disabled={sending}
              onClick={async () => {
                setSending(true);
                setResult(await onAnswer(i));
                setSending(false);
              }}
              className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-left text-sm hover:bg-ink/10 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
          <p className="pt-1 text-center text-[11px] text-muted">Answer by {new Date(event.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} or the moment passes.</p>
        </div>
      )}
    </Sheet>
  );
}
