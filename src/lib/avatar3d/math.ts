// Small shared math helpers for building avatar shapes.

export const PI = Math.PI;
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** Smooth 0..1 ramp (smoothstep on t clamped to 0..1). */
export const smooth = (t: number) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
/** Bell curve: 1 at 0, falling off smoothly. */
export const bell = (a: number) => Math.exp(-a * a);
/** Smooth maximum: like Math.max but rounded over a width k, so two shapes melt into each other. */
export function smax(a: number, b: number, k: number) {
  const h = clamp01(0.5 + (0.5 * (a - b)) / k);
  return b + (a - b) * h + k * h * (1 - h);
}
/** Signed angle difference a - b, wrapped to -PI..PI. */
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** Distance from (u, v) to a polyline. */
export function segDist(u: number, v: number, P: readonly (readonly [number, number])[]) {
  let m = 9;
  for (let i = 0; i < P.length - 1; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[i + 1], dx = x2 - x1, dy = y2 - y1;
    const t = clamp01(((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy));
    m = Math.min(m, Math.hypot(u - x1 - t * dx, v - y1 - t * dy));
  }
  return m;
}
/** Grid resolution scaled by level of detail, never below a floor. */
export const res = (n: number, lod: number, min = 4) => Math.max(min, Math.round(n * lod));
/** Same, rounded to an even number (for grids that must stay symmetric). */
export const resEven = (n: number, lod: number, min = 4) => Math.max(min, Math.round((n * lod) / 2) * 2);
