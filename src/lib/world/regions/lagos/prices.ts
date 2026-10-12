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
  // What land costs in the game against real Lagos prices (districts.ts has the real ones, which
  // also say how grand an area's buildings are): a tenth, so a first home is within reach. The
  // game should never feel harder than real life.
  landScale: 0.1,
  // Homes and small shops cost far less to build than real life (a first home is within reach);
  // offices and plazas about half; glass towers and high-rise apartments at real prices.
  build: {
    bungalow: 55_000,
    duplex: 75_000,
    rooming: 30_000,
    flats: 40_000,
    terrace: 55_000,
    apartments: 750_000,
    shops: 60_000,
    plaza: 150_000,
    mixed: 60_000,
    offices: 190_000,
    glass: 900_000,
    warehouse: 50_000,
    land: 0,
    farm: 2_000,
  },
};
