"use client";

import { Sparkles } from "@/components/icons";
import { DAY_HOURS, dayPlan, type DayInput, type DayPlan } from "@/lib/world/day";
import { HUSTLES, hustleDay, hustleStart } from "@/lib/world/hustles";
import type { LifeStatus } from "@/lib/world/property-api";
import type { Prices } from "@/lib/world/region";
import { mintLocal } from "@/lib/world/value";
import { GAME_DAY_HOURS, skillLevel, WORK_SKILLS, type WorkSkill } from "@/lib/world/work";

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

const COLOUR: Record<DayPlan["blocks"][number]["id"] | "free", string> = {
  sleep: "#adb5bd",
  job: "#2f9e44",
  commute: "#f08c00",
  hustle: "#d6336c",
  study: "#1971c2",
  exercise: "#12b886",
  free: "#ffd43b",
};

const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;

/** Your day as a bar: 24 hours, what takes them, and what's left for you. */
export function DayBar({ plan }: { plan: DayPlan }) {
  const parts = [...plan.blocks.map((b) => ({ id: b.id, label: b.label, hours: b.hours })), { id: "free" as const, label: "Free time", hours: plan.free }];
  return (
    <div className="rounded-2xl bg-ink/[0.04] p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Your day</p>
        <p className="text-[11px] text-muted">
          Body {signed(plan.body)} · Mind {signed(plan.mind)} a day
        </p>
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full">
        {parts.map((p) =>
          p.hours > 0 ? <div key={p.id} title={`${p.label}: ${fmt(p.hours)}h`} style={{ width: `${(p.hours / DAY_HOURS) * 100}%`, background: COLOUR[p.id] }} /> : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {parts.map((p) =>
          p.hours > 0 ? (
            <span key={p.id} className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: COLOUR[p.id] }} />
              {p.label} {fmt(p.hours)}h
            </span>
          ) : null,
        )}
      </div>
      {plan.free < 3 && <p className="mt-1.5 text-[11px] text-hit">Very little time for yourself: your mind will suffer.</p>}
    </div>
  );
}

/** Your side hustle, or the ones you could start. */
export function HustleSection({
  status,
  day,
  skills,
  prices,
  busy,
  now,
  onStart,
  onStop,
}: {
  status: LifeStatus | null;
  /** Your day without a side hustle (to see what fits). */
  day: DayInput;
  skills: Record<string, number>;
  prices: Prices;
  busy: boolean;
  now: number;
  onStart: (id: string) => void;
  onStop: () => void;
}) {
  const h = status?.hustle ?? null;
  const canPay = (status?.pots.savings ?? 0) + (status?.wallet ?? 0);
  if (h) {
    const stalled = h.stalledUntil && Date.parse(h.stalledUntil) > now;
    const boosted = h.boostUntil && Date.parse(h.boostUntil) > now;
    const days = Math.min(7, Math.max(0, (now - Date.parse(h.paidUntil)) / (GAME_DAY_HOURS * 3_600_000)));
    return (
      <div className="mt-4 rounded-2xl p-3.5 ring-1 ring-ink/5">
        <p className="text-xs text-muted">Side hustle</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{h.title}</p>
            <p className="text-xs text-muted">
              {fmt(h.hours)} hours a day · about ₥{fmt(h.payDay)} a day, some days more, some less
            </p>
          </div>
          <button disabled={busy} onClick={onStop} className="h-8 shrink-0 rounded-full bg-ink/5 px-3 text-xs font-semibold text-hit disabled:opacity-40">
            Stop
          </button>
        </div>
        {boosted && (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-gold/15 px-2.5 py-1.5 text-xs font-semibold text-gold-dark">
            <Sparkles className="size-3.5" /> Boosted: ×{h.boost} earnings till {new Date(h.boostUntil!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        {stalled && (
          <p className="mt-2 rounded-xl bg-hit/10 px-2.5 py-1.5 text-xs font-semibold text-hit">
            Stalled: not earning till {new Date(h.stalledUntil!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">About ₥{fmt(h.payDay * days)} made so far ({fmt(days)} game days); collect it with your pay.</p>
      </div>
    );
  }
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">Side hustles</p>
      <p className="text-xs text-muted">One beside your main job, a few hours a day. Start-up costs come from Savings, then your wallet.</p>
      <ul className="mt-2 space-y-2">
        {HUSTLES.map((x) => {
          const cost = hustleStart(x, prices);
          const fits = dayPlan({ ...day, hustleHours: x.hours }).fits;
          const level = skillLevel(skills[x.skill] ?? 0);
          const short = !!x.level && level < x.level;
          return (
            <li key={x.id} className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-ink/5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{x.title}</p>
                <p className="text-xs text-muted">{x.what}</p>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-muted">{x.hours}h a day</span>
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-muted">about ₥{fmt(hustleDay(x, prices, skills[x.skill] ?? 0))}/day</span>
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-muted">{x.swing >= 0.5 ? "Up and down a lot" : "Fairly steady"}</span>
                  {x.level ? <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold-dark">Needs {WORK_SKILLS[x.skill as WorkSkill].toLowerCase()} level {x.level}</span> : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">₥{fmt(cost)}</p>
                <p className="text-[11px] text-muted">{mintLocal(cost, prices)} to start</p>
                <button
                  disabled={busy || !fits || short || canPay < cost}
                  onClick={() => onStart(x.id)}
                  title={!fits ? "Won't fit in your day" : short ? "Needs more experience" : canPay < cost ? "Not enough saved" : "Start"}
                  className="mt-1 h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {!fits ? "No time" : "Start"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
