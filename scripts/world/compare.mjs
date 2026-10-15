// Compares two snapshots (snapshot.ts): how many tiles changed, in what (what stands there, the
// name, the land price), and how far from the edge of the part compared.
//
//   node scripts/world/compare.mjs before.txt after.txt

import { readFileSync } from "node:fs";

const [a, b] = process.argv.slice(2).map((f) => readFileSync(f, "utf8").split("\n"));
if (a.length !== b.length) console.log(`Different sizes: ${a.length} and ${b.length} tiles (compare the same part).`);
const xs = a.map((l) => +l.split(",")[0]);
const zs = a.map((l) => +l.split(" ")[0].split(",")[1]);
const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
const what = { building: 0, name: 0, price: 0, clear: 0 };
const bigPrice = [];
const edge = { "<=2": 0, "<=10": 0, "<=30": 0, ">30": 0 };
let n = 0;
for (let k = 0; k < Math.min(a.length, b.length); k++) {
  if (a[k] === b[k]) continue;
  n++;
  const [p, q] = [a[k].split(" | "), b[k].split(" | ")];
  if (p[0] !== q[0]) what.building++;
  if (p[2] !== q[2]) what.name++;
  if (p[3] !== q[3]) {
    what.price++;
    const r = Math.abs(+q[3] - +p[3]) / +p[3];
    if (r > 0.05) bigPrice.push(r);
  }
  if (p[4] !== q[4]) what.clear++;
  const [x, z] = [xs[k], zs[k]];
  const d = Math.min(x - x0, x1 - x, z - z0, z1 - z);
  edge[d <= 2 ? "<=2" : d <= 10 ? "<=10" : d <= 30 ? "<=30" : ">30"]++;
}
console.log(`${n} of ${a.length} tiles changed: ${JSON.stringify(what)}`);
console.log(`land prices moved over 5%: ${bigPrice.length} tiles`);
console.log(`how far from the edge (tiles): ${JSON.stringify(edge)}`);
