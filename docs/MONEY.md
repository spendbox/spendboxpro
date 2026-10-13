# Money

Real Lagos prices, modest money. A bus is ₦500, a phone ₦350k, a Camry ₦22m, so money means what it
means in Lagos; you get it from a small daily gift, games, events and top-ups, so the big things
(a flat, a car, a duplex) are worth working or paying for.

Tap your cash (top right) for **Your money** (`src/app/play/money-home.tsx`): what you have, today's
daily gift, where today's money came from, and what to spend it on.

## Starting
A new life starts with ₦250,000 and a free room to live in (docs/STARTER_ROOMS.md).

## The daily gift (once a day, Lagos time)
Worked out by the server (`src/lib/world/daily-gift.ts`, `POST /api/daily-gift`), paid once a day and
capped by the database (`game-db/073_daily_money.sql`, `daily_gift_claim`, at most `daily_gift_max`):

| Part | Naira |
|---|---|
| Every day | 5,000 |
| Time in the city yesterday | 1,000 per full 10 minutes, up to 2 hours (12,000) |
| Days in a row | 1,000 a day, up to 7 (7,000) |
| Weeks playing | 250 a week, up to 20 weeks (5,000) |
| Reputation | times 1 to 2 (double at 200) |

A new player gets ₦6,000; a keen one (an hour a day, a week in a row, a month in) about ₦20,000;
never more than ₦50,000. It pops up once a day a few seconds after the game opens, and it's always
in Your money. Opening it also leaves a message in the Newtown chat.

**Time in the city** counts only active minutes: the game pings `POST /api/active` at most once a
minute, only while it's in front of you and you've touched it in the last 2 minutes, and the
database counts one a minute at most (`active_ping`, up to 10 hours a day).

## Games
- Challenge stakes: ₦1,000, ₦5,000, ₦20,000 or ₦50,000 each; the winner takes 90% of the pot.
  Challenging again within 8 minutes costs ₦50,000.
- Newtown's prize for a challenge won: `challenge_bonus` mint (₦2,000), up to 5 wins a day (only
  real games: at least two people put a stake in). A trigger on `challenges` pays it.
- The first steps: ₦20,000 each (docs/FIRST_STEPS.md).

## Prices
`src/lib/world/price-level.ts` holds two levers (everyday things; things you own) that can lift a
whole group of prices at once. Both are 1: real prices. Homes cost a tenth of real Lagos land plus
the real cost of building, so a home of your own is within reach.
