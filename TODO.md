# To do

## Now (owner)
- [ ] In the Supabase SQL Editor run `game-db/035_fees_and_jobs.sql` (first-visit fees, train fares, jobs). Until it's run, places and trains stay free and Jobs won't load.
- [ ] Pick the next minigames to build from `docs/MINIGAMES.md`.
- [ ] In the Supabase SQL Editor run, in order: `game-db/021_hourly_rounds.sql` (again), `022_pool_and_ads.sql`, `023_houses.sql`, `024_play_style.sql`, `025_big_towns.sql`, `026_friends.sql`, `027_streaks_levels.sql`, `028_hugs_gifts.sql`, `029_ghost_duels.sql`, `030_no_bot_ghost.sql`. (If 017–020 were never run, run them first.) Then merge the open pull request.
- [ ] In Vercel, set `SPORTS_SECRET` to a long random string (once; don't change it later).
- [ ] Test on a real phone: sounds, touch gestures, the water slide, club lights.

## Done lately
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
