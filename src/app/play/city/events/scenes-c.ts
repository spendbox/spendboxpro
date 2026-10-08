// World-event scenes, part three: city life, mystery and fun, and the twists (the rules of the
// hunt change for a while: these get bold, city-wide looks so nobody misses them).

import {
  Bot,
  Coins,
  Dog,
  Drone,
  EyeOff,
  Gem,
  Ghost,
  Heart,
  Hourglass,
  Paintbrush,
  PartyPopper,
  Ribbon,
  ShieldCheck,
  ShoppingBag,
  Skull,
  Sparkles,
  Store,
  Target,
  Clover,
  Ban,
  Droplets,
  Hammer,
  VolumeX,
  WandSparkles,
  Ship,
  Lightbulb,
  Orbit,
} from "lucide-react";
import {
  ASO,
  CHEER,
  clamp,
  confetti,
  convoy,
  crowd,
  DANCE,
  frac,
  h1,
  parkSpot,
  PARTY,
  person,
  queue,
  SHIRTS,
  signpost,
  SKINS,
  skyDigits,
  smoke,
  smooth,
  sparkles,
  STAND,
  SYNC,
  TAU,
  viewCentre,
  WALK,
  WAVE,
  WORK,
  type Ev,
  type Scene,
} from "./common";
import { BALL, BOX, CONE, CYL, FACE, FIXED, FLAT, GBALL, GBOX, UPRIGHT, type Model } from "./kit";
import { CHEST, DINO, DOG, DRONE, DUCK, PARTY_BALLOON, PIRATE, ROBOT, TANKER } from "./models";
import { along } from "./spots";

const DINOS: readonly Model[] = [DINO];
const waterFit = (e: Ev, want: number) => clamp(Math.max(e.s.waterW, e.s.waterD) / want, 0.45, 1.3);
function pond(e: Ev) {
  if (e.s.pool > 0) e.k.water(e.s.x, e.s.waterY, e.s.z, e.s.pool * 2 * e.pop, e.s.pool * 2 * e.pop, 0x3f8fd0, 0.92 * e.life, true);
}
const frontYaw = (e: Ev) => Math.atan2(-(e.s.fz - e.s.z), e.s.fx - e.s.x);

/** A reward to tap: glow, sparkles, a pulsing ring, and the tap target (while it can be grabbed). */
function reward(e: Ev, x: number, y: number, z: number, r: number, hex: number) {
  const k = e.k;
  if (!e.claimable) return;
  const p = 0.5 + 0.5 * Math.sin(e.t * 5);
  k.glow(x, y, z, r * 3.2 + p * r, hex, e.life * 0.9);
  sparkles(k, x, y + r * 0.4, z, r, r * 0.8, r, e.t, e.id, 0xffffff, e.life, 16, 0.09);
  k.card(1, "ring", x, y - r * 0.5, z, r * 2 + frac(e.t) * r * 3, r * 2 + frac(e.t) * r * 3, FLAT, 0, hex, e.life * (1 - frac(e.t)));
  k.hit(e.id, x, y, z, r * 1.6);
}

/** A tile-sized glowing square over the area of an area twist (radius in tiles). */
function areaGlow(e: Ev, radius: number, hex: number, a: number, cell = "softsq") {
  const size = (radius * 2 + 1) * 1.15;
  e.k.card(1, cell, e.s.x, e.s.ground + 0.03, e.s.z, size * e.pop, size * e.pop, FLAT, 0, hex, e.life * a);
}

export const SCENES_C: Record<string, Scene> = {
  // ---------------------------------------------------------------- city life
  market_day: {
    icon: Store,
    sound: "crowd",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      const R = s.w > 1 ? 0.95 : 0.6;
      // Extra stalls under bright umbrellas all round, shoppers everywhere.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const x = s.x + Math.cos(a) * R;
        const z = s.z + Math.sin(a) * R;
        k.put(BOX, x, y + 0.05, z, 0.14 * e.pop, 0.1 * e.pop, 0.1 * e.pop, -a, 0x8a5a2b);
        k.put(CYL, x, y + 0.15, z, 0.012, 0.3 * e.pop, 0.012, 0, 0xdee2e6);
        k.put(CONE, x, y + 0.31 * e.pop, z, 0.3 * e.pop, 0.08 * e.pop, 0.3 * e.pop, 0, PARTY[i % PARTY.length]);
        for (let j = 0; j < 3; j++) k.put(BALL, x + (j - 1) * 0.035, y + 0.11 * e.pop, z, 0.03, 0.03, 0.03, 0, [0xff922b, 0xfcc419, 0x69db7c, 0xe03131][(i + j) % 4]);
      }
      crowd(e, 34, s.x, y, s.z, R * 1.1, R * 1.1, WALK, NaN, NaN, 0, ASO.concat(SHIRTS));
      e.by = y + 1.4;
    },
  },

  black_friday: {
    icon: ShoppingBag,
    sound: "crowd",
    draw(e) {
      const { k, s } = e;
      const hw = s.w > 1 ? 0.95 : 0.45;
      const yaw = frontYaw(e);
      const ca = Math.cos(yaw);
      const sa = -Math.sin(yaw);
      const dx = ca * hw;
      const dz = sa * hw;
      // A queue from the doors, along the front and round the corner.
      const n = 26;
      queue(e, Math.round(n * 0.5), s.x + dx * 1.1, 0.07, s.z + dz * 1.1, s.x + dx * 1.1 - sa * hw * 1.4, s.z + dz * 1.1 + ca * hw * 1.4, 1);
      queue(e, Math.round(n * 0.5), s.x + dx * 1.1 - sa * hw * 1.55, 0.07, s.z + dz * 1.1 + ca * hw * 1.55, s.x - dx * 0.6 - sa * hw * 1.55, s.z - dz * 0.6 + ca * hw * 1.55, 2);
      for (let i = 0; i < 3; i++) signpost(k, "sale", s.x + dx * 1.2 + sa * (i - 1) * 0.4, 0.08, s.z + dz * 1.2 - ca * (i - 1) * 0.4, 0.26, e.life);
      for (let j = 0; j < 6; j++) {
        k.slot[0] = PARTY[j];
        k.root(s.x + dx * 1.05 + sa * (j % 2 ? 0.15 : -0.15), 0.08, s.z + dz * 1.05 - ca * (j % 2 ? 0.15 : -0.15), 0, 1.1 * e.pop, (j - 2.5) * 0.12);
        k.model(PARTY_BALLOON, e.t);
      }
      // Shoppers running off with their bags.
      for (let i = 0; i < 5; i++) {
        const u = frac(e.t * 0.15 + i / 5);
        const x = s.x + dx * (1.1 + u * 1.4) + sa * (i - 2) * 0.2;
        const z = s.z + dz * (1.1 + u * 1.4) - ca * (i - 2) * 0.2;
        person(k, x, 0.07, z, yaw, PARTY[i + 2], SKINS[i], WALK, e.t, i, e.pop * clamp((1 - u) * 5));
        k.put(BOX, x, 0.12, z + 0.05, 0.05, 0.06, 0.02, yaw, PARTY[i]);
      }
      e.by = s.top + 1.2;
    },
  },

  water_tanker: {
    icon: Droplets,
    sound: "splash",
    draw(e) {
      const { k } = e;
      const p = parkSpot(e, 0, 0.8);
      k.root(p.x, 0.06, p.z, p.yaw, 1.15 * e.pop);
      k.model(TANKER, e.t);
      const tx = p.x - Math.cos(p.yaw) * 0.32;
      const tz = p.z + Math.sin(p.yaw) * 0.32;
      for (let i = 0; i < 10; i++) {
        const u = frac(e.t * 2 + i / 10);
        k.bit(tx, 0.1 - u * 0.04, tz + 0.08, 0.02, 0x9fd3ff, e.life);
      }
      k.water(tx, 0.068, tz + 0.1, 0.3, 0.3, 0x6fb7e0, 0.6 * e.life, true);
      const yaw = p.yaw + Math.PI / 2;
      const ox = Math.cos(yaw);
      const oz = -Math.sin(yaw);
      queue(e, 10, tx + ox * 0.15, 0.07, tz + oz * 0.15, tx + ox * 1.5, tz + oz * 1.5, 3);
      for (let i = 0; i < 10; i++) {
        const f = i / 9;
        k.put(BOX, tx + ox * (0.15 + f * 1.35) + 0.05, 0.1, tz + oz * (0.15 + f * 1.35), 0.04, 0.06, 0.03, 0, [0xfcc419, 0x1c7ed6, 0xe03131, 0x2f9e44][i % 4]);
      }
      e.by = 1.3;
    },
  },

  ribbon_cutting: {
    icon: Ribbon,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const yaw = frontYaw(e);
      const ca = Math.cos(yaw);
      const sa = -Math.sin(yaw);
      const hw = s.w > 1 ? 0.9 : 0.45;
      const cx = s.x + ca * (hw + 0.15);
      const cz = s.z + sa * (hw + 0.15);
      const y = s.ground;
      // A balloon arch over the door, a red ribbon across it; snip, confetti, again.
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        const r = 0.32;
        k.put(BALL, cx - sa * Math.cos(a) * r, y + Math.sin(a) * r * 1.2 + 0.02, cz + ca * Math.cos(a) * r, 0.08 * e.pop, 0.08 * e.pop, 0.08 * e.pop, 0, PARTY[i % 4]);
      }
      const cycle = frac(e.t / 12);
      const cut = cycle > 0.6;
      for (const side of [-1, 1]) {
        const px = cx - sa * 0.3 * side;
        const pz = cz + ca * 0.3 * side;
        k.put(CYL, px, y + 0.1, pz, 0.02, 0.2, 0.02, 0, 0xd4af37);
        const end = cut ? 0.08 : 0.3;
        k.rod(BOX, px, y + 0.19, pz, cx - sa * (0.3 - end) * side, y + (cut ? 0.1 : 0.19), cz + ca * (0.3 - end) * side, 0.02, 0xe03131);
      }
      k.put(BOX, cx, y + 0.19, cz, 0.06, 0.06, 0.02, yaw, 0xe03131);
      person(k, cx + ca * 0.15, y, cz + sa * 0.15, yaw + Math.PI, 0x15161a, SKINS[4], cut ? CHEER : STAND, e.t, 0, e.pop, 0x15161a);
      if (cut) confetti(k, cx, y, cz, 1.2, 1.4, e.t, e.id, e.life, 60);
      crowd(e, 18, cx + ca * 0.6, y, cz + sa * 0.6, 0.45, 0.45, cut ? CHEER : STAND, cx, cz);
      e.by = s.top + 1.2;
    },
  },

  demolition: {
    icon: Hammer,
    sound: "boom",
    draw(e) {
      const { k, s } = e;
      const yaw = frontYaw(e);
      const bx = s.x - Math.cos(yaw) * 0.0;
      const bz = s.z;
      // The old block stands, charges flash, it drops into its own dust, the dust drifts off.
      const T = 14;
      const fall = smooth(T, T + 4, e.t);
      const H = 2.2;
      const h = H * (1 - fall);
      if (h > 0.05) {
        k.put(BOX, bx + 0.6, h / 2, bz, 0.5, h, 0.5, 0, 0x9c8f80, 0, fall * 0.12);
        for (let j = 0; j < 5; j++) {
          const wy = 0.25 + j * 0.4;
          if (wy < h) k.card(0, "windows", bx + 0.6, wy, bz + 0.252, 0.4, 0.35, FIXED, 0, 0x2b2f36, 1);
        }
      }
      if (e.t > T - 3 && e.t < T) {
        for (let j = 0; j < 4; j++) if (frac(e.t * 3 + j * 0.25) < 0.3) k.glow(bx + 0.6 + (j % 2 ? 0.26 : -0.26), 0.3 + j * 0.45, bz + 0.26, 0.5, 0xffe066, e.life);
      }
      if (e.t > T && e.t < T + 1) k.flash((1 - (e.t - T)) * 0.6 * e.life);
      const dust = smooth(T, T + 1, e.t) * (1 - smooth(T + 10, T + 60, e.t));
      for (let i = 0; i < 40; i++) {
        const a = h1(e.id, i) * TAU;
        const r = (0.2 + h1(e.id, i, 1) * 1.3) * smooth(T, T + 8, e.t);
        k.puff(bx + 0.6 + Math.cos(a) * r, 0.2 + h1(e.id, i, 2) * 1.6 * smooth(T, T + 6, e.t), bz + Math.sin(a) * r, 1 + h1(e.id, i, 3), 0xb7a68f, e.life * dust * 0.55);
      }
      if (fall > 0.9) for (let i = 0; i < 9; i++) k.put(BOX, bx + 0.6 + (h1(e.id, i) - 0.5) * 0.6, 0.06, bz + (h1(e.id, i, 1) - 0.5) * 0.6, 0.12, 0.08, 0.1, i, 0x8c7f70, 0.3);
      if (e.t < T) skyDigits(e, T - e.t, false, bx + 0.6, H + 0.8, bz, 0.6, 0xff6b6b, e.life);
      crowd(e, 12, s.fx, 0.065, s.fz, 0.35, 0.35, e.t > T ? CHEER : STAND, bx + 0.6, bz);
      e.bx = bx + 0.6;
      e.by = H + 1.6;
    },
  },

  street_mural: {
    icon: Paintbrush,
    sound: "crowd",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      // A freshly painted wall, painters on a little scaffold, spray drifting.
      const wx = s.x;
      const wz = s.z - 0.25;
      k.put(BOX, wx, y + 0.3 * e.pop, wz, 0.95 * e.pop, 0.6 * e.pop, 0.06, 0, 0xe9ecef);
      k.card(0, "mural", wx, y + 0.3 * e.pop, wz + 0.032, 0.9 * e.pop, 0.56 * e.pop, FIXED, 0, 0xffffff, e.life);
      k.card(0, "mural", wx, y + 0.3 * e.pop, wz - 0.032, 0.9 * e.pop, 0.56 * e.pop, FIXED, Math.PI, 0xffffff, e.life);
      for (let i = 0; i < 2; i++) {
        const px = wx + (i ? 0.25 : -0.25);
        k.put(BOX, px, y + 0.2, wz + 0.1, 0.2, 0.012, 0.08, 0, 0xc9a76f);
        person(k, px, y + 0.21, wz + 0.12, Math.PI / 2 + Math.PI, PARTY[i + 3], SKINS[i * 3], WORK, e.t, i, e.pop * 0.9);
        for (let j = 0; j < 6; j++) {
          const u = frac(e.t * 2 + j / 6);
          k.puff(px + (j - 2.5) * 0.02, y + 0.35 + u * 0.1, wz + 0.05 + u * 0.05, 0.06, PARTY[(i * 2 + j) % 8], e.life * (1 - u) * 0.6);
        }
      }
      crowd(e, 10, wx, y, wz + 0.6, 0.45, 0.15, STAND, wx, wz);
      e.by = y + 1.4;
    },
  },

  blackout_party: {
    icon: Lightbulb,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      k.dome(s.x, 0, s.z, 2 * e.pop, Math.max(1.6, s.top + 0.6) * e.pop, 2 * e.pop, 0x05070f, 0.5 * e.life, 0);
      crowd(e, 22, s.fx, 0.065, s.fz, 0.45, 0.45, DANCE, s.fx, s.fz);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        const x = s.fx + Math.cos(a) * 0.6;
        const z = s.fz + Math.sin(a) * 0.6;
        k.put(CYL, x, 0.09, z, 0.02, 0.05, 0.02, 0, 0xf8f9fa);
        const fl = 0.75 + 0.25 * Math.sin(e.t * 13 + i * 3);
        k.spark(x, 0.13, z, 0.06, 0xffd28a, e.life * fl);
        k.glow(x, 0.13, z, 0.28, 0xffa94d, e.life * fl * 0.7);
      }
      for (let i = 0; i < 4; i++) {
        const u = frac(e.t * 0.25 + i / 4);
        k.card(0, "music", s.fx + Math.sin(i * 2 + e.t) * 0.4, 0.35 + u * 1, s.fz + Math.cos(i * 2) * 0.4, 0.2, 0.2, FACE, 0, 0xffe8a3, e.life * Math.sin(u * Math.PI));
      }
      e.bx = s.fx;
      e.bz = s.fz;
      e.by = 1.5;
    },
  },

  lost_dog: {
    icon: Dog,
    sound: "bark",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      // Sniffing about the park, stopping now and then to wag.
      const a = e.t * 0.35 + Math.sin(e.t * 0.9) * 0.6;
      const r = 0.32 + Math.sin(e.t * 0.23) * 0.1;
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      k.slot[0] = 0xc08a4a;
      k.root(x, y, z, -a - Math.PI / 2, 1.8 * e.pop);
      k.model(DOG, e.t * (Math.sin(e.t * 0.5) > 0.7 ? 0.2 : 1));
      for (let i = 0; i < 6; i++) {
        const b = a - 0.25 - i * 0.22;
        k.card(0, "paw", s.x + Math.cos(b) * r, y + 0.005, s.z + Math.sin(b) * r, 0.06, 0.06, FLAT, -b, 0x5c4033, e.life * (1 - i / 6) * 0.8);
      }
      reward(e, x, y + 0.14, z, 0.18, 0xffd43b);
      signpost(k, "paw", s.fx, 0.065, s.fz, 0.22, e.life);
      e.bx = x;
      e.bz = z;
      e.by = y + 1.1;
    },
  },

  lottery_winner: {
    icon: Coins,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      person(k, s.x, y, s.z, Math.sin(e.t) * 0.6, 0xfcc419, SKINS[2], CHEER, e.t, 0, e.pop * 1.3);
      k.card(0, "cheque", s.x, y + 0.5 + Math.abs(Math.sin(e.t * 6)) * 0.04, s.z, 0.6 * e.pop, 0.3 * e.pop, UPRIGHT, 0, 0xffffff, e.life);
      for (let i = 0; i < 16; i++) {
        const u = frac(e.t * 0.35 + h1(e.id, i));
        const ang = h1(e.id, i, 1) * TAU;
        const rr = 0.2 + h1(e.id, i, 2) * 0.7;
        k.card(0, "coin", s.x + Math.cos(ang) * rr, y + 1.6 - u * 1.5, s.z + Math.sin(ang) * rr, 0.1 * Math.abs(Math.cos(e.t * 6 + i)) + 0.01, 0.1, UPRIGHT, 0, 0xffffff, e.life * Math.min(1, (1 - u) * 5));
      }
      confetti(k, s.x, y, s.z, 1.4, 1.6, e.t, e.id, e.life, 70);
      sparkles(k, s.x, y + 0.6, s.z, 0.6, 0.5, 0.6, e.t, e.id, 0xffe066, e.life, 16);
      crowd(e, 22, s.x, y, s.z, 0.6, 0.6, CHEER, s.x, s.z, 1);
      e.by = y + 1.7;
    },
  },

  flash_mob: {
    icon: PartyPopper,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      // Everyone in rows, every move in time.
      for (let i = 0; i < 25; i++) {
        const gx = (i % 5) - 2;
        const gz = Math.floor(i / 5) - 2;
        const freeze = frac(e.t / 12) > 0.85;
        person(k, s.x + gx * 0.16, y, s.z + gz * 0.16, 0, PARTY[(i * 3) % 8], SKINS[i % 7], freeze ? STAND : SYNC, e.t, 0, e.pop);
      }
      k.beam(s.x, y + 4, s.z, s.x, y, s.z, 0.6, 0xfff3bf, e.life * (0.35 + 0.35 * e.night));
      k.card(1, "glow", s.x, y + 0.02, s.z, 1.3, 1.3, FLAT, 0, 0xfff3bf, e.life * 0.4);
      crowd(e, 14, s.x, y, s.z, 0.75, 0.75, CHEER, s.x, s.z, 2);
      e.by = y + 1.4;
    },
  },

  // ---------------------------------------------------------------- mystery and fun
  museum_ghost: {
    icon: Ghost,
    sound: "eerie",
    draw(e) {
      const { k, s } = e;
      const R = s.w > 1 ? 0.9 : 0.5;
      const a = e.t * 0.4;
      const fade = 0.55 + 0.45 * Math.sin(e.t * 0.9);
      const gx = s.x + Math.cos(a) * R;
      const gz = s.z + Math.sin(a) * R;
      const gy = s.top + 0.25 + Math.sin(e.t * 1.7) * 0.15;
      k.card(0, "ghost", gx, gy, gz, 0.6, 0.6, UPRIGHT, 0, 0xe6fff3, e.life * fade * 0.9, Math.sin(e.t * 1.3) * 0.2);
      k.glow(gx, gy, gz, 1.4, 0x8cffc8, e.life * fade * 0.6);
      for (let i = 0; i < 4; i++) {
        const fl = Math.sin(e.t * (7 + i * 3) + i) > 0.3 ? 1 : 0.2;
        const b = (i / 4) * TAU + Math.PI / 4;
        k.glow(s.x + Math.cos(b) * R * 0.8, s.top * 0.5, s.z + Math.sin(b) * R * 0.8, 0.6, 0x69ffb4, e.life * fl * 0.6);
      }
      sparkles(k, s.x, s.top + 0.4, s.z, R, 0.5, R, e.t, e.id, 0xb2f2bb, e.life * 0.7, 18, 0.07);
      for (let i = 0; i < 10; i++) k.puff(s.x + (h1(e.id, i) - 0.5) * 2.4, 0.15, s.z + (h1(e.id, i, 1) - 0.5) * 2.4, 0.9, 0xc3fae8, e.life * 0.15);
      e.by = s.top + 1.3;
    },
  },

  haunted_house: {
    icon: Skull,
    sound: "eerie",
    draw(e) {
      const { k, s } = e;
      const hw = 0.3;
      for (let i = 0; i < 4; i++) {
        const nx = i === 0 ? 1 : i === 1 ? -1 : 0;
        const nz = i === 2 ? 1 : i === 3 ? -1 : 0;
        const fl = Math.sin(e.t * (9 + i * 2.3) + i * 4) > 0.1 || Math.sin(e.t * 1.1 + i) > 0.7;
        k.put(GBOX, s.x + nx * hw, s.top * 0.45, s.z + nz * hw, nx ? 0.01 : 0.12, 0.1, nz ? 0.01 : 0.12, 0, fl ? 0xb6ff8c : 0x1a2412);
        if (fl) k.glow(s.x + nx * (hw + 0.05), s.top * 0.45, s.z + nz * (hw + 0.05), 0.5, 0x9cff6b, e.life * 0.6);
      }
      for (let i = 0; i < 14; i++) k.puff(s.x + (h1(e.id, i) - 0.5) * 1.6, 0.12, s.z + (h1(e.id, i, 1) - 0.5) * 1.6, 0.6, 0x9775fa, e.life * 0.25);
      for (let i = 0; i < 9; i++) {
        const a = e.t * (0.9 + h1(e.id, i) * 0.5) + (i / 9) * TAU;
        const r = 0.5 + h1(e.id, i, 1) * 0.4;
        const flap = 0.5 + 0.5 * Math.abs(Math.sin(e.t * 16 + i));
        k.card(0, "bat", s.x + Math.cos(a) * r, s.top + 0.3 + Math.sin(e.t * 2 + i) * 0.2, s.z + Math.sin(a) * r, 0.14 * flap + 0.04, 0.08, FACE, 0, 0x1b1520, e.life);
      }
      const peek = Math.max(0, Math.sin(e.t * 0.6));
      k.card(0, "ghost", s.x, s.top + 0.1 + peek * 0.25, s.z, 0.35, 0.35, UPRIGHT, 0, 0xffffff, e.life * peek * 0.85);
      e.by = s.top + 1.3;
    },
  },

  treasure_chest: {
    icon: Gem,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      pond(e);
      const bob = Math.sin(e.t * 1.6) * 0.03;
      const x = s.x + Math.sin(e.t * 0.2) * 0.2;
      const z = s.z + Math.cos(e.t * 0.17) * 0.2;
      k.root(x, s.waterY - 0.03 + bob, z, e.t * 0.2, 1.6 * e.pop, Math.sin(e.t * 1.3) * 0.12, Math.cos(e.t) * 0.1);
      k.model(CHEST, e.t);
      k.card(0, "splash", x, s.waterY + 0.01, z, 0.6 + frac(e.t * 0.5) * 0.5, 0.6 + frac(e.t * 0.5) * 0.5, FLAT, 0, 0xffffff, e.life * (1 - frac(e.t * 0.5)) * 0.6);
      reward(e, x, s.waterY + 0.25, z, 0.22, 0xffd43b);
      e.bx = x;
      e.bz = z;
      e.by = s.waterY + 1.2;
    },
  },

  crop_circle: {
    icon: Orbit,
    sound: "eerie",
    draw(e) {
      const { k, s } = e;
      const y = s.ground + 0.012;
      const size = 1.9 * e.pop;
      k.card(0, "crop", s.x, y, s.z, size, size, FLAT, e.id, 0xd9c37a, e.life * 0.95);
      k.card(1, "crop", s.x, y + 0.004, s.z, size, size, FLAT, e.id, 0x9cff9c, e.life * (0.25 + 0.25 * Math.sin(e.t * 2)));
      for (let i = 0; i < 3; i++) {
        const a = e.t * 0.8 + (i / 3) * TAU;
        const lx = s.x + Math.cos(a) * 0.6;
        const lz = s.z + Math.sin(a) * 0.6;
        const ly = 1.6 + Math.sin(e.t * 1.5 + i) * 0.2;
        k.put(GBALL, lx, ly, lz, 0.1, 0.1, 0.1, 0, 0xd0fff0);
        k.glow(lx, ly, lz, 0.8, 0x9cffd8, e.life * 0.8);
        k.beam(lx, ly, lz, lx, s.ground, lz, 0.12, 0x9cffd8, e.life * 0.3);
      }
      crowd(e, 6, s.fx, 0.065, s.fz, 0.25, 0.25, STAND, s.x, s.z);
      e.by = 2.6;
    },
  },

  giant_duck: {
    icon: Ship,
    sound: "quack",
    draw(e) {
      const { k, s } = e;
      pond(e);
      const sc = waterFit(e, 1.6) * 1.2;
      const x = s.x + Math.sin(e.t * 0.1) * 0.3 * sc;
      const z = s.z + Math.cos(e.t * 0.08) * 0.3 * sc;
      k.root(x, s.waterY - 0.08 * sc + Math.sin(e.t * 1.1) * 0.03, z, Math.sin(e.t * 0.15) * 1.2, sc * e.pop, Math.sin(e.t * 0.9) * 0.05, Math.cos(e.t * 0.8) * 0.04);
      k.model(DUCK, e.t);
      for (let i = 0; i < 3; i++) {
        const u = frac(e.t * 0.3 + i / 3);
        k.card(0, "splash", x, s.waterY + 0.01, z, (1.2 + u * 1.5) * sc, (1.2 + u * 1.5) * sc, FLAT, 0, 0xffffff, e.life * (1 - u) * 0.5);
      }
      crowd(e, 8, s.fx, 0.065, s.fz, 0.3, 0.3, WAVE, x, z);
      e.bx = x;
      e.bz = z;
      e.by = s.waterY + 1.6 * sc;
    },
  },

  dino_balloon: {
    icon: PartyPopper,
    sound: "roar",
    draw(e) {
      const { k } = e;
      convoy(e, DINOS, 1, 0.3, 0, 1.6, undefined);
      if (e.a.x || e.a.z) {
        const ca = Math.cos(e.a.yaw);
        const sa = -Math.sin(e.a.yaw);
        for (let i = 0; i < 6; i++) {
          const side = i % 2 ? 1 : -1;
          const back = (Math.floor(i / 2) - 1) * 0.35;
          const hx = e.a.x + ca * back - sa * 0.42 * side;
          const hz = e.a.z + sa * back + ca * 0.42 * side;
          person(k, hx, e.a.y, hz, e.a.yaw, 0x2f9e44, SKINS[i], WALK, e.t, i, e.pop, 0xf8f9fa, 0xfcc419);
          k.rod(CYL, hx, e.a.y + 0.2, hz, e.a.x + ca * back * 0.8, e.a.y + 0.8, e.a.z + sa * back * 0.8, 0.006, 0xf8f9fa);
        }
        e.bx = e.a.x;
        e.bz = e.a.z;
      }
      confetti(k, e.bx, 0.06, e.bz, 1.6, 1.2, e.t, e.id, e.life * 0.5, 24);
      crowdAlong(e);
      e.by = 3;
    },
  },

  time_capsule: {
    icon: Hourglass,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const yaw = frontYaw(e);
      const cx = s.x + Math.cos(yaw) * (s.w > 1 ? 0.95 : 0.55);
      const cz = s.z - Math.sin(yaw) * (s.w > 1 ? 0.95 : 0.55);
      const y = s.ground;
      k.card(0, "crater", cx, y + 0.012, cz, 0.7 * e.pop, 0.7 * e.pop, FLAT, 0, 0xffffff, e.life);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        k.put(BALL, cx + Math.cos(a) * 0.38, y + 0.02, cz + Math.sin(a) * 0.38, 0.2 * e.pop, 0.1 * e.pop, 0.16 * e.pop, a, 0x7a5a3a);
      }
      const rise = smooth(0, 8, e.t);
      k.put(CYL, cx, y + 0.02 + rise * 0.06, cz, 0.08, 0.26 * e.pop, 0.08, 0.4, 0xadb5bd, Math.PI / 2);
      k.put(CYL, cx, y + 0.02 + rise * 0.06, cz, 0.085, 0.03, 0.085, 0.4, 0xd4af37, Math.PI / 2);
      reward(e, cx, y + 0.12, cz, 0.18, 0x74c0fc);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.6;
        person(k, cx + Math.cos(a) * 0.5, y, cz + Math.sin(a) * 0.5, Math.atan2(Math.sin(a), -Math.cos(a)), 0xff922b, SKINS[i * 2], i ? WORK : CHEER, e.t, i, e.pop, 0x1c3f6e, 0xfcc419);
        k.rod(BOX, cx + Math.cos(a) * 0.45, y + 0.15, cz + Math.sin(a) * 0.45, cx + Math.cos(a) * 0.35, y, cz + Math.sin(a) * 0.35, 0.012, 0x868e96);
      }
      e.bx = cx;
      e.bz = cz;
      e.by = s.top + 1.2;
    },
  },

  meteor: {
    icon: Sparkles,
    sound: "boom",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      // Streaks in from the sky for the first 4 seconds, then a smoking, glowing crater.
      const T = 4;
      if (e.t < T) {
        const f = e.t / T;
        const sx = s.x + (1 - f) * 14;
        const sy = y + (1 - f) * 18;
        const sz = s.z - (1 - f) * 6;
        k.put(GBALL, sx, sy, sz, 0.35, 0.35, 0.35, 0, 0xffe8a3);
        k.glow(sx, sy, sz, 2.5, 0xffa94d, 1);
        for (let i = 0; i < 26; i++) {
          const g = i * 0.012;
          k.spark(sx + g * 14, sy + g * 18, sz - g * 6, 0.5 * (1 - i / 26), i < 4 ? 0xffffff : 0xff922b, 1 - i / 26);
        }
      } else {
        const after = e.t - T;
        if (after < 1) k.flash((1 - after) * 0.8);
        k.card(0, "crater", s.x, y + 0.015, s.z, 1.5 * e.pop, 1.5 * e.pop, FLAT, 0, 0xffffff, e.life);
        k.card(1, "glow", s.x, y + 0.03, s.z, 1.4, 1.4, FLAT, 0, 0xff6b1a, e.life * (0.5 + 0.2 * Math.sin(e.t * 3)));
        k.put(BALL, s.x, y + 0.04, s.z, 0.3, 0.22, 0.26, 0.4, 0x3b2f2a);
        for (let i = 0; i < 6; i++) {
          const a = h1(e.id, i) * TAU;
          k.put(GBALL, s.x + Math.cos(a) * 0.22, y + 0.06, s.z + Math.sin(a) * 0.22, 0.07, 0.05, 0.07, a, 0xff7a1a);
        }
        smoke(k, s.x, y + 0.1, s.z, e.t, e.id, 3, 0.6, 0x5c5f66, e.life, 16);
        if (after < 2) {
          for (let i = 0; i < 30; i++) {
            const a = h1(e.id, i, 4) * TAU;
            const v = 0.8 + h1(e.id, i, 5) * 1.2;
            k.bit(s.x + Math.cos(a) * v * after, y + v * after * 1.5 - after * after * 2, s.z + Math.sin(a) * v * after, 0.06, 0x5c4033, 1 - after / 2);
          }
        }
        crowd(e, 8, s.x + 0.9, y, s.z + 0.6, 0.3, 0.3, STAND, s.x, s.z);
      }
      e.by = y + 1.6;
    },
  },

  pirate_ship: {
    icon: Skull,
    sound: "boom",
    draw(e) {
      const { k, s } = e;
      pond(e);
      const sc = waterFit(e, 1.8) * 1.05;
      const rx = Math.max(0.2, s.waterW * 0.25);
      const rz = Math.max(0.2, s.waterD * 0.25);
      const a = e.t * 0.12;
      const x = s.x + Math.cos(a) * rx;
      const z = s.z + Math.sin(a) * rz;
      const yaw = Math.atan2(Math.cos(a) * rz, Math.sin(a) * rx);
      k.root(x, s.waterY - 0.03, z, yaw, sc * e.pop, Math.sin(e.t * 0.8) * 0.04, Math.sin(e.t * 1.1) * 0.03);
      k.model(PIRATE, e.t);
      k.local(0.18, 1.0, 0, e.v);
      k.card(0, "jolly", e.v.x, e.v.y, e.v.z, 0.22 * sc, 0.16 * sc, UPRIGHT, 0, 0xffffff, e.life, Math.sin(e.t * 3) * 0.1);
      const shot = frac(e.t / 4);
      if (shot < 0.25) {
        k.local(0, 0.12, 0.25, e.v);
        k.puff(e.v.x, e.v.y + shot * 0.3, e.v.z, 0.3 + shot, 0xf1f3f5, e.life * (1 - shot * 4));
        if (shot < 0.05) k.glow(e.v.x, e.v.y, e.v.z, 0.6, 0xffa94d, e.life);
      }
      for (let i = 0; i < 5; i++) {
        const u = frac(e.t * 0.5 + i / 5);
        k.card(0, "splash", x - Math.cos(yaw) * u * 1.2 * sc, s.waterY + 0.01, z + Math.sin(yaw) * u * 1.2 * sc, 0.3 + u * 0.4, 0.3 + u * 0.4, FLAT, 0, 0xffffff, e.life * (1 - u) * 0.5);
      }
      e.bx = x;
      e.bz = z;
      e.by = s.waterY + 1.7 * sc;
    },
  },

  vanishing_act: {
    icon: WandSparkles,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const hw = s.w > 1 ? 1.05 : 0.5;
      // A giant curtain rises round the tower... poof!... and drops again.
      const c = frac(e.t / 30);
      const up = smooth(0.05, 0.3, c) * (1 - smooth(0.7, 0.85, c));
      const H = (s.top + 0.3) * up;
      if (H > 0.02) {
        k.put(CYL, s.x, H / 2, s.z, hw * 2.1, H, hw * 2.1, e.t * 0.2, 0xb0172e);
        k.put(CYL, s.x, H, s.z, hw * 2.16, 0.06, hw * 2.16, 0, 0xd4af37);
      }
      if (c > 0.5 && c < 0.62) {
        const f = (c - 0.5) / 0.12;
        for (let i = 0; i < 30; i++) {
          const a = h1(e.id, i) * TAU;
          const r = hw * (1 + f * 1.5);
          k.puff(s.x + Math.cos(a) * r, s.top * h1(e.id, i, 1) + f, s.z + Math.sin(a) * r, 1.2, 0xb197fc, e.life * (1 - f) * 0.6);
        }
        k.flash((1 - f) * 0.3 * e.life);
      }
      sparkles(k, s.x, s.top * 0.6, s.z, hw * 1.4, s.top * 0.5, hw * 1.4, e.t * 1.5, e.id, 0xe5dbff, e.life * (0.4 + up), 34, 0.1);
      const yaw = frontYaw(e);
      const mx = s.x + Math.cos(yaw) * (hw + 0.35);
      const mz = s.z - Math.sin(yaw) * (hw + 0.35);
      person(k, mx, s.ground, mz, yaw + Math.PI, 0x15161a, SKINS[1], WAVE, e.t, 0, e.pop * 1.2, 0x15161a, 0x15161a);
      k.put(CYL, mx, s.ground + 0.3 * e.pop * 1.2, mz, 0.04, 0.07, 0.04, 0, 0x15161a);
      crowd(e, 14, mx + Math.cos(yaw) * 0.45, s.ground, mz - Math.sin(yaw) * 0.45, 0.35, 0.35, c > 0.6 ? CHEER : STAND, s.x, s.z);
      e.by = s.top + 1.4;
    },
  },

  rooftop_proposal: {
    icon: Heart,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const y = s.top + 0.01;
      person(k, s.x - 0.07, y, s.z, 0, 0xf8f9fa, SKINS[2], STAND, e.t, 0, e.pop * 1.2, 0x1c1f26);
      // On one knee (shorter, leaning in), then both cheering.
      const yes = e.t > 10;
      person(k, s.x + 0.1, y - (yes ? 0 : 0.05), s.z, Math.PI, 0x1c1f26, SKINS[4], yes ? CHEER : STAND, e.t, 1, e.pop * 1.2, 0x1c1f26);
      if (!yes) k.put(BOX, s.x + 0.04, y + 0.15, s.z, 0.02, 0.02, 0.02, e.t, 0xffe066);
      for (let i = 0; i < 10; i++) {
        const u = frac(e.t * 0.25 + i / 10);
        k.card(0, "heart", s.x + Math.sin(i * 2.3 + e.t * 0.5) * 0.4, y + 0.3 + u * 1.6, s.z + Math.cos(i * 1.7) * 0.4, 0.16 + (i % 3) * 0.05, 0.16 + (i % 3) * 0.05, FACE, 0, i % 2 ? 0xff4d6d : 0xff8fab, e.life * Math.sin(u * Math.PI));
      }
      for (let i = 0; i < 30; i++) {
        const u = frac(e.t * 0.2 + h1(e.id, i));
        k.bit(s.x + (h1(e.id, i, 1) - 0.5) * 1.2, y + 1.2 - u * 1.2, s.z + (h1(e.id, i, 2) - 0.5) * 1.2, 0.035, 0xff6b8a, e.life);
      }
      k.beam(s.x, y + 5, s.z, s.x, y, s.z, 0.5, 0xffd6e0, e.life * (0.3 + 0.4 * e.night));
      k.card(1, "glow", s.x, y + 0.01, s.z, 0.9, 0.9, FLAT, 0, 0xff8fab, e.life * 0.5);
      sparkles(k, s.x, y + 0.4, s.z, 0.5, 0.3, 0.5, e.t, e.id, 0xffffff, e.life, 14, 0.08);
      e.by = y + 1.5;
    },
  },

  // ---------------------------------------------------------------- twists
  fog_of_war: {
    icon: EyeOff,
    sound: "wind",
    draw(e) {
      const { k } = e;
      k.fog(1 - 0.7 * e.life);
      k.tint(0x9aa3ad, 0.5 * e.life);
      k.dim(1 - 0.2 * e.life);
      const c = viewCentre(e);
      for (let i = 0; i < 80; i++) {
        const x = c.x + (h1(e.id, i) - 0.5) * 20 + Math.sin(e.t * 0.1 + i) * 1.5;
        const z = c.z + (h1(e.id, i, 1) - 0.5) * 20 + Math.cos(e.t * 0.08 + i) * 1.5;
        k.puff(x, 0.4 + h1(e.id, i, 2) * 2.2, z, 2.4 + h1(e.id, i, 3) * 2, 0xd9dee3, e.life * 0.3);
      }
    },
  },

  double_coins: {
    icon: Coins,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      k.tint(0xffd27a, 0.14 * e.life);
      const c = viewCentre(e);
      for (let i = 0; i < 40; i++) {
        const x = c.x + (h1(e.id, i) - 0.5) * 16;
        const z = c.z + (h1(e.id, i, 1) - 0.5) * 16;
        const u = frac(e.t * 0.12 + h1(e.id, i, 2));
        k.card(0, "coin", x, 0.5 + u * 5, z, 0.3 * Math.abs(Math.cos(e.t * 3 + i)) + 0.02, 0.3, UPRIGHT, 0, 0xffffff, e.life * Math.sin(u * Math.PI));
      }
      sparkles(k, c.x, 2.5, c.z, 8, 2, 8, e.t, e.id, 0xffe066, e.life, 60, 0.12);
      k.card(0, "x2", s.x, Math.max(s.top, 1) + 1.6 + Math.sin(e.t * 2) * 0.1, s.z, 0.9 * e.pop, 0.9 * e.pop, FACE, 0, 0xffffff, e.life);
      k.glow(s.x, Math.max(s.top, 1) + 1.6, s.z, 2.4, 0xffd43b, e.life * 0.7);
      e.by = Math.max(s.top, 1) + 2.6;
    },
  },

  ghost_amnesty: {
    icon: Ghost,
    sound: "eerie",
    draw(e) {
      const { k, s } = e;
      k.tint(0x6bffb0, 0.12 * e.life);
      const c = viewCentre(e);
      for (let i = 0; i < 26; i++) {
        const a = h1(e.id, i) * TAU + e.t * (0.1 + h1(e.id, i, 1) * 0.1);
        const r = 2 + h1(e.id, i, 2) * 7;
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r;
        const y = 0.8 + h1(e.id, i, 3) * 2.5 + Math.sin(e.t * 1.3 + i) * 0.3;
        k.card(1, "ghost", x, y, z, 0.55, 0.55, UPRIGHT, 0, 0x8cffc4, e.life * (0.5 + 0.3 * Math.sin(e.t + i)));
      }
      sparkles(k, c.x, 1.5, c.z, 8, 1.5, 8, e.t, e.id, 0x8cffc4, e.life, 50, 0.1);
      k.card(1, "ghost", s.x, Math.max(s.top, 1) + 1.4, s.z, 1.1, 1.1, UPRIGHT, 0, 0x8cffc4, e.life);
      e.by = Math.max(s.top, 1) + 2.5;
    },
  },

  drone_storm: {
    icon: Drone,
    sound: "hum",
    draw(e) {
      const { k, s } = e;
      k.tint(0x4d8bff, 0.12 * e.life);
      const c = viewCentre(e);
      k.slot[0] = 0x2b3038;
      for (let i = 0; i < 28; i++) {
        const sw = i % 4;
        const cx = c.x + Math.cos(sw * 1.7 + e.t * 0.15) * 4;
        const cz = c.z + Math.sin(sw * 1.7 + e.t * 0.15) * 4;
        const a = e.t * (1.2 + h1(e.id, i) * 0.8) + (i / 28) * TAU * 3;
        const r = 0.6 + h1(e.id, i, 1) * 1.2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const y = 2 + h1(e.id, i, 2) * 2 + Math.sin(e.t * 2 + i) * 0.3;
        k.root(x, y, z, -a, 2.2 * e.pop, 0.2, 0);
        k.model(DRONE, e.t);
        k.glow(x, y - 0.05, z, 0.5, 0x4dd8ff, e.life * 0.7);
        if (frac(e.t * 0.7 + i * 0.37) < 0.06) k.beam(x, y, z, x, 0.05, z, 0.15, 0x4dd8ff, e.life);
      }
      sparkles(k, c.x, 2.8, c.z, 6, 1.5, 6, e.t * 2, e.id, 0x9be7ff, e.life, 40, 0.1);
      e.by = Math.max(s.top, 1) + 1.6;
    },
  },

  lucky_street: {
    icon: Clover,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const r = e.kind.radius ?? 1;
      areaGlow(e, r, 0xffd43b, 0.55 + 0.15 * Math.sin(e.t * 3));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + e.t * 0.4;
        const R = r + 0.3;
        k.card(0, "clover", s.x + Math.cos(a) * R, 0.5 + Math.sin(e.t * 2 + i) * 0.1, s.z + Math.sin(a) * R, 0.3, 0.3, UPRIGHT, 0, 0x51cf66, e.life);
      }
      sparkles(k, s.x, 0.6, s.z, r + 0.5, 0.5, r + 0.5, e.t, e.id, 0xffe066, e.life, 40, 0.1);
      k.beam(s.x, 0.05, s.z, s.x, 5, s.z, r + 0.3, 0xffd43b, e.life * 0.25);
      e.by = 2;
    },
  },

  bot_tantrum: {
    icon: Bot,
    sound: "zap",
    draw(e) {
      const { k, s } = e;
      // It stomps, steams, then teleports to another spot nearby (and stomps again).
      const hop = Math.floor(e.t / 8);
      const u = frac(e.t / 8);
      const ox = (h1(e.id, hop) - 0.5) * 3;
      const oz = (h1(e.id, hop, 1) - 0.5) * 3;
      const x = s.fx + ox;
      const z = s.fz + oz;
      const jump = Math.max(0, Math.sin(e.t * 9)) * 0.08;
      const g = e.pop * smooth(0, 0.08, u) * (1 - smooth(0.92, 1, u));
      k.root(x, 0.07 + jump, z, Math.sin(e.t * 3) * 0.8, 1.6 * g);
      k.model(ROBOT, e.t);
      for (let i = 0; i < 6; i++) {
        const v = frac(e.t * 1.5 + i / 6);
        k.puff(x + (i % 2 ? 0.08 : -0.08), 0.95 + v * 0.6, z, 0.2 + v * 0.3, 0xf1f3f5, e.life * (1 - v) * 0.6);
      }
      sparkles(k, x, 0.5, z, 0.4, 0.4, 0.4, e.t * 2, e.id, 0xff6b6b, e.life, 14, 0.09);
      if (u < 0.08 || u > 0.92) {
        const f = u < 0.08 ? 1 - u / 0.08 : (u - 0.92) / 0.08;
        k.card(1, "ring", x, 0.09, z, 0.4 + (1 - f) * 1.4, 0.4 + (1 - f) * 1.4, FLAT, 0, 0xff6b6b, e.life * f);
        k.beam(x, 0.05, z, x, 3, z, 0.4, 0xff6b6b, e.life * f);
      }
      k.card(0, "robot", x, 1.45, z, 0.4, 0.4, FACE, 0, 0xff8787, e.life * g);
      e.bx = x;
      e.bz = z;
      e.by = 2.2;
    },
  },

  spotlight: {
    icon: Target,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const r = e.kind.radius ?? 2;
      const sway = Math.sin(e.t * 0.5) * 0.3;
      k.beam(s.x + sway + 3, 14, s.z - 2, s.x, 0.05, s.z, r + 0.6, 0xfff3bf, e.life * (0.45 + 0.3 * e.night));
      areaGlow(e, r, 0xfff3bf, 0.35, "glow");
      k.card(1, "ring", s.x, s.ground + 0.04, s.z, (r * 2 + 1.2) * e.pop, (r * 2 + 1.2) * e.pop, FLAT, e.t * 0.3, 0xffe066, e.life * 0.9);
      sparkles(k, s.x, 0.8, s.z, r, 0.6, r, e.t, e.id, 0xfff3bf, e.life, 26, 0.09);
      e.by = Math.max(s.top, 1) + 1.6;
    },
  },

  golden_balloon: {
    icon: Sparkles,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const x = s.x + Math.sin(e.t * 0.15) * 1.2;
      const z = s.z + Math.cos(e.t * 0.12) * 1.2;
      const y = Math.max(s.top, 1) + 1.6 + Math.sin(e.t * 0.8) * 0.2;
      if (e.claimable || !e.kind.reward) {
        k.slot[0] = 0xf2c230;
        k.root(x, y - 1.2, z, 0, 2.6 * e.pop, Math.sin(e.t * 0.7) * 0.1, Math.cos(e.t * 0.6) * 0.1);
        k.model(PARTY_BALLOON, e.t);
        k.glow(x, y + 0.1, z, 1.6, 0xffd43b, e.life * 0.8);
        sparkles(k, x, y + 0.1, z, 0.4, 0.4, 0.4, e.t, e.id, 0xfff3bf, e.life, 18, 0.1);
        reward(e, x, y + 0.1, z, 0.3, 0xffd43b);
      } else {
        // Already grabbed: it floats away.
        sparkles(k, x, y, z, 0.6, 0.6, 0.6, e.t, e.id, 0xffe066, e.life * 0.6, 14, 0.08);
      }
      e.bx = x;
      e.bz = z;
      e.by = y + 1.1;
    },
  },

  quiet_hour: {
    icon: VolumeX,
    sound: "none",
    draw(e) {
      const { k, s } = e;
      k.tint(0x9c8cff, 0.12 * e.life);
      k.dim(1 - 0.1 * e.life);
      const c = viewCentre(e);
      sparkles(k, c.x, 0.8, c.z, 7, 0.6, 7, e.t * 0.6, e.id, 0xd0ff9c, e.life, 70, 0.08);
      for (let i = 0; i < 4; i++) {
        const u = frac(e.t * 0.15 + i / 4);
        k.card(0, "zzz", s.x + Math.sin(e.t * 0.5 + i) * 0.3, Math.max(s.top, 0.5) + 0.3 + u * 1.5, s.z, 0.4, 0.4, FACE, 0, 0xe5dbff, e.life * Math.sin(u * Math.PI));
      }
      k.card(0, "shh", s.x, Math.max(s.top, 0.5) + 0.25, s.z, 0.5, 0.5, FACE, 0, 0xffffff, e.life);
      e.by = Math.max(s.top, 0.5) + 2;
    },
  },

  bounty_board: {
    icon: Skull,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      // The wanted poster, with the ghost's name, floating over the spot.
      const ui = e.cell;
      const y = Math.max(s.top, 1) + 1.2 + Math.sin(e.t * 1.2) * 0.08;
      if (ui >= 0) k.badge(ui, s.x, y, s.z, 1.6, e.life);
      k.glow(s.x, y, s.z, 2.4, 0xffc078, e.life * 0.6);
      sparkles(k, s.x, y, s.z, 0.7, 0.6, 0.7, e.t, e.id, 0xffe066, e.life, 20, 0.1);
      k.beam(s.x, y + 5, s.z, s.x, 0.05, s.z, 0.6, 0xffe8a3, e.life * 0.3);
      e.by = y + 1.3;
    },
  },

  safe_house: {
    icon: ShieldCheck,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const r = (e.kind.radius ?? 1) + 0.6;
      const H = Math.max(1.6, s.top + 0.6);
      k.dome(s.x, 0, s.z, r * e.pop, H * e.pop, r * e.pop, 0xa66bff, e.life * 0.75, 1);
      k.card(1, "ring", s.x, 0.1, s.z, r * 2 * e.pop, r * 2 * e.pop, FLAT, 0, 0xc29cff, e.life);
      sparkles(k, s.x, H * 0.5, s.z, r * 0.8, H * 0.4, r * 0.8, e.t, e.id, 0xe5dbff, e.life, 24, 0.1);
      e.by = H + 1;
    },
  },

  blackout_district: {
    icon: Ban,
    sound: "zap",
    draw(e) {
      const { k, s } = e;
      const r = (e.kind.radius ?? 2) + 0.6;
      const H = Math.max(2.2, s.top + 0.8);
      k.dome(s.x, 0, s.z, r * e.pop, H * e.pop, r * e.pop, 0x020308, e.life * 0.7, 0);
      const p = 0.5 + 0.5 * Math.sin(e.t * 4);
      k.card(1, "ring", s.x, 0.1, s.z, r * 2 * e.pop, r * 2 * e.pop, FLAT, 0, 0xff3b30, e.life * (0.5 + 0.5 * p));
      k.card(1, "ring", s.x, 0.1, s.z, r * 2.1 * e.pop, r * 2.1 * e.pop, FLAT, 0, 0xff3b30, e.life * 0.4);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        k.spark(s.x + Math.cos(a) * r, 0.15, s.z + Math.sin(a) * r, 0.18, 0xff3b30, e.life * (Math.floor(e.t * 3 + i) % 2));
      }
      e.by = H + 1;
    },
  },

  final_countdown: {
    icon: Hourglass,
    sound: "alarm",
    draw(e) {
      const { k } = e;
      const p = 0.5 + 0.5 * Math.sin(e.t * 3);
      k.tint(0xff2a2a, (0.22 + 0.16 * p) * e.life);
      k.dim(1 - 0.15 * e.life);
      const c = viewCentre(e);
      skyDigits(e, e.left, true, c.x, 6.5, c.z, 2.2, 0xff4d4d, e.life);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + e.t * 0.1;
        const bx = c.x + Math.cos(a) * 9;
        const bz = c.z + Math.sin(a) * 9;
        k.beam(bx, 0.05, bz, bx + Math.cos(a + e.t) * 2, 12, bz + Math.sin(a + e.t) * 2, 1, 0xff3b30, e.life * 0.35);
      }
      sparkles(k, c.x, 3, c.z, 8, 2, 8, e.t, e.id, 0xff8787, e.life, 30, 0.1);
      e.bx = c.x;
      e.bz = c.z;
      e.by = 9;
    },
  },
};

/** People lining the dinosaur's route. */
function crowdAlong(e: Ev) {
  for (let i = 0; i < 10; i++) {
    along(e.s, (i + 0.5) * (e.s.len / 10), e.b, i % 2 ? 0.44 : -0.44);
    person(e.k, e.b.x, 0.07, e.b.z, e.b.yaw + (i % 2 ? Math.PI / 2 : -Math.PI / 2), PARTY[i % 8], SKINS[i % 7], CHEER, e.t, i, e.pop);
  }
}

