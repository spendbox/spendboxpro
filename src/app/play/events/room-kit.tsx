"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Send, Users } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { REACTIONS, untilText } from "@/lib/world/events";
import type { RoomMsg, RoomPerson } from "./channel";

// The pieces both rooms share: the bar along the top, the chat, and reactions floating up.

export type RoomMe = { id: string; name: string; avatar: unknown };

/** Along the top: the event, how long is left, who's here, and a button back to the map. */
export function RoomTop({ title, icon, endsAt, here, onMin, extra }: { title: string; icon: string; endsAt: number; here: number; onMin: () => void; extra?: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15 text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-extrabold leading-tight">{title}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-white/75">
          <span className="inline-flex items-center gap-1 rounded-full bg-hit px-1.5 font-bold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
          {endsAt > now ? `${untilText(endsAt - now)} left` : "Ending"}
          <span className="inline-flex items-center gap-0.5">
            <Users className="size-3" /> {here}
          </span>
        </p>
      </div>
      {extra}
      <button onClick={onMin} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15" aria-label="Back to the map (you stay in)" title="Back to the map">
        <ChevronDown className="size-5" />
      </button>
    </div>
  );
}

/** Reactions floating up from the bottom for everyone. */
export function FloatingReactions({ on }: { on: (fn: (m: RoomMsg) => void) => () => void }) {
  const [bits, setBits] = useState<{ k: number; e: string; x: number }[]>([]);
  const k = useRef(0);
  useEffect(
    () =>
      on((m) => {
        if (m.t !== "react" || !REACTIONS.includes(m.e)) return;
        const key = ++k.current;
        setBits((b) => [...b.slice(-24), { k: key, e: m.e, x: 8 + Math.random() * 84 }]);
        setTimeout(() => setBits((b) => b.filter((x) => x.k !== key)), 2600);
      }),
    [on],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <span key={b.k} className="event-float absolute bottom-24 text-3xl" style={{ left: `${b.x}%` }}>
          {b.e}
        </span>
      ))}
    </div>
  );
}

/** A row of reaction buttons. */
export function ReactBar({ me, send }: { me: RoomMe; send: (m: RoomMsg) => void }) {
  const last = useRef(0);
  return (
    <div className="flex gap-1">
      {REACTIONS.map((e) => (
        <button
          key={e}
          onClick={() => {
            // A few a second at most.
            if (Date.now() - last.current < 250) return;
            last.current = Date.now();
            send({ t: "react", from: me.id, e });
          }}
          className="grid size-9 place-items-center rounded-full bg-white/15 text-lg transition active:scale-90"
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** The room's chat: the last lines, and a box to say something. */
export function RoomChat({ me, lines, send, onPerson, compact }: { me: RoomMe; lines: Extract<RoomMsg, { t: "chat" }>[]; send: (m: RoomMsg) => void; onPerson?: (id: string) => void; compact?: boolean }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines.length]);
  const go = () => {
    const t = text.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!t || Date.now() - last.current < 1000) return;
    last.current = Date.now();
    send({ t: "chat", from: me.id, name: me.name, text: t, at: Date.now() });
    setText("");
  };
  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div ref={box} className={cn("min-h-0 space-y-1 overflow-y-auto pr-1 [scrollbar-width:none]", compact ? "max-h-24" : "max-h-40")}>
        {lines.length === 0 && <p className="text-xs text-white/60">Say hi to the room.</p>}
        {lines.map((l, i) => (
          <p key={`${l.at}-${i}`} className="text-[13px] leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
            <button onClick={() => l.from !== me.id && onPerson?.(l.from)} className="font-bold text-gold">
              {l.from === me.id ? "You" : l.name}
            </button>{" "}
            {l.text}
          </p>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex h-10 items-center gap-1 rounded-full bg-white/15 pl-3.5 pr-1"
      >
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} placeholder="Say something…" className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/55" enterKeyHint="send" />
        <button type="submit" disabled={!text.trim()} className="grid size-8 place-items-center rounded-full bg-white text-ink disabled:opacity-40" aria-label="Send">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

/** A face in the room (tap to see who it is). */
export function Face({ p, size = 40, onPerson, ring, bob }: { p: Pick<RoomPerson, "id" | "name" | "avatar">; size?: number; onPerson?: (id: string) => void; ring?: string; bob?: number }) {
  return (
    <button onClick={() => onPerson?.(p.id)} className="flex flex-col items-center gap-0.5" title={p.name} style={bob !== undefined ? { animation: `event-bob 0.9s ease-in-out ${bob}s infinite` } : undefined}>
      <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={size} className={cn("rounded-full ring-2", ring ?? "ring-white/70")} />
      <span className="max-w-[4.5rem] truncate text-[10px] font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,.7)]">{p.name}</span>
    </button>
  );
}

/** A small pop-up panel inside a room (over its bottom part). */
export function RoomPanel({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="toast-in absolute inset-x-2 bottom-2 z-20 max-h-[70%] overflow-y-auto rounded-3xl bg-panel p-4 text-ink shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-display text-lg font-extrabold">{title}</p>
        <button onClick={onClose} className="h-8 rounded-full bg-ink/5 px-3 text-xs font-bold">
          Close
        </button>
      </div>
      {children}
    </div>
  );
}
