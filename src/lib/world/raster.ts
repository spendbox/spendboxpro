// Lines and areas onto the tile grid.

/**
 * Every tile a straight line between two points passes through, stepping only sideways or
 * up/down (never corner to corner), so a road drawn from it is always joined up.
 */
export function line4(x0: number, z0: number, x1: number, z1: number, put: (x: number, z: number) => void) {
  let x = Math.round(x0);
  let z = Math.round(z0);
  const tx = Math.round(x1);
  const tz = Math.round(z1);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const off = (px: number, pz: number) => Math.abs(dz * (px - x0) - dx * (pz - z0));
  put(x, z);
  while (x !== tx || z !== tz) {
    const sx = Math.sign(tx - x);
    const sz = Math.sign(tz - z);
    if (sx && sz) {
      if (off(x + sx, z) <= off(x, z + sz)) x += sx;
      else z += sz;
    } else if (sx) x += sx;
    else z += sz;
    put(x, z);
  }
}

/** Every tile whose middle is inside a shape (points in order round it). */
export function fillArea(ring: { x: number; z: number }[], put: (x: number, z: number) => void) {
  if (ring.length < 3) return;
  const zs = ring.map((p) => p.z);
  const zMin = Math.ceil(Math.min(...zs));
  const zMax = Math.floor(Math.max(...zs));
  for (let z = zMin; z <= zMax; z++) {
    // Where each edge crosses this row, left to right; fill between pairs.
    const cuts: number[] = [];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) cuts.push(a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
    }
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k += 2) for (let x = Math.ceil(cuts[k]); x <= Math.floor(cuts[k + 1]); x++) put(x, z);
  }
}
