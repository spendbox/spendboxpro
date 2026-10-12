# To do

## Now (owner)
- [ ] Follow `docs/LIVE_CHECK.md`: switch the real-map game on (database, Vercel settings, Paystack) and try it on your phone, step by step.
- [ ] In the Supabase SQL Editor run `game-db/038_property.sql` (owning property on the real map: starting budget of ₥5,000, buying, homes, rent, treasuries). Until it's run, `/play?world=lagos` shows the map but buying won't work. Already ran it? Run it again: it is safe and sets the starting budget back to ₥5,000.
- [ ] Then run `game-db/039_work.sql` (jobs on the real map, fares to work, neighbours; see `docs/WORK.md`). Until it's run, Work and neighbours won't load.
- [ ] Then run `game-db/040_living.sql` (money pots and budget, bills, health, school, looks, essential services paid from tax; see `docs/LIVING.md`). Run it after 038 and 039 (and again if you ever run 038 again): the game's Money and Life screens need it.
- [ ] Then run `game-db/041_your_day.sql` (side hustles, Body and Mind, exercise, interviews, breakthroughs; see `docs/DAY.md`). Run it after 040 (and again after 040 if you ever re-run 040).
- [ ] Then run `game-db/042_starter_packs.sql` (starter packs paid through Paystack; see `docs/PACKS.md`). Paystack's webhook URL must already point at `/api/paystack/webhook` (it does for ads).
- [ ] Then run `game-db/043_business.sql` (real businesses leasing buildings; see `docs/BUSINESS.md`). Leases and upgrades are paid through the same Paystack webhook.
- [ ] Then run `game-db/044_services.sql` (services between people; see `docs/SERVICES.md`).
- [ ] Then run `game-db/045_map_reports.sql` (players report map problems; you read them at `/map-reports` while signed in with the `ADMIN_EMAIL` email; see `docs/MAP_REPORTS.md`).
- [ ] Then run `game-db/046_market.sql` (the player market: selling, offers, tenants, World Bank loans; see `docs/MARKET.md`). If you ever run 038 or 040 again, run 046 again after them.
- [ ] Then run `game-db/047_ads_are_property.sql` (advertising is leasing a building: billboards included, a design you can swap, ends after a year or its taps; no mint for tapping ads; see `docs/BUSINESS.md`).
- [ ] Then run `game-db/048_trips.sql` (going into a building costs the fare from where you last were).
- [ ] Then run `game-db/052_marks.sql` (writing, reviews, trees, statues, time capsules on the map; see `docs/MARKS.md`). Run it after 051.
- [ ] Then run `game-db/053_marks_rules.sql` (short writing, graffiti styles, the reputation limits). Run it after 052.
- [ ] Then run `game-db/054_earnings.sql` (Finance's Overview: what you've earned and each payment in). Run it after 053.
- [ ] Then run `game-db/051_people.sql` (faces on the map, cards, doorsteps, while you were away, push; see `docs/PEOPLE.md`).
- [ ] For notifications: run `node scripts/vapid-keys.mjs` once, put the three lines it prints into Vercel's environment variables (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), and redeploy.
- [ ] Then run `game-db/050_economy_items.sql` (pay four times real wages, money by day for the Finance chart, things, the market, crafting, cars, reputation; see `docs/ITEMS.md`). Until it's run, the Things screens and the Finance chart stay empty.
- [ ] Then run `game-db/049_reports_and_work.sql` (reporting people; up to 3 side hustles; pay that goes into wallets by itself every game week). Until it's run, starting a second side hustle and reporting a person won't work.
- [ ] In Vercel, set `GAME_SECRET` to a long random string (seals interview answers and passes; without it the service key is used).
- [ ] Let the cloud sessions reach OpenStreetMap (for the real Lagos map): in the Claude Code environment settings, Network access, add `overpass-api.de` to the allowed domains. Then ask for the real pedestrian crossings (the list is still empty: the download failed) and a fresh Lagos bake (`npm run bake:world -- lagos`).
- [ ] Try the new 3D avatar studio (see `avatar-reference/docs/AVATAR_SPEC.md`): open the game with `?avatar3d=1` on your phone, tap your look, design and save. Only your browser gets it; `?avatar3d=0` switches it back.
- [ ] In the Supabase SQL Editor run `game-db/035_fees_and_jobs.sql` (first-visit fees, train fares, jobs). Until it's run, places and trains stay free and Jobs won't load.
- [ ] In the Supabase SQL Editor run `game-db/036_minigames.sql` (minigame rewards). Until it's run, the games all play but good scores pay no mint.
- [ ] Then run `game-db/037_better_pay.sql` (each skill level adds 10% pay, was 5%). The tripled hourly pay works without it.
- [ ] In the Supabase SQL Editor run, in order: `game-db/021_hourly_rounds.sql` (again), `022_pool_and_ads.sql`, `023_houses.sql`, `024_play_style.sql`, `025_big_towns.sql`, `026_friends.sql`, `027_streaks_levels.sql`, `028_hugs_gifts.sql`, `029_ghost_duels.sql`, `030_no_bot_ghost.sql`. (If 017–020 were never run, run them first.) Then merge the open pull request.
- [ ] In Vercel, set `SPORTS_SECRET` to a long random string (once; don't change it later).
- [ ] Test on a real phone: sounds, touch gestures, the water slide, club lights.

## Done lately
- [x] The social city, phase 1 and 2: faces on the map (online, asleep, at work, away), cards, doorsteps with knocks, notes and wrapped gifts, while you were away, web push; writing, reviews, trees, statues, fountains, plaques and time capsules on the map, with reactions and votes to take down.
- [x] Plain words (every 2 hours, not "game day"), no hourly countdown on the real map, no page zoom on pop-ups, jobs at filling stations, everything on the phone (no old menu, no XP or level), search in the place pill.
- [x] Land a tenth of real prices, cheaper homes, pay 4x real wages, fares about halved.
- [x] Income with tabs and totals, Find jobs pop-up; Finance shows whether you're up or down, with a chart.
- [x] Things, shops, cars, the market, crafting new things, reputation (`docs/ITEMS.md`); Lagos news and weather (`docs/NEWS.md`).
- [x] Bridges and flyovers never end in mid-air or meet with a step, and the tests check every deck in Lagos. Onikan Stadium no longer has a flyover through it.
- [x] Unilag at its real Akoka spot on the lagoon, at real size (about 1.1 × 0.9 km), drawn as a campus; no more made-up "University of Lagos" copies.
- [x] Tapping a building or place: Go there (with the fare; straight in on the ground floor, the Floor button glows for the first 5 visits), Rent / Buy (worth and units), Advertise, and which way its worth is going. Cards no longer blur the map.
- [x] Report a problem on every building, place, player and character. Advertising leases ₦20,000 to ₦1m. The coin balloon is gone.
- [x] Cheaper fares (a danfo never over ₦600 a trip); islands with no bridge go by ferry.
- [x] Income: the job at a glance, pay into the wallet by itself every game week, switching jobs in one step, up to 3 side hustles with their costs shown, long days can cut sleep (it stresses the mind).
- [x] Pop-ups open at once.
- [x] Costs are shown on the button that spends them (going into a place for the first time, train tickets...), so nothing is explained afterwards. Jobs pay three times as much (₥15-₥60 an hour) and each skill level adds 10%.
- [x] all 100 minigames built (Games button in the menu and in every place): 9 categories, the ones that suit the place first, play alone, take turns on one phone, challenge someone here, or (board and card games) play the computer or someone online. Leaderboards; ₥2/₥4/₥6 for bronze/silver/gold. The bank robbery now has a job step of heist games (fail one and the alarm goes off), and jobs have "Work a shift" games that pay a tip.
- [x] Sounds of what's close by (all subtle): a helicopter's rotor as one flies near, busier street sounds near roads (cars, motorbikes, horns), whispered nonsense near crowds, chatter in foreign-sounding tongues near airports, hotels and markets, dogs among the houses, cockerels on the farms.
- [x] Going places costs a little mint (run `game-db/035_fees_and_jobs.sql`): ₥0.10–₥5 for the first visit to a place in each town, a fare for every train ride; half into the prize pool. Zoom buttons (+ and −) on computers.
- [x] Jobs: any business hires after a 5-question interview about the town; fail and that place is closed to you for the town. Hourly pay (taxed 10% into the pool, 8 paid hours a day), skills that skip the interview next time and add pay.
- [x] Selfies: add up to 5 people (people here and friends), Portrait / Clear / B&W backgrounds, Auto / Tall / Square / Wide shapes.
- [x] The mint sign ₥ instead of writing "mint" after amounts.
- [x] Trains: every town has a curving railway for its bullet trains; the monorail sweeps round corners and can be ridden from Explore (₥1.50).
- [x] A list of 100 minigame ideas (`docs/MINIGAMES.md`).
- [x] The bot no longer plays as a ghost (run `game-db/030_no_bot_ghost.sql`), so "ghosts left" only counts real people. Ghosts join in the first 2 minutes (was 3), with beeps in the last 30 seconds. Explore is locked while the town is being built. Signing in and signing up happen in a pop-up over the frozen, blurred town. A house button flies you to your house. From a hot-air balloon you can see and tap the building bubbles. Logged-out visitors get Leave inside places and Advertise next to "Watching live".
- [x] New core game: ghost duels (run `game-db/029_ghost_duels.sql`). Ghosts join in the first 3 minutes (now 2, part 30) and light up on the map (no hiding, no moving). Hunters (everyone else) tap a light to see the ghost's stats, chat, or challenge them (10 mint) to Rock-Paper-Scissors, first to 2, a minute at most. Ghosts get a 30-second pop-up anywhere. 3 wins: golden (safe, in the pool). 3 losses: out. Each loss: 80% of a third of the stake to the hunter, 20% to the pool. Hunters with 20 wins enter the pool. No more searching, sweeping or drones. Explore holds rides and sports. "Spray mint", not money.
- [x] Daily streaks (run `game-db/027_streaks_levels.sql`): a flame next to your mint, one thing a day keeps it going (a game, a side quest, a gift or spray, a hug or handshake, a ride), a free freeze each week, mint and badges at 3, 7, 14, 30, 60 and 100 days.
- [x] New level curve (same file): XP from games, side quests and streak days; quick and cheap to level 20, then harder every level to 100. Everyone keeps their level. The daily refill stops growing at level 40.
- [x] Hugs, handshakes and My gifts (run `game-db/028_hugs_gifts.sql`): free hugs and handshakes (30 a day, 3 to the same person), a My gifts screen with thank-you buttons, and blocking. Two new side quests count them.
- [x] Planes are proper airliners now: rounded body with a nose and cockpit, a row of windows, swept wings with engines, a tall tail in an airline's colours, wingtip lights and strobes, and two vapour trails. They fly higher and slower. The plane parked at the airport is an airliner too.
- [x] Friends (run `game-db/026_friends.sql`): add, say yes, remove; friends stay friends in every new town, their faces show over the places they're in, nudges to join them, and "your friends are in this town too". A card pops up when real players (not NPCs) are in the same place as you. People look much more natural (jointed bodies, faces from avatars, outfits from avatars) and stay fast. Clubs: dance with everyone, see yourself dancing, eight moves, partners, music and lights on the beat.
- [x] Rides out of town: the railway runs on into the countryside, flat farmland round every town (no mountains in the way), scenery made around you while you ride (fields, farms, villages, trees and animals in each country's style), and famous places from the town's own country or city outside it (Third Mainland Bridge, Big Ben, Statue of Liberty, Lake Nakuru's flamingos and more).
- [x] Towns: a real stadium bowl (4×4), domed capitols, mega malls, a glass-vaulted station on a curving railway, big lakes with causeways, the sea for huge towns, winding lanes, schools / mosques / churches / pitches / playgrounds / monuments in every neighbourhood, and new skyscraper districts (with supertalls) as the town grows.
- [x] Houses, phase 1 (free): pick a style, colours, room and name; "Show my house in the game" puts it in the middle of every new town (+5 hiding spots each); switch off for the next game; "Visit my house".
- [x] Play styles: 12 styles at the end of every game with a tease line, the numbers behind it, a share picture, and "My style" bars over time.
- [x] Mint spent during a game (respawns, sports tickets, the sportsbook's cut) goes into the prize pool. Ads pay for a tap on the ad's button, not for looking. Final countdown is the last 2 minutes. No "world" wording.
- [x] Billboards: different ads on different boards and for different people; no ads on balloons.
- [x] Big towns: nothing scans the whole town any more, and huge towns only draw the part around the camera. Compact menu that opens instantly.
- [x] Games on the hour (UTC): 3-minute join countdown from the top of every hour, hunt until the next hour mark, red final 30 seconds, no early end when every ghost is caught; games on the old timing get pulled in to end on the hour (run `game-db/021_hourly_rounds.sql`, again if you already ran it).
- [x] Renamed to Newtown: new logo, favicon, share picture, "mint" instead of coins, newtown.world and hello@newtown.world everywhere.
- [x] Fixes: sign-out spinner, hunt countdown for ghosts, sign-in prompts for watchers, timeouts ("Reconnecting" screen), cars drive themselves, button press feedback, "My house" coming soon.
- [x] Info bubbles over nearby buildings and tappable world events.
- [x] Sports: football, basketball, boxing, wrestling. Simulated matches in a tactical view, mint tickets, simple mint bets (run `game-db/020_sports.sql`).

## The big plan
Everything Newtown is becoming (life, careers, money, property, love, news, voice, culture, events, time) and the order to build it: `docs/LIFE.md`.

## Property and money (see `docs/PROPERTY.md`) — next
- [ ] Owner to decide: what a mint is worth (suggested: about $1, local price shown beside it), how fast property earns (suggested 6% a game year), the starting budget (suggested ₥2,000), and taking the minigames out of the menus.
- [ ] Step 1: buildings worth owning (permanent identities, many kinds made from rules, floors and units, the value formula and Lagos prices).
- [x] Step 2: search bar, wallets and ownership, buy a home first, primary residence, the Assets screen, rent while let; ghosts and the Games button hidden on the real map. (Entry fees to owners: with step 3.)
- [x] Step 3 (part): offers, sales, tenants, World Bank loans (`docs/MARKET.md`).
- [ ] Still to come: people search, values that move with demand.
- [ ] Later: improve/demolish/rebuild, ad revenue sharing (after the lawyer), government roles and contracts.

## Real-world map (see `docs/WORLD.md`)
- [x] Step 1, the foundation: one tile = 100 m, regions placed by real latitude and longitude, Lagos (45 × 25 km) drawn round the camera, its districts and landmarks, a fixes file, the bake script, `/world-lab` and `/play?world=lagos` to see it.
- [ ] Step 2: bake Lagos's real coastline, lagoon, creeks, islands and main roads from OpenStreetMap (needs the network access above). Check the landmarks against the map.
- [ ] Step 3: smooth long bridges on piers (Third Mainland Bridge and its curves, Carter, Eko, Lekki–Ikoyi Link), rail lines, beaches, Makoko stilt houses, landmarks at real size. Drawing in chunks.
- [ ] Step 4: zoomed-out map to tap and fly anywhere.
- [ ] Step 5: the game on the permanent map. The hourly game is on hold and becomes something else (owner to decide).
- [ ] Later (not now): 3D avatars for characters and players walking the world, and the avatar studio for them.

## Next batch
- [ ] **Replacements for what the duels switched off** (owner to decide):
  - Town event twists: fog of war, double mint (on catches), ghost amnesty, drone storm, lucky street, bot tantrum, spotlight, bounty board, safe house, blackout district.
  - Side quests: detective, private eye, spy, lookout, informant, apprentice hunter, bounty hunter, drone pilot, decoy master, escape artist, ghost whisperer, shadow.
  - Level perks (decoy, shield, big search, respawn, extra moves) and badges about hiding, searching and drones.
- [ ] **More duel games** besides Rock-Paper-Scissors (picked at random, a minute at most).
- [ ] **Ghost pranks: on hold** (owner said hold on). The first version (booby trap, mirage, haunting) was built for searching and needs redoing for duels.
- [ ] **Simple counters** (time spent, next-day return, players per round) and a plan for 10-20 friends playing for a few days, plus scheduled evening "peak hour" events.

## Houses and studios
Decide first:
- [ ] What 4x4 to 10x10 means. Default: room size inside, small building outside.
- [ ] Studios full-size as soon as they pay; levels unlock mansions and decorations for personal houses.
- [ ] Legal check with a Nigerian lawyer: mint pools and stakes as gaming, subscription rules, showing contact details publicly.

Stage 1: free house (cheapest path: reuse what the city already draws)
- [x] Pick, don't build: one of the city's house styles, paint colours, a name sign, a room style.
- [x] Free publishing into every new town, switch off for the next game, +5 spots per house.
- [ ] Furniture slots instead of a free editor: tap a spot in the room, pick a chair, sofa, table, plant, lamp, TV, bar... (mint, burned). Free starter set.
- [ ] "My house" visit even when the house is switched off (a private copy just for the owner).

Stage 2: paid publishing (N1500 a month)
- [ ] Paystack monthly billing, grace period and reminder emails for failed cards.
- [ ] Approval before going live, report button, block fake business names.
- [ ] Switch on/off any time; shows even when the owner is offline.
- [ ] Placed into each hour's new city near busy districts, fair rotation, plus a directory for houses that do not fit.
- [ ] Small, capped passive earnings boost; no hunting or hiding advantage.

Stage 3: studios (N15,000 a month) and mansions
- [ ] Shop display, contact links (email, WhatsApp, social media) shown only if the owner ticks them, daily stats emails.
- [ ] Studio grows over time; mansions for personal houses up to 10x10 at level 100.

## Rules to remember
- Every new kind of mint that appears (streaks, passive boost, etc.) must be added to the `coin_supply_daily` view so the books balance.
- Gifts, spraying and stealing are transfers, not new mint.
- Line icons only, no emoji.
