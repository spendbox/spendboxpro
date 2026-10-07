# Hide & Seek

One shared world, played in rounds: hiders stake coins and are dropped on a random tile
of a hidden grid; seekers pay coins to search tiles. A seed bot hides in every round.
The full rule book is the "Hide & Seek Grid Game: Rules Spec" doc.

## How a round works

1. **Hiding window (10 min).** Anyone joins as a seeker; players who have finished one round
   as a seeker can hide (stake 100 coins). Each hider adds 10 tiles to a 20×20 starting map.
2. **Search (60 min).** Hiders are placed at random. Seekers search tiles (first search each
   day is free, then the price rises as the map fills) or buy a sweep. Hiders get one free
   move and one paid move (100 coins); the tile they leave is announced.
3. **Payout.** Finding a hider pays the finder 80% of the stake (20% for new hiders). Finding
   the seed bot pays 200. Survivors get their stake back plus 60% of the pool; seekers share
   20% by real coins spent; 20% burns.

## Setup

1. **Database.** In Supabase → SQL Editor, run `game-db/001_hide_and_seek.sql` and then
   `game-db/002_email_codes_and_city.sql`, once each, on an empty database. In Supabase → Database → Extensions, switch on **pg_cron** first if you
   can: the file then schedules the round clock to run every minute. (Without it, the clock
   still moves whenever someone has the game open.)
2. **Email codes.** The app sends its own 6-digit sign-in codes through Resend, so nothing
   needs setting up in Supabase. Just make sure `RESEND_API_KEY` and `EMAIL_FROM` (an address on
   your Resend-verified domain) are set in Vercel.
3. **Vercel environment variables** (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`. The daily job (`vercel.json`) tops broke players up to 100 coins.

## The city

The board is a small 3D city (three.js, `src/app/play/city-view.tsx`). Tiles spiral out from
the centre, so new tiles (10 per hider) appear on the edge and rise out of the ground. What
stands on each tile is decided in `src/lib/city/layout.ts` from the round number, so each
round has its own street grid, downtowns, parks and colours.

## Tuning

Every number (stake, prices, shares, timings, bounty) is a row in the `game_settings`
table. Change it in Supabase → Table Editor; it applies from the next action.
Coin supply per day: `select * from coin_supply_daily;`

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
`npm run test:db` runs the rules test against a throwaway Postgres (`TEST_DATABASE_URL`).
