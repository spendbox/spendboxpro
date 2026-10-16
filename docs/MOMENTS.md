# Moments

Little stories that happen to you as you go round the city. An old woman by the road asks for
money. A wallet lies on the pavement. The waiter spills a drink on you. The DJ calls your name.
Each one has two or three choices, and what you choose can cost or bring money and reputation.
Some come back days later: the woman you helped returns with her grandson, the friend you lent
money to pays you back (or doesn't).

Where moments are going next (the wheel, consequences that last, character and quiet badges,
careers, other players in your story): `docs/LIFE_WHEEL.md`.

## When they come

- On the real map, signed in: the first one a few minutes after you start, then now and then
  (about every 20 to 40 minutes of play). Fewer, so each one matters (docs/LIFE_WHEEL.md).
- Going into a place makes one more likely soon after (one that fits there: a wrong bill in a
  restaurant, a plank challenge at the gym, the offering basket at church).
- Never while a card or a full-screen tool is open, while you're taking a photo or on a ride, or
  while the game isn't on screen. It waits and tries again.
- At least 20 minutes apart and at most 5 a day, street and road together (the server keeps to
  this). A big one (`size: "big"`) at most every 3 days.
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
25 you had last don't come again until you've had others, and ones you've never had are three
times as likely. Rare ones (`rarity`) come about monthly, legendary ones about yearly.

## The answers

- Every answer button looks the same, in a shuffled order (the same order for the same moment, so
  it doesn't jump about). Nothing gives the "right" answer away.
- A moment can have up to 8 answers; at most 4 are shown each time, so it plays differently next
  time. Only the answers shown can be chosen (the server checks).
- Each answer quietly nudges who you are: six sliders, Generous/Prudent, Bold/Careful,
  Straight/Street-smart, Community/Self-made, Forgiving/Firm, Traditional/Modern
  (`characterOf` in `src/lib/world/moments.ts`, kept with each moment by game-db/111). An answer
  says its nudges in `traits`, or they're guessed from its `tone` and what it does. Recent answers
  count most (half after 3 weeks), and it takes many to reach either end. Nothing shows yet; the
  wheel and badges come next (docs/LIFE_WHEEL.md).

## Your wheel

Me → **My life** shows your wheel (docs/LIFE_WHEEL.md): the last 120 moments you lived as notches
round a ring, newest at the top, coloured by the part of life they touched (`area`, or a guess
from where they happen) and longer for big ones. A notch that glows started a story whose next
step hasn't come yet. Tap one for what you chose, what happened, and what came of it later (the
follow-ups that came from it). In the middle, who you're becoming, in words; below, what's on you
now and the stories still going.

## People who remember you

A cast of recurring people (docs/LIFE_WHEEL.md, "The cast"): each character's moments are steps
of a story with you (`cast`, `step`). A step only comes when it's the one you're on, at most every
36 hours, and if they feel the right way about you (`feel`) and the city has done enough (or not
too much) for them (`world`). An outcome says how much more they like you (`bond`, −3 to 3), what
comes next (`next`; −1 ends it) and whether it counts as the city helping or hurting them
(`world`). People you know come back twice as often as strangers turn up.

## Standing and badges

From what you've lived, the game works out Trust, Fame and Legacy and your badges
(`src/lib/world/standing.ts`, names in `life-badges.ts`; docs/LIFE_WHEEL.md sections 5 and 6), at
most every 5 minutes after an answer and whenever you open your wheel. An outcome can say how much
it moves Trust (`trust`). A moment with `badge` only comes to people who have that badge.

## Short effects

An outcome can leave something on you for a while (`effect`): Blessed and Lucky streak make good
outcomes likelier, a Bad day bad ones; Talked about makes people a little wary; Hurt means no
sport moments; Under watch brings more police stops on the road; Owed a favour and In debt are
about someone. They wear off by themselves (`EFFECTS` says how long). An outcome can also be
`likelier` for people who are a certain way (strongly street-smart, say) or while an effect is on
them, so the same answer doesn't always turn out the same.

## What they do

- **Money:**
  - Paying comes from your Fun money, then your wallet. A choice you can't afford is greyed out.
  - Money you get goes to your wallet, at most ₦300,000 a day from moments.
  - Amounts grow a little with your level (richer people get asked for more).
- **Reputation:**
  - Choices people would admire raise it a little, and ones they wouldn't lower it.
  - At most 10 a day either way, and between −100 and +150 from moments in all.
  - Only what people saw counts: an outcome marked `unseen` (you kept the wallet and nobody saw)
    shapes who you are and your Trust, but not your reputation.
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
- `size`: optional, `big` or `life` for turning points (default small);
- `rarity`: optional, `uncommon`, `rare` or `legendary`;
- `text`: one or more ways to tell it;
- `choices` (up to 8; at most 4 are shown): each with an optional `traits` nudge, and `outcomes`, where each outcome has a `chance`, `pay` or `get` (times the
  amount), `rep`, and optionally `follow`.

The tests (`src/lib/world/tests/moments.test.ts`) check that every moment is complete, that
follow-ups exist, and that every kind of place has moments by day and by night.

## Where the code is

| What | File |
| --- | --- |
| The moments, picking one, filling it in, rolling the outcome, effects, who you are | `src/lib/world/moments.ts` |
| Big and life-changing moments, and their follow-ups | `src/lib/world/big-moments.ts` |
| The cast (people who remember you) | `src/lib/world/cast.ts` |
| The cast's stories with you | `src/lib/world/cast-moments.ts` |
| More answers for everyday moments | `src/lib/world/more-answers.ts` |
| Your wheel (Me → My life) | `src/app/play/moments/wheel-sheet.tsx` |
| Picking and settling on the server | `src/app/play/moment-actions.ts` |
| The card over the map, and when it comes | `src/app/play/moments/moments-layer.tsx` |
| The card itself (also in the trip film) | `src/app/play/moments/moment-card.tsx` |
| Moments on the road | `src/lib/world/road-moments.ts` |
| The books: one at a time, the day's limits, follow-ups | `game-db/109_moments.sql` |
| Who you are: each answer's nudge | `game-db/111_character.sql` |
| The wheel: short effects, and where each story came from | `game-db/112_wheel.sql` |
| The cast: how each feels about you, and what the city has done for them | `game-db/113_cast.sql` |
| Standing and badges | `game-db/114_standing.sql` |
