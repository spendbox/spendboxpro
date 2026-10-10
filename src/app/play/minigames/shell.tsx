"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Bot, Check, Coins, LoaderCircle, Medal, Minus, Play, Plus, RotateCcw, Smartphone, Swords, Trophy, UserRound, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { claimMinigameReward } from "../minigame-actions";
import { playSfx } from "../sound";
import { randomId, useActivityRoom, type ActivityMsg, type ActivityPlayer } from "../activities/hub";
import { questEvent } from "../activities/quest-store";
import type { RoomMember } from "../rooms";
import { ActivityStyles, Confetti, Face, Leaderboard, useScoreBoard, type GameProps } from "../activities/ui";
import { ENGINES } from "./engines";
import { GameIcon } from "./icons";
import { gradeOf } from "./registry";
import { newSeed } from "./rng";
import { TurnResult, TurnTable, type Seat } from "./turn-table";
import { CATEGORIES, type MiniGameDef } from "./types";

// Where every minigame is played. Score games: play alone, take turns with friends on this
// phone, or challenge someone in the same place (you both get the same game; the best score
// wins). Board and card games: against bots, pass and play on this phone, or against someone
// here on their own phone (with bots in any empty seats). Good scores earn a little mint.
// `task` runs a game for something else (a heist step, a job shift): just one solo go, then
// the score goes back.

/** Where you're playing: the round and place (for the room's channel), you, and who's here. */
export type PlayCtx = { roundId: number | null; roomId: string | null; me: ActivityPlayer | null; members: RoomMember[] };
/** A challenge someone sent you (accepted). */
export type Invite = { cid: string; game: string; seed: number; from: ActivityPlayer; seats?: number };
/** Playing for something else: pass mark (a grade, 1-3) and what to do with the score. */
export type Task = { label: string; passGrade: number; onDone: (score: number, grade: number) => void };

const GRADE_NAME = ["No medal", "Bronze", "Silver", "Gold"];
const GRADE_COLOUR = ["#adb5bd", "#c0793d", "#8b95a1", "#f2b705"];

// The games that already had screens of their own (they bring their own header and scores).
const Archery = dynamic(() => import("../activities/archery").then((m) => m.Archery));
const Darts = dynamic(() => import("../activities/darts").then((m) => m.Darts));
const Reflex = dynamic(() => import("../activities/reflex").then((m) => m.Reflex));
const Trivia = dynamic(() => import("../activities/trivia").then((m) => m.Trivia));
const Pool = dynamic(() => import("../activities/pool").then((m) => m.Pool));
const Karaoke = dynamic(() => import("../activities/karaoke").then((m) => m.Karaoke));
const DuelLobby = dynamic(() => import("../activities/duels").then((m) => m.DuelLobby));

function LegacyGame({ name, gp }: { name: string; gp: GameProps }) {
  switch (name) {
    case "archery":
      return <Archery {...gp} />;
    case "darts":
      return <Darts {...gp} />;
    case "reflex":
      return <Reflex {...gp} />;
    case "trivia":
      return <Trivia {...gp} />;
    case "pool":
      return <Pool {...gp} />;
    case "karaoke":
      return <Karaoke {...gp} />;
    case "rps":
      return <DuelLobby {...gp} game="rps" />;
    default:
      return null;
  }
}

/** The room channel for a place (or the town arcade when you're out and about). */
const roomOf = (ctx: PlayCtx) => ctx.roomId ?? "arcade";

export function MiniGamePlayer({ def, ctx, onClose, invite, task }: { def: MiniGameDef; ctx: PlayCtx; onClose: () => void; invite?: Invite | null; task?: Task | null }) {
  const gp: GameProps = { roundId: ctx.roundId, roomId: roomOf(ctx), me: ctx.me, members: ctx.members, label: CATEGORIES[def.cat].label, onClose };
  if (def.legacy) {
    return (
      <>
        <ActivityStyles />
        <LegacyGame name={def.engine.replace("legacy:", "")} gp={gp} />
      </>
    );
  }
  return (
    <div className="space-y-3">
      <ActivityStyles />
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: def.colour }}>
          <GameIcon name={def.icon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-bold leading-tight">{def.title}</h2>
          <p className="truncate text-sm text-muted">{task ? task.label : def.blurb}</p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      {def.kind === "score" ? <ScorePlay def={def} ctx={ctx} gp={gp} invite={invite ?? null} task={task ?? null} /> : <TurnPlay def={def} ctx={ctx} invite={invite ?? null} />}
    </div>
  );
}

// ---------------------------------------------------------------- the room channel for challenges

/** Listens on the room for one challenge (by id) and sends messages for it. */
function useChallengeRoom(ctx: PlayCtx, onMsg: (m: ActivityMsg) => void) {
  const cb = useRef(onMsg);
  useEffect(() => {
    cb.current = onMsg;
  });
  return useActivityRoom(ctx.roundId, roomOf(ctx), ctx.me, { onMessage: (m) => cb.current(m) });
}

function ChallengePicker({ ctx, game, onPick, onBack }: { ctx: PlayCtx; game: string; onPick: (p: ActivityPlayer) => void; onBack: () => void }) {
  const room = useActivityRoom(ctx.roundId, roomOf(ctx), ctx.me, { doing: `mg:${game}` });
  const meId = ctx.me?.id;
  // Everyone in the place (or with the arcade open), not you.
  const seen = new Set<string>();
  const people: ActivityPlayer[] = [];
  for (const p of [...room.present, ...ctx.members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }))]) {
    if (p.id === meId || seen.has(p.id)) continue;
    seen.add(p.id);
    people.push({ id: p.id, name: p.name, avatar: p.avatar });
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{ctx.roomId ? "Challenge someone in this place." : "Challenge someone with Games open in town."} They get a pop-up and play on their own phone.</p>
      {people.length ? (
        <ul className="max-h-60 space-y-1.5 overflow-y-auto">
          {people.map((p) => (
            <li key={p.id}>
              <button onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-2xl bg-panel-2 px-3 py-2 text-left hover:bg-gold/20">
                <Face p={p} size={34} />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Challenge</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">Nobody else is here right now. Bring a friend, or play on this phone together.</p>
      )}
      <button onClick={onBack} className="w-full rounded-2xl py-2 text-sm font-semibold text-muted hover:bg-panel-2">
        Back
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- rewards

function useReward(def: MiniGameDef, signedIn: boolean) {
  const [note, setNote] = useState<{ text: string; coins: number } | null>(null);
  async function claim(score: number, grade: number, won?: boolean) {
    questEvent({ type: "play", game: def.id, score, won });
    if (grade < 1) return setNote(null);
    if (!signedIn) return setNote({ text: "Sign in to win mint for scores like that.", coins: 0 });
    setNote({ text: "Collecting your mint…", coins: 0 });
    const res = await claimMinigameReward(def.id, grade).catch(() => ({ ok: false as const, error: "The connection blinked." }));
    if (!res.ok) return setNote({ text: res.error, coins: 0 });
    if (res.coins > 0) return setNote({ text: `+₥${short(res.coins)}!${res.leftToday === 0 ? " That's all the game mint for today." : ""}`, coins: res.coins });
    setNote({ text: res.reason === "daily_limit" ? "You've won all the game mint for today. Playing is still fun!" : "Mint pays once a minute per game, so this one's for glory.", coins: 0 });
  }
  return { note, claim, reset: () => setNote(null) };
}

function RewardLine({ note }: { note: { text: string; coins: number } | null }) {
  if (!note) return null;
  return (
    <p className={cn("act-pop flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold", note.coins > 0 ? "bg-gold/30" : "bg-panel-2 text-muted")}>
      {note.coins > 0 && <Coins className="size-4 text-gold-dark" />}
      {note.text}
    </p>
  );
}

function Grades({ def }: { def: MiniGameDef }) {
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-muted">
      {[1, 2, 3].map((g) => (
        <span key={g} className="flex items-center gap-1">
          <Medal className="size-3.5" style={{ color: GRADE_COLOUR[g] }} />
          {def.lowerWins ? "≤" : ""}
          {short(def.grades[g - 1])} {def.unit}
        </span>
      ))}
    </div>
  );
}

function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    playSfx("tick");
    if (n === 0) {
      const id = window.setTimeout(() => done.current(), 350);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setN((x) => x - 1), 650);
    return () => window.clearTimeout(id);
  }, [n]);
  return (
    <div className="grid aspect-[3/4] max-h-[62dvh] w-full place-items-center rounded-3xl bg-[#10161f]">
      <span key={n} className="act-pop font-display text-7xl font-extrabold text-white">
        {n || "Go!"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- score games

type ScorePhase =
  | { k: "menu" }
  | { k: "pick" }
  | { k: "setup" }
  | { k: "count"; seed: number; who: number }
  | { k: "play"; seed: number; who: number }
  | { k: "pass"; seed: number; who: number }
  | { k: "result"; seed: number }
  | { k: "inviting"; cid: string; them: ActivityPlayer; seed: number }
  | { k: "declined"; them: ActivityPlayer };

function ScorePlay({ def, ctx, gp, invite, task }: { def: MiniGameDef; ctx: PlayCtx; gp: GameProps; invite: Invite | null; task: Task | null }) {
  const Engine = ENGINES[def.engine];
  const [phase, setPhase] = useState<ScorePhase>(() => (invite ? { k: "count", seed: invite.seed, who: 0 } : task ? { k: "count", seed: newSeed(), who: 0 } : { k: "menu" }));
  /** Players taking turns on this phone (one: just you). */
  const [players, setPlayers] = useState<string[]>([ctx.me?.name ?? "You"]);
  const [scores, setScores] = useState<(number | null)[]>([]);
  /** A challenge across phones: who, and both scores. */
  const [duel, setDuel] = useState<{ cid: string; them: ActivityPlayer; mine: number | null; theirs: number | null; left?: boolean } | null>(
    invite ? { cid: invite.cid, them: invite.from, mine: null, theirs: null } : null,
  );
  const board = useScoreBoard(gp, `mg:${def.id}`, !!def.lowerWins);
  const reward = useReward(def, !!ctx.me);
  const better = (a: number, b: number) => (def.lowerWins ? a < b : a > b);

  const room = useChallengeRoom(ctx, (m) => {
    if (!duel && phase.k !== "inviting") return;
    const cid = duel?.cid ?? (phase.k === "inviting" ? phase.cid : "");
    if (!("cid" in m) || m.cid !== cid) return;
    if (m.t === "mg_reply" && phase.k === "inviting" && m.from.id === phase.them.id) {
      if (m.ok) {
        setDuel({ cid, them: phase.them, mine: null, theirs: null });
        setPhase({ k: "count", seed: phase.seed, who: 0 });
      } else setPhase({ k: "declined", them: phase.them });
    }
    if (m.t === "mg_score" && duel && m.from === duel.them.id && typeof m.score === "number") setDuel((d) => (d ? { ...d, theirs: m.score } : d));
    if (m.t === "mg_quit" && duel && m.from === duel.them.id) setDuel((d) => (d ? { ...d, left: true } : d));
  });

  // Accepting a challenge: say yes.
  const said = useRef(false);
  useEffect(() => {
    if (!invite || said.current || !ctx.me) return;
    said.current = true;
    room.send({ t: "mg_reply", cid: invite.cid, from: ctx.me, ok: true });
  });
  // No answer to a challenge in 40 seconds.
  useEffect(() => {
    if (phase.k !== "inviting") return;
    const id = window.setTimeout(() => setPhase({ k: "declined", them: phase.them }), 40_000);
    return () => window.clearTimeout(id);
  }, [phase]);

  function start(n: number) {
    const seed = newSeed();
    setScores(Array(n).fill(null));
    setDuel(null);
    reward.reset();
    setPhase({ k: "count", seed, who: 0 });
  }

  function ended(score: number) {
    if (phase.k !== "play") return;
    const { seed, who } = phase;
    const next = [...scores];
    next[who] = score;
    setScores(next);
    if (duel) {
      setDuel((d) => (d ? { ...d, mine: score } : d));
      room.send({ t: "mg_score", cid: duel.cid, from: ctx.me?.id ?? "", score });
    }
    if (!duel && who + 1 < players.length) return setPhase({ k: "pass", seed, who: who + 1 });
    setPhase({ k: "result", seed });
    if (players.length === 1 || duel) {
      board.post(score);
      const grade = gradeOf(def, score);
      if (task) return;
      void reward.claim(score, grade, duel ? undefined : grade > 0);
    }
  }

  if (phase.k === "count") return <Countdown onDone={() => setPhase({ k: "play", seed: phase.seed, who: phase.who })} />;
  if (phase.k === "play") return Engine ? <Engine key={`${phase.seed}:${phase.who}`} def={def} cfg={def.cfg ?? {}} seed={phase.seed} onEnd={ended} /> : <p>Missing game.</p>;

  if (phase.k === "pass") {
    return (
      <div className="space-y-3 rounded-3xl bg-panel-2 p-5 text-center">
        <Smartphone className="mx-auto size-8 text-muted" />
        <p className="font-display text-2xl font-bold">{players[phase.who]}&apos;s turn</p>
        <p className="text-sm text-muted">
          {players[phase.who - 1]} scored {short(scores[phase.who - 1] ?? 0)} {def.unit}. Pass the phone to {players[phase.who]}: same game, same {def.cat === "cards" ? "cards" : "targets"}.
        </p>
        <button onClick={() => setPhase({ k: "count", seed: phase.seed, who: phase.who })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 font-semibold text-white">
          <Play className="size-4" /> Go
        </button>
      </div>
    );
  }

  if (phase.k === "pick") {
    return (
      <ChallengePicker
        ctx={ctx}
        game={def.id}
        onBack={() => setPhase({ k: "menu" })}
        onPick={(p) => {
          if (!ctx.me) return;
          const cid = randomId();
          const seed = newSeed();
          room.send({ t: "mg_invite", cid, game: def.id, seed, from: ctx.me, to: p.id });
          setScores([null]);
          setPlayers([ctx.me.name]);
          setPhase({ k: "inviting", cid, them: p, seed });
        }}
      />
    );
  }

  if (phase.k === "inviting" || phase.k === "declined") {
    return (
      <div className="space-y-3 rounded-3xl bg-panel-2 p-5 text-center">
        <Face p={phase.them} size={56} className="mx-auto" />
        {phase.k === "inviting" ? (
          <p className="flex items-center justify-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" /> Waiting for {phase.them.name} to say yes…
          </p>
        ) : (
          <p className="text-sm">{phase.them.name} can&apos;t play right now.</p>
        )}
        <button onClick={() => setPhase({ k: "menu" })} className="w-full rounded-2xl bg-panel py-2.5 text-sm font-semibold">
          Back
        </button>
      </div>
    );
  }

  if (phase.k === "setup") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Everyone plays the same game, one after another. Best score wins.</p>
        <ul className="space-y-1.5">
          {players.map((name, i) => (
            <li key={i} className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted" />
              <input
                value={name}
                maxLength={20}
                onChange={(e) => setPlayers((ps) => ps.map((p, j) => (j === i ? e.target.value : p)))}
                className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 py-2 text-sm"
                aria-label={`Player ${i + 1}'s name`}
              />
              {i > 0 && (
                <button onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-full hover:bg-panel-2" aria-label="Remove player">
                  <Minus className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {players.length < 6 && (
          <button onClick={() => setPlayers((ps) => [...ps, `Player ${ps.length + 1}`])} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-panel-2 py-2 text-sm font-semibold">
            <Plus className="size-4" /> Add a player
          </button>
        )}
        <button disabled={players.length < 2} onClick={() => start(players.length)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 font-semibold text-white disabled:opacity-40">
          <Play className="size-4" /> Start ({players.length} players)
        </button>
        <button onClick={() => setPhase({ k: "menu" })} className="w-full rounded-2xl py-2 text-sm font-semibold text-muted hover:bg-panel-2">
          Back
        </button>
      </div>
    );
  }

  if (phase.k === "result") {
    const mine = scores[0] ?? 0;
    const grade = gradeOf(def, mine);
    if (task) {
      const passed = grade >= task.passGrade;
      return (
        <div className="space-y-3 text-center">
          <p className="font-display text-4xl font-extrabold">
            {short(mine)} <span className="text-lg text-muted">{def.unit}</span>
          </p>
          <p className={cn("act-pop rounded-2xl px-3 py-2 font-bold", passed ? "bg-[#d3f9d8] text-[#2b8a3e]" : "bg-[#ffe3e3] text-[#c92a2a]")}>
            {passed ? "Passed!" : `Not good enough: you needed ${GRADE_NAME[task.passGrade].toLowerCase()} (${short(def.grades[task.passGrade - 1])} ${def.unit}).`}
          </p>
          {passed && <Confetti />}
          <button onClick={() => task.onDone(mine, grade)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 font-semibold text-white">
            Continue
          </button>
        </div>
      );
    }
    const ranking = players.map((name, i) => ({ name, score: scores[i] ?? 0 })).sort((a, b) => (def.lowerWins ? a.score - b.score : b.score - a.score));
    const duelDone = duel && duel.mine !== null && (duel.theirs !== null || duel.left);
    const wonDuel = duel && duel.mine !== null && duel.theirs !== null && (better(duel.mine, duel.theirs) || duel.mine === duel.theirs);
    return (
      <div className="relative space-y-3 text-center">
        {(players.length === 1 || duel) && (
          <>
            <p className="font-display text-4xl font-extrabold">
              {short(mine)} <span className="text-lg text-muted">{def.unit}</span>
            </p>
            <p className="flex items-center justify-center gap-1.5 font-semibold" style={{ color: GRADE_COLOUR[grade] }}>
              <Medal className="size-5" /> {GRADE_NAME[grade]}
            </p>
            {grade === 3 && <Confetti />}
          </>
        )}
        {duel && (
          <div className="rounded-2xl bg-panel-2 p-3 text-sm">
            {!duelDone ? (
              <p className="flex items-center justify-center gap-2">
                <LoaderCircle className="size-4 animate-spin" /> Waiting for {duel.them.name}&apos;s score…
              </p>
            ) : duel.left && duel.theirs === null ? (
              <p>{duel.them.name} left the game. You win!</p>
            ) : (
              <p className="font-semibold">
                {duel.them.name}: {short(duel.theirs ?? 0)} {def.unit}. {duel.mine === duel.theirs ? "A tie!" : wonDuel ? "You win!" : `${duel.them.name} wins!`}
              </p>
            )}
          </div>
        )}
        {players.length > 1 && !duel && (
          <ol className="space-y-1.5 rounded-2xl bg-panel-2 p-3 text-left text-sm">
            {ranking.map((r, i) => (
              <li key={i} className={cn("flex items-center gap-2 rounded-xl px-2 py-1", i === 0 && "bg-gold/30")}>
                <span className="w-5 text-center font-bold">{i === 0 ? <Trophy className="mx-auto size-4 text-gold-dark" /> : i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                <b className="tabular-nums">
                  {short(r.score)} <span className="text-xs font-normal text-muted">{def.unit}</span>
                </b>
              </li>
            ))}
          </ol>
        )}
        <RewardLine note={reward.note} />
        <div className="flex gap-2">
          <button onClick={() => (duel ? setPhase({ k: "menu" }) : start(players.length))} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-ink py-3 font-semibold text-white">
            <RotateCcw className="size-4" /> {duel ? "Done" : "Play again"}
          </button>
          {!duel && (
            <button onClick={() => setPhase({ k: "menu" })} className="flex-1 rounded-2xl bg-panel-2 py-3 font-semibold">
              Menu
            </button>
          )}
        </div>
        <Leaderboard entries={board.entries} meId={ctx.me?.id} unit={def.unit} />
      </div>
    );
  }

  // The menu.
  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-panel-2 p-3 text-sm">{def.how}</p>
      <Grades def={def} />
      <button onClick={() => { setPlayers([ctx.me?.name ?? "You"]); start(1); }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-me py-3 font-semibold text-white">
        <Play className="size-4" /> Play
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setPlayers((ps) => (ps.length > 1 ? ps : [ctx.me?.name ?? "Player 1", "Player 2"])); setPhase({ k: "setup" }); }} className="flex items-center justify-center gap-1.5 rounded-2xl bg-panel-2 py-2.5 text-sm font-semibold">
          <Users className="size-4" /> On this phone
        </button>
        <button disabled={!ctx.me} onClick={() => setPhase({ k: "pick" })} className="flex items-center justify-center gap-1.5 rounded-2xl bg-panel-2 py-2.5 text-sm font-semibold disabled:opacity-50" title={ctx.me ? undefined : "Sign in to challenge people"}>
          <Swords className="size-4" /> Challenge
        </button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Coins className="size-3.5 text-gold-dark" /> Medal scores win ₥2 / ₥4 / ₥6 (10 rewarded games a day).
      </p>
      <Leaderboard entries={board.entries} meId={ctx.me?.id} unit={def.unit} />
    </div>
  );
}

// ---------------------------------------------------------------- turn games

type TurnPhase =
  | { k: "menu" }
  | { k: "pick" }
  | { k: "inviting"; cid: string; them: ActivityPlayer; seed: number; seats: number }
  | { k: "declined"; them: ActivityPlayer }
  | { k: "play"; seed: number; seats: Seat[]; cid: string | null }
  | { k: "over"; won: boolean; draw: boolean; winners: string[]; again: () => void };

function TurnPlay({ def, ctx, invite }: { def: MiniGameDef; ctx: PlayCtx; invite: Invite | null }) {
  const [min, max] = def.seats ?? [2, 2];
  const [count, setCount] = useState(min);
  const me = ctx.me?.name ?? "You";
  const bots = (from: number, n: number) => Array.from({ length: n }, (_, i): Seat => ({ kind: "bot", name: `Bot ${from + i}` }));
  const [phase, setPhase] = useState<TurnPhase>(() =>
    invite
      ? { k: "play", seed: invite.seed, cid: invite.cid, seats: [{ kind: "remote", name: invite.from.name }, { kind: "me", name: me }, ...bots(1, Math.max(0, (invite.seats ?? 2) - 2))] }
      : { k: "menu" },
  );
  const [opponent, setOpponent] = useState<ActivityPlayer | null>(invite?.from ?? null);
  const [left, setLeft] = useState(false);
  const reward = useReward(def, !!ctx.me);
  const inbox = useRef<((m: ActivityMsg) => void) | null>(null);
  const cid = phase.k === "play" ? phase.cid : phase.k === "inviting" ? phase.cid : null;

  const room = useChallengeRoom(ctx, (m) => {
    if (!cid || !("cid" in m) || m.cid !== cid) return;
    if (m.t === "mg_reply" && phase.k === "inviting" && m.from.id === phase.them.id) {
      if (!m.ok) return setPhase({ k: "declined", them: phase.them });
      setOpponent(phase.them);
      setPhase({ k: "play", seed: phase.seed, cid, seats: [{ kind: "me", name: me }, { kind: "remote", name: phase.them.name }, ...bots(1, phase.seats - 2)] });
    }
    if (m.t === "mg_move" && opponent && m.from === opponent.id) inbox.current?.(m);
    if (m.t === "mg_quit" && opponent && m.from === opponent.id) setLeft(true);
  });
  const said = useRef(false);
  useEffect(() => {
    if (!invite || said.current || !ctx.me) return;
    said.current = true;
    room.send({ t: "mg_reply", cid: invite.cid, from: ctx.me, ok: true });
  });
  useEffect(() => {
    if (phase.k !== "inviting") return;
    const id = window.setTimeout(() => setPhase({ k: "declined", them: phase.them }), 40_000);
    return () => window.clearTimeout(id);
  }, [phase]);
  // Walking away from a game across phones tells the other side.
  const sendRef = useRef(room.send);
  useEffect(() => {
    sendRef.current = room.send;
  });
  useEffect(() => {
    if (!cid || !ctx.me) return;
    const from = ctx.me.id;
    return () => sendRef.current({ t: "mg_quit", cid, from });
  }, [cid, ctx.me]);

  const vsBots = () => {
    reward.reset();
    setLeft(false);
    setPhase({ k: "play", seed: newSeed(), cid: null, seats: [{ kind: "me", name: me }, ...bots(1, count - 1)] });
  };
  const passAndPlay = () => {
    reward.reset();
    setLeft(false);
    setPhase({ k: "play", seed: newSeed(), cid: null, seats: Array.from({ length: count }, (_, i): Seat => ({ kind: i === 0 ? "me" : "local", name: i === 0 ? me : `Player ${i + 1}` })) });
  };

  if (phase.k === "play") {
    const online = phase.cid
      ? {
          send: (x: { k: number; m: unknown }) => room.send({ t: "mg_move", cid: phase.cid!, from: ctx.me?.id ?? "", k: x.k, m: x.m }),
          listen: (fn: (m: ActivityMsg) => void) => {
            inbox.current = fn;
            return () => {
              inbox.current = null;
            };
          },
        }
      : null;
    const again = phase.cid ? () => setPhase({ k: "menu" }) : phase.seats.some((s) => s.kind === "local") ? passAndPlay : vsBots;
    return (
      <div className="space-y-2">
        {left && <p className="rounded-2xl bg-[#fff3bf] p-2 text-center text-sm font-semibold">{opponent?.name ?? "They"} left the game.</p>}
        <TurnTable
          def={def}
          seats={phase.seats}
          seed={phase.seed}
          online={online}
          onEnd={(r) => {
            const vsPeople = phase.seats.some((s) => s.kind === "remote");
            if (phase.seats.some((s) => s.kind === "bot" || s.kind === "remote") && !phase.seats.some((s) => s.kind === "local")) void reward.claim(r.won ? 1 : 0, r.won ? (vsPeople ? 3 : 2) : 0, r.won);
            window.setTimeout(() => setPhase({ k: "over", ...r, again }), 900);
          }}
        />
      </div>
    );
  }
  if (phase.k === "over") {
    return (
      <div className="relative space-y-3 text-center">
        <TurnResult won={phase.won} draw={phase.draw} winners={phase.winners} />
        {phase.won && <Confetti />}
        <RewardLine note={reward.note} />
        <div className="flex gap-2">
          <button onClick={phase.again} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-ink py-3 font-semibold text-white">
            <RotateCcw className="size-4" /> Play again
          </button>
          <button onClick={() => setPhase({ k: "menu" })} className="flex-1 rounded-2xl bg-panel-2 py-3 font-semibold">
            Menu
          </button>
        </div>
      </div>
    );
  }
  if (phase.k === "pick") {
    return (
      <ChallengePicker
        ctx={ctx}
        game={def.id}
        onBack={() => setPhase({ k: "menu" })}
        onPick={(p) => {
          if (!ctx.me) return;
          const c = randomId();
          const seed = newSeed();
          const seats = Math.max(2, count);
          room.send({ t: "mg_invite", cid: c, game: def.id, seed, from: ctx.me, to: p.id, seats });
          setPhase({ k: "inviting", cid: c, them: p, seed, seats });
        }}
      />
    );
  }
  if (phase.k === "inviting" || phase.k === "declined") {
    return (
      <div className="space-y-3 rounded-3xl bg-panel-2 p-5 text-center">
        <Face p={phase.them} size={56} className="mx-auto" />
        {phase.k === "inviting" ? (
          <p className="flex items-center justify-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" /> Waiting for {phase.them.name} to say yes…
          </p>
        ) : (
          <p className="text-sm">{phase.them.name} can&apos;t play right now.</p>
        )}
        <button onClick={() => setPhase({ k: "menu" })} className="w-full rounded-2xl bg-panel py-2.5 text-sm font-semibold">
          Back
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-panel-2 p-3 text-sm">{def.how}</p>
      {max > min && (
        <div className="flex items-center justify-between rounded-2xl border border-line p-2 text-sm">
          <span className="pl-1 font-semibold">Players</span>
          <span className="flex gap-1">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <button key={n} onClick={() => setCount(n)} className={cn("size-9 rounded-xl font-bold", count === n ? "bg-ink text-white" : "bg-panel-2")} aria-pressed={count === n}>
                {n}
              </button>
            ))}
          </span>
        </div>
      )}
      <button onClick={vsBots} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-me py-3 font-semibold text-white">
        <Bot className="size-4" /> Play the computer
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={passAndPlay} className="flex items-center justify-center gap-1.5 rounded-2xl bg-panel-2 py-2.5 text-sm font-semibold">
          <Users className="size-4" /> Pass and play
        </button>
        <button disabled={!ctx.me} onClick={() => setPhase({ k: "pick" })} className="flex items-center justify-center gap-1.5 rounded-2xl bg-panel-2 py-2.5 text-sm font-semibold disabled:opacity-50">
          <Swords className="size-4" /> Challenge
        </button>
      </div>
      {count > 2 && <p className="text-xs text-muted">Challenging someone: you, them and {count - 2} bot{count > 3 ? "s" : ""}.</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Check className="size-3.5 text-me" /> Beat the computer for ₥4, a person for ₥6.
      </p>
    </div>
  );
}
