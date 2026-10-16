# The Spirit Realm

A battle at the top of every hour (src/app/realm, src/lib/realm, game-db/118_spirit_realm.sql).
Players buy an army of soldiers, ghosts, angels, devils and more, pick the gate they start from,
and at 9:00, 10:00, 11:00... every army enters the realm at once and marches on the middle. The
last army standing wins the pool. Anyone can watch, signed in or not.

Open it from the menu (**Spirit Realm**) or at `/realm`.

## How a battle goes

1. **Get ready, any time before the hour.** The **Get ready** tab:
   - **Buy fighters.** Eight kinds, each with its price, health, power and speed (below). Up to
     100 of each kind and 300 in all.
   - **Upgrade weapons and armour.** Four levels each (none, then ₥25, ₥75, ₥160 in all). Each
     weapon level adds 20% damage, each armour level 20% health, for the whole army.
   - **Pick a gate.** Twelve gates round the arena's edge, numbered like a clock.
   - **Enter the realm.** The army is paid for from Fun money, then the wallet. Until the hour
     you can change it (paying the difference, or getting it back) or leave (all of it back).
     An army costs at most ₥3,000.
2. **At the hour, the battle.** The **Watch** tab opens by itself. Every army marches from its
   gate to the middle. Fighters go for the nearest enemy they can see and hit it until it falls.
   The list under the arena shows how much of each army is left. A battle lasts at most 2½
   minutes.
3. **The winner.** The last army standing, or the strongest one left when time runs out, takes
   **85% of everything spent in its arena**. The other 15% goes to the city (the World Bank).
   Everyone in the arena gets a notice saying how they did. An arena with only one army (nobody
   to fight) gives the money back.
4. **Watch again** any time: the last three battles are a tap away, and a replay can run at 2×.

**What happens in the realm stays in the realm.** Health, things, reputation and everything else
in the city are never touched. Only the money spent on the army (and the prize) is real.

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

The numbers live in `FIGHTERS` and `COUNTER` (src/lib/realm/fighters.ts). Changing them changes
every battle from then on (a battle already fought replays with the new numbers, but its prize
is never paid again).

## Many players at once, without slowing the game

- **Arenas of 30.** Armies fill arena 1, then 2, and so on, in the order they join (a seat
  someone leaves is taken by the next to come). With 3,000 players there are 100 arenas, all
  fighting at the same hour. The Watch tab has a button for each arena; yours opens first.
- **The phones play the battle, not the server.** A battle is worked out step by step from the
  armies and a seed, and comes out exactly the same everywhere (src/lib/realm/battle.ts uses
  only + − × ÷ and square roots, which every browser does the same). So a phone fetches an
  arena's armies once and plays the whole battle by itself, in step with the clock, so everyone
  watching sees the same moment. There's no stream of positions from the server.
- **One answer for every viewer.** Once a battle has begun its armies never change, so the CDN
  hands the same answer (`GET /api/realm?at=...&arena=...`) to everyone watching. Thousands of
  viewers cost the database next to nothing.
- **Paid once.** After the battle, the server plays each arena through once (a full arena of 30
  armies takes about 15 ms) and hands the places to `realm_settle`, which pays the winners in
  one go and never twice. This happens on the first look at the realm after the battle (about
  10 seconds after it ends), and the daily job (`/api/cron/daily`) catches any battle nobody
  looked at.
- **Other players' armies stay hidden** until the battle starts (only how many are waiting is
  shown), and no player's id is ever sent: armies are known by their place in the queue.

## Ideas for later (not built)

- Fighters you keep from one battle to the next, with weapons that level up over time.
- Choosing a formation or a target (go for the strongest, guard the archers).
- Teams of friends at neighbouring gates, sharing the prize.
- Second and third places paid too, and a Spirit Realm leaderboard and badges.
- Battles shown over the city map itself, with the realm drawn as a misty layer on the streets.

## Tested

- `src/lib/realm/tests/realm.test.ts` (part of `npm test`): prices, checking armies, the hourly
  clock, the same battle every time from the same armies (and played frame by frame), armies
  meeting in the middle, angels beating devils, swords passing through ghosts, upgrades, a full
  arena of 30 armies, and how long a battle lasts.
- `game-db/tests/realm.test.sql` checks the money against a real database with every part
  loaded (`psql -f game-db/tests/realm.test.sql`): joining, changing and leaving, arenas filling
  up, the 85% prize and the city's share, money back with nobody to fight, and settling twice.
