# Challenges on the map

Group games played right on the map (src/app/play/fight, src/lib/world/challenges.ts,
game-db/070_challenges.sql). Built to be quick, social and a little addictive: one tap to throw
down a challenge, a minute to gather players, a game floating over the city, a pool for the winner.

## How it goes

1. **Events** (the party button, top right) › Host an event › **Game challenge**
   (docs/EVENTS.md). The first time, a pop-up explains the rules.
2. **Pick a game.** The picker is built for hundreds of games: a search box (names, blurbs and
   tags; accents don't matter, so "ayo" finds Ayò), shelves (All, Cards, Board, Party, Sports,
   Coming soon, each with a count) and a scrolling grid of tiles (icon, name, players). Games
   you can play now come first; the rest carry a "Soon" badge and can't be started yet.
   Whot! and Ludo play now. Whot! opens at its full-screen table (docs/GAME_TABLES.md), where
   you can also challenge one person directly from their card.
3. **Pick a stake (optional)**: what each player puts into the pool. "No stake" is the first pick
   and plays just for fun, with nothing in the pool. Or tap a quick pick (₦1,000, ₦5,000,
   ₦20,000, ₦50,000) or type any amount from ₦1,000 to ₦1,000,000, in the player's own
   currency (converted to mint). The card shows "You have X" (Fun money and wallet) and the
   button stays off when the stake (plus any fee) is more than you have. Everyone who joins
   pays the same stake.
4. **Challenge everyone nearby.**
   - Everyone within about 4 km gets a notice and a push.
   - Everyone playing nearby sees a pop-up card with a Join button and the time left.
   - A beam of light in the game's colour shines up from the spot on the map. It pulses fast
     while people can join and slowly while the game is played.
5. **One minute to join**, up to 4 players. If nobody joins, the stake comes back.
6. **The game floats over the map**, tilted a little and bobbing, with the players' faces above
   it (faded if they've left), a chat along the bottom and a voice call for the players
   (src/app/play/call, docs/VOICE_CALLS.md).
7. **The winner takes the pool**, less a tenth.
   - Every player's game works out who won, and the pool is paid once the players agree: more
     than half say the same winner, or a loser owns up.
   - If only one name is said and nobody disagrees for 2 minutes, that player is paid.

## The fee and the cooldown

- Your first challenge is free, and so is one after the cooldown (8 minutes).
- Challenging again sooner costs ₦50,000. The idea is that in between, you join other people's
  challenges.
- Fees, stakes and prizes come from your Fun money, then your wallet.

## Reputation

- 3 points for every challenge you win.
- 1 point for every challenge you hosted that was played to a winner (draws and called-off
  games don't count).
- Up to 120 points in all (src/lib/world/challenges.ts challengeRep, added in
  src/lib/world/items.ts reputationOf).
- The Challenge card shows this at the top, with your own challenge reputation out of 120; the
  waiting screen shows "Win: +3 reputation"; the result shows what that game added (e.g.
  "+4 reputation: +3 for the win, +1 for hosting"), less near the cap.

## Adding a game

One line in `CHALLENGE_GAMES` (src/lib/world/challenges.ts): id (kept in the database, 2 to 20
small letters or _), title, category, engine (null while it's coming soon), most players,
colour, icon, blurb, and optional search tags. Set the engine once its turn game
(src/app/play/minigames/turns) plays online for 2 or more players.

## How a game ends (and never gets stuck)

- **Normal finish.** Every player's game works out the result, and each phone tells the server
  and keeps telling it every few seconds until it's settled.
  - **Paid at once** when more than half agree, or when a loser's phone names the winner.
  - **If the others have closed the game**, a lone answer is settled after 2 minutes, by the
    phones still open or the next look at the map.
- **A draw** (Whot! can end in a tie): everyone's stake comes back.
- **Leaving mid-game** asks first.
  - With one other player, they win the pool.
  - With more, you lose your stake and the computer plays your seat.
- **Someone who disappears for 40 seconds** (closed the app, lost signal) is played by the
  computer from then on, so the game never freezes waiting for them.
- **When it's over**, the result stays on screen (confetti, the prize) with a big "Back to the
  map" button. It doesn't vanish by itself.

## Tested

- `game-db/tests/challenges.test.sql` checks the money and the rules against a real database:
  - free first, then the fee;
  - joining, starting, and calling off with stakes back;
  - three players agreeing, a loser owning up, a draw;
  - a lone answer settled after 2 minutes, and reputation.
- `src/lib/world/tests/challenges.test.ts` checks the game list, the picker's search and
  shelves, the stake limits, and the reputation each game adds.
- 6,000 simulated games of Whot! and Ludo (computer against computer, 2 to 4 players) all
  finished, never stuck.

## Safety rails

- One challenge at a time per player.
- Stakes are checked on the server (src/app/play/fight/challenge-actions.ts openChallenge:
  ₦1,000 to ₦1,000,000); the database also caps a stake at ₥10,000.
- Games nobody finishes in 45 minutes are called off and the stakes go back.
- Money only moves in the database (challenge_open, challenge_join, challenge_begin,
  challenge_report).

## Next

- **Jenga, in 3D with real physics.** This needs a physics library added to the project (e.g.
  cannon-es or Rapier), which needs an npm install.
- **Police and Thief** on the real streets.
- **Seats taken over** by a computer player when someone drops out mid-game.
- **Betting** on the winner while watching (watching itself is done: docs/GAME_TABLES.md).
- **Leagues** and a weekly leaderboard.

## Lights on the map, live
A game's or event's light on the map goes as soon as it's called off (and changes when it starts
or moves): whoever opens, starts, calls off or ends one nudges everyone in the city over a small
live channel (`src/app/play/map-news.ts`, "map:<region>"), and each phone looks again within a
few seconds. A nudge carries nothing but "games" or "events" (a fake one costs one more look). The
minute's ping also notices an event moved to another time (`/api/active` fingerprints the start
times too).
