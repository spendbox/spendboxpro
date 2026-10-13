# Working on the real map

How players earn a living in Lagos, what getting to work costs, and how neighbours show. The
rules are in `src/lib/world/work.ts` (jobs, pay, skills, fares) and `src/lib/world/workplace.ts`
(where the jobs are); the database part is `game-db/039_work.sql`.

## Jobs

- **Who hires:** shops, plazas, shops-and-flats, office blocks, glass towers, warehouses, farms,
  building sites (labourers), and landmarks: markets, malls, hotels, hospitals, the airport, the
  port, universities, government buildings, museums, stadiums, clubs, parks and places of worship.
  Homes, empty land and unfinished buildings don't hire.
- **You need a home first.** One job at a time.
- **Pay is 18 times real Lagos wages** (what the job pays a month in naira, times
  `PAY_BOOST` in `src/lib/world/work.ts`), paid by the game day: a game month is 30 game days, a
  game day is 2 real hours (12 game days a real day). The lowest jobs (a farm hand, a market
  porter, a gardener: ₦60,000 a month) get ₥24 a game day, about ₥288 a real day before tax and
  fares; a shop assistant on ₦80,000 gets ₥32 (₥384 a real day); a pilot on ₦3m ₥1,200. That's
  well above what tapping about the city for free brings in, so a job is always worth having.
  (It was 4 times real wages until part 65, which raised the jobs people already had once.)
- **Pay waits up to a game week** (7 game days, 14 real hours). Come back at least that often to
  collect it from **Work**; anything older is lost.
- **Income tax** of 7% goes to the treasuries (70% Lagos State, 30% Nigeria).

## Skills and better jobs

Every game day worked adds to that job's skill (selling, office work, health care...). Levels
have no top: level 1 after 5 game days, 2 after 20, 3 after 45, then 80, 125, 180... Better jobs
need a level (a store manager needs selling level 3, a doctor health care level 6, a pilot
transport level 8), and every level pays 3% more.

## Getting to work

Two trips a game day, there and back, taken off your pay when you collect:

| Way | Fare a trip | How far it goes |
| --- | --- | --- |
| Walk | free | up to 3 km |
| Keke | ₦200 + ₦80 a km, at most ₦1,500 | up to 8 km |
| Okada | ₦300 + ₦120 a km, at most ₦3,000 | up to 15 km |
| Danfo bus | ₦300 + ₦40 a km, at most ₦1,500 | anywhere |
| Taxi | ₦1,000 + ₦300 a km | anywhere |
| My car | ₦200 + ₦110 a km (petrol and parking) | anywhere |
| Ferry (added on) | ₦1,000 + ₦150 a km on the water | to islands no road reaches |

A trip is the straight distance between home and work plus 30% (roads wind). Living near your
work saves money every day, which is part of why central places are worth more. If you move
home too far to keep going the way you chose, you're charged the danfo fare until you change it.
Where no road or bridge joins two places (Ilashe, Ibese and the other islands), the trip adds a ferry
crossing (`src/lib/world/trips.ts` works out which pieces of land join up). Fares go to the drivers
(outside the game), so that mint leaves the game.

## Neighbours

**Home** (top of the map) flies you home and shows who lives around you: players in your building
(with their flat or room) and players within about 600 m (how far away, never which flat).

## To change

- Wages: the tables in `src/lib/world/work.ts`.
- Fares: `FARES` in the same file.
- Tax, the most a job can pay, the dearest trip, how long pay waits: `game_settings` (`work_*`).

## Rides (Explore → Rides, game-db/061_ride_fares.sql)
Every ride costs its fare each time you board, from your Travel money (src/lib/fees.ts): the train
₦2,000, a lagoon ferry ₦2,500, a BRT bus ₦500, a taxi ₦3,500, the Ferris wheel ₦1,000, a water slide
₦500, a hot-air balloon flight ₦25,000, a helicopter tour ₦150,000. Fares are 2026 Lagos prices.
