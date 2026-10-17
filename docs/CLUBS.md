# Clubs

Inside a club (`src/app/play/city/interiors.ts`, the `club` part): big rooms, packed dance
floors, and four designs so they don't all feel the same. Which design a club has comes from
its key, so everyone sees the same club.

| Design | What it looks like | Size |
| --- | --- | --- |
| Crystal | Red and magenta faceted walls, a waving canopy of crystal lights over the floor, glowing crystal pillars, velvet curtains, a gold light strip round the floor | 30 × 22 m, 7 m high |
| Ice | Violet and cyan, a cyan crystal canopy, lantern chandeliers, pink velvet booths | 28 × 22 m, 6.5 m high |
| Gold lounge | Gold mosaic pillars, a ceiling of warm mirror panels, teal sofas, standard lamps, red velvet, karaoke | 28 × 20 m, 5.5 m high |
| Warehouse | Brick, steel trusses hung with lights, shipping containers, a giant LED screen, green lasers | 36 × 26 m, 9 m high |

Every club has:
- a big dark glossy dance floor with a strip of light round it that pulses on the beat, and
  patterns of light (gobos) turning and drifting across it (no light-up tiles, no mirror ball);
- beams of light sweeping from the ceiling, and lasers (not in the gold lounge);
- the DJ on a stage at the back, speaker stacks, a big screen with the club's name;
- a long backlit bar with shelves of bottles and stools;
- rows of booths along the walls behind a glass rail, champagne and fizzing sparklers on the tables;
- three pole stages by the dance floor (a glowing disc, a chrome pole up to the ceiling, a pink
  spotlight). A dancer of the club's own is on one of them;
- a crowd: up to 44 people dancing (26 on lighter phones) besides the regulars and the players.

## At the door

Every club charges to get in (paid once, good for 24 hours, the money burned; never a home's
party room). Which club charges what is fixed by where it is (`src/lib/fees.ts`):

| Price | Shown as | How many clubs |
| --- | --- | --- |
| ₦250,000 | Club | 4 in 10 |
| ₦500,000 | Premium club | 3 in 10 |
| ₦1,000,000 | VIP club | 2 in 10 |
| ₦10,000,000 | Billionaire's row | 1 in 10 |

Famous clubs have their own price instead (a landmark's `door`, src/lib/world/regions): in Lagos,
**Quilox** (Ozumba Mbadiwe Avenue) and **Vaniti** (Adeola Odeku Street) on Victoria Island, and
**Cubana** in Ikeja GRA, all ₦10m (Billionaire's row). Placed from their listings (approx).

Run `game-db/118_club_fees.sql` for the ₦10m doors: until then a door charges at most ₥1,000 (about ₦1.5m).

## Pole dancing

Tap a pole (or pick **Pole dance** in the dance moves): you dance at the next free pole. Everyone
in the club sees you there. Anyone can open the dance floor's **Spray money** and spray you.

## Spraying money, for real

When someone sprays, the notes fly in 3D (`src/app/play/city/money-spray.ts`): flicked one after
another from the sprayer's hand at the dancer, fluttering and turning as they fall, then lying in
a pile round the dancer's feet for 40 seconds. The more money, the more notes. (The flat shower
of notes over the screen only shows where there's no 3D room.)

## Bottle service

At a club's bar, the menu opens on **Bottles**: champagne, cognac and tequila at real Lagos club
prices (`src/lib/world/bottles.ts`), from Belaire Rosé (₦250k) and Moët (₦450k) up to Ace of Spades
(₦5m) and the 3-litre Ace of Spades Jeroboam (₦30m). The ₦10m-door clubs (Quilox, Vaniti, Cubana
and Billionaire's row) charge 1.5×, VIP clubs 1.2×. Up to 6 bottles an order, paid from Fun money
then savings and burned (`game-db/126_bottle_service.sql`, the server works out the bill).

Sit in a booth first. Then the show (`src/app/play/city/parade.ts`), seen by everyone in the club:
- a line of hostesses in sparkly dresses walks in from the way in, single file, one per bottle,
  each holding her bottle up high with a sparkler fizzing on top;
- in front, one carries a light-up LED sign on a pole with your name ("BOTTLE SERVICE · TOLU"),
  flashing pink, blue and gold;
- they line up round your table facing you and dance with the bottles up, then set them down in
  an ice bucket on your table (its sparklers fizz on a few seconds) and walk back out;
- the whole club gets a news line: "🍾 Tolu just ordered 2 × Moët & Chandon Impérial!".
