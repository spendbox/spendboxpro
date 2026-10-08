"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, Heart, Mic, MicVocal, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import { randomId, useActivityRoom, type ActivityMsg, type ActivityPlayer } from "./hub";
import { playLoop, stopLoop, type Vibe } from "./synth";
import { BigButton, Confetti, Face, GameHeader, Leaderboard, RewardHint, RewardNote, useGameReward, useScoreBoard, type GameProps, nowMs } from "./ui";

// Karaoke "hype meter": grab the mic and sing along (out loud or in your head, nobody hears
// it). Tap "Belt it!" on the beat to fill the meter, and everyone else in the place can hype
// you up from their phones. 30 seconds, scored out of 100.

const SECONDS = 30;
const BEAT_MS = 750;
const HYPE_PER_PERSON = 15;

const SONGS: { title: string; vibe: Vibe; lines: string[] }[] = [
  { title: "Lagos Nights", vibe: "afrobeats", lines: ["Third Mainland lights are glowing", "Danfo horns and the breeze is blowing", "We dey here till the morning", "Lagos nights, never boring!"] },
  { title: "Jollof Anthem", vibe: "highlife", lines: ["Smoky pot on a Sunday", "Party rice, make it go one way", "Who get the best? We go see", "Pass the plate, one more for me!"] },
  { title: "Big Fish Boogie", vibe: "disco", lines: ["Ten thousand coins in my pocket", "Shining bright like a rocket", "Hunters looking, I dey dance", "Big fish moving, no second chance!"] },
  { title: "Rooftop Lullaby", vibe: "lofi", lines: ["Up on the roof where the pigeons sleep", "City lights in a quiet heap", "Count the drones like shooting stars", "Hide-and-seek between the cars"] },
  { title: "Owambe Queen", vibe: "amapiano", lines: ["Gele high and the music loud", "Spraying money on the crowd", "Aso-ebi, we match today", "Owambe queen, come dance my way!"] },
  { title: "One Drop Ghost", vibe: "reggae", lines: ["Easy now, the ghost is calm", "Hiding out in the city palm", "One drop beat and a gentle sway", "Hunters searching the other way"] },
];

type Session = { sid: string; p: ActivityPlayer; song: string; endsAt: number; hype: number; crowd: Record<string, number> };

export function Karaoke(props: GameProps) {
  const [stage, setStage] = useState<Session | null>(null);
  const [now, setNow] = useState(() => nowMs());
  const [pulse, setPulse] = useState<{ text: string; id: number } | null>(null);
  const [final, setFinal] = useState<{ p: ActivityPlayer; score: number; song: string } | null>(null);
  const stageRef = useRef<Session | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [selfHype, setSelfHype] = useState(0);
  const lastHype = useRef(0);
  const board = useScoreBoard(props, "karaoke");
  const reward = useGameReward("karaoke", !!props.me);
  useEffect(() => {
    stageRef.current = stage;
  });

  const room = useActivityRoom(props.roundId, props.roomId, props.me, { onMessage, doing: "karaoke" });
  const sendRef = useRef(room.send);
  useEffect(() => {
    sendRef.current = room.send;
  });

  function onMessage(m: ActivityMsg) {
    if (m.t === "mic" && m.p?.id && typeof m.sid === "string") {
      const cur = stageRef.current;
      if (cur && cur.endsAt > nowMs() && cur.p.id === props.me?.id) return; // I'm singing
      const secs = Math.max(10, Math.min(45, Number(m.secs) || SECONDS));
      const next = { sid: m.sid, p: m.p, song: String(m.song).slice(0, 40), endsAt: nowMs() + secs * 1000, hype: 0, crowd: {} };
      stageRef.current = next;
      setStage(next);
      setFinal(null);
    } else if (m.t === "hype" && stageRef.current && m.sid === stageRef.current.sid && typeof m.from === "string") {
      const cur = stageRef.current;
      const given = cur.crowd[m.from] ?? 0;
      if (given >= HYPE_PER_PERSON || m.from === cur.p.id) return;
      const next = { ...cur, crowd: { ...cur.crowd, [m.from]: given + 1 }, hype: cur.hype + 2 };
      stageRef.current = next;
      setStage(next);
    } else if (m.t === "mic_end" && stageRef.current && m.sid === stageRef.current.sid) {
      setFinal({ p: m.p, score: Number(m.score) || 0, song: stageRef.current.song });
      stageRef.current = null;
      setStage(null);
    }
  }

  // Tick while someone's on stage.
  useEffect(() => {
    if (!stage) return;
    const id = window.setInterval(() => setNow(nowMs()), 100);
    return () => window.clearInterval(id);
  }, [stage]);

  const singing = !!stage && stage.p.id === props.me?.id;
  const left = stage ? Math.max(0, stage.endsAt - now) : 0;
  const meter = stage ? Math.min(100, Math.round(selfHype + stage.hype)) : 0;

  // My song ends: share the score.
  const ending = useRef<string | null>(null);
  useEffect(() => {
    if (!stage || !singing || left > 0 || ending.current === stage.sid) return;
    ending.current = stage.sid;
    const score = Math.min(100, Math.round(selfHype + stage.hype));
    stopLoop();
    sendRef.current({ t: "mic_end", sid: stage.sid, p: stage.p, score });
    sendRef.current({ t: "toast", icon: "mic", from: stage.p.id, text: `${stage.p.name} sang "${stage.song}" and got the hype meter to ${score}!` });
    board.post(score);
    void reward.finish(score);
    if (score >= 80) playSfx("levelup");
  }, [stage, singing, left, selfHype, board, reward]);

  // Someone else's song timed out without an ending (they left).
  useEffect(() => {
    if (stage && !singing && left === 0) {
      const id = window.setTimeout(() => {
        stageRef.current = null;
        setStage(null);
      }, 4000);
      return () => window.clearTimeout(id);
    }
  }, [stage, singing, left]);

  useEffect(() => () => stopLoop(), []);

  function takeMic(song: (typeof SONGS)[number]) {
    if (!props.me) return;
    const sid = randomId(8);
    setSelfHype(0);
    setStartedAt(nowMs());
    reward.reset();
    setFinal(null);
    playLoop(song.vibe, { seconds: SECONDS, volume: 0.7 });
    sendRef.current({ t: "mic", sid, p: props.me, song: song.title, secs: SECONDS });
  }

  function belt() {
    if (!singing) return;
    // On the beat = more hype.
    const phase = ((nowMs() - startedAt) % BEAT_MS) / BEAT_MS;
    const off = Math.min(phase, 1 - phase);
    const add = off < 0.12 ? 1.6 : off < 0.25 ? 0.8 : 0.2;
    setSelfHype((h) => Math.min(70, h + add));
    setPulse({ text: add > 1 ? "On beat!" : add > 0.5 ? "Nice" : "Off beat", id: nowMs() });
  }

  function hype(kind: number) {
    if (!stage || singing || !props.me) return;
    if (nowMs() - lastHype.current < 300) return;
    lastHype.current = nowMs();
    sendRef.current({ t: "hype", sid: stage.sid, from: props.me.id, kind });
    playSfx("pop");
  }

  const song = stage ? SONGS.find((s) => s.title === stage.song) : null;
  const elapsed = stage ? SECONDS * 1000 - left : 0;
  const line = song ? Math.min(song.lines.length - 1, Math.floor((elapsed / (SECONDS * 1000)) * song.lines.length)) : 0;
  const beatScale = 1 + 0.25 * Math.max(0, 1 - (((now - startedAt) % BEAT_MS) / BEAT_MS) * 3);

  return (
    <div className="space-y-3">
      <GameHeader icon={MicVocal} title="Karaoke" sub={props.label} onClose={props.onClose} color="#7048e8" />
      {stage ? (
        <div className="space-y-3 rounded-3xl bg-gradient-to-b from-[#3b1d6e] to-[#1a0f33] p-4 text-white">
          <div className="flex items-center gap-3">
            <Face p={stage.p} size={44} className="ring-2 ring-gold" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{singing ? "You're on the mic!" : `${stage.p.name} is singing`}</p>
              <p className="truncate text-sm text-white/70">&ldquo;{stage.song}&rdquo; · {Math.ceil(left / 1000)}s</p>
            </div>
          </div>
          {song && (
            <div className="space-y-1 text-center">
              {song.lines.map((l, i) => (
                <p key={i} className={cn("transition-all", i === line ? "text-lg font-bold text-gold" : "text-sm text-white/40")}>
                  {l}
                </p>
              ))}
            </div>
          )}
          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold">
              <span>Hype meter</span>
              <span>{meter}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-[#e64980] via-[#f5a524] to-[#ffc53d] transition-all" style={{ width: `${meter}%` }} />
            </div>
          </div>
          {singing ? (
            <div className="relative">
              <button
                onPointerDown={belt}
                className="mx-auto grid size-28 touch-none place-items-center rounded-full bg-gold text-ink shadow-lg"
                style={{ transform: `scale(${beatScale})` }}
                aria-label="Belt it on the beat"
              >
                <span className="flex flex-col items-center font-bold">
                  <Mic className="size-8" /> Belt it!
                </span>
              </button>
              {pulse && (
                <span key={pulse.id} className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-sm font-bold" style={{ animation: "act-float-up .8s ease-out both" }}>
                  {pulse.text}
                </span>
              )}
              <p className="mt-2 text-center text-xs text-white/60">Tap when the button pops, on the beat.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Flame, label: "Fire" },
                { icon: Heart, label: "Love it" },
                { icon: Sparkles, label: "Encore" },
              ].map((h, i) => (
                <button key={i} onClick={() => hype(i)} className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-3 text-sm font-semibold active:scale-95">
                  <h.icon className="size-6 text-gold" /> {h.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {final && (
            <div className="act-pop relative rounded-2xl bg-panel-2 p-3 text-center">
              {final.score >= 80 && <Confetti />}
              <p className="font-semibold">
                {final.p.id === props.me?.id ? "You" : final.p.name} sang &ldquo;{final.song}&rdquo;
              </p>
              <p className="font-display text-3xl font-bold">{final.score}</p>
              {final.p.id === props.me?.id && <RewardNote claim={reward.claim} />}
            </div>
          )}
          <p className="text-sm font-semibold">Pick a song and take the mic</p>
          <div className="grid grid-cols-2 gap-2">
            {SONGS.map((s) => (
              <button
                key={s.title}
                onClick={() => takeMic(s)}
                disabled={!props.me}
                className="flex items-center gap-2 rounded-2xl bg-panel-2 px-3 py-3 text-left text-sm font-semibold hover:bg-[#7048e8]/15 disabled:opacity-50"
              >
                <Mic className="size-4 shrink-0 text-[#7048e8]" />
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </div>
          {!props.me && <BigButton tone="soft" disabled>Sign in to sing</BigButton>}
        </div>
      )}
      <RewardHint game="karaoke" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="hype" />
    </div>
  );
}
