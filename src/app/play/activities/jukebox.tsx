"use client";

import { useEffect, useState } from "react";
import { Disc3, Megaphone, Music, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { useActivityRoom } from "./hub";
import { questEvent } from "./quest-store";
import { blip, playLoop, stopLoop, VIBES, type Vibe } from "./synth";
import { GameHeader, type GameProps, nowMs } from "./ui";

// The jukebox (and the club's DJ deck): pick a vibe and a short loop plays, made right here on
// the phone. Everyone in the place sees "Now playing" and can listen in.

const LOOP_SECONDS = 30;

export function Jukebox({ dj, ...props }: GameProps & { dj?: boolean }) {
  const [playing, setPlaying] = useState<Vibe | null>(null);
  const [lastHorn, setLastHorn] = useState(0);
  const room = useActivityRoom(props.roundId, props.roomId, props.me, { doing: dj ? "dj" : null });

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setPlaying(null), LOOP_SECONDS * 1000);
    return () => window.clearTimeout(id);
  }, [playing]);

  function pick(v: Vibe) {
    if (playing === v) {
      stopLoop();
      return setPlaying(null);
    }
    playLoop(v, { seconds: LOOP_SECONDS });
    setPlaying(v);
    questEvent({ type: "play", game: "jukebox" });
    if (props.me) room.send({ t: "jukebox", vibe: v, by: props.me });
  }

  function airHorn() {
    if (nowMs() - lastHorn < 3000) return;
    setLastHorn(nowMs());
    [0, 0.18, 0.36].forEach((d) => window.setTimeout(() => blip(466, 0.16, "sawtooth", 0.25), d * 1000));
    if (props.me) room.send({ t: "toast", icon: "party", from: props.me.id, text: `DJ ${props.me.name} hit the air horn!` });
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={dj ? Disc3 : Music} title={dj ? "DJ deck" : "Jukebox"} sub={props.label} onClose={props.onClose} color="#e5484d" />
      <p className="text-sm text-muted">
        {dj ? "Spin a tune for the club. Everyone here sees what's playing and can listen in." : "Pick a vibe. Everyone here sees what's playing and can listen in."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {VIBES.map((v) => (
          <button
            key={v.id}
            onClick={() => pick(v.id)}
            className={cn("relative overflow-hidden rounded-2xl p-3 text-left text-white shadow-sm transition active:scale-[.98]", playing === v.id && "ring-4 ring-gold")}
            style={{ background: `linear-gradient(135deg, ${v.color}, #18202b)` }}
          >
            <span className="flex items-center gap-2 font-semibold">
              {playing === v.id ? <Square className="size-4" fill="currentColor" /> : <Disc3 className="size-4" style={dj ? { animation: "act-spin 3s linear infinite" } : undefined} />}
              {v.name}
            </span>
            <span className="mt-1 block text-xs text-white/75">{v.blurb}</span>
            <span className="mt-1 block text-[11px] text-white/60">{v.bpm} BPM</span>
          </button>
        ))}
      </div>
      {dj && (
        <button onClick={airHorn} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 font-semibold text-white active:scale-[.98]">
          <Megaphone className="size-5" /> Air horn!
        </button>
      )}
    </div>
  );
}
