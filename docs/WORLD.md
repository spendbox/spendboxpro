# The real-world map

The game is moving from a new made-up town every hour to one permanent world built on real
places. Lagos comes first. Later come other cities, then countries and continents, joined on the
same map so you can zoom out to the whole world and fly anywhere.

## The rules

- **One tile is 100 × 100 m everywhere.** Lagos is all of Lagos State: from Seme on the Benin
  border across to Epe and the far end of the Lekki peninsula, and from Agege and Ikorodu down to
  the coast (about 183 × 38 km, 1,831 × 378 tiles). It began as Ikeja to the coast, Festac to Ajah
  (45 × 25 km); the rest of the state was baked round that, which stayed exactly as it was.
- **A region's border:** land in its box but over its border (Ogun State, Benin round Lagos) isn't
  part of it: nothing is built or bought there, and the far map paints it as countryside. Water
  over the border stays water, so the Lekki Lagoon is whole.
- **A region** (a city now, countries later) has its own flat map centred on the middle of its
  area, so shapes and distances in it are true. Where it sits on the world map comes from its real
  latitude and longitude (`src/lib/world/geo.ts`).
- **Three rings round the camera, on a strict drawing budget** (`src/app/play/city/far-city.ts`):
  full detail for about 1.8 km each way; one plain block per building out to about 7 km; then one
  painted map of the whole region and the land and sea round it, out to the horizon. A frame
  stays around 350,000 triangles however far you zoom out (it was over 2 million). Open
  `/world-lab?stats` to see the numbers. Nothing is stored tile by tile. Every tile is worked out from the region's data the
  same way every time, so the city never changes unless its data changes.

## What a region is made of

Each region is a folder in `src/lib/world/regions/` (Lagos: `regions/lagos/`):

| File | What it holds | Who writes it |
| --- | --- | --- |
| `index.ts` | Name, area (latitude/longitude box), where the camera starts, its fixed seed | by hand |
| `districts.ts` | Parts of town and how built-up each is (VI and Lagos Island high-rise, Ikoyi leafy...) | by hand |
| `landmarks.ts` | Real landmarks: what, where (latitude, longitude), how big | by hand |
| `baked.ts` | Land, lagoon and sea, land over the border, the main roads, the long bridges, where the map data has each landmark | the bake script |
| `corrections.ts` | Fixes on top of all that | by hand |

The city layout (`src/lib/city/layout.ts`) fills in everything else between them: side streets,
houses, offices, shops, schools, churches and mosques, parks, billboards.

## Getting the map data (the bake)

```
npm run bake:world -- lagos           # uses the downloaded data if it's there
npm run bake:world -- lagos --fresh   # downloads it again
npm run bake:world -- lagos --grow    # after making the box bigger: bakes only the new land
```

This downloads the coastline, water, main roads, the state's border and landmark positions from
OpenStreetMap (`overpass-api.de`, or `overpass.private.coffee` when that one fails) and writes
`regions/lagos/baked.ts`. It prints a small text map to check by eye: `~` sea, `-` lagoon, `+`
road, `=` bridge, `x` over the border. The data is © OpenStreetMap contributors (ODbL), so the
game shows a small "© OpenStreetMap" credit in the corner wherever baked data is shown. The sea
and tidal water come from OpenStreetMap's coastline file, cut to the box first:
`python3 scripts/world/clip-water.py lagos <south> <west> <north> <east>`.

## Growing a region

The box can grow (Lagos did, from 45 × 25 km to all of Lagos State) without anything already
there moving, so nobody's property is touched:

- The **origin** never changes: every building's address is counted from it.
- `streetsFrom` keeps the side streets numbered as they were (each street's number decides which
  stretches are left out and where the gated estates are). Set it once, to the first box's value.
- `bake.keep` is the part already baked. `--grow` keeps its tiles, bridges, railways, crossings,
  names and landmark spots exactly as they were and bakes only the land round it; new bridges and
  railways join on where the old ones end. A list the earlier bake couldn't get at all (Lagos had
  no pedestrian crossings) is filled in everywhere.
- New landmarks go outside the kept part. New districts can reach into it: that changes what
  stands on lots nobody owns near the old edge (as the city's growth does), never owned property.

## Baking: the method

What worked for baking all of Lagos State from a cloud session (step by step in
`.claude/skills/bake-world/SKILL.md`, which Claude follows by itself here):

1. **Snapshot first**: `npm run world:snapshot -- lagos before.txt` writes every tile of the part
   that must not move (`bake.keep`): what stands there, its address, name and land price.
2. **The coastline** from osmdata.openstreetmap.de (downloaded in the background while working),
   cut to the box with `clip-water.py`.
3. **The bake** with `OVERPASS_URL=https://overpass-api.de/api/interpreter` and `--grow`: big
   pieces, quick retries on dropped connections, a named User-Agent (Overpass turns away others),
   everything cached by area so a re-run picks up where it stopped. About 40 minutes.
4. **Check**: the printed preview (sea leaking into a lagoon shows as `~`), `npm test`, then
   `npm run world:snapshot -- lagos after.txt` and `node scripts/world/compare.mjs before.txt after.txt`.

## Fixing things

Put fixes in the region's `corrections.ts`. Never edit `baked.ts` by hand, because the next bake
would overwrite it. Each fix changes only the tiles it covers, so nothing else moves. You can copy
coordinates from any map app (latitude first).

- Make an area land, lagoon or sea: draw round it with points in order.
- Add a road or a bridge, or take the main roads out of an area.
- Move, rename, resize or remove a landmark (by its id).

If two landmarks overlap, the later one is left out and the tests report it.

## Names, bridges over the roads

- **Names:** the pill shows a spot's neighbourhood and its district ("Sabo · Yaba"). The
  neighbourhoods come from OpenStreetMap's place names; it doesn't have every well-known name (it
  has no "Yaba", only the local government areas), so missing ones go in `corrections.ts`
  (`kind: "area"`), and the districts in `districts.ts` fill in the rest.
- **Bridges and flyovers** (150 from the map, over water and over land, Third Mainland Bridge
  included) and **railways** (the Blue Line on its viaduct, the Red Line and the Lagos–Ibadan line
  on the ground) follow their real curves as smooth decks: up a ramp off the road, along on piers,
  down again (`src/lib/world/spans.ts`, drawn by `src/app/play/city/spans-kit.ts`). The ground
  under a deck, along a railway and round a station is kept clear, so nothing passes through a
  building. The water under a bridge stays open. Bridges show from far away too.
- **Stations:** the 13 the map has (Marina, National Theatre, Iganmu, Alaba, Mile 2 on the Blue
  Line; Oyingbo, Mobolaji Johnson, Yaba, Mushin, Oshodi, Ikeja, Agege on the Red Line), each
  lined up with its line: platforms, canopies, a hall, stairs and a lift up to raised platforms.
- **Pedestrian crossings**, six kinds: zebra, with their own lights, ladder, with a refuge island,
  yellow school crossings by schools, raised. Where the map has them, and on busy streets.
- **People walking** keep to streets with pavements, and cross at junction zebras and the
  crossings: never along an expressway, across wide tarmac, on a road over water, or on the water
  itself (boats are for that).
- **Traffic** follows how busy each road is (the area's crowd and the kind of road), with more
  cars and longer jams in the Lagos rush hours. Later it will also follow how many players live
  and visit there.
- **No broken bridges:** a checker (`auditSpans` in `src/lib/world/spans.ts`) looks at both ends of
  every deck: each must come down to the road or meet another deck at its own height. Two
  carriageways that end side by side don't hold each other up, ramps between levels meet without a
  step, and no landmark stands under a deck (it moves aside). The tests run it over all of Lagos, so
  a fresh bake with a broken bridge fails the tests instead of reaching the game.
- **Islands and ferries:** which pieces of land join up by road and bridge is worked out once
  (`src/lib/world/trips.ts`); a trip to an island no road reaches (Ilashe, Ibese...) goes by ferry.
- **Only one of each famous place:** the city's own made-up campuses, stadiums and markets are named
  after their street on the real map, never "University of Lagos" or "Balogun Market" (those are
  the real landmarks).
- **Footbridges:** the 223 from the map over the roads, plus extras along the expressways.
- **Pedestrian crossings:** the 219 the map has, and the rest made up where they belong.
- **Wide roads:** where a dual carriageway comes out two tiles wide, it's plain tarmac (no traffic
  lights or crossings in the middle of it).

## Seeing it

- `/world-lab` shows Lagos on its own, without signing in.
- `/play?world=lagos` shows Lagos in the game, in that browser only. `/play?world=0` switches it
  back off. The hourly ghost game is on hold, so its pins don't show on the real map.

## Still to come

1. Drawing in chunks, so moving round doesn't redraw the near ring (now about a tenth of a second
   every ~800 m).
2. Long bridges drawn smoothly on piers along their real curves (Third Mainland Bridge, Carter,
   Eko, Lekki–Ikoyi Link) instead of tile by tile. Rail lines (Blue and Red lines). Beaches, stilt
   villages (Makoko), and landmarks built to their real sizes and shapes.
3. A zoomed-out map of the whole region (and later the world) to tap and fly to.
4. Moving the game itself (places, rooms, jobs, houses) onto the permanent map. The hourly game
   becomes something new (to be decided).
5. Loading each region's data only when it's needed, so the world can keep growing without the
   game getting bigger to download.
