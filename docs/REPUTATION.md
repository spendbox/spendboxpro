# Reputation levels

Your reputation (`reputationOf` in `src/lib/world/items.ts`) comes from your property, fine things and
cars you own, challenges (+1 for hosting a game that's played, +3 for each win, up to 120), and
marks people love, minus fines and marks voted down. It also multiplies your daily gift (up to ×2).

The higher it is, the higher your level (`src/lib/world/rep-levels.ts`), and each level takes
something off every property you buy from the city:

| Level | From | Off property |
|---|---|---|
| 🌱 New in town | 0 | |
| 👋 Familiar face | 20 | 2% |
| ⭐ Rising star | 50 | 4% |
| 😎 Big deal | 100 | 7% |
| 🏅 Local legend | 180 | 10% |
| 👑 City icon | 300 | 15% |

The server works out the price with your discount when you buy (`buyUnit`). The Reputation screen
shows your level, how far to the next, and every level.

Mind and body are gone: things you own only add reputation. Inventions no longer count.

## Taking part (game-db/093)

Reputation also grows, quietly, with taking part. Nothing announces it; it just shows in your
reputation (one line in the breakdown: "Taking part"), and up to 150 points can come from it:

| Part | Up to | What counts |
|---|---|---|
| Time | 50 | Minutes actively in the game each day (up to 4 hours a day count) |
| Talk | 40 | Real conversations: days you and someone both messaged each other |
| Kindness | 30 | Gifts given (3 a day count), hugs and handshakes given (5 a day count), and thanks for them |
| People | 30 | Friends (up to 10), different people reacting to what you say in the Town Hall, different visitors signing your guestbook |

To keep it fair and hard to game:

- Only the last 60 days count, and the older the less (worth half after about three weeks): it
  follows what you do now, and fades if you stop.
- Every part has diminishing returns (square roots and logs): the hundredth hour adds far less than
  the first, and conversations with many people count more than one long one.
- A message nobody answers counts for nothing; spamming earns nothing.
- It's worked out at most once an hour per player (`rep_engagement`), so it costs the game little.

Because reputation sets your discounts, your daily gift, and how many marks you can leave, all of
those follow too.
