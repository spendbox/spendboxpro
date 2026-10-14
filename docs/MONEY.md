# Money

Real Lagos prices, modest money. A bus is ₦500, a phone ₦350k, a Camry ₦22m, so money means what it
means in Lagos; you get it from a small daily gift, games, events and top-ups, so the big things
(a flat, a car, a duplex) are worth working or paying for.

Tap your cash (top right) for the **Wallet** (`src/app/play/money-home.tsx`): what you have, today's
daily gift, where today's money came from, and what to spend it on.

## Starting
A new life starts with ₦2,000,000 and a free home to live in (docs/STARTER_ROOMS.md), or richer with a starter pack (docs/PACKS.md).

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
in the Wallet. Opening it also leaves a message in the Newtown chat.

**Time in the city** counts only active minutes: the game pings `POST /api/active` at most once a
minute, only while it's in front of you and you've touched it in the last 2 minutes, and the
database counts one a minute at most (`active_ping`, up to 10 hours a day).

## Games
- Challenge stakes: the winner takes 90% of the pot.
  Challenging again within 8 minutes costs ₦50,000.
- Newtown no longer adds a prize for a win (`challenge_bonus` is 0, game-db/081): you win the pot.
- Challenge stakes can be any amount from ₦1,000 to ₦1,000,000 (docs/CHALLENGES.md).
- The first steps: ₦20,000 each (docs/FIRST_STEPS.md).

## Prices
Amounts show rounded (`tidy` in `src/lib/world/value.ts`): to the nearest ₦10 from ₦100 and the
nearest ₦100 from ₦10,000, so money stored in mint (₦15 a cent) doesn't show as ₦4,995.

`src/lib/world/price-level.ts` holds two levers (everyday things; things you own) that can lift a
whole group of prices at once. Both are 1: real prices. Homes cost a tenth of real Lagos land plus
the real cost of building, so a home of your own is within reach.

## The fresh start (game-db/075_fresh_start.sql)
Run once, on the day the simple life goes live. Everyone's money becomes ₦350,000 (₦250,000 plus a
₦100,000 founder bonus), savings pots are emptied, everyone gets the Founder badge and a message.
Homes, places, cars and things stay theirs; players with no home get a free room next time they
open the game. Everyone's old money is saved in `fresh_start_backup` first, and the file ends with
the (commented-out) lines that undo it. Running it again does nothing.

## Top-ups (game-db/076_topups.sql; amounts in src/lib/world/topups.ts: ₦1,000 is ₦5,000,000)
Tap your cash, then pick an amount. Paystack's pay box opens over the game (`src/app/play/paystack-popup.ts`),
so nobody leaves the site; if it can't open, Paystack's own page opens instead. Paid through Paystack
(`src/app/play/topup-actions.ts`); the money only
arrives once Paystack says the full amount was paid, and only once. Game money never turns back
into real money.

| Pay | Game money | Bonus |
|---|---|---|
| ₦1,000 | ₦5,000,000 | |
| ₦2,500 | ₦13,750,000 | +10% |
| ₦5,000 | ₦30,000,000 | +20% |
| ₦10,000 | ₦65,000,000 | +30% |
| ₦25,000 | ₦175,000,000 | +40% |

Your first top-up is doubled. The old starter packs are no longer offered (everyone starts the
same way, with ₦250,000 and a free room); packs already paid for still arrive.

## Renting (game-db/077_renting.sql)
Any home for sale can be rented instead of bought: 6% of its value a month, the first month paid
when you move in. Each month that comes due is paid when you open the game; if you can't pay, you
move out and get a free room again. Buying a home ends your lease; Move out on your home card ends
it any time.

## What your property earns (game-db/079_property_income.sql)
Every home, shop, office or plot you own (not a free room) earns 10% of what it cost from the city a day
(`property_income_day`), by itself. A sale between players, at whatever price, doesn't change
what it earns on (`income_base`), and when property changes hands both owners are paid what
they'd earned first (a trigger), so nobody is paid for time before they owned it. It's counted to the second and paid when the game opens, every
5 minutes while you play, when you open the Wallet, and before you buy property
(`POST /api/income`, `property_income_settle`). While you're away it keeps earning, up to 2 days'
worth. Your cash at the top goes up every 5 seconds as it earns (`src/app/play/income.ts`), and
Things → Assets shows each property, what it earns every 10 minutes and a day, and all it has
earned you, going up as you watch.

Buying property from the city is simply its price now (no buying tax), less your reputation
level's discount (docs/REPUTATION.md). Renting is no longer offered (leases already running carry on).

## Paying, and tracking payments
Pick an amount in the Wallet, then:
- **Bank transfer, right in the game**: Paystack makes an account for this one payment
  (`startTransferTopUp`, Paystack's Charge API with `bank_transfer`; "Pay with Transfer" must be on
  in the Paystack dashboard). The Wallet shows the bank, account number and amount (each with a
  copy button) and checks every few seconds until the money lands.
- **Card & more**: Paystack's pay box over the game (card, USSD, bank app).

**Your payments** in the Wallet lists every top-up: paid, waiting for Paystack, or not paid. Any
not yet paid from the last week is checked with Paystack again whenever the Wallet or the game opens,
and given if it went through (`myTopUps`), so a payment is never lost even if the pay box was closed
early or Paystack's webhook didn't reach us. (Set the webhook in Paystack → Settings → API Keys &
Webhooks to `https://<your site>/api/paystack/webhook` too.)

## Paid for being online (game-db/083)
Every active minute in the game pays ₦500 (`online_pay_minute`), up to 4 hours a day
(`online_pay_daily_minutes`), through the once-a-minute ping (`POST /api/active`, `online_ping`).
Your cash on screen counts it up every 5 seconds. Things › Assets shows it under "Rewards for
showing up", with the daily gift, challenge wins and missions.

## The World Bank (game-db/083)
One pot of everything the city takes from games: Newtown's 10% of every challenge pool and the
challenge fees (a trigger on the ledger, `world_bank_take`). It's in the Wallet, growing as games
are played. Stealing from it is coming soon. It opened with ₦1 billion (`world_bank_start`, game-db/084: put in once, as
an "opening" line in its ledger, never counted as a day's takings) and grows from there.
