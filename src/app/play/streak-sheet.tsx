"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Flame, Gamepad2, Gift, Handshake, ScrollText, Snowflake, TramFront, X } from "lucide-react";
import { BadgeMedal } from "@/components/badges";
import { cn } from "@/lib/cn";
import { STREAK_MILESTONES, type Streak, type StreakDay } from "@/lib/streaks";
import { Sheet } from "./sheet";

// Daily streaks: a flame with your days in a row next to your mint (it pops when today starts
// counting), and the streak screen behind it: this week, what counts, the weekly freeze, and
// the milestones with their mint and badges.

const DAY_MS = 86_400_000;
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/** Your streak in the top bar. Tap for the streak screen. */
export function StreakPill({ streak, onOpen }: { streak: Streak; onOpen: () => void }) {
  const [pop, setPop] = useState<number | null>(null);
  const prev = useRef<boolean | null>(null);
  const { today, current } = streak;
  // Today just started counting: pop up "Day N!" for a moment.
  useEffect(() => {
    const was = prev.current;
    prev.current = today;
    if (was !== false || !today) return;
    const id = setTimeout(() => setPop(current), 0);
    return () => clearTimeout(id);
  }, [today, current]);
  useEffect(() => {
    if (pop === null) return;
    const id = setTimeout(() => setPop(null), 5000);
    return () => clearTimeout(id);
  }, [pop]);

  const atRisk = streak.alive && !streak.today && streak.current > 0;
  return (
    <span className="relative">
      <button
        onClick={onOpen}
        className={cn("glass flex items-center gap-0.5 whitespace-nowrap rounded-full py-1.5 pl-2 pr-2.5 text-sm font-bold", pop !== null && "streak-pop")}
        aria-label={`Daily streak: ${streak.current} day${streak.current === 1 ? "" : "s"}`}
        title={streak.today ? "Today counts. Come back tomorrow!" : "Do one thing today to keep your streak"}
      >
        <Flame className={cn("size-4", streak.today ? "fill-[#ffa94d] text-[#f76707]" : "text-muted")} />
        <span className={streak.today ? "text-[#d9480f]" : undefined}>{streak.current}</span>
        {atRisk && <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-hit ring-2 ring-white" aria-hidden />}
      </button>
      {pop !== null && (
        <span className="glass pointer-events-none absolute right-0 top-full mt-2 flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-bold shadow-lg" role="status">
          <Flame className="size-4 fill-[#ffa94d] text-[#f76707]" />
          {pop === 1 ? "Day 1! Your streak has started" : `Day ${pop}! Your streak keeps going`}
        </span>
      )}
    </span>
  );
}

function DayDot({ state, label }: { state: StreakDay; label: string }) {
  return (
    <li className="flex flex-col items-center gap-1">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-full",
          state === "done" && "bg-[#fff4e6] text-[#f76707]",
          state === "freeze" && "bg-[#e7f5ff] text-[#1c7ed6]",
          state === "missed" && "bg-panel-2 text-muted/60",
          state === "today" && "border-2 border-dashed border-[#ffa94d] text-[#ffa94d]",
        )}
        aria-label={`${label}: ${state === "done" ? "counted" : state === "freeze" ? "saved by the freeze" : state === "today" ? "today, not yet" : "missed"}`}
      >
        {state === "done" ? (
          <Flame className="size-4.5 fill-[#ffa94d]" />
        ) : state === "freeze" ? (
          <Snowflake className="size-4.5" />
        ) : state === "today" ? (
          <Flame className="size-4" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <span className="text-[10px] font-semibold text-muted">{label}</span>
    </li>
  );
}

const COUNTS = [
  { icon: Gamepad2, text: "Play a game" },
  { icon: ScrollText, text: "Finish a side quest" },
  { icon: Gift, text: "Give or spray mint" },
  { icon: Handshake, text: "Hug or shake hands" },
  { icon: TramFront, text: "Ride something" },
];

/** The streak screen. now: the server's clock (ms), for the days of the week. */
export function StreakSheet({ streak, now, onClose }: { streak: Streak; now: number; onClose: () => void }) {
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const dayEnds = new Date(todayStart + DAY_MS).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const labels = streak.week.map((_, i) => WEEKDAY[new Date(todayStart - (streak.week.length - 1 - i) * DAY_MS).getUTCDay()]);
  const status = streak.today
    ? `Today counts. Come back tomorrow to make it ${streak.current + 1}.`
    : streak.freezeNeeded
      ? "You missed yesterday, but your freeze will save your streak. Do one thing today!"
      : streak.current > 0
        ? "Do one thing today to keep your streak going."
        : "Do one thing today to start a streak.";

  return (
    <Sheet onClose={onClose} wide>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl", streak.current > 0 ? "bg-gradient-to-br from-[#ffd8a8] to-[#ff922b] text-white" : "bg-panel-2 text-muted")}>
          <Flame className={cn("size-8", streak.current > 0 && "fill-[#fff4e6]/60")} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-extrabold leading-tight">
            {streak.current > 0 ? `${streak.current}-day streak` : "No streak yet"}
          </h2>
          <p className="text-xs text-muted">
            Best: {streak.best} day{streak.best === 1 ? "" : "s"} · A new day starts at {dayEnds}
          </p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      <p className={cn("mt-3 rounded-xl px-3 py-2 text-sm font-semibold", streak.today ? "bg-[#fff4e6] text-[#d9480f]" : "bg-hit/10 text-hit")}>{status}</p>

      {/* The last 7 days */}
      <ul className="mt-3 flex justify-between">
        {streak.week.map((d, i) => (
          <DayDot key={i} state={d} label={i === streak.week.length - 1 ? "Today" : labels[i]} />
        ))}
      </ul>

      {/* What counts */}
      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Any one of these counts</h3>
      <ul className="mt-1.5 grid grid-cols-2 gap-1.5 text-sm">
        {COUNTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2 rounded-xl bg-panel-2 px-2.5 py-2">
            <Icon className="size-4 shrink-0 text-[#f76707]" />
            {text}
          </li>
        ))}
      </ul>

      {/* The freeze */}
      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-[#e7f5ff] px-3 py-2.5 text-sm text-[#1864ab]">
        <Snowflake className="size-5 shrink-0" />
        <p className="min-w-0">
          <b className="block">{streak.freezeReady ? "Freeze ready" : "Freeze used this week"}</b>
          <span className="text-xs">
            {streak.freezeReady
              ? "Miss one day and it saves your streak. You get one free every week."
              : "A new one comes on Monday. Don't miss a day till then!"}
          </span>
        </p>
      </div>

      {/* Milestones */}
      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Milestones</h3>
      <ul className="mt-1.5 grid grid-cols-3 gap-1.5">
        {STREAK_MILESTONES.map((m) => {
          const reached = streak.best >= m;
          const next = !reached && m === streak.next;
          return (
            <li
              key={m}
              className={cn(
                "flex flex-col items-center rounded-xl px-1 py-2 text-center",
                next ? "bg-[#fff4e6] ring-2 ring-[#ffa94d]" : "bg-panel-2",
              )}
            >
              <BadgeMedal badge={`streak_${m}`} size={44} dim={!reached} />
              <b className="mt-1 text-sm">{m} days</b>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                {reached && <Check className="size-3 text-[#2b8a3e]" strokeWidth={3} />}+{streak.rewards[m] ?? 0} mint
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-center text-[11px] text-muted">
        Each milestone pays every time you reach it; the badge is yours the first time. After 100 days, every 100 more pays{" "}
        {streak.rewards[100] ?? 0} mint. Every streak day also earns XP for your next level.
      </p>
    </Sheet>
  );
}
