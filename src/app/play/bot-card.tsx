"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Bot } from "@/components/icons";

// A small pop-up that explains who the bot is. Opens when someone taps the bot's name or face.

export function BotCard({ botName, bounty, onClose }: { botName: string; bounty: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bot-card-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-3xl bg-panel p-5 text-center shadow-xl"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#e5dbff] text-[#5f3dc4]">
          <Bot className="size-9" aria-hidden />
        </span>
        <h2 id="bot-card-title" className="mt-3 text-lg font-bold">
          {botName}
          <span className="ml-2 rounded-full bg-[#7048e8]/15 px-2 py-0.5 align-middle text-[11px] font-semibold text-[#5f3dc4]">Bot</span>
        </h2>
        <p className="mt-2 text-sm text-muted">
          {botName} is our bot. It hides in every round like a ghost, moves only when a drone sweeps it (3 times at most), and teases
          the chat. Find it for <b className="text-ink">{bounty.toLocaleString()} coins</b>!
        </p>
        <button onClick={onClose} className="mt-4 w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-white" autoFocus>
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
