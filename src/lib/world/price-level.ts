// Newtown's prices against real Lagos prices (docs/MONEY.md, "Prices"). Prices are real: a bus is
// ₦500, a phone ₦350k, a Camry ₦22m, so money means what it means in Lagos. Money in the game is
// kept modest instead (a daily gift of ₦5k–50k, stakes up to ₦50k). These levers can lift prices
// for a whole group at once if the game ever needs it: 1 is real prices.

/** Rides, trip fares, club entry, pranks, fines and bribes: times real Lagos prices. */
export const EVERYDAY_PRICES = 1;
/** Shop items, cars and homes: times real Lagos prices (homes: on top of the game's own land scale). */
export const OWNED_PRICES = 1;

/** An everyday price (naira), at Newtown's level. */
export const everyday = (naira: number) => naira * EVERYDAY_PRICES;
