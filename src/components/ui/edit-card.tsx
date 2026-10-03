"use client";

import { ChevronRight, Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";

/**
 * A setting shown as a card. Tap it to edit in a pop-up; the pop-up gets a
 * `close` function to call after saving. Read-only cards just show the value.
 */
export function EditCard({
  icon,
  label,
  value,
  note,
  title,
  description,
  readOnly,
  className,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  /** Small line under the value. */
  note?: ReactNode;
  /** Pop-up title (defaults to the label). */
  title?: string;
  description?: ReactNode;
  readOnly?: boolean;
  className?: string;
  children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-muted">{label}</span>
        <span className="font-semibold break-words text-ink">{value}</span>
        {note && <span className="mt-0.5 text-xs text-muted">{note}</span>}
      </span>
      {readOnly ? (
        <Lock className="size-4 shrink-0 text-subtle" aria-hidden />
      ) : (
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      )}
    </>
  );
  const base = "flex w-full items-center gap-3.5 rounded-3xl bg-surface p-4 text-left shadow-card ring-1 ring-line sm:p-5";

  if (readOnly || !children) return <div className={cn(base, className)}>{body}</div>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${typeof value === "string" ? value : ""}. Tap to change`}
        className={cn(base, "transition hover:ring-brand-300", className)}
      >
        {body}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title ?? label} description={description}>
        {open && children(() => setOpen(false))}
      </Modal>
    </>
  );
}
