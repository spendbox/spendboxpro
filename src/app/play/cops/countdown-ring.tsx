"use client";

import { useEffect, useState } from "react";
import { Siren } from "lucide-react";
import { cn } from "@/lib/cn";
import { sessionsNow } from "@/lib/scheduled";

// Police & Thieves' button beside Play: a siren in a ring that fills up as the next game comes
// closer (the whole ring is the 8 hours between games), with the time left under it. In the last
// 10 minutes the ring turns red and pulses; while a game is on it says LIVE and the ring empties
// as the match runs down.

const GAP = 8 * 3_600_000;

/** "2h 31m", "45m" or "4:59": short, for under the button. */
function short(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  if (s >= 600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CopsCountdown({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const { live, next } = sessionsNow("cops-robbers", now);
  const left = next.starts - now;
  // How full the ring is: the share of the wait that's gone (or, live, of the match that's left).
  const fill = live ? Math.max(0, (live.ends - now) / (live.ends - live.starts)) : Math.min(1, Math.max(0, 1 - left / GAP));
  const soon = !live && left < 10 * 60_000;
  const R = 26;
  const C = 2 * Math.PI * R;
  const ring = live || soon ? "#ff4d4d" : "#ffd43b";
  return (
    <button
      onClick={onOpen}
      className={cn("pointer-events-auto flex flex-col items-center gap-0.5", className)}
      aria-label={live ? "Police & Thieves is on now" : `Police & Thieves: next game in ${short(left)}`}
      title="Police & Thieves"
    >
      <span className={cn("relative grid size-12 place-items-center", (live || soon) && "animate-pulse")}>
        <svg viewBox="0 0 60 60" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="30" cy="30" r={R} fill="#0f1729" />
          <circle cx="30" cy="30" r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
          <circle cx="30" cy="30" r={R} fill="none" stroke={ring} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${C * fill} ${C}`} style={{ transition: "stroke-dasharray 1s linear" }} />
        </svg>
        <span className="relative grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#1c4fd6] to-[#e8590c] shadow-inner">
          <Siren className="size-5 text-white" />
        </span>
      </span>
      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-black tabular-nums leading-tight text-white shadow", live ? "bg-[#e03131]" : "bg-[#0f1729]/85")}>{live ? "LIVE" : short(left)}</span>
    </button>
  );
}
