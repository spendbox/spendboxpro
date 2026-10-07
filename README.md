# Hide & Seek

The home page is the live city: anyone can watch a round without signing in, and sign in to
play. One shared world, played in rounds: hiders stake coins and are dropped on a random tile
of a hidden grid; seekers pay coins to search tiles. A seed bot hides in every round.
The full rule book is the "Hide & Seek Grid Game: Rules Spec" doc.

## How a round works

1. **Hiding window (10 min).** Anyone joins as a seeker; players who have finished one round
   as a seeker can hide (stake 100 coins). Each hider adds 20 tiles to a 20×20 starting city.
2. **The hunt (60 min).** Hiders are dropped on random tiles. Seekers search tiles (first
   search each day is free, then the price rises as more of the city is searched) or send a
   drone to sweep an area (yes/no only, 10-second cooldown, dearer every time anyone sweeps,
   and the hiders inside are warned and pinned for 1 minute). Hiders can move any number of times: 100 coins a move,
   one a minute, never back to a tile they've left; everyone sees the tile they left. Hiders
   see every searched tile and can't move onto one; seekers see the most recent 70%. A spot
   can be searched again (it costs a search). A sweep freezes the hiders inside for 1
   minute (they see a countdown), and each seeker's last 5 sweeps stay active as secret traps: a hider who moves
   into one is detected and both sides get a notification.
3. **Shields.** A hider can buy one shield per round (100 coins). While it's up they can't
   move; when they're found, the seeker is paid and the stake is lost, but the hider is
   teleported to a free spot nearby and plays on.
4. **Payout.** Finding a hider pays the finder 80% of the stake (20% for new hiders). Finding
   the bot (a new name every round; it moves at most 3 times, only when a sweep catches it, and
   for free) pays 200. Every pool starts at 0 (nothing carries over). Search, sweep, move and
   shield fees (real coins) go into it. If anyone survives: survivors get their stake back plus
   80% of the pool, seekers share 10% by real coins spent, 10% burns. If everyone is found:
   seekers share 80%, the hiders who played share 10%, 10% burns.
5. **Passive income.** Players under 100 coins earn coins back over time, up to 100 in 24
   hours (replaces the old daily top-up).

## Setup

1. **Database.** In Supabase → SQL Editor, run `game-db/001_hide_and_seek.sql`,
   `game-db/002_email_codes_and_city.sql`, `game-db/003_names_pins_chat.sql` and
   `game-db/004_moves_sweeps_bot_ads.sql`, `game-db/005_traps_freezes_notifications.sql`,
   `game-db/006_avatars_badges_balloons.sql`, `game-db/007_shields_payouts_passive.sql` and
   `game-db/008_badge_collection.sql`,
   in order, once each, on an empty database. In Supabase → Database → Extensions, switch on **pg_cron** first if you
   can: the file then schedules the round clock to run every minute. (Without it, the clock
   still moves whenever someone has the game open.)
2. **Email codes.** The app sends its own 6-digit sign-in codes through Resend, so nothing
   needs setting up in Supabase. Just make sure `RESEND_API_KEY` and `EMAIL_FROM` (an address on
   your Resend-verified domain) are set in Vercel.
3. **Vercel environment variables** (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`. The daily job (`vercel.json`) pays passive income to players who haven't been online.

## The city

The board is a small 3D city (three.js, `src/app/play/city-view.tsx`). Tiles spiral out from
the centre, so new tiles (20 per hider) appear on the edge and rise out of the ground. What
stands on each tile is decided in `src/lib/city/layout.ts` from the round number, so each
round has its own street grid, downtowns, river, lakes, parks and colours. Each round's city is
named after a real place (Ikeja, Lekki, Abuja, Chicago, London, Accra, Nairobi, Johannesburg…;
see `src/lib/city/places.ts`) with matching street names, and every spot has an address like
"14 Adekunle Street" or "Allen Ave & Obafemi Cl".

Big 2×2 landmarks: shopping malls, twin towers, domed museums, funfairs, markets, arenas,
university campuses, hotels with rooftop pools, solar farms. One-of-a-kind buildings:
skyscrapers in five shapes, three kinds of office block and house, hospitals, clock towers,
construction sites with turning cranes, water towers, radio masts, fuel stations.

Tiles: roads, humped bridges, a river (about one city in three), the odd lake, ponds,
skyscrapers, office blocks, houses, parks, woods, plazas with fountains, Ferris wheels,
stadiums, wind turbines, and one billboard per 10×10 block (tap it to advertise; requests
land in the `ad_requests` table).
Moving: cars, boats, birds, clouds, hot-air balloons, planes, turning wheels and turbines.
Little scenes: a person, soldier or dog checks each searched tile (a "?" if nobody's there),
a drone scans swept areas, police lights flash at a catch.

Atmosphere: the hour runs morning to night (the next round night to morning) with street
lights, lit windows and stars after dark, random weather (rain, fog, cloud) per round, and
optional synthesized city sounds (`src/lib/city/sky.ts`, `src/app/play/sound.ts`). Airports,
sea ports, military camps and police stations appear too, and see-through construction sites
mark the next spots the city will grow into.

## Avatars, badges and coin balloons

Every player has a face they can edit from the menu (`src/lib/avatar.ts`); it marks them on
the map and shows up when they're caught. Badges (Survivor, Ghost, Hat-trick, Bot Hunter…)
(50 of them, from Survivor and Hat-trick to Week Warrior and Night Owl; rules in
`game-db/008_badge_collection.sql`) are awarded when a round ends and can be shared as a picture. During the hunt, a hot-air
balloon carrying coins sometimes floats by for a player: tapping it gives 5 coins, at most
10 a day (logged as `balloon` in `coin_supply_daily`).

## Sign-in and chat

"Enter world" asks for an email. Returning players type their 6-digit PIN; new players get
a 6-digit email code (sent by the app through Resend), then pick a name and PIN. "Forgot
PIN" emails a code and lets you set a new one. 5 wrong PINs locks it for 15 minutes. Chat has a public City room and private
messages, with text and voice notes, a People list showing who's hiding or seeking, and a
few teasing messages from the bot; it belongs to one round, so a new map starts a new
chat (old chats and voice notes are deleted by the daily job).

## Tuning

Every number (stake, prices, shares, timings, bounty) is a row in the `game_settings`
table. Change it in Supabase → Table Editor; it applies from the next action.
Coin supply per day: `select * from coin_supply_daily;`

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
`npm run test:db` runs the rules test against a throwaway Postgres (`TEST_DATABASE_URL`).
