"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Gamepad2, MapPin, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sheet } from "../sheet";
import { GameIcon } from "./icons";
import { MinigameInvites } from "./invites";
import { gamesFor, MINIGAME_BY_ID, MINIGAMES } from "./registry";
import { MiniGamePlayer, type Invite, type PlayCtx } from "./shell";
import { CATEGORIES, type Category, type MiniGameDef } from "./types";

// The games: all 100, by category, with the ones that suit the place you're in at the top
// ("Here"). Pick one to play it alone, with friends on this phone, or against someone here.

const CATS = Object.keys(CATEGORIES) as Category[];

function players(def: MiniGameDef) {
  if (def.kind === "turns") return `${def.seats?.[0] ?? 2}-${def.seats?.[1] ?? 2} players`;
  return "1-6 players";
}

export function GamesSheet({
  ctx,
  placeType,
  placeName,
  onClose,
  open,
}: {
  ctx: PlayCtx;
  /** What kind of place you're in (CityRoom.type), for the games that suit it. */
  placeType?: string | null;
  placeName?: string | null;
  onClose: () => void;
  /** Open straight into a game (and a challenge you accepted). */
  open?: { game: string; invite?: Invite | null } | null;
}) {
  const [cat, setCat] = useState<Category | "all" | "here">(placeType ? "here" : "all");
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<{ def: MiniGameDef; invite: Invite | null; at: number } | null>(() => {
    const def = open ? MINIGAME_BY_ID.get(open.game) : undefined;
    return def ? { def, invite: open?.invite ?? null, at: 0 } : null;
  });
  const here = useMemo(() => (placeType ? gamesFor(placeType) : []), [placeType]);
  const list = useMemo(() => {
    const base = cat === "here" ? here : cat === "all" ? MINIGAMES : MINIGAMES.filter((g) => g.cat === cat);
    const term = q.trim().toLowerCase();
    return term ? base.filter((g) => `${g.title} ${g.blurb} ${CATEGORIES[g.cat].label}`.toLowerCase().includes(term)) : base;
  }, [cat, q, here]);

  return (
    <Sheet onClose={onClose} wide>
      {/* Outside a place, challenges come through the town arcade while this is open. */}
      {!ctx.roomId && <MinigameInvites ctx={ctx} onAccept={(def, invite) => setPlaying({ def, invite, at: Date.now() })} />}
      {playing ? (
        <div className="space-y-2">
          <button onClick={() => setPlaying(null)} className="flex items-center gap-1 text-sm font-semibold text-muted">
            <ChevronLeft className="size-4" /> All games
          </button>
          <MiniGamePlayer key={`${playing.def.id}:${playing.at}`} def={playing.def} ctx={ctx} invite={playing.invite} onClose={() => setPlaying(null)} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-[#e5dbff] text-[#5f3dc4]">
              <Gamepad2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-extrabold leading-tight">Games</h2>
              <p className="truncate text-xs text-muted">{placeName ? `At ${placeName}` : `${MINIGAMES.length} games: play alone, together, or challenge someone`}</p>
            </div>
            <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2">
            <Search className="size-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a game" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {placeType && here.length > 0 && (
              <button onClick={() => setCat("here")} className={cn("flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold", cat === "here" ? "bg-ink text-white" : "bg-panel-2 text-muted")}>
                <MapPin className="size-3.5" /> Here
              </button>
            )}
            <button onClick={() => setCat("all")} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold", cat === "all" ? "bg-ink text-white" : "bg-panel-2 text-muted")}>
              All
            </button>
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold", cat === c ? "text-white" : "bg-panel-2 text-muted")} style={cat === c ? { background: CATEGORIES[c].colour } : undefined}>
                {CATEGORIES[c].label}
              </button>
            ))}
          </div>
          {cat !== "all" && cat !== "here" && <p className="text-xs text-muted">{CATEGORIES[cat].blurb}</p>}
          <div className="grid max-h-[55dvh] grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2">
            {list.map((g) => (
              <button key={g.id} onClick={() => setPlaying({ def: g, invite: null, at: Date.now() })} className="flex items-center gap-3 rounded-2xl bg-panel-2 p-2.5 text-left hover:bg-gold/20">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: g.colour }}>
                  <GameIcon name={g.icon} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{g.title}</b>
                  <span className="block truncate text-xs text-muted">{g.blurb}</span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-muted">
                    <Users className="size-3" /> {players(g)} · {CATEGORIES[g.cat].label}
                  </span>
                </span>
              </button>
            ))}
            {!list.length && <p className="p-3 text-sm text-muted">No games match that.</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
