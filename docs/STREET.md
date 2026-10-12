# The street

Rules and prices: `src/lib/world/street.ts`. Game: `src/app/play/street-actions.ts` (and
`item-actions.ts` steal for shops). Screens: `src/app/play/people/street-dating.tsx`, the doorstep
(`people/doorstep.tsx`) and the news's Gossip tab (`life/news-sheet.tsx`).
Database: `game-db/055_street.sql` (tests: `game-db/tests/street.test.sql`).

## Stealing
- **From a shop** (Things, Shops: Steal on anything up to ₦50,000). Two taps: the first says the
  risk. About 4 in 10 are caught: a fine of three times the price, 10 reputation, peace of mind.
- **From a player** (Steal on their card). Two taps again. About 1 in 3 are caught; more if
  they're online right now (they notice), less if it's the middle of the night.
  - Got away: 5% of the cash in their wallet (at most ₦20,000), or if their wallet is empty, one
    of their small things (not a car, not something up for sale or in a time capsule). You still
    lose 1 reputation (people talk). They're told someone picked their pocket, not who.
  - Caught: a ₦30,000 fine, 5 reputation, they're told it was you, and it's in the gossip column.
  - Money kept in your budget pots (the bank) can't be stolen: only your wallet.
  - Players are safe for their first 3 days. 5 tries a day, and the same person once a day.
    Nobody who has blocked you (or whom you blocked).
- **Jail**: being caught (at a shop or a pocket) means jail 1 time in 4: 2 hours with no travel,
  no stealing and no pranks. A **bribe** (₦25,000) gets you out 7 times in 10; if it doesn't, the
  money's gone anyway. Walking out early sometimes makes the gossip column.

## Pranks
From someone's card (they need a home): egg their door (₦2,000), toilet-paper the house (₦3,000),
glitter bomb (₦5,000), fake parcel (₦2,000), sticker the gate (₦1,000), air horn at dawn (₦1,500).
You can leave a note with it. When they come back to the game, the prank plays out on their screen (eggs splat on the door, toilet paper rains down, glitter bursts, the parcel pops, stickers slap on, the air horn shakes it all), then who did it, the note, and Clean it up or Prank them back (`src/app/play/people/prank-reveal.tsx`). 6 pranks a day, the
same door once a day.

## Rivals
Name someone your rival from their card (Rival). They're told; when they name you back it's a
proper rivalry, and it's in the gossip. Rivals on your phone shows each rival and the score this
month: pranks pulled and pockets picked, each way. Up to 10 rivals.

## The gossip column
News, Gossip: the last week's street news for the city: who was caught, who went to jail, who
bribed their way out, rivals' pranks, new rivalries, new couples and break-ups (only when both
people allow it, in Dating). People you've blocked are left out.

## Settings (game_settings)
steal_per_day 5, steal_catch_pct 35, steal_cash_pct 5, steal_new_days 3, jail_pct 25,
jail_hours 2, bribe_ok_pct 70, prank_per_day 6, steal_rep 1, steal_caught_rep 5.
