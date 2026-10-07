# Hide & Seek

The home page is the live city: anyone can watch a round without signing in, and sign in to
play. One shared world, played in rounds: hiders stake coins and are dropped on a random tile
of a hidden grid; seekers pay coins to search tiles. A seed bot hides in every round.
The full rule book is the "Hide & Seek Grid Game: Rules Spec" doc.

## How a round works

The game is 18+ (players give their date of birth when they sign up). The UI calls seekers
"hunters"; the database still says `seeker`.

1. **Hiding window (10 min).** Anyone joins as a hunter; players who have finished one round
   as a hunter can hide (stake 100 coins). Each hider adds 20 tiles to a 20×20 starting city.
2. **The hunt (60 min).** Hiders are dropped on random tiles. Hunters search tiles (first
   search each day is free, then the price rises as more of the city is searched; each search
   has a short cooldown that doubles if you search too fast, up to 30 s) or send a drone to
   sweep an area (yes/no only, 10-second cooldown, dearer every time anyone sweeps; hiders
   inside are warned and pinned for 30 seconds). Moving costs 50 coins at the start of a round
   and gets dearer with every move anyone makes; after a move a hider waits 5 minutes; never
   back to a tile they've left; everyone sees the tile they left. Hiders see every searched
   tile and can't move onto one; hunters see the most recent 70%. Each hunter's last 5 sweeps
   stay active as secret traps.
3. **Levels.** After enough rounds (2 × level), players spend coins (50 × level, burned) to
   level up. Level 3: decoy (hiders place a fake hider on a chosen spot; drones read it as
   "yes", a hunter who searches it gets nothing; from 20 coins). Level 5: shield (when found,
   the hunter is paid and the stake is lost, but the hider teleports nearby and plays on; no
   moving while it's up; from 100 coins). Level 10: big search (hunters search a 3×3 area for
   7 searches). Level 20: respawn (caught in the first 30 minutes? 300 coins, burned, to drop
   back in; announced to everyone). Decoys and shields are one per game and each costs half
   again more than your last. Catching a level-5+ player pays a bonus of 25 coins per 5 levels.
4. **Payout.** Finding a hider pays the finder 80% of the stake (20% for new hiders). Finding
   the bot (a new name every round; it moves at most 3 times, only when a sweep catches it, and
   for free) pays 200. Every pool starts at 0 (nothing carries over, though a brand can sponsor
   it). Search, sweep, move, shield and decoy fees (real coins) go into it. If anyone survives:
   survivors get their stake back plus 80% of the pool, hunters share 10% by real coins spent,
   10% burns. If everyone is found: hunters share 80%, the hiders who played share 10%, 10% burns.
5. **Passive income.** Players under 100 coins earn coins back over time, up to 100 in 24
   hours. Opening a billboard ad pays 2 coins (10 a day).

## Setup

1. **Database.** In Supabase → SQL Editor, run `game-db/001_hide_and_seek.sql`,
   `game-db/002_email_codes_and_city.sql`, `game-db/003_names_pins_chat.sql` and
   `game-db/004_moves_sweeps_bot_ads.sql`, `game-db/005_traps_freezes_notifications.sql`,
   `game-db/006_avatars_badges_balloons.sql`, `game-db/007_shields_payouts_passive.sql`,
   `game-db/008_badge_collection.sql`, `game-db/009_levels_powerups.sql`,
   `game-db/010_ads_sponsors.sql`, `game-db/011_badges_hard.sql` and `game-db/012_age_codes.sql`,
   in order, once each, on an empty database. In Supabase → Database → Extensions, switch on **pg_cron** first if you
   can: the file then schedules the round clock to run every minute. (Without it, the clock
   still moves whenever someone has the game open.)
2. **Email codes.** The app sends its own 4-digit sign-in codes through Resend, so nothing
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
(100 of them, up to legendary ones like Phantom and Immortal; rules in
`game-db/008_badge_collection.sql` and `game-db/011_badges_hard.sql`) are awarded when a round ends and can be shared as a picture. During the hunt, a hot-air
balloon carrying coins sometimes floats by for a player: tapping it gives 5 coins, at most
10 a day (logged as `balloon` in `coin_supply_daily`).

## Sign-in and chat

"Enter world" asks for an email. Returning players type their 6-digit PIN; new players get
a 4-digit email code (sent by the app through Resend), then pick a name and PIN. "Forgot
PIN" emails a code and lets you set a new one. 5 wrong PINs locks it for 15 minutes. Chat has a public City room and private
messages, with text and voice notes, a People list showing who's hiding or seeking, and a
few teasing messages from the bot; it belongs to one round, so a new map starts a new
chat (old chats and voice notes are deleted by the daily job).

## Ads and sponsored prize pools

Brands book at **/advertise** (no account needed) and pay with Paystack. Two products:

- **Billboard ad:** 1 slot = 1,000 views of the billboard across every city within 7 days
  (₦5,000 a slot, 1–50 slots). Every billboard rotates through the live ads; ads that are behind
  schedule are shown more, and an ad keeps showing until it has every view it paid for. Players
  who tap a billboard earn 2 coins (10 times a day at most, logged as `ad_reward`). Each ad
  gets a report email every morning.
- **Sponsor a prize pool:** from ₦5,000 (₦5 = 1 coin). The coins go into the current round if it's
  still in its hiding window and has no sponsor, otherwise into the next free round (one sponsor
  per round, shown as "Prize pool by …").

Setup: run `game-db/010_ads_sponsors.sql` once (it also makes the public `ads` storage bucket),
then add `PAYSTACK_SECRET_KEY`, `ANTHROPIC_API_KEY` and `ADMIN_EMAIL` in Vercel (see
`.env.example`). In Paystack → Settings → API Keys & Webhooks, set the **Webhook URL** to
`https://<your site>/api/paystack/webhook`.

After payment, Claude checks each ad against the policy (`/advertise/policy`). Approved ads go
live at once. Rejected ads: the advertiser is told why and that they'll be refunded; you get an
email, so refund it in Paystack (Transactions → the reference → Refund). If the check can't run,
the ad is **held** and you get an email: to approve it, open Supabase → Table Editor → `ads`,
find it and change `status` to `live` (its 7 days start then); to turn it down, set `rejected`
and refund. Prices and limits are rows in `game_settings` (`ad_slot_price_ngn`,
`ad_views_per_slot`, `ad_open_coins`, `sponsor_coins_per_ngn`, …).

## Tuning

Every number (stake, prices, shares, timings, bounty) is a row in the `game_settings`
table. Change it in Supabase → Table Editor; it applies from the next action.
Coin supply per day: `select * from coin_supply_daily;`

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
`npm run test:db` runs the rules test against a throwaway Postgres (`TEST_DATABASE_URL`).
