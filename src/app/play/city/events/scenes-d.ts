// Big street events from the news (src/lib/world/news.ts): a whole stretch of road taken over,
// end to end, along the event's route (about 14 tiles of street, round a corner or two).
//   street_rave     a DJ in the middle of the road, speaker stacks, lasers, a packed dancing crowd
//   street_concert  a stage across the road at one end, light towers, the road full to the far end
//   protest_march   a long column marching with placards and a banner, police in front and behind
// The crowd gathers over the first seconds (the street fills up) and drifts away at the end.

import { Megaphone, Mic, Speaker } from "lucide-react";
import { BALL, BOX, CONE, CYL, GBOX } from "./kit";
import { along } from "./spots";
import { CHEER, confetti, DANCE, fireworks, flashers, h1, PARTY, person, searchlights, SHIRTS, SKINS, STAND, SYNC, WALK, WAVE, type Ev, type Scene } from "./common";
import { POLICE, STAGE } from "./models";

const NEON = [0xff2bd6, 0x22d3ee, 0x9775fa, 0x69db7c, 0xffd43b, 0xff4d6d];
const SIGNS = [0xffffff, 0xfff3bf, 0xffe3e3, 0xd3f9d8, 0xffffff];
/** How far either side of the middle of the road people stand. */
const ROAD = 0.38;
const MARCHERS = 170;

/** How many of n people have turned up so far: the street fills over the first ~12 seconds. */
const arrived = (e: Ev, n: number) => Math.min(n, Math.floor(n * Math.min(1, e.t / 12 + 0.08)));

/**
 * n people packed along the road from d0 to d1, facing (fd: a distance along the route) or along
 * the road, each doing pose(i).
 */
function pack(e: Ev, n: number, d0: number, d1: number, fd: number, pose: (i: number) => number, cols: readonly number[], salt: number) {
  const { k, s } = e;
  const m = arrived(e, n);
  const g = e.pop;
  if (g <= 0.02) return;
  const fx = Number.isNaN(fd) ? 0 : (along(s, fd, e.a, 0), e.a.x);
  const fz = Number.isNaN(fd) ? 0 : e.a.z;
  for (let i = 0; i < m; i++) {
    const a = h1(e.id, i, salt);
    const b = h1(e.id, i, salt + 1);
    const d = d0 + (d1 - d0) * ((i + 0.5) / n) + (b - 0.5) * 0.08;
    along(s, d, e.b, (a * 2 - 1) * ROAD);
    const yaw = Number.isNaN(fd) ? e.b.yaw + (b - 0.5) * 0.8 : Math.atan2(-(fz - e.b.z), fx - e.b.x) + (b - 0.5) * 0.5;
    person(k, e.b.x, e.b.y, e.b.z, yaw, cols[Math.floor(a * 97) % cols.length], SKINS[Math.floor(b * 7) % 7], pose(i), e.t, a * 10, g);
  }
}

/** Speakers taller than a person, on both sides of the road at d, booming on the beat. */
function speakers(e: Ev, d: number, beat: number) {
  const { k, s } = e;
  for (const side of [-0.46, 0.46]) {
    along(s, d, e.b, side);
    const g = e.pop;
    k.put(BOX, e.b.x, e.b.y + 0.12 * g, e.b.z, 0.13 * g, 0.24 * g, 0.13 * g, e.b.yaw, 0x212529);
    k.put(BOX, e.b.x, e.b.y + 0.3 * g, e.b.z, 0.11 * g, 0.12 * g, 0.11 * g, e.b.yaw, 0x343a40);
    for (const y of [0.08, 0.18, 0.3]) k.put(CYL, e.b.x, e.b.y + y * g, e.b.z, 0.07 * g * (1 + beat * 0.15), 0.135 * g, 0.07 * g * (1 + beat * 0.15), e.b.yaw, 0x495057, Math.PI / 2, side > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
}

/** Fairy lights strung across the road at d, glowing at night. */
function stringLights(e: Ev, d: number, h: number, cols: readonly number[], phase: number) {
  const { k, s } = e;
  along(s, d, e.b, -0.5);
  const x0 = e.b.x;
  const z0 = e.b.z;
  along(s, d, e.b, 0.5);
  const x1 = e.b.x;
  const z1 = e.b.z;
  const y = e.b.y + h * e.pop;
  k.rod(CYL, x0, e.b.y, z0, x0, y, z0, 0.02, 0x868e96);
  k.rod(CYL, x1, e.b.y, z1, x1, y, z1, 0.02, 0x868e96);
  for (let i = 0; i < 7; i++) {
    const f = (i + 0.5) / 7;
    const sag = Math.sin(f * Math.PI) * 0.08;
    const c = cols[(i + phase) % cols.length];
    k.put(GBOX, x0 + (x1 - x0) * f, y - sag, z0 + (z1 - z0) * f, 0.035, 0.035, 0.035, 0, c);
    if (e.night > 0.2) k.glow(x0 + (x1 - x0) * f, y - sag, z0 + (z1 - z0) * f, 0.22, c, e.life * e.night * 0.8);
  }
}

export const SCENES_D: Record<string, Scene> = {
  street_rave: {
    icon: Speaker,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      const mid = s.len / 2;
      const beat = Math.max(0, Math.sin(e.t * Math.PI * 2.1)) ** 4;
      const step = Math.floor(e.t * 2.1);
      // Every 20 seconds the drop: the whole street does the same moves, confetti flies.
      const drop = e.t % 20 > 15;
      // The DJ: decks across the middle of the road, glowing, and the DJ behind them.
      along(s, mid, e.b, 0);
      const g = e.pop;
      k.put(BOX, e.b.x, e.b.y + 0.07 * g, e.b.z, 0.2 * g, 0.14 * g, 0.62 * g, e.b.yaw, 0x212529);
      k.put(GBOX, e.b.x, e.b.y + 0.145 * g, e.b.z, 0.21 * g, 0.012 * g, 0.63 * g, e.b.yaw, NEON[step % NEON.length]);
      person(k, e.b.x - Math.cos(e.b.yaw) * 0.14, e.b.y, e.b.z + Math.sin(e.b.yaw) * 0.14, e.b.yaw, 0x212529, SKINS[4], drop ? CHEER : DANCE, e.t, 1, g * 1.15, 0x212529, 0xff2bd6);
      const djX = e.b.x;
      const djZ = e.b.z;
      // Lasers sweeping over the crowd from the decks, both ways down the road.
      for (let i = 0; i < 6; i++) {
        const d = mid + (i % 2 ? 1 : -1) * (2 + 4 * (0.5 + 0.5 * Math.sin(e.t * 1.3 + i)));
        along(s, d, e.a, Math.sin(e.t * 2 + i * 1.7) * 0.4);
        k.beam(djX, e.b.y + 0.35, djZ, e.a.x, e.a.y + 0.05, e.a.z, 0.06, NEON[(i + step) % NEON.length], e.life * (0.35 + 0.5 * e.night));
      }
      searchlights(k, djX, e.b.y + 0.3, djZ, 4, 6, e.t, NEON, e.life * (0.3 + 0.7 * e.night), 0.8, 1.4);
      // Speaker stacks and lights all the way down the street.
      for (let d = 1; d < s.len - 0.5; d += 2.4) speakers(e, d, beat);
      for (let d = 2.2; d < s.len - 0.5; d += 2.4) stringLights(e, d, 0.55, NEON, step);
      // The crowd: both halves of the road, packed, facing the DJ.
      const pose = (i: number) => (drop ? SYNC : i % 9 === 0 ? CHEER : DANCE);
      pack(e, 105, 0.3, mid - 0.45, mid, pose, NEON.concat(SHIRTS), 51);
      pack(e, 105, mid + 0.45, s.len - 0.3, mid, pose, NEON.concat(SHIRTS), 53);
      // Glow sticks over the heads at night, and the beat in the sky.
      if (e.night > 0.2) for (let i = 0; i < 18; i++) {
        along(s, (i + 0.5) * (s.len / 18), e.b, (h1(e.id, i, 60) * 2 - 1) * ROAD);
        k.glow(e.b.x, e.b.y + 0.36, e.b.z, 0.12 + beat * 0.08, NEON[(i + step) % NEON.length], e.life * e.night);
      }
      if (drop) confetti(k, djX, e.b.y, djZ, 3, 1.4, e.t, e.id, e.life, 70, NEON);
      k.flash(beat * 0.06 * e.night * e.life);
      e.bx = djX;
      e.bz = djZ;
      e.by = 1.3;
    },
  },

  street_concert: {
    icon: Mic,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const g = e.pop;
      const step = Math.floor(e.t * 1.8);
      // The stage across the road near one end, facing down the street.
      const sd = 0.7;
      along(s, sd, e.b, 0);
      const sx = e.b.x;
      const sz = e.b.z;
      const yaw = e.b.yaw;
      k.slot[0] = 0x343a40;
      k.root(sx, e.b.y, sz, yaw + Math.PI / 2, 1.25 * g);
      k.model(STAGE, e.t);
      // The big screen behind the band, flicking through colours; speakers at both sides.
      const bx = sx - Math.cos(yaw) * 0.32;
      const bz = sz + Math.sin(yaw) * 0.32;
      k.put(BOX, bx, e.b.y + 0.62 * g, bz, 0.03 * g, 0.42 * g, 0.86 * g, yaw, 0x212529);
      k.put(GBOX, bx + Math.cos(yaw) * 0.02, e.b.y + 0.62 * g, bz - Math.sin(yaw) * 0.02, 0.01 * g, 0.36 * g, 0.78 * g, yaw, PARTY[step % PARTY.length]);
      // The band: a singer up front, two more behind, playing to the street.
      for (let i = 0; i < 3; i++) {
        const fwd = i === 1 ? 0.12 : -0.05;
        const side = (i - 1) * 0.3;
        person(k, sx + Math.cos(yaw) * fwd + Math.sin(yaw) * side, e.b.y + 0.16 * g, sz - Math.sin(yaw) * fwd + Math.cos(yaw) * side, yaw, PARTY[(i * 3 + step) % PARTY.length], SKINS[i * 2], i === 1 ? WAVE : DANCE, e.t, i, g * 1.25);
      }
      // Stage lights and beams over the crowd, and the odd firework.
      for (let i = 0; i < 5; i++) {
        const side = (i - 2) * 0.22;
        const lx = sx + Math.sin(yaw) * side;
        const lz = sz + Math.cos(yaw) * side;
        k.glow(lx, e.b.y + 1.0 * g, lz, 0.4, PARTY[(i + step) % PARTY.length], e.life * (0.6 + 0.4 * e.night));
        along(s, sd + 3 + 5 * (0.5 + 0.5 * Math.sin(e.t * 0.9 + i)), e.a, Math.sin(e.t + i) * 0.35);
        k.beam(lx, e.b.y + 1.0, lz, e.a.x, e.a.y, e.a.z, 0.25, PARTY[(i + step + 2) % PARTY.length], e.life * (0.25 + 0.6 * e.night));
      }
      searchlights(k, sx, e.b.y + 1.1, sz, 5, 7, e.t, PARTY, e.life * (0.3 + 0.7 * e.night), 0.7, 1);
      const f = fireworks(k, sx, e.b.y + 1, sz, 3, 4.5, 2, e.t, e.id, e.life * 0.8, 2, PARTY, 5);
      k.flash(f * 0.12 * e.night);
      // Light towers down the road, speakers near the stage.
      speakers(e, sd + 1.1, Math.max(0, Math.sin(e.t * 6)) ** 4);
      for (let d = sd + 3.5; d < s.len - 0.5; d += 3.5) {
        for (const side of [-0.47, 0.47]) {
          along(s, d, e.b, side);
          k.put(CYL, e.b.x, e.b.y + 0.4 * g, e.b.z, 0.03, 0.8 * g, 0.03, 0, 0x868e96);
          k.put(BOX, e.b.x, e.b.y + 0.82 * g, e.b.z, 0.1 * g, 0.06 * g, 0.1 * g, 0, 0x343a40);
          k.glow(e.b.x, e.b.y + 0.82 * g, e.b.z, 0.5, 0xfff3bf, e.life * (0.3 + 0.7 * e.night));
        }
      }
      // The road full of fans from the stage to the far end, all facing the stage.
      const crowdFrom = sd + 0.75;
      pack(e, 220, crowdFrom, s.len - 0.3, sd, (i) => (i % 5 === 0 ? WAVE : i < 30 ? DANCE : CHEER), SHIRTS, 71);
      // Phone lights up at night.
      if (e.night > 0.2) for (let i = 0; i < 24; i++) {
        along(s, crowdFrom + (i + 0.5) * ((s.len - crowdFrom) / 24), e.b, (h1(e.id, i, 80) * 2 - 1) * ROAD);
        k.glow(e.b.x, e.b.y + 0.4, e.b.z, 0.1, 0xffffff, e.life * e.night * (0.6 + 0.4 * Math.sin(e.t * 3 + i)));
      }
      e.bx = sx;
      e.bz = sz;
      e.by = 1.9;
    },
  },

  protest_march: {
    icon: Megaphone,
    sound: "whistle",
    draw(e) {
      const { k, s } = e;
      // A long column marching down the road, slowly, again and again (they go round the block).
      const column = Math.min(8, s.len * 0.6);
      const speed = 0.16;
      const span = s.len + column + 2.5;
      const head = ((e.t * speed + s.len * 0.45) % span) - 0.5;
      const chant = e.t % 4 < 1.6;
      const n = arrived(e, MARCHERS);
      for (let i = 0; i < n; i++) {
        const a = h1(e.id, i, 91);
        const b = h1(e.id, i, 92);
        const d = head - 0.45 - ((i + 0.5) / MARCHERS) * column + (b - 0.5) * 0.06;
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, (a * 2 - 1) * ROAD);
        const fade = Math.min(1, d / 0.5, (s.len - d) / 0.5) * e.pop;
        if (fade <= 0.02) continue;
        const fist = chant && i % 3 === 0;
        person(k, e.b.x, e.b.y, e.b.z, e.b.yaw, SHIRTS[Math.floor(a * 97) % SHIRTS.length], SKINS[Math.floor(b * 7) % 7], fist ? CHEER : WALK, e.t, a * 10, fade);
        // Placards held high: a stick and a board facing forward.
        if (i % 3 === 1) {
          const bob = Math.sin(e.t * 3 + a * 9) * 0.02;
          k.rod(CYL, e.b.x, e.b.y + 0.17 * fade, e.b.z, e.b.x, e.b.y + (0.38 + bob) * fade, e.b.z, 0.012 * fade, 0x8d6e63);
          k.put(BOX, e.b.x, e.b.y + (0.42 + bob) * fade, e.b.z, 0.012 * fade, 0.1 * fade, 0.15 * fade, e.b.yaw, SIGNS[i % SIGNS.length], 0, Math.sin(e.t * 2 + i) * 0.15);
          k.put(BOX, e.b.x + Math.cos(e.b.yaw) * 0.008, e.b.y + (0.43 + bob) * fade, e.b.z - Math.sin(e.b.yaw) * 0.008, 0.004, 0.02 * fade, 0.11 * fade, e.b.yaw, i % 2 ? 0xe03131 : 0x1c7ed6);
        }
      }
      // The banner across the front, carried by two, and a leader with a megaphone ahead of them.
      if (head > 0.2 && head < s.len) {
        along(s, head - 0.3, e.b, 0);
        const g = e.pop;
        for (const side of [-0.36, 0.36]) {
          along(s, head - 0.3, e.a, side);
          person(k, e.a.x, e.a.y, e.a.z, e.a.yaw, 0xffffff, SKINS[side > 0 ? 2 : 5], WALK, e.t, side * 4, g);
        }
        k.put(BOX, e.b.x, e.b.y + 0.26 * g, e.b.z, 0.012 * g, 0.12 * g, 0.74 * g, e.b.yaw, 0xffffff);
        k.put(BOX, e.b.x + Math.cos(e.b.yaw) * 0.008, e.b.y + 0.29 * g, e.b.z - Math.sin(e.b.yaw) * 0.008, 0.004, 0.035 * g, 0.62 * g, e.b.yaw, 0xe03131);
        k.put(BOX, e.b.x + Math.cos(e.b.yaw) * 0.008, e.b.y + 0.24 * g, e.b.z - Math.sin(e.b.yaw) * 0.008, 0.004, 0.02 * g, 0.5 * g, e.b.yaw, 0x212529);
        along(s, head + 0.05, e.a, 0);
        person(k, e.a.x, e.a.y, e.a.z, e.a.yaw + Math.PI, 0x2f9e44, SKINS[3], chant ? CHEER : WAVE, e.t, 3, g * 1.05);
        k.put(CONE, e.a.x, e.a.y + 0.22 * g, e.a.z, 0.04 * g, 0.08 * g, 0.04 * g, e.a.yaw, 0xffd43b, 0, Math.PI / 2);
        e.bx = e.b.x;
        e.bz = e.b.z;
      }
      // Police walking it in: a car ahead of the march and one behind, lights flashing.
      for (const [d, i] of [[head + 1.1, 0], [head - column - 1.2, 1]] as const) {
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, 0.15);
        k.root(e.b.x, e.b.y, e.b.z, e.b.yaw, 1.1 * e.pop);
        k.model(POLICE, e.t);
        flashers(k, e.b.x, e.b.y + 0.32, e.b.z, e.t, i, e.life, 0.9);
      }
      // People watching from the roadside, and filming.
      for (let i = 0; i < 18; i++) {
        along(s, (i + 0.5) * (s.len / 18), e.b, i % 2 ? 0.5 : -0.5);
        person(k, e.b.x, e.b.y, e.b.z, e.b.yaw + (i % 2 ? Math.PI / 2 : -Math.PI / 2), SHIRTS[(i * 5) % SHIRTS.length], SKINS[i % 7], i % 4 === 0 ? WAVE : STAND, e.t, i, e.pop);
        if (i % 3 === 0) k.put(BALL, e.b.x, e.b.y + 0.22 * e.pop, e.b.z, 0.02, 0.03, 0.01, e.b.yaw, 0x212529);
      }
      e.by = 1.1;
    },
  },
};
