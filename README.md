# Hide & Seek

One shared world, played in rounds: hiders stake coins and are dropped on a random tile
of a hidden grid; seekers pay coins to search tiles. A seed bot hides in every round.
The full rule book is the "Hide & Seek Grid Game: Rules Spec" doc.

## How a round works

1. **Hiding window (10 min).** Anyone joins as a seeker; players who have finished one round
   as a seeker can hide (stake 100 coins). Each hider adds 20 tiles to a 20×20 starting city.
2. **The hunt (60 min).** Hiders are dropped on random tiles. Seekers search tiles (first
   search each day is free, then the price rises as more of the city is searched) or send a
   drone to sweep an area (yes/no only, 10-second cooldown, dearer every time anyone sweeps,
   and the hiders inside are warned). Hiders can move any number of times: 100 coins a move,
   one a minute, never back to a tile they've left; everyone sees the tile they left. Moving
   onto a tile that was already searched (and hasn't unlocked) gets you caught. Players only
   see the most recent 70% of searched tiles.
3. **Payout.** Finding a hider pays the finder 80% of the stake (20% for new hiders). Finding
   the bot (a new name every round; it moves and flees sweeps) pays 200. Search, sweep and move
   fees (real coins) go into the survivor pool. Survivors get their stake back plus 60% of the
   pool; seekers share 20% by real coins spent; 20% burns.

## Setup

1. **Database.** In Supabase → SQL Editor, run `game-db/001_hide_and_seek.sql`,
   `game-db/002_email_codes_and_city.sql`, `game-db/003_names_pins_chat.sql` and
   `game-db/004_moves_sweeps_bot_ads.sql`, in order, once each, on an empty database. In Supabase → Database → Extensions, switch on **pg_cron** first if you
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
the centre, so new tiles (20 per hider) appear on the edge and rise out of the ground. What
stands on each tile is decided in `src/lib/city/layout.ts` from the round number, so each
round has its own street grid, downtowns, river, lakes, parks and colours.

Tiles: roads, humped bridges, a river (about one city in three), the odd lake, ponds,
skyscrapers, office blocks, houses, parks, woods, plazas with fountains, Ferris wheels,
stadiums, wind turbines, and one billboard per 10×10 block (tap it to advertise; requests
land in the `ad_requests` table).
Moving: cars, boats, birds, clouds, hot-air balloons, planes, turning wheels and turbines.
Little scenes: a person, soldier or dog checks each searched tile (a "?" if nobody's there),
a drone scans swept areas, police lights flash at a catch.

## Sign-in and chat

"Enter world" asks for an email. Returning players type their 6-digit PIN; new players get
a 6-digit email code (sent by the app through Resend), then pick a name and PIN. "Forgot
PIN" emails a code and lets you set a new one. 5 wrong PINs locks it for 15 minutes. Chat has a public City room and private
messages, with text and voice notes; it belongs to one round, so a new map starts a new
chat (old chats and voice notes are deleted by the daily job).

## Tuning

Every number (stake, prices, shares, timings, bounty) is a row in the `game_settings`
table. Change it in Supabase → Table Editor; it applies from the next action.
Coin supply per day: `select * from coin_supply_daily;`

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
`npm run test:db` runs the rules test against a throwaway Postgres (`TEST_DATABASE_URL`).
