# Winding streets

Streets don't run dead straight between junctions any more. The asphalt winds gently from side
to side inside its strip of tiles, with dusty verges either side (`waveOf` in
`src/lib/city/layout.ts`, drawn in `basePartsFor` in `src/app/play/city-view.tsx`).

- **Nothing moves.** Which tiles are road is exactly as before, so no building, address, plot or
  owned property changes. Only where the road is drawn on its tiles, and where cars drive, changed.
- **A stretch** is the straight run of road between two junctions, bends, dead ends, expressways or
  water (cut into pieces of at most 16 tiles, at the same places whichever tile asks). It bends once
  or twice, smoothly (half or a whole sine wave), up to 0.17 of a tile off the middle, less on
  short stretches. Each end meets its junction dead centre, so streets join up.
- **Each straight tile** stores where the road's middle is at its start edge, middle and end edge
  (`Tile.wave`), and is drawn as verge plus two pieces of asphalt 0.6 wide through those three
  points, with a dashed centre line and street lights on the verge.
- **Junctions** are as wide as the streets meeting at them (asphalt in the middle and out to each
  street, verges on the corners), so the zebra crossings and traffic lights stay on them.
- **Cars** follow the same middle line (`waveAt` in `src/app/play/city/traffic.ts`), turning with it.
- Left straight: expressways, wide stretches of tarmac (real dual carriageways), causeways,
  bridges, and the tiles with a pedestrian crossing, road works or a broken-down car (they're
  drawn full width, so the winding road either side runs onto them).

Checked over 36,000 tiles of Lagos: neighbouring tiles always meet, every stretch starts and ends
centred, nothing goes further than 0.17 off the middle, and working it out takes under a second.

Next: real side streets from OpenStreetMap along their true lines.

## Power lines and hawkers

Close in (the same distance as the little houses on shared tiles), every straight street has power
lines: a wooden pole on the verge of each tile, always on the same side along a street, with a
crossbar and two wires running on to the next pole (`powerLine` in `src/app/play/city-view.tsx`).
Expressways have none. On about one winding street tile in seven, a hawker sits on the wider verge:
a big umbrella over a table of goods, a stool and a basin (`roadsideSeller`).
