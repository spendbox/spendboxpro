// World-event scenes, part two: weather and nature, celebrations and culture, transport.

import {
  Bike,
  BusFront,
  CarFront,
  CloudFog,
  CloudHail,
  Crown,
  Drama,
  Drum,
  Eclipse,
  Fish,
  Flower2,
  GraduationCap,
  Heart,
  Music,
  PartyPopper,
  PlaneLanding,
  Rainbow,
  Shirt,
  Ship,
  Sparkles,
  Sun,
  Tornado,
  TrainFront,
  Utensils,
  Volleyball,
  Wind,
  Zap,
} from "lucide-react";
import {
  ASO,
  bunting,
  CHEER,
  clamp,
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
  parkSpot,
  PARTY,
  person,
  queue,
  RUN,
  searchlights,
  signpost,
  SKINS,
  skyAhead,
  skyDigits,
  smoke,
  smooth,
  sparkles,
  STAND,
  TAU,
  viewCentre,
  WALK,
  WAVE,
  waterArc,
  type Ev,
  type Scene,
} from "./common";
import { BALL, BOX, CONE, CYL, FACE, FIXED, FLAT, GBOX, UPRIGHT, type Kit, type Model } from "./kit";
import { BALLOON, BIKE, BUS, CAR, CARGO, CRUISE, FIRE_ENGINE, FLOAT, JET, LIMO, MASQUERADE, MONKEY, MOTORBIKE, PARTY_BALLOON, PLANE, STAGE, TUG, VAN, WHALE } from "./models";
import { along } from "./spots";

const WEDDING: readonly Model[] = [CAR, CAR, CAR, CAR, CAR];
const weddingSlots = (k: Kit, i: number) => {
  k.slot[0] = i === 0 ? 0xffffff : [0xf1f3f5, 0xdee2e6, 0xffffff, 0xced4da][i % 4];
  k.slot[1] = 0xe9f2fb;
};
const FLOATS: readonly Model[] = [FLOAT, FLOAT, FLOAT];
const floatSlots = (k: Kit, i: number) => {
  k.slot[0] = [0x7048e8, 0xe64980, 0x0ca678][i % 3];
  k.slot[1] = [0xfcc419, 0x4dabf7, 0xff922b][i % 3];
  k.slot[2] = [0xff4d6d, 0x69db7c, 0xf783ac][i % 3];
};
const MASKS: readonly Model[] = [MASQUERADE, MASQUERADE, MASQUERADE, MASQUERADE];
const maskSlots = (k: Kit, i: number) => {
  k.slot[0] = [0xe03131, 0x1971c2, 0xf59f00, 0x2f9e44][i % 4];
  k.slot[1] = [0xfcc419, 0xf8f9fa, 0x7048e8, 0xe64980][i % 4];
  k.slot[2] = [0x2f9e44, 0xe03131, 0x15aabf, 0xfcc419][i % 4];
};
const BUSES: readonly Model[] = [BUS];
const freeBus = (k: Kit) => {
  k.slot[0] = 0x2f9e44;
  k.slot[1] = 0xfcc419;
};
const BIKES: readonly Model[] = Array.from({ length: 18 }, () => BIKE);
const bikeSlots = (k: Kit, i: number) => {
  k.slot[0] = [0xe03131, 0x1c7ed6, 0xfcc419, 0x2f9e44, 0xf8f9fa, 0x7048e8][i % 6];
  k.slot[1] = 0xf8f9fa;
};
const ROYAL: readonly Model[] = [MOTORBIKE, MOTORBIKE, CAR, LIMO, CAR, MOTORBIKE];
const royalSlots = (k: Kit, i: number) => {
  if (i === 3) {
    k.slot[0] = 0x111318;
    k.slot[1] = 0x2f9e44;
  } else if (i === 2 || i === 4) {
    k.slot[0] = 0x1f2329;
    k.slot[1] = 0x2b3038;
  } else {
    k.slot[0] = 0xf8f9fa;
    k.slot[1] = 0x1c3f9e;
  }
};

/** People standing on both sides of the event's route, half-way along, facing it. */
function lineRoute(e: Ev, n: number, pose: number, salt: number) {
  const k = e.k;
  for (let i = 0; i < n; i++) {
    const d = (i + 0.5) * (e.s.len / n);
    along(e.s, d, e.b, (i % 2 ? 0.44 : -0.44) + (h1(e.id, i, salt) - 0.5) * 0.06);
    const yaw = e.b.yaw + (i % 2 ? Math.PI / 2 : -Math.PI / 2);
    person(k, e.b.x, 0.07, e.b.z, yaw, PARTY[i % PARTY.length], SKINS[i % 7], pose, e.t, i, e.pop);
  }
}

/** Water level and how big a thing fits on the water here. */
const waterFit = (e: Ev, want: number) => clamp(Math.max(e.s.waterW, e.s.waterD) / want, 0.45, 1.3);
const waterYaw = (e: Ev) => (e.s.waterD > e.s.waterW ? -Math.PI / 2 : 0);

/** Make a pond out in the fields if the event had nowhere better (no water in town). */
function pond(e: Ev) {
  if (e.s.pool > 0) e.k.water(e.s.x, e.s.waterY, e.s.z, e.s.pool * 2 * e.pop, e.s.pool * 2 * e.pop, 0x3f8fd0, 0.92 * e.life, true);
}

export const SCENES_B: Record<string, Scene> = {
  // ---------------------------------------------------------------- weather and nature
  rainbow: {
    icon: Rainbow,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const w = 7 * e.pop;
      k.card(0, "rainbow", s.x, s.ground + w * 0.24, s.z, w, w * 0.5, UPRIGHT, 0, 0xffffff, e.life * 0.75);
      sparkles(k, s.x, 1.5, s.z, 3, 1.4, 1, e.t, e.id, 0xffffff, e.life * 0.7, 30, 0.08);
      for (let i = 0; i < 40; i++) {
        const u = frac(e.t * 0.9 + h1(e.id, i));
        k.bit(s.x + 3 + (h1(e.id, i, 1) - 0.5) * 3, 4 - u * 4, s.z + (h1(e.id, i, 2) - 0.5) * 3, 0.02, 0xc5d6ea, e.life * 0.5);
      }
      crowd(e, 6, s.x + 0.6, 0.08, s.z + 0.8, 0.3, 0.2, WAVE, s.x, s.z);
      e.by = s.ground + w * 0.55;
    },
  },

  hailstorm: {
    icon: CloudHail,
    sound: "wind",
    draw(e) {
      const { k, s } = e;
      const R = 3.2;
      for (let i = 0; i < 180; i++) {
        const x = s.x + (h1(e.id, i) - 0.5) * 2 * R;
        const z = s.z + (h1(e.id, i, 1) - 0.5) * 2 * R;
        const u = frac(e.t * 1.6 + h1(e.id, i, 2));
        const y = u < 0.85 ? 5 - (u / 0.85) * 4.92 : 0.08 + Math.sin(((u - 0.85) / 0.15) * Math.PI) * 0.12;
        k.bit(x, y, z, 0.035, 0xf8fbff, e.life);
      }
      for (let i = 0; i < 16; i++) k.puff(s.x + (h1(e.id, i, 4) - 0.5) * 6, 5.4 + h1(e.id, i, 5) * 0.8, s.z + (h1(e.id, i, 6) - 0.5) * 6, 3, 0x5c6470, e.life * 0.8);
      // Ice piling up white on the ground.
      k.card(0, "glow", s.x, 0.11, s.z, 2 * R, 2 * R, FLAT, 0, 0xffffff, e.life * 0.45 * smooth(0, 60, e.t));
      for (let i = 0; i < 8; i++) {
        const a = e.t * 0.3 + (i / 8) * TAU;
        const x = s.x + Math.cos(a) * (0.8 + i * 0.15);
        const z = s.z + Math.sin(a) * (0.8 + i * 0.15);
        person(k, x, 0.07, z, -a - Math.PI / 2, PARTY[i], SKINS[i % 7], RUN, e.t, i, e.pop);
        k.put(CONE, x, 0.32 * e.pop, z, 0.18 * e.pop, 0.05 * e.pop, 0.18 * e.pop, 0, PARTY[(i + 3) % 8]);
      }
      k.dim(1 - 0.25 * e.life);
      e.by = 6.2;
    },
  },

  harmattan: {
    icon: Wind,
    sound: "wind",
    draw(e) {
      const { k } = e;
      k.tint(0xd8a35a, 0.5 * e.life);
      k.fog(1 - 0.55 * e.life);
      k.dim(1 - 0.15 * e.life);
      const c = viewCentre(e);
      for (let i = 0; i < 90; i++) {
        const u = frac(e.t * 0.04 + h1(e.id, i));
        const x = c.x - 9 + u * 18;
        const z = c.z + (h1(e.id, i, 1) - 0.5) * 18;
        k.puff(x, 0.3 + h1(e.id, i, 2) * 3, z, 1.6 + h1(e.id, i, 3) * 1.6, 0xe0b070, e.life * 0.22 * Math.sin(u * Math.PI));
      }
      e.bx = e.s.x;
      e.bz = e.s.z;
    },
  },

  power_plant_lightning: {
    icon: Zap,
    sound: "thunder",
    draw(e) {
      const { k, s } = e;
      const period = 3.3;
      const c = Math.floor(e.t / period);
      const u = e.t - c * period;
      const f = u < 0.07 ? 1 : u < 0.13 ? 0.2 : u < 0.22 ? 0.8 : u < 0.32 ? 0.4 * (1 - (u - 0.22) / 0.1) : 0;
      const tx = c % 2 ? s.hx : s.x;
      const tz = c % 2 ? s.hz : s.z;
      const ty = c % 2 ? s.hy : Math.max(0.5, s.top * 0.6);
      if (f > 0.02) {
        k.bolt(tx, ty, tz, 9, e.id * 17 + c, e.life * f);
        k.flash(e.life * f * 0.7);
      }
      k.dome(s.x, 0, s.z, 1.7 * s.w * e.pop, 1.6 * e.pop, 1.7 * s.w * e.pop, 0x4dabff, e.life * (0.35 + 0.25 * Math.sin(e.t * 9)), 2);
      sparkles(k, s.x, 0.8, s.z, 1.2, 0.6, 1.2, e.t * 3, e.id, 0xa5d8ff, e.life, 26, 0.09);
      for (let i = 0; i < 14; i++) k.puff(s.x + (h1(e.id, i) - 0.5) * 5, 7 + h1(e.id, i, 2), s.z + (h1(e.id, i, 3) - 0.5) * 5, 2.8, 0x3b4252, e.life * 0.8);
      // The lights go out round about.
      k.dome(s.x, 0, s.z, 3.4 * e.pop, 2.2 * e.pop, 3.4 * e.pop, 0x050914, 0.4 * e.life, 0);
      k.dim(1 - 0.3 * e.life);
      e.by = Math.max(s.top, s.hy) + 1.4;
    },
  },

  eclipse: {
    icon: Eclipse,
    sound: "eerie",
    draw(e) {
      const { k, s } = e;
      // The moon slides over the sun: darkest half way through.
      const p = e.t / e.dur;
      const cover = 1 - Math.min(1, Math.abs(p - 0.5) / 0.38);
      const dark = smooth(0, 1, cover) * e.life;
      k.dim(1 - 0.78 * dark, 1 - 0.9 * dark);
      k.tint(0x1a2340, 0.55 * dark);
      const far = skyAhead(e);
      const sx = e.v.x;
      const sy = e.v.y;
      const sz = e.v.z;
      const size = far * 0.13;
      k.card(1, cover > 0.92 ? "corona" : "sun", sx, sy, sz, size * (cover > 0.92 ? 1.6 : 1), size * (cover > 0.92 ? 1.6 : 1), FACE, 0, 0xfff4d6, e.life);
      const off = (p - 0.5) * 2 * size * 0.9;
      k.put(BALL, sx + off * 0.8, sy - off * 0.3, sz + off * 0.4, size * 0.34, size * 0.34, size * 0.34, 0, 0x07090f);
      sparkles(k, sx, sy, sz, far * 0.6, far * 0.15, far * 0.6, e.t, e.id, 0xffffff, dark, 50, far * 0.008);
      crowd(e, 14, s.x, s.ground, s.z, 0.45, 0.45, STAND, sx, sz);
      e.by = Math.max(1.2, s.top + 1.2);
    },
  },

  shooting_stars: {
    icon: Sparkles,
    sound: "chime",
    draw(e) {
      const { k } = e;
      k.dim(1 - 0.35 * e.life);
      k.tint(0x14203f, 0.4 * e.life);
      const c = viewCentre(e);
      for (let j = 0; j < 7; j++) {
        const period = 2.2 + h1(e.id, j) * 2;
        const cyc = Math.floor(e.t / period + h1(e.id, j, 1));
        const u = frac(e.t / period + h1(e.id, j, 1));
        if (u > 0.4) continue;
        const f = u / 0.4;
        const x0 = c.x + (h1(cyc, j, 2) - 0.5) * 24;
        const z0 = c.z + (h1(cyc, j, 3) - 0.5) * 24;
        const y0 = 10 + h1(cyc, j, 4) * 5;
        const dx = 5;
        const dy = -3;
        for (let i = 0; i < 14; i++) {
          const g = f - i * 0.018;
          if (g < 0) break;
          k.spark(x0 + dx * g, y0 + dy * g, z0 + dx * 0.4 * g, 0.22 * (1 - i / 14), i < 2 ? 0xffffff : 0xb9d4ff, e.life * (1 - i / 14) * Math.sin(f * Math.PI));
        }
      }
      sparkles(k, c.x, 11, c.z, 18, 3, 18, e.t, e.id, 0xffffff, e.life * 0.8, 70, 0.14);
      e.by = 3;
    },
  },

  sea_fog: {
    icon: CloudFog,
    sound: "foghorn",
    draw(e) {
      const { k, s } = e;
      pond(e);
      const roll = smooth(0, 40, e.t);
      k.fog(1 - 0.6 * roll * e.life);
      k.tint(0xc9d1d9, 0.35 * roll * e.life);
      // A bank of fog rolling in off the water, spreading over the streets.
      for (let i = 0; i < 70; i++) {
        const a = h1(e.id, i) * TAU;
        const r = (0.3 + h1(e.id, i, 1) * 4.5) * (0.35 + 0.65 * roll);
        const drift = Math.sin(e.t * 0.1 + i) * 0.4;
        k.puff(s.x + Math.cos(a) * r + drift, 0.15 + h1(e.id, i, 2) * 0.9, s.z + Math.sin(a) * r, 2 + h1(e.id, i, 3) * 1.5, 0xf1f3f5, e.life * 0.32);
      }
      e.by = 2.2;
    },
  },

  heatwave: {
    icon: Sun,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      k.tint(0xffb066, 0.22 * e.life);
      const far = skyAhead(e);
      k.card(1, "sun", e.v.x, e.v.y, e.v.z, far * 0.2, far * 0.2, FACE, 0, 0xffe8a8, e.life * 0.9);
      // Sprinklers with children running through them, an ice-cream van with a queue.
      for (let i = 0; i < 2; i++) {
        const fx = s.x + (i ? 0.3 : -0.3);
        fountain(k, fx, s.ground, s.z, 0.45, e.t, e.id + i, e.life, 26, 0.35);
        crowd(e, 4, fx, s.ground, s.z + 0.05, 0.22, 0.22, CHEER, fx, s.z, 5 + i);
      }
      const p = parkSpot(e, 0);
      k.slot[0] = 0xf783ac;
      k.slot[1] = 0xffffff;
      k.root(p.x, 0.06, p.z, p.yaw, 1.1 * e.pop);
      k.model(VAN, e.t);
      k.rput(CONE, -0.02, 0.27, 0, 0.08, 0.1, 0.08, 0xffd8a8, 0, Math.PI);
      k.rput(BALL, -0.02, 0.33, 0, 0.08, 0.08, 0.08, 0xf783ac);
      queue(e, 6, p.x - Math.sin(p.yaw) * 0.2, 0.065, p.z - Math.cos(p.yaw) * 0.2, p.x - Math.sin(p.yaw) * 0.2 - Math.cos(p.yaw) * 1.2, p.z - Math.cos(p.yaw) * 0.2 + Math.sin(p.yaw) * 1.2, 2);
      sparkles(k, s.x, 0.4, s.z, 1, 0.3, 1, e.t, e.id, 0xffe066, e.life * 0.5, 14, 0.06);
      e.by = s.ground + 1.4;
    },
  },

  tornado: {
    icon: Tornado,
    sound: "wind",
    draw(e) {
      const { k, s } = e;
      // It wanders round the edge of town.
      const a = e.t * 0.12;
      const x = s.x + Math.cos(a) * 1.6 + Math.sin(e.t * 0.4) * 0.4;
      const z = s.z + Math.sin(a * 1.3) * 1.6;
      const y = s.ground;
      const g = e.pop;
      k.funnel(x, y, z, 6 * g, 1.7 * g, 0x7d7468, e.life * 0.85);
      for (let i = 0; i < 70; i++) {
        const h = h1(e.id, i) * 5.5;
        const r = 0.12 + Math.pow(h / 6, 2.2) * 1.6 + 0.15;
        const ang = e.t * (5 - h * 0.5) + h1(e.id, i, 1) * TAU;
        const sw = Math.sin(h * 0.67 + e.t * 1.7) * 0.18 * (h / 6);
        if (i % 2) k.bit(x + Math.cos(ang) * r + sw, y + h, z + Math.sin(ang) * r, 0.06, [0x6b4f35, 0x868e96, 0x2f9e44][i % 3], e.life);
        else k.puff(x + Math.cos(ang) * r * 0.8, y + h * 0.3, z + Math.sin(ang) * r * 0.8, 0.6, 0xa89a85, e.life * 0.35);
      }
      for (let i = 0; i < 12; i++) k.puff(x + (h1(e.id, i, 3) - 0.5) * 5, y + 6 + h1(e.id, i, 4), z + (h1(e.id, i, 5) - 0.5) * 5, 3.2, 0x4a4f58, e.life * 0.8);
      k.dim(1 - 0.25 * e.life);
      e.bx = x;
      e.bz = z;
      e.by = y + 7.2;
    },
  },

  butterflies: {
    icon: Flower2,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const cols = [0xff922b, 0xfcc419, 0x74c0fc, 0xf783ac, 0xb197fc, 0xffffff, 0x63e6be];
      for (let i = 0; i < 130; i++) {
        const a = h1(e.id, i) * TAU;
        const r = 0.3 + h1(e.id, i, 1) * 1.8;
        const sp = 0.15 + h1(e.id, i, 2) * 0.25;
        const x = s.x + Math.cos(a + e.t * sp) * r + Math.sin(e.t * 1.3 + i) * 0.15;
        const z = s.z + Math.sin(a + e.t * sp) * r * 0.8;
        const y = s.ground + 0.25 + h1(e.id, i, 3) * 1.4 + Math.sin(e.t * 2 + i) * 0.15;
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(e.t * 12 + i));
        k.card(0, "butterfly", x, y, z, 0.12 * flap, 0.1, FACE, 0, cols[i % cols.length], e.life * clamp(e.t - h1(e.id, i, 4) * 3));
      }
      crowd(e, 6, s.fx, 0.065, s.fz, 0.25, 0.25, WAVE, s.x, s.z);
      e.by = s.ground + 2.2;
    },
  },

  whale_sighting: {
    icon: Fish,
    sound: "splash",
    draw(e) {
      const { k, s } = e;
      pond(e);
      const sc = waterFit(e, 2.2) * 1.1;
      const yaw = waterYaw(e);
      const wy = s.waterY;
      // A breach every 9 seconds: it surges up out of the water, turns over and crashes back.
      const period = 9;
      const u = frac(e.t / period);
      const ca = Math.cos(yaw);
      const sa = -Math.sin(yaw);
      let y: number;
      let pitch: number;
      let off: number;
      if (u < 0.55) {
        y = wy - 0.12 * sc + Math.sin(u * 12) * 0.02;
        pitch = 0;
        off = -0.6 + u * 0.8;
      } else {
        const j = (u - 0.55) / 0.45;
        y = wy - 0.1 * sc + Math.sin(j * Math.PI) * 1.3 * sc;
        pitch = 1.2 - j * 2.4;
        off = -0.16 + j * 0.9;
      }
      const x = s.x + ca * off * sc;
      const z = s.z + sa * off * sc;
      k.root(x, y, z, yaw, sc * e.pop, 0, pitch);
      k.model(WHALE, e.t);
      if (u < 0.55 && frac(e.t / 3) < 0.25) {
        for (let i = 0; i < 12; i++) {
          const v = frac(e.t / 3) / 0.25;
          k.puff(x + ca * 0.2 * sc, wy + v * 0.8 * sc + i * 0.03, z + sa * 0.2 * sc, 0.15 + v * 0.2, 0xffffff, e.life * (1 - v) * 0.6);
        }
      }
      if (u > 0.55 && u < 0.62) {
        for (let i = 0; i < 30; i++) {
          const ang = h1(e.id, i) * TAU;
          const v = (u - 0.55) / 0.07;
          k.bit(x + Math.cos(ang) * 0.4 * v * sc, wy + Math.sin(v * Math.PI) * 0.5 * sc, z + Math.sin(ang) * 0.4 * v * sc, 0.05, 0xffffff, e.life);
        }
      }
      if (u > 0.92 || u < 0.05) {
        const v = u > 0.92 ? (u - 0.92) / 0.13 : (u + 0.08) / 0.13;
        const ex = s.x + ca * 0.74 * sc;
        const ez = s.z + sa * 0.74 * sc;
        fountain(k, ex, wy, ez, 1.1 * sc * (1 - v), e.t, e.id, e.life, 40, 0.5 * sc);
        k.card(0, "splash", ex, wy + 0.01, ez, (0.5 + v * 1.5) * sc, (0.5 + v * 1.5) * sc, FLAT, 0, 0xffffff, e.life * (1 - v));
      }
      k.card(0, "splash", s.x, wy + 0.01, s.z, (0.8 + frac(e.t * 0.3) * 1.2) * sc, (0.8 + frac(e.t * 0.3) * 1.2) * sc, FLAT, 0, 0xffffff, e.life * 0.5 * (1 - frac(e.t * 0.3)));
      e.by = wy + 2.2 * sc;
    },
  },

  market_monkeys: {
    icon: PartyPopper,
    sound: "crowd",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      const R = s.w > 1 ? 0.75 : 0.42;
      // Monkeys bounding from stall to stall with fruit; traders shooing them.
      for (let i = 0; i < 8; i++) {
        const hop = 1.4 + h1(e.id, i) * 0.6;
        const n = Math.floor(e.t / hop + h1(e.id, i, 1) * 5);
        const u = frac(e.t / hop + h1(e.id, i, 1) * 5);
        const a0 = h1(n, i, 2) * TAU;
        const a1 = h1(n + 1, i, 2) * TAU;
        const r0 = R * (0.3 + h1(n, i, 3) * 0.7);
        const r1 = R * (0.3 + h1(n + 1, i, 3) * 0.7);
        const x0 = s.x + Math.cos(a0) * r0;
        const z0 = s.z + Math.sin(a0) * r0;
        const x1 = s.x + Math.cos(a1) * r1;
        const z1 = s.z + Math.sin(a1) * r1;
        const x = x0 + (x1 - x0) * u;
        const z = z0 + (z1 - z0) * u;
        const hy = y + 0.28 + Math.sin(u * Math.PI) * 0.35;
        k.root(x, hy, z, Math.atan2(-(z1 - z0), x1 - x0), 1.6 * e.pop);
        k.model(MONKEY, e.t * 2);
        k.put(BALL, x, hy + 0.12, z + 0.05, 0.05, 0.05, 0.05, 0, [0xfcc419, 0xff922b, 0xe03131, 0x69db7c][i % 4]);
      }
      for (let i = 0; i < 20; i++) {
        const u = frac(e.t * 0.8 + i / 20);
        const ang = h1(e.id, i, 9) * TAU;
        k.bit(s.x + Math.cos(ang) * u * R, y + 0.3 + Math.sin(u * Math.PI) * 0.5, s.z + Math.sin(ang) * u * R, 0.05, [0xfcc419, 0xff922b, 0x69db7c][i % 3], e.life * (1 - u));
      }
      for (let i = 0; i < 3; i++) {
        const a = e.t * 0.7 + i * 2.1;
        person(k, s.x + Math.cos(a) * R * 0.8, y, s.z + Math.sin(a) * R * 0.8, -a - Math.PI / 2, ASO[i], SKINS[i + 2], i ? RUN : WAVE, e.t, i, e.pop);
      }
      crowd(e, 8, s.x, y, s.z, R * 1.4, R * 1.4, CHEER, s.x, s.z, 5);
      e.by = y + 1.5;
    },
  },

  // ---------------------------------------------------------------- celebrations and culture
  wedding_convoy: {
    icon: Heart,
    sound: "horn",
    draw(e) {
      const { k, s } = e;
      convoy(e, WEDDING, 0.5, 0.9, 0.14, 1.1, weddingSlots);
      const span = s.len + 5 * 0.5 + 1;
      const head = ((e.t * 0.9) % span) - 0.5;
      for (let i = 0; i < 5; i++) {
        const d = head - i * 0.5;
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, 0.14);
        const ca = Math.cos(e.b.yaw);
        const sa = -Math.sin(e.b.yaw);
        // Ribbons over the bonnet, hazards blinking, balloons on the lead car, cans behind it.
        k.put(BOX, e.b.x, 0.14, e.b.z, 0.012, 0.012, 0.17, e.b.yaw, i % 2 ? 0xf783ac : 0xffffff);
        k.put(BOX, e.b.x + ca * 0.1, 0.105, e.b.z + sa * 0.1, 0.16, 0.012, 0.012, e.b.yaw, 0xf783ac);
        k.glow(e.b.x, 0.12, e.b.z, 0.35, 0xffa31a, e.life * (Math.floor(e.t * 3 + i) % 2));
        if (i === 0) {
          k.card(0, "married", e.b.x - ca * 0.22, 0.22, e.b.z - sa * 0.22, 0.34, 0.17, UPRIGHT, 0, 0xffffff, e.life);
          for (let j = 0; j < 3; j++) k.put(CYL, e.b.x - ca * (0.32 + j * 0.06), 0.085, e.b.z - sa * (0.32 + j * 0.06) + (j - 1) * 0.04, 0.03, 0.04, 0.03, 0, 0xadb5bd, Math.PI / 2);
          for (let j = 0; j < 3; j++) {
            k.slot[0] = [0xffffff, 0xf783ac, 0xffd43b][j];
            k.root(e.b.x - ca * 0.1 + (j - 1) * 0.05 * sa, 0.12, e.b.z - sa * 0.1 - (j - 1) * 0.05 * ca, 0, 0.8 * e.pop, (j - 1) * 0.25);
            k.model(PARTY_BALLOON, e.t);
          }
          confetti(k, e.b.x, 0.06, e.b.z, 0.8, 0.8, e.t, e.id, e.life * 0.7, 24, [0xffffff, 0xf783ac, 0xffd43b]);
          e.bx = e.b.x;
          e.bz = e.b.z;
        }
      }
      lineRoute(e, 8, WAVE, 3);
      e.by = 1.3;
    },
  },

  carnival: {
    icon: Drama,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      convoy(e, FLOATS, 1.4, 0.35, 0, 1.25, floatSlots);
      const span = s.len + 3 * 1.4 + 1;
      const head = ((e.t * 0.35) % span) - 0.5;
      for (let i = 0; i < 18; i++) {
        const d = head - 0.5 - i * 0.22;
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, ((i % 3) - 1) * 0.22);
        const c = PARTY[i % PARTY.length];
        person(k, e.b.x, e.b.y, e.b.z, e.b.yaw + Math.sin(e.t * 3 + i) * 0.6, c, SKINS[i % 7], DANCE, e.t, i, e.pop, c);
        // Feathered headdresses.
        for (let j = -1; j <= 1; j++) k.put(CONE, e.b.x, e.b.y + 0.3 * e.pop, e.b.z + j * 0.02, 0.02, 0.12 * e.pop, 0.02, e.b.yaw, PARTY[(i + j + 3) % PARTY.length], 0, j * 0.5);
      }
      if (head > 0) {
        along(s, clamp(head, 0, s.len), e.b, 0);
        e.bx = e.b.x;
        e.bz = e.b.z;
      }
      confetti(k, e.bx, 0.06, e.bz, 2.2, 1.6, e.t, e.id, e.life * 0.8, 60);
      lineRoute(e, 10, CHEER, 4);
      e.by = 1.9;
    },
  },

  masquerade: {
    icon: Drama,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      convoy(e, MASKS, 0.6, 0.3, 0, 1.6, maskSlots);
      const span = s.len + 4 * 0.6 + 1;
      const head = ((e.t * 0.3) % span) - 0.5;
      // Drummers following on behind.
      for (let i = 0; i < 6; i++) {
        const d = head - 2.6 - (i >> 1) * 0.25;
        if (d < 0 || d > s.len) continue;
        along(s, d, e.b, i % 2 ? 0.12 : -0.12);
        person(k, e.b.x, e.b.y, e.b.z, e.b.yaw, 0xf8f9fa, SKINS[i % 7], WALK, e.t, i, e.pop, 0xf8f9fa, 0xe03131);
        k.put(CYL, e.b.x + Math.cos(e.b.yaw) * 0.05, e.b.y + 0.12 * e.pop, e.b.z - Math.sin(e.b.yaw) * 0.05, 0.06 * e.pop, 0.08 * e.pop, 0.06 * e.pop, 0, 0x8a5a2b);
      }
      if (head > 0) {
        along(s, clamp(head, 0, s.len), e.b, 0);
        e.bx = e.b.x;
        e.bz = e.b.z;
      }
      sparkles(k, e.bx, 0.6, e.bz, 0.6, 0.4, 0.6, e.t, e.id, 0xffe066, e.life * 0.7, 14, 0.08);
      lineRoute(e, 12, CHEER, 5);
      e.by = 1.8;
    },
  },

  owambe: {
    icon: Music,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      const g = e.pop;
      // Two canopies, chairs, everyone dancing in matching gold and purple, money in the air.
      for (const o of [-0.32, 0.32]) {
        const cx = s.x + o;
        for (const [px, pz] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.3], [0.25, 0.3]]) k.put(CYL, cx + px * g, y + 0.22, s.z + pz * g, 0.015, 0.44 * g, 0.015, 0, 0xdee2e6);
        k.put(BOX, cx, y + 0.45 * g, s.z, 0.56 * g, 0.03, 0.66 * g, 0, 0xf8f9fa);
        k.put(BOX, cx, y + 0.42 * g, s.z, 0.565 * g, 0.03, 0.665 * g, 0, 0xd4af37);
        for (let i = 0; i < 4; i++) k.glow(cx + (i - 1.5) * 0.13, y + 0.4, s.z + 0.33, 0.25, 0xffe8a3, e.life * (0.4 + 0.6 * e.night));
      }
      crowd(e, 30, s.x, y, s.z, 0.55, 0.45, DANCE, s.x, s.z, 0, ASO);
      for (let i = 0; i < 6; i++) k.put(BOX, s.x - 0.55 + i * 0.22, y + 0.04, s.z + 0.55, 0.06, 0.08, 0.06, 0, 0xd4af37);
      for (let i = 0; i < 30; i++) {
        const u = frac(e.t * 0.5 + h1(e.id, i));
        const ang = h1(e.id, i, 1) * TAU;
        const r = h1(e.id, i, 2) * 0.5;
        k.bit(s.x + Math.cos(ang) * r, y + 0.55 - u * 0.5 + Math.sin(u * 9) * 0.03, s.z + Math.sin(ang) * r, 0.04, 0x5fbf63, e.life * (1 - u));
      }
      for (const o of [-0.62, 0.62]) k.put(BOX, s.x + o, y + 0.12, s.z - 0.5, 0.1 * g, 0.24 * g, 0.1 * g, 0, 0x212529);
      e.by = y + 1.5;
    },
  },

  stadium_concert: {
    icon: Music,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const y = s.kind === "arena" ? 0.77 : s.ground;
      k.slot[0] = 0x343a40;
      k.root(s.x, y, s.z - 0.35 * s.w, 0, 1.2 * e.pop);
      k.model(STAGE, e.t);
      const sy = y + 0.55 * e.pop;
      k.card(0, "screen", s.x, sy, s.z - 0.35 * s.w - 0.31, 0.95 * e.pop, 0.48 * e.pop, FIXED, 0, 0xffffff, e.life);
      const beat = Math.floor(e.t * 2.2);
      for (let i = 0; i < 3; i++) person(k, s.x + (i - 1) * 0.22, y + 0.16, s.z - 0.35 * s.w, Math.PI / 2, PARTY[(i + beat) % 8], SKINS[i * 2], DANCE, e.t, i, e.pop * 1.1);
      crowd(e, 44, s.x, y, s.z + 0.45 * s.w, 0.75 * s.w, 0.35 * s.w, CHEER, s.x, s.z - 0.35 * s.w);
      searchlights(k, s.x, y + 0.9, s.z - 0.35 * s.w, 6, 7, e.t, PARTY, e.life * (0.4 + 0.6 * e.night), 0.7, 1.1);
      for (let i = 0; i < 4; i++) k.glow(s.x + (i - 1.5) * 0.25, y + 0.93, s.z - 0.35 * s.w, 0.45, PARTY[(i + beat) % 8], e.life);
      const f = fireworks(k, s.x, y + 1, s.z, y + 3, y + 4.5, 2.5, e.t, e.id, e.life * 0.8, 2, PARTY, 3.6);
      k.flash(f * 0.15 * e.night);
      e.by = y + 1.8;
    },
  },

  new_year: {
    icon: PartyPopper,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      // Ten, nine, eight... zero! Fireworks and confetti, then again.
      const period = 16;
      const u = e.t % period;
      const count = 10 - Math.floor(u);
      if (count >= 0) skyDigits(e, count, false, s.x, y + 2.4, s.z, 1.2, count <= 3 ? 0xff6b6b : 0xffe066, e.life * (1 - frac(u) * 0.5));
      else {
        const f = fireworks(k, s.x, y, s.z, y + 2.5, y + 4.5, 2.6, u - 11, e.id + Math.floor(e.t / period), e.life, 5);
        k.flash(f * 0.2 * e.night);
        confetti(k, s.x, y, s.z, 1.8, 2.2, e.t, e.id, e.life, 80);
      }
      crowd(e, 34, s.x, y, s.z, 0.6, 0.6, count < 0 ? CHEER : STAND, s.x, s.z);
      e.by = y + 3.4;
    },
  },

  rooftop_fashion: {
    icon: Shirt,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      const y = s.top + 0.01;
      const L = 0.5;
      k.put(BOX, s.x, y + 0.01, s.z, L * 1.15 * e.pop, 0.02, 0.12 * e.pop, 0, 0xf8f9fa);
      k.put(GBOX, s.x, y + 0.022, s.z + 0.065, L * 1.15 * e.pop, 0.005, 0.01, 0, 0xff8fab);
      k.put(GBOX, s.x, y + 0.022, s.z - 0.065, L * 1.15 * e.pop, 0.005, 0.01, 0, 0xff8fab);
      for (let i = 0; i < 3; i++) {
        const u = frac(e.t / 8 + i / 3);
        const x = s.x + (u < 0.5 ? -L / 2 + u * 2 * L : L / 2 - (u - 0.5) * 2 * L);
        person(k, x, y + 0.02, s.z, u < 0.5 ? 0 : Math.PI, [0xe64980, 0x15161a, 0xfcc419][i], SKINS[i * 2 + 1], WALK, e.t, i, e.pop, [0x15161a, 0xf8f9fa, 0x7048e8][i]);
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const px = s.x + (i - 1.5) * 0.14;
          const pz = s.z + side * 0.2;
          person(k, px, y, pz, side > 0 ? -Math.PI / 2 : Math.PI / 2, PARTY[i + (side > 0 ? 4 : 0)], SKINS[i], STAND, e.t, i, e.pop * 0.9);
          if (frac(e.t * 1.3 + h1(e.id, i + side * 9)) < 0.08) k.glow(px, y + 0.25, pz, 0.35, 0xffffff, e.life);
        }
      }
      searchlights(k, s.x, y + 0.05, s.z, 3, 5, e.t, [0xff8fab, 0xb197fc, 0xffffff], e.life * (0.3 + 0.7 * e.night), 0.4, 0.8);
      e.by = y + 1.2;
    },
  },

  street_football: {
    icon: Volleyball,
    sound: "whistle",
    draw(e) {
      const { k, s } = e;
      // Goals at both ends of a stretch of road, a dozen players chasing the ball.
      along(s, s.len * 0.5, e.a, 0);
      const ca = Math.cos(e.a.yaw);
      const sa = -Math.sin(e.a.yaw);
      const L = 0.85;
      for (const side of [-1, 1]) {
        const gx = e.a.x + ca * L * side;
        const gz = e.a.z + sa * L * side;
        k.put(BOX, gx - sa * 0.15, 0.15, gz + ca * 0.15, 0.015, 0.18 * e.pop, 0.015, 0, 0xffffff);
        k.put(BOX, gx + sa * 0.15, 0.15, gz - ca * 0.15, 0.015, 0.18 * e.pop, 0.015, 0, 0xffffff);
        k.put(BOX, gx, 0.24 * e.pop + 0.06, gz, 0.015, 0.015, 0.32, e.a.yaw, 0xffffff);
      }
      const bu = Math.sin(e.t * 0.7) * 0.6 + Math.sin(e.t * 1.9) * 0.15;
      const bv = Math.sin(e.t * 1.3) * 0.18;
      const bx = e.a.x + ca * bu - sa * bv;
      const bz = e.a.z + sa * bu + ca * bv;
      k.put(BALL, bx, 0.09 + Math.abs(Math.sin(e.t * 5)) * 0.08, bz, 0.05, 0.05, 0.05, 0, 0xffffff);
      for (let i = 0; i < 10; i++) {
        const team = i % 2;
        const off = Math.sin(e.t * (0.8 + h1(e.id, i)) + i) * 0.25;
        const px = bx + Math.cos(i * 1.3) * (0.15 + h1(e.id, i, 1) * 0.35) + off * ca;
        const pz = bz + Math.sin(i * 1.3) * (0.12 + h1(e.id, i, 1) * 0.15);
        person(k, px, 0.065, pz, Math.atan2(-(bz - pz), bx - px), team ? 0xe03131 : 0x1c7ed6, SKINS[i % 7], RUN, e.t, i, e.pop, 0xf8f9fa);
      }
      for (const side of [-1, 1]) crowd(e, 6, e.a.x - sa * 0.48 * side, 0.065, e.a.z + ca * 0.48 * side, 0.5, 0.06, CHEER, e.a.x, e.a.z, side > 0 ? 3 : 4);
      e.bx = e.a.x;
      e.bz = e.a.z;
      e.by = 1.2;
    },
  },

  graduation: {
    icon: GraduationCap,
    sound: "cheer",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      const cx = s.x;
      const cz = s.z + 0.35 * s.w;
      crowd(e, 30, cx, y, cz, 0.6 * s.w, 0.3 * s.w, CHEER, s.x, s.z - 0.3, 0, [0x15161a, 0x1c1f26]);
      // Caps in the air, every few seconds.
      const u = frac(e.t / 6);
      for (let i = 0; i < 30; i++) {
        const ox = (h1(e.id, i) - 0.5) * 1.2 * s.w;
        const oz = (h1(e.id, i, 1) - 0.5) * 0.6 * s.w;
        const hgt = Math.sin(clamp(u / 0.7) * Math.PI) * (0.8 + h1(e.id, i, 2) * 0.6);
        if (u < 0.7) k.put(BOX, cx + ox, y + 0.25 + hgt, cz + oz, 0.07, 0.012, 0.07, e.t * 6 + i, 0x15161a, Math.sin(e.t * 7 + i) * 0.6);
      }
      if (u < 0.3) confetti(k, cx, y, cz, 1.6, 1.4, e.t, e.id, e.life, 50, [0xfcc419, 0xffffff, 0x1c7ed6]);
      k.put(BOX, s.x, y + 0.04, s.z - 0.35 * s.w, 0.6 * e.pop, 0.08, 0.2, 0, 0x8a5a2b);
      person(k, s.x, y + 0.08, s.z - 0.35 * s.w, Math.PI / 2, 0x7048e8, SKINS[3], WAVE, e.t, 0, e.pop);
      bunting(k, s.x - 0.5, y + 0.4, s.z - 0.45 * s.w, s.x + 0.5, y + 0.4, s.z - 0.45 * s.w, 12, e.t, [0xfcc419, 0x1c7ed6, 0xffffff]);
      e.by = y + 1.6;
    },
  },

  food_festival: {
    icon: Utensils,
    sound: "crowd",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      const g = e.pop;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const x = s.x + Math.cos(a) * 0.5;
        const z = s.z + Math.sin(a) * 0.5;
        const yaw = -a + Math.PI / 2;
        k.put(BOX, x, y + 0.08, z, 0.3 * g, 0.16 * g, 0.16 * g, yaw, 0xf1e3c8);
        for (let j = 0; j < 4; j++) k.put(BOX, x + Math.cos(yaw) * (j - 1.5) * 0.08 * g, y + 0.25 * g, z - Math.sin(yaw) * (j - 1.5) * 0.08 * g, 0.08 * g, 0.02, 0.22 * g, yaw, j % 2 ? 0xffffff : [0xe03131, 0x2f9e44, 0x1c7ed6, 0xf08c00][i], 0.2);
        if (i % 2 === 0) smoke(k, x, y + 0.2, z, e.t, e.id + i, 1.4, 0.25, 0xdee2e6, e.life * 0.8, 10);
        if (i % 2 === 0) fire(k, x, y + 0.17, z, 0.1, e.t, e.id + i, e.life * 0.8, 6);
        person(k, x - Math.cos(a) * 0.12, y, z - Math.sin(a) * 0.12, -a + Math.PI, 0xffffff, SKINS[i + 1], WAVE, e.t, i, g, 0x343a40, 0xffffff);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const b = a + TAU / 4;
        bunting(k, s.x + Math.cos(a) * 0.62, y + 0.42, s.z + Math.sin(a) * 0.62, s.x + Math.cos(b) * 0.62, y + 0.42, s.z + Math.sin(b) * 0.62, 6, e.t);
        k.glow(s.x + Math.cos(a) * 0.62, y + 0.42, s.z + Math.sin(a) * 0.62, 0.3, 0xffe8a3, e.life * (0.3 + 0.7 * e.night));
      }
      crowd(e, 26, s.x, y, s.z, 0.38, 0.38, WALK, NaN, NaN, 2);
      e.by = y + 1.4;
    },
  },

  drumming_circle: {
    icon: Drum,
    sound: "drums",
    draw(e) {
      const { k, s } = e;
      const y = s.ground;
      const beat = frac(e.t * 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const x = s.x + Math.cos(a) * 0.45;
        const z = s.z + Math.sin(a) * 0.45;
        const yaw = Math.atan2(Math.sin(a), -Math.cos(a));
        person(k, x, y, z, yaw, ASO[i % 2 ? 0 : 1], SKINS[i % 7], i % 3 ? STAND : DANCE, e.t, i, e.pop);
        k.put(CYL, x - Math.cos(a) * 0.08, y + 0.08, z - Math.sin(a) * 0.08, 0.08 * e.pop, 0.16 * e.pop, 0.08 * e.pop, 0, 0x8a5a2b);
        k.put(CYL, x - Math.cos(a) * 0.08, y + 0.165 * e.pop, z - Math.sin(a) * 0.08, 0.075 * e.pop, 0.01, 0.075 * e.pop, 0, 0xf1e3c8);
      }
      person(k, s.x, y, s.z, e.t, 0xe64980, SKINS[3], DANCE, e.t * 1.3, 0, e.pop * 1.15);
      k.card(1, "ring", s.x, y + 0.01, s.z, 0.6 + beat * 0.9, 0.6 + beat * 0.9, FLAT, 0, 0xffd43b, e.life * (1 - beat));
      k.card(1, "glow", s.x, y + 0.01, s.z, 1.2, 1.2, FLAT, 0, 0xff922b, e.life * (0.3 + 0.3 * (1 - beat)));
      crowd(e, 16, s.x, y, s.z, 0.8, 0.8, CHEER, s.x, s.z, 6);
      e.by = y + 1.4;
    },
  },

  tower_light_show: {
    icon: Sparkles,
    sound: "chime",
    draw(e) {
      const { k, s } = e;
      const hw = s.w > 1 ? 0.5 : 0.36;
      const n = Math.max(4, Math.floor(s.top / 0.35));
      for (let f = 0; f < 4; f++) {
        const nx = f === 0 ? 1 : f === 1 ? -1 : 0;
        const nz = f === 2 ? 1 : f === 3 ? -1 : 0;
        for (let j = 0; j < n; j++) {
          const y = 0.25 + (j + 0.5) * ((s.top - 0.3) / n);
          const c = PARTY[(j + f + Math.floor(e.t * 3 - y)) % PARTY.length];
          k.put(GBOX, s.x + nx * hw, y, s.z + nz * hw, nx ? 0.02 : hw * 1.9, 0.06, nz ? 0.02 : hw * 1.9, 0, c);
        }
      }
      searchlights(k, s.x, s.top + 0.05, s.z, 5, 9, e.t, PARTY, e.life * (0.4 + 0.6 * e.night), 0.55, 0.9);
      k.glow(s.x, s.top + 0.2, s.z, 2.5, PARTY[Math.floor(e.t * 2) % 8], e.life * 0.6);
      sparkles(k, s.x, s.top + 0.8, s.z, 1.2, 0.6, 1.2, e.t, e.id, 0xffffff, e.life, 20, 0.1);
      e.by = s.top + 1.6;
    },
  },

  // ---------------------------------------------------------------- transport
  air_show: {
    icon: Zap,
    sound: "jet",
    draw(e) {
      const { k, s } = e;
      const cy = Math.max(s.top, 2) + 4;
      const R = 5;
      const smokeCols = [0xff4d4d, 0xffffff, 0x2f9e44, 0xffffff, 0x4dabf7];
      // Five jets in a V, round and round, trailing coloured smoke.
      for (let j = 0; j < 5; j++) {
        const back = Math.ceil(j / 2) * 0.35;
        const lat = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.35;
        for (let i = 0; i < 26; i++) {
          const tt = e.t - i * 0.12;
          const a = tt * 0.55 - back / R;
          const r = R + lat;
          const x = s.x + Math.cos(a) * r;
          const z = s.z + Math.sin(a) * r;
          const y = cy + Math.sin(tt * 0.55 * 2) * 1.2;
          if (i === 0) {
            k.slot[0] = 0xdee2e6;
            k.slot[1] = smokeCols[j];
            k.root(x, y, z, -a - Math.PI / 2, 1.5 * e.pop, Math.cos(tt * 1.1) * 0.3, -0.45);
            k.model(JET, e.t);
          } else k.puff(x, y, z, 0.25 + i * 0.03, smokeCols[j], e.life * (1 - i / 26) * 0.8);
        }
      }
      crowd(e, 12, s.fx, 0.065, s.fz, 0.4, 0.4, CHEER, s.x, s.z);
      e.by = cy + 2.4;
    },
  },

  balloon_race: {
    icon: Wind,
    sound: "wind",
    draw(e) {
      const { k, s } = e;
      const cy = Math.max(s.top, 1.5) + 2.5;
      const cols = [0xe03131, 0xfcc419, 0x1c7ed6, 0x2f9e44, 0x7048e8, 0xf76707];
      let lead = -Infinity;
      for (let i = 0; i < 6; i++) {
        const sp = 0.09 + h1(e.id, i) * 0.04;
        const u = frac(e.t * sp * 0.25 + i * 0.03);
        const x = s.x - 7 + u * 14;
        const z = s.z + (i - 2.5) * 0.9 + Math.sin(e.t * 0.2 + i) * 0.3;
        const y = cy + h1(e.id, i, 2) * 1.5 + Math.sin(e.t * 0.5 + i) * 0.2;
        const g = e.pop * Math.min(1, u * 8, (1 - u) * 8);
        k.slot[0] = cols[i];
        k.slot[1] = cols[(i + 2) % 6];
        k.root(x, y, z, 0, 1.1 * g);
        k.model(BALLOON, e.t);
        if (frac(e.t * 0.5 + i * 0.3) < 0.2) k.glow(x, y + 0.12, z, 0.5, 0xffa31a, e.life);
        if (x > lead) {
          lead = x;
          e.bx = x;
          e.bz = z;
          e.by = y + 1.4;
        }
      }
    },
  },

  cruise_ship: {
    icon: Ship,
    sound: "foghorn",
    draw(e) {
      const { k, s } = e;
      pond(e);
      const sc = waterFit(e, 2) * 1.05;
      const yaw = waterYaw(e);
      const come = smooth(0, 35, e.t);
      const go = smooth(0, 15, e.left);
      const off = (1 - come) * 6 - (1 - go) * 6;
      const ca = Math.cos(yaw);
      const sa = -Math.sin(yaw);
      const x = s.hx + ca * off;
      const z = s.hz + sa * off;
      k.root(x, s.waterY - 0.02, z, yaw, sc * Math.min(1, e.life * 3), 0, Math.sin(e.t * 0.5) * 0.01);
      k.model(CRUISE, e.t);
      for (let i = 0; i < 8; i++) {
        const tw = Math.floor(e.t * 1.5 + i) % 3 === 0;
        k.glow(x + ca * (i - 3.5) * 0.18 * sc, s.waterY + 0.42 * sc, z + sa * (i - 3.5) * 0.18 * sc, 0.25, PARTY[i], e.life * (tw ? 1 : 0.4) * (0.3 + 0.7 * e.night));
      }
      if (come < 1) {
        for (let i = 0; i < 8; i++) {
          const u = frac(e.t * 0.6 + i / 8);
          k.card(0, "splash", x - ca * (0.9 + u * 1.5) * sc, s.waterY + 0.01, z - sa * (0.9 + u * 1.5) * sc, 0.3 + u * 0.4, 0.3 + u * 0.4, FLAT, 0, 0xffffff, e.life * (1 - u) * 0.6);
        }
      }
      smoke(k, x - ca * 0.5 * sc, s.waterY + 0.7 * sc, z - sa * 0.5 * sc, e.t, e.id, 1.6, 0.3, 0xdee2e6, e.life * 0.5, 8);
      crowd(e, 8, s.fx, 0.065, s.fz, 0.3, 0.3, WAVE, x, z);
      e.bx = x;
      e.bz = z;
      e.by = s.waterY + 1.6 * sc;
    },
  },

  stuck_cargo_ship: {
    icon: Ship,
    sound: "foghorn",
    draw(e) {
      const { k, s } = e;
      pond(e);
      const sc = waterFit(e, 2) * 1.05;
      const yaw = waterYaw(e) + 0.5;
      const strain = Math.sin(e.t * 0.6) * 0.03;
      k.root(s.hx, s.waterY - 0.03, s.hz, yaw + strain, sc * e.pop, 0.04, 0.03);
      k.model(CARGO, e.t);
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const tx = s.hx + Math.cos(yaw + Math.PI / 2) * 0.35 * sc * side + Math.cos(yaw) * 0.5 * sc * side;
        const tz = s.hz - Math.sin(yaw + Math.PI / 2) * 0.35 * sc * side - Math.sin(yaw) * 0.5 * sc * side;
        const push = Math.sin(e.t * 1.2 + i) * 0.02;
        k.root(tx + push, s.waterY - 0.01, tz, yaw + Math.PI / 2 * side, 1.4 * e.pop);
        k.model(TUG, e.t);
        for (let j = 0; j < 5; j++) {
          const u = frac(e.t * 1.2 + j / 5);
          k.puff(tx - Math.cos(yaw + Math.PI / 2 * side) * (0.2 + u * 0.4), s.waterY + 0.02, tz + Math.sin(yaw + Math.PI / 2 * side) * (0.2 + u * 0.4), 0.15 + u * 0.2, 0xffffff, e.life * (1 - u) * 0.6);
        }
        smoke(k, tx, s.waterY + 0.3, tz, e.t, e.id + i, 1.2, 0.15, 0x495057, e.life * 0.6, 8);
      }
      flashers(k, s.hx, s.waterY + 0.6 * sc, s.hz, e.t, 0, e.life * 0.6, 0.5);
      e.bx = s.hx;
      e.bz = s.hz;
      e.by = s.waterY + 1.4 * sc;
    },
  },

  free_bus: {
    icon: BusFront,
    sound: "horn",
    draw(e) {
      const { k, s } = e;
      freeBus(k);
      convoy(e, BUSES, 1, 0.55, 0.14, 1.15, undefined);
      if (e.a.x || e.a.z) {
        k.card(0, "free", e.a.x, 0.42, e.a.z, 0.36, 0.36, UPRIGHT, 0, 0xffffff, e.life);
        for (let j = 0; j < 3; j++) {
          k.slot[0] = PARTY[j * 2];
          k.root(e.a.x + (j - 1) * 0.12, 0.25, e.a.z, 0, 0.9 * e.pop, (j - 1) * 0.3);
          k.model(PARTY_BALLOON, e.t);
        }
        e.bx = e.a.x;
        e.bz = e.a.z;
      }
      // A queue at the stop, cheering.
      along(s, s.len * 0.5, e.b, 0.42);
      const ca = Math.cos(e.b.yaw);
      const sa = -Math.sin(e.b.yaw);
      k.put(BOX, e.b.x, 0.25, e.b.z, 0.02, 0.36 * e.pop, 0.02, 0, 0x868e96);
      k.put(BOX, e.b.x, 0.45 * e.pop, e.b.z, 0.12, 0.08, 0.02, e.b.yaw, 0x2f9e44);
      queue(e, 8, e.b.x + ca * 0.1, 0.065, e.b.z + sa * 0.1, e.b.x + ca * 1.3, e.b.z + sa * 1.3, 4);
      e.by = 1.4;
    },
  },

  emergency_landing: {
    icon: PlaneLanding,
    sound: "siren",
    draw(e) {
      const { k, s } = e;
      const yaw = s.axis === 1 ? -Math.PI / 2 : 0;
      const ca = Math.cos(yaw);
      const sa = -Math.sin(yaw);
      // Comes in low and smoking over the first 25 s, touches down, rolls to a stop.
      const land = smooth(0, 25, e.t);
      const along0 = -8 + land * 8.6;
      const h = Math.max(0, (1 - land) * 5 - 0.2) + 0.18;
      const x = s.hx + ca * along0;
      const z = s.hz + sa * along0;
      const y = s.ground + h;
      k.root(x, y, z, yaw, 1.15, 0, (1 - land) * 0.12);
      k.model(PLANE, e.t);
      smoke(k, x - ca * 0.1 + sa * 0.25, y - 0.05, z - sa * 0.1 - ca * 0.25, e.t, e.id, 2.5, 0.35, 0x343a40, e.life, 16, -ca * 0.5, -sa * 0.5);
      fire(k, x - ca * 0.1 + sa * 0.25, y - 0.06, z - sa * 0.1 - ca * 0.25, 0.18, e.t, e.id, e.life * (1 - land * 0.7), 10);
      for (let i = 0; i < 2; i++) {
        const fx = s.hx + ca * (0.4 + i * 0.6) - sa * (0.5 + i * 0.1);
        const fz = s.hz + sa * (0.4 + i * 0.6) + ca * (0.5 + i * 0.1);
        k.root(fx, s.ground, fz, yaw + Math.PI / 2, 1.05 * e.pop);
        k.model(FIRE_ENGINE, e.t);
        flashers(k, fx, s.ground + 0.32, fz, e.t, i, e.life);
        if (land > 0.95) waterArc(k, fx, s.ground + 0.25, fz, x, y + 0.05, z, 0.4, e.t, e.id + i, e.life, 20, 0xffffff);
      }
      e.bx = x;
      e.bz = z;
      e.by = y + 1.4;
    },
  },

  train_delay: {
    icon: TrainFront,
    sound: "crowd",
    draw(e) {
      const { k, s } = e;
      const y = s.hy > 0.5 ? s.hy : s.ground;
      const ax = s.axis === 1 ? 0 : 1;
      const az = 1 - ax;
      const grow = 0.4 + 0.6 * smooth(0, 120, e.t);
      crowd(e, Math.round(34 * grow), s.x + az * 0.15, y, s.z + ax * 0.15, 0.9 * ax + 0.12, 0.9 * az + 0.12, STAND, s.x - az * 0.4, s.z - ax * 0.4);
      k.put(BOX, s.x, y + 0.35, s.z - ax * 0.05, 0.02, 0.3, 0.02, 0, 0x868e96);
      k.card(0, "delayed", s.x, y + 0.6, s.z - ax * 0.05, 0.6, 0.6, UPRIGHT, 0, 0xffffff, e.life);
      k.glow(s.x, y + 0.6, s.z, 0.8, 0xffb020, e.life * (0.3 + 0.2 * Math.sin(e.t * 3)));
      e.by = y + 1.3;
    },
  },

  bike_race: {
    icon: Bike,
    sound: "cheer",
    draw(e) {
      const { s } = e;
      convoy(e, BIKES, 0.22, 1.5, 0, 1.25, bikeSlots);
      lineRoute(e, 12, CHEER, 6);
      along(s, s.len * 0.5, e.b, 0);
      e.bx = e.b.x;
      e.bz = e.b.z;
      e.by = 1.3;
    },
  },

  taxi_strike: {
    icon: CarFront,
    sound: "horn",
    draw(e) {
      const { k, s } = e;
      // A line of yellow taxis parked along the kerb, drivers with placards.
      for (let i = 0; i < 6; i++) {
        along(s, s.len * 0.5 + (i - 2.5) * 0.4, e.b, 0.15);
        k.slot[0] = 0xffd43b;
        k.slot[1] = 0xe9f2fb;
        k.root(e.b.x, e.b.y, e.b.z, e.b.yaw, 1.1 * e.pop);
        k.model(CAR, 0);
        k.rput(GBOX, -0.02, 0.17, 0, 0.05, 0.025, 0.09, 0xfff3a0);
        if (i % 2 === 0) {
          along(s, s.len * 0.5 + (i - 2.5) * 0.4, e.b, 0.42);
          person(k, e.b.x, 0.07, e.b.z, e.b.yaw - Math.PI / 2, 0x495057, SKINS[i], STAND, e.t, i, e.pop);
          signpost(k, "strike", e.b.x + 0.04, 0.12, e.b.z, 0.22, e.life);
        }
      }
      along(s, s.len * 0.5, e.b, 0);
      e.bx = e.b.x;
      e.bz = e.b.z;
      e.by = 1.4;
    },
  },

  royal_motorcade: {
    icon: Crown,
    sound: "horn",
    draw(e) {
      const { k, s } = e;
      convoy(e, ROYAL, 0.6, 0.6, 0, 1.15, royalSlots);
      const span = s.len + 6 * 0.6 + 1;
      const head = ((e.t * 0.6) % span) - 0.5;
      const d = head - 3 * 0.6;
      if (d > 0 && d < s.len) {
        along(s, d, e.b, 0);
        sparkles(k, e.b.x, 0.3, e.b.z, 0.3, 0.15, 0.3, e.t, e.id, 0xffe066, e.life, 14, 0.08);
        k.glow(e.b.x, 0.3, e.b.z, 0.9, 0xffd43b, e.life * 0.5);
        e.bx = e.b.x;
        e.bz = e.b.z;
      }
      for (let i = 0; i < 2; i++) {
        const dd = head - i * 0.6;
        if (dd < 0 || dd > s.len) continue;
        along(s, dd, e.b, 0);
        flashers(k, e.b.x, 0.3, e.b.z, e.t, i, e.life, 0.5);
      }
      lineRoute(e, 14, WAVE, 7);
      e.by = 1.3;
    },
  },
};
