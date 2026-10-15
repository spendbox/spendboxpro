---
name: bake-world
description: Bake or grow a real-world region's map (Lagos, or a new city or country) from OpenStreetMap the fast way, from a cloud session, without moving anything players already own. Use when asked to bake, re-bake, grow or extend a region, add a city or state to the map, or fix the baked land, water, roads, bridges, railways or landmarks.
---

# Baking a region (the method that works)

Read `docs/WORLD.md` ("Growing a region" and "Baking: the method") first. The short version:

## 1. Before touching anything: a snapshot
`npm run world:snapshot -- <region> /tmp/before.txt` (every tile of the part that must not move:
the region's `bake.keep`, or the whole box). You compare against it at the end.

## 2. The region's settings (`src/lib/world/regions/<id>/index.ts`)
- Never change `origin`. Growing the box: set `streetsFrom` once to the first box's
  `min(x0, z0) - 4` (Lagos: -228) and `bake.keep` to the box already baked.
- `bake.border`: the OSM admin relation id of the state or country (Lagos State: 3718182), found with
  `relation["boundary"="administrative"]["admin_level"="4"]["name"~"^Lagos"](bbox); out tags bb;`.
  Its `bounds` give the new box.
- `starterBox`: free starter rooms stay in the busy city.

## 3. The coastline (sea and tidal water)
osmdata.openstreetmap.de is reachable from cloud sessions (900 MB, updated daily):
```
pip install pyshp
mkdir -p scripts/world/.cache/osmdata && cd scripts/world/.cache/osmdata
curl -sS -o water.zip https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip && unzip -q water.zip && rm water.zip
cd - && python3 scripts/world/clip-water.py <region> <south> <west> <north> <east>
```
Run the download in the background while you work on the code.

## 4. The bake
`OVERPASS_URL=https://overpass-api.de/api/interpreter npm run bake:world -- <region> --grow`
(`--grow` when the box grew; leave it out for a fresh bake). Run it in the background and wait
with an until-loop on its log for `^Wrote |Error:`. All of Lagos State took about 40 minutes.
What makes it work from a cloud session (already in bake.mjs):
- overpass-api.de answers **only with a named User-Agent** (406 otherwise): the script sends one.
- Most connections drop right after they open (curl 35, "connection reset"): retry at once
  (3 s), many times. Only a 504/429 (busy) needs a long wait.
- overpass.private.coffee works but is slow and its data is months old: a last resort only.
- Pieces are big (0.3° × 0.2° roads, 0.45° × 0.4° water) and cached in `scripts/world/.cache`
  under their area, so a re-run only fetches what failed. Landmark lookups are cached by which
  landmarks they ask about. A failed landmark batch is fine: those stay at landmarks.ts's spots.
- Don't `pkill -f bake.mjs` from a command line that itself contains "bake.mjs" (it kills your shell).

## 5. Check it
- The preview the bake prints: `~` sea, `-` lagoon, `x` over the border. Sea (`~`) inside a
  lagoon means a leak: named lakes, creeks and lagoons are never sea (bake.mjs `inland`); an open
  harbour mouth needs a `bake.seaGates` line.
- `npm test` (no bridge ends in mid-air, no landmark skipped or under a deck, every gate open).
- `npm run world:snapshot -- <region> /tmp/after.txt` and
  `node scripts/world/compare.mjs /tmp/before.txt /tmp/after.txt`: roads, water, bridges and
  landmarks in the kept part must not change. New districts reaching in can change unowned lots
  near the edge (owned property is pinned); say how many.
- New landmarks: real spots and sizes from OSM (`out bb`), never inside the kept part (each would
  knock down buildings there), ports facing the water, nothing huge drawn as one model (cap
  about 20 × 16 tiles).
- Performance: time `compileRegion`, `starterBuildings` and a full `roughAt` pass (the far map);
  the far map's canvas stays within 4,096 px (far-city.ts picks 1 px a tile when needed).

## 6. Docs
Update docs/WORLD.md (sizes, counts), docs/GROWTH.md (homes: count with the snapshot's plan),
docs/LANDMARKS.md (prices of new big landmarks), and TODO.md.
