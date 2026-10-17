// What it costs to go places: the first visit to a place in each town (each hourly town is a
// new world), and a fare every time you board a train. A share goes into the prize pool (see
// game-db/035_fees_and_jobs.sql, which also keeps every fee between ₥0.10 and ₥5).
import { everyday } from "./world/price-level.ts";

/** First-visit fee by what the place is (CityRoom.type). Anything not listed: ₥0.50. */
const VISIT_FEE: Record<string, number> = {
  // The big sights.
  intlairport: 5, spaceport: 5, capitol: 5, megamall: 4, arena: 4, waterpark: 4, funfair: 4, museum: 3.5,
  // Grand places.
  mall: 3, hotel: 3, bank: 3, cathedral: 2.5, grandmosque: 2.5, twin: 3, spa: 3, airport: 3, campus: 2, medcentre: 1, market: 1.5, port: 2,
  stadium: 3, court: 2, boxing: 2, wrestling: 2, gym: 2, bigpark: 1.5, military: 2, power: 1, dam: 1.5, solar: 1, oilrig: 2,
  // Going out.
  club: 2, restaurant: 1.5, tower: 1.5, ferris: 1,
  // Everyday places.
  office: 1, hospital: 0.5, police: 0.5, fire: 0.5, clock: 0.5, station: 1, fuel: 0.3, school: 0.5, worship: 0.3, monument: 0.5,
  park: 0.2, plaza: 0.2, trees: 0.1, pond: 0.1, pitch: 0.3, playground: 0.1,
  // Someone's house.
  house: 0.1, home: 0.1,
};

/** What the first visit to a place of this type costs, ₥0.10 to ₥5. */
export function visitFee(type: string | undefined) {
  return VISIT_FEE[type ?? ""] ?? 0.5;
}

/** The fare for a train (each time you board): a bullet train, or the monorail. */
export const TRAIN_FARE = 1;
export const MONORAIL_FARE = 1.5;

/**
 * Riding something on a real map (Explore → Rides), at real Lagos prices (naira, each time you
 * board): the train on the real railway, a lagoon ferry, a BRT bus, a taxi, a Ferris wheel, a
 * water slide, a hot-air balloon flight, a helicopter tour over the city.
 */
const REAL_RIDE_FARE_NAIRA: Record<string, number> = {
  train: 2_000,
  boat: 2_500,
  bus: 500,
  car: 3_500,
  ferris: 3_000,
  slide: 1_500,
  balloon: 25_000,
  heli: 150_000,
};
/** Each ride's fare (naira) at Newtown's price level (src/lib/world/price-level.ts). */
export const RIDE_FARE_NAIRA: Record<string, number> = Object.fromEntries(Object.entries(REAL_RIDE_FARE_NAIRA).map(([k, v]) => [k, everyday(v)]));

/** A ride's fare in mint (Lagos: ₦1,500 a mint). */
export function rideFare(kind: string, nairaPerMint = 1_500) {
  const naira = RIDE_FARE_NAIRA[kind] ?? 0;
  return Math.round((naira / nairaPerMint) * 100) / 100;
}

/**
 * Club entry on a real map (naira, paid once and good for 24 hours): every club charges at the
 * door, ₦250k at most, ₦500k at the better ones, ₦1m for a VIP club and ₦10m at the very top
 * (one in ten). Which club charges what is fixed by where it is (the same for everyone). Never for
 * a home's party room. The database takes up to ₥10,000 a door (game-db/118_club_fees.sql).
 */
const CLUB_ENTRY_NAIRA = [250_000, 250_000, 250_000, 250_000, 500_000, 500_000, 500_000, 1_000_000, 1_000_000, 10_000_000].map(everyday);
/** What kind of night a club's price buys (shown at the door). */
export function clubTier(naira: number) {
  return naira >= 10_000_000 ? "Billionaire's row" : naira >= 1_000_000 ? "VIP club" : naira >= 500_000 ? "Premium club" : "Club";
}
/** door: a famous club's own price (Landmark.door, as real prices), else one picked by where it is. */
export function clubEntryNaira(place: string, type?: string, door?: number) {
  if (type === "home" || type === "house") return 0;
  if (door && door > 0) return everyday(door);
  let h = 7;
  for (const c of place) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CLUB_ENTRY_NAIRA[h % CLUB_ENTRY_NAIRA.length];
}
/** The same in mint. */
export function clubEntryMint(place: string, type?: string, nairaPerMint = 1_500, door?: number) {
  return Math.round((clubEntryNaira(place, type, door) / nairaPerMint) * 100) / 100;
}
/** How long a club's entry lasts once paid. */
export const CLUB_ENTRY_MS = 24 * 3_600_000;

/**
 * Playing a game (Games, the shooting range, paintball, a board game against someone): every go
 * costs money, at real Lagos prices (naira). Games never pay money out. A heist step or a job
 * shift is free (it's part of something else). The database takes up to ₥20 a game
 * (game-db/121_games_cost.sql).
 */
const GAME_FEE_NAIRA: Record<string, number> = {
  "shooting-range": 5_000,
  paintball: 5_000,
  chess: 2_000,
  draughts: 2_000,
  poker: 3_000,
  blackjack: 3_000,
};
const GAME_FEE_DEFAULT_NAIRA = 1_000;
export function gameFeeNaira(game: string) {
  return everyday(GAME_FEE_NAIRA[game] ?? GAME_FEE_DEFAULT_NAIRA);
}
/** The same in mint. */
export function gameFeeMint(game: string, nairaPerMint = 1_500) {
  return Math.round((gameFeeNaira(game) / nairaPerMint) * 100) / 100;
}
