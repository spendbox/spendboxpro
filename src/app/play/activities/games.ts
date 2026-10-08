// What can be tapped inside places, which mini games each thing opens, and what a good
// score is worth (a copy of activity_games in game-db/019_activities.sql, for the screens).

import type { RewardGame } from "../activity-actions";

/** What the 3D view says was tapped inside a place. */
export type ActivityKind =
  | "seat"
  | "darts"
  | "archery"
  | "arcade"
  | "pool"
  | "cards"
  | "dance"
  | "dj"
  | "bar"
  | "jukebox"
  | "menu"
  | "stairs"
  | "window"
  | "piano"
  | "karaoke"
  | "slots-free"
  | "photo";

/** The thing tapped: { id, kind, label, place } (place = the room id). */
export type ActivityItem = { id: string; kind: ActivityKind; label: string; place: string };

/** Every screen the activity sheet can show. */
export type GameId =
  | "seat"
  | "darts"
  | "archery"
  | "reflex"
  | "trivia"
  | "pool"
  | "cards"
  | "rps"
  | "dice"
  | "dance"
  | "dj"
  | "jukebox"
  | "bar"
  | "menu"
  | "stairs"
  | "window"
  | "photo"
  | "piano"
  | "karaoke"
  | "slots";

/** The games on offer at each kind of thing (the first one opens). */
export const GAMES_FOR: Record<ActivityKind, GameId[]> = {
  seat: ["seat"],
  darts: ["darts"],
  archery: ["archery"],
  arcade: ["reflex", "trivia", "slots"],
  pool: ["pool"],
  cards: ["cards", "rps", "dice"],
  dance: ["dance"],
  dj: ["dj", "dance"],
  bar: ["bar", "trivia", "dice"],
  jukebox: ["jukebox"],
  menu: ["menu"],
  stairs: ["stairs"],
  window: ["window"],
  piano: ["piano"],
  karaoke: ["karaoke"],
  "slots-free": ["slots", "reflex"],
  photo: ["photo"],
};

export const GAME_TITLE: Record<GameId, string> = {
  seat: "Seat",
  darts: "Darts",
  archery: "Archery",
  reflex: "Reflex",
  trivia: "Trivia",
  pool: "Trick-shot pool",
  cards: "Higher or Lower",
  rps: "Rock-Paper-Scissors",
  dice: "Dice duel",
  dance: "Dance floor",
  dj: "DJ deck",
  jukebox: "Jukebox",
  bar: "Mocktail bar",
  menu: "Menu",
  stairs: "Stair sprint",
  window: "Window",
  photo: "Photo booth",
  piano: "Piano",
  karaoke: "Karaoke",
  slots: "Free slots",
};

/** A score worth coins: min earns coinsMin, top (or more) earns coinsMax. Mirrors the database. */
export const REWARDS: Record<RewardGame, { min: number; top: number; coinsMin: number; coinsMax: number; unit: string }> = {
  archery: { min: 30, top: 55, coinsMin: 2, coinsMax: 8, unit: "points" },
  darts: { min: 120, top: 300, coinsMin: 2, coinsMax: 8, unit: "points" },
  reflex: { min: 20, top: 45, coinsMin: 2, coinsMax: 8, unit: "hits" },
  pool: { min: 2, top: 6, coinsMin: 2, coinsMax: 8, unit: "balls" },
  rps: { min: 1, top: 1, coinsMin: 3, coinsMax: 3, unit: "win" },
  dice: { min: 1, top: 1, coinsMin: 3, coinsMax: 3, unit: "win" },
  cards: { min: 5, top: 12, coinsMin: 2, coinsMax: 8, unit: "in a row" },
  trivia: { min: 4, top: 7, coinsMin: 2, coinsMax: 10, unit: "right" },
  dance: { min: 400, top: 950, coinsMin: 2, coinsMax: 10, unit: "points" },
  karaoke: { min: 50, top: 95, coinsMin: 2, coinsMax: 6, unit: "hype" },
  stairs: { min: 40, top: 90, coinsMin: 2, coinsMax: 5, unit: "steps" },
};

/** Room ids for clubs are ordinary place ids; anything with a dance floor counts as a club. */
export const isClubKind = (k: ActivityKind) => k === "dance" || k === "dj";
