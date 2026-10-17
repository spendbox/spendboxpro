// Paintball's world, with no drawing in it: the field and its inflatable bunkers (what you can
// hide behind), how people move and collide, flying paintballs, who can see whom, and the bots.
// Metres; y is up; the field runs along x (red's end at -x, blue's at +x).

export const FIELD = { hx: 32, hz: 19 };
export const RULES = {
  /** First team to this many splats wins (Team Splat), or the most when time's up. */
  target: 25,
  seconds: 240,
  respawn: 3,
  /** Just back in: paint doesn't count for this long. */
  shield: 1.6,
  hopper: 40,
  reload: 1.8,
  /** Balls a second when you hold Fire. */
  rate: 7,
  speed: 62,
  gravity: 7,
  run: 6.2,
  jump: 6.5,
  fall: 18,
  radius: 0.42,
  height: 1.78,
  eye: 1.55,
};
export const TEAM = [
  { name: "Red", colour: 0xe03131, css: "#ff6b6b", dark: 0x8f1d1d },
  { name: "Blue", colour: 0x1c7ed6, css: "#4dabf7", dark: 0x11497d },
];

export type Shape = { kind: "box" | "cyl" | "cone"; x: number; z: number; w: number; d: number; h: number; colour: number; ry?: number };

/** A seeded random 0-1 (the same everywhere for the same seed). */
export function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the field

const BUNKER = [0xffd43b, 0xff922b, 0x20c997, 0xf06595, 0x845ef7, 0xe9ecef];

/**
 * The bunkers, one half laid out and mirrored (so both ends are the same): snakes along one side,
 * cans, temples, a tall tower each, the dorito in the middle, and a few made from the seed so
 * every match is a little different.
 */
export function layout(seed: number): Shape[] {
  const r = rand(seed);
  const half: Shape[] = [
    { kind: "box", x: -14, z: 15, w: 11, d: 1.1, h: 0.9, colour: 0xffd43b },
    { kind: "box", x: -4, z: 15, w: 5, d: 1.1, h: 0.9, colour: 0xffd43b },
    { kind: "cyl", x: -22, z: 0, w: 1.6, d: 1.6, h: 1.7, colour: 0xff922b },
    { kind: "cyl", x: -18, z: -8, w: 1.4, d: 1.4, h: 1.5, colour: 0x20c997 },
    { kind: "cyl", x: -18, z: 8, w: 1.4, d: 1.4, h: 1.5, colour: 0x20c997 },
    { kind: "box", x: -12, z: -3.5, w: 2.4, d: 2.4, h: 2.1, colour: 0xf06595 },
    { kind: "box", x: -12, z: 5, w: 2.2, d: 1.2, h: 1.6, colour: 0x845ef7, ry: 0.5 },
    { kind: "cyl", x: -7, z: -13, w: 2, d: 2, h: 3.2, colour: 0xe9ecef },
    { kind: "cone", x: -6, z: 2, w: 2.2, d: 2.2, h: 1.6, colour: 0xff922b },
    { kind: "box", x: -26, z: -12, w: 1.2, d: 4, h: 1.4, colour: 0x845ef7 },
    { kind: "box", x: -26, z: 12, w: 1.2, d: 4, h: 1.4, colour: 0x845ef7 },
    { kind: "box", x: -3, z: -7, w: 3, d: 1.1, h: 1.2, colour: 0x20c997 },
  ];
  for (let k = 0; k < 3; k++) {
    const x = -24 + r() * 20;
    const z = -14 + r() * 28;
    if (half.some((s) => Math.hypot(s.x - x, s.z - z) < 4.5) || Math.abs(x) < 3) continue;
    const kind = r() < 0.5 ? "cyl" : "box";
    half.push({ kind, x, z, w: 1.4 + r(), d: 1.2 + r() * 0.8, h: 1.2 + r() * 0.8, colour: BUNKER[Math.floor(r() * BUNKER.length)] });
  }
  const out: Shape[] = [];
  // The other half: the same, turned round the middle.
  for (const s of half) out.push(s, { ...s, x: -s.x, z: -s.z });
  out.push({ kind: "cone", x: 0, z: 0, w: 2.6, d: 2.6, h: 2.2, colour: 0xffd43b });
  return out;
}

export function spawns(team: number) {
  const x = team === 0 ? -FIELD.hx + 2.5 : FIELD.hx - 2.5;
  return [-9, -4.5, 0, 4.5, 9].map((z) => ({ x, z, yaw: team === 0 ? -Math.PI / 2 : Math.PI / 2 }));
}

// ---------------------------------------------------------------- moving and bumping

export type Body = { x: number; y: number; z: number; vy: number };

/** Is (x, z) inside a bunker's footprint (grown by rad)? Pushes out if so. */
function pushOut(b: Body, s: Shape, rad: number) {
  if (b.y >= s.h - 0.05) return;
  if (s.kind === "box") {
    const c = Math.cos(s.ry ?? 0);
    const sn = Math.sin(s.ry ?? 0);
    const lx = (b.x - s.x) * c - (b.z - s.z) * sn;
    const lz = (b.x - s.x) * sn + (b.z - s.z) * c;
    const ex = s.w / 2 + rad;
    const ez = s.d / 2 + rad;
    if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return;
    let nx = lx;
    let nz = lz;
    if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex;
    else nz = Math.sign(lz || 1) * ez;
    b.x = s.x + nx * c + nz * sn;
    b.z = s.z - nx * sn + nz * c;
  } else {
    const rr = s.w / 2 + rad;
    const dx = b.x - s.x;
    const dz = b.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d >= rr) return;
    if (d < 1e-4) {
      b.x = s.x + rr;
      return;
    }
    b.x = s.x + (dx / d) * rr;
    b.z = s.z + (dz / d) * rr;
  }
}

/** Standing on top of a bunker? Its height there (else 0). */
function floorAt(shapes: Shape[], x: number, z: number) {
  let y = 0;
  for (const s of shapes) {
    if (s.kind === "cone") continue;
    if (s.kind === "box") {
      const c = Math.cos(s.ry ?? 0);
      const sn = Math.sin(s.ry ?? 0);
      const lx = (x - s.x) * c - (z - s.z) * sn;
      const lz = (x - s.x) * sn + (z - s.z) * c;
      if (Math.abs(lx) < s.w / 2 && Math.abs(lz) < s.d / 2) y = Math.max(y, s.h);
    } else if (Math.hypot(x - s.x, z - s.z) < s.w / 2) y = Math.max(y, s.h);
  }
  return y;
}

/** One step of moving: (mx, mz) a direction in the world (length up to 1), jump when asked. */
export function step(b: Body, shapes: Shape[], mx: number, mz: number, jump: boolean, dt: number, speed = RULES.run) {
  b.x += mx * speed * dt;
  b.z += mz * speed * dt;
  const ground = floorAt(shapes, b.x, b.z);
  if (jump && b.y <= ground + 0.02) b.vy = RULES.jump;
  b.vy -= RULES.fall * dt;
  b.y += b.vy * dt;
  if (b.y <= ground) {
    b.y = ground;
    b.vy = 0;
  }
  for (const s of shapes) pushOut(b, s, RULES.radius);
  b.x = Math.max(-FIELD.hx + 0.5, Math.min(FIELD.hx - 0.5, b.x));
  b.z = Math.max(-FIELD.hz + 0.5, Math.min(FIELD.hz - 0.5, b.z));
}

// ---------------------------------------------------------------- what a line hits

export type V3 = { x: number; y: number; z: number };

/** Where the segment a→b first enters a bunker (0-1 along it, and the surface's normal), or null. */
export function segmentHit(shapes: Shape[], a: V3, b: V3): { t: number; n: V3 } | null {
  let best: { t: number; n: V3 } | null = null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  for (const s of shapes) {
    let hit: { t: number; n: V3 } | null = null;
    if (s.kind === "box") {
      const c = Math.cos(s.ry ?? 0);
      const sn = Math.sin(s.ry ?? 0);
      const ax = (a.x - s.x) * c - (a.z - s.z) * sn;
      const az = (a.x - s.x) * sn + (a.z - s.z) * c;
      const ddx = dx * c - dz * sn;
      const ddz = dx * sn + dz * c;
      let t0 = 0;
      let t1 = 1;
      let nAxis = -1;
      let nSign = 0;
      const lo = [-s.w / 2, 0, -s.d / 2];
      const hi = [s.w / 2, s.h, s.d / 2];
      const o = [ax, a.y, az];
      const d = [ddx, dy, ddz];
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(d[k]) < 1e-9) {
          if (o[k] < lo[k] || o[k] > hi[k]) ok = false;
          continue;
        }
        let ta = (lo[k] - o[k]) / d[k];
        let tb = (hi[k] - o[k]) / d[k];
        let sign = -1;
        if (ta > tb) {
          [ta, tb] = [tb, ta];
          sign = 1;
        }
        if (ta > t0) {
          t0 = ta;
          nAxis = k;
          nSign = sign;
        }
        t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
      if (ok && nAxis >= 0) {
        const ln = [0, 0, 0];
        ln[nAxis] = nSign;
        // Back to the world: turn the normal by the box's turn.
        hit = { t: t0, n: { x: ln[0] * c + ln[2] * sn, y: ln[1], z: -ln[0] * sn + ln[2] * c } };
      }
    } else {
      // A can (or the dorito, as a can that narrows): the side, then the top.
      const r0 = s.w / 2;
      const ox = a.x - s.x;
      const oz = a.z - s.z;
      const A = dx * dx + dz * dz;
      const B = 2 * (ox * dx + oz * dz);
      const C = ox * ox + oz * oz - r0 * r0;
      const disc = B * B - 4 * A * C;
      if (A > 1e-9 && disc >= 0) {
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t >= 0 && t <= 1) {
          const y = a.y + dy * t;
          const px = ox + dx * t;
          const pz = oz + dz * t;
          const rAtY = s.kind === "cone" ? r0 * (1 - y / s.h) : r0;
          if (y >= 0 && y <= s.h && Math.hypot(px, pz) <= rAtY + 0.35) hit = { t, n: { x: px / r0, y: s.kind === "cone" ? 0.5 : 0, z: pz / r0 } };
        }
      }
      if (!hit && s.kind === "cyl" && Math.abs(dy) > 1e-9) {
        const t = (s.h - a.y) / dy;
        if (t >= 0 && t <= 1 && Math.hypot(ox + dx * t, oz + dz * t) <= r0) hit = { t, n: { x: 0, y: 1, z: 0 } };
      }
    }
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

/** Can someone at a see a point b (nothing in between)? */
export function canSee(shapes: Shape[], a: V3, b: V3) {
  return !segmentHit(shapes, a, b);
}

/** Does a ball going a→b pass through a person standing at p? (0-1 along, or -1) */
export function hitsPerson(a: V3, b: V3, p: V3) {
  // The person as a line from their knees to their head, 0.42 m thick.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-9) return -1;
  let best = -1;
  for (const h of [0.45, 0.95, 1.4, 1.7]) {
    const cx = p.x - a.x;
    const cy = p.y + h - a.y;
    const cz = p.z - a.z;
    const t = Math.max(0, Math.min(1, (cx * dx + cy * dy + cz * dz) / len2));
    const ex = a.x + dx * t - p.x;
    const ey = a.y + dy * t - (p.y + h);
    const ez = a.z + dz * t - p.z;
    if (ex * ex + ey * ey + ez * ez < (h > 1.6 ? 0.24 : 0.36) ** 2 && (best < 0 || t < best)) best = t;
  }
  return best;
}

// ---------------------------------------------------------------- a paintball in the air

export type Ball = { id: number; owner: string; team: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; mine: boolean };

/** Where it'll be after dt (a little drop). */
export function fly(b: Ball, dt: number) {
  const from = { x: b.x, y: b.y, z: b.z };
  b.vy -= RULES.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.age += dt;
  return from;
}

// ---------------------------------------------------------------- bots

export type Actor = {
  id: string;
  name: string;
  team: number;
  bot: boolean;
  body: Body;
  yaw: number;
  pitch: number;
  alive: boolean;
  back: number;
  shield: number;
  /** Score: splats made, times out. */
  hits: number;
  outs: number;
  /** Bots only: their plan. */
  brain?: { goal: V3; until: number; target: string | null; seen: number; next: number; strafe: number; skill: number };
};

/** Somewhere to hide near the middle of the field on a team's side. */
function coverSpot(shapes: Shape[], team: number, r: () => number): V3 {
  const mine = shapes.filter((s) => (team === 0 ? s.x < 6 : s.x > -6) && s.h >= 1.2);
  const s = mine[Math.floor(r() * mine.length)] ?? { x: 0, z: 0, w: 1 };
  // The side of it away from the other team.
  const away = team === 0 ? -1 : 1;
  return { x: s.x + away * (s.w / 2 + 0.8), y: 0, z: s.z + (r() - 0.5) * 1.5 };
}

/**
 * A bot's next moment: pick someone to shoot (the nearest it can see), move to cover, peek and
 * shoot with a little wobble (worse further away), now and then push up to new cover. Returns
 * where it moves, and the direction of a shot if it fires this frame.
 */
export function think(b: Actor, all: Actor[], shapes: Shape[], now: number, dt: number, r: () => number): { mx: number; mz: number; jump: boolean; shot: V3 | null } {
  const br = (b.brain ??= { goal: coverSpot(shapes, b.team, r), until: now + 6 + r() * 6, target: null, seen: 0, next: 0, strafe: 1, skill: 0.55 + r() * 0.35 });
  const eye = { x: b.body.x, y: b.body.y + RULES.eye, z: b.body.z };
  let target: Actor | null = null;
  let bestD = Infinity;
  for (const o of all) {
    if (o.team === b.team || !o.alive) continue;
    const d = Math.hypot(o.body.x - b.body.x, o.body.z - b.body.z);
    if (d > 48 || d >= bestD) continue;
    const look = { x: o.body.x, y: o.body.y + 1.2, z: o.body.z };
    if (!canSee(shapes, eye, look)) continue;
    target = o;
    bestD = d;
  }
  if (target?.id !== br.target) {
    br.target = target?.id ?? null;
    br.seen = now;
  }
  if (now > br.until) {
    br.goal = coverSpot(shapes, b.team, r);
    br.until = now + 5 + r() * 8;
    br.strafe = r() < 0.5 ? -1 : 1;
  }
  let mx = br.goal.x - b.body.x;
  let mz = br.goal.z - b.body.z;
  const dist = Math.hypot(mx, mz);
  if (dist < 0.6) {
    mx = 0;
    mz = 0;
  } else {
    mx /= dist;
    mz /= dist;
  }
  let shot: V3 | null = null;
  if (target) {
    const tx = target.body.x - b.body.x;
    const tz = target.body.z - b.body.z;
    const want = Math.atan2(-tx, -tz);
    let d = want - b.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.yaw += d * Math.min(1, dt * 5 * br.skill);
    // Stepping side to side while fighting (in cover: peeking out and back).
    if (dist < 0.6) {
      const side = Math.sin(now * 1.3 + b.id.length) * br.strafe;
      mx = Math.cos(want) * side * 0.6;
      mz = -Math.sin(want) * side * 0.6;
    }
    const reaction = 0.45 / br.skill;
    if (now - br.seen > reaction && Math.abs(d) < 0.25 && now >= br.next) {
      br.next = now + 1 / (RULES.rate * (0.45 + br.skill * 0.3));
      const wob = (0.025 + bestD * 0.0035) / br.skill;
      // Lead a moving target a little, aim at the chest.
      const tt = bestD / RULES.speed;
      const aimAt = { x: target.body.x + (r() - 0.5) * wob * bestD, y: target.body.y + 1.15 + (r() - 0.5) * wob * bestD + RULES.gravity * tt * tt * 0.5, z: target.body.z + (r() - 0.5) * wob * bestD };
      const sx = aimAt.x - eye.x;
      const sy = aimAt.y - eye.y;
      const sz = aimAt.z - eye.z;
      const l = Math.hypot(sx, sy, sz) || 1;
      shot = { x: sx / l, y: sy / l, z: sz / l };
      b.pitch = Math.asin(Math.max(-1, Math.min(1, shot.y)));
    }
  } else if (dist > 0.6) b.yaw = Math.atan2(-mx, -mz);
  // Hop over a low bunker now and then.
  const jump = dist > 2 && r() < dt * 0.15;
  return { mx, mz, jump, shot };
}
