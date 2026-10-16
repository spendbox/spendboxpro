# The Spirit Realm

A battle on the city map every hour, lasting the whole hour (src/app/play/realm,
src/app/play/city/realm-layer.ts, src/lib/realm, game-db/118_spirit_realm.sql). Players buy troops
(soldiers, ghosts, angels, devils and more), place them on the map, and watch them fight in 3D.
Anyone can watch, signed in or not.

## Spirit mode

Tap **Spirit Realm** (the purple button in the row at the top of the map, or in the menu).

- **Everything else hides.** Traffic, people, pins, labels, bubbles and all the game's buttons go;
  only the city itself stays, under a dark purple sky. Taps on buildings do nothing.
- **The camera flies to your arena**: a glowing ring on the map, 160 m across from its middle,
  with a pillar of gold light at its heart. Pan, zoom and turn the map as usual.
- **A few controls only**: the clock (how long the battle has left), the scores, a button for
  each arena when there are several, **Send troops**, and **City** to go back.

## How a battle goes

1. **It starts on the hour** (9:00, 10:00...) and lasts until the next one. Troops can be sent in
   until 2 minutes before the end.
2. **Send troops.** Pick fighters (each has its price, health, power and speed, below), weapons
   and armour (+20% damage or health a level), then tap **Choose where they come in** and tap a
   spot inside the ring. **Send them here** pays (Fun money first, then the wallet).
3. **A portal opens** where you tapped: it pulses in your colour for 20 seconds (so every phone
   hears of the troops in time), then they come through and march on the middle. Fighters go
   for the nearest enemy they can see and hit it until one of them falls: arrows fly, angels
   shoot holy light, dragons breathe fire, and blows throw sparks.
4. **Send more any time**: up to 30 times a battle, at least 10 seconds apart, up to ₥3,000 in
   all (₥3,000 at most at once too).
5. **Wild spirits** (ghosts, wolves, a devil or a giant) come in from the edge every 5 minutes,
   more of them as the hour goes on, so there's always something to fight, even alone.
6. **Points**: every enemy fighter your troops bring down scores its price (wild spirits count).
   The scores show live.
7. **When the hour ends**, the top three of each arena share the pool (everything spent there):
   **50%, 23% and 12%**. The other 15% goes to the city (the World Bank). Everyone gets a notice
   saying how they did, and the next time they open Spirit mode a card shows their place and
   prize. An arena with only one player gives the money back.

**What happens in the realm stays in the realm.** Health, things, reputation and everything else in
the city are never touched. Only the money spent on troops (and the prizes) is real.

## The fighters

| Fighter | Price | Good at | Weak against |
| --- | --- | --- | --- |
| Soldier | ₥2 | Cheap and steady | Ghosts (swords pass through them), devils |
| Archer | ₥3 | Hits from far away | Falls fast up close |
| Spirit wolf | ₥4 | The fastest, first into every fight | |
| Ghost | ₥6 | Swords pass through it (takes half from soldiers, archers, wolves, giants) | Angels |
| Angel | ₥12 | Holy light from afar: double on ghosts, 1.75× on devils | Devils hit back hard |
| Devil | ₥12 | 1.25× on soldiers, 1.5× on angels | Angels |
| Giant | ₥25 | Huge health | Slow |
| Dragon | ₥40 | Fire from afar, huge power | Angels |

The numbers live in `FIGHTERS` and `COUNTER` (src/lib/realm/fighters.ts); the timings, limits and
prize shares in src/lib/realm/schedule.ts.

## Many players at once, without slowing the game

- **Arenas of 20.** Players fill arena 1, then 2, and so on, in the order they first send troops.
  Arenas sit side by side on the map, 400 m apart, all fighting at the same hour. With 2,000
  players there are 100 arenas.
- **The phones play the battle, not the server.** A battle is worked out step by step from the
  players, the troops they sent (each with the moment it comes through) and a seed, and comes
  out exactly the same everywhere (src/lib/realm/battle.ts uses only + − × ÷ and square roots,
  which every browser does the same). A phone asks for its arena's troops every 5 seconds and
  plays the battle itself, in step with the clock; troops arrive 20 seconds after they're sent,
  so every phone knows of them before they come through. Opening Spirit mode mid-battle plays
  the battle up to now in a moment ("Entering the realm…").
- **One answer for every viewer.** The CDN hands the same answer for an arena to everyone
  watching it (for 4 seconds), so thousands of viewers cost the database next to nothing.
- **Cheap to draw.** One 3D mesh per kind of fighter (all the soldiers in one draw), at most 8
  figures drawn per squad, one buffer for every shot and one for every spark. While Spirit mode
  is on, traffic, people and labels aren't drawn at all.
- **Paid once.** After the hour, the server plays each arena through once (a busy arena with
  160 sends takes about a quarter of a second) and hands the places and points to
  `realm_settle`, which pays in one go and never twice. This happens on the first look at the
  realm after the battle, and the daily job (`/api/cron/daily`) catches any battle nobody looked
  at.
- **No player ids** are ever sent to phones: players are known by their place in the queue.

## Ideas for later (not built)

- Choosing a target or a formation (go for the strongest, guard the archers).
- Teams of friends sharing an arena and a prize.
- Fighters that level up and are kept from one battle to the next.
- Sounds for the battle, and names floating over the biggest armies.

## Tested

- `src/lib/realm/tests/realm.test.ts` (part of `npm test`): prices, checking troops, the hourly
  clock, the same battle every time (and played frame by frame, and with troops heard of late),
  portals and marching, wild spirits, points, angels beating devils, swords passing through
  ghosts, and a full arena for a whole hour.
- `game-db/tests/realm.test.sql` checks the money against a real database with every part loaded
  (`psql -f game-db/tests/realm.test.sql`): sending troops (when, where, how much, how often),
  arenas filling up, the 50/23/12 prizes and the city's share, money back when alone, and
  settling twice.
