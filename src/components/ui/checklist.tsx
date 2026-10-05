import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, SectionTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface ChecklistStep {
  done: boolean;
  label: string;
  /** A short line under the label, while it's not done. */
  note?: string;
  /** Where tapping it goes, while it's not done. */
  href?: string | null;
  /** Or a button of its own (it wraps `StepRow`), for steps done right here. */
  action?: ReactNode;
}

/** One step's tick, words and arrow. */
export function StepRow({ done, label, note, arrow }: { done: boolean; label: string; note?: string; arrow?: boolean }) {
  return (
    <>
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", done ? "bg-brand-600 text-white" : "ring-2 ring-line-strong")}>
        {done && <Check className="size-3.5" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className={cn("text-sm font-semibold", done ? "text-muted line-through" : "text-ink")}>
          {label}
          <span className="sr-only">{done ? " (done)" : ""}</span>
        </span>
        {note && !done && <span className="text-xs text-muted">{note}</span>}
      </span>
      {!done && arrow && <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />}
    </>
  );
}

export const stepClass = "flex w-full items-center gap-3 rounded-xl p-2 hover:bg-canvas";

/** "Get started" steps, ticked off as they're done. Hidden once they all are. */
export function Checklist({ title, steps, className }: { title: string; steps: ChecklistStep[]; className?: string }) {
  if (steps.every((s) => s.done)) return null;
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <SectionTitle title={title} description={`${steps.filter((s) => s.done).length} of ${steps.length} done`} />
      <ol className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.label}>
            {!step.done && step.action ? (
              step.action
            ) : !step.done && step.href ? (
              <Link href={step.href} className={stepClass}>
                <StepRow done={false} label={step.label} note={step.note} arrow />
              </Link>
            ) : (
              <div className="flex items-center gap-3 p-2">
                <StepRow done={step.done} label={step.label} note={step.note} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
