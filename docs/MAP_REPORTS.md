# Map problem reports

Players can tell us when the map looks wrong, and we fix it.

## For players

- **Report a problem** (bottom-left of the map) reports the spot in the middle of the screen.
- Every building card has **Report a problem with this building**, and every landmark card **Report a
  problem with this place**.
- They pick what's wrong (a road missing or stopping short, a bridge or flyover, a building, a place
  missing or in the wrong spot, a name, water or land, something else) and can add a note.
- Up to 5 reports a day each; the same spot and problem only once while it's open.
- When a report is marked fixed, the player gets a thank-you notice.
- **People** too: every player has a small flag (Report) beside their Hug and Shake buttons, and every
  character's card has one. Reasons: rude or abusive, a scam or asking for money, a bad name or
  picture, looks or acts wrong (a glitch), something else; up to 10 a day, once per person while
  it's open, never yourself (`game-db/049_reports_and_work.sql`).

## For the owner

- Reports about people are at the bottom of the same page (**People**): mark each Actioned or
  Dismiss it.

- Open **/map-reports** while signed in to the game with an email listed in `ADMIN_EMAIL` (Vercel;
  several emails can be separated with commas).
- Reports are grouped by place (about 300 m), busiest first. Each shows what the player said, what the
  map shows there, and links to **See in the game** and the **Real map** (OpenStreetMap).
- **Copy the open ones for Claude** copies them as a list to paste in a chat; Claude adds the fixes to
  the region's corrections file (`src/lib/world/regions/lagos/corrections.ts`). When the fix is live,
  mark the report **Fixed** (with an optional note to the player), or **Won't fix** / **Duplicate**.

The database part is `game-db/045_map_reports.sql`; the rules and kinds are in `src/lib/world/reports.ts`.
