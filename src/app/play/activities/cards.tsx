"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowBigDown, ArrowBigUp, Club, Diamond, Heart, RotateCcw, Spade } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import { BigButton, Confetti, GameHeader, Leaderboard, RewardHint, RewardNote, useGameReward, useScoreBoard, useSecondsLeft, type GameProps, nowMs, rand } from "./ui";

// Higher or Lower: will the next card be higher or lower? Keep the streak going. The same
// value again is a free pass. One wrong guess (or the 60-second clock) ends it.

const SECONDS = 60;
const SUITS = [
  { icon: Spade, red: false },
  { icon: Heart, red: true },
  { icon: Diamond, red: true },
  { icon: Club, red: false },
];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

type Card = { rank: number; suit: number };

function shuffled(): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function CardFace({ card, flipKey, small }: { card: Card; flipKey?: number; small?: boolean }) {
  const S = SUITS[card.suit];
  return (
    <div
      key={flipKey}
      className={cn(
        "act-pop relative grid place-items-center rounded-2xl border border-line bg-white shadow-md",
        small ? "h-20 w-14" : "h-40 w-28",
        S.red ? "text-[#e5484d]" : "text-ink",
      )}
    >
      <span className={cn("absolute left-2 top-1 font-bold", small ? "text-sm" : "text-xl")}>{RANKS[card.rank]}</span>
      <S.icon className={small ? "size-6" : "size-12"} fill="currentColor" />
      <span className={cn("absolute bottom-1 right-2 rotate-180 font-bold", small ? "text-sm" : "text-xl")}>{RANKS[card.rank]}</span>
    </div>
  );
}

export function Cards(props: GameProps) {
  const [deck, setDeck] = useState<Card[]>(shuffled);
  const [pos, setPos] = useState(0);
  const [streak, setStreak] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [over, setOver] = useState<null | "wrong" | "time" | "deck">(null);
  const [last, setLast] = useState<"right" | "same" | "wrong" | null>(null);
  const left = useSecondsLeft(endsAt);
  const board = useScoreBoard(props, "cards");
  const reward = useGameReward("cards", !!props.me);
  const card = deck[pos];
  const prev = pos > 0 ? deck[pos - 1] : null;

  useEffect(() => {
    if (endsAt && left === 0 && !over) {
      const id = window.setTimeout(() => setOver("time"), 0);
      return () => window.clearTimeout(id);
    }
  }, [left, endsAt, over]);

  const finished = useRef(false);
  useEffect(() => {
    if (!over || finished.current) return;
    finished.current = true;
    setEndsAt(null);
    board.post(streak);
    void reward.finish(streak);
  }, [over, streak, board, reward]);

  function guess(higher: boolean) {
    if (over) return;
    if (!endsAt) setEndsAt(nowMs() + SECONDS * 1000);
    const next = deck[pos + 1];
    if (!next) return setOver("deck");
    setPos(pos + 1);
    if (next.rank === card.rank) {
      setLast("same");
      playSfx("tick");
      return;
    }
    if (next.rank > card.rank === higher) {
      setStreak((s) => s + 1);
      setLast("right");
      playSfx("pop");
      if (pos + 2 >= deck.length) setOver("deck");
    } else {
      setLast("wrong");
      setOver("wrong");
      playSfx("miss");
    }
  }

  function again() {
    finished.current = false;
    setDeck(shuffled());
    setPos(0);
    setStreak(0);
    setOver(null);
    setLast(null);
    setEndsAt(null);
    reward.reset();
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={Spade} title="Higher or Lower" sub={props.label} onClose={props.onClose} color="#18202b" />
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{endsAt ? `${left}s left` : `${SECONDS} seconds once you start`}</span>
        <span>Streak {streak}</span>
      </div>
      <div className="relative flex items-center justify-center gap-4 rounded-3xl bg-[#0f6b47] py-6">
        {prev && <div className="opacity-70"><CardFace card={prev} small /></div>}
        <CardFace card={card} flipKey={pos} />
        {last && !over && (
          <span
            key={pos}
            className={cn(
              "act-pop absolute top-2 rounded-full px-3 py-0.5 text-sm font-bold",
              last === "right" ? "bg-me text-white" : last === "same" ? "bg-white text-ink" : "bg-hit text-white",
            )}
          >
            {last === "right" ? "Yes!" : last === "same" ? "Same card, free pass" : "Nope"}
          </span>
        )}
        {over && streak >= 8 && <Confetti />}
      </div>
      {!over ? (
        <div className="grid grid-cols-2 gap-2">
          <BigButton tone="green" onClick={() => guess(true)}>
            <ArrowBigUp className="size-5" /> Higher
          </BigButton>
          <BigButton tone="ink" onClick={() => guess(false)}>
            <ArrowBigDown className="size-5" /> Lower
          </BigButton>
        </div>
      ) : (
        <div className="act-rise space-y-2 text-center">
          <p className="font-display text-2xl font-bold">
            {over === "time" ? "Time's up!" : over === "deck" ? "You got through the whole deck!" : "Wrong guess!"} {streak} in a row
          </p>
          <RewardNote claim={reward.claim} />
          <BigButton onClick={again}>
            <RotateCcw className="size-4" /> New deck
          </BigButton>
        </div>
      )}
      <RewardHint game="cards" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="in a row" />
    </div>
  );
}
