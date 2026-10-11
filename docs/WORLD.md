# The real-world map

The game is moving from a new made-up town every hour to one permanent world built on real
places. Lagos comes first. Later come other cities, then countries and continents, joined on the
same map so you can zoom out to the whole world and fly anywhere.

## The rules

- **One tile is 100 × 100 m everywhere.** Lagos (Ikeja down to the coast, Festac across to Ajah,
  about 45 × 25 km) is 449 × 251 tiles.
- **A region** (a city now, countries later) has its own flat map centred on the middle of its
  area, so shapes and distances in it are true. Where it sits on the world map comes from its real
  latitude and longitude (`src/lib/world/geo.ts`).
- **Only the part round the camera is drawn** (81 × 81 tiles, about 8 × 8 km), however big the
  region is. Nothing is stored tile by tile. Every tile is worked out from the region's data the
  same way every time, so the city never changes unless its data changes.

## What a region is made of

Each region is a folder in `src/lib/world/regions/` (Lagos: `regions/lagos/`):

| File | What it holds | Who writes it |
| --- | --- | --- |
| `index.ts` | Name, area (latitude/longitude box), where the camera starts, its fixed seed | by hand |
| `districts.ts` | Parts of town and how built-up each is (VI and Lagos Island high-rise, Ikoyi leafy...) | by hand |
| `landmarks.ts` | Real landmarks: what, where (latitude, longitude), how big | by hand |
| `baked.ts` | Land, lagoon and sea, the main roads, the long bridges, where the map data has each landmark | the bake script |
| `corrections.ts` | Fixes on top of all that | by hand |

The city layout (`src/lib/city/layout.ts`) fills in everything else between them: side streets,
houses, offices, shops, schools, churches and mosques, parks, billboards.

## Getting the map data (the bake)

```
npm run bake:world -- lagos           # uses the downloaded data if it's there
npm run bake:world -- lagos --fresh   # downloads it again
```

This downloads the coastline, water, main roads and landmark positions from OpenStreetMap
(`overpass-api.de`) and writes `regions/lagos/baked.ts`. It prints a small text map to check by
eye: `~` sea, `-` lagoon, `+` road, `=` bridge. The data is © OpenStreetMap contributors (ODbL),
so the game shows a small "© OpenStreetMap" credit in the corner wherever baked data is shown.

## Fixing things

Put fixes in the region's `corrections.ts`. Never edit `baked.ts` by hand, because the next bake
would overwrite it. Each fix changes only the tiles it covers, so nothing else moves. You can copy
coordinates from any map app (latitude first).

- Make an area land, lagoon or sea: draw round it with points in order.
- Add a road or a bridge, or take the main roads out of an area.
- Move, rename, resize or remove a landmark (by its id).

If two landmarks overlap, the later one is left out and the tests report it.

## Seeing it

- `/world-lab` shows Lagos on its own, without signing in.
- `/play?world=lagos` shows Lagos in the game, in that browser only. `/play?world=0` switches it
  back off. The hourly ghost game is on hold, so its pins don't show on the real map.

## Still to come

1. Drawing in chunks, so moving round doesn't redraw the whole 81 × 81 view (now it redraws every
   ~1.8 km).
2. Long bridges drawn smoothly on piers along their real curves (Third Mainland Bridge, Carter,
   Eko, Lekki–Ikoyi Link) instead of tile by tile. Rail lines (Blue and Red lines). Beaches, stilt
   villages (Makoko), and landmarks built to their real sizes and shapes.
3. A zoomed-out map of the whole region (and later the world) to tap and fly to.
4. Moving the game itself (places, rooms, jobs, houses) onto the permanent map. The hourly game
   becomes something new (to be decided).
5. Loading each region's data only when it's needed, so the world can keep growing without the
   game getting bigger to download.
