"use client";

import { useState } from "react";
import { Check, Handshake, Heart, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { questEvent } from "./activities/quest-store";
import { sendGreeting } from "./hug-actions";
import { playSfx } from "./sound";

// Hug and Shake hands buttons, for anyone you can see (people here with you, friends, a private
// chat). Free, with daily limits; the other player is told and can say thank you from My gifts.

export function GreetButtons({
  person,
  onDone,
  compact,
}: {
  person: { id: string; name: string };
  /** What happened, for the game's message line. */
  onDone: (text: string, ok: boolean) => void;
  /** Icons only (for tight rows). */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<"hug" | "handshake" | null>(null);
  const [sent, setSent] = useState<"hug" | "handshake" | null>(null);

  async function send(kind: "hug" | "handshake") {
    if (busy) return;
    setBusy(kind);
    const res = await sendGreeting(person.id, kind);
    setBusy(null);
    if (!res.ok) {
      playSfx("denied");
      return onDone(res.error, false);
    }
    setSent(kind);
    setTimeout(() => setSent((s) => (s === kind ? null : s)), 2500);
    questEvent({ type: "greet" });
    playSfx("found");
    onDone(kind === "hug" ? `You gave ${person.name} a hug!` : `You shook hands with ${person.name}!`, true);
  }

  const button = (kind: "hug" | "handshake") => {
    const Icon = sent === kind ? Check : busy === kind ? LoaderCircle : kind === "hug" ? Heart : Handshake;
    const label = kind === "hug" ? `Hug ${person.name}` : `Shake hands with ${person.name}`;
    return (
      <button
        key={kind}
        onClick={() => void send(kind)}
        disabled={busy !== null}
        className={cn(
          "flex shrink-0 items-center justify-center gap-1 rounded-full font-semibold disabled:opacity-60",
          kind === "hug" ? "bg-[#ffe3ec] text-[#d6336c] hover:bg-[#ffd1df]" : "bg-[#fff3bf] text-[#e67700] hover:bg-[#ffec99]",
          compact ? "size-7" : "px-2.5 py-1.5 text-xs",
        )}
        aria-label={label}
        title={label}
      >
        <Icon className={cn("size-3.5", busy === kind && "animate-spin", kind === "hug" && sent !== kind && busy !== kind && "fill-current")} aria-hidden />
        {!compact && (kind === "hug" ? "Hug" : "Shake")}
      </button>
    );
  };

  return (
    <>
      {button("hug")}
      {button("handshake")}
    </>
  );
}
