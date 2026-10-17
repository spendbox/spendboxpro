# Police & Thieves

The first **scheduled game**: a big match every 8 hours, at **2am, 10am and 6pm Lagos time**
(01:00, 09:00 and 17:00 UTC). More scheduled games can be added the same way (`src/lib/scheduled.ts`
and the `sched_games` table).

Found on the map beside **Play** (the six table games): a siren button with a ring that fills up
as the next game comes closer, the time left under it, LIVE while one is on. (The list of the 100
small games is retired for now: `MINIGAMES_LISTED` in the registry.) Code: `src/app/play/cops/` (lobby `cops.tsx`, match `match.tsx`, world `world.ts`,
drawing `scene.ts`, connection `net.ts`), the shop and prices `src/lib/cops.ts`, the server
`src/app/play/cops-actions.ts` and `game-db/123_scheduled_games.sql`. Test page: `/cops-lab`
(`?view=lobby|ring|match|watch`, `?tod=day|dusk|night`, `?side=0|1`, `?secs=75` for a short one).

## How a game goes
1. **Sign up** for the next game any time before it starts: pick police or thieves. **Joining is
   free.** **The sides stay even**: a side can never get more than one ahead (the server
   refuses, the button says "ahead: pick the other"); you can switch to the smaller side, or pull
   out and get everything back.
2. **Buy your weapons and gear** in the Armoury before the start (you always have a pistol): SMG
   ₦20k, shotgun ₦30k, assault rifle ₦50k, sniper ₦80k, rocket launcher ₦120k (6 rockets),
   grenades ₦5k each (up to 6, 160 damage, 9 m blast), medkits ₦5k (up to 3), body armour ₦30k
   (**police get it free**), a **tank** ₦300k (call it in once: 700 health, a cannon: 240
   damage, 10 m blast). Rockets: 160 damage, 8 m blast. A blast hurts fully near its middle and
   still half at the edge, but not through solid cover. The price always comes from the server's copy of the list.
3. **Everything spent on gear goes into the pool**, less a tenth for the house.
4. **At the start** the players are shared into matches of up to **8 a side** (more players make
   more matches, round-robin, so each is even), each with its own pool and city. **Bots fill any
   gap** so every match is even and at least 4 v 4. Someone who signed up but isn't there is
   played by a bot until they arrive (it earns them nothing).
5. **The match**: 30 seconds to get ready, then 10 minutes. **Unlimited lives**: after every
   takedown you're back in 4 seconds at your base, with your weapons, until the time's up. Thieves stand in the bank's vault for
   2 seconds to crack a bag of money and carry it to their hideout (3 points; carrying slows
   you). Police guard the vault; a takedown is 1 point, a dropped bag taken back is 1. Police see
   a thief with a bag on their map. Most points when the time's up wins.
6. **The end**: the last moment is captured and shown with the leaderboard over it (Save the
   picture shares or downloads it). **The winning side shares its match's pool by activity**
   (damage, takedowns ×50, bags banked ×150, bags taken back ×60, time in the fight).
7. **Watching**: anyone can watch a match that's on (follow any player, or look from above).

## Sample games (to try it before the real thing)
At the top of the lobby, free, any time, no sign-in needed: **against bots** (as police or a
thief, 5 minutes), or **with friends**: one gets a code, the others put it in and Join, sides are
shared out in turn, bots fill the rest, and the first one in picks 3, 5 or 10 minutes and starts.
Every weapon and a tank to try; nothing to pay, nothing to win.

## How it looks and sounds
Everyone is their own 3D avatar (their face, skin, hair and build) in their side's uniform:
police in a navy shirt, cap, dark trousers and boots with a black POLICE vest; thieves in a black
hoodie, joggers, shades and a face mask. Arms hold the gun up where they aim. You're in full
detail, everyone else in the light version (so a full match stays smooth on a phone). Each gun
has its own shot (made in code: a crack, a body of noise, a thump and an echo off the
buildings), explosions boom and rumble; far-off shots are quieter, duller, and left or right.

## The city
260 m across: a grid of roads and 25 blocks. The bank in the middle, police HQ at the west end,
the thieves' hideout (warehouses, the getaway van) at the east, and between them a mix (from each
match's seed) of towers, houses, parks, container yards, markets, building sites and car parks,
with cars, buses and bins along the roads. Played in the sun (10am), at sunset (6pm) or at night
(2am: lit windows, street lamps, stars).

## Controls
Left thumb moves, right thumb looks; **tap to shoot** (or hold FIRE), AIM (SCOPE on the sniper),
DUCK behind low cover, JUMP, SWAP guns, RELOAD, grenade, medkit, TANK. **AUTO** aim (on by
default) gently pulls towards an enemy near the crosshair and helps shots land. Team chat (quick
messages or typed) and pings are only for your side. On a computer: WASD, the mouse, Space, C,
Q, R, G, H, T, F (ping).

## Trusting the result (money)
There's no game server yet: each phone says what its own shots hit (like paintball), and at the
end each phone sends the server who won and everyone's numbers. A side's win only counts when a
player on the **other** side's phone says so too (or, with people on one side only, most of
them); each player's share uses the **middle value** of what the phones said. If nobody agrees
within 3 minutes, everyone gets their part of the pool back. If bots win, the pool becomes the
**jackpot** for the next game's matches that have people on both sides. A changed (hacked) app
could still lie about hits during a match: a real game server is the fix (see below).

## Still to do
- A game server (Colyseus, docs/PAINTBALL_PLAN.md) so hits and results are decided off the phones,
  and so big matches don't run up Realtime messages (a full 8 v 8 sends up to 16 × 3 updates a
  second to 16 phones, fewer while players stand still: roughly 0.3m to 0.5m messages a match;
  3 games a day is about 30m to 45m a month at full rooms, $60 to $100 on Supabase's $2.50 a
  million).
- A push notification 10 minutes before each game for those signed up.
- Voice chat for teams (the call code could be reused).
- More scheduled games.
