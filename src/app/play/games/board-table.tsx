"use client";

import { useMemo, useState } from "react";
import type { ChallengeView } from "../fight/challenge-actions";
import { useChallengeChannel } from "../fight/channel";
import { MINIGAME_BY_ID } from "../minigames/registry";
import { TurnTable, type Seat } from "../minigames/turn-table";
import { BoardInTable } from "../minigames/turns/full-board";
import { PartyShell, useSeats, useSettle, type Me, type Theme } from "./party-table";

// Chess and draughts against someone you challenged (docs/GAME_TABLES.md): the table's lobby,
// chat, voice and stake (./party-table), and the full-screen 3D board in the middle
// (../minigames/turns/board3d). The first one in plays white (red at draughts). Every phone plays
// the same game; only the moves travel, over the challenge's own channel. Someone gone for 40
// seconds is played by the computer, so a game never freezes; the winner takes the pool.

const GOLD = "#f2c14e";
const theme = (game: string): Theme => ({
  background: "radial-gradient(ellipse 80% 50% at 50% 0%, #4a2a14 0%, transparent 70%), linear-gradient(180deg, #1d140d 0%, #0d0906 100%)",
  accent: GOLD,
  onAccent: "#1b1716",
  panel: "linear-gradient(180deg, rgba(45,30,20,0.97), rgba(18,12,8,0.97))",
  logo: <span className="font-display text-lg font-black uppercase tracking-[0.18em] text-white">{game === "draughts" ? "Draughts" : "Chess"}</span>,
  quick: game === "draughts" ? ["Crown me! 👑", "Nice jump 🔥", "Your move ⏳", "Good game 🤝", "😂"] : ["Check! ♟️", "Nice move 👏", "Your move ⏳", "Good game 🤝", "😅"],
});

export function BoardTable({ view, me, now, onClose, onMessage, onJoin, onRematch }: { view: ChallengeView; me: Me; now: number; onClose: () => void; onMessage: (text: string, good: boolean) => void; onJoin?: () => void; onRematch?: () => void }) {
  const ch = useChallengeChannel(view.id, me);
  const { players, watching, playing, kinds } = useSeats(view, me, ch);
  const game = view.game === "draughts" ? "draughts" : "chess";
  const def = MINIGAME_BY_ID.get(game)!;
  const [winners, setWinners] = useState<number[] | null>(null);
  useSettle(view, watching, playing ? winners : null, onMessage);
  const two = players.slice(0, 2);
  const seats: Seat[] = useMemo(() => two.map((p, i) => ({ kind: kinds[i] ?? "remote", name: p.name })), [two, kinds]);
  const standings = players.map((p, i) => ({ p, points: winners?.includes(i) ? 1 : 0 })).sort((a, b) => b.points - a.points);
  const overTitle = winners ? (winners.length === 1 ? `${players[winners[0]]?.name ?? "Someone"} wins!` : "A draw") : "";
  return (
    <PartyShell
      view={view}
      me={me}
      now={now}
      ch={ch}
      theme={theme(game)}
      title={def.title}
      over={!!winners}
      standings={standings}
      overTitle={overTitle}
      onClose={onClose}
      onMessage={onMessage}
      onJoin={onJoin}
      onRematch={onRematch}
    >
      {() =>
        two.length < 2 ? (
          <p className="grid flex-1 place-items-center text-sm text-white/70">Waiting for the other player…</p>
        ) : (
          <BoardInTable.Provider value={true}>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <TurnTable bare def={def} seats={seats} seed={view.seed} online={ch.online} onEnd={(r) => setWinners(r.seats ?? [])} />
            </div>
          </BoardInTable.Provider>
        )
      }
    </PartyShell>
  );
}
