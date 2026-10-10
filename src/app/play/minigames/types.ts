// What every minigame is made of. A game is an entry in the registry (./registry) that names
// an engine and gives it settings (cfg). Two kinds:
//
// - Score games: the engine plays one game from a seed and reports a score (onEnd). Several
//   people play the same seed (taking turns on one phone, or a challenge across phones) and
//   the best score wins.
// - Turn games (boards and cards): pure rules (TurnRules) that both phones run the same way;
//   only the moves travel between them. Bots fill empty seats.

import type { Rng } from "./rng";

export type Category = "heist" | "sport" | "water" | "shooting" | "board" | "cards" | "arcade" | "party" | "life";

export const CATEGORIES: Record<Category, { label: string; blurb: string; colour: string }> = {
  heist: { label: "Heists", blurb: "Crack safes, dodge lasers, get away", colour: "#343a40" },
  sport: { label: "Sport", blurb: "Shoot hoops, kick goals, win the race", colour: "#2f9e44" },
  water: { label: "Water", blurb: "Swim, dive, row, surf and fish", colour: "#1c7ed6" },
  shooting: { label: "Shooting", blurb: "Ranges, ducks, clays and targets", colour: "#e8590c" },
  board: { label: "Board games", blurb: "Ludo, chess, draughts, Ayo and more", colour: "#9c36b5" },
  cards: { label: "Cards and casino", blurb: "Whot!, poker, blackjack and more", colour: "#c2255c" },
  arcade: { label: "Arcade", blurb: "Quick classics, high scores", colour: "#3b5bdb" },
  party: { label: "Party", blurb: "Games for a room full of people", colour: "#f08c00" },
  life: { label: "Town life", blurb: "Job shifts and everyday hustle", colour: "#0c8599" },
};

/** Settings an engine reads (each engine documents its own). */
export type Cfg = Record<string, string | number | boolean | undefined>;

export type MiniGameDef = {
  /** Stable id (used for rewards, rooms and leaderboards). */
  id: string;
  /** Its number in docs/MINIGAMES.md. */
  n: number;
  title: string;
  cat: Category;
  /** One line for the list. */
  blurb: string;
  /** How to play, in a sentence or two. */
  how: string;
  /** Kinds of places it belongs to (CityRoom.type values, plus "anywhere"). */
  places: string[];
  engine: string;
  cfg?: Cfg;
  kind: "score" | "turns";
  /** What the score counts ("points", "seconds"...). */
  unit: string;
  /** Lower scores are better (times). */
  lowerWins?: boolean;
  /** Bronze, silver and gold scores (rewards, heist pass marks). */
  grades: [number, number, number];
  /** Turn games: how many seats. */
  seats?: [number, number];
  /** Turn games: cards are secret (pass-and-play hides the screen between turns). */
  hidden?: boolean;
  /** A lucide icon name (see ./icons). */
  icon: string;
  colour: string;
  /** Played inside an older screen of its own (archery, darts...). */
  legacy?: boolean;
};

/** What a score engine gets. It starts playing as soon as it's on screen. */
export type EngineProps = {
  def: MiniGameDef;
  cfg: Cfg;
  seed: number;
  /** The game is over: the final score (once). */
  onEnd: (score: number) => void;
};

/** Turn games: the rules, run the same way on every phone. */
export type TurnRules<S, M> = {
  /** A new game for n seats. */
  init(seed: number, seats: number, cfg: Cfg): S;
  /** Whose turn it is (a seat), or -1 when the game is over. */
  turn(s: S): number;
  /** Every move the player whose turn it is can make (empty: they must pass, see play). */
  moves(s: S): M[];
  /** The state after a move (never changes s). */
  play(s: S, m: M): S;
  /** When it's over: the winning seats (several on a draw), else null. */
  winners(s: S): number[] | null;
  /** A computer player's move (the same on every phone for the same state). */
  bot(s: S): M;
  /** A score for each seat at the end (chips, points...), for the results; optional. */
  scores?(s: S): number[];
  /** Turn games where a turn can be just "pass" (no legal move): the move to send. */
  pass?: M;
};

/** How a turn game draws itself. `seat` is the seat this screen plays (or watches) as. */
export type TurnViewProps<S, M> = {
  s: S;
  seat: number;
  /** Your turn: tap to move. */
  canMove: boolean;
  onMove: (m: M) => void;
  names: string[];
  rng?: Rng;
};
