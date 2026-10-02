"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

export interface ChartDay {
  day: string;
  total: number;
  payments: number;
}

/** 0 / 25K / 50K-style tick values: a round top just above the biggest day. */
function niceMax(max: number) {
  if (max <= 0) return 1000;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * power >= max) return step * power;
  }
  return 10 * power;
}

/** ₦0 / ₦7,500 / ₦15K / ₦1.2M — formatted by hand so the server and every browser agree. */
function compactMoney(n: number, currency: string) {
  const symbol = currency === "NGN" ? "₦" : `${currency} `;
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (n >= 1_000_000) return `${symbol}${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${symbol}${trim(n / 1_000)}K`;
  return `${symbol}${Math.round(n).toLocaleString("en-US")}`;
}

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Money in per day for one month. One column per day, tap a column to see
 * that day's payments (tap again to see the whole month).
 */
export function SalesChart({
  days,
  currency,
  selected,
  hrefFor,
}: {
  days: ChartDay[];
  currency: string;
  /** YYYY-MM-DD of the chosen day, if any. */
  selected: string | null;
  /** Link for each day (index 0 = day 1), and for clearing the choice. */
  hrefFor: { days: string[]; clear: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(...days.map((d) => d.total)));
  const ticks = [top, top / 2, 0];
  const labelEvery = days.length > 20 ? 5 : 1;
  const shown = hover ?? (selected ? days.findIndex((d) => d.day === selected) : null);
  const tip = shown !== null && shown >= 0 ? days[shown] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex gap-2">
        {/* Y axis */}
        <div className="flex h-44 w-11 shrink-0 flex-col justify-between text-right text-[11px] text-subtle tabular sm:h-52" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compactMoney(t, currency)}
            </span>
          ))}
        </div>

        <div className="relative h-44 min-w-0 flex-1 sm:h-52" onMouseLeave={() => setHover(null)}>
          {/* Gridlines: hairline, recessive */}
          {ticks.map((t, i) => (
            <div key={t} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
          ))}

          <ol className="absolute inset-0 flex items-end" aria-label="Money in per day">
            {days.map((d, i) => {
              const isSelected = selected === d.day;
              const height = d.total > 0 ? Math.max((d.total / top) * 100, 1.5) : 0;
              const date = dayLabel(d.day);
              return (
                <li key={d.day} className="flex h-full min-w-0 flex-1 justify-center">
                  <Link
                    href={isSelected ? hrefFor.clear : hrefFor.days[i]}
                    scroll={false}
                    aria-current={isSelected ? "date" : undefined}
                    aria-label={`${date}: ${formatMoney(d.total, currency)} from ${d.payments} payment${d.payments === 1 ? "" : "s"}${isSelected ? " (showing; tap to see the whole month)" : ""}`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="group flex h-full w-full items-end justify-center px-px outline-offset-0"
                  >
                    <span
                      className={cn(
                        "block w-full max-w-6 rounded-t-[4px] transition-colors",
                        selected
                          ? isSelected
                            ? "bg-brand-700"
                            : "bg-brand-200 group-hover:bg-brand-300"
                          : "bg-brand-600 group-hover:bg-brand-800",
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </Link>
                </li>
              );
            })}
          </ol>

          {/* Tooltip for the column under the pointer (or the chosen day) */}
          {tip && (
            <div
              aria-hidden
              className="pointer-events-none absolute -top-2 z-10 w-max -translate-x-1/2 -translate-y-full rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lift"
              style={{ left: `clamp(4.5rem, ${((shown! + 0.5) / days.length) * 100}%, calc(100% - 4.5rem))` }}
            >
              <p className="font-semibold">{dayLabel(tip.day)}</p>
              <p className="text-white/90">
                {formatMoney(tip.total, currency)} · {tip.payments} payment{tip.payments === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* X axis: day numbers */}
      <div className="ml-13 flex text-[11px] text-subtle tabular" aria-hidden>
        {days.map((d, i) => {
          const n = i + 1;
          const show = n === 1 || n % labelEvery === 0 || n === days.length;
          return (
            <span key={d.day} className="min-w-0 flex-1 text-center">
              {show && !(n === days.length - 1 && labelEvery > 1) ? n : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
