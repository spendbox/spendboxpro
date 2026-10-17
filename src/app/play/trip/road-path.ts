// The road in the trip film (docs/TRIPS.md): straight stretches joined by turns at junctions,
// measured along its middle. at(s) gives the point s metres along, which way the road runs there
// (yaw: 0 along +x, turning left adds), and the side directions, so the street, the traffic, the
// people and the camera can all be placed "so far along, so far to the right".

/** A turn at a junction: left, right, or straight on across it (the cross street goes off both sides). */
export type RouteStep = { straight: number } | { turn: "left" | "right" | "straight"; r: number };

type Seg =
  | { kind: "line"; s0: number; len: number; x: number; z: number; yaw: number }
  | { kind: "arc"; s0: number; len: number; cx: number; cz: number; r: number; a0: number; dir: 1 | 0 | -1; yaw0: number; sx: number; sz: number };

export type RoutePoint = { x: number; z: number; yaw: number };

/** Ahead (fx, fz) and to the right (rx, rz) for a yaw. */
export const ahead = (yaw: number) => ({ fx: Math.cos(yaw), fz: -Math.sin(yaw), rx: Math.sin(yaw), rz: Math.cos(yaw) });

export function makeRoute(steps: RouteStep[]) {
  const segs: Seg[] = [];
  let x = 0;
  let z = 0;
  let yaw = 0;
  let s = 0;
  for (const st of steps) {
    if ("straight" in st) {
      segs.push({ kind: "line", s0: s, len: st.straight, x, z, yaw });
      const f = ahead(yaw);
      x += f.fx * st.straight;
      z += f.fz * st.straight;
      s += st.straight;
    } else if (st.turn === "straight") {
      // Straight on across the junction: as long as two radii, no turning.
      const f = ahead(yaw);
      const len = 2 * st.r;
      segs.push({ kind: "arc", s0: s, len, cx: x, cz: z, r: st.r, a0: 0, dir: 0, yaw0: yaw, sx: x, sz: z });
      x += f.fx * len;
      z += f.fz * len;
      s += len;
    } else {
      // Left turns round a centre on the left, right turns round one on the right.
      const dir = st.turn === "left" ? 1 : -1;
      const f = ahead(yaw);
      const side = dir === 1 ? { x: -f.rx, z: -f.rz } : { x: f.rx, z: f.rz };
      const cx = x + side.x * st.r;
      const cz = z + side.z * st.r;
      const a0 = Math.atan2(z - cz, x - cx);
      const len = (Math.PI / 2) * st.r;
      segs.push({ kind: "arc", s0: s, len, cx, cz, r: st.r, a0, dir, yaw0: yaw, sx: x, sz: z });
      // A quarter turn: angle about the centre in the x/z plane goes the opposite way to yaw.
      const a1 = a0 - dir * (Math.PI / 2);
      x = cx + Math.cos(a1) * st.r;
      z = cz + Math.sin(a1) * st.r;
      yaw += dir * (Math.PI / 2);
      s += len;
    }
  }
  const length = s;

  const at = (sAt: number): RoutePoint => {
    const t = Math.max(-200, Math.min(length + 200, sAt));
    let seg = segs[0];
    for (const g of segs) if (t >= g.s0) seg = g;
    // Before the start or past the end: carry straight on.
    if (t < 0) {
      const f = ahead(segs[0].kind === "line" ? segs[0].yaw : 0);
      return { x: f.fx * t, z: f.fz * t, yaw: segs[0].kind === "line" ? segs[0].yaw : 0 };
    }
    const u = Math.min(t - seg.s0, t > length ? t - seg.s0 : seg.len);
    if (seg.kind === "line") {
      const f = ahead(seg.yaw);
      return { x: seg.x + f.fx * u, z: seg.z + f.fz * u, yaw: seg.yaw };
    }
    if (t > length) {
      const end = arcAt(seg, seg.len);
      const f = ahead(end.yaw);
      const past = t - length;
      return { x: end.x + f.fx * past, z: end.z + f.fz * past, yaw: end.yaw };
    }
    return arcAt(seg, u);
  };

  function arcAt(seg: Extract<Seg, { kind: "arc" }>, u: number): RoutePoint {
    if (seg.dir === 0) {
      const f = ahead(seg.yaw0);
      return { x: seg.sx + f.fx * u, z: seg.sz + f.fz * u, yaw: seg.yaw0 };
    }
    const k = u / seg.r;
    const a = seg.a0 - seg.dir * k;
    return { x: seg.cx + Math.cos(a) * seg.r, z: seg.cz + Math.sin(a) * seg.r, yaw: seg.yaw0 + seg.dir * k };
  }

  /** The point s along and `right` metres to the right (negative: to the left), and up. */
  const place = (sAt: number, right: number) => {
    const p = at(sAt);
    const f = ahead(p.yaw);
    return { x: p.x + f.rx * right, z: p.z + f.rz * right, yaw: p.yaw };
  };

  /** The turns: where each starts and ends along the road, and which way. */
  const turns = segs.filter((g): g is Extract<Seg, { kind: "arc" }> => g.kind === "arc").map((g) => ({ s0: g.s0, s1: g.s0 + g.len, r: g.r, dir: g.dir }));
  /** Straight stretches. */
  const lines = segs.filter((g): g is Extract<Seg, { kind: "line" }> => g.kind === "line").map((g) => ({ s0: g.s0, s1: g.s0 + g.len, yaw: g.yaw }));

  return { length, at, place, turns, lines };
}

export type Route = ReturnType<typeof makeRoute>;
