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

## Pole dancing

Tap a pole (or pick **Pole dance** in the dance moves): you dance at the next free pole. Everyone
in the club sees you there. Anyone can open the dance floor's **Spray money** and spray you.

## Spraying money, for real

When someone sprays, the notes fly in 3D (`src/app/play/city/money-spray.ts`): flicked one after
another from the sprayer's hand at the dancer, fluttering and turning as they fall, then lying in
a pile round the dancer's feet for 40 seconds. The more money, the more notes. (The flat shower
of notes over the screen only shows where there's no 3D room.)
