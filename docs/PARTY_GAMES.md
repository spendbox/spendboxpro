# Party games: Truth or Dare and Impostor

Two more games at a game table (docs/GAME_TABLES.md), next to Whot!. Challenge someone from their
card (🍾 or 🕵️) or from a private chat (🃏, then pick the game), or challenge everyone nearby from
Challenge. Everyone puts the same stake in; most points at the end takes the pool (less a tenth,
as for every challenge). Level at the top is a draw: stakes back. Both are full screen, with
voice (these games are better out loud), chat, watchers and a timer on every move.

No database update is needed: both use the challenges of parts 70 and 110 as they are.

## Truth or Dare (2 to 6 players)

A nightclub stage: the players round an oval, a bottle in the middle, spotlights sweeping.

1. Whoever holds the bottle taps **Spin the bottle**. It spins and stops on someone. Every round
   it stops on everyone once.
2. They pick **Truth** or **Dare** (a dare scores double). The card flips over.
3. They answer:
   - a truth: type the answer;
   - a dare: do it on the voice call (or in the chat), then **Done it**;
   - **Swap card** once a game, or **Chicken out** (minus 1 point).
4. Everyone else judges, one after another: **Accept** or **Veto**. Each player has two vetoes for
   the whole game, and most of the judges have to veto for it not to count. A stamp says how it
   went: ACCEPTED, VETOED or CHICKEN.
5. The cards get hotter each round: Chill (1 point), Spicy (2), Extra (3); dares double. Three
   rounds with up to three players, two (Chill, Extra) with more.

Cards: `src/lib/party/truth-dare-cards.ts` (one line each; every dare can be done from a phone).

## Impostor (3 to 6 players)

A spy thriller. Three rounds, a different impostor each round.

1. A board of twelve words in a category (Naija food, Around Lagos, At the owambe...). Everyone
   but the impostor is told which word it is, under a flap you tap to peek at.
2. Round the table (twice with four or fewer), everyone gives a one-word clue.
3. Everyone taps who they think the impostor is. A drumroll, and the reveal.
4. Points: +1 to everyone who voted for the impostor; +3 to an impostor who gets away (a tie lets
   them go); a caught impostor guesses the word on the board, +2 if right.

Two players can't play it (each would know who it is): the host's Start now waits for three, and
an invitation keeps its three minutes for others to join. If the time runs out with two, it's a
draw and the stakes come back.

Who the impostor is and the word come from the server's secret (`src/app/play/fight/party-actions.ts`),
not from the game's seed, and each phone is only told its own part until the reveal.

Boards: `src/lib/party/impostor-words.ts` (twelve words each).

## Where the code is

| What | File |
| --- | --- |
| The rules (same on every phone, tested) | `src/lib/party/truth-dare.ts`, `src/lib/party/impostor.ts`, tests in `src/lib/party/tests` |
| What the tables share: moves, catching up, the computer for anyone gone, lobby, voice, chat, result | `src/app/play/games/party-table.tsx` |
| The tables | `src/app/play/games/truth-dare-table.tsx`, `src/app/play/games/impostor-table.tsx` |
| Impostor's secrets | `src/app/play/fight/party-actions.ts` |
| The game picker when you challenge someone | `src/app/play/fight/whot-invite.tsx` |

## Next: ideas to talk about

Not built yet. Ideas for burning money and for something everyone votes on every hour.

### Things that burn cash (money that leaves the game for good)

In the party games (one small database update each):
- **Buy your way out** of a dare: 25% of the stake, burned, and no minus point.
- **Double dare**: pay to send the card back harder (Extra heat, triple points if they do it).
- **Peek** in Impostor: pay to see one player's vote early, or to get one word crossed off the board (impostor only).
- **VIP table**: pay to host with gold felt, a bigger stake cap and your name in lights to watchers.
- **Tip the table**: watchers throw money onto the table; half to the winner, half burned.

Around the city:
- **Bottle service** in clubs: champagne towers, sparklers, your name on the screen (pure burn, big status).
- **Rename the hour**: the winner of an auction names the next hour ("Tunde's Hour") on every phone.
- **Statues and murals**: pay to put your face on a landmark for a week. The price doubles for whoever replaces you.
- **Private jet / yacht hire by the hour**: arrive somewhere and everyone nearby sees it.
- **Billboard takeovers**: one minute of every screen in a state.
- **Fireworks over the city**: everyone sees them, with your name.
- **Insurance, fines and bail**: losing a dare, being caught as the impostor too often, police at the club.

### Hourly votes (9:00, 10:00, 11:00...)

Every hour on the hour the whole city (or state) votes on what happens next hour. It costs a little
to vote (burned) and more to vote again (each extra vote costs double), so it's a money sink and
a reason to open the game every hour. Ideas for what's on the ballot:

- **The hour's rule**: double pay at work / free fares / half-price clubs / taxes doubled.
- **Mayor of the hour**: the top-voted player gets a crown on the map and picks one city effect.
- **Who goes to jail**: three nominated players (from reports or most-wanted), the city decides.
- **Weather**: rain (taxis cost double, clubs fill up), sunshine (beach party), harmattan.
- **Where the party is**: the winning club gets a free DJ, more dancers and double spraying for an hour.
- **Market prices**: which kind of thing goes up or down 10% next hour.
- **The breaking news**: pick tomorrow's headline from three, and the city plays it out.
- **Bet on the vote**: put money on the winner, the losers' money burns, winners split a pool.

A good first one to build: **the hour's rule**, three choices on a big card at the top of the
hour, ₦1,000 to vote, the result shown at :02 with a countdown to the next vote.
