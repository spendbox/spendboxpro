// Every tile of a part of a region, as one line each: what the map puts there (the building, its
// kind, storeys, units and id), its address, its name, its land price and whether it's kept clear.
// Take one before changing the map or the rules, one after, and compare (compare.ts), to prove what
// moved. See docs/WORLD.md, "Baking: the method".
//
//   npm run world:snapshot -- lagos before.txt [x0 x1 z0 z1]
//
// Without x0..z1 it covers the region's bake.keep box (the part that must never move), or the whole box.

import { writeFileSync } from "node:fs";
import { regionMap } from "../../src/lib/world/index.ts";
import { tileBounds } from "../../src/lib/world/geo.ts";
import { addressOf, makePlan, spiralIndex, tileAt } from "../../src/lib/city/layout.ts";

const [id, out, ...range] = process.argv.slice(2);
const map = regionMap(id);
if (!map || !out) {
  console.error("Usage: npm run world:snapshot -- <region> <file> [x0 x1 z0 z1]");
  process.exit(1);
}
const keep = map.region.bake?.keep;
const b = range.length === 4 ? { x0: +range[0], x1: +range[1], z0: +range[2], z1: +range[3] } : keep ? tileBounds(map.frame, keep) : map.bounds;
const plan = makePlan(map.region.seed, map);
const lines: string[] = [];
for (let z = b.z0; z <= b.z1; z++)
  for (let x = b.x0; x <= b.x1; x++) {
    const t = tileAt(plan, spiralIndex(x, z));
    const bd = t.building;
    lines.push(
      `${x},${z} ${t.kind} ${t.name ?? ""} ${bd ? `${bd.kind}/${bd.storeys}/${bd.units.length}/${bd.id}/${bd.estate?.id ?? ""}` : ""} | ${addressOf(plan, t)} | ${map.areaAt(x, z)} | ${Math.round(map.landPriceAt(x, z))} | ${map.clearAt(x, z) ?? ""}`,
    );
  }
writeFileSync(out, lines.join("\n"));
console.log(`${lines.length} tiles (${b.x0}..${b.x1} × ${b.z0}..${b.z1}) -> ${out}`);
