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
