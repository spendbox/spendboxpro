"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChallengeView } from "../fight/challenge-actions";
import { useChallengeChannel } from "../fight/channel";
import { Match, makeRoster, type Result } from "../paintball/paintball";
import { PaintballNet } from "../paintball/net";
import { PartyShell, useSeats, useSettle, type Me, type Theme } from "./party-table";

// Paintball against people you challenged (docs/GAME_TABLES.md, docs/PAINTBALL_PLAN.md): the
// table's lobby, chat, voice and stake (./party-table), then the 3D match full screen. You and
// them on opposite teams (in the order you joined), bots in the empty places. The winning team's
// best player takes the pool; a tie is a draw (stakes back).

const theme: Theme = {
  background: "radial-gradient(ellipse at 20% 10%, rgba(224,49,49,.35), transparent 55%), radial-gradient(ellipse at 80% 90%, rgba(28,126,214,.35), transparent 55%), #0d1117",
  accent: "#ff6b6b",
  onAccent: "#ffffff",
  panel: "linear-gradient(180deg, rgba(22,27,34,0.97), rgba(10,13,18,0.97))",
  logo: (
    <span className="font-display text-lg font-black tracking-tight text-white">
      PAINT<span className="text-[#ff6b6b]">BALL</span>
    </span>
  ),
  quick: ["Let's go! 🔥", "Cover me 🛡️", "Got you! 🎯", "Splat! 💥", "Good game 🤝", "😂"],
};

export function PaintballTable({ view, me, now, onClose, onMessage, onJoin, onRematch }: { view: ChallengeView; me: Me; now: number; onClose: () => void; onMessage: (text: string, good: boolean) => void; onJoin?: () => void; onRematch?: () => void }) {
  const ch = useChallengeChannel(view.id, me);
  const { players, watching, playing } = useSeats(view, me, ch);
  const [result, setResult] = useState<Result | null>(null);
  const [left, setLeft] = useState(false);
  // The winners for the server: the best player on the team that won, or everyone on a tie.
  const winners = useMemo(() => {
    if (!result) return null;
    if (result.draw) return players.map((_, i) => i);
    const team = result.scores[0] > result.scores[1] ? 0 : 1;
    const best = result.rows.filter((r) => !r.bot && r.team === team).sort((a, b) => b.hits - a.hits || a.outs - b.outs)[0];
    const seat = best ? players.findIndex((p) => p.id === best.id) : -1;
    return seat >= 0 ? [seat] : players.map((_, i) => i);
  }, [result, players]);
  useSettle(view, watching, playing ? winners : null, onMessage);

  // The match's own live channel, while it's on.
  const [net, setNet] = useState<PaintballNet | null>(null);
  const inMatch = playing && !watching && !result && !left;
  useEffect(() => {
    if (!inMatch) return;
    const n = new PaintballNet(`ch-${view.id}`, { id: me.id, name: me.name });
    setNet(n);
    return () => {
      n.close();
      setNet(null);
    };
  }, [inMatch, view.id, me.id, me.name]);
  const ids = players.map((p) => `${p.id}:${p.name}`).join("|");
  const start = useMemo(
    () => ({ t: "start" as const, m: `ch-${view.id}`, seed: view.seed, at: Date.parse(view.startsAt) + 4000, roster: makeRoster(players.map((p) => ({ id: p.id, name: p.name })), view.seed) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.id, view.seed, view.startsAt, ids],
  );
  const standings = result
    ? players.map((p) => ({ p, points: result.rows.find((r) => r.id === p.id)?.hits ?? 0 })).sort((a, b) => b.points - a.points)
    : players.map((p) => ({ p, points: 0 }));
  const overTitle = result ? (result.draw ? "A draw!" : `${result.scores[0] > result.scores[1] ? "Red" : "Blue"} wins ${Math.max(...result.scores)}–${Math.min(...result.scores)}`) : "";

  return (
    <PartyShell view={view} me={me} now={now} ch={ch} theme={theme} title="Paintball" over={!!result} standings={standings} overTitle={overTitle} onClose={onClose} onMessage={onMessage} onJoin={onJoin} onRematch={onRematch}>
      {() => (
        <div className="grid flex-1 place-items-center p-6 text-center text-white/80">
          {inMatch && net ? (
            <Match me={{ id: me.id, name: me.name }} start={start} net={net} onQuit={() => setLeft(true)} onEnd={setResult} />
          ) : watching ? (
            <p>A paintball match is on. Only the players can see the field.</p>
          ) : left && !result ? (
            <button onClick={() => setLeft(false)} className="rounded-2xl bg-[#e03131] px-5 py-3 font-bold text-white">
              Back to the match
            </button>
          ) : (
            <p>Getting the field ready…</p>
          )}
        </div>
      )}
    </PartyShell>
  );
}
