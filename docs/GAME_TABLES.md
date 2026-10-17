# Game tables: playing people (Whot! first)

Challenge a player to a game for a stake, then play it full screen like a mobile card game, with
chat and voice. Others nearby can join before it starts, and anyone can watch. Whot!, chess and
draughts (on the 3D board), paintball (the 3D match, bots in the empty places), Truth or Dare and
Impostor play now (the party games: docs/PARTY_GAMES.md); Ludo and more are coming soon.

## How it goes

1. **Challenge someone.** On anyone's card, **Play a game with them**, or **🃏 Play** at the top of a private chat with them:
   - pick the game (Whot!, chess, draughts, paintball, Truth or Dare, Impostor);
   - pick a stake (₦1,000, ₦5,000, ₦20,000, ₦50,000, or type any amount up to ₦1,000,000);
   - the card shows what you have, and the button stays off if it's more than that.
2. **They're asked.** A green invitation card pops up for them straight away (a live knock, plus
   a notice and a push), with the stake, what the winner takes and the time left. Accept, or
   "Not now".
   - They have three minutes. If they say no (or the time runs out) and nobody else has joined,
     it's called off and your stake comes back.
3. **The lobby.** Your table opens at once: you VS them, the open seats, the stake and pool.
   - When they accept, it starts 15 seconds later. Anyone nearby sees "Ada vs Tunde: Whot! Hop
     in" and can join for the same stake (up to 4 players).
   - The host can **Start now** as soon as two are in, or call it off (stakes back).
4. **The game**, full screen, never scrolling, on a phone or a computer:
   - the green felt table, you at the bottom with your hand fanned to fit, the cards you can play
     lifted and glowing;
   - the others round the table with their cards face down, how many they hold, and "LAST CARD!";
   - the market and the pile in the middle (the last few cards scattered);
   - "Needs ⭐ Star" after a Whot;
   - big call-outs: HOLD ON!, PICK TWO!, PICK THREE!, SUSPENSION!, GENERAL MARKET!, CHECK UP!
   - a ring round whoever's turn it is runs down from 30 seconds; when yours runs out, you go to
     market by yourself.
   - Play a Whot (20) and pick the shape you need. Tap the market (or **Go to market**) to draw.
5. **Chat and voice.** Table talk (with quick lines: "Last card! 🃏", "Check up! 🏁"...), and
   messages pop up as bubbles by the sender's face. **Voice** joins the table's call (mute and hang
   up from the same place).
6. **The end.** The winner takes the pool (less a tenth), with confetti. **Rematch** challenges
   the same person again for the same stake. **Back to the map** closes it.

## Watching

- Games of Whot! being played nearby show a little "Ada vs Tunde are playing Whot!" with
  **Watch**.
- Watchers see the whole table, but every hand stays face down. They can chat too, and the
  players see how many are watching (👀).
- Anyone arriving late, or opening the game again, catches up: the players' phones send them
  every move so far.

## Rules of Whot! (as played in Nigeria)

Five cards each. Play the same shape or number as the top card; a Whot (20) goes on anything and
asks for a shape. Can't play? Go to market. 1 hold on (play again), 2 pick two, 5 pick three,
8 suspension, 14 general market (everyone else draws one). The first to empty their hand wins.
If the market runs dry, the lowest hand wins (stars count double).

## Fair play

- Whot! is dealt on the server (game-db/124, src/app/play/games/whot-actions.ts): the shuffle and
  everyone's hands stay there, each phone gets only its own hand, a move counts only from the
  player whose turn it is and only if the rules allow it, and the server pays the winner. A turn
  left to run out is a trip to market; two in a row, and the computer plays that seat.
- The other games: every phone plays the same game from the same shuffle; only the moves travel,
  and each move is checked against the rules.
- Money only moves on the server: the stakes, the pool, and the prize once the other players
  agree on who won (as for every challenge, docs/CHALLENGES.md).
- Someone gone for 40 seconds is played by the computer, so a game never freezes. Leaving
  mid-game with one other player gives them the pool.

## Where the code is

| What | File |
| --- | --- |
| The table: lobby, game, watching, chat, voice, result | `src/app/play/games/whot-table.tsx` |
| The cards (drawn like the real deck) | `src/app/play/games/whot-cards.tsx` |
| Whot!'s rules (shared with the minigames) | `src/app/play/minigames/turns/whot.tsx` |
| Challenging someone, the invitation card | `src/app/play/fight/whot-invite.tsx`, `fight.tsx` |
| Invite, accept, decline, start now | `src/app/play/fight/challenge-actions.ts`, `game-db/110_game_tables.sql` |
