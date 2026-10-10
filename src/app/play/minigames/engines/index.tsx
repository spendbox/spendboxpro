"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { EngineProps } from "../types";

// Every score-game engine, loaded only when a game that uses it opens.

const load = (f: () => Promise<{ default: ComponentType<EngineProps> }>) =>
  dynamic(f, { ssr: false, loading: () => <div className="grid aspect-[3/4] w-full place-items-center rounded-3xl bg-[#10161f] text-sm text-white/60">Loading…</div> });

export const ENGINES: Record<string, ComponentType<EngineProps>> = {
  meter: load(() => import("./meter")),
  targets: load(() => import("./targets")),
  race: load(() => import("./race")),
  lanes: load(() => import("./lanes")),
  crossing: load(() => import("./crossing")),
  balance: load(() => import("./balance")),
  stacker: load(() => import("./stacker")),
  claw: load(() => import("./claw")),
  rhythm: load(() => import("./rhythm")),
  arrows: load(() => import("./arrows")),
  memory: load(() => import("./memory")),
  pipes: load(() => import("./pipes")),
  wires: load(() => import("./wires")),
  spot: load(() => import("./spot")),
  match: load(() => import("./match")),
  alibi: load(() => import("./alibi")),
  treasure: load(() => import("./treasure")),
  orders: load(() => import("./orders")),
  haggle: load(() => import("./haggle")),
  charades: load(() => import("./charades")),
  draw: load(() => import("./draw-guess")),
  chairs: load(() => import("./chairs")),
  potato: load(() => import("./potato")),
  bingo: load(() => import("./bingo")),
  paddle: load(() => import("./paddle")),
  roll: load(() => import("./roll")),
  bricks: load(() => import("./bricks")),
  snake: load(() => import("./snake")),
  invaders: load(() => import("./invaders")),
  keepy: load(() => import("./keepy")),
  hoops: load(() => import("./hoops")),
  penalty: load(() => import("./penalty")),
  words: load(() => import("./words")),
  blackjack: load(() => import("./blackjack")),
  poker: load(() => import("./poker")),
  snap: load(() => import("./snap")),
};
