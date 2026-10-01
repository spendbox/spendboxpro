"use client";

import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
        checked ? "bg-brand-600" : "bg-line-strong",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

/** A switch that saves through a Server Action and updates instantly. */
export function ActionSwitch({
  initial,
  action,
  label,
}: {
  initial: boolean;
  action: (checked: boolean) => Promise<unknown>;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [checked, setOptimistic] = useOptimistic(initial);
  return (
    <Switch
      checked={checked}
      label={label}
      disabled={pending}
      onChange={(next) =>
        startTransition(async () => {
          setOptimistic(next);
          await action(next);
        })
      }
    />
  );
}
