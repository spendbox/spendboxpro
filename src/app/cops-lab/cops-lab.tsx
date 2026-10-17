"use client";

import { useMemo, useState } from "react";
import { PRACTICE_LOADOUT } from "@/lib/cops";
import { sessionsNow } from "@/lib/scheduled";
import type { CopsStatus } from "../play/cops-actions";
import { CopsRobbers, Results } from "../play/cops/cops";
import { CopsCountdown } from "../play/cops/countdown-ring";
import { Match, type EndResult, type Setup } from "../play/cops/match";
import type { Tod } from "../play/cops/scene";

const ME = { id: "00000000-0000-4000-8000-000000000001", name: "You" };

/** Made-up lobby numbers: a game on now, sign-ups for the next, last game's leaderboard. */
function demo(): CopsStatus {
  const { next } = sessionsNow("cops-robbers");
  const rows = [
    { i: "a", n: "Tee", tm: 0, a: 1240, k: 9, d: 3, l: 0, p: 61.2 },
    { i: ME.id, n: "You", tm: 0, a: 980, k: 7, d: 4, l: 0, p: 48.4 },
    { i: "c", n: "Bayo", tm: 0, a: 620, k: 4, d: 6, l: 0, p: 30.6 },
    { i: "d", n: "Ngozi", tm: 1, a: 880, k: 5, d: 7, l: 2, p: 0 },
    { i: "e", n: "Kemi", tm: 1, a: 450, k: 2, d: 8, l: 1, p: 0 },
  ];
  return {
    ok: true,
    live: null,
    next: { key: next.key, police: 11, thieves: 10, pool: 214.5, me: { in: true, side: 1, gear: { rifle: 1, grenade: 3, armour: 1 }, spent: 31.33, room: null, prize: 0, reported: false } },
    jackpot: 18,
    last: { starts_at: new Date(next.starts - 8 * 3_600_000).toISOString(), rows, wins: [{ room: 1, w: 0, pool: 140.2 }], me: { side: 0, prize: 48.4, room: 1 } },
  };
}

export function CopsLab({ view, tod, side, secs }: { view: string; tod: string; side: number; secs: number }) {
  const [seed] = useState(() => 4242);
  const [t0] = useState(() => Date.now());
  const [end, setEnd] = useState<EndResult | null>(null);
  const [run, setRun] = useState(0);
  const setup = useMemo<Setup>(
    () => ({ key: null, room: 0, seed: seed + run, fightAt: t0 + 4000, endsAt: t0 + 4000 + secs * 1000, roster: view === "watch" ? [] : [{ i: ME.id, n: ME.name, tm: side, g: PRACTICE_LOADOUT }], tod: (["day", "dusk", "night"].includes(tod) ? tod : "day") as Tod, watch: view === "watch", pool: 0 }),
    [seed, run, t0, secs, view, side, tod],
  );
  if (view === "lobby") return <CopsRobbers me={ME} onClose={() => {}} demo={demo()} />;
  // The countdown button that sits beside Play on the map (the real component, on a plain background).
  if (view === "ring")
    return (
      <div className="grid min-h-dvh place-items-center bg-[#9fb7c9]">
        <CopsCountdown onOpen={() => {}} className="scale-[2.5]" />
      </div>
    );
  if (end) return <Results me={ME} result={end} setup={setup} onBack={() => (setEnd(null), setRun((r) => r + 1))} />;
  return <Match me={ME} setup={setup} net={null} onQuit={() => setRun((r) => r + 1)} onEnd={setEnd} />;
}
