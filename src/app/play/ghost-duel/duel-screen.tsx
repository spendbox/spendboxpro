"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, Flag, LoaderCircle, Swords, Timer, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { RPS_MOVES, type DuelView, type RpsMove } from "@/lib/ghost-duels";
import { answerDuel, duelNow, giveUpDuel, throwMove } from "../ghost-duel-actions";
import { playSfx } from "../sound";
import { localTime, MOVE_INFO } from "./parts";

// The duel itself, for both players: Rock-Paper-Scissors, first to 2 points, a minute at most.
// Each throw is sent to the server, which waits for both and gives the point (a tie is thrown
// again). Once one player has thrown, the other has 20 seconds or the point goes to the one who
// threw, so nobody can win by sitting still. The screen checks about once a second. A hunter
// sees "waiting for the ghost to answer" first; a ghost who opens it from the pop-up has already answered.

const REASON: Record<string, { me: string; them: string }> = {
  score: { me: "", them: "" },
  time: { me: "Time ran out and you were ahead (or level, as the ghost).", them: "Time ran out, and they were ahead (or level: a draw goes to the ghost)." },
  no_answer: { me: "They didn't answer in time.", them: "You didn't answer in time." },
  gave_up: { me: "They gave up.", them: "You gave up." },
};

export function DuelScreen({ initial, me, onClose }: { initial: DuelView; me: { name: string; avatar: Avatar }; onClose: () => void }) {
  const [duel, setDuel] = useState(initial);
  const [ends, setEnds] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [moveEnds, setMoveEnds] = useState<number | null>(null);
  const [moveLeft, setMoveLeft] = useState(0);
  const [sending, setSending] = useState<RpsMove | "answer" | "quit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = duel.status === "asked" || duel.status === "playing";

  // Keep up with the server (about once a second while it's on).
  const id = duel.id;
  useEffect(() => {
    if (!live) return;
    let on = true;
    const tick = setInterval(() => {
      duelNow(id)
        .then((r) => on && r.ok && setDuel(r.duel))
        .catch(() => {});
    }, 900);
    return () => {
      on = false;
      clearInterval(tick);
    };
  }, [id, live]);
  // When it ends on this device's clock (answer by, or the end of the minute).
  const deadline = duel.status === "asked" ? duel.answerBy : duel.status === "playing" ? duel.endsAt : null;
  const serverNow = duel.now;
  useEffect(() => {
    const t = setTimeout(() => setEnds(localTime(deadline, serverNow, Date.now())), 0);
    return () => clearTimeout(t);
  }, [deadline, serverNow]);
  useEffect(() => {
    if (ends === null) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((ends - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [ends]);
  // The throw clock: once one of you has thrown, the other has a few seconds left to throw.
  const moveBy = duel.status === "playing" ? duel.moveBy : null;
  useEffect(() => {
    const t = setTimeout(() => setMoveEnds(localTime(moveBy, serverNow, Date.now())), 0);
    return () => clearTimeout(t);
  }, [moveBy, serverNow]);
  useEffect(() => {
    if (moveEnds === null) return;
    const tick = () => setMoveLeft(Math.max(0, Math.ceil((moveEnds - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [moveEnds]);
  // A beep in the last few seconds when it's you who has to throw.
  const mustThrow = duel.status === "playing" && !duel.myMove && duel.theyMoved && moveBy !== null;
  useEffect(() => {
    if (mustThrow && moveLeft > 0 && moveLeft <= 5) playSfx("tick");
  }, [mustThrow, moveLeft]);
  // Sounds: a point won or lost, and the result.
  const throwsSeen = useRef(initial.throws.length);
  const status = duel.status;
  const winner = duel.winner;
  const throwCount = duel.throws.length;
  const lastW = duel.throws.at(-1)?.w;
  useEffect(() => {
    if (throwCount > throwsSeen.current && lastW) playSfx(lastW === "me" ? "found" : lastW === "them" ? "miss" : "pop");
    throwsSeen.current = throwCount;
  }, [throwCount, lastW]);
  useEffect(() => {
    if (status === "done") playSfx(winner === "me" ? "levelup" : "caught");
  }, [status, winner]);

  async function act(kind: RpsMove | "answer" | "quit") {
    setSending(kind);
    setError(null);
    const res = await (kind === "answer" ? answerDuel(id) : kind === "quit" ? giveUpDuel(id) : throwMove(id, kind)).catch(() => ({
      ok: false as const,
      error: "The connection blinked. Tap again.",
    }));
    setSending(null);
    if (res.ok) setDuel(res.duel);
    else setError(res.error);
  }

  const them = duel.opponent;
  const last = duel.throws.at(-1);
  const result = duel.status === "done" ? (duel.winner === "me" ? "won" : "lost") : duel.status === "void" ? "off" : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-3 backdrop-blur-sm" role="dialog" aria-modal aria-label="Duel">
      <section className="w-full max-w-md rounded-3xl bg-panel p-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-ink text-white">
            <Swords className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-extrabold leading-tight">Rock-Paper-Scissors</h2>
            <p className="text-xs text-muted">
              First to {duel.firstTo} · you&apos;re the {duel.role}
              {duel.role === "ghost" ? " (a draw when time runs out is yours)" : " (a draw when time runs out goes to the ghost)"}
            </p>
          </div>
          {live ? (
            <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums", left <= 10 ? "bg-hit/15 text-hit" : "bg-panel-2")}>
              <Timer className="size-4" />
              {left}s
            </span>
          ) : (
            <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
              <X className="size-5" />
            </button>
          )}
        </div>

        {/* The two players and the score */}
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <div className="min-w-0">
            <AvatarFace avatar={me.avatar} size={56} className="mx-auto rounded-full" />
            <p className="mt-1 truncate text-sm font-bold">You</p>
          </div>
          <p className="font-display text-4xl font-extrabold tabular-nums">
            {duel.me}
            <span className="mx-1 text-muted">:</span>
            {duel.them}
          </p>
          <div className="min-w-0">
            <AvatarFace avatar={them.avatar} size={56} className="mx-auto rounded-full" />
            <p className="mt-1 truncate text-sm font-bold">{them.name}</p>
          </div>
        </div>

        {/* The last throw */}
        {last && (
          <div className="mt-3 flex items-center justify-center gap-3 rounded-2xl bg-panel-2 py-2 text-sm">
            <MoveBadge move={last.me} good={last.w === "me"} />
            <span className="font-semibold text-muted">
              {last.w === "tie" ? "Tie: throw again" : !last.them ? "They didn't throw: your point" : !last.me ? "You didn't throw: their point" : last.w === "me" ? "Your point" : "Their point"}
            </span>
            <MoveBadge move={last.them} good={last.w === "them"} />
          </div>
        )}

        {/* What to do now */}
        {duel.status === "asked" ? (
          duel.role === "hunter" ? (
            <div className="mt-4 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold">
                <LoaderCircle className="size-4 animate-spin" />
                Waiting for {them.name} to answer…
              </p>
              <p className="mt-1 text-xs text-muted">If they don&apos;t answer in {left} seconds, you win.</p>
              <button onClick={() => void act("quit")} disabled={sending !== null} className="mt-3 rounded-xl bg-panel-2 px-4 py-2 text-sm font-semibold">
                Call it off (get your ₥{duel.fee} back)
              </button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => void act("quit")} disabled={sending !== null} className="rounded-xl bg-panel-2 py-3 font-semibold">
                Give up
              </button>
              <button onClick={() => void act("answer")} disabled={sending !== null} className="rounded-xl bg-ink py-3 font-semibold text-white">
                {sending === "answer" ? <LoaderCircle className="mx-auto size-5 animate-spin" /> : "Play now"}
              </button>
            </div>
          )
        ) : duel.status === "playing" ? (
          <>
            <p className={cn("mt-4 text-center text-sm font-semibold", mustThrow && "rounded-xl bg-hit/10 px-2 py-1.5 text-hit")}>
              {duel.myMove
                ? `You threw ${MOVE_INFO[duel.myMove].label.toLowerCase()}. ${duel.theyMoved ? "Revealing…" : `Waiting for ${them.name}…`}`
                : duel.theyMoved
                  ? `${them.name} has thrown! Throw within ${moveBy ? moveLeft : duel.throwSeconds}s or you lose this point.`
                  : "Pick your throw!"}
            </p>
            <p className="mt-0.5 text-center text-xs text-muted">
              {duel.myMove && !duel.theyMoved
                ? `If ${them.name} doesn't throw${moveBy ? ` in ${moveLeft}s` : ""}, the point is yours.`
                : !duel.myMove && !duel.theyMoved
                  ? duel.role === "ghost"
                    ? `Once ${them.name} throws, you have ${duel.throwSeconds}s to throw or you lose the point.`
                    : `Once one of you throws, the other has ${duel.throwSeconds}s. A draw when time runs out goes to the ghost.`
                  : ""}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {RPS_MOVES.map((m) => {
                const { Icon, label } = MOVE_INFO[m];
                const picked = duel.myMove === m;
                return (
                  <button
                    key={m}
                    onClick={() => void act(m)}
                    disabled={!!duel.myMove || sending !== null}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-2xl border-2 py-4 font-bold transition active:scale-95 disabled:opacity-60",
                      picked ? "border-ink bg-ink text-white" : "border-line bg-panel hover:bg-panel-2",
                    )}
                  >
                    {sending === m ? <LoaderCircle className="size-8 animate-spin" /> : <Icon className="size-8" />}
                    {label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => void act("quit")} disabled={sending !== null} className="mx-auto mt-3 flex items-center gap-1 text-xs font-semibold text-muted">
              <Flag className="size-3.5" />
              Give up
            </button>
          </>
        ) : (
          <div className="mt-4 text-center">
            <p className={cn("font-display text-3xl font-extrabold", result === "won" ? "text-[#2b8a3e]" : result === "lost" ? "text-hit" : "")}>
              {result === "won" ? "You won!" : result === "lost" ? "You lost" : "Called off"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {duel.status === "void"
                ? duel.reason === "game_over"
                  ? "The game ended first. Your mint came back."
                  : `Called off. ${duel.role === "hunter" ? `Your ₥${duel.fee} came back.` : ""}`
                : (REASON[duel.reason ?? "score"]?.[result === "won" ? "me" : "them"] ?? "").replace(/.$/, "$& ")}
              {duel.status === "done" &&
                (duel.role === "hunter"
                  ? result === "won"
                    ? `+₥${short(duel.reward)}, and your ${duel.fee} back.`
                    : `You lost ₥${duel.fee}.`
                  : result === "won"
                    ? "One step closer to golden."
                    : `You lost ₥${short(duel.portion)} of your stake.`)}
            </p>
            {result === "won" && duel.role === "ghost" && (
              <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-[#a37500]">
                <Crown className="size-4" />
                Win enough and your light turns gold.
              </p>
            )}
            <button onClick={onClose} className="mt-4 w-full rounded-xl bg-ink py-3 font-semibold text-white">
              Done
            </button>
          </div>
        )}
        {error && <p className="mt-3 rounded-xl bg-hit/10 px-3 py-2 text-center text-sm text-hit">{error}</p>}
      </section>
    </div>
  );
}

function MoveBadge({ move, good }: { move: RpsMove | null; good: boolean }) {
  if (!move) return <span className="rounded-full bg-panel px-2.5 py-1 font-semibold text-muted">No throw</span>;
  const { Icon, label } = MOVE_INFO[move];
  return (
    <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold", good ? "bg-[#d3f9d8] text-[#2b8a3e]" : "bg-panel")}>
      <Icon className="size-4" />
      {label}
    </span>
  );
}
