# Party games: proposing games and walking round (a plan, not built)

Today a game table takes the whole screen from the moment you sit down: you wait in its lobby,
play, and leave. The idea: a party (or any place) feels like a room full of people who suggest
games to each other, wander, chat, and drift into games.

## 1. Proposing a game
- **Tap anyone** (in the room or on their card): Propose a game, pick it (Whot!, chess, draughts,
  paintball, Truth or Dare, Impostor, Ludo...) and the stake. It's an open challenge for that
  place, with the seats you want.
- **A bubble over your head** that everyone in the place sees: "Whot! ₦2,000 · 2 of 4". Tap it to
  join. The person you asked also gets a pop-up.
- **"What's on here"**: a strip along the bottom of the room listing every open proposal (game,
  stake, seats left, who's in). One tap to join, one to wave it away.
- Proposing to the whole room: "Anyone for Impostor?" (no one in particular).

## 2. Walking round while you wait
- The lobby shrinks to a **floating card** (game, seats, who's in, a countdown once enough have
  joined): you keep walking, chatting and dancing.
- When it fills (or the host taps Start), the card says **Game on** and the game opens full
  screen. You can still say "1 minute" to finish what you're doing.

## 3. During and after
- **Minimise** a game in a pause (between hands of Whot!, between Impostor rounds) to walk round;
  your turn calls you back (a sound, the card pulses), and the timer still runs.
- **Tables in the room**: a game being played shows as a table with the players round it; walk up
  to watch (watchers already exist for table games).
- **Next game**: at the end, a vote for the next one ("Impostor? 3 yes") or a rematch, without
  going back to the lobby.

## 4. A party's game night
- The host can line up games ("Whot!, then Impostor, then paintball at 9"). The list shows in
  the party; a game starts when its time comes, and everyone in the party gets the pop-up.

## How it fits what's there
- A proposal is an open challenge (src/app/play/fight, docs/CHALLENGES.md) tied to the place, so
  the stakes, seats, fees and results stay as they are.
- Bubbles and the "What's on here" strip come from the room's live channel (activities/hub) plus
  the challenges list; the floating card is the table's lobby (PartyShell) drawn small.
- In stages: (1) proposals with bubbles and the strip; (2) the floating lobby; (3) minimise during
  a game; (4) tables to watch in rooms and the next-game vote; (5) game nights.
