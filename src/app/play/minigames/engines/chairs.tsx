"use client";

import { useEffect, useRef, useState } from "react";
import { Armchair, Music, Music2, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { playLoop, stopLoop } from "../../activities/synth";
import { makeRng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Musical Chairs against seven bots: the music plays; when it stops, tap a free chair before
// the bots grab them all. Tap a chair while the music's still playing and you're out. One chair
// fewer every round. Score: rounds survived (7 is a win).

const NAMES = ["Ada", "Kofi", "Zara", "Tunde", "Ama", "Sipho", "Nia"];

export default function Chairs({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const r = useRef(makeRng(seed));
  const [bots, setBots] = useState(NAMES.map((name, i) => ({ name, id: i, out: false })));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"music" | "grab" | "between" | "over">("music");
  const [taken, setTaken] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("Dance round the chairs…");
  const done = useRef(false);
  const alive = bots.filter((b) => !b.out);
  const chairs = alive.length; // one fewer than the people left (you + bots)

  // The music plays for a while, then stops.
  useEffect(() => {
    if (phase !== "music") return;
    playLoop("afrobeats", { seconds: 30, volume: 0.5 });
    const id = window.setTimeout(() => {
      stopLoop();
      setPhase("grab");
      setMsg("GRAB A CHAIR!");
      playSfx("start");
    }, 2500 + r.current() * 5000);
    return () => {
      window.clearTimeout(id);
      stopLoop();
    };
  }, [phase, round]);

  // Bots grab chairs one by one (faster each round).
  useEffect(() => {
    if (phase !== "grab") return;
    const timers: number[] = [];
    const order = alive.map((b) => ({ b, at: 260 + r.current() * (900 - round * 70) })).sort((a, z) => a.at - z.at);
    order.forEach(({ b, at }) => {
      timers.push(
        window.setTimeout(() => {
          setTaken((t) => {
            const free = Array.from({ length: chairs }, (_, i) => i).filter((i) => !(i in t));
            if (!free.length || Object.values(t).includes(b.name)) return t;
            return { ...t, [free[Math.floor(r.current() * free.length)]]: b.name };
          });
        }, at),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per grab
  }, [phase, round]);

  // Everyone's sat down: whoever's standing is out.
  useEffect(() => {
    if (phase !== "grab") return;
    const seated = Object.values(taken);
    if (seated.length < chairs) return;
    if (!seated.includes("You")) {
      lose("All the chairs are taken. You're out!");
      return;
    }
    const outBot = alive.find((b) => !seated.includes(b.name));
    const id = window.setTimeout(() => {
      setPhase("between");
      setMsg(`${outBot?.name ?? "Someone"} is out!`);
      setBots((bs) => bs.map((b) => (b.name === outBot?.name ? { ...b, out: true } : b)));
      const next = round + 1;
      setRound(next);
      if (alive.length - 1 <= 0) {
        done.current = true;
        setPhase("over");
        setMsg("You win musical chairs!");
        playSfx("levelup");
        window.setTimeout(() => finish(next), 1200);
        return;
      }
      window.setTimeout(() => {
        setTaken({});
        setPhase("music");
        setMsg("Dance round the chairs…");
      }, 1400);
    }, 600);
    return () => window.clearTimeout(id);
  });

  function lose(text: string) {
    if (done.current) return;
    done.current = true;
    stopLoop();
    setPhase("over");
    setMsg(text);
    playSfx("caught");
    window.setTimeout(() => finish(round), 1200);
  }

  function sit(i: number) {
    if (phase === "music") return lose("The music was still playing. You're out!");
    if (phase !== "grab" || i in taken || Object.values(taken).includes("You")) return;
    playSfx("pop");
    setTaken((t) => ({ ...t, [i]: "You" }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>Round {round + 1}</span>
        <span>{alive.length + 1} players · {chairs} chairs</span>
      </div>
      <div className={cn("relative grid h-72 place-items-center rounded-3xl", phase === "music" ? "bg-[#5f3dc4]" : "bg-[#343a40]")}>
        <div className="absolute inset-0 grid place-items-center">
          {phase === "music" && <Music className="act-bounce size-14 text-white/30" />}
        </div>
        <div className="relative size-60">
          {Array.from({ length: chairs }, (_, i) => {
            const a = (i / chairs) * Math.PI * 2;
            const who = taken[i];
            return (
              <button
                key={i}
                onPointerDown={() => sit(i)}
                className={cn("absolute grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl transition", who === "You" ? "bg-gold" : who ? "bg-[#868e96]" : "bg-[#e64980]")}
                style={{ left: `${50 + Math.cos(a) * 38}%`, top: `${50 + Math.sin(a) * 38}%` }}
                aria-label={who ? `Chair taken by ${who}` : "Free chair"}
              >
                <Armchair className="size-7 text-white" />
                {who && <span className="absolute -bottom-4 whitespace-nowrap text-[10px] font-bold text-white">{who}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className={cn("text-center font-display text-xl font-bold", phase === "grab" && "text-hit")}>{msg}</p>
      <div className="flex flex-wrap justify-center gap-1.5 text-xs">
        {bots.map((b) => (
          <span key={b.id} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5", b.out ? "bg-panel-2 text-muted line-through" : "bg-[#f3d9fa]")}>
            {b.out ? <User className="size-3" /> : <Music2 className="size-3" />}
            {b.name}
          </span>
        ))}
      </div>
    </div>
  );
}
