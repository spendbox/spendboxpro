"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AvatarFace } from "@/components/avatar";
import { MessageCircle, X } from "@/components/icons";
import { npcReply, type Npc } from "@/lib/npcs";

// A small pop-up about one of the city's regulars (the made-up people who hang around each
// floor, rooftop and balloon). Opens when someone taps a regular's face or name. "Say hi" gets
// a friendly reply, worked out on this device (regulars don't get private messages).

export const REGULAR_PILL = "bg-[#0b7285]/12 text-[#0b7285]";

export function NpcCard({ npc, onClose }: { npc: Npc; onClose: () => void }) {
  const [said, setSaid] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onClose]);

  function sayHi() {
    if (typing) return;
    setTyping(true);
    // A short pause, as if they're thinking. The first answer is always their hello.
    timer.current = window.setTimeout(() => {
      setSaid((s) => [...s, npcReply(npc, s.length)]);
      setTyping(false);
    }, 700);
  }

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-card-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xs rounded-3xl bg-panel p-5 text-center shadow-xl"
      >
        <button onClick={onClose} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-4" aria-hidden />
        </button>
        <AvatarFace avatar={npc.avatar} size={72} className="mx-auto rounded-full" />
        <h2 id="npc-card-title" className="mt-3 text-lg font-bold">
          {npc.name}
          <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${REGULAR_PILL}`}>Regular</span>
        </h2>
        <p className="text-sm font-semibold text-muted">{npc.role}</p>
        <p className="mt-2 text-sm">{npc.blurb}</p>

        {(said.length > 0 || typing) && (
          <div className="mt-4 space-y-2 text-left text-sm" aria-live="polite">
            {said.slice(-3).map((line, i) => (
              <div key={said.length - i} className="space-y-2">
                <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-ink px-3 py-1.5 text-white">Hi!</p>
                <div className="flex items-end gap-2">
                  <AvatarFace avatar={npc.avatar} size={24} className="shrink-0 rounded-full" />
                  <p className="rounded-2xl rounded-bl-md bg-panel-2 px-3 py-1.5">{line}</p>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-end gap-2">
                <AvatarFace avatar={npc.avatar} size={24} className="shrink-0 rounded-full" />
                <p className="flex gap-1 rounded-2xl rounded-bl-md bg-panel-2 px-3 py-2.5" aria-label={`${npc.name} is typing`}>
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={sayHi}
          disabled={typing}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          autoFocus
        >
          <MessageCircle className="size-4" aria-hidden />
          {said.length ? "Say hi again" : "Say hi"}
        </button>
        <p className="mt-3 text-[11px] text-muted">
          Regulars are part of the city. They chat with everyone in this place, but they don&apos;t get private messages.
        </p>
      </div>
    </div>,
    document.body,
  );
}
