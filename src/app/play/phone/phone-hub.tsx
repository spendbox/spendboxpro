"use client";

import { useEffect, useState } from "react";
import { BatteryFull, SignalHigh, Wifi } from "lucide-react";
import { useEscape } from "../menu/escape";

// Your phone (docs/PEOPLE.md): shaped like a phone. The status bar with the time in Lagos, your
// latest notifications on the screen like a lock screen, the apps in a grid with their own
// colours and red badges, the four you use most in the dock, and the bar at the bottom.

export type PhoneApp = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  colour: string;
  go: () => void;
  /** A red number on the icon (unread messages...). */
  badge?: number;
  /** In the dock at the bottom. */
  dock?: boolean;
};

export type PhoneNotice = { key: string; text: string; when: string; fresh: boolean; onTap?: () => void };

const lagosTime = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export function PhoneHub({ apps, notices, onClose, onAllNotices }: { apps: PhoneApp[]; notices: PhoneNotice[]; onClose: () => void; onAllNotices: () => void }) {
  useEscape(onClose);
  const [time, setTime] = useState(lagosTime);
  useEffect(() => {
    const t = setInterval(() => setTime(lagosTime()), 15_000);
    return () => clearInterval(t);
  }, []);
  const open = (a: PhoneApp) => {
    onClose();
    a.go();
  };
  const grid = apps.filter((a) => !a.dock);
  const dock = apps.filter((a) => a.dock);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label="Your phone">
      <div className="phone-in relative flex h-[min(88dvh,760px)] w-[min(92vw,380px)] flex-col rounded-[2.8rem] bg-[#17191c] p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
        {/* The side buttons. */}
        <span className="absolute -left-1 top-28 h-10 w-1 rounded-l bg-[#2b2f33]" aria-hidden />
        <span className="absolute -left-1 top-40 h-14 w-1 rounded-l bg-[#2b2f33]" aria-hidden />
        <span className="absolute -right-1 top-36 h-20 w-1 rounded-r bg-[#2b2f33]" aria-hidden />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2.2rem] bg-gradient-to-b from-[#1c3f6e] via-[#5f3dc4] to-[#e8590c] text-white">
          {/* Status bar and the camera notch. */}
          <div className="flex shrink-0 items-center justify-between px-6 pb-1 pt-3 text-xs font-semibold">
            <span className="tabular-nums">{time}</span>
            <span className="absolute left-1/2 top-2.5 h-6 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <span className="flex items-center gap-1">
              <SignalHigh className="size-3.5" />
              <Wifi className="size-3.5" />
              <BatteryFull className="size-4" />
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 [scrollbar-width:none]">
            {/* Notifications, newest first, like a lock screen. */}
            <div className="mt-2 space-y-1.5">
              {notices.length === 0 ? (
                <p className="rounded-2xl bg-white/15 px-3 py-2.5 text-center text-xs backdrop-blur">No notifications. You&apos;re all caught up.</p>
              ) : (
                notices.slice(0, 4).map((n) => (
                  <button
                    key={n.key}
                    onClick={() => {
                      onClose();
                      (n.onTap ?? onAllNotices)();
                    }}
                    className={`block w-full rounded-2xl px-3 py-2 text-left text-xs backdrop-blur ${n.fresh ? "bg-white/90 text-ink" : "bg-white/20"}`}
                  >
                    <span className="line-clamp-2 font-semibold leading-snug">{n.text}</span>
                    <span className={`text-[10px] ${n.fresh ? "text-muted" : "text-white/70"}`}>{n.when}</span>
                  </button>
                ))
              )}
              {notices.length > 4 && (
                <button
                  onClick={() => {
                    onClose();
                    onAllNotices();
                  }}
                  className="w-full text-center text-[11px] font-semibold text-white/80"
                >
                  See all {notices.length}
                </button>
              )}
            </div>
            {/* The apps. */}
            <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4">
              {grid.map((a) => (
                <AppIcon key={a.label} app={a} onOpen={() => open(a)} />
              ))}
            </div>
          </div>
          {/* The dock and the home bar. */}
          <div className="mx-3 mb-2 grid shrink-0 grid-cols-4 gap-2 rounded-[1.6rem] bg-white/20 px-2 py-2 backdrop-blur">
            {dock.map((a) => (
              <AppIcon key={a.label} app={a} onOpen={() => open(a)} small />
            ))}
          </div>
          <button onClick={onClose} className="mx-auto mb-2 block h-1.5 w-28 shrink-0 rounded-full bg-white/80" aria-label="Close the phone" />
        </div>
      </div>
      <style>{`@keyframes phone-in { from { opacity: 0; transform: translateY(40px) scale(.94) } to { opacity: 1; transform: none } } .phone-in { animation: phone-in .3s cubic-bezier(.2,1.1,.4,1) both } @media (prefers-reduced-motion: reduce) { .phone-in { animation: none } }`}</style>
    </div>
  );
}

function AppIcon({ app, onOpen, small }: { app: PhoneApp; onOpen: () => void; small?: boolean }) {
  const Icon = app.icon;
  return (
    <button onClick={onOpen} className="flex min-w-0 flex-col items-center gap-1" aria-label={app.badge ? `${app.label}, ${app.badge} new` : app.label}>
      <span className="relative grid size-12 place-items-center rounded-[1.05rem] shadow-md" style={{ background: app.colour }}>
        <Icon className="size-6 text-white" />
        {!!app.badge && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#fa5252] px-1 text-[11px] font-bold text-white ring-2 ring-[#17191c]/40">
            {app.badge > 99 ? "99+" : app.badge}
          </span>
        )}
      </span>
      {!small && <span className="w-full truncate text-center text-[10px] font-medium text-white drop-shadow">{app.label}</span>}
    </button>
  );
}
