# Launch Ready: 1,000 Players

The fixes to make before opening Newtown to 1,000 players, from the full review of October 2026.
Ticked off here as they're done (most urgent first). Prices and limits: docs/COSTS.md.

## Stage 1: money cheats (urgent)
- [ ] **1. Challenge pool claims.** A lone early "I won" (or "draw") pays out after 2 minutes
  (game-db/070 `challenge_report`). Accept results only after the game really ended; a lone or
  disputed claim goes to a refund, never a payout.
- [ ] **2. Colluding players.** In 3+ player games, one player naming a friend as winner pays at
  once (`v_owned`). Only a player conceding for themselves counts; otherwise a majority of the
  players not named. Limits on staked games for brand-new accounts (as for gifts).
- [ ] **3. Trip farming.** Every trip has an 8% chance of a free item, with no limit, and the
  starting point is taken from the phone (src/app/play/property-actions.ts `travelTo`). Use the
  stored position, roll the find in the database with a daily cap, and limit trips a minute.
- [ ] **4. Card games readable and moves fakeable.** The deck comes from a seed every phone gets,
  and table moves aren't checked (src/app/play/fight/channel.ts). Deal hands on the server
  (each player sees only theirs) and check who sent each move.
- [ ] **5. Online pay farmed by scripts** (/api/active `online_ping`). Pay only for activity the
  server sees, or lower the rate.

## Stage 2: players getting stuck
- [ ] **6. Chess and draughts freeze** after a lost move or a reload, and late watchers see a
  frozen board (src/app/play/minigames/turn-table.tsx). Keep the move list and catch up from it
  (as Whot! does), plus a timer for each move.
- [ ] **7. "You're still in another game" for up to 45 minutes** when phones disagree on the
  result. Settle a dispute as a draw (stakes back) after about 3 minutes; Play shows Open / Leave
  for the game you're stuck in.
- [ ] **8. Hosting position trusted** (anyone can notify a far-off area). Take it from the
  player's stored position.
- [ ] **9. Small ones:** a starting game's notice says "ended"; Back while paying still opens the
  game; Watch does nothing while you're in a game.

## Stage 3: cost and phone speed
- [ ] **10. "Who's online" for the whole city** (`city-online`, `rooms:`): every arrival goes to
  everyone, guests included. Count online from the minute's ping, room counts per area, no live
  channel for guests. (The main cost risk, and the 500-connection limit.)
- [ ] **11. The city keeps drawing behind full-screen games** (paintball, chess, draughts). Pause
  it while one is open.
- [ ] **12. Chess, draughts and paintball at full quality on cheap phones.** Use the city's phone
  settings; draw the board only when something moves; free paintball's graphics memory after
  each match.
- [ ] **13. Presence redraws the whole screen.** Only update when the numbers change, at most once
  a second.
- [ ] **14. Paintball sends 8 updates a second.** 4 to 5, and only when someone moved.
- [ ] **15. Polling.** The games-near-you list shared per city for a few seconds; poll less now that
  changes are pushed; the tutorial check every 30 to 60 s.
- [ ] **16. Play button on 360px phones** may sit over "Find a home"; make room in that row.

## Stage 4: before opening the doors (settings, no code)
- [ ] Supabase: database on **Small** ($15), **spend cap off**, check the login uses the newer
  **JWT signing keys** (so each call doesn't ask Supabase Auth).
- [ ] Run game-db/121 and 122 (TODO.md).

## Later
- [ ] The `ledger` gets a row per player a minute: add it up by the hour.
- [ ] TURN relay password in the app's code: use only the short-lived ones from /api/turn.
- [ ] Admin sign-in: lock out after a few wrong tries.
- [ ] Update docs/COSTS.md (about 10 calls a minute, and Realtime messages).

Expected monthly cost at 1,000 players after these: about $70 to $130 (₦110k to ₦200k); as it
is now, $145 to $1,755 (mostly Realtime messages).
