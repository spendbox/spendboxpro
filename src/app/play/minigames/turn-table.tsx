"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Crown, Eye, LoaderCircle, RotateCcw, Trophy, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import type { ActivityMsg } from "../activities/hub";
import { Confetti } from "../activities/ui";
import { TURN_GAMES, type TurnModule } from "./turns";
import type { MiniGameDef } from "./types";

// Plays a turn game (a board or card game). Every seat is you, another person on this phone
// (pass and play), someone on another phone (their moves arrive as messages), or a bot. The
// rules run the same on every phone, so only moves travel. Bots move by themselves on every
// phone the same way (their moves come from the game's own state). Across phones (with post),
// each keeps the list of moves so far: a phone that opens late, reloads, watches, or misses a
// move asks the others for it and catches up, so a board never freezes. With moveSecs, a move
// left too long is played for you by the computer.

export type SeatKind = "me" | "local" | "remote" | "bot";
export type Seat = { kind: SeatKind; name: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Waiting this long on another phone's move: ask the others for the moves so far (one may have been lost). */
const STUCK_MS = 10_000;

type Online = {
  send: (m: { k: number; m: unknown }) => void;
  listen: (fn: (msg: ActivityMsg) => void) => () => void;
  /** Catching up (optional): send the others anything else. */
  post?: (m: Record<string, unknown>) => void;
};

export function TurnTable({
  def,
  seats,
  seed,
  online,
  onEnd,
  onQuit,
  bare,
  moveSecs,
}: {
  def: MiniGameDef;
  seats: Seat[];
  seed: number;
  /** Playing across phones: send my moves, and listen for theirs (null: all on this phone). */
  online: Online | null;
  /** The game is over: did "me" (or anyone on this phone) win, and the winners' names (and seats). */
  onEnd: (result: { won: boolean; draw: boolean; winners: string[]; seats?: number[] }) => void;
  /** Full-screen games: leave the table. */
  onQuit?: () => void;
  /** Just the board (at a game table, which shows the players and whose turn it is itself). */
  bare?: boolean;
  /** Seconds for each move across phones; time up on yours, the computer plays it. */
  moveSecs?: number;
}) {
  const [mod, setMod] = useState<TurnModule | null>(null);
  useEffect(() => {
    let live = true;
    void TURN_GAMES[def.engine]?.().then((m) => live && setMod(m));
    return () => {
      live = false;
    };
  }, [def.engine]);
  if (!mod) {
    return (
      <div className="grid place-items-center py-16 text-muted">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }
  return <Table mod={mod} def={def} seats={seats} seed={seed} online={online} onEnd={onEnd} onQuit={onQuit} bare={bare} moveSecs={moveSecs} />;
}

function Table({ mod, def, seats, seed, online, onEnd, onQuit, bare, moveSecs }: { mod: TurnModule } & Parameters<typeof TurnTable>[0]) {
  const { rules, View } = mod;
  const start = useMemo(() => rules.init(seed, seats.length, def.cfg ?? {}), [rules, seed, seats.length, def.cfg]);
  const [state, setState] = useState(start);
  /** Every move so far, for a phone that has to catch up. */
  const hist = useRef<unknown[]>([]);
  const [, setCount] = useState(0);
  // When this turn began (on this phone), and the time now (ticking while a move is timed or
  // awaited), for the timer and for noticing a lost move.
  const [turnAt, setTurnAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  /** Pass and play with secret cards: the screen is covered until the next player taps. */
  const [covered, setCovered] = useState(false);
  const stateRef = useRef(state);
  const countRef = useRef(0);
  const ended = useRef(false);
  const turn = rules.turn(state);
  const over = turn < 0;
  const names = useMemo(() => seats.map((s) => s.name), [seats]);
  const kinds = useMemo(() => seats.map((s) => s.kind), [seats]);
  const mine = seats.findIndex((s) => s.kind === "me");

  function apply(move: unknown) {
    const s = stateRef.current;
    const legal = rules.moves(s);
    if (!legal.some((m) => same(m, move))) return false;
    const next = rules.play(s, move);
    stateRef.current = next;
    hist.current = [...hist.current, move];
    countRef.current += 1;
    setState(next);
    setCount(countRef.current);
    const t = Date.now();
    setTurnAt(t);
    setClock(t);
    playSfx("tick");
    const nt = rules.turn(next);
    if (def.hidden && nt >= 0 && nt !== rules.turn(s) && seats[nt]?.kind === "local" && seats.filter((x) => x.kind === "local" || x.kind === "me").length > 1) setCovered(true);
    return true;
  }

  /**
   * Catch up: every move so far from the start, only if the rules take all of them, it goes on
   * from the moves this phone has (never rewrites them), and (once this phone has played) adds
   * none of my own moves (I make those myself).
   */
  function replay(moves: unknown[]) {
    const had = hist.current;
    let s = start;
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      if (k < had.length && !same(had[k], m)) return;
      if (rules.turn(s) < 0 || !rules.moves(s).some((x) => same(x, m))) return;
      if (k >= had.length && had.length > 0 && seats[rules.turn(s)]?.kind === "me") return;
      s = rules.play(s, m);
    }
    stateRef.current = s;
    hist.current = moves;
    countRef.current = moves.length;
    setState(s);
    setCount(moves.length);
    const t = Date.now();
    setTurnAt(t);
    setClock(t);
  }

  // Their moves, from the other phone; and the moves so far, for whoever asks (players only).
  useEffect(() => {
    if (!online) return;
    return online.listen((raw) => {
      const msg = raw as unknown as Record<string, unknown>;
      if (msg.t === "tsync_req") {
        if (mine >= 0 && hist.current.length) online.post?.({ t: "tsync", moves: hist.current });
        return;
      }
      if (msg.t === "tsync") {
        if (Array.isArray(msg.moves) && msg.moves.length > hist.current.length) replay(msg.moves);
        return;
      }
      if (msg.t !== "mg_move") return;
      const t = rules.turn(stateRef.current);
      if (t < 0 || seats[t]?.kind !== "remote" || msg.k !== countRef.current) return;
      apply(msg.m);
    });
  });
  // Opening (or reopening) the board: ask for the moves so far a few times.
  const canSync = !!online?.post;
  useEffect(() => {
    if (!canSync) return;
    const ts = [800, 3000, 7000].map((ms) => window.setTimeout(() => online?.post?.({ t: "tsync_req" }), ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync]);

  const waitingOn = !over && seats[turn]?.kind === "remote";
  const timed = !!moveSecs && !!online && !over && (seats[turn]?.kind === "me" || waitingOn);
  useEffect(() => {
    if (!timed && !(waitingOn && canSync)) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timed, waitingOn, canSync]);
  // Stuck on another phone's move: ask again now and then (it may never have arrived).
  const stuckFor = clock - turnAt;
  const asks = waitingOn && canSync ? Math.floor(stuckFor / STUCK_MS) : 0;
  useEffect(() => {
    if (asks > 0) online?.post?.({ t: "tsync_req" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asks]);
  const secsLeft = moveSecs ? Math.max(0, Math.ceil(moveSecs - stuckFor / 1000)) : 0;
  // Time up on my move: the computer plays it (and it goes to the others like any move).
  const timeUp = timed && seats[turn]?.kind === "me" && secsLeft <= 0;
  useEffect(() => {
    if (!timeUp) return;
    const m = rules.bot(stateRef.current);
    if (apply(m)) online?.send({ k: countRef.current - 1, m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  // Bots move by themselves (on every phone, the same way).
  useEffect(() => {
    if (over || seats[turn]?.kind !== "bot") return;
    const id = window.setTimeout(() => apply(rules.bot(stateRef.current)), 650);
    return () => window.clearTimeout(id);
  });

  // The end.
  useEffect(() => {
    if (!over || ended.current) return;
    ended.current = true;
    const w = rules.winners(state) ?? [];
    const draw = w.length !== 1;
    const ours = w.some((i) => seats[i]?.kind === "me" || seats[i]?.kind === "local");
    playSfx(ours ? "found" : "miss");
    onEnd({ won: ours && (!draw || w.length < seats.length), draw, winners: w.map((i) => names[i]), seats: w });
  }, [over, state, rules, seats, names, onEnd]);

  // Who's watching this screen: me, or (pass and play) whoever's turn it is.
  const localTurn = !over && (seats[turn]?.kind === "local" || seats[turn]?.kind === "me");
  const viewSeat = localTurn ? turn : mine >= 0 ? mine : 0;
  const canMove = localTurn && !covered;

  function move(m: unknown) {
    if (!canMove) return;
    if (apply(m) && online && seats[turn]?.kind === "me") online.send({ k: countRef.current - 1, m });
  }

  const winners = over ? (rules.winners(state) ?? []) : [];
  const scores = rules.scores?.(state);
  // The move's timer (across phones, with moveSecs).
  const timer = timed ? (
    <span className={cn("pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold tabular-nums shadow", secsLeft <= 10 ? "bg-[#ff6b6b] text-white" : "bg-black/60 text-white")} aria-live="off">
      {seats[turn]?.kind === "me" ? "Your move" : `${names[turn]}'s move`} · {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}
    </span>
  ) : null;
  if (bare)
    return timer ? (
      <>
        {timer}
        <View s={state} seat={viewSeat} canMove={canMove} onMove={move} names={names} kinds={kinds} onQuit={onQuit} />
      </>
    ) : (
      <View s={state} seat={viewSeat} canMove={canMove} onMove={move} names={names} kinds={kinds} onQuit={onQuit} />
    );
  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {seats.map((s, i) => (
          <span
            key={i}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
              turn === i ? "bg-ink text-white" : winners.includes(i) ? "bg-gold text-ink" : "bg-panel-2 text-muted",
            )}
          >
            {winners.includes(i) ? <Crown className="size-3.5" /> : s.kind === "bot" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
            {s.name}
            {scores && <b className="tabular-nums">· {scores[i]}</b>}
          </span>
        ))}
      </div>
      <p className="text-center text-sm font-semibold text-muted" aria-live="polite">
        {over
          ? winners.length === 1
            ? `${names[winners[0]]} won!`
            : winners.length > 1
              ? `A draw between ${winners.map((w) => names[w]).join(" and ")}`
              : "It's a draw"
          : seats[turn]?.kind === "me"
            ? "Your turn"
            : seats[turn]?.kind === "local"
              ? `${names[turn]}'s turn`
              : seats[turn]?.kind === "remote"
                ? `Waiting for ${names[turn]}…`
                : `${names[turn]} is thinking…`}
      </p>
      <div className="relative">
        {timer}
        <View s={state} seat={viewSeat} canMove={canMove} onMove={move} names={names} kinds={kinds} onQuit={onQuit} />
        {covered && (
          <button onClick={() => setCovered(false)} className="absolute inset-0 grid place-items-center rounded-3xl bg-ink/95 text-white">
            <span className="space-y-2 text-center">
              <Eye className="mx-auto size-8" />
              <b className="block text-lg">Pass the phone to {names[turn]}</b>
              <span className="block text-sm text-white/70">Tap when only they can see the screen</span>
            </span>
          </button>
        )}
        {over && winners.some((i) => seats[i]?.kind === "me" || seats[i]?.kind === "local") && <Confetti />}
      </div>
    </div>
  );
}

/** "You won" / "X won" badge for the end of a turn game. */
export function TurnResult({ won, draw, winners }: { won: boolean; draw: boolean; winners: string[] }) {
  return (
    <p className={cn("act-pop flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-center font-display text-xl font-bold", won ? "bg-gold/30" : "bg-panel-2")}>
      {won ? <Trophy className="size-5 text-gold-dark" /> : <RotateCcw className="size-5 text-muted" />}
      {won ? (draw ? "A share of the win!" : "You won!") : draw ? "A draw" : `${winners.join(" and ")} won`}
    </p>
  );
}
