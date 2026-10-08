"use client";

import { Armchair, ArrowUpFromLine, Sparkles } from "lucide-react";
import type { SeatTaker } from "../rooms";
import { BigButton, Face, GameHeader, useSecondsLeft, type GameProps } from "./ui";

/** What the seat card needs from useRooms (pass rooms itself: it has all of these). */
export type Seating = {
  seats: Record<string, SeatTaker>;
  mySeat: string | null;
  seatEndsAt: number | null;
  sit: (seatId: string) => { ok: boolean; reason?: "taken" | "not_here" };
  stand: () => void;
};

// A seat inside a place. One person at a time, for 3 minutes at most. People sitting down are
// the ones most likely to be handed a side quest.

export function SeatCard({ seatId, seating, ...props }: GameProps & { seatId: string; seating?: Seating }) {
  const taker = seating?.seats[seatId] ?? null;
  const mine = seating?.mySeat === seatId;
  const left = useSecondsLeft(mine ? (seating?.seatEndsAt ?? null) : null);

  function sit() {
    const res = seating?.sit(seatId);
    if (res?.ok) props.onClose();
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={Armchair} title={props.label || "Seat"} sub={mine ? "You're sitting here" : taker ? "Taken" : "Free"} onClose={props.onClose} color="#a0522d" />
      {taker ? (
        <div className="flex items-center gap-3 rounded-2xl bg-panel-2 p-3">
          <Face p={taker} size={40} />
          <p className="text-sm">
            <b>{taker.name}</b> is sitting here. Seats free up after 3 minutes at most.
          </p>
        </div>
      ) : mine ? (
        <p className="rounded-2xl bg-panel-2 p-3 text-sm">
          Comfy? You can stay for another <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b>, then it&apos;s someone else&apos;s turn.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-2xl bg-gold/20 p-3 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-dark" />
          Take a seat for a while. People who sit down are the ones most often handed secret side quests!
        </p>
      )}
      {!props.me ? (
        <BigButton tone="soft" disabled>
          Sign in to sit down
        </BigButton>
      ) : mine ? (
        <BigButton
          onClick={() => {
            seating?.stand();
            props.onClose();
          }}
        >
          <ArrowUpFromLine className="size-4" /> Stand up
        </BigButton>
      ) : (
        <BigButton tone="gold" onClick={sit} disabled={!!taker || !seating}>
          <Armchair className="size-4" /> {taker ? "Seat taken" : "Sit down"}
        </BigButton>
      )}
    </div>
  );
}
