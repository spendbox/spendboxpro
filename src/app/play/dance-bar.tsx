"use client";

import { Music, PartyPopper, Square } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { DANCE_MOVES, type DanceMove } from "./city/dance-moves";

// On a club's dance floor: pick your move, pick someone to dance with (a player dancing here,
// or one of the regulars), start a dance-off, or stop. Everyone in the club sees your move and
// who you're dancing with; you see yourself dancing in the middle of the floor.

export type DancePartner = { id: string; name: string; avatar: Avatar; npc: boolean };

export function DanceBar({
  move,
  partner,
  partners,
  onMove,
  onPartner,
  onDanceOff,
  onStop,
}: {
  move: DanceMove;
  /** Who you're dancing with (an id from partners), or null. */
  partner: string | null;
  /** People you can dance with: players dancing here first, then the regulars on the floor. */
  partners: DancePartner[];
  onMove: (m: DanceMove) => void;
  onPartner: (id: string | null) => void;
  onDanceOff: () => void;
  onStop: () => void;
}) {
  const label = DANCE_MOVES.find((m) => m.id === move)?.label ?? "Dancing";
  const withName = partners.find((p) => p.id === partner)?.name;
  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e64980] text-white motion-safe:animate-bounce">
          <Music className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate">You&apos;re dancing: {label}</b>
          <span className="block truncate text-xs text-muted">{withName ? `With ${withName}. Drag to look round.` : "Pick a move, or someone to dance with. Drag to look round."}</span>
        </span>
        <button onClick={onStop} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-panel-2 px-3 py-2 font-semibold">
          <Square className="size-3.5" fill="currentColor" />
          Stop
        </button>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="radiogroup" aria-label="Dance move">
        {DANCE_MOVES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={m.id === move}
            onClick={() => onMove(m.id)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", m.id === move ? "bg-[#e64980] text-white shadow" : "bg-panel-2 text-ink")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {partners.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">Dance with</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {partners.map((p) => {
              const on = p.id === partner;
              return (
                <button key={p.id} onClick={() => onPartner(on ? null : p.id)} aria-pressed={on} className="flex w-14 shrink-0 flex-col items-center gap-0.5">
                  <span className={cn("relative rounded-full", on && "ring-[3px] ring-[#e64980] ring-offset-2 ring-offset-white")}>
                    <AvatarFace avatar={p.avatar} size={40} className="rounded-full" />
                    {p.npc && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-[#ffd43b] px-1 text-[8px] font-extrabold leading-tight text-ink">NPC</span>}
                  </span>
                  <span className="w-full truncate text-center text-[11px] font-medium">{p.name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={onDanceOff} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 font-semibold text-white">
        <PartyPopper className="size-4" />
        Dance-off and spray money
      </button>
    </div>
  );
}
