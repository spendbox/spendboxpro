"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowBigDown, ArrowBigLeft, ArrowBigRight, ArrowBigUp, Banknote, Coins, Music, PartyPopper, Play, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { sprayCoins } from "../gift-actions";
import { playSfx } from "../sound";
import { useActivityRoom, type ActivityPlayer } from "./hub";
import { questEvent } from "./quest-store";
import { playLoop, stopLoop, VIBE_BY_ID, type Vibe } from "./synth";
import { BigButton, Confetti, Face, GameHeader, Leaderboard, RewardHint, RewardNote, useGameReward, useScoreBoard, type GameProps, nowMs, rand, perfNow } from "./ui";

// The club dance floor. Two things to do:
//  - Dance-off: arrows fall in time with the beat; tap the matching pad as each one reaches
//    the line. 40 seconds, scored out of 1,000.
//  - Spray: shower coins over the people dancing (a Nigerian party tradition). Pick how much
//    and spray everyone, or tap one dancer. The coins are split between them, and everyone in
//    the club sees the money fly.

const LANES = [
  { icon: ArrowBigLeft, color: "#e64980" },
  { icon: ArrowBigDown, color: "#2f6fd1" },
  { icon: ArrowBigUp, color: "#12a37a" },
  { icon: ArrowBigRight, color: "#f5a524" },
];
const SONG_SECONDS = 40;
const FALL_MS = 1600;
const VIBE: Vibe = "afrobeats";

type Note = { lane: number; at: number; hit?: "perfect" | "great" | "good" | "miss" };

function makeNotes(): Note[] {
  const beat = 60_000 / VIBE_BY_ID[VIBE].bpm;
  const out: Note[] = [];
  let lastLane = -1;
  // Start after two bars; notes on beats and some half-beats, getting busier.
  for (let t = beat * 8; t < SONG_SECONDS * 1000 - beat * 2; t += beat / 2) {
    const progress = t / (SONG_SECONDS * 1000);
    const onBeat = Math.round(t / beat) * beat === Math.round(t);
    if (!onBeat && rand() > 0.15 + progress * 0.35) continue;
    if (onBeat && rand() < 0.18) continue;
    let lane = Math.floor(rand() * 4);
    if (lane === lastLane && rand() < 0.6) lane = (lane + 1 + Math.floor(rand() * 3)) % 4;
    lastLane = lane;
    out.push({ lane, at: t });
  }
  return out;
}

export function DanceFloor(props: GameProps) {
  const [tab, setTab] = useState<"dance" | "spray">("dance");
  const room = useActivityRoom(props.roundId, props.roomId, props.me, { doing: "dance" });
  const dancers = room.present.filter((p) => p.doing.includes("dance") && p.id !== props.me?.id);
  return (
    <div className="space-y-3">
      <GameHeader icon={PartyPopper} title="Dance floor" sub={`${dancers.length + (props.me ? 1 : 0)} dancing now`} onClose={props.onClose} color="#e64980" />
      <div className="flex -space-x-2 overflow-hidden py-1">
        {props.me && <Face p={props.me} size={34} className="act-bounce ring-2 ring-white" />}
        {dancers.slice(0, 12).map((d, i) => (
          <span key={d.id} className="act-bounce inline-block" style={{ animationDelay: `${(i % 4) * 0.15}s` }}>
            <Face p={d} size={34} className="ring-2 ring-white" />
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-panel-2 p-1">
        {(["dance", "spray"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold", tab === t ? "bg-panel shadow-sm" : "text-muted")}
          >
            {t === "dance" ? <Music className="size-4" /> : <Banknote className="size-4" />}
            {t === "dance" ? "Dance-off" : "Spray mint"}
          </button>
        ))}
      </div>
      {tab === "dance" ? <DanceOff {...props} /> : <Spray {...props} dancers={dancers} send={room.send} />}
    </div>
  );
}

function DanceOff(props: GameProps) {
  const [running, setRunning] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [judge, setJudge] = useState<{ text: string; id: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const t0 = useRef(0);
  const notesRef = useRef<Note[]>([]);
  const lanesRef = useRef<HTMLDivElement>(null);
  const points = useRef(0);
  const comboRef = useRef(0);
  const board = useScoreBoard(props, "dance");
  const reward = useGameReward("dance", !!props.me);
  const raf = useRef(0);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    stopLoop();
  }, []);

  function start() {
    const list = makeNotes();
    notesRef.current = list;
    setNotes(list);
    points.current = 0;
    comboRef.current = 0;
    setCombo(0);
    setScore(null);
    reward.reset();
    playLoop(VIBE, { seconds: SONG_SECONDS + 1 });
    t0.current = perfNow() + 80;
    setRunning(true);
    const loop = () => {
      const now = perfNow() - t0.current;
      // Notes that slipped past the line are misses.
      let changed = false;
      for (const n of notesRef.current) {
        if (!n.hit && now - n.at > 180) {
          n.hit = "miss";
          changed = true;
          comboRef.current = 0;
        }
      }
      if (changed) setCombo(0);
      // Move the notes (straight on the page, no re-render).
      const box = lanesRef.current;
      if (box) {
        const h = box.clientHeight;
        box.querySelectorAll<HTMLElement>("[data-note]").forEach((el) => {
          const n = notesRef.current[Number(el.dataset.note)];
          const y = (1 - (n.at - now) / FALL_MS) * (h - 56);
          el.style.transform = `translateY(${y}px)`;
          el.style.opacity = n.hit && n.hit !== "miss" ? "0" : y < -40 || y > h ? "0" : n.hit === "miss" ? "0.3" : "1";
        });
      }
      if (now > SONG_SECONDS * 1000) {
        end();
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  function end() {
    cancelAnimationFrame(raf.current);
    setRunning(false);
    const max = notesRef.current.length * 100 || 1;
    const final = Math.min(1000, Math.round((points.current / max) * 1000));
    setScore(final);
    board.post(final);
    void reward.finish(final);
  }

  function tap(lane: number) {
    if (!running) return;
    setFlash(lane);
    window.setTimeout(() => setFlash((f) => (f === lane ? null : f)), 120);
    const now = perfNow() - t0.current;
    let best: Note | null = null;
    for (const n of notesRef.current) {
      if (n.lane !== lane || n.hit) continue;
      if (Math.abs(n.at - now) <= 180 && (!best || Math.abs(n.at - now) < Math.abs(best.at - now))) best = n;
    }
    if (!best) return;
    const d = Math.abs(best.at - now);
    best.hit = d < 70 ? "perfect" : d < 130 ? "great" : "good";
    points.current += best.hit === "perfect" ? 100 : best.hit === "great" ? 70 : 40;
    comboRef.current += 1;
    setCombo(comboRef.current);
    setJudge({ text: best.hit === "perfect" ? "Perfect!" : best.hit === "great" ? "Great" : "Good", id: nowMs() });
  }

  // Keyboard arrows too, for computers.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const lane = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"].indexOf(e.key);
      if (lane >= 0) {
        e.preventDefault();
        tap(lane);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-3">
      <div className="relative h-72 overflow-hidden rounded-3xl bg-gradient-to-b from-[#2a1340] to-[#120a1f]" ref={lanesRef}>
        <div className="absolute inset-0 grid grid-cols-4">
          {LANES.map((l, i) => (
            <div key={i} className="border-r border-white/5" style={{ background: flash === i ? `${l.color}33` : undefined }} />
          ))}
        </div>
        <div className="absolute inset-x-2 bottom-12 h-1 rounded-full bg-white/40" />
        {running &&
          notes.map((n, i) => {
            const L = LANES[n.lane];
            return (
              <span
                key={i}
                data-note={i}
                className="absolute top-0 grid size-11 place-items-center rounded-xl text-white shadow-lg"
                style={{ left: `calc(${n.lane * 25}% + 12.5% - 22px)`, background: L.color, opacity: 0, willChange: "transform" }}
              >
                <L.icon className="size-6" />
              </span>
            );
          })}
        {judge && running && (
          <span key={judge.id} className="act-pop absolute left-1/2 top-6 -translate-x-1/2 text-lg font-bold text-gold">
            {judge.text} {combo >= 5 ? `x${combo}` : ""}
          </span>
        )}
        {!running && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-white">
            {score !== null ? (
              <div className="act-pop space-y-1">
                {score >= 700 && <Confetti />}
                <Sparkles className="mx-auto size-8 text-gold" />
                <p className="font-display text-3xl font-bold">{score}</p>
                <p className="text-sm text-white/70">{score >= 900 ? "Legendary moves!" : score >= 600 ? "The floor is yours!" : "Keep dancing!"}</p>
              </div>
            ) : (
              <p className="text-sm text-white/80">Tap the pads as the arrows reach the line. Stay on the beat for Perfects!</p>
            )}
          </div>
        )}
      </div>
      {running ? (
        <div className="grid grid-cols-4 gap-2">
          {LANES.map((l, i) => (
            <button
              key={i}
              onPointerDown={(e) => {
                e.preventDefault();
                tap(i);
              }}
              className="grid h-16 touch-none place-items-center rounded-2xl text-white shadow active:scale-95"
              style={{ background: l.color }}
              aria-label={`Lane ${i + 1}`}
            >
              <l.icon className="size-8" />
            </button>
          ))}
        </div>
      ) : (
        <>
          <RewardNote claim={reward.claim} />
          <BigButton tone="gold" onClick={start}>
            {score !== null ? <RotateCcw className="size-4" /> : <Play className="size-4" />} {score !== null ? "Dance again" : "Start the dance-off"}
          </BigButton>
        </>
      )}
      <RewardHint game="dance" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="pts" />
    </div>
  );
}

const AMOUNTS = [10, 50, 100, 200, 500];

function Spray({ dancers, send, ...props }: GameProps & { dancers: ActivityPlayer[]; send: ReturnType<typeof useActivityRoom>["send"] }) {
  const [amount, setAmount] = useState(100);
  const [target, setTarget] = useState<ActivityPlayer | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Nobody else dancing? Anyone in the club can be sprayed.
  const others = props.members.filter((m) => m.id !== props.me?.id).map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
  const pool = dancers.length ? dancers : others;

  async function spray() {
    if (!props.me || busy) return;
    const targets = target ? [target.id] : pool.map((p) => p.id);
    if (!targets.length) return setMsg({ text: "Nobody to spray yet. Wait for some dancers!", ok: false });
    setBusy(true);
    setMsg(null);
    const res = await sprayCoins(targets, amount);
    setBusy(false);
    if (!res.ok) return setMsg({ text: res.error, ok: false });
    send({ t: "spray", from: props.me, amount: res.amount, shares: res.shares });
    questEvent({ type: "spray", amount: res.amount });
    playSfx("found");
    setMsg({ text: `You sprayed ${res.amount} mint on ${res.shares.length === 1 ? res.shares[0].name : `${res.shares.length} dancers`}!`, ok: true });
    setTarget(null);
  }

  if (!props.me) return <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">Sign in to spray mint.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Shower mint on the dancers! It&apos;s split between {target ? "your pick" : `everyone dancing (up to 10)`}. Real mint, from your balance.
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => setAmount(a)}
            className={cn("rounded-xl py-2 text-sm font-bold", amount === a ? "bg-gold text-ink" : "bg-panel-2 text-muted")}
          >
            {a}
          </button>
        ))}
      </div>
      <input
        type="range"
        min={10}
        max={500}
        step={10}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-full accent-[#e64980]"
        aria-label="How much mint to spray"
      />
      <div>
        <p className="mb-1.5 text-sm font-semibold">{dancers.length ? "On the dance floor" : "Nobody else is dancing yet. Spray someone here:"}</p>
        {pool.length === 0 ? (
          <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">It&apos;s just you for now. Invite some friends to the club!</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pool.slice(0, 20).map((p) => (
              <button
                key={p.id}
                onClick={() => setTarget((t) => (t?.id === p.id ? null : p))}
                className={cn("flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-semibold", target?.id === p.id ? "bg-[#e64980] text-white" : "bg-panel-2")}
              >
                <Face p={p} size={26} />
                <span className="max-w-24 truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <BigButton tone="gold" onClick={() => void spray()} disabled={busy || pool.length === 0}>
        <Coins className="size-5" />
        {busy ? "Spraying…" : `Spray ${amount} mint ${target ? `on ${target.name}` : `on ${Math.min(pool.length, 10)} dancer${pool.length === 1 ? "" : "s"}`}`}
      </BigButton>
      {msg && <p className={cn("act-pop rounded-2xl px-3 py-2 text-center text-sm font-semibold", msg.ok ? "bg-me/15 text-me" : "bg-hit/10 text-hit")}>{msg.text}</p>}
    </div>
  );
}

/** Banknotes raining down over the screen (shown to everyone in the club when someone sprays). */
export function SprayRain({ count = 36 }: { count?: number }) {
  const [notes] = useState(() =>
    Array.from({ length: count }, () => ({
      left: rand() * 100,
      dx: `${(rand() - 0.5) * 30}vw`,
      r0: `${Math.floor(rand() * 60 - 30)}deg`,
      r1: `${Math.floor(rand() * 720 - 360)}deg`,
      delay: rand() * 1.2,
      dur: 2.2 + rand() * 1.6,
      hue: rand() < 0.5 ? "#2f9e44" : "#37b24d",
    })),
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden" aria-hidden>
      {notes.map((n, i) => (
        <span
          key={i}
          className="absolute top-0 flex h-7 w-14 items-center justify-center rounded-md border border-white/60 text-white shadow-md"
          style={
            {
              left: `${n.left}%`,
              background: `linear-gradient(135deg, ${n.hue}, #1b7a35)`,
              animation: `act-cash ${n.dur}s cubic-bezier(.3,.1,.6,1) ${n.delay}s both`,
              "--dx": n.dx,
              "--r0": n.r0,
              "--r1": n.r1,
            } as React.CSSProperties
          }
        >
          <Banknote className="size-5" />
        </span>
      ))}
    </div>
  );
}
