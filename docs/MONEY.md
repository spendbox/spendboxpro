# Money that comes to you

Tap your cash (top right) for **Your money** (`src/app/play/money-home.tsx`): what you have, today's
daily gift, where today's money came from, and what to spend it on.

## The daily gift (once a day, Lagos time)
Worked out by the server (`src/lib/world/daily-gift.ts`, `POST /api/daily-gift`), paid and capped
by the database (`game-db/073_daily_money.sql`, `daily_gift_claim`, at most `daily_gift_max` mint):

| Part | Naira |
|---|---|
| Every day | 300,000 |
| Time in the city yesterday | 100,000 per full 10 minutes, up to 2 hours (1.2m) |
| Days in a row | 100,000 a day, up to 7 (700,000) |
| Weeks playing | 50,000 a week, up to 20 weeks (1m) |
| Reputation | times 1 to 2 (double at 200) |

A new player gets ₦400,000; a keen one (an hour a day, a week in a row, a month in) about ₦2m;
the most is ₦6.4m. Sized against the city: you start with ₦9.75m, a flat costs ₦5–15m, a car
₦9–60m, and a middling job paid about ₦2m a real day. It pops up once a day a few seconds after the game
opens, and it's always in Your money. Opening it also leaves a message in the Newtown chat.

**Time in the city** counts only active minutes: the game pings `POST /api/active` at most once a
minute, only while it's in front of you and you've touched it in the last 2 minutes, and the
database counts one a minute at most (`active_ping`, up to 10 hours a day).

## Newtown's prize for a challenge won
Every challenge won (at least two people put a stake in) also pays the winner `challenge_bonus`
mint (₦150,000 in Lagos), up to `challenge_bonus_daily` (5) wins a day. A trigger on `challenges`
pays it, however the game was settled.

## Prices
Prices follow the money (`src/lib/world/price-level.ts`, `game-db/074_price_level.sql`). Real Lagos
prices, times:

| What | Times | Examples |
|---|---|---|
| Everyday things: rides, trips across the map, club entry, pranks, fines, bribes, the most a pickpocket takes | 10 | bus ₦5,000, taxi ride ₦35,000, balloon ₦250,000, helicopter ₦1.5m, clubs up to ₦200,000, a prank ₦10,000–50,000, a pickpocket fine ₦400,000 |
| Things you own: shop items, cars, homes | 3 | phone ₦1.05m, Corolla ₦27m, Camry ₦66m, a flat in Mushin about ₦16m, in Ikoyi about ₦48m |

New lives start with three times the money (₥19,500, ₦29.25m), and the starter packs give three
times the mint for the same real price, so a first home is still within reach. The commute to
work stays at real prices while jobs last. Things already owned keep what they were bought for.
