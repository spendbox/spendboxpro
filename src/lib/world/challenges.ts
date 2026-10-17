// Challenges on the map (docs/CHALLENGES.md; the database part is game-db/070_challenges.sql):
// tap Challenge, pick a game and a stake, and everyone nearby has a minute to join. The game is played
// right there on the map; the winner takes the pool.

/** The shelves of the game picker. */
export const CHALLENGE_CATEGORIES = [
  { id: "cards", label: "Cards", icon: "🃏" },
  { id: "board", label: "Board", icon: "🎲" },
  { id: "party", label: "Party", icon: "🎉" },
  { id: "sports", label: "Sports", icon: "⚽" },
] as const;
export type ChallengeCategory = (typeof CHALLENGE_CATEGORIES)[number]["id"];

export type ChallengeGame = {
  /** Kept in the database: 2 to 20 small letters or _. Never change one once it's been played. */
  id: string;
  title: string;
  blurb: string;
  category: ChallengeCategory;
  /** The turn game that plays it (src/app/play/minigames/turns), or null while it's coming soon. */
  engine: string | null;
  /** Most players (2 to 6). */
  seats: number;
  colour: string;
  /** A picture for the card. */
  icon: string;
  /** Other words people might search for it by. */
  tags?: string;
};

// Adding a game is one line. A game with engine null shows as "Soon" in the picker; give it the
// engine's name once it plays online (two to `seats` players, every phone the same from the seed).
export const CHALLENGE_GAMES: ChallengeGame[] = [
  { id: "whot", title: "Whot!", category: "cards", engine: "whot", seats: 4, colour: "#7a1f2b", icon: "🃏", blurb: "Nigeria's card game. Match the shape or number, hold on, pick two, general market.", tags: "naija shapes" },
  { id: "ludo", title: "Ludo", category: "board", engine: "ludo", seats: 4, colour: "#e03131", icon: "🎲", blurb: "Roll, race your four seeds home, and knock everyone else back to start.", tags: "dice race" },
  { id: "ayo", title: "Ayò", category: "board", engine: null, seats: 2, colour: "#a5673f", icon: "🫘", blurb: "The Yoruba seed game. Sow round the board and capture your rival's seeds.", tags: "oware mancala seeds" },
  { id: "draughts", title: "Draughts", category: "board", engine: "draughts", seats: 2, colour: "#343a40", icon: "⚫", blurb: "Jump your rival's pieces, crown your kings, clear the board.", tags: "checkers" },
  { id: "chess", title: "Chess", category: "board", engine: "chess", seats: 2, colour: "#495057", icon: "♟️", blurb: "The classic. Quick games, checkmate to win." },
  { id: "snakes", title: "Snakes and Ladders", category: "board", engine: null, seats: 4, colour: "#2f9e44", icon: "🐍", blurb: "Climb the ladders, dodge the snakes, first to 100 wins.", tags: "dice" },
  { id: "dominoes", title: "Dominoes", category: "board", engine: null, seats: 4, colour: "#212529", icon: "🔳", blurb: "Match the ends, block your rivals, empty your hand first.", tags: "domino" },
  { id: "crazy_eights", title: "Crazy Eights", category: "cards", engine: null, seats: 4, colour: "#c2255c", icon: "🎴", blurb: "Match the suit or number; eights are wild. First out wins.", tags: "eights" },
  { id: "go_fish", title: "Go Fish", category: "cards", engine: null, seats: 4, colour: "#1c7ed6", icon: "🐟", blurb: "Ask for cards, make sets of four, most sets wins." },
  { id: "truth_dare", title: "Truth or Dare", category: "party", engine: "truth_dare", seats: 6, colour: "#ff2d95", icon: "🍾", blurb: "Spin the bottle. Answer the truth, do the dare, or chicken out. The table judges.", tags: "spin bottle tod" },
  { id: "impostor", title: "Impostor", category: "party", engine: "impostor", seats: 6, colour: "#ef4444", icon: "🕵️", blurb: "Everyone knows the secret word but one. Give clues, find the faker, vote them out. 3 to 6 players.", tags: "spy chameleon word imposter" },
  { id: "jenga", title: "Jenga", category: "party", engine: null, seats: 4, colour: "#a5673f", icon: "🧱", blurb: "Pull a block, stack it on top, and don't be the one who topples the tower.", tags: "tower blocks" },
  { id: "police_thief", title: "Police and Thief", category: "party", engine: null, seats: 6, colour: "#1c3f6e", icon: "🚓", blurb: "One thief, the rest police, round the streets of Lagos. Catch them or get away.", tags: "chase" },
  { id: "paintball", title: "Paintball", category: "sports", engine: "paintball", seats: 6, colour: "#e03131", icon: "🎯", blurb: "Red against blue in 3D, bots fill the empty places. First team to 25 splats wins.", tags: "shooter team splat" },
  { id: "penalties", title: "Penalty Shoot-out", category: "sports", engine: null, seats: 2, colour: "#2b8a3e", icon: "⚽", blurb: "Five kicks each. Pick your corner, beat the keeper.", tags: "football soccer" },
  { id: "table_tennis", title: "Table Tennis", category: "sports", engine: null, seats: 2, colour: "#e8590c", icon: "🏓", blurb: "Quick rallies, first to eleven.", tags: "ping pong" },
];

export const challengeGame = (id: string) => CHALLENGE_GAMES.find((g) => g.id === id);

/**
 * The games with their own full-screen table (docs/GAME_TABLES.md, docs/PARTY_GAMES.md): the ones
 * you can challenge one person to, from their card or a private chat.
 */
export const TABLE_GAMES = ["whot", "chess", "draughts", "paintball", "truth_dare", "impostor"] as const;
export type TableGame = (typeof TABLE_GAMES)[number];
export const isTableGame = (id: string): id is TableGame => (TABLE_GAMES as readonly string[]).includes(id);
/** Fewest players a game can be played with (Impostor needs three: with two, each knows who it is). */
export const minPlayers = (id: string) => (id === "impostor" ? 3 : 2);

/** "2 to 4 players", or "2 players". */
export const playersText = (g: ChallengeGame) => (g.seats > 2 ? `2 to ${g.seats} players` : "2 players");

/** Lower case, accents off ("Ayò" finds with "ayo"). */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The games to show in the picker: those matching what's typed (any word, in the name, the blurb,
 * the shelf or the tags) on a shelf ("all", a category, or "soon" for the ones coming), the ones
 * you can play first.
 */
export function findGames(query: string, shelf: ChallengeCategory | "all" | "soon" = "all", games: ChallengeGame[] = CHALLENGE_GAMES) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const label = (c: ChallengeCategory) => CHALLENGE_CATEGORIES.find((x) => x.id === c)?.label ?? c;
  return games
    .filter((g) => (shelf === "all" ? true : shelf === "soon" ? !g.engine : g.category === shelf))
    .filter((g) => {
      if (!words.length) return true;
      const hay = fold(`${g.title} ${g.blurb} ${label(g.category)} ${g.tags ?? ""} ${g.engine ? "" : "soon"}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => Number(!a.engine) - Number(!b.engine));
}

/**
 * Quick picks for what each player puts into the pool (naira): the host can type any amount too.
 * A stake is optional: 0 is a game just for fun, with nothing in the pool (the first pick).
 */
export const STAKES_NAIRA = [0, 1_000, 5_000, 20_000, 50_000];
/** The smallest and biggest stake (naira). The database takes up to ₥10,000 (game-db/070). */
export const STAKE_MIN_NAIRA = 1_000;
export const STAKE_MAX_NAIRA = 1_000_000;

const cents = (v: number) => Math.round(v * 100) / 100;
/** The smallest and biggest stake in mint (to the cent), for a region where a mint is `perMint` naira. */
export function stakeBounds(perMint: number) {
  const p = perMint > 0 ? perMint : 1_500;
  return { min: cents(STAKE_MIN_NAIRA / p), max: cents(STAKE_MAX_NAIRA / p) };
}
/** A stake in mint, to the cent, if it's 0 (no stake) or within the bounds (null when it isn't). */
export function cleanStake(mint: number, perMint: number): number | null {
  if (!Number.isFinite(mint)) return null;
  const v = cents(mint);
  if (v === 0) return 0;
  const { min, max } = stakeBounds(perMint);
  return v >= min && v <= max ? v : null;
}

/** Another challenge before the cooldown is over costs this (naira); the first one is free. */
export const CHALLENGE_FEE_NAIRA = 50_000;
/** How long before your next challenge is free again (between 5 and 10 minutes: time to join other people's). */
export const CHALLENGE_COOLDOWN_SECS = 8 * 60;
/** How long people have to join. */
export const JOIN_SECS = 60;
/** The winner takes this share of the pool (the rest is the house's). */
export const WINNER_SHARE = 0.9;
/** Challenges near enough to hear about (tiles, 100 m each). */
export const NEAR_TILES = 40;

/** Reputation for each challenge you hosted that was played to a winner (game-db/070 challenge_rep). */
export const REP_PER_HOSTED = 1;
/** Reputation for each challenge you won. */
export const REP_PER_WIN = 3;
/** The most reputation challenges can give in all. */
export const REP_MAX = 120;

/** Reputation from challenges: 1 for each one you hosted that was played, 3 for each win (up to 120 in all). */
export function challengeRep(hosted: number, won: number) {
  return Math.min(REP_MAX, Math.max(0, Math.round(hosted)) * REP_PER_HOSTED + Math.max(0, Math.round(won)) * REP_PER_WIN);
}

/**
 * What one finished challenge added to your reputation: your counts now (including it), and
 * whether you hosted it and won it. Less than the usual 1 + 3 near the 120 cap, 0 once there.
 */
export function challengeRepGained(hosted: number, won: number, hostedIt: boolean, wonIt: boolean) {
  return challengeRep(hosted, won) - challengeRep(hosted - (hostedIt ? 1 : 0), won - (wonIt ? 1 : 0));
}
