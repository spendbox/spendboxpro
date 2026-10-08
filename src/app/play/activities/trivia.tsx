"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Check, Play, Users, X as XIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import { randomId, useActivityRoom, type ActivityMsg, type ActivityPlayer } from "./hub";
import { TRIVIA } from "./trivia-questions";
import { BigButton, Confetti, Face, GameHeader, Leaderboard, RewardHint, RewardNote, useGameReward, useScoreBoard, useSecondsLeft, type GameProps, nowMs, rand } from "./ui";

// Room trivia: anyone can start a quiz and everyone in the place plays along on their own
// phone: 7 questions, 10 seconds each. Whoever started it keeps it running (if they leave,
// someone else can start a new one).

const TOTAL = 7;
const SECS = 10;
const REVEAL_MS = 2500;

type Quiz = {
  qz: string;
  host: ActivityPlayer;
  n: number;
  total: number;
  qi: number;
  deadline: number;
  heardAt: number;
  ended: boolean;
};
type Answer = { p: ActivityPlayer; correct: boolean };

/** The same answer order on every phone. */
function optionsFor(qz: string, n: number, qi: number) {
  const q = TRIVIA[qi];
  const opts = [q.right, ...q.wrong];
  let h = 2166136261;
  for (const c of `${qz}:${n}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  for (let i = opts.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = (h >>> 0) % (i + 1);
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

export function Trivia(props: GameProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, Record<string, Answer>>>({});
  const [mine, setMine] = useState<Record<number, number>>({});
  const [now, setNow] = useState(() => nowMs());
  const board = useScoreBoard(props, "trivia");
  const reward = useGameReward("trivia", !!props.me);
  const quizRef = useRef<Quiz | null>(null);
  const hostTimers = useRef<number[]>([]);
  const hosting = useRef<string | null>(null);
  useEffect(() => {
    quizRef.current = quiz;
  });

  const room = useActivityRoom(props.roundId, props.roomId, props.me, { onMessage, doing: "trivia" });
  const sendRef = useRef(room.send);
  useEffect(() => {
    sendRef.current = room.send;
  });

  function onMessage(m: ActivityMsg) {
    if (m.t === "quiz_q") {
      if (typeof m.qz !== "string" || !Number.isInteger(m.qi) || !TRIVIA[m.qi] || !Number.isInteger(m.n)) return;
      const cur = quizRef.current;
      // Two quizzes started at once: everyone follows the same one.
      if (cur && cur.qz !== m.qz && !cur.ended && nowMs() - cur.heardAt < 20_000 && m.qz > cur.qz) return;
      if (cur && cur.qz !== m.qz) {
        if (hosting.current && hosting.current !== m.qz) stopHosting();
        setAnswers({});
        setMine({});
        reward.reset();
      }
      const secs = Math.max(5, Math.min(20, Number(m.secs) || SECS));
      const next: Quiz = {
        qz: m.qz,
        host: m.host,
        n: m.n,
        total: Math.min(20, Number(m.total) || TOTAL),
        qi: m.qi,
        deadline: nowMs() + secs * 1000,
        heardAt: nowMs(),
        ended: false,
      };
      quizRef.current = next;
      setQuiz(next);
    } else if (m.t === "quiz_a") {
      const cur = quizRef.current;
      if (!cur || m.qz !== cur.qz || !m.p?.id || !Number.isInteger(m.n)) return;
      setAnswers((a) => (a[m.n]?.[m.p.id] ? a : { ...a, [m.n]: { ...(a[m.n] ?? {}), [m.p.id]: { p: m.p, correct: !!m.correct } } }));
    } else if (m.t === "quiz_end") {
      const cur = quizRef.current;
      if (cur && m.qz === cur.qz) {
        const ended = { ...cur, ended: true };
        quizRef.current = ended;
        setQuiz(ended);
      }
    }
  }

  // A clock for the countdown and for noticing a quiz that stopped.
  useEffect(() => {
    if (!quiz || quiz.ended) return;
    const id = window.setInterval(() => setNow(nowMs()), 500);
    return () => window.clearInterval(id);
  }, [quiz]);

  function stopHosting() {
    hostTimers.current.forEach(clearTimeout);
    hostTimers.current = [];
    hosting.current = null;
  }

  function start() {
    if (!props.me) return;
    stopHosting();
    const qz = randomId(8);
    hosting.current = qz;
    const picks = new Set<number>();
    while (picks.size < TOTAL) picks.add(Math.floor(rand() * TRIVIA.length));
    const list = [...picks];
    const host = props.me;
    setAnswers({});
    setMine({});
    reward.reset();
    list.forEach((qi, i) => {
      hostTimers.current.push(
        window.setTimeout(() => sendRef.current({ t: "quiz_q", qz, host, n: i + 1, total: TOTAL, qi, secs: SECS }), i * (SECS * 1000 + REVEAL_MS)),
      );
    });
    hostTimers.current.push(
      window.setTimeout(() => {
        sendRef.current({ t: "quiz_end", qz });
        hosting.current = null;
      }, TOTAL * (SECS * 1000 + REVEAL_MS)),
    );
  }

  // Leaving while hosting ends the quiz for everyone.
  useEffect(
    () => () => {
      if (hosting.current) sendRef.current({ t: "quiz_end", qz: hosting.current });
      hostTimers.current.forEach(clearTimeout);
    },
    [],
  );

  function answer(i: number) {
    const q = quizRef.current;
    if (!q || q.ended || mine[q.n] !== undefined || nowMs() > q.deadline) return;
    const opts = optionsFor(q.qz, q.n, q.qi);
    const correct = opts[i] === TRIVIA[q.qi].right;
    setMine((m) => ({ ...m, [q.n]: i }));
    playSfx("tick");
    if (props.me) sendRef.current({ t: "quiz_a", qz: q.qz, n: q.n, p: props.me, correct });
    else setAnswers((a) => ({ ...a, [q.n]: { ...(a[q.n] ?? {}), guest: { p: { id: "guest", name: "You", avatar: null }, correct } } }));
  }

  const left = useSecondsLeft(quiz && !quiz.ended ? quiz.deadline : null);
  const stale = !!quiz && !quiz.ended && now - quiz.heardAt > SECS * 1000 + REVEAL_MS + 6000;
  const revealing = !!quiz && !quiz.ended && now > quiz.deadline;

  // Everyone's right answers.
  const totals = new Map<string, { p: ActivityPlayer; score: number }>();
  for (const per of Object.values(answers)) {
    for (const a of Object.values(per)) {
      const t = totals.get(a.p.id) ?? { p: a.p, score: 0 };
      if (a.correct) t.score += 1;
      totals.set(a.p.id, t);
    }
  }
  const standings = [...totals.values()].sort((a, b) => b.score - a.score);
  const myId = props.me?.id ?? "guest";
  const myRight = totals.get(myId)?.score ?? 0;
  const answeredAny = Object.keys(mine).length > 0;

  // Quiz over: post my score and collect coins (once per quiz).
  const claimed = useRef<string | null>(null);
  const over = !!quiz && (quiz.ended || stale);
  useEffect(() => {
    if (!over || !quiz || claimed.current === quiz.qz || !answeredAny) return;
    claimed.current = quiz.qz;
    board.post(myRight);
    void reward.finish(Math.min(TOTAL, myRight));
    if (myRight >= 5) playSfx("levelup");
  }, [over, quiz, answeredAny, myRight, board, reward]);

  const q = quiz && !over ? TRIVIA[quiz.qi] : null;
  const opts = quiz && q ? optionsFor(quiz.qz, quiz.n, quiz.qi) : [];
  const myPick = quiz ? mine[quiz.n] : undefined;
  const thisRound = quiz ? Object.values(answers[quiz.n] ?? {}) : [];

  return (
    <div className="space-y-3">
      <GameHeader icon={Brain} title="Trivia" sub="Everyone here plays together" onClose={props.onClose} color="#0b7285" />
      {!quiz || over ? (
        <div className="space-y-3">
          {over && (
            <div className="act-rise relative space-y-2 rounded-2xl bg-panel-2 p-3">
              {myRight >= 5 && <Confetti />}
              <p className="text-center font-display text-xl font-bold">
                {stale && !quiz?.ended ? "The quiz stopped" : "Quiz over!"} You got {myRight}/{quiz?.total ?? TOTAL}
              </p>
              <ol className="space-y-1">
                {standings.slice(0, 5).map((s, i) => (
                  <li key={s.p.id} className="flex items-center gap-2 text-sm">
                    <span className="w-4 font-bold text-muted">{i + 1}</span>
                    <Face p={s.p} size={22} />
                    <span className="flex-1 truncate">{s.p.id === myId ? "You" : s.p.name}</span>
                    <b>{s.score}</b>
                  </li>
                ))}
              </ol>
              <RewardNote claim={reward.claim} />
            </div>
          )}
          <p className="text-sm text-muted">
            {TOTAL} quick questions about Nigeria, Africa, the world, music, football, food and science. Everyone in this place can join in.
          </p>
          <BigButton tone="green" onClick={start} disabled={!props.me}>
            <Play className="size-4" /> {props.me ? (over ? "Start another quiz" : "Start a quiz for the room") : "Sign in to start a quiz"}
          </BigButton>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>
              Question {quiz.n}/{quiz.total} · {q!.cat}
            </span>
            <span className={cn("tabular-nums", left <= 3 && !revealing && "text-hit")}>{revealing ? "Answer!" : `${left}s`}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full bg-[#0b7285] transition-all duration-500" style={{ width: `${revealing ? 0 : (left / SECS) * 100}%` }} />
          </div>
          <p key={quiz.n} className="act-rise font-display text-lg font-bold leading-snug">
            {q!.q}
          </p>
          <div className="grid gap-2">
            {opts.map((o, i) => {
              const right = o === q!.right;
              const picked = myPick === i;
              return (
                <button
                  key={`${quiz.n}-${o}`}
                  onClick={() => answer(i)}
                  disabled={myPick !== undefined || revealing}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 py-2 text-left font-semibold transition",
                    revealing && right
                      ? "border-me bg-me/15"
                      : revealing && picked
                        ? "border-hit bg-hit/10"
                        : picked
                          ? "border-ink bg-panel-2"
                          : "border-line bg-panel hover:bg-panel-2",
                  )}
                >
                  <span className="flex-1">{o}</span>
                  {revealing && right && <Check className="size-5 text-me" />}
                  {revealing && picked && !right && <XIcon className="size-5 text-hit" />}
                </button>
              );
            })}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Users className="size-3.5" />
            {revealing
              ? `${thisRound.filter((a) => a.correct).length} of ${thisRound.length} got it right`
              : `${thisRound.length} answered · quiz by ${quiz.host.id === props.me?.id ? "you" : quiz.host.name}`}
          </p>
        </div>
      )}
      <RewardHint game="trivia" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="right" />
    </div>
  );
}
