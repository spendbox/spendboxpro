# To do

## Now (owner)
- [ ] In the Supabase SQL Editor run, in order: `game-db/017_world_events.sql` (again if you already ran it: it now stops clock ticks queueing up), `018_npcs.sql`, `019_activities.sql`, `020_sports.sql`, `021_hourly_rounds.sql`. Then merge the open pull request.
- [ ] In Vercel, set `SPORTS_SECRET` to a long random string (once; don't change it later).
- [ ] Test on a real phone: sounds, touch gestures, the water slide, club lights.

## Done lately
- [x] Games on the hour (UTC): 3-minute join countdown from the top of every hour, hunt until the next hour mark, red final 30 seconds, no early end when every ghost is caught; games on the old timing get pulled in to end on the hour (run `game-db/021_hourly_rounds.sql`, again if you already ran it).
- [x] Renamed to Newtown: new logo, favicon, share picture, "mint" instead of coins, newtown.world and hello@newtown.world everywhere.
- [x] Fixes: sign-out spinner, hunt countdown for ghosts, sign-in prompts for watchers, timeouts ("Reconnecting" screen), cars drive themselves, button press feedback, "My house" coming soon.
- [x] Info bubbles over nearby buildings and tappable world events.
- [x] Sports: football, basketball, boxing, wrestling. Simulated matches in a tactical view, mint tickets, simple mint bets (run `game-db/020_sports.sql`).

## Next batch
- [ ] **Daily streaks.** Any daily action counts (play a round, finish a side quest, send a gift or hug, ride something). Rewards grow at 3, 7, 14, 30, 60 and 100 days (a little mint, badges). One free "freeze" a week. Flame icon on the home screen.
- [ ] **Hugs, handshakes and a "My gifts" screen.** Free, with daily caps and a block button. "My gifts" in the menu shows who sent what, with a thank-you button. Counts towards quests and streaks.
- [ ] **Ghost pranks on hunters** (mint-priced, one per game, level-gated):
  - Booby-trapped spot: green slime and a longer wait for the hunter who searches it.
  - Mirage: a fake ghost on hunters' maps for a minute.
  - Haunting: caught ghosts flicker lights and rattle chairs while hunters are inside buildings.
- [ ] **Fix planes** so they look like airliners (fuselage, wings, tail, high and slow, trails), not drones.
- [ ] **New level curve.** Cheap and fast to level 20, then harder every level to 100. Quests, games and streaks also earn level progress. Cap the daily mint refill (+25 per level is about 2,575 a day at level 100). Existing players keep their levels.
- [ ] **Simple counters** (time spent, next-day return, players per round) and a plan for 10-20 friends playing for a few days, plus scheduled evening "peak hour" events.

## Houses and studios
Decide first:
- [ ] What 4x4 to 10x10 means. Default: room size inside, small building outside.
- [ ] Studios full-size as soon as they pay; levels unlock mansions and decorations for personal houses.
- [ ] Legal check with a Nigerian lawyer: mint pools and stakes as gaming, subscription rules, showing contact details publicly.

Stage 1: free private house (cheapest path: reuse what the city already draws)
- [ ] Pick, don't build: choose one of the house styles the city already has, paint colours, a name sign, and a room style (living room, lounge, studio, club...).
- [ ] Furniture slots instead of a free editor: tap a spot in the room, pick a chair, sofa, table, plant, lamp, TV, bar... (mint, burned). Free starter set.
- [ ] "My house" button that always takes the owner home, even if the house is switched off in the city.

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
