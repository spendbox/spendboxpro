# Moments

Little stories that happen to you as you go round the city. An old woman by the road asks for
money. A wallet lies on the pavement. The waiter spills a drink on you. The DJ calls your name.
Each one has two or three choices, and what you choose can cost or bring money and reputation.
Some come back days later: the woman you helped returns with her grandson, the friend you lent
money to pays you back (or doesn't).

## When they come

- On the real map, signed in: the first one a minute or two after you start, then one every four
  to nine minutes.
- Going into a place makes one more likely soon after (one that fits there: a wrong bill in a
  restaurant, a plank challenge at the gym, the offering basket at church).
- Never while a card or a full-screen tool is open, while you're taking a photo or on a ride, or
  while the game isn't on screen. It waits and tries again.
- At least 3 minutes apart and at most 15 a day (the server keeps to this).
- The cross (or **Walk away**) closes one without choosing. Nothing happens.

## Where

| Where | Some of what can happen |
| --- | --- |
| The street | Mama by the roadside, a lost child, a wallet on the ground, danfo change, area boys, sudden rain, a dance-off, suya at night, a pickpocket, a stranded student, a "prophet", the lottery kiosk |
| Home | NEPA takes light, a neighbour wants sugar, Uncle's "small emergency", a mystery parcel, a football through the window, estate dues, the water seller |
| Restaurants and bars | The bill is wrong, a birthday at the next table, a spilled drink, the chef's special, someone eating alone, a great waiter |
| Clubs | The DJ calls your name, the VIP table, the bouncer |
| Gyms and sport | A plank challenge, a personal trainer, the bench hog, a stray ball |
| Markets and shops | Too much change, jara from a trader, two traders fighting over you, a child who wants sweets |
| Churches and mosques | The offering, "pray with me", an owambe invitation |
| Parks and beaches | Ludo under the tree, a horse ride, litter, a stuck kite |
| Offices and other places | A colleague's loan, praise from the boss, the office birthday collection |
| Anywhere | A scam call, a friend who wants to borrow, money in an old pocket, and a fan who recognises you (level 5 and up) |

There are 64 moments for these places, 7 of which only come back as follow-ups, and 55 more on the
road, acted out in the trip film (docs/TRIPS.md). Each is told one of a few
ways, with a name, an amount and the place filled in, so the same one rarely reads the same. The
25 you had last don't come again until you've had others.

## What they do

- **Money:**
  - Paying comes from your Fun money, then your wallet. A choice you can't afford is greyed out.
  - Money you get goes to your wallet, at most ₦300,000 a day from moments.
  - Amounts grow a little with your level (richer people get asked for more).
- **Reputation:**
  - Kind choices raise it a little and mean ones lower it.
  - At most 10 a day either way, and between −40 and +60 from moments in all.
  - It's its own part of your reputation (`moments` in `reputationOf`).
- **Chance:** many choices are a gamble (stand up to the area boys, take the plank bet, stake on
  the lottery). The server rolls what happens, never the phone.
- **Follow-ups:** some outcomes bring another moment back half a day to two days later, with the
  same person.

## Adding more

Add a moment to `MOMENTS` in `src/lib/world/moments.ts`:

- `spots`: where it can happen;
- `time`: optional, day or night only;
- `minLevel`: optional;
- `ask`: the amount range in naira;
- `text`: one or more ways to tell it;
- `choices`: each with `outcomes`, where each outcome has a `chance`, `pay` or `get` (times the
  amount), `rep`, and optionally `follow`.

The tests (`src/lib/world/tests/moments.test.ts`) check that every moment is complete, that
follow-ups exist, and that every kind of place has moments by day and by night.

## Where the code is

| What | File |
| --- | --- |
| The moments, picking one, filling it in, rolling the outcome | `src/lib/world/moments.ts` |
| Picking and settling on the server | `src/app/play/moment-actions.ts` |
| The card over the map, and when it comes | `src/app/play/moments/moments-layer.tsx` |
| The card itself (also in the trip film) | `src/app/play/moments/moment-card.tsx` |
| Moments on the road | `src/lib/world/road-moments.ts` |
| The books: one at a time, the day's limits, follow-ups | `game-db/109_moments.sql` |
