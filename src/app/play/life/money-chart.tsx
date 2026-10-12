"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "@/components/icons";
import type { MoneyDay } from "@/lib/world/property-api";
import { cash } from "@/lib/world/value";

// "Am I up or down?": what you earned against what living cost you, day by day, as bars above
// and below a line (earned up in green, costs down in red; tap a day for its numbers), with the
// answer in one line on top. Things bought to keep (a home, a car) are spending into what you
// own, so they're counted apart. Used by Finance and Income.

/** The last days of your money, remembered so the chart shows at once next time. */
const seen = new Map<number, MoneyDay[]>();

export function useMoneyDays(load: (days: number) => Promise<MoneyDay[]>, days: number) {
  const [got, setGot] = useState<MoneyDay[] | null>(() => seen.get(days) ?? null);
  useEffect(() => {
    let alive = true;
    void load(days).then((d) => {
      seen.set(days, d);
      if (alive) setGot(d);
    });
    return () => {
      alive = false;
    };
  }, [load, days]);
  return seen.get(days) ?? got;
}

const sum = (d: MoneyDay[], k: "earned" | "costs" | "bought") => d.reduce((t, x) => t + x[k], 0);

/** The answer in one line: "You're up ₦120,000 this week" (or down), with earned and costs under it. */
export function UpOrDown({ days, label }: { days: MoneyDay[] | null; label: string }) {
  if (!days) return <div className="h-16 animate-pulse rounded-2xl bg-ink/5" />;
  const earned = sum(days, "earned");
  const costs = sum(days, "costs");
  const net = earned - costs;
  const up = net >= 0;
  return (
    <div className={`rounded-2xl p-3.5 ${up ? "bg-[#2f9e44]/10" : "bg-[#e03131]/10"}`}>
      <p className={`flex items-center gap-1.5 font-display text-lg font-extrabold ${up ? "text-[#2b8a3e]" : "text-[#c92a2a]"}`}>
        {up ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
        {earned === 0 && costs === 0 ? `Nothing yet ${label}` : `You're ${up ? "up" : "down"} ${cash(Math.abs(net))} ${label}`}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Earned {cash(earned)} · living costs {cash(costs)}
        {sum(days, "bought") > 0 ? ` · bought to keep ${cash(sum(days, "bought"))}` : ""}
      </p>
    </div>
  );
}

/** Bars by day: earned above the line, costs below; tap one for that day's numbers. */
export function MoneyChart({ days }: { days: MoneyDay[] | null }) {
  const [pick, setPick] = useState<number | null>(null);
  if (!days) return <div className="mt-3 h-36 animate-pulse rounded-2xl bg-ink/5" />;
  const top = Math.max(1, ...days.map((d) => d.earned));
  const bottom = Math.max(1, ...days.map((d) => d.costs));
  const H = 120;
  const zero = (top / (top + bottom)) * H;
  const W = 300;
  const slot = W / days.length;
  const bar = Math.max(3, Math.min(22, slot - 2));
  const chosen = pick !== null ? days[pick] : null;
  const name = (d: MoneyDay) => new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label="Money earned and living costs by day">
        <line x1="0" x2={W} y1={zero} y2={zero} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
        {days.map((d, k) => {
          const x = k * slot + (slot - bar) / 2;
          const up = (d.earned / (top + bottom)) * H;
          const down = (d.costs / (top + bottom)) * H;
          const on = pick === k;
          return (
            <g key={d.day} onClick={() => setPick(on ? null : k)} className="cursor-pointer">
              {/* A tall, invisible target: easy to tap even on a thin day. */}
              <rect x={k * slot} y="0" width={slot} height={H} fill="transparent" />
              {up > 0 && <rect x={x} y={zero - up - 1} width={bar} height={Math.max(2, up)} rx="3" fill="#2f9e44" opacity={pick === null || on ? 1 : 0.4} />}
              {down > 0 && <rect x={x} y={zero + 1} width={bar} height={Math.max(2, down)} rx="3" fill="#e03131" opacity={pick === null || on ? 1 : 0.4} />}
              {(days.length <= 7 || k % 5 === 0 || k === days.length - 1) && (
                <text x={k * slot + slot / 2} y={H + 12} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.55">
                  {new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", days.length <= 7 ? { weekday: "short" } : { day: "numeric" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-[#2f9e44]" /> Earned
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-[#e03131]" /> Living costs
          </span>
        </span>
        <span>{chosen ? "" : "Tap a day"}</span>
      </div>
      {chosen && (
        <p className="mt-1.5 rounded-xl bg-ink/[0.04] px-3 py-2 text-xs">
          <b>{name(chosen)}:</b> earned {cash(chosen.earned)}, costs {cash(chosen.costs)}, so {chosen.earned >= chosen.costs ? "up" : "down"} {cash(Math.abs(chosen.earned - chosen.costs))}
          {chosen.bought > 0 ? `. Bought to keep: ${cash(chosen.bought)}` : ""}.
        </p>
      )}
    </div>
  );
}
