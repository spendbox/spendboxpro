// World-event scenes, part one: the first twenty, and emergencies and crime.
// Each draw(e) runs every frame while the event is on; see common.ts for the building blocks.

import { LightbulbOff, Ambulance, Banknote, Bird, CarFront, Cat, Clapperboard, CloudLightning, Flame, Footprints, Landmark, PartyPopper, Siren, Sparkles, Star, TrafficCone, TrainFront, Construction, Droplets, Waves, Rabbit, Beef, Orbit, Gem, ArrowUpDown, Plane, Bus, ShieldAlert, Skull } from "lucide-react";
import {
  bunting,
  CHEER,
  clamp,
  cones,
  confetti,
  convoy,
  crowd,
  DANCE,
  fire,
  fireworks,
  flashers,
  fountain,
  frac,
  h1,
  HIVIS,
  parked,
  parkSpot,
  person,
  PARTY,
  RUN,
  searchlights,
  signpost,
  SKINS,
  smoke,
  smooth,
  sparkles,
  STAND,
  TAU,
  tree,
  WALK,
  WAVE,
  waterArc,
  WORK,
  type Ev,
  type Scene,
} from "./common";
import { BALL, BOX, CYL, FACE, FIXED, FLAT, GBALL, GBOX, TORUS, UPRIGHT, type Kit, type Model } from "./kit";
import { AMBULANCE, BEACON, BOAT, CAR, CAT, COACH, COW, ELEPHANT, FIRE_ENGINE, FLOAT, GIRAFFE, HELI, LIMO, LOCO, MOTORBIKE, PARTY_BALLOON, POLICE, TRUCK, UFO, VAN, WAGON } from "./models";
import { along } from "./spots";

// ---------------------------------------------------------------- shared bits

const police = (k: Kit) => {
  k.slot[0] = 0xf8f9fa;
  k.slot[1] = 0x1c3f9e;
};
const blackCar = (k: Kit) => {
  k.slot[0] = 0x1f2329;
  k.slot[1] = 0x2b3038;
};
const CHASE: readonly Model[] = [CAR, POLICE, POLICE, POLICE];
const chaseSlots = (k: Kit, i: number) => (i === 0 ? blackCar(k) : police(k));
const AMBULANCES: readonly Model[] = [AMBULANCE, AMBULANCE];
const CIRCUS: readonly Model[] = [ELEPHANT, WAGON, FLOAT, ELEPHANT, WAGON, FLOAT];
const circusSlots = (k: Kit, i: number) => {
  k.slot[0] = [0xc92a2a, 0x1971c2, 0x7048e8][i % 3];
  k.slot[1] = [0xfcc419, 0xff6b6b, 0x69db7c][i % 3];
  k.slot[2] = [0x4dabf7, 0xfcc419, 0xf783ac][i % 3];
};
const MOTOR: readonly Model[] = [MOTORBIKE];
const motorSlots = (k: Kit) => {
  k.slot[0] = 0xf8f9fa;
  k.slot[1] = 0x1c3f9e;
};

/** A helicopter circling (x, z) at height y, its searchlight on the ground below. */
function heliOver(e: Ev, x: number, y: number, z: number, r: number, sc: number, salt: number) {
  const k = e.k;
  const a = e.t * 0.6 + salt;
  const hx = x + Math.cos(a) * r;
  const hz = z + Math.sin(a) * r;
  k.slot[0] = 0x1c3f9e;
  k.root(hx, y + Math.sin(e.t * 1.3) * 0.08, hz, -a + Math.PI, sc * e.pop, 0.12, 0.15);
  k.model(HELI, e.t);
  k.beam(hx, y, hz, x, 0.07, z, 0.45, 0xfff3c4, e.life * (0.5 + 0.2 * e.night));
  k.card(1, "glow", x, 0.09, z, 1.1, 1.1, FLAT, 0, 0xfff3c4, e.life * (0.25 + 0.35 * e.night));
}

/** A thin column of glowing red light pulsing up from a spot (alarm, emergency). */
function alarmPulse(k: Kit, x: number, y: number, z: number, t: number, a: number, hex = 0xff3b30) {
  const p = 0.5 + 0.5 * Math.sin(t * 7);
  k.glow(x, y, z, 1.2 + p * 0.6, hex, a * (0.5 + 0.4 * p));
  k.card(1, "ring", x, y - 0.02, z, 0.5 + frac(t) * 1.6, 0.5 + frac(t) * 1.6, FLAT, 0, hex, a * (1 - frac(t)));
}

/** Building half-width (a tile's tower is about 0.7 wide; big buildings fill most of 2 tiles). */
const halfW = (e: Ev) => (e.s.w > 1 ? 0.8 : 0.36);

/** Unit vector from the building towards the road in front of it (into e.v.x/z). */
function frontDir(e: Ev) {
  const dx = e.s.fx - e.s.x;
  const dz = e.s.fz - e.s.z;
  const l = Math.hypot(dx, dz);
  if (l < 0.05) {
    e.v.set(1, 0, 0);
  } else e.v.set(dx / l, 0, dz / l);
  return e.v;
}

// ---------------------------------------------------------------- the scenes

export const SCENES_A: Record<string, Scene> = {
  hospital_emergency: {
    icon: Ambulance,
    sound: "siren",
    draw(e) {
      const { k, s } = e;
      parked(e, AMBULANCE, 0, 1.1, true);
      parked(e, AMBULANCE, 1, 1.1, true);
      convoy(e, AMBULANCES, 2.2, 1.7, 0.14, 1.1, undefined, true);
      // Paramedics wheeling a stretcher in.
      const p = parkSpot(e, 0);
      const d = frontDir(e);
      const f = 0.5 + 0.5 * Math.sin(e.t * 0.5);
      const sx = p.x - d.x * (0.25 + f * 0.25);
      const sz = p.z - d.z * (0.25 + f * 0.25);
      const yaw = Math.atan2(d.z, -d.x);
      k.put(BOX, sx, 0.13, sz, 0.18 * e.pop, 0.03, 0.08 * e.pop, -Math.atan2(d.z, d.x), 0xf8f9fa);
      k.put(BOX, sx, 0.07, sz, 0.14 * e.pop, 0.1, 0.01, -Math.atan2(d.z, d.x), 0x868e96);
      for (let i = 0; i < 2; i++) person(k, sx + d.x * (i ? 0.13 : -0.13), s.ground, sz + d.z * (i ? 0.13 : -0.13), yaw, 0x2f9e44, SKINS[i + 1], WALK, e.t, i, e.pop);
      person(k, p.x + 0.2, s.ground, p.z + 0.22, 0, 0xf8f9fa, SKINS[3], WAVE, e.t, 2, e.pop);
      // A red cross pulsing over the hospital.
      k.card(0, "cross", s.x, s.top + 0.55 + Math.sin(e.t * 2) * 0.05, s.z, 0.55 * e.pop, 0.55 * e.pop, UPRIGHT, 0, 0xffffff, e.life);
      alarmPulse(k, s.x, s.top + 0.1, s.z, e.t, e.life);
      e.by = s.top + 1.5;
    },
  },

  robbery: {
    icon: Siren,
    sound: "siren",
    draw(e) {
      const { k } = e;
      convoy(e, CHASE, 0.62, 2.1, 0.14, 1.1, chaseSlots);
      // Police lights on the chasers.
      for (let i = 1; i < 4; i++) {
        const span = e.s.len + 4 * 0.62 + 1;
        const d = ((e.t * 2.1) % span) - 0.5 - i * 0.62;
        if (d < 0 || d > e.s.len) continue;
        along(e.s, d, e.b, 0.14);
        flashers(k, e.b.x, 0.38, e.b.z, e.t, i, e.life, 0.8);
      }
      heliOver(e, e.a.x || e.s.x, 3.2, e.a.z || e.s.z, 0.9, 1.3, 0);
      e.bx = e.s.x;
      e.bz = e.s.z;
    },
  },

  power_outage: {
    icon: LightbulbOff,
    sound: "zap",
    draw(e) {
      const { k, s } = e;
      const R = 2.6;
      // The block goes dark (with a few torches waving about), sparks at a broken transformer.
      k.dome(s.x, 0, s.z, R * e.pop, Math.max(2.4, s.top + 0.8) * e.pop, R * e.pop, 0x050914, 0.62 * e.life, 0);
      const px = s.x + 0.45;
      const pz = s.z + 0.45;
      k.put(CYL, px, 0.6, pz, 0.04, 1.1, 0.04, 0, 0x6b4f35);
      k.put(BOX, px, 1.05, pz, 0.36, 0.025, 0.025, 0, 0x6b4f35);
      k.put(CYL, px + 0.08, 0.95, pz, 0.09, 0.14, 0.09, 0, 0x868e96);
      const zap = frac(e.t * 0.37);
      if (zap < 0.18) {
        for (let i = 0; i < 16; i++) {
          const a = h1(e.id + Math.floor(e.t * 0.37), i) * TAU;
          const r = h1(e.id, i, 5) * 0.35 * (zap / 0.18);
          k.spark(px + 0.08 + Math.cos(a) * r, 1.0 + Math.sin(a * 2) * r, pz + Math.sin(a) * r, 0.08, 0x9fd8ff, e.life * (1 - zap / 0.18));
        }
        k.glow(px + 0.08, 1.0, pz, 2.2, 0x9fd8ff, e.life * (1 - zap / 0.18));
      }
      for (let i = 0; i < 5; i++) {
        const x = s.x + (h1(e.id, i, 1) - 0.5) * 2.4;
        const z = s.z + (h1(e.id, i, 2) - 0.5) * 2.4;
        const a = e.t * 0.8 + i * 1.7;
        person(k, x, 0.065, z, a, 0x495057, SKINS[i % 7], STAND, e.t, i, e.pop);
        k.beam(x, 0.19, z, x + Math.cos(a) * 1.2, 0.05, z - Math.sin(a) * 1.2, 0.18, 0xfff6d5, e.life * 0.55);
      }
      sparkles(k, s.x, 1.3, s.z, R * 0.8, 0.7, R * 0.8, e.t, e.id, 0xffd8a8, e.life * 0.6, 14, 0.07);
    },
  },

  building_fire: {
    icon: Flame,
    sound: "siren",
    draw(e) {
      const { k, s } = e;
      const hw = halfW(e);
      const burn = clamp(e.t / 6) * e.life;
      fire(k, s.x, s.top, s.z, 0.75, e.t, e.id, burn, 30);
      fire(k, s.x + hw * 0.6, s.top * 0.6, s.z + hw, 0.4, e.t, e.id + 1, burn, 14);
      fire(k, s.x - hw, s.top * 0.4, s.z - hw * 0.4, 0.35, e.t, e.id + 2, burn * clamp(e.t / 20), 12);
      smoke(k, s.x, s.top + 0.4, s.z, e.t, e.id, 5.5, 0.9, 0x3d4148, burn, 22);
      const d = frontDir(e);
      for (let i = 0; i < 2; i++) {
        parked(e, FIRE_ENGINE, i, 1.05, true, 0.75);
        const p = parkSpot(e, i, 0.75);
        // Water arcs onto the flames, and a ladder up to the roof.
        const tx = s.x + (i ? hw * 0.5 : -hw * 0.3);
        const tz = s.z + (i ? hw * 0.6 : -hw * 0.2);
        if (e.t > 3) waterArc(k, p.x, 0.3, p.z, tx, s.top * (i ? 0.65 : 0.95), tz, 0.6, e.t, e.id + i * 7, e.life);
        if (i === 0) k.rod(BOX, p.x, 0.25, p.z, s.x + d.x * hw, s.top * 0.85, s.z + d.z * hw, 0.03, 0xdee2e6);
        person(k, p.x - d.x * 0.15 + 0.12, s.ground, p.z - d.z * 0.15, Math.atan2(d.z, -d.x), 0xd7261e, SKINS[i * 2], WORK, e.t, i, e.pop, 0x343a40, 0xfcc419);
      }
      cones(k, s.fx, 0.065, s.fz, 0.75, 8, e.pop);
      crowd(e, 10, s.fx + d.x * 0.9, 0.065, s.fz + d.z * 0.9, 0.35, 0.35, STAND, s.x, s.z);
      e.by = s.top + 1.8;
    },
  },

  street_party: {
    icon: PartyPopper,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      crowd(e, 34, s.x, y, s.z, 0.55, 0.55, DANCE, s.x, s.z);
      // The DJ in the middle, with speakers.
      k.put(BOX, s.x, y + 0.06, s.z, 0.22 * e.pop, 0.12, 0.12 * e.pop, 0, 0x212529);
      k.put(GBOX, s.x, y + 0.125, s.z, 0.2 * e.pop, 0.01, 0.1 * e.pop, 0, PARTY[Math.floor(e.t * 4) % PARTY.length]);
      for (const o of [-0.2, 0.2]) k.put(BOX, s.x + o, y + 0.1, s.z, 0.08 * e.pop, 0.2 * e.pop, 0.08 * e.pop, 0, 0x343a40);
      person(k, s.x, y, s.z - 0.1, -Math.PI / 2, 0xffd43b, SKINS[3], DANCE, e.t, 0, e.pop);
      // Bunting between four poles.
      const c = 0.62;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const b = ((i + 1) / 4) * TAU + Math.PI / 4;
        k.put(CYL, s.x + Math.cos(a) * c, y + 0.25, s.z + Math.sin(a) * c, 0.02, 0.5 * e.pop, 0.02, 0, 0xdee2e6);
        bunting(k, s.x + Math.cos(a) * c, y + 0.5 * e.pop, s.z + Math.sin(a) * c, s.x + Math.cos(b) * c, y + 0.5 * e.pop, s.z + Math.sin(b) * c, 9, e.t);
        k.glow(s.x + Math.cos(a) * c, y + 0.5, s.z + Math.sin(a) * c, 0.6, PARTY[(i + Math.floor(e.t * 2)) % PARTY.length], e.life * (0.5 + 0.5 * e.night));
      }
      confetti(k, s.x, y, s.z, 1.4, 1.6, e.t, e.id, e.life * 0.8, 50);
      for (let i = 0; i < 4; i++) {
        const u = frac(e.t * 0.3 + i / 4);
        k.card(0, "music", s.x + Math.sin(i * 2 + e.t) * 0.4, y + 0.4 + u * 1.2, s.z + Math.cos(i * 2) * 0.4, 0.22, 0.22, FACE, 0, PARTY[i], e.life * Math.sin(u * Math.PI));
      }
      searchlights(k, s.x, y + 0.2, s.z, 3, 4, e.t, PARTY, e.life * (0.3 + 0.7 * e.night));
    },
  },

  fireworks: {
    icon: Sparkles,
    sound: "fireworks",
    draw(e) {
      const { k, s } = e;
      const top = Math.max(s.top, 1);
      const f = fireworks(k, s.x, top, s.z, top + 3.2, top + 5.5, 3, e.t, e.id, e.life, 5);
      k.flash(f * (0.05 + 0.25 * e.night));
      crowd(e, 16, s.fx, 0.065, s.fz, 0.5, 0.5, CHEER, s.x, s.z);
      e.by = top + 6.2;
    },
  },

  flash_flood: {
    icon: Waves,
    sound: "splash",
    draw(e) {
      const { k, s } = e;
      const rise = smooth(0, 25, e.t) * smooth(0, 12, e.left);
      const level = 0.03 + rise * 0.16;
      k.water(s.fx, level, s.fz, 4.6 * e.pop, 4.6 * e.pop, 0x7a6a48, 0.82 * e.life);
      // Two cars caught in it, a bit tipped, water up to the doors.
      for (let i = 0; i < 2; i++) {
        const p = parkSpot(e, i, 1.1);
        k.slot[0] = i ? 0xe5484d : 0x4dabf7;
        k.slot[1] = 0xdee2e6;
        k.root(p.x, Math.max(0.0, level - 0.08), p.z, p.yaw + 0.3 * (i ? 1 : -1), 1.05 * e.pop, 0, 0.06 * Math.sin(e.t + i));
        k.model(CAR, e.t);
        person(k, p.x, level + 0.06, p.z, e.t, 0xffd43b, SKINS[i * 3], WAVE, e.t, i, e.pop * 0.9);
      }
      // Floating junk, ripples, rain.
      for (let i = 0; i < 6; i++) {
        const x = s.fx + Math.sin(e.t * 0.2 + i * 1.7) * 1.6;
        const z = s.fz + Math.cos(e.t * 0.17 + i * 2.3) * 1.6;
        k.put(BOX, x, level + 0.01, z, 0.08, 0.03, 0.06, i + e.t * 0.3, [0x8a5a2b, 0xadb5bd, 0xe03131][i % 3]);
        const u = frac(e.t * 0.5 + i / 6);
        k.card(0, "splash", x + 0.3, level + 0.005, z, 0.2 + u * 0.4, 0.2 + u * 0.4, FLAT, 0, 0xffffff, e.life * (1 - u) * 0.6);
      }
      for (let i = 0; i < 60; i++) {
        const u = frac(e.t * 1.3 + h1(e.id, i));
        k.bit(s.fx + (h1(e.id, i, 1) - 0.5) * 4.5, 3 - u * 3, s.fz + (h1(e.id, i, 2) - 0.5) * 4.5, 0.025, 0xb8cce6, e.life * 0.6);
      }
      k.dim(1 - 0.25 * e.life);
    },
  },

  water_main: {
    icon: Droplets,
    sound: "splash",
    draw(e) {
      const { k, s } = e;
      const x = s.fx;
      const z = s.fz;
      const surge = 1 + 0.25 * Math.sin(e.t * 2.3);
      fountain(k, x, 0.07, z, 1.6 * surge * e.pop, e.t, e.id, e.life, 56, 0.22);
      k.water(x, 0.072, z, 1.5 * e.pop, 1.5 * e.pop, 0x6fb7e0, 0.7 * e.life, true);
      k.put(BOX, x, 0.07, z, 0.18 * e.pop, 0.03, 0.12 * e.pop, 0.4, 0x495057);
      cones(k, x, 0.065, z, 0.6, 7, e.pop);
      k.slot[0] = 0x1c7ed6;
      k.slot[1] = 0xf8f9fa;
      const p = parkSpot(e, 1, 1.2);
      k.root(p.x, 0.06, p.z, p.yaw, 1.05 * e.pop);
      k.model(VAN, e.t);
      k.model(BEACON, e.t);
      for (let i = 0; i < 3; i++) person(k, x + 0.5 * Math.cos(i * 2), 0.065, z + 0.5 * Math.sin(i * 2), i * 2 + Math.PI, HIVIS[i % 2], SKINS[i + 2], i ? STAND : WORK, e.t, i, e.pop, 0x1c3f6e, 0xfcc419);
      // Children dancing in the spray.
      crowd(e, 5, x + 0.35, 0.065, z - 0.3, 0.2, 0.2, CHEER, x, z, 3);
      e.by = 2.6;
    },
  },

  runaway_cows: {
    icon: Beef,
    sound: "moo",
    draw(e) {
      const { k, s } = e;
      const head = (e.t * 0.28) % (s.len + 3);
      for (let i = 0; i < 8; i++) {
        const d = head - i * 0.32 - h1(e.id, i) * 0.2;
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, (h1(e.id, i, 3) - 0.5) * 0.36);
        const g = e.pop * Math.min(1, d / 0.3, (s.len - d) / 0.3);
        k.root(e.b.x, e.b.y, e.b.z, e.b.yaw + Math.sin(e.t * 0.7 + i) * 0.35, 1.25 * g);
        k.model(COW, e.t + i * 0.3);
        if (i === 0) {
          e.bx = e.b.x;
          e.bz = e.b.z;
        }
      }
      // The farmer, running to catch up, and a car waiting, hazards on.
      const fd = head - 3;
      if (fd > 0 && fd < s.len) {
        along(s, fd, e.b, 0.05);
        person(k, e.b.x, e.b.y, e.b.z, e.b.yaw, 0x8a5a2b, SKINS[4], RUN, e.t, 0, e.pop, 0x495057, 0xd9c7a7);
      }
      const cd = Math.max(0, head - 4.2);
      along(s, Math.min(cd, s.len), e.b, 0.14);
      k.slot[0] = 0xffd43b;
      k.slot[1] = 0xe9f2fb;
      k.root(e.b.x, e.b.y, e.b.z, e.b.yaw, 1.05 * e.pop);
      k.model(CAR, e.t);
      k.glow(e.b.x, 0.12, e.b.z, 0.35, 0xffa31a, e.life * (Math.floor(e.t * 3) % 2));
      e.by = 1.2;
    },
  },

  zoo_escape: {
    icon: Rabbit,
    sound: "whistle",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      // A giraffe loping round the park, keepers with a net after it.
      const a = e.t * 0.45;
      const R = 0.55;
      const gx = s.x + Math.cos(a) * R;
      const gz = s.z + Math.sin(a) * R * 0.8;
      k.root(gx, y, gz, -a - Math.PI / 2, 1.5 * e.pop);
      k.model(GIRAFFE, e.t * 1.4);
      for (let i = 0; i < 3; i++) {
        const b = a - 0.7 - i * 0.28;
        const x = s.x + Math.cos(b) * R;
        const z = s.z + Math.sin(b) * R * 0.8;
        person(k, x, y, z, -b - Math.PI / 2, 0x8f7a4a, SKINS[i * 2], RUN, e.t, i, e.pop, 0x5c4033, 0x5c4033);
        if (i === 0) {
          k.rod(CYL, x, y + 0.18, z, x + Math.cos(b + 0.4) * 0.18, y + 0.32, z + Math.sin(b + 0.4) * 0.18, 0.01, 0x8a5a2b);
          k.put(TORUS, x + Math.cos(b + 0.4) * 0.2, y + 0.34, z + Math.sin(b + 0.4) * 0.2, 0.12, 0.12, 0.12, -b, 0xdee2e6);
        }
      }
      k.slot[0] = 0x2f9e44;
      k.slot[1] = 0xfcc419;
      const p = parkSpot(e, 0);
      k.root(p.x, 0.06, p.z, p.yaw, 1.05 * e.pop);
      k.model(VAN, e.t);
      k.model(BEACON, e.t);
      crowd(e, 8, s.fx, 0.065, s.fz, 0.3, 0.3, CHEER, gx, gz, 4);
      e.by = y + 1.6;
    },
  },

  film_shoot: {
    icon: Clapperboard,
    sound: "crowd",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      const g = e.pop;
      // Two actors, a camera on a dolly, big lights, a boom mic and the crew.
      const ax = s.x + 0.2;
      const az = s.z;
      person(k, ax, y, az - 0.08, Math.PI, 0xe03131, SKINS[2], WAVE, e.t, 0, g * 1.1);
      person(k, ax, y, az + 0.08, Math.PI, 0x1c1f26, SKINS[5], DANCE, e.t, 1, g * 1.1);
      const cx = s.x - 0.35 + Math.sin(e.t * 0.4) * 0.1;
      k.put(BOX, cx, y + 0.02, s.z, 0.2 * g, 0.03, 0.12 * g, 0, 0x495057);
      k.put(CYL, cx, y + 0.12, s.z, 0.02, 0.18 * g, 0.02, 0, 0x343a40);
      k.put(BOX, cx, y + 0.24, s.z, 0.12 * g, 0.07 * g, 0.06 * g, 0, 0x1c1f26);
      k.put(CYL, cx + 0.08, y + 0.24, s.z, 0.04, 0.05 * g, 0.04, 0, 0x343a40, 0, Math.PI / 2);
      person(k, cx - 0.1, y, s.z + 0.08, 0, 0x343a40, SKINS[1], STAND, e.t, 3, g, 0x343a40, 0x212529);
      for (const sz of [-0.38, 0.38]) {
        const lx = s.x - 0.1;
        const lz = s.z + sz;
        k.put(CYL, lx, y + 0.22, lz, 0.015, 0.44 * g, 0.015, 0, 0x343a40);
        k.put(BOX, lx, y + 0.46, lz, 0.1 * g, 0.08 * g, 0.06 * g, 0, 0x212529);
        k.beam(lx, y + 0.46, lz, ax, y + 0.1, az, 0.22, 0xfff6e0, e.life * 0.5);
        k.glow(lx, y + 0.46, lz, 0.4, 0xfff6e0, e.life);
      }
      k.rod(CYL, s.x - 0.15, y + 0.3, s.z - 0.2, ax, y + 0.36, az, 0.008, 0x868e96);
      k.put(CYL, ax, y + 0.36, az, 0.04, 0.08, 0.04, 0, 0x343a40, 0, Math.PI / 2);
      // The clapperboard snaps every few seconds.
      const c = frac(e.t / 5);
      if (c < 0.3) k.card(0, "clap", ax - 0.2, y + 0.45, az, 0.3, 0.3, FACE, 0, 0xffffff, e.life * (1 - c / 0.3));
      crowd(e, 10, s.x - 0.1, y, s.z, 0.7, 0.7, STAND, ax, az, 7);
      e.by = y + 1.4;
    },
  },

  ufo: {
    icon: Orbit,
    sound: "hum",
    draw(e) {
      const { k, s } = e;
      const y = Math.max(s.top, 1) + 3.2 + Math.sin(e.t * 1.1) * 0.2;
      const arrive = clamp(e.t / 3);
      const leave = clamp(e.left / 3);
      const ux = s.x + (1 - arrive) * 8 - (1 - leave) * 8;
      const uy = y + (1 - arrive) * 6 + (1 - leave) * 6;
      k.root(ux, uy, s.z, e.t * 1.6, 1.1, Math.sin(e.t * 0.9) * 0.08, Math.cos(e.t * 0.7) * 0.08);
      k.model(UFO, e.t);
      const beamOn = arrive * leave * (0.6 + 0.4 * Math.sin(e.t * 3));
      k.beam(ux, uy - 0.15, s.z, ux, s.ground, s.z, 0.85, 0x7ff0d8, beamOn * 0.75);
      k.card(1, "glow", ux, s.ground + 0.02, s.z, 2.2, 2.2, FLAT, 0, 0x7ff0d8, beamOn * 0.7);
      k.card(1, "ring", ux, s.ground + 0.03, s.z, 1.6 + Math.sin(e.t * 4) * 0.2, 1.6 + Math.sin(e.t * 4) * 0.2, FLAT, e.t, 0x7ff0d8, beamOn);
      k.glow(ux, uy, s.z, 3.5, 0x7ff0d8, e.life * (0.3 + 0.4 * e.night));
      // A cow floats up the beam (over and over: it's a big ship).
      const u = frac(e.t / 7);
      const cy = s.ground + (uy - 0.3 - s.ground) * smooth(0.05, 0.95, u);
      if (u < 0.95) {
        k.root(ux, cy, s.z, e.t * 0.8, 1.6 * beamOn, Math.sin(e.t * 2) * 0.4, Math.cos(e.t * 1.7) * 0.4);
        k.model(COW, e.t * 3);
      }
      sparkles(k, ux, (uy + s.ground) / 2, s.z, 0.5, (uy - s.ground) / 2, 0.5, e.t, e.id, 0xc3fae8, beamOn, 30, 0.08);
      crowd(e, 10, s.fx, 0.065, s.fz, 0.4, 0.4, CHEER, ux, s.z);
      e.bx = ux;
      e.by = uy + 1.3;
    },
  },

  circus_parade: {
    icon: Star,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      convoy(e, CIRCUS, 0.85, 0.42, 0, 1.15, circusSlots);
      // Clowns walking alongside, juggling.
      const span = s.len + CIRCUS.length * 0.85 + 1;
      const head = ((e.t * 0.42) % span) - 0.5;
      for (let i = 0; i < 8; i++) {
        const d = head - 0.4 - i * 0.55;
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, i % 2 ? 0.3 : -0.3);
        person(k, e.b.x, e.b.y, e.b.z, e.b.yaw, PARTY[i % PARTY.length], SKINS[i % 7], i % 3 ? WALK : DANCE, e.t, i, e.pop, PARTY[(i + 3) % PARTY.length], PARTY[(i + 5) % PARTY.length]);
        for (let j = 0; j < 3; j++) {
          const a = e.t * 5 + j * 2.1;
          k.put(BALL, e.b.x + Math.cos(a) * 0.05, e.b.y + 0.3 + Math.abs(Math.sin(a)) * 0.12, e.b.z, 0.025, 0.025, 0.025, 0, PARTY[j]);
        }
      }
      if (head > 0) {
        along(s, clamp(head, 0, s.len), e.b, 0);
        e.bx = e.b.x;
        e.bz = e.b.z;
        k.slot[0] = 0xff4d6d;
        for (let j = 0; j < 4; j++) {
          k.slot[0] = PARTY[j];
          k.root(e.b.x + Math.cos(j * 1.6) * 0.12, e.b.y + 0.35, e.b.z + Math.sin(j * 1.6) * 0.12, 0, 1.1 * e.pop, Math.sin(e.t + j) * 0.15);
          k.model(PARTY_BALLOON, e.t);
        }
      }
      confetti(k, e.bx, 0.06, e.bz, 1.6, 1.4, e.t, e.id, e.life * 0.6, 30);
      e.by = 1.6;
    },
  },

  marathon: {
    icon: Footprints,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const L = s.len;
      for (let i = 0; i < 36; i++) {
        const sp = 0.55 + h1(e.id, i) * 0.25;
        const d = (e.t * sp + i * 0.37) % (L + 1) - 0.5;
        if (d < 0 || d > L) continue;
        along(s, d, e.b, (h1(e.id, i, 2) - 0.5) * 0.4);
        const g = e.pop * Math.min(1, d / 0.3, (L - d) / 0.3);
        person(k, e.b.x, e.b.y, e.b.z, e.b.yaw, PARTY[i % PARTY.length], SKINS[i % 7], RUN, e.t, i, g, 0x212529);
      }
      // The lead motorbike and the finish arch.
      convoy(e, MOTOR, 1, 0.85, 0.05, 1.1, motorSlots);
      along(s, L * 0.5, e.b, 0);
      const ca = Math.cos(e.b.yaw);
      const sa = Math.sin(e.b.yaw);
      for (const side of [-1, 1]) {
        const px = e.b.x + sa * 0.42 * side;
        const pz = e.b.z + ca * 0.42 * side;
        k.put(CYL, px, 0.36, pz, 0.04, 0.6 * e.pop, 0.04, 0, 0xe03131);
        for (let j = 0; j < 3; j++) {
          k.slot[0] = PARTY[(j + (side > 0 ? 3 : 0)) % PARTY.length];
          k.root(px + (j - 1) * 0.06, 0.4, pz, 0, 0.9 * e.pop, (j - 1) * 0.2);
          k.model(PARTY_BALLOON, e.t);
        }
        crowd(e, 7, e.b.x + sa * 0.75 * side - ca * 0.4, 0.065, e.b.z + ca * 0.75 * side + sa * 0.4, 0.12, 0.12, CHEER, e.b.x, e.b.z, side > 0 ? 3 : 4);
      }
      k.put(BOX, e.b.x, 0.68 * e.pop, e.b.z, 0.06, 0.12, 0.88 * e.pop, e.b.yaw, 0xffffff);
      k.put(BOX, e.b.x, 0.68 * e.pop, e.b.z, 0.065, 0.04, 0.84 * e.pop, e.b.yaw, 0x2f9e44);
      e.bx = e.b.x;
      e.bz = e.b.z;
      e.by = 1.6;
    },
  },

  train_breakdown: {
    icon: TrainFront,
    sound: "engine",
    draw(e) {
      const { k, s } = e;
      const y = s.hy > 0.5 ? s.hy : s.ground;
      const yaw = s.axis === 1 ? -Math.PI / 2 : 0;
      const ax = s.axis === 1 ? 0 : 1;
      const az = s.axis === 1 ? 1 : 0;
      // The broken-down train on the platform, smoking, hazards blinking.
      k.slot[0] = 0x1c7ed6;
      k.slot[1] = 0xfcc419;
      for (let i = 0; i < 3; i++) {
        k.root(s.x - ax * i * 0.64, y, s.z - az * i * 0.64, yaw, e.pop);
        k.model(i === 0 ? LOCO : COACH, e.t);
      }
      smoke(k, s.x + ax * 0.1, y + 0.3, s.z + az * 0.1, e.t, e.id, 2.4, 0.4, 0x495057, e.life, 14);
      k.glow(s.x + ax * 0.31, y + 0.12, s.z + az * 0.31, 0.4, 0xffa31a, e.life * (Math.floor(e.t * 3) % 2));
      // The rescue engine rolls in over the first half minute and couples up.
      const come = smooth(0, 30, e.t);
      const rd = 4.5 - come * 3.8;
      k.slot[0] = 0xfcc419;
      k.slot[1] = 0x212529;
      k.root(s.x + ax * (0.32 + rd), y, s.z + az * (0.32 + rd), yaw + Math.PI, e.pop);
      k.model(LOCO, e.t);
      k.model(BEACON, e.t);
      for (let i = 0; i < 3; i++) person(k, s.x - ax * 0.2 + az * 0.22, y, s.z - az * 0.2 + ax * 0.22 + i * 0.08 * ax, i, i ? 0xff922b : 0xfcc419, SKINS[i], i ? STAND : WORK, e.t, i, e.pop * 0.9, 0x1c3f6e, 0xffffff);
      crowd(e, 10, s.x - ax * 0.6 - az * 0.3, y, s.z - az * 0.6 - ax * 0.3, 0.3 * (ax + 0.3), 0.3 * (az + 0.3), STAND, s.x, s.z);
      e.by = y + 1.2;
    },
  },

  rig_flare: {
    icon: Flame,
    sound: "roar",
    draw(e) {
      const { k, s } = e;
      const surge = 1 + 0.3 * Math.sin(e.t * 1.7) + 0.2 * Math.sin(e.t * 5.3);
      fire(k, s.hx, s.hy, s.hz, 1.3 * surge * e.pop, e.t, e.id, e.life, 40);
      k.glow(s.hx, s.hy + 0.6, s.hz, 6 * surge, 0xff7a1a, e.life * (0.35 + 0.35 * e.night));
      smoke(k, s.hx, s.hy + 1.4, s.hz, e.t, e.id, 6, 1.1, 0x2b2d31, e.life, 22, 0.35, 0.15);
      // Fire boats circling and spraying.
      for (let i = 0; i < 2; i++) {
        const a = e.t * 0.25 + i * Math.PI;
        const bx = s.x + Math.cos(a) * 1.5;
        const bz = s.z + Math.sin(a) * 1.5;
        k.slot[0] = 0xd7261e;
        k.root(bx, Math.max(0.0, s.waterY - 0.02) + Math.sin(e.t * 2 + i) * 0.01, bz, -a - Math.PI / 2, 1.4 * e.pop);
        k.model(BOAT, e.t);
        waterArc(k, bx, 0.25, bz, s.hx, s.hy * 0.8, s.hz, 0.9, e.t, e.id + i, e.life);
        flashers(k, bx, 0.35, bz, e.t, i, e.life, 0.6);
      }
      e.bx = s.hx;
      e.bz = s.hz;
      e.by = s.hy + 2.6;
    },
  },

  lightning_strike: {
    icon: CloudLightning,
    sound: "thunder",
    draw(e) {
      const { k, s } = e;
      const period = 4.2;
      const c = Math.floor(e.t / period);
      const u = e.t - c * period;
      const f = u < 0.07 ? 1 : u < 0.13 ? 0.15 : u < 0.22 ? 0.8 : u < 0.3 ? 0.1 : u < 0.4 ? 0.5 * (1 - (u - 0.3) / 0.1) : 0;
      const a = e.life * f;
      if (a > 0.02) {
        k.bolt(s.x, s.top, s.z, 9, e.id * 31 + c, a);
        k.flash(a * 0.8);
        k.glow(s.x, s.top, s.z, 3, 0xd0dcff, a);
      }
      // Sparks fly off the top after each strike, and it smoulders.
      if (u < 1.2) {
        for (let i = 0; i < 20; i++) {
          const ang = h1(c, i) * TAU;
          const v = 0.6 + h1(c, i, 2);
          k.spark(s.x + Math.cos(ang) * v * u, s.top + v * u * 0.8 - u * u * 1.5, s.z + Math.sin(ang) * v * u, 0.07, 0xfff3bf, e.life * (1 - u / 1.2));
        }
      }
      if (e.t > period) {
        fire(k, s.x, s.top, s.z, 0.3, e.t, e.id, e.life * 0.8, 10);
        smoke(k, s.x, s.top + 0.2, s.z, e.t, e.id, 3, 0.4, 0x495057, e.life * 0.8, 10);
      }
      // A heavy, dark cloud right over it.
      for (let i = 0; i < 14; i++) {
        k.puff(s.x + (h1(e.id, i) - 0.5) * 4, s.top + 7.5 + h1(e.id, i, 2) * 1.2, s.z + (h1(e.id, i, 3) - 0.5) * 4, 2.6, 0x3b4252, e.life * 0.8);
      }
      k.dim(1 - 0.3 * e.life);
      e.by = s.top + 1.4;
    },
  },

  bird_swarm: {
    icon: Bird,
    sound: "wind",
    draw(e) {
      const { k, s } = e;
      const cy = Math.max(s.top, 1) + 3;
      // A murmuration: a cloud of birds folding and stretching as it turns.
      const n = 240;
      for (let i = 0; i < n; i++) {
        const a = h1(e.id, i);
        const b = h1(e.id, i, 1);
        const c = h1(e.id, i, 2);
        const ph = a * TAU;
        const r = 1.2 + 0.9 * Math.sin(e.t * 0.31 + b * 3);
        const x = s.x + Math.sin(e.t * 0.37 + ph) * r * 1.6 + Math.sin(e.t * 0.13) * 1.5;
        const y = cy + Math.sin(e.t * 0.53 + b * TAU) * 0.8 * (0.5 + c) + Math.cos(e.t * 0.21 + ph) * 0.4;
        const z = s.z + Math.cos(e.t * 0.29 + ph * 1.3) * r + Math.cos(e.t * 0.11) * 1.2;
        const flap = 0.5 + 0.5 * Math.sin(e.t * 14 + i);
        k.card(0, "bird", x, y, z, 0.13, 0.06 + flap * 0.07, FACE, 0, 0x212529, e.life * clamp(e.t * 0.5 - c));
      }
      e.by = cy + 1.8;
    },
  },

  money_spill: {
    icon: Banknote,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const x = s.fx;
      const z = s.fz;
      const yaw = s.fyaw + 0.35;
      k.slot[0] = 0x495057;
      k.slot[1] = 0x5c7a5a;
      k.root(x, 0.06, z, yaw, 1.15 * e.pop, 0, 0.05);
      k.model(TRUCK, e.t);
      k.glow(x, 0.15, z, 0.5, 0xffa31a, e.life * (Math.floor(e.t * 3) % 2));
      // Notes flutter about and lie all over the road; a glowing pile to grab.
      for (let i = 0; i < 40; i++) {
        const u = frac(e.t * (0.12 + h1(e.id, i) * 0.1) + h1(e.id, i, 1));
        const ang = h1(e.id, i, 2) * TAU;
        const r = 0.2 + h1(e.id, i, 3) * 0.9;
        const nx = x + Math.cos(ang) * r + Math.sin(e.t * 2 + i) * 0.05;
        const nz = z + Math.sin(ang) * r;
        k.bit(nx, 0.08 + Math.sin(u * Math.PI) * (0.4 + h1(e.id, i, 4) * 0.8), nz, 0.05, 0x5fbf63, e.life);
        if (i < 22) k.card(0, "note", x + Math.cos(i * 2.4) * (0.15 + (i % 7) * 0.12), 0.075, z + Math.sin(i * 2.4) * (0.15 + (i % 7) * 0.12), 0.14, 0.14, FLAT, i * 1.3, 0xffffff, e.life);
      }
      const px = x - Math.cos(yaw) * 0.42;
      const pz = z + Math.sin(yaw) * 0.42;
      for (let i = 0; i < 6; i++) k.put(BOX, px + (i % 3) * 0.05 - 0.05, 0.08 + Math.floor(i / 3) * 0.03, pz + (i % 2) * 0.04, 0.09 * e.pop, 0.028, 0.05 * e.pop, i, 0x3f9b4f);
      if (e.claimable) {
        k.glow(px, 0.18, pz, 0.9 + Math.sin(e.t * 5) * 0.2, 0x8cff8c, e.life * 0.9);
        sparkles(k, px, 0.25, pz, 0.25, 0.15, 0.25, e.t, e.id, 0xd3f9d8, e.life, 14, 0.1);
        k.card(1, "ring", px, 0.09, pz, 0.6 + frac(e.t) * 0.6, 0.6 + frac(e.t) * 0.6, FLAT, 0, 0x8cff8c, e.life * (1 - frac(e.t)));
        k.hit(e.id, px, 0.15, pz, 0.35);
      }
      crowd(e, 9, x, 0.065, z, 1.0, 1.0, WORK, px, pz, 2);
      e.bx = px;
      e.bz = pz;
      e.by = 1.1;
    },
  },

  celebrity_visit: {
    icon: Star,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const d = frontDir(e);
      parkCars(e);
      // The red carpet from the kerb to the door, fans behind ropes, cameras flashing.
      const p = parkSpot(e, 0);
      const mx = (p.x + s.x + d.x * halfW(e)) / 2;
      const mz = (p.z + s.z + d.z * halfW(e)) / 2;
      const len = Math.hypot(p.x - s.x - d.x * halfW(e), p.z - s.z - d.z * halfW(e)) + 0.2;
      const yaw = -Math.atan2(d.z, d.x);
      k.put(BOX, mx, 0.085, mz, len * e.pop, 0.01, 0.18, yaw, 0xc92a2a);
      const walk = frac(e.t / 9);
      person(k, p.x + (s.x - p.x) * walk * 0.7, 0.09, p.z + (s.z - p.z) * walk * 0.7, Math.atan2(d.z, -d.x), 0xf8f9fa, SKINS[3], WAVE, e.t, 0, e.pop * 1.15, 0x111111);
      for (const side of [-1, 1]) {
        const ox = -d.z * 0.22 * side;
        const oz = d.x * 0.22 * side;
        k.put(BOX, mx + ox, 0.14, mz + oz, len * e.pop, 0.01, 0.01, yaw, 0xfcc419);
        crowd(e, 9, mx + ox * 1.6, 0.09, mz + oz * 1.6, 0.25, 0.25, CHEER, mx, mz, side > 0 ? 1 : 2);
        for (let i = 0; i < 3; i++) {
          const f = frac(e.t * 1.7 + h1(e.id, i + (side > 0 ? 9 : 0)));
          if (f < 0.12) k.glow(mx + ox * 1.7 + (i - 1) * 0.15, 0.25, mz + oz * 1.7, 0.5, 0xffffff, e.life * (1 - f / 0.12));
        }
      }
      searchlights(k, s.x + d.x * 0.6, 0.1, s.z + d.z * 0.6, 4, 7, e.t, [0xfff3bf, 0xffffff], e.life * (0.25 + 0.75 * e.night), 0.5, 0.5);
      sparkles(k, mx, 0.4, mz, 0.4, 0.2, 0.4, e.t, e.id, 0xffe066, e.life, 12, 0.08);
    },
  },

  // ---------------------------------------------------------------- emergencies and crime
  bank_alarm: {
    icon: Landmark,
    sound: "alarm",
    draw(e) {
      const { k, s } = e;
      const hw = halfW(e) + 0.25;
      // Police cars at the corners, tape round the building, an alarm light spinning on top.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const x = s.x + Math.cos(a) * hw * 1.35;
        const z = s.z + Math.sin(a) * hw * 1.35;
        police(k);
        const g = e.pop * clamp((e.t - i * 0.6) / 1.5);
        k.root(x, 0.07, z, -a + Math.PI / 2, 1.1 * g);
        k.model(POLICE, e.t);
        flashers(k, x, 0.35, z, e.t, i, e.life * g);
        person(k, x + Math.cos(a) * 0.2, 0.07, z + Math.sin(a) * 0.2, -a + Math.PI, 0x1c3f9e, SKINS[i], STAND, e.t, i, g, 0x1c1f26, 0x1c1f26);
      }
      for (let i = 0; i < 4; i++) {
        const a0 = (i / 4) * TAU + Math.PI / 4;
        const a1 = a0 + TAU / 4;
        const R = hw * 1.15;
        k.rod(BOX, s.x + Math.cos(a0) * R, 0.15, s.z + Math.sin(a0) * R, s.x + Math.cos(a1) * R, 0.15, s.z + Math.sin(a1) * R, 0.012, 0xffd43b);
      }
      const spin = e.t * 6;
      k.put(GBALL, s.x, s.top + 0.08, s.z, 0.12, 0.12, 0.12, 0, 0xff2a2a);
      k.beam(s.x, s.top + 0.08, s.z, s.x + Math.cos(spin) * 2.2, s.top - 0.2, s.z + Math.sin(spin) * 2.2, 0.35, 0xff2a2a, e.life * 0.6);
      k.beam(s.x, s.top + 0.08, s.z, s.x - Math.cos(spin) * 2.2, s.top - 0.2, s.z - Math.sin(spin) * 2.2, 0.35, 0xff2a2a, e.life * 0.6);
      alarmPulse(k, s.x, s.top + 0.1, s.z, e.t, e.life);
      heliOver(e, s.x, s.top + 2.2, s.z, 1.3, 1.3, 1);
      e.by = s.top + 3.4;
    },
  },

  car_chase: {
    icon: CarFront,
    sound: "siren",
    draw(e) {
      const { k, s } = e;
      convoy(e, CHASE, 0.55, 3.1, 0.14, 1.1, chaseSlots);
      for (let i = 1; i < 4; i++) {
        const span = s.len + 4 * 0.55 + 1;
        const d = ((e.t * 3.1) % span) - 0.5 - i * 0.55;
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, 0.14);
        flashers(k, e.b.x, 0.38, e.b.z, e.t, i, e.life, 0.85);
        k.puff(e.b.x - Math.cos(e.b.yaw) * 0.25, 0.1, e.b.z + Math.sin(e.b.yaw) * 0.25, 0.3, 0xced4da, e.life * 0.4);
      }
      heliOver(e, e.a.x || s.x, 3, e.a.z || s.z, 0.6, 1.3, 2);
    },
  },

  jewel_heist: {
    icon: Gem,
    sound: "alarm",
    draw(e) {
      const { k, s } = e;
      const hw = halfW(e);
      const d = frontDir(e);
      // Two thieves abseiling down the front of the tower, lit by searchlights from below.
      for (let i = 0; i < 2; i++) {
        const side = i ? 0.15 : -0.15;
        const fx = s.x + d.x * (hw + 0.04) - d.z * side;
        const fz = s.z + d.z * (hw + 0.04) + d.x * side;
        const u = 0.5 + 0.5 * Math.sin(e.t * 0.25 + i * 1.5);
        const ty = 0.25 + (s.top - 0.4) * u;
        k.rod(CYL, fx, s.top + 0.05, fz, fx, ty + 0.2, fz, 0.008, 0xf1f3f5);
        person(k, fx + d.x * 0.03, ty, fz + d.z * 0.03, Math.atan2(d.z, -d.x) + Math.PI, 0x15161a, SKINS[0], WORK, e.t, i, e.pop, 0x15161a, 0x15161a);
        k.beam(fx + d.x * 1.6, 0.08, fz + d.z * 1.6, fx, ty + 0.1, fz, 0.35, 0xfff6d5, e.life * 0.55);
        for (let j = 0; j < 3; j++) {
          const f = frac(e.t * 0.6 + j / 3 + i * 0.5);
          k.spark(fx + d.x * 0.08, ty - f * ty, fz + d.z * 0.08, 0.07, 0x99e9f2, e.life * (1 - f));
        }
      }
      police(k);
      parked(e, POLICE, 0, 1.1, true);
      parked(e, POLICE, 1, 1.1, true);
      alarmPulse(k, s.x, s.top + 0.1, s.z, e.t, e.life, 0x66d9e8);
      e.by = s.top + 1.4;
    },
  },

  gas_leak: {
    icon: ShieldAlert,
    sound: "alarm",
    draw(e) {
      const { k, s } = e;
      const x = s.fx;
      const z = s.fz;
      // A yellow-green cloud, cones and tape, gas engineers, people walking away.
      for (let i = 0; i < 26; i++) {
        const a = h1(e.id, i) * TAU + e.t * 0.05;
        const r = h1(e.id, i, 1) * 1.1 * (0.5 + 0.5 * smooth(0, 15, e.t));
        k.puff(x + Math.cos(a) * r, 0.1 + h1(e.id, i, 2) * 0.5 + Math.sin(e.t * 0.5 + i) * 0.05, z + Math.sin(a) * r, 0.6 + h1(e.id, i, 3) * 0.6, 0xc5e06a, e.life * 0.32);
      }
      cones(k, x, 0.065, z, 0.9, 10, e.pop);
      for (let i = 0; i < 4; i++) {
        const a0 = (i / 4) * TAU;
        const a1 = a0 + TAU / 4;
        k.rod(BOX, x + Math.cos(a0) * 1.0, 0.12, z + Math.sin(a0) * 1.0, x + Math.cos(a1) * 1.0, 0.12, z + Math.sin(a1) * 1.0, 0.01, 0xffd43b);
      }
      signpost(k, "hazard", x + 0.6, 0.065, z - 0.6, 0.3, e.life);
      k.slot[0] = 0xfcc419;
      k.slot[1] = 0x1c3f6e;
      const p = parkSpot(e, 1, 1.3);
      k.root(p.x, 0.06, p.z, p.yaw, 1.05 * e.pop);
      k.model(VAN, e.t);
      k.model(BEACON, e.t);
      for (let i = 0; i < 2; i++) person(k, x + (i ? 0.2 : -0.15), 0.065, z + 0.1, i * 2, 0xfcc419, SKINS[i], WORK, e.t, i, e.pop, 0xfcc419, 0xffffff);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        const u = frac(e.t * 0.08 + i / 6);
        person(k, x + Math.cos(a) * (1.1 + u * 1.2), 0.065, z + Math.sin(a) * (1.1 + u * 1.2), -a, SHIRT_LIST[i], SKINS[i], WALK, e.t, i, e.pop * clamp(4 * (1 - u)));
      }
      e.bx = x;
      e.bz = z;
      e.by = 1.4;
    },
  },

  scaffold_collapse: {
    icon: Construction,
    sound: "boom",
    draw(e) {
      const { k, s } = e;
      const d = frontDir(e);
      const hw = halfW(e);
      const bx = s.x + d.x * (hw + 0.12);
      const bz = s.z + d.z * (hw + 0.12);
      const yaw = -Math.atan2(d.z, d.x) + Math.PI / 2;
      // Half the scaffold still up, the rest in a heap; dust everywhere at first.
      const ca = Math.cos(yaw);
      const sa = -Math.sin(yaw);
      for (let i = 0; i < 4; i++) {
        const o = (i - 1.5) * 0.2;
        const px = bx + ca * o;
        const pz = bz + sa * o;
        if (i < 2) {
          k.put(BOX, px, 0.5, pz, 0.015, 0.9, 0.015, 0, 0x868e96);
          for (let j = 1; j < 4; j++) k.put(BOX, px + ca * 0.1, j * 0.25, pz + sa * 0.1, 0.2, 0.012, 0.012, yaw, 0x868e96);
          k.put(BOX, px + ca * 0.1, 0.5, pz + sa * 0.1, 0.2, 0.012, 0.12, yaw, 0xc9a76f);
        } else {
          const tilt = 1.3 + h1(e.id, i) * 0.25;
          k.put(BOX, px + d.x * 0.35, 0.05, pz + d.z * 0.35, 0.015, 0.9, 0.015, yaw, 0x868e96, tilt, 0.2 * i);
          k.put(BOX, px + d.x * 0.5, 0.04, pz + d.z * 0.5, 0.2, 0.02, 0.12, yaw + i, 0xc9a76f, 0.1);
        }
      }
      const dust = clamp(1 - e.t / 40);
      smoke(k, bx + d.x * 0.4, 0.05, bz + d.z * 0.4, e.t, e.id, 1.6, 1.0, 0xc9b79c, e.life * dust, 20, 0.15, 0.1);
      for (let i = 0; i < 4; i++) person(k, bx + d.x * (0.9 + (i % 2) * 0.2) + ca * (i - 1.5) * 0.25, s.ground, bz + d.z * (0.9 + (i % 2) * 0.2) + sa * (i - 1.5) * 0.25, Math.atan2(d.z, -d.x), HIVIS[i % 2], SKINS[i], i === 1 ? WAVE : STAND, e.t, i, e.pop, 0x1c3f6e, 0xfcc419);
      cones(k, bx + d.x * 0.45, s.ground, bz + d.z * 0.45, 0.65, 8, e.pop);
      parked(e, AMBULANCE, 1, 1.05, true);
      e.by = s.top + 1.3;
    },
  },

  cat_rescue: {
    icon: Cat,
    sound: "siren",
    draw(e) {
      const { k, s } = e;
      const tx = s.x - 0.15;
      const tz = s.z - 0.1;
      const h = 1.1;
      tree(k, tx, s.ground, tz, h * e.pop, 0x3f8f4f);
      k.root(tx + 0.12, s.ground + h * 0.95 * e.pop, tz, Math.sin(e.t) * 0.5, 1.4 * e.pop);
      k.model(CAT, e.t);
      parked(e, FIRE_ENGINE, 0, 1.05, true);
      const p = parkSpot(e, 0);
      const topX = tx + 0.08;
      const topY = s.ground + h * 0.85;
      k.rod(BOX, p.x, 0.25, p.z, topX, topY, tz, 0.03, 0xdee2e6);
      const u = 0.5 + 0.5 * Math.sin(e.t * 0.3);
      const fx = p.x + (topX - p.x) * u;
      const fy = 0.25 + (topY - 0.25) * u;
      const fz = p.z + (tz - p.z) * u;
      person(k, fx, fy - 0.08, fz, Math.atan2(-(tz - p.z), topX - p.x), 0xd7261e, SKINS[2], WORK, e.t, 0, e.pop, 0x343a40, 0xfcc419);
      crowd(e, 10, s.x + 0.3, s.ground, s.z + 0.3, 0.3, 0.3, CHEER, tx, tz);
      e.by = s.ground + h + 1;
    },
  },

  stuck_lift: {
    icon: ArrowUpDown,
    sound: "alarm",
    draw(e) {
      const { k, s } = e;
      const d = frontDir(e);
      const hw = halfW(e) + 0.02;
      const x = s.x + d.x * hw;
      const z = s.z + d.z * hw;
      const yaw = -Math.atan2(d.z, d.x);
      // The glass lift shaft on the front, the car stuck half way, lights flickering.
      const flick = Math.sin(e.t * 23) > 0.2 || Math.sin(e.t * 3.7) > 0.6 ? 1 : 0.25;
      k.put(GBOX, x, s.top / 2, z, 0.02, s.top, 0.12, yaw, 0x3b5068);
      const ly = s.top * 0.55 + Math.sin(e.t * 9) * 0.01 * (Math.sin(e.t) > 0.8 ? 1 : 0);
      k.put(GBOX, x + d.x * 0.02, ly, z + d.z * 0.02, 0.03, 0.14, 0.12, yaw, flick > 0.5 ? 0xfff3bf : 0x6b5a2a);
      k.glow(x + d.x * 0.05, ly, z + d.z * 0.05, 0.6, 0xfff3bf, e.life * flick);
      k.glow(x + d.x * 0.05, ly + 0.12, z + d.z * 0.05, 0.25, 0xff3b30, e.life * (Math.floor(e.t * 2) % 2));
      k.slot[0] = 0xf8f9fa;
      k.slot[1] = 0xf08c00;
      const p = parkSpot(e, 0);
      k.root(p.x, 0.06, p.z, p.yaw, 1.05 * e.pop);
      k.model(VAN, e.t);
      k.model(BEACON, e.t);
      for (let i = 0; i < 2; i++) person(k, p.x - d.x * 0.25 + i * 0.12, s.ground, p.z - d.z * 0.25, Math.atan2(d.z, -d.x), 0xf08c00, SKINS[i * 3], WORK, e.t, i, e.pop, 0x1c3f6e, 0xffffff);
      crowd(e, 6, x + d.x * 0.35, s.ground, z + d.z * 0.35, 0.2, 0.2, STAND, x, z);
      e.by = s.top + 1.3;
    },
  },

  bridge_inspection: {
    icon: TrafficCone,
    sound: "engine",
    draw(e) {
      const { k, s } = e;
      const along0 = s.axis === 0 ? 1 : 0;
      const ax = s.kind === "bridge" ? (along0 ? 0 : 1) : s.axis === 0 ? 1 : 0;
      const az = 1 - ax;
      // Barriers at both ends, CLOSED signs, an inspection truck with its basket under the deck.
      for (const side of [-1, 1]) {
        const bx = s.x + ax * 0.7 * side;
        const bz = s.z + az * 0.7 * side;
        const yaw = ax ? Math.PI / 2 : 0;
        k.put(BOX, bx, 0.18, bz, 0.04, 0.06, 0.7, yaw, 0xffffff);
        k.card(0, "stripes", bx + ax * 0.025 * side, 0.18, bz + az * 0.025 * side, 0.7, 0.06, FIXED, yaw + Math.PI / 2, 0xffffff, e.life);
        for (const o of [-0.3, 0.3]) k.put(BOX, bx + az * o, 0.1, bz + ax * o, 0.03, 0.16, 0.03, 0, 0x343a40);
        signpost(k, "closed", bx + az * 0.42, 0.065, bz + ax * 0.42, 0.22, e.life);
        k.glow(bx, 0.3, bz, 0.4, 0xffa31a, e.life * (Math.floor(e.t * 2.5 + (side > 0 ? 1 : 0)) % 2));
        cones(k, bx + ax * 0.3 * side, 0.065, bz + az * 0.3 * side, 0.25, 5, e.pop);
      }
      k.slot[0] = 0xf8f9fa;
      k.slot[1] = 0xf08c00;
      k.root(s.x, 0.24, s.z, ax ? -Math.PI / 2 : 0, 1.1 * e.pop);
      k.model(TRUCK, e.t);
      k.model(BEACON, e.t);
      const sway = Math.sin(e.t * 0.4) * 0.15;
      const ox = az * 0.55;
      const oz = ax * 0.55;
      k.rod(BOX, s.x, 0.45, s.z, s.x + ox, 0.55, s.z + oz, 0.03, 0xf08c00);
      k.rod(BOX, s.x + ox, 0.55, s.z + oz, s.x + ox + ax * sway, -0.05, s.z + oz + az * sway, 0.025, 0xf08c00);
      k.put(BOX, s.x + ox + ax * sway, -0.08, s.z + oz + az * sway, 0.16, 0.08, 0.12, 0, 0xfcc419);
      person(k, s.x + ox + ax * sway, -0.12, s.z + oz + az * sway, 0, 0xff922b, SKINS[3], WORK, e.t, 0, e.pop, 0x1c3f6e, 0xffffff);
      e.by = 1.4;
    },
  },

  tyre_pileup: {
    icon: TrafficCone,
    sound: "horn",
    draw(e) {
      const { k, s } = e;
      // Four cars crunched together at odd angles, hazards blinking, a tow truck on its way.
      for (let i = 0; i < 4; i++) {
        along(s, s.len * 0.5 + (i - 1.5) * 0.36, e.b, (i % 2 ? 0.12 : -0.1));
        k.slot[0] = [0xe5484d, 0x4dabf7, 0xf8f9fa, 0xfab005][i];
        k.slot[1] = 0xe9f2fb;
        const yaw = e.b.yaw + (h1(e.id, i) - 0.5) * 1.4;
        k.root(e.b.x, e.b.y, e.b.z, yaw, 1.05 * e.pop, 0, i === 1 ? 0.12 : 0);
        k.model(CAR, 0);
        const on = Math.floor(e.t * 2.5) % 2;
        k.glow(e.b.x, 0.12, e.b.z, 0.35, 0xffa31a, e.life * on);
        if (i === 1) smoke(k, e.b.x, 0.15, e.b.z, e.t, e.id, 1.4, 0.3, 0xdee2e6, e.life, 10);
        if (i === 2) person(k, e.b.x + 0.15, e.b.y, e.b.z + 0.15, e.t * 0.5, 0x845ef7, SKINS[2], WAVE, e.t, i, e.pop);
        if (i === 0) person(k, e.b.x - 0.12, e.b.y, e.b.z + 0.18, 1, 0xff922b, SKINS[5], WAVE, e.t, 3, e.pop);
      }
      along(s, s.len * 0.5 - 1.7 + smooth(0, 20, e.t) * 0.6, e.b, -0.14);
      k.slot[0] = 0xfcc419;
      k.slot[1] = 0x343a40;
      k.root(e.b.x, e.b.y, e.b.z, e.b.yaw, 1.1 * e.pop);
      k.model(TRUCK, e.t);
      k.model(BEACON, e.t);
      along(s, s.len * 0.5 + 1.3, e.b, 0.14);
      police(k);
      k.root(e.b.x, e.b.y, e.b.z, e.b.yaw + Math.PI, 1.1 * e.pop);
      k.model(POLICE, e.t);
      flashers(k, e.b.x, 0.35, e.b.z, e.t, 0, e.life);
      along(s, s.len * 0.5, e.b, 0);
      e.bx = e.b.x;
      e.bz = e.b.z;
      e.by = 1.2;
    },
  },

  rooftop_helicopter: {
    icon: Plane,
    sound: "engine",
    draw(e) {
      const { k, s } = e;
      // Comes down onto the roof over 12 s, waits, lifts off near the end.
      const down = smooth(0, 12, e.t);
      const up = 1 - smooth(10, 0, e.left);
      const h = (1 - down) * 5 + up * 6;
      const drift = (1 - down) * 3 - up * 4;
      const y = s.top + 0.02 + h;
      k.slot[0] = 0xf8f9fa;
      k.root(s.x + drift, y, s.z, 0.6 + (1 - down) * 0.8, 1.6, h > 0.05 ? 0.1 : 0, 0);
      k.model(HELI, e.t);
      k.put(BOX, s.x - 0.0, s.top + 0.012, s.z, 0.08, 0.01, 0.02, 0.6, 0xe03131);
      k.card(0, "hpad", s.x, s.top + 0.015, s.z, 0.55, 0.55, FLAT, 0, 0xffffff, e.life);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        k.spark(s.x + Math.cos(a) * 0.3, s.top + 0.03, s.z + Math.sin(a) * 0.3, 0.07, 0x69db7c, e.life * (Math.floor(e.t * 2 + i) % 2));
      }
      if (h < 1.5) {
        for (let i = 0; i < 10; i++) {
          const a = h1(e.id, i) * TAU + e.t;
          const u = frac(e.t * 1.5 + i / 10);
          k.puff(s.x + Math.cos(a) * u * 0.7, s.top + 0.05, s.z + Math.sin(a) * u * 0.7, 0.2, 0xf1f3f5, e.life * (1 - u) * 0.4);
        }
      }
      if (h > 0.3) k.beam(s.x + drift, y, s.z, s.x + drift * 0.7, s.top, s.z, 0.4, 0xfff6d5, e.life * 0.4);
      e.by = Math.max(s.top + 1.2, y + 0.9);
      e.bx = s.x + drift;
    },
  },

  prison_van: {
    icon: Bus,
    sound: "siren",
    draw(e) {
      const { k, s } = e;
      const p = parkSpot(e, 0);
      k.slot[0] = 0x495057;
      k.slot[1] = 0x1c3f6e;
      k.root(p.x, 0.06, p.z, p.yaw, 1.15 * e.pop);
      k.model(VAN, e.t);
      for (let i = 0; i < 3; i++) k.rput(BOX, -0.05 + i * 0.05, 0.17, 0.092, 0.008, 0.06, 0.004, 0x212529);
      smoke(k, p.x + Math.cos(p.yaw) * 0.2, 0.15, p.z - Math.sin(p.yaw) * 0.2, e.t, e.id, 1.3, 0.25, 0xe9ecef, e.life, 12);
      k.glow(p.x, 0.15, p.z, 0.45, 0xffa31a, e.life * (Math.floor(e.t * 2.5) % 2));
      const ca = Math.cos(p.yaw);
      const sa = -Math.sin(p.yaw);
      for (let i = 0; i < 4; i++) {
        const o = (i - 1.5) * 0.15;
        const prisoner = i === 1 || i === 2;
        person(k, p.x + ca * o - sa * 0.24, s.ground, p.z + sa * o + ca * 0.24, Math.atan2(ca, sa) + (prisoner ? 0 : Math.sin(e.t * 0.7 + i)), prisoner ? 0xff7a1a : 0x1c3f6e, SKINS[i + 1], prisoner ? STAND : WAVE, e.t, i, e.pop, prisoner ? 0xff7a1a : 0x1c1f26, prisoner ? -1 : 0x1c1f26);
      }
      police(k);
      parked(e, POLICE, 1, 1.1, true);
      e.by = 1.3;
    },
  },

  pickpocket_chase: {
    icon: Skull,
    sound: "whistle",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      // A figure-of-eight dash through the stalls: the thief, a police officer, the victim.
      const R = s.w > 1 ? 0.7 : 0.4;
      for (let i = 0; i < 4; i++) {
        const a = e.t * 0.9 - i * 0.35;
        const x = s.x + Math.sin(a) * R;
        const z = s.z + Math.sin(a * 2) * R * 0.6;
        const dx = Math.cos(a) * R;
        const dz = Math.cos(a * 2) * 2 * R * 0.6;
        const yaw = Math.atan2(-dz, dx);
        const shirt = i === 0 ? 0x15161a : i === 1 ? 0x1c3f9e : PARTY[i];
        person(k, x, y, z, yaw, shirt, SKINS[i * 2], RUN, e.t, i, e.pop * 1.1, i === 0 ? 0x15161a : 0x343a40, i === 0 ? 0x15161a : i === 1 ? 0x1c1f26 : -1);
        if (i === 0) {
          k.put(BOX, x, y + 0.13, z + 0.05, 0.06, 0.05, 0.03, yaw, 0xc92a2a);
          e.bx = x;
          e.bz = z;
        }
      }
      for (let i = 0; i < 16; i++) {
        const u = frac(e.t * 0.7 + i / 16);
        const ang = h1(e.id, i) * TAU;
        k.bit(s.x + Math.cos(ang) * u * 0.6, y + 0.1 + Math.sin(u * Math.PI) * 0.4, s.z + Math.sin(ang) * u * 0.6, 0.05, [0xff922b, 0xfcc419, 0x69db7c, 0xe03131][i % 4], e.life * (1 - u));
      }
      crowd(e, 10, s.x, y, s.z, R * 1.5, R * 1.5, STAND, s.x, s.z, 3);
      e.by = y + 1.3;
    },
  },
};

const SHIRT_LIST = [0xe5484d, 0x4dabf7, 0xffd43b, 0x69db7c, 0xf783ac, 0x845ef7];

/** The celebrity's cars: a limo and two black cars with a motorbike escort. */
function parkCars(e: Ev) {
  const k = e.k;
  blackCar(k);
  parked(e, CAR, 1, 1.1, false, 0.55);
  k.slot[0] = 0x111318;
  k.slot[1] = 0xe9ecef;
  parked(e, LIMO, 0, 1.1, false, 0.55);
  blackCar(k);
  parked(e, CAR, 2, 1.1, false, 0.55);
}
