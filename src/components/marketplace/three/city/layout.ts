import { hash } from "../geometry";

// The plan of the town, as plain numbers: where each block, shop, park, road,
// lamp and tree goes. Blocks are streets of three shopfronts facing the road
// on the camera's side, spiralling out from the middle as more shops join.

export const PLOT = 7;
export const PLOT_D = 7.5;
export const PER_BLOCK = 3;
export const ROAD = 3.4;
export const BW = PLOT * PER_BLOCK; // block width (x)
export const BD = PLOT_D + 2.5; // block depth (z)
export const PX = BW + ROAD;
export const PZ = BD + ROAD;

export interface RoadLine {
  axis: "x" | "z";
  at: number;
  min: number;
  max: number;
}

export interface TownPlan {
  blocks: [number, number][];
  shops: { x: number; z: number }[];
  parks: [number, number][];
  gardens: [number, number][];
  roads: RoadLine[];
  crossings: [number, number][];
  lamps: [number, number][];
  trees: { x: number; z: number; scale: number; seed: number }[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Block positions spiralling out from the middle: (0,0), (1,0), (1,1), (0,1), (-1,1)… */
function spiral(count: number) {
  const out: [number, number][] = [[0, 0]];
  const dirs: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  let x = 0;
  let z = 0;
  let step = 1;
  let d = 0;
  while (out.length < count) {
    for (let rep = 0; rep < 2 && out.length < count; rep++) {
      for (let i = 0; i < step && out.length < count; i++) {
        x += dirs[d]![0];
        z += dirs[d]![1];
        out.push([x, z]);
      }
      d = (d + 1) % 4;
    }
    step++;
  }
  return out;
}

export function planTown(shopCount: number): TownPlan {
  const blocks = spiral(Math.max(1, Math.ceil(shopCount / PER_BLOCK)));
  const xs = blocks.map((b) => b[0]);
  const zs = blocks.map((b) => b[1]);
  const [minBx, maxBx, minBz, maxBz] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const hx = PX / 2;
  const hz = PZ / 2;

  const plots: { x: number; z: number }[] = [];
  const gardens: [number, number][] = [];
  for (const [bx, bz] of blocks)
    for (let i = 0; i < PER_BLOCK; i++) {
      const x = bx * PX + (i - (PER_BLOCK - 1) / 2) * PLOT;
      plots.push({ x, z: bz * PZ + BD / 2 - PLOT_D / 2 });
      gardens.push([x, bz * PZ - BD / 2 + 1.1]);
    }

  const spanX = [minBx * PX - hx - ROAD / 2, maxBx * PX + hx + ROAD / 2] as const;
  const spanZ = [minBz * PZ - hz - ROAD / 2, maxBz * PZ + hz + ROAD / 2] as const;
  const roads: RoadLine[] = [];
  for (let k = minBz - 1; k <= maxBz; k++) roads.push({ axis: "x", at: k * PZ + hz, min: spanX[0], max: spanX[1] });
  for (let k = minBx - 1; k <= maxBx; k++) roads.push({ axis: "z", at: k * PX + hx, min: spanZ[0], max: spanZ[1] });
  const crossings: [number, number][] = [];
  for (let i = minBx - 1; i <= maxBx; i++) for (let k = minBz - 1; k <= maxBz; k++) crossings.push([i * PX + hx, k * PZ + hz]);

  const lamps: [number, number][] = [];
  for (const [bx, bz] of blocks)
    for (const [dx, dz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])
      lamps.push([bx * PX + dx * (BW / 2 - 0.4), bz * PZ + dz * (BD / 2 - 0.4)]);

  // Trees: in gardens, in parks, and along the outside of the town.
  const trees: TownPlan["trees"] = [];
  for (const [x, z] of gardens) {
    const seed = hash(`g${x},${z}`);
    trees.push({ x: x - 1.6 + seed, z, scale: 0.75 + seed * 0.3, seed });
    if (seed > 0.4) trees.push({ x: x + 1.8, z: z + 0.2, scale: 0.7, seed: seed * 0.5 });
  }
  const parks = plots.slice(shopCount).map((p) => [p.x, p.z] as [number, number]);
  parks.forEach(([x, z], i) => {
    const seed = hash(`${x},${z}`);
    if (i % 3 === 0) {
      trees.push({ x: x - 2.3, z: z - 2.3, scale: 0.9, seed }, { x: x + 2.3, z: z + 2.2, scale: 1, seed: seed * 0.7 });
    } else {
      for (let t = 0; t < 4; t++) trees.push({ x: x - 2 + (t % 2) * 4 + seed, z: z - 2 + Math.floor(t / 2) * 3.2, scale: 0.8 + ((seed * (t + 3)) % 0.5), seed: (seed * (t + 1)) % 1 });
    }
  });
  const taken = new Set(blocks.map(([a, b]) => `${a},${b}`));
  for (const [bx, bz] of blocks)
    for (const [nx, nz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (taken.has(`${bx + nx},${bz + nz}`)) continue;
      for (let t = -2; t <= 2; t++) {
        const x = bx * PX + (nx ? nx * (PX / 2 + ROAD + 1.5) : t * 4.8);
        const z = bz * PZ + (nz ? nz * (PZ / 2 + ROAD + 1.5) : t * 2.1);
        trees.push({ x: x + (hash(`${x}`) - 0.5), z: z + (hash(`${z}`) - 0.5), scale: 0.9 + hash(`${x}${z}`) * 0.5, seed: hash(`${z}${x}`) });
      }
    }

  return {
    blocks,
    shops: plots.slice(0, shopCount),
    parks,
    gardens,
    roads,
    crossings,
    lamps,
    trees,
    bounds: { minX: minBx * PX - hx, maxX: maxBx * PX + hx, minZ: minBz * PZ - hz, maxZ: maxBz * PZ + hz },
  };
}
