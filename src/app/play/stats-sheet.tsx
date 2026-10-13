"use client";

import { useEffect, useState } from "react";
import { Eye, Users } from "@/components/icons";
import { siteStats, type SiteStats } from "./profile-actions";
import { Sheet } from "./sheet";

// The online button's numbers, out in the open: who's online now, how many have signed up, and every
// visit (players and guests alike, once per browser session), with the last 30 days day by day.

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function StatsSheet({
  online,
  onClose,
  people,
}: {
  online: number | null;
  onClose: () => void;
  /** Signed in on a map: a People tab (first) to find anyone and message them. */
  people?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"people" | "numbers">(people ? "people" : "numbers");
  const [s, setS] = useState<SiteStats | null>(null);
  // The numbers only when they're looked at (the People tab opens first, and fast).
  const wantNumbers = tab === "numbers";
  useEffect(() => {
    if (!wantNumbers || s) return;
    let alive = true;
    void siteStats()
      .then((x) => alive && setS(x))
      .catch(() => alive && setS({ visits: 0, registered: 0, days: [] }));
    return () => {
      alive = false;
    };
  }, [wantNumbers, s]);
  const days = s?.days ?? [];
  const today = days[days.length - 1];
  const week = (k: "visits" | "signups", from: number, to: number) => days.slice(Math.max(0, days.length - to), days.length - from).reduce((n, d) => n + d[k], 0);
  const growth = (k: "visits" | "signups") => {
    const now = week(k, 0, 7);
    const before = week(k, 7, 14);
    return before > 0 ? Math.round(((now - before) / before) * 100) : null;
  };
  return (
    <Sheet onClose={onClose} title={people ? `${online ?? "…"} online` : "Newtown in numbers"}>
      {people && (
        <div className="mb-3 flex gap-1 rounded-full bg-ink/5 p-1">
          {(
            [
              ["people", "People"],
              ["numbers", "Numbers"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${tab === id ? "bg-panel shadow-sm" : "text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {people && tab === "people" ? (
        <div className="flex h-[min(60vh,520px)] flex-col">{people}</div>
      ) : (
      <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile label="Online now" value={online === null ? "…" : fmt(online)} dot />
        <Tile label="Registered" value={s ? fmt(s.registered) : "…"} icon={<Users className="size-3.5" />} />
        <Tile label="Visits" value={s ? fmt(s.visits) : "…"} icon={<Eye className="size-3.5" />} />
      </div>
      {today && (
        <p className="mt-2 text-center text-xs text-muted">
          Today: {fmt(today.visits)} visits ({fmt(today.guests)} guests, {fmt(today.members)} players) and {fmt(today.signups)} new {today.signups === 1 ? "player" : "players"}
        </p>
      )}
      {days.length > 0 && (
        <>
          <Bars title="Visits a day" days={days} pick={(d) => d.visits} growth={growth("visits")} tip={(d) => `${fmt(d.visits)} visits: ${fmt(d.guests)} guests, ${fmt(d.members)} players`} />
          <Bars title="New players a day" days={days} pick={(d) => d.signups} growth={growth("signups")} tip={(d) => `${fmt(d.signups)} signed up`} />
        </>
      )}
      <p className="mt-4 rounded-2xl bg-ink/[0.04] p-3 text-[11px] leading-relaxed text-muted">
        <b className="text-ink">How we count.</b> Online now: everyone with the city open this minute. Registered: every player account. Visits: each time someone opens Newtown, signed in or not,
        counted once per browser session; guests and players are counted apart. Days run on Lagos time. These are the same numbers we see.
      </p>
      </>
      )}
    </Sheet>
  );
}

function Tile({ label, value, icon, dot }: { label: string; value: string; icon?: React.ReactNode; dot?: boolean }) {
  return (
    <div className="rounded-2xl bg-ink/[0.04] px-2 py-3">
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted">
        {dot && <span className="size-2 animate-pulse rounded-full bg-me" />}
        {icon}
        {label}
      </p>
      <p className="font-display text-xl font-extrabold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

/** One measure, one bar a day (30 days), with how this week compares with the week before. */
function Bars({ title, days, pick, growth, tip }: { title: string; days: SiteStats["days"]; pick: (d: SiteStats["days"][number]) => number; growth: number | null; tip: (d: SiteStats["days"][number]) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map(pick));
  const shown = hover === null ? days.length - 1 : hover;
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {growth !== null && (
          <p className="text-xs text-muted">
            This week vs last: <b className="text-ink">{growth >= 0 ? `+${growth}%` : `${growth}%`}</b>
          </p>
        )}
      </div>
      <div className="relative mt-2 flex h-24 items-end gap-[2px] border-b border-line" onPointerLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            onPointerEnter={() => setHover(i)}
            onClick={() => setHover(i)}
            className="flex h-full min-w-0 flex-1 items-end"
            aria-label={`${dayLabel(d.day)}: ${tip(d)}`}
          >
            <span className={`w-full rounded-t-[4px] ${i === shown ? "bg-gold-dark" : "bg-gold"}`} style={{ height: `${Math.max(pick(d) > 0 ? 3 : 0, (pick(d) / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{dayLabel(days[0].day)}</span>
        <span>Today</span>
      </div>
      <p className="mt-0.5 truncate text-center text-[11px] font-semibold">
        {dayLabel(days[shown].day)}: {tip(days[shown])}
      </p>
    </div>
  );
}
