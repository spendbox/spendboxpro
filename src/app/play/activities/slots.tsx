"use client";

import { useEffect, useRef, useState } from "react";
import { Cherry, Coins, Crown, Gem, Ghost, Star, Zap } from "lucide-react";
import { playSfx } from "../sound";
import { useActivityRoom } from "./hub";
import { questEvent } from "./quest-store";
import { BigButton, Confetti, GameHeader, type GameProps, rand } from "./ui";

// Free slots: pull the lever and watch the reels spin. Just for fun: it never costs or pays
// coins. Three in a row and the whole room hears about it.

const SYMBOLS = [
  { icon: Ghost, color: "#7048e8", name: "ghosts" },
  { icon: Coins, color: "#f5a524", name: "coins" },
  { icon: Crown, color: "#e8590c", name: "crowns" },
  { icon: Gem, color: "#0c8599", name: "gems" },
  { icon: Star, color: "#fab005", name: "stars" },
  { icon: Zap, color: "#e64980", name: "bolts" },
  { icon: Cherry, color: "#e03131", name: "cherries" },
];
const ROW = 64;

export function Slots(props: GameProps) {
  const [reels, setReels] = useState([0, 1, 2]);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const [result, setResult] = useState<string | null>(null);
  const [spins, setSpins] = useState(0);
  const timers = useRef<number[]>([]);
  const room = useActivityRoom(props.roundId, props.roomId, props.me);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function spin() {
    if (spinning.some(Boolean)) return;
    setResult(null);
    setSpinning([true, true, true]);
    playSfx("rustle");
    const final = [0, 1, 2].map(() => Math.floor(rand() * SYMBOLS.length));
    // A little luck: now and then the last reel lines up.
    if (final[0] === final[1] && rand() < 0.35) final[2] = final[0];
    final.forEach((f, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setReels((r) => r.map((x, j) => (j === i ? f : x)));
          setSpinning((s) => s.map((x, j) => (j === i ? false : x)));
          playSfx("tick");
          if (i === 2) {
            const n = spins + 1;
            setSpins(n);
            if (n === 3) questEvent({ type: "play", game: "slots" });
            if (final[0] === final[1] && final[1] === final[2]) {
              setResult(`Jackpot! Three ${SYMBOLS[f].name}!`);
              playSfx("levelup");
              if (props.me) room.send({ t: "toast", icon: "star", from: props.me.id, text: `${props.me.name} hit a jackpot on the free slots!` });
            } else if (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]) {
              setResult("Two of a kind. So close!");
            } else {
              setResult("No luck this time. Spin again!");
            }
          }
        }, 700 + i * 450),
      );
    });
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={Coins} title="Free slots" sub="Just for fun: no coins in, no coins out" onClose={props.onClose} color="#f5a524" />
      <div className="relative rounded-3xl bg-gradient-to-b from-[#e8590c] to-[#c92a2a] p-4 shadow-inner">
        {result?.startsWith("Jackpot") && <Confetti />}
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2">
          {reels.map((r, i) => (
            <div key={i} className="relative overflow-hidden rounded-xl bg-panel-2" style={{ height: ROW }}>
              {spinning[i] ? (
                <div className="flex flex-col items-center" style={{ animation: `act-reel ${0.35 + i * 0.05}s linear infinite` }}>
                  {[...SYMBOLS, ...SYMBOLS].map((s, k) => (
                    <s.icon key={k} className="my-3 size-9 shrink-0" style={{ color: s.color }} />
                  ))}
                </div>
              ) : (
                <div className="act-pop grid h-full place-items-center">
                  {(() => {
                    const S = SYMBOLS[r];
                    return <S.icon className="size-10" style={{ color: S.color }} />;
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 min-h-6 text-center font-semibold text-white">{result ?? " "}</p>
      </div>
      <BigButton tone="gold" onClick={spin} disabled={spinning.some(Boolean)}>
        <Zap className="size-5" /> {spinning.some(Boolean) ? "Spinning…" : "Pull the lever"}
      </BigButton>
    </div>
  );
}
