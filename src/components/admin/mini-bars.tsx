"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** One series per day for the last 30 days. Hover or tap a bar to see its number. */
export function MiniBars({ title, days, unit }: { title: string; days: { day: string; value: number }[]; unit: [string, string] }) {
  const [shown, setShown] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.value));
  const total = days.reduce((s, d) => s + d.value, 0);
  const tip = shown !== null ? days[shown] : null;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted tabular" aria-live="polite">
          {tip ? `${dayLabel(tip.day)}: ${tip.value} ${tip.value === 1 ? unit[0] : unit[1]}` : `${total} in 30 days`}
        </span>
      </figcaption>
      <div className="flex h-28 items-end gap-[2px] border-b border-line" onMouseLeave={() => setShown(null)}>
        {days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            aria-label={`${dayLabel(d.day)}: ${d.value}`}
            onMouseEnter={() => setShown(i)}
            onFocus={() => setShown(i)}
            onClick={() => setShown(shown === i ? null : i)}
            className="group flex h-full flex-1 items-end"
          >
            <span
              className={cn(
                "block w-full rounded-t-[4px] transition-colors",
                d.value === 0 ? "h-[2px] bg-line" : shown === i ? "bg-brand-800" : "bg-brand-600 group-hover:bg-brand-700",
              )}
              style={d.value ? { height: `${Math.max(6, (d.value / max) * 100)}%` } : undefined}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>{dayLabel(days[0]?.day ?? "")}</span>
        <span>Today</span>
      </div>
    </figure>
  );
}
