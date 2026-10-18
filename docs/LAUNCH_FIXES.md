# Launch Ready: 1,000 Players

The fixes to make before opening Newtown to 1,000 players, from the full review of October 2026.
Ticked off here as they're done (most urgent first). Prices and limits: docs/COSTS.md.

## Stage 1: money cheats (urgent)
- [x] **1. Challenge pool claims.** A lone early "I won" (or "draw") pays out after 2 minutes
  (game-db/070 `challenge_report`). Accept results only after the game really ended; a lone or
  disputed claim goes to a refund, never a payout.
  Done (game-db/124): paid only when the other players agree; no agreement in 3 minutes, stakes back.
- [x] **2. Colluding players.** In 3+ player games, one player naming a friend as winner pays at
  once (`v_owned`). Only a player conceding for themselves counts; otherwise a majority of the
  players not named. Limits on staked games for brand-new accounts (as for gifts).
  Done (game-db/124): a majority of the others still in; new accounts ₥500 a day into pools.
- [x] **3. Trip farming.** Every trip has an 8% chance of a free item, with no limit, and the
  starting point is taken from the phone (src/app/play/property-actions.ts `travelTo`). Use the
  stored position, roll the find in the database with a daily cap, and limit trips a minute.
  Done: the phone's spot counts only within 1.5 km of the stored one; finds rolled in the
  database, 3 a day, not on trips under 200 m; 10 trips a minute (game-db/124).
- [x] **4. Card games readable and moves fakeable.** The deck comes from a seed every phone gets,
  and table moves aren't checked (src/app/play/fight/channel.ts). Deal hands on the server
  (each player sees only theirs) and check who sent each move.
  Done for Whot! (the one card game; src/app/play/games/whot-actions.ts, game-db/124 whot_games):
  dealt, refereed and paid by the server. Chess, draughts and the party games still run on the
  phones (their boards aren't secret, and the result needs the other players to agree).
- [x] **5. Online pay farmed by scripts** (/api/active `online_ping`). Pay only for activity the
  server sees, or lower the rate.
  Done (game-db/124): a minute is paid only if the server saw you do something in the last 20
  minutes (a trip, a message, a moment, a game, spending). The rate is unchanged.

## Stage 2: players getting stuck
- [x] **6. Chess and draughts freeze** after a lost move or a reload, and late watchers see a
  frozen board (src/app/play/minigames/turn-table.tsx). Keep the move list and catch up from it
  (as Whot! does), plus a timer for each move.
  Done (src/app/play/minigames/turn-table.tsx): every phone keeps the moves; one that opens late,
  reloads, watches or misses a move asks and catches up (a catch-up can only add moves, never
  rewrite them). 90 seconds a move at chess and draughts, 60 for map challenges: then the
  computer plays it.
- [x] **7. "You're still in another game" for up to 45 minutes** when phones disagree on the
  result. Settle a dispute as a draw (stakes back) after about 3 minutes; Play shows Open / Leave
  for the game you're stuck in.
  Done: a dispute is stakes back after 3 minutes (game-db/124); Play shows Open it / Leave it.
- [x] **8. Hosting position trusted** (anyone can notify a far-off area). Take it from the
  player's stored position.
  Done: a game is hosted where the phone says only within 1.5 km of the stored position, else
  there (hosting, challenging everyone, inviting). Events still go where you pick: that's the point.
- [x] **9. Small ones:** a starting game's notice says "ended"; Back while paying still opens the
  game; Watch does nothing while you're in a game.
  Done: a game waiting to start says "Starting now"; Back while paying stays back; Watch opens the
  game you picked (closing it brings yours back).

## Stage 3: cost and phone speed
- [x] **10. "Who's online" for the whole city** (`city-online`, `rooms:`): every arrival goes to
  everyone, guests included. Count online from the minute's ping, room counts per area, no live
  channel for guests. (The main cost risk, and the 500-connection limit.)
  Done: on the real map no `city-online` (the count is the server's, kept 30 s per server);
  who's in which place shared per 4 km area (`rooms:0:<area>`, src/app/play/rooms.ts; since then
  only within the building you're in, `rooms:0:b:<tile>`, the map's numbers from game-db/127); guests
  open no live channel. About 141M Realtime messages a month at 1,000 daily players down to about
  4.5M ($340 a month down to nothing over the 5M included). The numbers: docs/COSTS.md, "Live
  channels".
- [ ] **11. The city keeps drawing behind full-screen games** (paintball, chess, draughts). Pause
  it while one is open.
- [ ] **12. Chess, draughts and paintball at full quality on cheap phones.** Use the city's phone
  settings; draw the board only when something moves; free paintball's graphics memory after
  each match.
- [ ] **13. Presence redraws the whole screen.** Only update when the numbers change, at most once
  a second.
- [x] **14. Paintball sends 8 updates a second.** 4 to 5, and only when someone moved.
  Done: 4 a second, once a second standing still; Police & Thieves 3 a second (was 5).
- [x] **15. Polling.** The games-near-you list shared per city for a few seconds; poll less now that
  changes are pushed; the tutorial check every 30 to 60 s.
  Done: games near you every 2 minutes (and on a new notice), bills and market 5, news and who's
  online 3, missions 30 s; the city's buildings only what changed, every 5 (game-db/125).
- [ ] **16. Play button on 360px phones** may sit over "Find a home"; make room in that row.

## Stage 4: before opening the doors (settings, no code)
- [ ] Supabase: database on **Small** ($15), **spend cap off**, check the login uses the newer
  **JWT signing keys** (so each call doesn't ask Supabase Auth).
- [ ] Run game-db/121, 122, 123 and 124 (TODO.md).

## Police & Thieves (new, docs/POLICE_THIEVES.md)
- [ ] **17. Results come from the phones.** The pool is paid only when the losing side's phones
  agree (or by medians), but a hacked app can still fake hits mid-match. Before big pools: a game
  server that decides hits.
- [ ] **18. Realtime messages.** A full 8 v 8 is about 0.8m messages a match. Watch the Supabase
  bill after the first week; the game server above fixes this too.
- [ ] Run game-db/123 (TODO.md).

## Later
- [ ] The `ledger` gets a row per player a minute: add it up by the hour.
- [ ] TURN relay password in the app's code: use only the short-lived ones from /api/turn.
- [ ] Admin sign-in: lock out after a few wrong tries.
- [ ] Update docs/COSTS.md (about 10 calls a minute, and Realtime messages).

Expected monthly cost at 1,000 players after these: about $70 to $130 (₦110k to ₦200k); as it
is now, $145 to $1,755 (mostly Realtime messages).
