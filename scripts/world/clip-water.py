#!/usr/bin/env python3
# Cuts a region's sea and tidal water out of OpenStreetMap's worldwide water shapes
# (https://osmdata.openstreetmap.de/data/water-polygons.html, © OpenStreetMap contributors, ODbL)
# and saves them for scripts/world/bake.mjs (--from-files).
#
#   python3 scripts/world/clip-water.py lagos 6.392 3.2 6.617 3.605
#
# Needs: pip install pyshp, and water-polygons-split-4326 unzipped in scripts/world/.cache/osmdata.

import json
import os
import sys

import shapefile  # pyshp

here = os.path.dirname(os.path.abspath(__file__))
region, south, west, north, east = sys.argv[1], *map(float, sys.argv[2:6])
m = 0.02  # a little round the edges
south, west, north, east = south - m, west - m, north + m, east + m
shp = os.path.join(here, ".cache", "osmdata", "water-polygons-split-4326", "water_polygons.shp")

elements = []
with shapefile.Reader(shp) as r:
    for k, s in enumerate(r.iterShapes()):
        x0, y0, x1, y1 = s.bbox
        if x1 < west or x0 > east or y1 < south or y0 > north:
            continue
        parts = list(s.parts) + [len(s.points)]
        rings = [s.points[parts[j]:parts[j + 1]] for j in range(len(parts) - 1)]
        elements.append({
            "type": "relation",
            "id": k,
            "tags": {"natural": "water", "source": "osmdata"},
            # Even–odd filling in the bake keeps holes (islands) out, so outer and inner alike.
            "members": [{"role": "outer", "geometry": [{"lat": y, "lon": x} for x, y in ring]} for ring in rings],
        })

out = os.path.join(here, ".cache", f"{region}-water.json")
with open(out, "w") as f:
    json.dump({"elements": elements}, f)
print(f"{len(elements)} water shapes -> {out}")
