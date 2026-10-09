"use client";

import { Crown, Ghost, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cn } from "@/lib/cn";
import type { BoardGhost, DuelRules } from "@/lib/ghost-duels";
import { Sheet } from "../sheet";
import { Dots, GLOW } from "./parts";

// Every ghost lit up in this game, in a list (handy when their lights are off the screen).
// Tap one to fly over to their light and open their card.

export function GhostsSheet({ ghosts, rules, meId, onPick, onClose }: { ghosts: BoardGhost[]; rules: DuelRules; meId: string; onPick: (g: BoardGhost) => void; onClose: () => void }) {
  const order = { free: 0, playing: 1, golden: 2 } as const;
  const list = [...ghosts].sort((a, b) => order[a.status] - order[b.status] || b.wins - a.wins);
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-ink text-white">
          <Ghost className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-extrabold leading-tight">Ghosts in this game</h2>
          <p className="text-xs text-muted">Tap one to see their stats and challenge them.</p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      {list.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-panel-2 px-4 py-6 text-center text-sm text-muted">No ghosts are lit up right now.</p>
      ) : (
        <ul className="mt-3 max-h-[60dvh] space-y-1 overflow-y-auto">
          {list.map((g) => {
            const glow = GLOW[g.status];
            return (
              <li key={g.id}>
                <button onClick={() => onPick(g)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-panel-2">
                  <span className="relative shrink-0 rounded-full p-0.5" style={{ boxShadow: `0 0 0 2px ${glow.ring}, 0 0 10px 2px ${glow.ring}66` }}>
                    <AvatarFace avatar={g.avatar} size={38} className="rounded-full" />
                    {g.status === "golden" && <Crown className="absolute -right-1 -top-1 size-4 rounded-full bg-[#fcc419] p-0.5 text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">
                      {g.name}
                      {g.id === meId && " (you)"}
                    </b>
                    <span className="flex items-center gap-2 text-[11px] text-muted">
                      <Dots n={g.wins} max={rules.goldenWins} tone="win" />
                      <Dots n={g.losses} max={rules.outLosses} tone="loss" />
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", glow.chip)}>{glow.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
