"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Swords } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cn } from "@/lib/cn";
import type { DuelView } from "@/lib/ghost-duels";
import { answerDuel, giveUpDuel } from "../ghost-duel-actions";
import { playSfx } from "../sound";
import { localTime } from "./parts";

// A hunter challenged you (a ghost): this pops up wherever you are, in the town or inside a
// building, with the seconds you have left to answer. No answer in time is a loss.

export function ChallengePopup({ duel, onPlay, onDone }: { duel: DuelView; onPlay: (d: DuelView) => void; onDone: (text: string) => void }) {
  const [ends, setEnds] = useState<number | null>(null);
  const [left, setLeft] = useState(30);
  const [busy, setBusy] = useState<"play" | "quit" | null>(null);
  const deadline = duel.answerBy;
  const serverNow = duel.now;
  useEffect(() => {
    const t = setTimeout(() => setEnds(localTime(deadline, serverNow, Date.now())), 0);
    playSfx("start");
    return () => clearTimeout(t);
  }, [deadline, serverNow]);
  useEffect(() => {
    if (ends === null) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((ends - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [ends]);
  // A beep in the last ten seconds.
  useEffect(() => {
    if (left > 0 && left <= 10) playSfx("tick");
  }, [left]);

  async function play() {
    setBusy("play");
    const res = await answerDuel(duel.id).catch(() => ({ ok: false as const, error: "The connection blinked. Tap again." }));
    setBusy(null);
    if (res.ok) onPlay(res.duel);
    else onDone(res.error);
  }
  async function quit() {
    setBusy("quit");
    const res = await giveUpDuel(duel.id).catch(() => ({ ok: false as const, error: "The connection blinked." }));
    setBusy(null);
    onDone(res.ok ? `You gave up the duel with ${duel.opponent.name}. That counts as a loss.` : res.error);
  }

  const total = 30;
  return (
    <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-ink p-3 text-white shadow-2xl ring-2 ring-[#ff922b]" role="alertdialog" aria-label="Duel challenge">
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          <AvatarFace avatar={duel.opponent.avatar} size={48} className="rounded-full ring-2 ring-white" />
          <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-[#ff922b]">
            <Swords className="size-3.5" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{duel.opponent.name} challenged you!</p>
          <p className="text-xs text-white/75">Rock-Paper-Scissors, first to {duel.firstTo}. Answer or you lose it.</p>
        </div>
        <span className={cn("font-display text-2xl font-extrabold tabular-nums", left <= 10 && "animate-pulse text-[#ffa8a8]")}>{left}s</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-[#ff922b] transition-[width] duration-300" style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <button onClick={() => void quit()} disabled={busy !== null} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
          {busy === "quit" ? <LoaderCircle className="size-4 animate-spin" /> : "Give up"}
        </button>
        <button onClick={() => void play()} disabled={busy !== null} className="flex items-center justify-center gap-2 rounded-xl bg-[#ff922b] py-2.5 font-bold">
          {busy === "play" ? <LoaderCircle className="size-4 animate-spin" /> : <Swords className="size-4" />}
          Play now
        </button>
      </div>
    </div>
  );
}
