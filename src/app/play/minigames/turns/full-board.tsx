"use client";

import { Crown, Flag, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { FullScreen } from "../fullscreen";
import { Board3D, type Board, type BoardStyle } from "./board3d";

// Chess and draughts, full screen: the 3D board edge to edge, the two players top and bottom
// (who's to move glows, the pieces each has taken), what's happening in the middle ("Your move",
// "Check!", "Bayo is thinking..."), and a big result at the end. Leaving mid-game asks first.

export type Side = { name: string; colour: string; ring: string; taken: number; label: string };

export function FullBoard({
  style,
  board,
  last,
  flip,
  pickable,
  selected,
  targets,
  danger,
  onSquare,
  me,
  them,
  myTurn,
  theirTurn,
  status,
  over,
  onQuit,
}: {
  style: BoardStyle;
  board: Board;
  last: number[];
  flip: boolean;
  pickable: Set<number>;
  selected: number | null;
  targets: Set<number>;
  danger: number | null;
  onSquare: (i: number) => void;
  /** The player at the bottom (this screen) and the one at the top. */
  me: Side;
  them: Side;
  myTurn: boolean;
  theirTurn: boolean;
  status: string;
  over: { title: string; sub: string; won: boolean } | null;
  onQuit?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const quit = () => {
    if (over || !onQuit) return onQuit?.();
    setAsking(true);
  };
  return (
    <FullScreen onQuit={quit} quitLabel="Leave the game" className="bg-[#15110e]">
      <div className="relative flex-1">
        <Board3D style={style} board={board} last={last} flip={flip} pickable={pickable} selected={selected} targets={targets} danger={danger} onSquare={onSquare} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-3">
          <Player side={them} active={theirTurn && !over} className="mr-20" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center">
          {!over && (
            <span key={status} className={cn("rounded-full px-4 py-1.5 text-sm font-bold shadow-lg backdrop-blur-sm", status === "Check!" ? "bg-[#e03131] text-white" : "bg-black/55 text-white")}>
              {theirTurn && <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin align-[-0.15em]" />}
              {status}
            </span>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/70 to-transparent px-3 pb-4 pt-10">
          <Player side={me} active={myTurn && !over} />
        </div>

        {over && (
          <div className="absolute inset-x-6 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-3xl border border-white/10 bg-[#120e0b]/85 p-6 text-center text-white shadow-2xl backdrop-blur-md">
            {over.won && <Crown className="mx-auto mb-2 size-10 text-[#f2c14e]" />}
            <p className="font-display text-3xl font-extrabold">{over.title}</p>
            <p className="mt-1 text-sm text-white/70">{over.sub}</p>
          </div>
        )}

        {asking && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 p-6">
            <div className="w-full max-w-xs rounded-3xl bg-[#1d1814] p-5 text-center text-white shadow-2xl">
              <Flag className="mx-auto size-8 text-[#ff8787]" />
              <p className="mt-2 font-display text-xl font-bold">Leave and give up the game?</p>
              <p className="mt-1 text-sm text-white/60">The fee you paid isn&apos;t given back.</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setAsking(false)} className="flex-1 rounded-2xl bg-white/10 py-2.5 font-semibold">
                  Keep playing
                </button>
                <button onClick={() => onQuit?.()} className="flex-1 rounded-2xl bg-[#e03131] py-2.5 font-semibold">
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FullScreen>
  );
}

function Player({ side, active, className }: { side: Side; active: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2 text-white transition", active ? "bg-white/15 ring-2" : "bg-black/30", className)} style={active ? ({ "--tw-ring-color": side.ring } as React.CSSProperties) : undefined}>
      <span className="size-7 shrink-0 rounded-full border-2 border-white/60 shadow" style={{ background: side.colour }} />
      <span className="min-w-0">
        <b className="block max-w-[11rem] truncate leading-tight">{side.name}</b>
        <span className="block text-[11px] font-semibold text-white/60">
          {side.label}
          {side.taken > 0 && ` · took ${side.taken}`}
        </span>
      </span>
      {active && <span className="ml-1 size-2.5 shrink-0 animate-pulse rounded-full" style={{ background: side.ring }} />}
    </div>
  );
}
