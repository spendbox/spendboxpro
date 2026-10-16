# To do

## Now (owner)
- [ ] Then run `game-db/116_player_stories.sql` (other players in your story: loans, lifts, vouching, the wallet). Run it after 115. Until then no other player turns up in anyone's moments.
- [ ] Then run `game-db/115_ventures.sql` (careers: start a business and grow it). Run it after 114. Until then My business says businesses are switched on soon.
- [ ] Then run `game-db/114_standing.sql` (Trust, Fame, Legacy and quiet badges). Run it after 113. Until then the wheel shows no standing and no badges.
- [ ] Then run `game-db/113_cast.sql` (people who remember you: Mama Nkechi, Officer Bello, Baba Sule...). Run it after 112. Until then no character's story comes.
- [ ] Then run `game-db/112_wheel.sql` (the wheel: effects that stay on you, and what came of each moment). Run it after 111. Until then the wheel shows your moments, but no effects and no "what came of it".
- [ ] In the Supabase SQL Editor run `game-db/111_character.sql` (each answer to a moment quietly shapes who you are; docs/LIFE_WHEEL.md). Until then moments work as before, they just aren't remembered for that.
- [x] Set up the test version with its own database (docs/TESTING.md, about 20 minutes). Until then, previews use the live database.
- [x] In the Supabase SQL Editor run `game-db/065_economy_balance.sql` (a fairer economy: jobs pay 18 times real wages, food as a daily cost, the daily refill counts your pots, dearer levels, gift limits for new accounts, rent follows value, no wash-trading up shop prices, pickpocketing doesn't pay). Run it soon after this update goes live: until then the game still works, but food isn't charged and the old rules apply. Run 064 first.
- [x] In the Supabase SQL Editor run `game-db/064_home_upgrades.sql` (paying for new floors and furniture in Plan my home, which raises the home's value). Run 062 and 063 first if they aren't yet.
- [x] In the Supabase SQL Editor run `game-db/066_home_visits.sql` (knocking at homes, parties and the guest book). Until then doors stay open and those buttons say "switched on soon".
- [x] In the Supabase SQL Editor run `game-db/067_club_entry.sql` (entry fees at some clubs, good for 24 hours). Until then every club is free to walk into.
- [x] In the Supabase SQL Editor run `game-db/069_pack_perks.sql` (paid packs' gifts: phone, car, watch...). Until then the gifts wait; the furnished home works already.
- [x] In the Supabase SQL Editor run `game-db/070_challenges.sql` (Challenge: challenges on the map, pools and prizes). Until then Challenge says it is switched on soon.
- [x] In the Supabase SQL Editor run `game-db/071_chat_read.sql` (private messages show "Opened" once read, and read ones stop counting on every phone). Until then each phone remembers what it has read.
- [x] In the Supabase SQL Editor run `game-db/072_first_steps.sql` (the first five minutes: the small rewards for saying hi, playing a challenge and picking a home). Until then the guide shows but pays nothing.
- [x] In the Supabase SQL Editor run `game-db/073_daily_money.sql` (the daily gift, counting active time, and Newtown's prize for a challenge won). Until then Your money says the gift is switched on soon. Run it again if you ran it before the economy was resized: it sets the gift cap and the prize to the new numbers.
- [x] In the Supabase SQL Editor run `game-db/074_simple_life.sql` (the simple life: ₦250,000 to start, free starter rooms). Run 072 again too (the first steps are now: say hi, play a challenge, go out).
- [x] In the Supabase SQL Editor run `game-db/076_topups.sql` (top-ups any time: ₦1,000 = ₦1,000,000, bonuses on bigger ones, the first doubled). Until then Top up says it is switched on soon.
- [x] In the Supabase SQL Editor run `game-db/077_renting.sql` (renting a home: 6% of its value a month, paid when you open the game). Until then Rent says it is switched on soon.
- [x] In the Supabase SQL Editor run `game-db/078_home_name.sql` (naming your home from its card). Until then the pencil says it is switched on soon.
- [x] In the Supabase SQL Editor run `game-db/079_property_income.sql` (property pays you every day by itself; no buying tax). Until then property earns nothing and the 3% tax still applies.
- [x] In the Supabase SQL Editor run `game-db/080_tutorial.sql` (the walkthrough's missions and rewards: ₦20,000 for naming your home, ₦50,000 for saying hi, ₦50,000 for winning a challenge). Until then the missions show with no reward.
- [x] In the Supabase SQL Editor run `game-db/081_no_challenge_prize.sql` (no more ₦2,000 Newtown prize on a win).
- [x] In the Supabase SQL Editor run `game-db/082_landmarks.sql` (buying landmarks, ₦50bn to ₦2tn, earning 10% a day). Run it after 079.
- [x] In the Supabase SQL Editor run `game-db/083_online_pay_world_bank.sql` (₦500 for every minute online, up to 4 hours a day; the World Bank).
- [x] In the Supabase SQL Editor run `game-db/084_bank_ads_admin.sql` (the World Bank opens with ₦1 billion and grows from there; every billboard view counted; paid ads for one state or everywhere; the money made today on the dashboard). Run it after 083. If you ever run 083 again, run 084 again after it.
- [x] In the Supabase SQL Editor run `game-db/085_town_hall_faces.sql` (the Town Hall, one chat for everyone online in the state; and the "faces" storage for profile photos). Until then Town Hall says it opens soon and photos say they're switched on soon.
- [x] Then run `game-db/086_town_hall_more.sql` (Town Hall replies, reactions, photos, deleting, messages gone after 24 hours; nobody shows "at work" on the map any more; no top price for landmarks).
- [x] Then run `game-db/087_rename_property.sql` (name any property you own from Things › Assets, not just your home).
- [x] Then run `game-db/088_world_bank_sports.sql` (the World Bank also counts sports money: the house cut on bets and match tickets, not only challenges). Run it after 083 and 084.
- [x] Then run `game-db/089_world_bank_everything.sql` (the World Bank counts everything players pay the city: fares, food, bills, taxes, shopping, property from the city, games; loans come out of it and repayments go back in; spending since it opened is added once). If you ever run 083, 084 or 088 again, run 089 again after.
- [x] Then run `game-db/090_packs_and_credits.sql` (new lives start with ₦2,000,000 and a free home; starter packs raise it to ₦20m / ₦80m / ₦300m for ₦1,000 / ₦2,500 / ₦5,000, paid like top-ups so a payment is never lost; the dashboard can credit players). Until it's run, the Wallet doesn't show the packs.
- [x] Then run `game-db/091_city_growth.sql` (the city grows with its players: unsold buildings rebuilt taller, estates spread, sold-out blocks gain storeys; see docs/GROWTH.md).
- [x] Then run `game-db/092_monthly_leases.sql` (buildings for advertisers are leased by the month, 1/3/6/12 months, and "Another month" on the ad page). Until it's run, the building checkout says monthly leases are switched on soon; billboard ads work either way. If you ever run 043 or 047 again, run 092 again after.
- [x] Then run `game-db/093_engagement_rep.sql` (reputation also grows quietly with time in the game, real conversations, gifts and greetings, friends and visitors; see docs/REPUTATION.md).
- [x] Then run `game-db/094_lived_in_leases.sql` (advertisers can take buildings people live in: the homes stay buyable and lived in, nobody renames the building while it's leased). If you ever run 043, 047 or 092 again, run 094 again after.
- [x] Then run `game-db/106_passport.sql` (the passport: a stamp for every real place you go into, rewards for new stamps and complete areas; see docs/PASSPORT.md). Until it's run, the passport says it's switched on soon.
- [x] Then run `game-db/107_gifts_uncapped.sql` (no cap on giving money, except brand-new accounts: ₦750,000 a day until 3 days old and level 5).
- [x] Then run `game-db/108_home_builder.sql` (the house builder: one save can cost more, and big plans fit).
- [x] Then run `game-db/109_moments.sql` (moments: little stories out and about, with choices that move money and reputation; see docs/MOMENTS.md).
- [x] Then run `game-db/110_game_tables.sql` (game tables: challenge one person to Whot!, accept or decline, start now; see docs/GAME_TABLES.md).
- [x] Then run `game-db/105_pack_72_hours.sql` (starter packs are on offer for a player's first 72 hours only, not until they buy a home). Until it's run, the old rule stays.
- [x] Then run `game-db/104_luxury.sql` (luxury things up to ₦3bn: Patek Philippe, Richard Mille, Rolls-Royce...). Until it's run, anything over ₦300m can't be bought.
- [x] Then run `game-db/103_call_off_refunds.sql` (when a host calls off an event, everyone who came in is told their ticket was paid back, not only those who said they were going). Run it after 96.
- [x] Then run `game-db/102_speed.sql` (faster at scale: players' positions kept with indexes, missing indexes, one notice to many players, old notices cleared daily). Run it after 101. Everything works before it's run, just slower with many players.
- [x] Then run `game-db/101_event_audience.sql` (a new event tells the nearest players however far, twice as many as it holds, or everyone within 4 km). Until it's run, only people within 4 km hear, and only if it starts soon.
- [x] Voice calls: set up Cloudflare's TURN relay so people on mobile data can be heard (docs/VOICE_CALLS.md: CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN in Vercel). Free for the first 1,000 GB a month.
- [x] Then run `game-db/100_passwords.sql` (passwords instead of PINs: players from before are asked to make one after signing in with their old PIN). Passwords work before it's run; until then old players just aren't asked.
- [x] Then run `game-db/099_email_verified.sql` (new players sign up without an email code; this remembers whose email is confirmed, for a later reward). Sign-up works before it's run.
- [x] Switch on the robot check on sign-up (free): Cloudflare dashboard → Turnstile → Add widget for newtown.world (Managed), then in Vercel add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` and redeploy. Until then new players sign up with no robot check.
- [x] Then run `game-db/098_no_fare_caps.sql` (fares are no longer capped: a long trip costs what it costs by the kilometre).
- [x] Then run `game-db/097_party_sizes.sql` (parties of any size, from one spot to a carnival 5 km across, for up to 10,000 people). Run it after 096 (and again if you ever run 095 again). Until it's run, only one-spot parties for up to 1,000 can be hosted.
- [x] Then run `game-db/096_event_refund.sql` (a party fewer than 10 people come to: the host gets the hosting fee back). Run it after 095 (and again if you ever run 095 again).
- [x] Then run `game-db/095_events.sql` (Events: anyone hosts a party or a talk/screening on the street or at a place, others say they're going and come in; tickets held until it's over, 90% to the host; parties cost from ₦100,000 an hour to host; street parties can't overlap; slides and chat photos storage; the walkthrough's third mission becomes "go to an event"; see docs/EVENTS.md). If you ever run 054 or 080 again, run 095 again after it. Until it's run, the Events button opens but says events are switched on soon, and hosting doesn't work.
- [x] Paystack dashboard: turn on "Pay with Transfer" (for bank transfer in the game), and set the Webhook URL to `https://<your site>/api/paystack/webhook` (Settings → API Keys & Webhooks).
- [x] On the day the simple life goes live (after merging), run `game-db/075_fresh_start.sql` ONCE: everyone's money becomes ₦350,000 (₦250,000 + ₦100,000 founder bonus), pots emptied, Founder badge, homes and things kept. Old balances are backed up; the undo lines are at the bottom of the file.
- [x] Optional, for voice calls on every network: add a TURN relay (docs/VOICE_CALLS.md) with NEXT_PUBLIC_TURN_URL, NEXT_PUBLIC_TURN_USERNAME and NEXT_PUBLIC_TURN_CREDENTIAL in Vercel.
- [x] In the Supabase SQL Editor run `game-db/062_notices_read.sql` (exact unread counts, swiping notices away, photos and selfies in messages) and then `game-db/063_home_plans.sql` (saving home plans).
- [x] In the Supabase SQL Editor run `game-db/061_ride_fares.sql` (rides on the map cost their fare: train, ferry, bus, taxi, balloon, helicopter...; until it's run they stay free on the real map).
- [x] In the Supabase SQL Editor run `game-db/060_find_people.sql` (search anyone nearest first, man or woman). Until it's run, People still lists those within 50 km and nobody shows as man or woman.
- [x] In the Supabase SQL Editor run `game-db/059_bigger_starts.sql` (free start ₥6,500; visits counted by day for the online button's numbers and the dashboard). The bigger packs work without it.
- [x] For the owner's dashboard: in Vercel → Settings → Environment Variables add `ADMIN_PATH` (a hard-to-guess address, at least 8 characters, e.g. `hq-7f3k29xq`), and `ADMIN_PASSWORD` (at least 8 characters; `ADMIN_EMAIL` is the sign-in email). Redeploy, then open `https://newtown.world/<ADMIN_PATH>`.
- [x] Starter packs: check Paystack → Settings → API Keys & Webhooks → Webhook URL is `https://newtown.world/api/paystack/webhook` (live and test). Payments are now also checked when the player comes back and every time they open the game; a stuck one can be re-checked from the dashboard.
- [x] Follow `docs/LIVE_CHECK.md`: switch the real-map game on (database, Vercel settings, Paystack) and try it on your phone, step by step.
- [x] In the Supabase SQL Editor run `game-db/038_property.sql` (owning property on the real map: starting budget of ₥5,000, buying, homes, rent, treasuries). Until it's run, `/play?world=lagos` shows the map but buying won't work. Already ran it? Run it again: it is safe and sets the starting budget back to ₥5,000.
- [x] Then run `game-db/039_work.sql` (jobs on the real map, fares to work, neighbours; see `docs/WORK.md`). Until it's run, Work and neighbours won't load.
- [x] Then run `game-db/040_living.sql` (money pots and budget, bills, health, school, looks, essential services paid from tax; see `docs/LIVING.md`). Run it after 038 and 039 (and again if you ever run 038 again): the game's Money and Life screens need it.
- [x] Then run `game-db/041_your_day.sql` (side hustles, Body and Mind, exercise, interviews, breakthroughs; see `docs/DAY.md`). Run it after 040 (and again after 040 if you ever re-run 040).
- [x] Then run `game-db/042_starter_packs.sql` (starter packs paid through Paystack; see `docs/PACKS.md`). Paystack's webhook URL must already point at `/api/paystack/webhook` (it does for ads).
- [x] Then run `game-db/043_business.sql` (real businesses leasing buildings; see `docs/BUSINESS.md`). Leases and upgrades are paid through the same Paystack webhook.
- [x] Then run `game-db/044_services.sql` (services between people; see `docs/SERVICES.md`).
- [x] Then run `game-db/045_map_reports.sql` (players report map problems; you read them at `/map-reports` while signed in with the `ADMIN_EMAIL` email; see `docs/MAP_REPORTS.md`).
- [x] Then run `game-db/046_market.sql` (the player market: selling, offers, tenants, World Bank loans; see `docs/MARKET.md`). If you ever run 038 or 040 again, run 046 again after them.
- [x] Then run `game-db/047_ads_are_property.sql` (advertising is leasing a building: billboards included, a design you can swap, ends after a year or its taps; no mint for tapping ads; see `docs/BUSINESS.md`).
- [x] Then run `game-db/048_trips.sql` (going into a building costs the fare from where you last were).
- [x] Then run `game-db/052_marks.sql` (writing, reviews, trees, statues, time capsules on the map; see `docs/MARKS.md`). Run it after 051.
- [x] Then run `game-db/053_marks_rules.sql` (short writing, graffiti styles, the reputation limits). Run it after 052.
- [x] Then run `game-db/054_earnings.sql` (Finance's Overview: what you've earned, the tax on it, and each payment in). Run it after 053; already ran it? Run it again (it now leaves out home sales and adds the tax).
- [x] Then run `game-db/055_street.sql` (stealing, jail and bribes, pranks, rivals, gossip; see `docs/STREET.md`) and then `game-db/056_dating.sql` (dating, opt-in with a yes every time; see `docs/DATING.md`).
- [x] Then run `game-db/057_outdoor_chat.sql` (chat works in parks, plazas and at a landmark's main entrance).
- [x] Then run `game-db/058_course_done.sql` (a notification with congratulations when a course ends).
- [x] Then run `game-db/051_people.sql` (faces on the map, cards, doorsteps, while you were away, push; see `docs/PEOPLE.md`).
- [x] For notifications: run `node scripts/vapid-keys.mjs` once, put the three lines it prints into Vercel's environment variables (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), and redeploy.
- [x] Then run `game-db/050_economy_items.sql` (pay four times real wages, money by day for the Finance chart, things, the market, crafting, cars, reputation; see `docs/ITEMS.md`). Until it's run, the Things screens and the Finance chart stay empty.
- [x] Then run `game-db/049_reports_and_work.sql` (reporting people; up to 3 side hustles; pay that goes into wallets by itself every game week). Until it's run, starting a second side hustle and reporting a person won't work.
- [x] In Vercel, set `GAME_SECRET` to a long random string (seals interview answers and passes; without it the service key is used).
- [x] The rest of Lagos State baked (Badagry to Epe and the Lekki corridor, Agege, Ikorodu), with the real pedestrian crossings. Overpass answers cloud sessions only with a named User-Agent (the bake sends one).
- [x] Try the new 3D avatar studio (see `avatar-reference/docs/AVATAR_SPEC.md`): open the game with `?avatar3d=1` on your phone, tap your look, design and save. Only your browser gets it; `?avatar3d=0` switches it back.
- [x] In the Supabase SQL Editor run `game-db/035_fees_and_jobs.sql` (first-visit fees, train fares, jobs). Until it's run, places and trains stay free and Jobs won't load.
- [x] In the Supabase SQL Editor run `game-db/036_minigames.sql` (minigame rewards). Until it's run, the games all play but good scores pay no mint.
- [x] Then run `game-db/037_better_pay.sql` (each skill level adds 10% pay, was 5%). The tripled hourly pay works without it.
- [x] In the Supabase SQL Editor run, in order: `game-db/021_hourly_rounds.sql` (again), `022_pool_and_ads.sql`, `023_houses.sql`, `024_play_style.sql`, `025_big_towns.sql`, `026_friends.sql`, `027_streaks_levels.sql`, `028_hugs_gifts.sql`, `029_ghost_duels.sql`, `030_no_bot_ghost.sql`. (If 017–020 were never run, run them first.) Then merge the open pull request.
- [x] In Vercel, set `SPORTS_SECRET` to a long random string (once; don't change it later).
- [x] Test on a real phone: sounds, touch gestures, the water slide, club lights.

## Known bugs
None known right now. Fixed lately:
- [x] Escape on a computer closed every open window at once: now only the top one (`src/app/play/sheet.tsx`).
- [x] A business with no logo or picture got no billboard: it gets one with its name and what it's about.
- [x] Billboards looked washed out by day and dim at night: they show in their own colours all day.
- [x] Paid ads from the advertise page showed in every region: they can be for one state or everywhere (084).
- [x] Going to a friend less than 3 km away was a free walk and didn't move you: it's a ride from where you are, and you're there after.
- [x] Billboard views for businesses were under-counted: every view counts (084).
- [x] During the walkthrough, the ✕ on the quick buttons couldn't close them: it does now.

## Next (ideas agreed)
- [x] **Short-lived voice-call logins.** The relay server's login for voice calls (`NEXT_PUBLIC_TURN_USERNAME`,
  `NEXT_PUBLIC_TURN_CREDENTIAL`, used in `src/app/play/call/group-call.ts`) is in the browser code, so
  anyone could copy it and use the relay's bandwidth (it can't reach player data, but it can cost money).
  Instead the server hands each signed-in player a login that runs out after a few hours (the relay's
  shared-secret "time-limited credentials", or the TURN provider's API), kept in a server-only setting;
  then take the old login out of the public settings and change it at the provider.
- [x] **Walk inside your planned home** (`docs/HOME_PLANNER.md`, next steps): your own home on the map drawn from your plan, then your shop things placed in it, then visitors.
- [x] **2D characters for activities** (`docs/2D_CHARACTERS.md`): a 2D character drawn from your avatar with expressions (chat first), then the dance hall, boxing, basketball, football.
- [x] **The 3D characters' poses** (`docs/AVATAR_POSES.md`): sit, sip, eat, type, hug and handshake first, so seated characters and greetings switch to the new design; then work, games, street life, rides and feelings; then your own 3D avatar on the street and inside.
- [x] **The core thing: "Run your area".** One tap of **Respect** on anyone's home, car, mark, invention or prank (Newtown's "like"). Respect turns into reputation, and each week the most respected player in each neighbourhood becomes its **Don**: their name and a crown on the area for everyone to see. Work, buying, marks, pranks and dating all feed one goal: own your street.
- [x] Earning from reputation (coming soon on the Reputation screen): players above a reputation level share 50% of the app's revenue.
- [x] Coming soon (shown in the game): the whole of Nigeria on the map, then Africa, then the world; over a million building designs with more floors and landmarks; transformers and other everyday structures; better avatars; group conversations; rewards from real companies; posting videos and real-life content, politics, Easter eggs, real jobs, creator payouts.
- [x] Trees that grow the map's land outward; proposals, weddings, divorce and children (dating).

## Your life: moments, the wheel, badges and careers (agreed direction, `docs/LIFE_WHEEL.md`)
Moments become being alive: new situations every day, small to life-changing, with consequences now,
soon and much later. Every one is kept on your wheel; stories still going travel with you. Answers are
never simply right or wrong. Choices quietly shape six character sliders (both ends are fine), which earn
quiet badges; reputation, Trust, Fame and Legacy follow; careers grow or fail; other players are part of
your story and you of theirs. The old freshness plan (answer pools, never seen first, rarity, characters,
moments from parts, the Lagos calendar, player-written, monthly new ones, measuring) lives inside this.

Each phase is built in one go (a few hours to a couple of days); writing the stories is the slow part.

**Phase 1: fair answers, slower pace, starting to know who you are.** Built.
- [x] Every answer button looks the same (no green, gold and red), in a shuffled order.
- [x] Pools of up to 8 answers, at most 4 shown; only the ones shown can be chosen.
- [x] The new pace: at most 5 a day, at least 20 minutes apart; road moments on 1 trip in 4, in the same count.
- [x] Sizes (small, big at most every 3 days, life-changing) and rarity (rare about monthly, legendary about yearly); ones never had come first.
- [x] Every answer quietly nudges the six character sliders, fading with time (game-db/111; nothing shown yet).

**Phase 2: the wheel and the three layers.** Built.
- [x] The wheel (Me → My life): notches by part of life, the stories still going, who you're becoming in words, what came of each moment.
- [x] Eight short effects that wear off (Blessed, Lucky streak, Bad day, Talked about, Hurt, Under watch, Owed a favour, In debt), changing later outcomes.
- [x] Stories that travel with you: the next step finds you wherever you are, and is shown under the moment it came from.
- [x] 35 more answers across 24 everyday moments; outcomes that shift with who you are; 8 big and life-changing moments with 8 follow-ups.
- [ ] More answers for the rest (every moment up to 6 to 8), and more big moments (aim: 50).

**Phase 3: people who remember you and story arcs.** Built.
- [x] A cast of 40 for Lagos; how each feels about you, how far your story has gone, what you chose (game-db/113).
- [x] Stories for 9 of them (Mama Nkechi, Officer Bello, Baba Sule, Kunle, Chioma, Aunty Bisi, Coach Dayo, Ify, Uncle Sunday), branching on feeling.
- [x] Shared characters the world remembers (enough help and Mama Nkechi opens a shop; enough reports and Bello is dismissed); people who arrive over time.
- [ ] Stories for the other 31 characters, and later chapters for the first 9.
- [ ] Their faces in the trip film: the same officer, conductor or area boys every time (costumes per character).

**Phase 4: standing and quiet badges.** Built.
- [x] Who saw it decides reputation; Trust, Fame, Legacy and the "Most legendary lives" board; moments' reputation range −100 to +150.
- [x] 29 badges from patterns (character, mixed, story, people, fate), arriving quietly later, able to fade, private until shown on your card (game-db/114).
- [x] Four moments that only come to people known for something (Person of Honour, Hustler, The Judge, Open Hand).
- [ ] Trust lowering World Bank loan rates (the loan's rate is set in the database today, one for everyone).
- [ ] More badge-only moments, and career and people badges (phases 5 and 6).

**Phase 5: careers.** Built.
- [x] Start a business (10 kinds) from Me → My business or an invitation moment; hidden numbers in words; Idea → Stall → Shop → Brand → Empire.
- [x] A day of business at a time, paying you your share, capped per stage; 16 business moments two or three a week; crises; closing; starting again (game-db/115).
- [x] Six career badges (Founder, First Profit, The Boss, Brand Name, Mogul, Comeback Kid); businesses count towards Legacy.
- [ ] A business at Shop taking a real building on the map, its sign up (docs/BUSINESS.md).
- [ ] More business moments for each kind (a suya spot's problems aren't a tech startup's).
- [x] Owner decided: no limit on an Empire's earnings, but harder to grow the bigger it is; the smallest cap is ₦150,000 a day (Idea), then ₦500,000, ₦1.5m and ₦5m.

**Phase 6: other players in your story.** Built, except group moments.
- [x] Four threads between two players: a loan, a lift in the rain, vouching for a job, a wallet you both saw (a dilemma).
- [x] Real money through gifts and their limits; nobody made to pay by another's choice; allies and rivals; who can be in your story (friends, anyone, nobody) (game-db/116).
- [x] Main Character and Ride or Die badges; being in others' stories counts towards Legacy.
- [ ] Group moments: everyone in the same club, party or church gets the same moment, and the group decides together.
- [ ] More threads (a business partnership between players, a rivalry over the same shop, a wedding invitation), and Connector (introducing two players who become partners).

**Phase 7: the freshness engine.**
- [ ] Moments built from parts, the Lagos calendar and your area, player-written moments, 20 to 30 new a month, measuring.

**Phase 8: going international.**
- [ ] Moments tagged by where they belong (anywhere, a country, a city), local casts, calendars and businesses,
  badges with a world name and a local one (Person of Honour / Omoluabi), translation.

**For the owner to decide:** how many a day; badge names and private-by-default; the businesses to start
with; whether a business can fail completely; how big business income can get.

- [ ] **Door setting** in the home card: Open to everyone / Friends walk in (today) / Closed to all. Today the
  door is closed to strangers (they knock), friends walk in, and a home party opens it to all. About 1 day.

## Done lately
- [x] Search has a Budget row (Any, I can afford, under ₦5m / ₦20m / ₦50m / ₦250m / ₦1bn): it lists the homes and landmarks you could buy, cheapest first; landmarks show their price in search. Closing the walkthrough halfway leaves a small ? button to carry on where it was. Town Hall refreshes every 6 seconds (was 3) to save data. The search box now also finds the names players gave buildings and businesses straight away.
- [x] Landmarks: every one has a big name sign in front of its gate (nothing in front of it, a photo spot); going into one, you arrive at its entrance (Photo, Go inside). Unilag's campus faces its gate (no second gate); LUTH is a teaching hospital's grounds (8 × 7); the big landmarks are near their real size (most 4 to 10 tiles), drawn to fill their grounds. Fun places (clubs, restaurants, stadiums, funfairs, malls, parks...) show a little icon on the map from further out than the names.
- [ ] Players who bought a building where a landmark has now grown keep it (it still stands, inside the landmark's grounds). Check `game-db` property against the new landmark sizes if any complain.
- [x] Town Hall: replies, emoji reactions, an emoji picker, photos; delete your own for everyone, or someone else's for you (gone for everyone when 3 people delete it); everything gone after 24 hours. The button is just the icon. No jobs on the map or on people's cards. Marks on the city only for signed-in players. Landmarks: "Too expensive for you (for now)". Private messages are no longer deleted every day (the daily clean-up only takes what's over a week old).
- [x] Town Hall: one chat for everyone online in the state, from the orange button above the chat bubble (the walkthrough shows it). Profile photos instead of the drawn face (You › Profile photo). People's cards open at once (face and name straight away, the rest a moment later; cards opened before show in full). The dashboard can delete Town Hall messages and remove profile photos.
- [x] The walkthrough covers your look (Change my look). Around shows only people online now. Things › Assets shows where each property is (tap one to fly there), your free room included.
- [x] First visit: the map starts with just the place's name and Find a home; each button (house, chat, challenge, camera, wallet, profile...) appears when the walkthrough introduces it, and all of them once it's done or closed. The walkthrough says its card can be dragged anywhere, and inside a building it says to step out first (the Leave button glows, or "Take me out").
- [x] Find a home shows every home, the ones you can afford in green and first (no button to tap). Naming your home: the box sits at the top of the screen, above the keyboard and the walkthrough.
- [x] Signing in goes straight into the town (the town was loaded twice; now once, and if a slow network loses it, it asks again by itself). Opening the game no longer waits for the old hunt's clock or its searches.
- [x] Small phones: lighter 3D (no extra smoothing, sharpness 1×, 30 frames a second), the screen redraws every 15 s instead of every second, the whole page is fetched every 3 minutes instead of every minute.
- [x] Search finds everything: areas, landmarks, famous places, stations, main roads, businesses, and the names players give their buildings and homes.
- [x] Landmarks: the ground in front of every landmark's gate and name sign is kept open, so no building ever hides it (and a test checks every one in Lagos).
- [x] Dashboard: World Bank, top-ups, money made today, landmark owners, paid ads by region (with Stop), and the names players gave places (with Clear, for rude ones).
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
- [x] Step 2: bake Lagos's real coastline, lagoon, creeks, islands and main roads from OpenStreetMap, then all of Lagos State round it. Landmarks checked against the map.
- [ ] Landmarks in the first box the map has but the game doesn't yet (each would replace the buildings on its ground, so they wait for a decision): Lagos State Secretariat (Alausa), the Trade Fair Complex, Ojo Cantonment, the rest of LASU's Ojo campus.
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
