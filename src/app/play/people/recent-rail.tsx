"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar, type Avatar } from "@/lib/avatar";

// The people you've been dealing with lately, down the left side of the screen (docs/PEOPLE.md):
// who you messaged, whose card you opened, who you gave something to or pranked. Tap a face for
// their card, the bubble to message them. Folds away into a little tab. Kept on this phone.

export type Recent = { id: string; name: string; avatar: Avatar | null; what: string; at: number };

const KEY = "nt-recent";
const OPEN_KEY = "nt-recent-open";
const MAX = 10;

function load(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Recent[];
    return Array.isArray(v) ? v.filter((r) => r && typeof r.id === "string") : [];
  } catch {
    return [];
  }
}

/** Note that you just dealt with someone ("Messaged", "Gave a gift"...): they go to the top of the list. */
export function rememberPerson(p: { id: string; name: string; avatar?: unknown }, what: string) {
  if (!p.id || p.id.startsWith("npc:")) return;
  const list = load().filter((r) => r.id !== p.id);
  const before = load().find((r) => r.id === p.id);
  list.unshift({ id: p.id, name: p.name || before?.name || "Someone", avatar: (p.avatar as Avatar | undefined) ?? before?.avatar ?? null, what, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {}
  window.dispatchEvent(new Event("nt-recent"));
}

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export function RecentRail({ onPerson, onMessage }: { onPerson: (id: string) => void; onMessage: (p: { id: string; name: string }) => void }) {
  const [list, setList] = useState<Recent[]>([]);
  const [open, setOpenNow] = useState(false);
  useEffect(() => {
    const read = () => setList(load());
    const t = setTimeout(() => {
      read();
      try {
        setOpenNow(localStorage.getItem(OPEN_KEY) === "1");
      } catch {}
    }, 0);
    window.addEventListener("nt-recent", read);
    window.addEventListener("storage", read);
    return () => {
      clearTimeout(t);
      window.removeEventListener("nt-recent", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const setOpen = (v: boolean) => {
    setOpenNow(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {}
  };
  if (!list.length) return null;
  const now = Date.now();

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="glass pointer-events-auto flex flex-col items-center gap-1 rounded-r-2xl py-2 pl-1 pr-1.5 shadow"
        aria-label={`Recent people (${list.length}): show them`}
      >
        <span className="flex flex-col -space-y-2">
          {list.slice(0, 3).map((r) => (
            <AvatarFace key={r.id} avatar={cleanAvatar(r.avatar, r.name)} size={26} className="rounded-full ring-2 ring-white" />
          ))}
        </span>
        <ChevronRight className="size-4 text-muted" />
      </button>
    );

  return (
    <div className="glass pointer-events-auto w-40 rounded-r-2xl py-2 pl-1.5 pr-1 shadow-lg" aria-label="Recent people">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Recent</span>
        <button onClick={() => setOpen(false)} className="grid size-6 place-items-center rounded-full hover:bg-ink/5" aria-label="Fold the recent people away">
          <ChevronLeft className="size-4" />
        </button>
      </div>
      <ul className="max-h-[46vh] space-y-0.5 overflow-y-auto overscroll-contain [scrollbar-width:none]">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-1">
            <button onClick={() => onPerson(r.id)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl p-1 text-left hover:bg-ink/5">
              <AvatarFace avatar={cleanAvatar(r.avatar, r.name)} size={30} className="shrink-0 rounded-full" />
              <span className="min-w-0">
                <b className="block truncate text-xs">{r.name}</b>
                <span className="block truncate text-[10px] text-muted">
                  {r.what} · {ago(now - r.at)}
                </span>
              </span>
            </button>
            <button onClick={() => onMessage({ id: r.id, name: r.name })} className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/5" aria-label={`Message ${r.name}`}>
              <MessageCircle className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
