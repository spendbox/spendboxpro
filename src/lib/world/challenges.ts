// Challenges on the map (docs/CHALLENGES.md; the database part is game-db/070_challenges.sql):
// tap Challenge, pick a game and a stake, and everyone nearby has a minute to join. The game is played
// right there on the map; the winner takes the pool.

export type ChallengeGame = {
  id: string;
  title: string;
  blurb: string;
  /** The turn game that plays it (src/app/play/minigames/turns), or null while it's coming soon. */
  engine: string | null;
  /** Most players. */
  seats: number;
  colour: string;
  /** A picture for the card. */
  icon: string;
};

export const CHALLENGE_GAMES: ChallengeGame[] = [
  { id: "whot", title: "Whot!", blurb: "Nigeria's card game. Match the shape or number, hold on, pick two, general market.", engine: "whot", seats: 4, colour: "#7a1f2b", icon: "🃏" },
  { id: "ludo", title: "Ludo", blurb: "Roll, race your four seeds home, and knock everyone else back to start.", engine: "ludo", seats: 4, colour: "#e03131", icon: "🎲" },
  { id: "jenga", title: "Jenga", blurb: "Pull a block, stack it on top, and don't be the one who topples the tower.", engine: null, seats: 4, colour: "#a5673f", icon: "🧱" },
  { id: "police_thief", title: "Police and Thief", blurb: "One thief, the rest police, round the streets of Lagos. Catch them or get away.", engine: null, seats: 6, colour: "#1c3f6e", icon: "🚓" },
];

export const challengeGame = (id: string) => CHALLENGE_GAMES.find((g) => g.id === id);

/** What each player puts into the pool (naira): the host picks. */
export const STAKES_NAIRA = [100_000, 500_000, 1_000_000, 5_000_000];
/** Another challenge before the cooldown is over costs this (naira); the first one is free. */
export const CHALLENGE_FEE_NAIRA = 250_000;
/** How long before your next challenge is free again (between 5 and 10 minutes: time to join other people's). */
export const CHALLENGE_COOLDOWN_SECS = 8 * 60;
/** How long people have to join. */
export const JOIN_SECS = 60;
/** The winner takes this share of the pool (the rest is the house's). */
export const WINNER_SHARE = 0.9;
/** Challenges near enough to hear about (tiles, 100 m each). */
export const NEAR_TILES = 40;

/** Reputation from challenges: 1 for each one you hosted that was played, 3 for each win (up to 120 in all). */
export function challengeRep(hosted: number, won: number) {
  return Math.min(120, Math.max(0, Math.round(hosted)) + Math.max(0, Math.round(won)) * 3);
}
