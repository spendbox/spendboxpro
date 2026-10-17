"use client";

import { useState } from "react";
import { Circle, Plus, Square, Star, Triangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TurnViewProps } from "../types";
import { Act } from "./common";
import { SHAPES, WHOT, playable, shapeOf, valueOf, type M, type S } from "@/lib/whot";

// Whot! for the turn table: the rules live in src/lib/whot.ts (the server runs them too).
export { SHAPES, WHOT, playable, rules, shapeOf, valueOf, type M, type S } from "@/lib/whot";

const SHAPE_ICONS = [Circle, Triangle, Plus, Square, Star];
const SHAPE_COLOUR = "#7a1f2b";

function WhotCard({ c, onClick, can, small }: { c: number; onClick?: () => void; can?: boolean; small?: boolean }) {
  const sh = shapeOf(c);
  const Icon = sh < 5 ? SHAPE_ICONS[sh] : null;
  return (
    <button
      onClick={onClick}
      disabled={!onClick || !can}
      className={cn("relative flex shrink-0 flex-col items-center justify-center rounded-lg border-2 bg-[#fffaf0] font-extrabold shadow transition", small ? "h-16 w-11 text-sm" : "h-20 w-14 text-lg", can ? "-translate-y-1 border-gold" : "border-[#e9d8b4]")}
      style={{ color: SHAPE_COLOUR }}
      aria-label={sh < 5 ? `${SHAPES[sh]} ${valueOf(c)}` : "Whot 20"}
    >
      <span className="absolute left-1 top-0.5 text-[10px]">{valueOf(c)}</span>
      {Icon ? <Icon className={small ? "size-5" : "size-7"} fill={sh === 2 ? "none" : "currentColor"} strokeWidth={sh === 2 ? 4 : 2} /> : <span className="text-[11px] leading-tight">WHOT</span>}
      <span className="text-xs">{valueOf(c)}</span>
    </button>
  );
}

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const [asking, setAsking] = useState(false);
  const hand = s.hands[seat] ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {s.hands.map((h, i) =>
          i === seat ? null : (
            <span key={i} className={cn("rounded-full px-2 py-1", s.turn === i ? "bg-ink text-white" : "bg-panel-2")}>
              {names[i]}: {h.length} card{h.length === 1 ? "" : "s"}
            </span>
          ),
        )}
      </div>
      <div className="flex items-center justify-center gap-6 rounded-3xl bg-[#2b8a3e] p-4">
        <div className="text-center text-xs font-semibold text-white">
          <div className="grid h-20 w-14 place-items-center rounded-lg border-2 border-white bg-[#7a1f2b] font-extrabold">WHOT</div>
          Market {s.market.length}
        </div>
        <div className="text-center text-xs font-semibold text-white">
          <WhotCard c={s.top} />
          {s.top === WHOT && s.ask !== null ? `Needs ${SHAPES[s.ask]}` : "Top card"}
        </div>
      </div>
      <p className="h-5 text-center text-sm font-bold">{s.log}</p>
      {asking ? (
        <div className="space-y-1">
          <p className="text-center text-sm font-semibold">Ask for a shape:</p>
          <div className="grid grid-cols-5 gap-1.5">
            {SHAPES.map((name, a) => {
              const Icon = SHAPE_ICONS[a];
              return (
                <button key={name} onClick={() => (setAsking(false), onMove({ play: WHOT, ask: a }))} className="flex flex-col items-center gap-0.5 rounded-xl bg-panel-2 py-2 text-[10px] font-semibold" style={{ color: SHAPE_COLOUR }}>
                  <Icon className="size-5" fill={a === 2 ? "none" : "currentColor"} />
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto px-1 pb-2 pt-2">
          {hand.map((c, i) => (
            <WhotCard key={`${c}-${i}`} c={c} small={hand.length > 6} can={canMove && playable(s, c)} onClick={() => (c === WHOT ? setAsking(true) : onMove({ play: c }))} />
          ))}
        </div>
      )}
      <Act onClick={() => onMove({ draw: true })} disabled={!canMove} tone="soft">
        Go to market
      </Act>
    </div>
  );
}
