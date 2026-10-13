# Money that comes to you

Tap your cash (top right) for **Your money** (`src/app/play/money-home.tsx`): what you have, today's
daily gift, where today's money came from, and what to spend it on.

## The daily gift (once a day, Lagos time)
Worked out by the server (`src/lib/world/daily-gift.ts`, `POST /api/daily-gift`), paid and capped
by the database (`game-db/073_daily_money.sql`, `daily_gift_claim`, at most `daily_gift_max` mint):

| Part | Naira |
|---|---|
| Every day | 2,000 |
| Time in the city yesterday | 500 per full 10 minutes, up to 2 hours (6,000) |
| Days in a row | 300 a day, up to 7 (2,100) |
| Weeks playing | 100 a week, up to 20 weeks (2,000) |
| Reputation | times 1 to 2 (double at 200) |

A new player gets ₦2,300; the most is ₦24,200. It pops up once a day a few seconds after the game
opens, and it's always in Your money. Opening it also leaves a message in the Newtown chat.

**Time in the city** counts only active minutes: the game pings `POST /api/active` at most once a
minute, only while it's in front of you and you've touched it in the last 2 minutes, and the
database counts one a minute at most (`active_ping`, up to 10 hours a day).

## Newtown's prize for a challenge won
Every challenge won (at least two people put a stake in) also pays the winner `challenge_bonus`
mint (₦5,000 in Lagos), up to `challenge_bonus_daily` (5) wins a day. A trigger on `challenges`
pays it, however the game was settled.
