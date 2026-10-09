# Newtown

Live at [newtown.world](https://newtown.world). Contact: hello@newtown.world. The in-game currency is
**mint** (the database still calls it `coins`; older database messages are reworded on the way
to the screen by `mintify` in `src/lib/brand.ts`).

The home page is the live city: anyone can watch a game without signing in, and sign in to
play. One shared world, played in hourly games: ghosts stake mint and light up on the map;
hunters (everyone else) challenge them to quick duels (`game-db/029_ghost_duels.sql`).

## How a game works

The game is 18+ (players give their date of birth when they sign up). The UI says "ghosts" and
"hunters"; the database still says `hider` and `seeker`. Games run on the hour (UTC): every game
starts at the top of an hour and ends on the next hour mark (the clock turns red and beeps in the
last 30 seconds, and beeps in the last 30 seconds before the hunt starts). Tapping a building
goes inside (from a hot-air balloon too), and Explore holds the rides (hot-air balloons, trains, buses, cars, boats, Ferris wheels, water slides) and
sport, plus private messages. Explore stays locked while the town is still a building site
(the join window). The house button at the bottom flies the camera to your house.

1. **Join window (the first 2 minutes of the hour, `join_minutes`).** Anyone signed in can join as
   a ghost (stake `hider_stake`, 100 mint). Everyone else is a hunter; there's nothing to join.
   Each ghost adds 20 tiles to a 20×20 starting city. The bot doesn't play (part 30): every ghost
   is a real person, and a game can have none.
2. **The hunt (until the next hour mark).** Each ghost is put on a random spot and lights up on the
   map for everyone (blue: free, orange: in a duel, gold: golden). Tapping a light opens the
   ghost's card (stats this game and their record, chat, challenge). Nobody searches, sweeps,
   sends drones or moves any more.
3. **Duels.** A challenge costs `duel_fee` (10 mint, held until the duel ends). The ghost gets a
   pop-up wherever they are and has `duel_answer_seconds` (30) to answer; no answer is a loss.
   The duel is one quick game (Rock-Paper-Scissors for now): first to `duel_first_to` (2), at most
   `duel_seconds` (60); level when time runs out goes to the ghost. Hunter wins: the fee back plus
   `finder_share` (80%) of a slice of the ghost's stake (stake ÷ `ghost_out_losses`), the rest of
   the slice to the prize pool. Ghost wins: the fee goes into the prize pool. One duel at a time
   for each player; hunters wait `duel_cooldown_seconds` (30) between duels.
4. **Golden and out.** `ghost_golden_wins` (3) wins: golden (safe, stake back, in the pool).
   `ghost_out_losses` (3) losses: out (light gone, stake gone). Hunters with `hunter_pool_wins`
   (20) wins in one game enter the pool. At the end, golden ghosts and those hunters share 90% of
   the pool equally (10% burns; with nobody in the pool, it all burns); ghosts still in get their
   remaining stake back; duels still going are called off (fee back).
   Levels: players earn XP (10 for playing a game, 10 for finishing a side quest, 5 for each
   streak day) and spend mint (burned) to level up, up to level 100. Below level 20 each level
   takes 15 XP and 10 × level mint; from 20 on, 30 XP plus 5 more each level (425 at 99) and
   50 × (level − 15) mint (`game-db/027_streaks_levels.sql`). The old power-ups (decoy, shield, big
   search, respawn) belonged to hide-and-seek and are no longer offered.
5. **Passive income.** Players under 100 mint earn mint back over time, up to 100 in 24
   hours; each level adds 25 to both numbers, up to level 40 (1,075). Opening a billboard ad pays 5 mint (5 a day).
   Anyone holding 10,000+ mint is a "big fish". Players can give mint to each other and
   spray it on dancers in clubs (capped per day; transfers, never new mint).
6. **World events.** Every hunt gets 2–4 of 100 events (`src/lib/world-events.ts`, mirrored in
   `world_event_kinds`): emergencies, weather, parties, transport trouble and mysteries to watch,
   some with mint to grab (first come, first served), the golden balloon, quiet spells and the
   final countdown. The 10 twists about hiding and hunting (fog of war, double mint on catches,
   ghost amnesty, drone storm, lucky street, bot tantrum, spotlight, bounty board, safe house,
   blackout) are switched off by part 29 (`world_event_kinds.enabled`), and so are the 12 side
   quests about hiding and hunting.

## Setup

1. **Database.** In Supabase → SQL Editor, run `game-db/001_hide_and_seek.sql`,
   `game-db/002_email_codes_and_city.sql`, `game-db/003_names_pins_chat.sql` and
   `game-db/004_moves_sweeps_bot_ads.sql`, `game-db/005_traps_freezes_notifications.sql`,
   `game-db/006_avatars_badges_balloons.sql`, `game-db/007_shields_payouts_passive.sql`,
   `game-db/008_badge_collection.sql`, `game-db/009_levels_powerups.sql`,
   `game-db/010_ads_sponsors.sql`, `game-db/011_badges_hard.sql`, `game-db/012_age_codes.sql`,
   `game-db/013_ads_v2.sql`, `game-db/014_chat_rooms.sql`, `game-db/015_ghost_rules.sql`,
   `game-db/016_place_rooms.sql`, `game-db/017_world_events.sql`, `game-db/018_npcs.sql`,
   `game-db/019_activities.sql`, `game-db/020_sports.sql`, `game-db/021_hourly_rounds.sql`,
   `game-db/022_pool_and_ads.sql`, `game-db/023_houses.sql`, `game-db/024_play_style.sql`,
   `game-db/025_big_towns.sql`, `game-db/026_friends.sql`, `game-db/027_streaks_levels.sql`,
   `game-db/028_hugs_gifts.sql` and `game-db/029_ghost_duels.sql`, in order, once each, on an empty database. In Supabase → Database → Extensions, switch on **pg_cron** first if you
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

Big landmarks of 3×3 and 4×4 tiles (`MEGAS` in `src/lib/city/layout.ts`, drawn in
`src/app/play/city/megas.ts`): the football stadium (a bowl of tiered stands round a striped
pitch, a white roof ring with an oval opening, floodlights), the domed capitol in its gardens
with a reflecting pool and a statue, and mega malls under glass. They take over the streets in
their spot (the streets end at their plaza), and more appear as the town grows: a second
stadium, more malls and capitols further out, plus extra downtowns with supertall towers, so a
big town turns into a megacity. Big lakes (crossed by causeways, with jetties and boats) and,
for really big towns, the sea along one side. The railway sweeps across in gentle S-bends with
a glass-vaulted grand station (`src/app/play/city/trains.ts`). Suburbs get winding lanes and,
every 6×6 lots, a school, a mosque or church, a five-a-side pitch, a playground or a monument
(`src/app/play/city/neighbourhood.ts`).

Round the town: flat farmland first (the hills start further out and the mountains stay on the
horizon, so a ride out of town never heads into mountains). The railway runs on past the town
into the countryside to a little halt at each end. While you're on a ride, fields, hedges,
farms, villages, trees and animals are made around you as you go, in the style of the town's
country (palms and red earth in Nigeria and Ghana, acacias, round huts and giraffes in Kenya
and South Africa, hedges and sheep in Britain, barns and silos in America), from a few pooled
instanced meshes (`src/app/play/city/countryside.ts`). Each town also has three famous
places from its own city or country standing just outside it, with name labels
(`src/app/play/city/landmarks.ts`): the Third Mainland Bridge, the Lekki-Ikoyi Link Bridge,
the National Theatre, Zuma Rock, Cocoa House, Olumo Rock, the Kano dye pits, the Black Star
Gate, Kakum's canopy walkway, Cape Coast Castle, KICC, Nairobi National Park, Lake Nakuru's
flamingos, Fort Jesus, the Nelson Mandela Bridge, the Soweto Towers, Moses Mabhida Stadium,
Bo-Kaap, the Union Buildings, Big Ben, the London Eye, Tower Bridge, Stonehenge, Edinburgh
Castle, the Royal Liver Building, the Statue of Liberty, the Space Needle, the Hollywood Sign,
Cloud Gate, Navy Pier and a Route 66 diner. Each is baked into a few meshes, so they're cheap.

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

Inside places: tap the floor to walk, tap glowing things to use them. Seats (one person, 3
minutes at most; sitting makes a side quest more likely), mini games (archery, darts, arcade,
pool, cards, trivia, dice and rock-paper-scissors duels, karaoke, piano, photo booth), menus to
order from, a DJ deck and dance floor in clubs. In a club you can dance: you're drawn dancing
in the middle of the floor (a glowing ring under you, the camera circling you; drag to look
round) among a crowd, the regulars and the other players dancing there, all on the beat of the
club music (120 a minute) with the floor lights and a mirror ball's light spots. Eight moves
(groove, hands up, shaku shaku, disco point, body wave, gwara gwara, legwork, spin); pick a
partner (a player or a regular) to dance face to face. Your move and partner are shared through
the place's activity channel (`src/app/play/dance-bar.tsx`, `src/app/play/city/dance-moves.ts`).

People (`src/app/play/city/figures.ts`): one skinned mesh per person on a 12-bone skeleton
(hips, waist, chest, head, two-part arms and legs), so a whole body is one draw call plus the
face. Natural proportions, a shaped head with nose and ears, the face from their avatar, hair
in their style, hands with thumbs, knees, shoes with soles, and clothes from their avatar's
outfit (hoodies, collars, jackets, agbadas, jerseys, overalls, stripes, camo...) or their job.
They breathe, look round, talk with their hands, sit with bent knees and dance with their legs.
Other real players in your place are drawn standing about (or sitting, or dancing), and when
one is there a card pops up saying who (`src/app/play/people-here.tsx`).

Friends (`game-db/026_friends.sql`, `src/app/play/friends-sheet.tsx`): add people by name, from
the People list or the "real people here" card; they say yes (or ask back) and you're friends
in every new town until one of you removes the other. The town shows friends' faces over the
places they're in, you get a nudge when a friend goes somewhere (Join takes you there), and
each new town tells you which friends are in it too.

NPCs ("regulars", marked NPC) have their own
personalities: some gossip about where ghosts are, some give mint or side quests. Side quests
(52 roles such as thief, detective, courier, DJ; `src/lib/quests.ts`) reward mint and a special
move (steal a little from a player, a hint, a free search…). Code: `src/app/play/activities/`,
`src/lib/npc/`, `game-db/018_npcs.sql`, `game-db/019_activities.sql`.

Sport: football at stadiums, basketball, boxing and wrestling at arenas. Matches run on a fixed
schedule and are simulated on the server from a secret seed (`src/lib/sports/`), so no two are
alike and nobody can know the result early; the browser only ever gets the match up to "now"
(`/api/sports/feed`). Tickets cost mint; bets are pari-mutuel: winners share the pot,
the sportsbook takes 10%, everyone is refunded if nobody backed the winner (`game-db/020_sports.sql`).
Ticket money and the sportsbook's cut go into the prize pool of the game that's on (burned if
none is), like respawns (`game-db/022_pool_and_ads.sql`). Optional
env var `SPORTS_SECRET` (falls back to `SUPABASE_SECRET_KEY`).

## Billboards

Each billboard shows a different ad when several brands are advertising, and every viewer gets
their own shuffled order (so two people looking at the same board usually see different ads).
Brands with more budget left come up a little more often. Boards change every few seconds and
the mix is fetched again every 5 minutes. Hot-air balloons carry no ads.

## Players' houses (phase 1, free)

From the menu, a player builds a house from what the city already draws: a style
(cottage, bungalow, modern, duplex, villa), wall and roof colours, a room style inside (living
room, lounge, studio, party room, dining room) and a name for the sign (`src/lib/houses.ts`,
`src/app/play/houses/`). Switching on "Show my house in the game" puts it into every new game:
when a game is created the database takes a snapshot of the houses that are on (longest-waiting
first, at most `houses_per_round_max`, 500) and adds 5 hiding spots per house to the town
(`tiles_per_house`; `game-db/023_houses.sql`). Switching off takes effect from the next game.
Houses stand on ordinary lots near the middle of town, never side by side when there's room
(`src/lib/city/houses.ts`); each one is a place you can go into, with its room style on the
ground floor. Free for now: no mint moves.

## Play styles

At the end of each game every player gets one of 12 play styles (The Explorer, The Tourist, The
Detective, The Phantom, The Escape Artist, The Socialite, The Party Animal, The Foodie, The High
Roller, The Master Thief, The Gamer, The Sports Fan), with a teasing line, the numbers behind it
and a share picture. The phone keeps a small diary of the game (buildings, rides, food, time in
the club…); the server adds what it knows for sure (searches, catches, bets, gifts…), picks the
style and adds it to the player's lifetime mix, shown as bars in "My style"
(`src/lib/play-style.ts`, `src/app/play/style/`, `game-db/024_play_style.sql`).

## Big towns

Nothing in a game scans every spot of the town any more (`game-db/021_hourly_rounds.sql`,
`game-db/025_big_towns.sql`), and a town bigger than about 6,500 spots only draws the 81×81
square around the camera (moving with it), so a 2,000,000-spot town costs the same to draw as
a 6,500-spot one.

## Avatars, badges and mint balloons

Every player has a face they can edit from the menu (`src/lib/avatar.ts`); it marks them on
the map and shows up when they're caught. Badges (Survivor, Ghost, Hat-trick, Bot Hunter…)
(102 of them, up to legendary ones like Phantom and Immortal; rules in
`game-db/008_badge_collection.sql` and `game-db/011_badges_hard.sql`, streak badges in
`game-db/027_streaks_levels.sql`) are awarded when a round ends and can be shared as a picture. During the hunt, a hot-air
balloon carrying mint sometimes floats by for a player: tapping it gives 5 mint, at most
10 a day (logged as `balloon` in `coin_supply_daily`).

## Daily streaks, hugs and My gifts

Doing one thing a day (playing a game, finishing a side quest, giving or spraying mint, a hug
or a handshake, riding something) keeps a player's streak going (UTC days, `streak_touch` in
`game-db/027_streaks_levels.sql`; games, quests, gifts and hugs count through triggers, rides
through `rodeSomething`). One missed day a week is saved by a free freeze. 3, 7, 14, 30, 60 and
100 days (and every 100 after) pay `streak_reward_<days>` mint (`streak_reward` in
`coin_supply_daily`) and a badge the first time. The flame next to the mint opens the streak screen.

Hugs and handshakes (`game-db/028_hugs_gifts.sql`) are free, capped at `hugs_per_day` (30) and
`hugs_pair_per_day` (3 to the same person). My gifts (menu) lists hugs, handshakes, gifts and
spraying received in the last 30 days, with a thank-you per gift. Blocking someone stops their
hugs, handshakes, mint gifts, private messages and friend requests, and ends a friendship.
Two side quests (Town hugger, Diplomat) count hugs and handshakes.

## Sign-in and chat

Signing in and signing up happen in a pop-up over the town (the town freezes and blurs behind
it; only the X closes it). `/login` and signed-out visits to `/play` open it at `/?signin=1`.
The pop-up asks for an email. Returning players type their 6-digit PIN; new players get
a 4-digit email code (sent by the app through Resend), then pick a name and PIN. "Forgot
PIN" emails a code and lets you set a new one. 5 wrong PINs locks it for 15 minutes. Chat has a public City room and private
messages, with text and voice notes, a People list showing who's a ghost or a hunter, and town
news signed by the bot; it belongs to one round, so a new map starts a new
chat (old chats and voice notes are deleted by the daily job).

## Ads

Brands book at **/advertise** (no game account needed) and pay with Paystack. The ad goes
live on billboards in every city **as soon as the payment is confirmed** (there's no
automatic picture check).

- **Budget = a mint pool.** The advertiser picks a weekly budget (from ₦5,000) and 1–8 weeks.
  What they pay loads the ad with mint: 1 mint per ₦5.
- **Paid views are button taps.** Tapping a billboard opens the ad (free for everyone). A
  signed-in player who then taps the ad's button ("Visit <brand>", or "Thanks, <brand>!" when
  there's no link) gets 5 mint from that ad's pool (logged as `ad_reward`;
  `game-db/022_pool_and_ads.sql`). Each player can earn this from 5 ads a day, once per ad per day.
- **Free views.** Opening an ad, and button taps by people who get no mint (watchers without an
  account, players over their daily limit, a second tap the same day), are counted but cost nothing. Link clicks are
  counted too. Billboards just being on screen are counted as "seen on billboards" and never
  charged.
- **The end.** An ad stops when its pool can't pay another reward, or its weeks are over.
  Unused mint expires. Mint is only created when a player is paid, so the mint books
  (`coin_supply_daily`) stay correct.
- **Advertiser accounts.** The first booking makes an advertiser account from the email
  (separate from players). Every email (receipt, "your ad is live", daily report) has a
  private **Manage your ad** link (works 30 days). At **/advertiser** they can also sign in
  with a 4-digit email code. There they see live numbers (mint left, paid views, free views,
  clicks, days left), change the picture, headline or link (live straight away), pause or
  resume, and top up (Paystack again).
- **Prize pool sponsorships** are no longer sold on the site. Ones already paid still work:
  they queue, one per round, in order.

Setup: run `game-db/010_ads_sponsors.sql` and then `game-db/013_ads_v2.sql` once (010 also
makes the public `ads` storage bucket). Add `PAYSTACK_SECRET_KEY`, `ADMIN_EMAIL` and
(optionally) `ADVERTISER_SECRET` in Vercel (see `.env.example`). In Paystack → Settings → API
Keys & Webhooks, set the **Webhook URL** to `https://<your site>/api/paystack/webhook`.

You get an email for every new ad (with its picture). To take one down: Supabase → Table
Editor → `ads` → find it → change `status` to `held` (it stops at once and the advertiser
can't switch it back on); refund in Paystack if you want (Transactions → the reference →
Refund). Every number is a row in `game_settings`: `ad_coins_per_ngn`, `ad_view_reward`,
`ad_rewards_per_day`, `ad_min_weekly_ngn`, `ad_max_weeks`, `ad_max_ngn`, `ad_link_days`, …

## Tuning

Every number (stake, prices, shares, timings, bounty) is a row in the `game_settings`
table. Change it in Supabase → Table Editor; it applies from the next action.
Mint supply per day: `select * from coin_supply_daily;`

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
`npm run test:db` runs the rules test against a throwaway Postgres (`TEST_DATABASE_URL`).
