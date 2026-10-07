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

1. **Database.** In Supabase → SQL Editor, run `game-db/001_hide_and_seek.sql` once on an
   empty database. In Supabase → Database → Extensions, switch on **pg_cron** first if you
   can: the file then schedules the round clock to run every minute. (Without it, the clock
   still moves whenever someone has the game open.)
2. **Email codes through Resend.** Supabase → Authentication → SMTP Settings: host
   `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key,
   sender = an address on your Resend-verified domain. Then Authentication → Email Templates
   → Magic Link: put the code in the email with `{{ .Token }}`.
3. **Vercel environment variables** (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `CRON_SECRET`. The daily job (`vercel.json`) tops broke players up to 100 coins.

## Tuning

Every number (stake, prices, shares, timings, bounty) is a row in the `game_settings`
table. Change it in Supabase → Table Editor; it applies from the next action.
Coin supply per day: `select * from coin_supply_daily;`

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
`npm run test:db` runs the rules test against a throwaway Postgres (`TEST_DATABASE_URL`).
