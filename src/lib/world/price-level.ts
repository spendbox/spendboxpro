// Newtown's prices against real Lagos prices (docs/MONEY.md, "Prices"). Money in the game comes
// big (a daily gift of ₦400k–6.4m, stakes up to ₦5m), so prices follow: everyday things (rides,
// trip fares, club entry, pranks, fines, bribes) cost ten times their real price; things you own
// (shop items, cars, homes: already big) three times. Change a number here and they all follow.

/** Rides, trip fares, club entry, pranks, fines and bribes: times real Lagos prices. */
export const EVERYDAY_PRICES = 10;
/** Shop items, cars and homes: times real Lagos prices (homes: on top of the game's own land scale). */
export const OWNED_PRICES = 3;

/** An everyday price (naira), at Newtown's level. */
export const everyday = (naira: number) => naira * EVERYDAY_PRICES;
