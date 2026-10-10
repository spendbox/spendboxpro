// What it costs to go places: the first visit to a place in each town (each hourly town is a
// new world), and a fare every time you board a train. A share goes into the prize pool (see
// game-db/035_fees_and_jobs.sql, which also keeps every fee between ₥0.10 and ₥5).

/** First-visit fee by what the place is (CityRoom.type). Anything not listed: ₥0.50. */
const VISIT_FEE: Record<string, number> = {
  // The big sights.
  intlairport: 5, spaceport: 5, capitol: 5, megamall: 4, arena: 4, waterpark: 4, funfair: 4, museum: 3.5,
  // Grand places.
  mall: 3, hotel: 3, bank: 3, cathedral: 2.5, grandmosque: 2.5, twin: 3, spa: 3, airport: 3, campus: 2, market: 1.5, port: 2,
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
