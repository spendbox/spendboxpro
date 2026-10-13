# Fight: challenges on the map

Group games played right on the map (src/app/play/fight, src/lib/world/challenges.ts,
game-db/070_challenges.sql). Built to be quick, social and a little addictive: one tap to throw
down a challenge, a minute to gather players, a game floating over the city, a pool for the winner.

## How it goes

1. **Fight** (in the bar along the bottom, next to Locate me). The first time, a pop-up explains
   the rules.
2. **Pick a game**: Whot! and Ludo now; Jenga and Police and Thief are shown as coming soon.
3. **Pick a stake** (₦5,000, ₦20,000, ₦50,000 or ₦100,000): what each player puts into the pool.
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

- 1 point for every challenge you hosted that was played.
- 3 points for every challenge you won.
- Up to 120 points in all (src/lib/world/items.ts reputationOf).

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
- 6,000 simulated games of Whot! and Ludo (computer against computer, 2 to 4 players) all
  finished, never stuck.

## Safety rails

- One challenge at a time per player.
- Games nobody finishes in 45 minutes are called off and the stakes go back.
- Money only moves in the database (challenge_open, challenge_join, challenge_begin,
  challenge_report).

## Next

- **Jenga, in 3D with real physics.** This needs a physics library added to the project (e.g.
  cannon-es or Rapier), which needs an npm install.
- **Police and Thief** on the real streets.
- **Seats taken over** by a computer player when someone drops out mid-game.
- **Spectators** who watch and bet on the winner.
- **Leagues** and a weekly leaderboard.
