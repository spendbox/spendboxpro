"use client";

import { Club, Diamond, Heart, Spade } from "lucide-react";
import { cn } from "@/lib/cn";
import { shuffle, type Rng } from "./rng";

// Playing cards for the card games: a card is a number, 0-51 (rank = n % 13 + 2, so 2..14 with
// 11 jack, 12 queen, 13 king, 14 ace; suit = floor(n / 13): clubs, diamonds, hearts, spades).
// Also a poker hand ranker (best five of up to seven cards).

export type Card = number;
export const rank = (c: Card) => (c % 13) + 2;
export const suit = (c: Card) => Math.floor(c / 13);
export const RANK_LABEL = ["", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = [Club, Diamond, Heart, Spade];
export const SUIT_NAMES = ["clubs", "diamonds", "hearts", "spades"];
export const isRed = (c: Card) => suit(c) === 1 || suit(c) === 2;

/** A shuffled deck (or several). */
export function deck(r: Rng, decks = 1): Card[] {
  return shuffle(
    r,
    Array.from({ length: 52 * decks }, (_, i) => i % 52),
  );
}

export function cardName(c: Card) {
  return `${RANK_LABEL[rank(c)]} of ${SUIT_NAMES[suit(c)]}`;
}

/** A card on screen (face down when `back`). */
export function PlayingCard({ c, back, small, onClick, selected, dim, className }: { c?: Card; back?: boolean; small?: boolean; onClick?: () => void; selected?: boolean; dim?: boolean; className?: string }) {
  const size = small ? "h-14 w-10 text-sm" : "h-20 w-14 text-lg";
  if (back || c === undefined) {
    return (
      <span className={cn("inline-grid shrink-0 place-items-center rounded-lg border-2 border-white bg-[#c2255c] shadow", size, className)} aria-label="Face-down card">
        <span className="size-3/5 rounded-md border border-white/40 bg-[repeating-linear-gradient(45deg,#e64980_0_4px,#c2255c_4px_8px)]" />
      </span>
    );
  }
  const S = SUITS[suit(c)];
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={cn("relative inline-flex shrink-0 flex-col items-center justify-center rounded-lg border bg-white font-bold shadow transition", size, isRed(c) ? "text-[#e03131]" : "text-[#212529]", selected && "-translate-y-2 ring-2 ring-gold", dim && "opacity-40", className)}
      aria-label={cardName(c)}
    >
      <span className="absolute left-1 top-0.5 text-[10px] leading-none">{RANK_LABEL[rank(c)]}</span>
      <span className="leading-none">{RANK_LABEL[rank(c)]}</span>
      <S className={small ? "size-3.5" : "size-5"} fill="currentColor" />
    </Tag>
  );
}

// ---------------------------------------------------------------- poker hands

export const HAND_NAMES = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];

/** A score for the best five-card hand in `cards` (higher is better), and its name. */
export function bestHand(cards: Card[]): { score: number; name: string } {
  let best = -1;
  const n = cards.length;
  if (n <= 5) best = score5(cards);
  else {
    // Every way of leaving out n - 5 cards (one for six cards, two for seven).
    for (let a = 0; a < n; a++) {
      if (n === 6) {
        best = Math.max(best, score5(cards.filter((_, i) => i !== a)));
        continue;
      }
      for (let b = a + 1; b < n; b++) best = Math.max(best, score5(cards.filter((_, i) => i !== a && i !== b)));
    }
  }
  return { score: best, name: HAND_NAMES[Math.floor(best / 1e10)] ?? "High card" };
}

function score5(cards: Card[]) {
  const ranks = cards.map(rank).sort((x, y) => y - x);
  const flush = cards.length === 5 && cards.every((c) => suit(c) === suit(cards[0]));
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5;
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kick = (list: number[]) => list.reduce((t, r) => t * 15 + r, 0);
  const ordered = groups.flatMap(([r, k]) => Array(k).fill(r));
  let cat = 0;
  if (straightHigh && flush) cat = 8;
  else if (groups[0][1] === 4) cat = 7;
  else if (groups[0][1] === 3 && groups[1]?.[1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh) cat = 4;
  else if (groups[0][1] === 3) cat = 3;
  else if (groups[0][1] === 2 && groups[1]?.[1] === 2) cat = 2;
  else if (groups[0][1] === 2) cat = 1;
  const tie = straightHigh && (cat === 4 || cat === 8) ? straightHigh : kick(ordered.slice(0, 5));
  return cat * 1e10 + tie;
}
