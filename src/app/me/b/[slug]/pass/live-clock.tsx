"use client";

import { useEffect, useState } from "react";

/** A ticking clock: proves the pass is live, not a screenshot. */
export function LiveClock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now)
    : "--:--:--";
  const date = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(now)
    : "";

  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-sm text-white/90">{date || " "}</p>
        <p className="font-display text-4xl leading-none font-extrabold tabular" aria-live="off">
          {time}
        </p>
      </div>
      <span className="flex items-center gap-2 text-sm font-bold">
        <span className="size-2.5 animate-pulse-soft rounded-full bg-[#FFD8C2]" aria-hidden />
        LIVE
      </span>
    </div>
  );
}
