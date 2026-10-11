# The player market

Players trade property with each other, rent waits for a tenant, and the World Bank lends.
Database: `game-db/046_market.sql`. Game: `src/app/play/market-actions.ts`, `src/lib/world/market.ts`.
Screens: a building's card (Buy, Offer, Sell) and Money → Property (tenants, sales, offers, loan).

## Selling
- Put any unit you own up for sale at your price (not your home: live somewhere else first).
- Anyone can buy it at that price. The buyer pays the price plus the 3% purchase tax; the seller
  gets the price less a 2% sale tax. Both taxes go to the treasuries. Mint moves between players;
  nothing is made or burned.
- A tenant living there stays with the new owner. The seller's rent up to the sale is collected first.
- Sales by players show at the top of Find a home ("For sale by players").

## Offers
- Offer any price for a unit another player owns (not their home). The offer and its tax are held
  from your wallet (Savings tops it up) until it's answered.
- The owner sells, says no, or asks for more (a counter). You can pay the counter or withdraw.
- Unanswered offers lapse after 24 real hours. Whenever an offer ends without a sale, the held mint
  comes back. If the unit sells to someone else, every other offer on it is given back.
- At most 5 open offers each.

## Tenants
- Letting a unit out starts a search for a tenant. Rent only comes in once they move in.
- Rent level: Cheap (85% of fair, a tenant in about 1–2 hours), Fair (in a few hours), High (120%,
  takes much longer). Changing it while let means finding a new tenant.

## World Bank loans
- Borrow up to half of what your property cost, against all of it, paid back over 6, 12 or 24 game
  months at 24% a game year. A game month is 60 real hours (2.5 real days).
- Each payment comes from Savings, then the wallet. Pay early any time.
- Selling a unit the loan rests on pays the bank first.
- Miss 3 payments in a row and the bank takes the property behind the loan (it goes back to the
  city, so anyone can buy it again). If that included your home, you'll need a new one.
- The World Bank is a treasury (`wb`) that opened with ₥5,000,000; repayments and interest go back
  into it.

## Numbers (game_settings, safe to change)
`property_sale_tax` 0.02, `offer_hours` 24, `offers_open_max` 5, `tenant_wait_hours` 4,
`loan_rate` 0.24, `loan_ltv` 0.5, `loan_month_hours` 60, `loan_misses` 3. The same numbers are in
`src/lib/world/market.ts` for the screens and the test page.
