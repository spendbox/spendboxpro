# 100 minigames for Newtown

**All 100 are built** (`src/app/play/minigames/`). This page started as the wish list; the tables
below are the original ideas, and `registry.ts` is the final word on how each one plays.

How they're used:

- **Games button** (in the menu, and inside every place or ride): all 100, by category, with
  the ones that suit the place you're in under **Here**. Search by name.
- **Ways to play:** score games: alone, several people taking turns on one phone, or a
  challenge to someone in the same place (both play the same level on their own phones; best
  score wins). Board and card games: against the computer, pass and play, or online against
  someone here (moves are sent between phones).
- **Rewards** (`game-db/036_minigames.sql`): bronze, silver and gold scores pay ₥2, ₥4 and ₥6, for
  up to 10 games a day, once every 45 seconds per game. Leaderboards for every game.
- **Heists:** the bank robbery has a "job" step: two stealth games (three for the big job, ending
  with the getaway drive), picked from the heist category. Fail one and the alarm goes off.
  `HeistChain` (heist-chain.tsx) chains any games for any future heist.
- **Jobs:** "Work a shift" plays a game that matches your job's skill (haggling or
  stacking in a shop, drinks orders in a bar, hacking in an office, ...). A medal score earns a tip.

Columns: **Solo** = how it plays alone. **Multi** = how it plays with others (H2H = head to head,
Room = everyone in the place at once, Team = two sides, Turns = pass and play / take turns,
Co-op = together against the game).

## Heists and side quests (crime caper, all cartoon and harmless)

| # | Game | Where | Solo | Multi |
|---|------|-------|------|-------|
| 1 | Safe Cracker: turn the dial, feel for the click | Bank vault (bank heist) | Beat the alarm timer | H2H race to open two safes |
| 2 | Laser Maze: slide through moving lasers | Bank, museum, jewellery shop | Clear without touching | Co-op: one guides, one moves |
| 3 | Wire Cut: pick the right wire before the bomb ticks down | Bank heist, police quest | Read the clues | Co-op: one has the manual, one sees the bomb |
| 4 | Getaway Driver: dodge traffic to the safe house | After a heist, car ride | Score by distance | H2H race through the same streets |
| 5 | Lock Pick: tap when the pins line up | Houses, lockers, cars | Pick 5 locks in a row | H2H: who picks faster |
| 6 | Hacker Grid: connect the pipes to bring the cameras down | Bank, office tower | Beat the clock | Team: each player holds part of the grid |
| 7 | Guard Patrol (stealth): sneak past torch beams | Museum, mansion | Reach the jewel | Co-op crew of up to 4 |
| 8 | Pickpocket Bump: time a bump-and-grab in a crowd | Market, train station | Score streak | H2H: thief vs. watchful tourist |
| 9 | Disguise Match: pick the right outfit to blend in | Any heist briefing | Memory round | H2H: spot the impostor |
| 10 | Vault Code Memory: repeat a growing light pattern | Bank vault | Highest level | Turns, Simon-style |
| 11 | Police Chase: cops vs. robbers on the street map | City streets | Escape bots | Team: robbers vs. cops |
| 12 | Interrogation: spot the lie in three statements | Police station quest | Score streak | H2H: lie and detect |
| 13 | Fingerprint Match: find the matching print | Detective quest | Beat the clock | H2H race |
| 14 | Spot the Difference: CCTV stills | Detective / spy quest | Beat the clock | H2H race |
| 15 | Hide the Loot: hide in a room, others search | Any building | Find the bot's loot | Room: hide and seek |
| 16 | Diamond Grab: claw-machine style lift from a glass case | Jewellery shop | 3 tries | H2H: most carats |

## Sport and fitness (venues around town)

| # | Game | Where | Solo | Multi |
|---|------|-------|------|-------|
| 17 | Free Throws: swipe to shoot | Basketball court, arena | 10 shots | H2H: HORSE |
| 18 | Penalty Shootout | Football pitch, stadium | Beat the keeper bot | H2H: shooter vs. keeper |
| 19 | Keepy-Uppy: tap to juggle the ball | Pitches, parks, beach | Highest count | Room: last one standing |
| 20 | Swim Race: tap in rhythm for strokes | Pool, water park, beach | Beat your time | H2H / up to 6 lanes |
| 21 | High Dive: flips and a clean entry | Swimming pool | Score from judges | Turns, judges' scores |
| 22 | Sprint 100m: alternate taps | Stadium track | Beat the record | Up to 8 lanes |
| 23 | Hurdles: tap to jump in time | Stadium track | Clean run | Up to 8 lanes |
| 24 | Long Jump: speed then angle | Stadium | Best of 3 | Turns |
| 25 | Javelin / Shot Put: power and angle | Stadium | Best of 3 | Turns |
| 26 | Shooting Range: pop the targets | Shooting range, fairground | Score in 30s | H2H on the same targets |
| 27 | Clay Pigeon: shoot the flying clays | Countryside, shooting range | 25 clays | Turns |
| 28 | Duck Hunt: classic flying ducks | Lakes, countryside, arcade | Rounds get faster | H2H: split screen ducks |
| 29 | Archery **(built)** | Gyms, parks | Score in 6 arrows | Turns |
| 30 | Darts **(built)** | Bars, pubs | 501 / around the clock | H2H 501 |
| 31 | Mini Golf | Parks, rooftops | 9 holes, par | Up to 4, turns |
| 32 | Bowling | Bowling alley, mall | 10 frames | Up to 4, turns |
| 33 | Table Tennis | Gym, office, school | Beat the bot | H2H |
| 34 | Tennis Rally | Tennis courts, parks | Rally count | H2H |
| 35 | Boxing Pads: punch the pads as they light | Gym, boxing arena | Combo score | H2H combo battle |
| 36 | Arm Wrestling: tap faster | Bars, gyms | Beat the bot | H2H |
| 37 | Tug of War: tap in rhythm | Parks, schools, beach | Beat the bot | Team |
| 38 | Weightlifting: hold the bar in the green | Gym | Heaviest lift | Turns |
| 39 | Skateboard Tricks: swipe combos | Skate park, plazas | Trick score | H2H jam |
| 40 | Cycling Race: lean and pedal | Streets, countryside | Time trial | Up to 8 |
| 41 | Surfing: ride the wave | Beach, sea | Longest ride | H2H heats |
| 42 | Jet Ski Race | Lakes, sea, boats | Time trial | Up to 4 |
| 43 | Rowing Race: tap in rhythm | Lakes, river | Time trial | Team boats |
| 44 | Horse Race: keep the gallop in rhythm | Racecourse, countryside | Time trial | Up to 8 |
| 45 | Cricket Batting: time the swing | Pitches | Runs from 12 balls | H2H bowl vs. bat |
| 46 | Baseball Home Run Derby | Pitches (US towns) | Home runs in 10 | Turns |
| 47 | American Football Field Goal | Stadium (US towns) | Kick from further each time | Turns |
| 48 | Rugby Kick at Goal | Stadium (UK, ZA towns) | 5 kicks | Turns |
| 49 | Volleyball (beach) | Beach, parks | Rally count | 2 v 2 |
| 50 | Climbing Wall: tap the right holds | Gym, adventure park | Fastest to the top | H2H side by side |

## Classic board, card and table games

| # | Game | Where | Solo | Multi |
|---|------|-------|------|-------|
| 51 | Ludo | Houses, cafés, parks | vs. 3 bots | 2 to 4 players |
| 52 | Snakes and Ladders | Houses, schools | vs. bots | 2 to 4 |
| 53 | Draughts / Checkers | Parks, barbershops, cafés | vs. bot | H2H |
| 54 | Chess (blitz, 3 minutes) | Parks, libraries | vs. bot | H2H |
| 55 | Ayo / Oware (mancala) | Parks, markets (West Africa) | vs. bot | H2H |
| 56 | Whot! (Nigerian card game) | Bars, houses, buses | vs. bots | 2 to 6 |
| 57 | Crazy Eights / Uno-style | Bars, trains | vs. bots | 2 to 6 |
| 58 | Blackjack | Casino, bars | vs. dealer | Room at one table |
| 59 | Poker (Texas Hold'em, mint chips) | Casino | vs. bots | Up to 6 |
| 60 | Dominoes | Barbershops, parks, cafés | vs. bot | 2 to 4 |
| 61 | Backgammon | Cafés, houses | vs. bot | H2H |
| 62 | Monopoly-lite on the town's own streets | Houses, banks | vs. bots | 2 to 4 |
| 63 | Scrabble-style word tiles | Library, school, café | Best word score | 2 to 4 |
| 64 | Connect Four | Arcade, houses | vs. bot | H2H |
| 65 | Battleships | Harbour, navy ship, boats | vs. bot | H2H |
| 66 | Snap | Bars, buses | vs. bot | Room |
| 67 | Go Fish / Old Maid | Houses, schools | vs. bots | 2 to 4 |
| 68 | Mahjong solitaire / tiles | Tea houses, malls | Clear the board | H2H race |
| 69 | Rock-Paper-Scissors **(built, duels)** | Ghost duels, anywhere | Beat the bot | H2H |
| 70 | Tic-Tac-Toe / Noughts and Crosses | Schools, cafés | vs. bot | H2H |
| 71 | Pool / Snooker **(pool built)** | Bars, clubs | Clear the table | H2H |
| 72 | Air Hockey | Arcade, mall | vs. bot | H2H |
| 73 | Table Football (foosball) | Bars, offices | vs. bot | H2H or 2 v 2 |
| 74 | Shuffleboard / Bar Shuffle | Pubs | Closest to the edge | Turns |
| 75 | Bingo | Halls, churches, cafés | One card vs. the caller | Room |

## Arcade, party and quick reflex

| # | Game | Where | Solo | Multi |
|---|------|-------|------|-------|
| 76 | Reflex tap **(built)** | Arcade | Fastest time | H2H |
| 77 | Trivia **(built)** | Arcade, quizzes, job interviews | Score streak | Room quiz night |
| 78 | Whack-a-Mole | Fairground, arcade | Score in 30s | H2H on twin boards |
| 79 | Claw Machine | Arcade, mall | Win a prize | Turns |
| 80 | Fruit Slice: swipe the flying fruit | Market, juice bar | Score in 60s | H2H |
| 81 | Stack the Tower: drop blocks straight | Building sites | Highest tower | H2H |
| 82 | Endless Runner through the streets | Anywhere outside | Distance | H2H ghost race |
| 83 | Snake | Arcade | Longest snake | Room: snakes in one arena |
| 84 | Brick Breaker | Arcade | Clear levels | H2H split |
| 85 | Space Invaders-style | Arcade, spaceport | High score | Co-op 2 ships |
| 86 | Memory Pairs | Schools, libraries | Fewest flips | Turns |
| 87 | Charades with emojis | Parties, clubs | Guess the bot's | Room |
| 88 | Pictionary / Draw and Guess | Cafés, schools, art galleries | Guess the drawing | Room |
| 89 | Musical Chairs | Clubs, parties, houses | vs. bots | Room |
| 90 | Hot Potato: pass before it pops | Parks, parties | vs. bots | Room |
| 91 | Simon Says / Dance Copy (dance **built**) | Clubs | Copy the moves | Room dance-off |
| 92 | Karaoke **(built)** | Bars, karaoke rooms | Pitch score | Duets / Room |
| 93 | Rhythm Drums (talking drum, djembe) | Clubs, festivals, markets | Song score | Band of 4 |

## Life, town and job games (good for job shifts and quests)

| # | Game | Where | Solo | Multi |
|---|------|-------|------|-------|
| 94 | Order Up: cook the orders before they burn | Restaurants, food stalls (job shift) | Serve the rush | Co-op kitchen |
| 95 | Bartender Mix: follow the recipe | Bars (job shift) | Perfect pours | H2H |
| 96 | Taxi Rush: pick up and drop off fares | Taxis (job shift) | Fares in 2 minutes | H2H |
| 97 | Market Haggle: bargain the price down | Markets, malls | Best price | H2H buyer vs. seller |
| 98 | Fishing: wait, strike, reel | Lakes, river, harbour | Biggest catch | Room: fishing contest |
| 99 | Delivery Dash: deliver parcels around the block | Post office, shops (job shift) | Parcels in time | H2H |
| 100 | Treasure Hunt: follow clues round the town | Anywhere (town-wide quest) | Find the chest | Teams race |

## Notes for building them

- One shared frame for all of them (already in `src/app/play/activities/ui.tsx`): a start screen,
  a short countdown, the game, a score, and "Play again" / "Challenge someone".
- Multiplayer uses the room the players are already in (the chat room of the building or ride):
  "Challenge" sends a card to someone in the room, like ghost duels do.
- Mint stakes are optional and small; the house cut goes to the prize pool, like the sportsbook.
- Job shifts can reuse the life games (94 to 99) so a shift is something to do, not just a timer.
- Heist games (1 to 16) chain into a heist: 3 games in a row, fail one and the alarm goes off.
