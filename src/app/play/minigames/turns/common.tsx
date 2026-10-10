"use client";

import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { cn } from "@/lib/cn";
import { hashRand } from "../rng";

// Bits the turn games share. Randomness (dice, shuffles, bot choices) always comes from the
// game's seed and how many moves have been played, so every phone gets the same numbers.

/** A random number 0-1 for this point in the game (k: which one, if several are needed). */
export const rnd = (s: { seed: number; n: number }, k = 0) => hashRand(s.seed, s.n, k);
/** A die roll for this point in the game. */
export const die = (s: { seed: number; n: number }, k = 0) => 1 + Math.floor(rnd(s, k) * 6);

/** Seat colours (red, green, yellow, blue, then more). */
export const SEAT_COLOURS = ["#e03131", "#2f9e44", "#f59f00", "#1c7ed6", "#7048e8", "#e64980"];

const DICE = [Dice1, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
export function Die({ n, className, rolling }: { n: number | null; className?: string; rolling?: boolean }) {
  const D = DICE[n ?? 1];
  return <D className={cn("size-10", rolling && "animate-spin", !n && "opacity-30", className)} />;
}

/** A button for the board games. */
export function Act({ children, onClick, disabled, tone = "ink" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "ink" | "green" | "soft" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-3 font-semibold disabled:opacity-40", tone === "ink" ? "bg-ink text-white" : tone === "green" ? "bg-me text-white" : "bg-panel-2")}
    >
      {children}
    </button>
  );
}

/** Shuffle a list with the game's randomness. */
export function seededShuffle<T>(seed: number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hashRand(seed, i, 77) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
