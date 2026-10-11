// What property costs in Lagos, in naira: land per m² by district (in districts.ts, landPrice)
// and building costs per m² of floor by kind. Rough market levels from memory, to be checked and
// tuned: change a number here and every value follows. One mint is worth perMint naira (owner to
// confirm: about $1, see docs/PROPERTY.md section 10).

import type { Prices } from "../../region.ts";

export const PRICES: Prices = {
  currency: "NGN",
  symbol: "₦",
  perMint: 1500,
  // The edges of the city.
  land: 40_000,
  build: {
    bungalow: 220_000,
    duplex: 300_000,
    rooming: 160_000,
    flats: 260_000,
    terrace: 280_000,
    apartments: 750_000,
    shops: 180_000,
    plaza: 300_000,
    mixed: 260_000,
    offices: 380_000,
    glass: 900_000,
    warehouse: 150_000,
    land: 0,
    farm: 2_000,
  },
};
