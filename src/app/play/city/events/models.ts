// Little models for the world events, put together from the kit's shared primitives (boxes,
// balls, cylinders, cones, rings and glowing bits), so drawing a fire engine or a whale costs
// no extra draw calls. Built facing +x, standing on y = 0, in city units (a tile is 1 across;
// a car is about a third of a tile long). Colours below 8 are slots, filled in when drawn
// (k.slot[0] = body colour...), so one model comes in many colours.

import { BALL, BOX, CONE, CYL, GBALL, GBOX, P, TORUS, type Model } from "./kit";

const S0 = 0;
const S1 = 1;
const S2 = 2;
const GLASS = 0xbfd9ee;
const TYRE = 0x25282d;
const RED = 0xff3b30;
const BLUE = 0x2f6bff;
const AMBER = 0xffa31a;
const HALF = Math.PI / 2;

function wheels(len: number, wid: number, r = 0.03): Model {
  const out: Model = [];
  for (const x of [len * 0.32, -len * 0.32]) for (const z of [wid / 2, -wid / 2]) out.push(P(CYL, x, r, z, r * 2, 0.025, r * 2, TYRE, { rx: HALF }));
  return out;
}

/** A car: slot 0 body, slot 1 roof. */
export const CAR: Model = [
  P(BOX, 0, 0.065, 0, 0.36, 0.07, 0.17, S0),
  P(BOX, -0.02, 0.125, 0, 0.2, 0.06, 0.15, S1),
  P(BOX, 0.07, 0.125, 0, 0.012, 0.05, 0.14, GLASS),
  P(GBOX, 0.181, 0.07, 0.055, 0.006, 0.02, 0.03, 0xfff6d5),
  P(GBOX, 0.181, 0.07, -0.055, 0.006, 0.02, 0.03, 0xfff6d5),
  P(GBOX, -0.181, 0.07, 0.055, 0.006, 0.02, 0.03, 0xd61f1f),
  P(GBOX, -0.181, 0.07, -0.055, 0.006, 0.02, 0.03, 0xd61f1f),
  ...wheels(0.36, 0.17),
];

/** A police car: slot 0 body, slot 1 doors / roof, with a flashing light bar. */
export const POLICE: Model = [
  ...CAR,
  P(BOX, 0, 0.07, 0, 0.14, 0.05, 0.172, S1),
  P(GBOX, -0.02, 0.163, 0.035, 0.035, 0.022, 0.05, RED, { alt: 0x40100c, hz: 3 }),
  P(GBOX, -0.02, 0.163, -0.035, 0.035, 0.022, 0.05, BLUE, { alt: 0x0c1a40, hz: 3, phase: 1 }),
];

/** An ambulance: white van, red stripe, blue lights. */
export const AMBULANCE: Model = [
  P(BOX, -0.03, 0.12, 0, 0.36, 0.17, 0.19, 0xffffff),
  P(BOX, 0.17, 0.08, 0, 0.1, 0.09, 0.18, 0xffffff),
  P(BOX, 0.2, 0.135, 0, 0.04, 0.05, 0.16, GLASS),
  P(BOX, -0.03, 0.12, 0, 0.365, 0.03, 0.195, 0xe03131),
  P(BOX, -0.05, 0.207, 0, 0.12, 0.006, 0.04, 0xe03131),
  P(BOX, -0.05, 0.207, 0, 0.04, 0.006, 0.12, 0xe03131),
  P(GBOX, 0.13, 0.215, 0.07, 0.035, 0.025, 0.04, BLUE, { alt: 0x0c1a40, hz: 3.5 }),
  P(GBOX, 0.13, 0.215, -0.07, 0.035, 0.025, 0.04, RED, { alt: 0x40100c, hz: 3.5, phase: 1 }),
  P(GBOX, -0.2, 0.2, 0.07, 0.02, 0.02, 0.03, BLUE, { alt: 0x0c1a40, hz: 3.5, phase: 1 }),
  P(GBOX, -0.2, 0.2, -0.07, 0.02, 0.02, 0.03, RED, { alt: 0x40100c, hz: 3.5 }),
  ...wheels(0.42, 0.18),
];

/** A fire engine: long and red, a silver ladder on top, lights flashing. */
export const FIRE_ENGINE: Model = [
  P(BOX, -0.05, 0.12, 0, 0.46, 0.15, 0.2, 0xd7261e),
  P(BOX, 0.24, 0.13, 0, 0.13, 0.17, 0.2, 0xd7261e),
  P(BOX, 0.29, 0.16, 0, 0.04, 0.07, 0.18, GLASS),
  P(BOX, -0.05, 0.08, 0, 0.47, 0.025, 0.205, 0xf1f3f5),
  P(BOX, -0.05, 0.215, 0.05, 0.42, 0.015, 0.015, 0xdee2e6),
  P(BOX, -0.05, 0.215, -0.05, 0.42, 0.015, 0.015, 0xdee2e6),
  ...[-0.22, -0.14, -0.06, 0.02, 0.1].map((x) => P(BOX, x, 0.215, 0, 0.012, 0.012, 0.1, 0xdee2e6)),
  P(GBOX, 0.24, 0.225, 0.07, 0.04, 0.025, 0.045, RED, { alt: 0x40100c, hz: 3 }),
  P(GBOX, 0.24, 0.225, -0.07, 0.04, 0.025, 0.045, BLUE, { alt: 0x0c1a40, hz: 3, phase: 1 }),
  ...wheels(0.56, 0.2, 0.035),
  P(CYL, -0.1, 0.035, 0.1, 0.07, 0.025, 0.07, TYRE, { rx: HALF }),
  P(CYL, -0.1, 0.035, -0.1, 0.07, 0.025, 0.07, TYRE, { rx: HALF }),
];

/** A van: slot 0 body (getaway vans, gas company, engineers, prison van). */
export const VAN: Model = [
  P(BOX, -0.03, 0.115, 0, 0.32, 0.16, 0.18, S0),
  P(BOX, 0.16, 0.085, 0, 0.1, 0.1, 0.175, S0),
  P(BOX, 0.18, 0.14, 0, 0.06, 0.05, 0.16, GLASS),
  P(BOX, -0.03, 0.13, 0, 0.325, 0.025, 0.185, S1),
  P(GBOX, 0.2, 0.08, 0.06, 0.006, 0.02, 0.03, 0xfff6d5),
  P(GBOX, 0.2, 0.08, -0.06, 0.006, 0.02, 0.03, 0xfff6d5),
  ...wheels(0.38, 0.18),
];

/** Flashing amber beacons, to draw on top of a van (hazards, road works, engineers). */
export const BEACON: Model = [
  P(GBOX, 0.0, 0.205, 0.05, 0.03, 0.025, 0.03, AMBER, { alt: 0x3a2400, hz: 2.5 }),
  P(GBOX, 0.0, 0.205, -0.05, 0.03, 0.025, 0.03, AMBER, { alt: 0x3a2400, hz: 2.5, phase: 1 }),
];

/** A lorry: slot 0 cab, slot 1 load (money truck, water tanker uses TANKER). */
export const TRUCK: Model = [
  P(BOX, 0.2, 0.12, 0, 0.13, 0.16, 0.19, S0),
  P(BOX, 0.25, 0.15, 0, 0.04, 0.06, 0.17, GLASS),
  P(BOX, -0.08, 0.14, 0, 0.4, 0.2, 0.2, S1),
  P(BOX, 0.02, 0.05, 0, 0.6, 0.03, 0.15, 0x343a40),
  ...wheels(0.56, 0.2, 0.035),
];

/** A water tanker: a blue tank on a lorry. */
export const TANKER: Model = [
  P(BOX, 0.2, 0.12, 0, 0.13, 0.16, 0.19, 0xf1f3f5),
  P(BOX, 0.25, 0.15, 0, 0.04, 0.06, 0.17, GLASS),
  P(CYL, -0.08, 0.15, 0, 0.17, 0.4, 0.17, 0x1c7ed6, { rz: HALF }),
  P(BOX, 0.02, 0.05, 0, 0.6, 0.03, 0.15, 0x343a40),
  P(CYL, -0.28, 0.08, 0.06, 0.02, 0.05, 0.02, 0x868e96, { rz: HALF }),
  ...wheels(0.56, 0.2, 0.035),
];

/** A bus: slot 0 body, with lit windows. */
export const BUS: Model = [
  P(BOX, 0, 0.12, 0, 0.66, 0.18, 0.2, S0),
  P(BOX, 0, 0.17, 0, 0.62, 0.055, 0.205, GLASS),
  P(BOX, 0.331, 0.15, 0, 0.004, 0.09, 0.17, GLASS),
  P(BOX, 0, 0.215, 0, 0.6, 0.012, 0.18, S1),
  ...wheels(0.66, 0.2, 0.035),
];

/** A long black car (royal motorcade, celebrities), little flags on the front. */
export const LIMO: Model = [
  P(BOX, 0, 0.065, 0, 0.56, 0.075, 0.18, S0),
  P(BOX, -0.04, 0.125, 0, 0.36, 0.055, 0.16, 0x2b3038),
  P(BOX, -0.04, 0.125, 0, 0.365, 0.03, 0.165, GLASS),
  P(BOX, 0, 0.105, 0, 0.565, 0.006, 0.185, 0xd4af37),
  P(BOX, 0.25, 0.14, 0.07, 0.003, 0.09, 0.003, 0xdee2e6),
  P(BOX, 0.25, 0.14, -0.07, 0.003, 0.09, 0.003, 0xdee2e6),
  P(BOX, 0.23, 0.17, 0.07, 0.04, 0.03, 0.002, S1),
  P(BOX, 0.23, 0.17, -0.07, 0.04, 0.03, 0.002, S1),
  ...wheels(0.56, 0.18),
];

/** A motorbike with its rider (outriders, the marathon's lead bike). Slot 0 bike, slot 1 rider. */
export const MOTORBIKE: Model = [
  P(BOX, 0, 0.06, 0, 0.16, 0.05, 0.04, S0),
  P(CYL, 0.07, 0.03, 0, 0.06, 0.015, 0.06, TYRE, { rx: HALF }),
  P(CYL, -0.07, 0.03, 0, 0.06, 0.015, 0.06, TYRE, { rx: HALF }),
  P(BOX, -0.01, 0.12, 0, 0.05, 0.08, 0.05, S1),
  P(BALL, -0.005, 0.18, 0, 0.045, 0.045, 0.045, 0xffffff),
];

/** A bicycle with its rider (slot 0 jersey). */
export const BIKE: Model = [
  P(TORUS, 0.055, 0.035, 0, 0.07, 0.07, 0.07, TYRE),
  P(TORUS, -0.055, 0.035, 0, 0.07, 0.07, 0.07, TYRE),
  P(BOX, 0, 0.055, 0, 0.11, 0.008, 0.008, 0xdee2e6),
  P(BOX, -0.01, 0.12, 0, 0.045, 0.07, 0.04, S0, { rz: -0.6 }),
  P(BALL, 0.02, 0.16, 0, 0.04, 0.04, 0.04, 0xf1c27d),
  P(BALL, 0.02, 0.175, 0, 0.045, 0.025, 0.045, S1),
  P(BOX, -0.005, 0.065, 0.014, 0.012, 0.06, 0.012, 0x343a40, { swing: 0.8, swingHz: 2.2 }),
  P(BOX, -0.005, 0.065, -0.014, 0.012, 0.06, 0.012, 0x343a40, { swing: 0.8, swingHz: 2.2, phase: Math.PI }),
];

/** A railway engine (slot 0 body, slot 1 stripe). */
export const LOCO: Model = [
  P(BOX, 0, 0.13, 0, 0.62, 0.2, 0.2, S0),
  P(BOX, 0.2, 0.25, 0, 0.18, 0.06, 0.19, S0),
  P(BOX, 0.29, 0.2, 0, 0.04, 0.07, 0.17, GLASS),
  P(BOX, 0, 0.1, 0, 0.625, 0.04, 0.205, S1),
  P(BOX, 0, 0.03, 0, 0.56, 0.05, 0.16, 0x343a40),
  P(GBOX, 0.312, 0.12, 0, 0.006, 0.03, 0.05, 0xfff6d5),
];

/** A carriage (slot 0 body). */
export const COACH: Model = [
  P(BOX, 0, 0.13, 0, 0.62, 0.2, 0.2, S0),
  P(BOX, 0, 0.16, 0, 0.6, 0.06, 0.205, GLASS),
  P(BOX, 0, 0.03, 0, 0.56, 0.05, 0.16, 0x343a40),
];

// ---------------------------------------------------------------- animals

/** A cow (black and white). Legs swing as it walks. */
export const COW: Model = [
  P(BOX, 0, 0.11, 0, 0.2, 0.09, 0.1, 0xf8f9fa),
  P(BOX, 0.03, 0.135, 0.03, 0.07, 0.045, 0.045, 0x212529),
  P(BOX, -0.06, 0.12, -0.03, 0.05, 0.06, 0.045, 0x212529),
  P(BOX, 0.12, 0.14, 0, 0.06, 0.06, 0.06, 0xf8f9fa),
  P(BOX, 0.152, 0.125, 0, 0.012, 0.03, 0.045, 0xf4a6b8),
  P(BOX, 0.11, 0.18, 0, 0.012, 0.015, 0.09, 0xe9ecef),
  ...[0.07, -0.07].flatMap((x, i) => [0.035, -0.035].map((z, j) => P(BOX, x, 0.035, z, 0.022, 0.07, 0.022, 0xf8f9fa, { swing: 0.5, swingHz: 1.6, phase: (i + j) % 2 ? Math.PI : 0 }))),
  P(BOX, -0.105, 0.1, 0, 0.01, 0.07, 0.01, 0x212529, { rz: 0.4, swing: 0.4, swingHz: 1.2 }),
];

/** An elephant (circus grey, with a red-and-gold blanket). */
export const ELEPHANT: Model = [
  P(BALL, 0, 0.24, 0, 0.42, 0.3, 0.28, 0x9aa1a8),
  P(BOX, 0, 0.36, 0, 0.22, 0.04, 0.29, 0xc92a2a),
  P(BOX, 0, 0.37, 0, 0.1, 0.045, 0.295, 0xfcc419),
  P(BALL, 0.21, 0.3, 0, 0.2, 0.19, 0.18, 0x9aa1a8),
  P(BALL, 0.18, 0.3, 0.1, 0.05, 0.17, 0.14, 0x8a9197, { swing: 0.3, swingHz: 0.8 }),
  P(BALL, 0.18, 0.3, -0.1, 0.05, 0.17, 0.14, 0x8a9197, { swing: 0.3, swingHz: 0.8, phase: 1 }),
  P(CYL, 0.31, 0.19, 0, 0.045, 0.18, 0.045, 0x9aa1a8, { rz: -0.25, swing: 0.35, swingHz: 0.7 }),
  P(CONE, 0.3, 0.25, 0.04, 0.02, 0.07, 0.02, 0xf8f9fa, { rz: -1.9 }),
  P(CONE, 0.3, 0.25, -0.04, 0.02, 0.07, 0.02, 0xf8f9fa, { rz: -1.9 }),
  ...[0.12, -0.12].flatMap((x, i) => [0.08, -0.08].map((z, j) => P(CYL, x, 0.08, z, 0.08, 0.16, 0.08, 0x9aa1a8, { swing: 0.35, swingHz: 0.9, phase: (i + j) % 2 ? Math.PI : 0 }))),
  P(CYL, -0.22, 0.24, 0, 0.012, 0.12, 0.012, 0x6c737a, { rz: 0.5, swing: 0.5, swingHz: 1.4 }),
];

/** A dog (slot 0 coat). The tail wags. */
export const DOG: Model = [
  P(BOX, 0, 0.07, 0, 0.12, 0.05, 0.05, S0),
  P(BOX, 0.07, 0.1, 0, 0.05, 0.045, 0.045, S0),
  P(BOX, 0.1, 0.09, 0, 0.03, 0.02, 0.025, 0x343a40),
  P(BOX, 0.065, 0.125, 0.018, 0.015, 0.025, 0.01, 0x5c4033),
  P(BOX, 0.065, 0.125, -0.018, 0.015, 0.025, 0.01, 0x5c4033),
  ...[0.04, -0.04].flatMap((x, i) => [0.018, -0.018].map((z, j) => P(BOX, x, 0.025, z, 0.014, 0.05, 0.014, S0, { swing: 0.5, swingHz: 2.4, phase: (i + j) % 2 ? Math.PI : 0 }))),
  P(BOX, -0.07, 0.1, 0, 0.01, 0.05, 0.01, S0, { rz: 0.7, rx: 0, swing: 0.9, swingHz: 5 }),
  P(BOX, 0.03, 0.085, 0, 0.012, 0.012, 0.055, 0xe03131),
];

/** A monkey (brown, long curly tail). */
export const MONKEY: Model = [
  P(BALL, 0, 0.07, 0, 0.07, 0.08, 0.06, 0x7a4f2a),
  P(BALL, 0.02, 0.13, 0, 0.055, 0.05, 0.05, 0x7a4f2a),
  P(BALL, 0.04, 0.125, 0, 0.03, 0.03, 0.035, 0xe9c9a0),
  P(BOX, 0.03, 0.08, 0.035, 0.012, 0.06, 0.012, 0x7a4f2a, { swing: 1, swingHz: 2 }),
  P(BOX, 0.03, 0.08, -0.035, 0.012, 0.06, 0.012, 0x7a4f2a, { swing: 1, swingHz: 2, phase: Math.PI }),
  P(TORUS, -0.05, 0.1, 0, 0.06, 0.06, 0.04, 0x7a4f2a, { rz: 0.4, swing: 0.4, swingHz: 1.5 }),
];

/** A giraffe (escaped from the zoo). */
export const GIRAFFE: Model = [
  P(BOX, 0, 0.26, 0, 0.26, 0.13, 0.12, 0xf2b84b),
  P(BOX, 0.05, 0.28, 0.062, 0.06, 0.05, 0.004, 0x9c5b1e),
  P(BOX, -0.06, 0.25, -0.062, 0.05, 0.05, 0.004, 0x9c5b1e),
  P(BOX, 0.17, 0.44, 0, 0.05, 0.36, 0.05, 0xf2b84b, { rz: -0.45 }),
  P(BOX, 0.26, 0.6, 0, 0.1, 0.05, 0.05, 0xf2b84b),
  P(BOX, 0.24, 0.64, 0, 0.012, 0.04, 0.03, 0x9c5b1e),
  ...[0.09, -0.09].flatMap((x, i) => [0.04, -0.04].map((z, j) => P(BOX, x, 0.1, z, 0.025, 0.2, 0.025, 0xf2b84b, { swing: 0.5, swingHz: 1.8, phase: (i + j) % 2 ? Math.PI : 0 }))),
  P(BOX, -0.14, 0.26, 0, 0.01, 0.1, 0.01, 0x9c5b1e, { rz: 0.4, swing: 0.5, swingHz: 1.4 }),
];

/** A cat (orange). */
export const CAT: Model = [
  P(BOX, 0, 0.03, 0, 0.06, 0.03, 0.03, 0xf08c00),
  P(BOX, 0.035, 0.055, 0, 0.03, 0.03, 0.03, 0xf08c00),
  P(CONE, 0.035, 0.078, 0.009, 0.012, 0.016, 0.012, 0xf08c00),
  P(CONE, 0.035, 0.078, -0.009, 0.012, 0.016, 0.012, 0xf08c00),
  P(BOX, -0.04, 0.05, 0, 0.006, 0.05, 0.006, 0xf08c00, { rz: 0.4, swing: 0.6, swingHz: 1.5 }),
];

// ---------------------------------------------------------------- in the air

/** A helicopter (slot 0 body); rotors spin. */
export const HELI: Model = [
  P(BALL, 0, 0.14, 0, 0.32, 0.17, 0.17, S0),
  P(BALL, 0.09, 0.16, 0, 0.12, 0.1, 0.13, GLASS),
  P(BOX, -0.25, 0.16, 0, 0.26, 0.035, 0.035, S0),
  P(BOX, -0.38, 0.2, 0, 0.05, 0.09, 0.012, S0),
  P(BOX, -0.38, 0.22, 0.012, 0.11, 0.012, 0.004, 0x343a40, { spin: 0 }),
  P(BOX, 0, 0.245, 0, 0.62, 0.006, 0.028, 0x343a40, { spin: 26 }),
  P(BOX, 0, 0.245, 0, 0.028, 0.006, 0.62, 0x343a40, { spin: 26 }),
  P(CYL, 0, 0.23, 0, 0.02, 0.03, 0.02, 0x343a40),
  P(BOX, 0, 0.03, 0.06, 0.26, 0.012, 0.012, 0x343a40),
  P(BOX, 0, 0.03, -0.06, 0.26, 0.012, 0.012, 0x343a40),
  P(GBOX, 0, 0.065, 0, 0.03, 0.01, 0.03, RED, { alt: 0x200000, hz: 1.2 }),
];

/** A jet fighter (slot 0 body, slot 1 fins). */
export const JET: Model = [
  P(CYL, 0, 0, 0, 0.07, 0.5, 0.07, S0, { rz: HALF }),
  P(CONE, 0.3, 0, 0, 0.07, 0.12, 0.07, S0, { rz: -HALF }),
  P(BALL, 0.12, 0.03, 0, 0.12, 0.05, 0.05, GLASS),
  P(BOX, -0.02, 0, 0, 0.16, 0.012, 0.42, S0),
  P(BOX, -0.2, 0.06, 0, 0.1, 0.1, 0.012, S1),
  P(BOX, -0.21, 0, 0, 0.08, 0.01, 0.16, S1),
  P(GBALL, -0.26, 0, 0, 0.05, 0.05, 0.05, 0xffb35c),
];

/** An airliner (white, blue tail). */
export const PLANE: Model = [
  P(CYL, 0, 0, 0, 0.16, 1.1, 0.16, 0xf8f9fa, { rz: HALF }),
  P(BALL, 0.55, 0, 0, 0.16, 0.16, 0.16, 0xf8f9fa),
  P(BOX, 0.05, -0.02, 0, 0.26, 0.02, 1.1, 0xe9ecef),
  P(BOX, -0.48, 0.12, 0, 0.18, 0.22, 0.02, 0x1c7ed6),
  P(BOX, -0.5, 0.02, 0, 0.12, 0.015, 0.36, 0xe9ecef),
  P(CYL, 0.08, -0.07, 0.24, 0.07, 0.14, 0.07, 0xadb5bd, { rz: HALF }),
  P(CYL, 0.08, -0.07, -0.24, 0.07, 0.14, 0.07, 0xadb5bd, { rz: HALF }),
  P(BOX, 0, 0.03, 0, 1.0, 0.025, 0.165, 0x1c7ed6),
  P(GBOX, 0.05, -0.02, 0.55, 0.02, 0.02, 0.02, 0x40ff60, { alt: 0x002000, hz: 1 }),
  P(GBOX, 0.05, -0.02, -0.55, 0.02, 0.02, 0.02, RED, { alt: 0x200000, hz: 1 }),
];

/** A flying saucer (the ring of lights turns). */
export const UFO: Model = [
  P(BALL, 0, 0, 0, 1.6, 0.32, 1.6, 0xb8c2cc),
  P(TORUS, 0, 0, 0, 1.62, 1.62, 0.5, 0x8a96a3, { rx: HALF }),
  P(BALL, 0, 0.14, 0, 0.72, 0.5, 0.72, 0x7ff0d8),
  P(GBALL, 0, -0.15, 0, 0.5, 0.12, 0.5, 0xa8ffe8),
  ...Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2;
    return P(GBALL, Math.cos(a) * 0.72, -0.02, Math.sin(a) * 0.72, 0.09, 0.09, 0.09, [0xff4d6d, 0xffd43b, 0x4dabf7, 0x69db7c][k % 4], { alt: 0x202020, hz: 2, phase: k });
  }),
];

/** A hot-air balloon (slot 0 and slot 1 stripes). */
export const BALLOON: Model = [
  P(BALL, 0, 0.62, 0, 0.8, 0.86, 0.8, S0),
  P(BALL, 0, 0.62, 0, 0.82, 0.3, 0.82, S1),
  P(BALL, 0, 0.62, 0, 0.3, 0.875, 0.82, S1),
  P(CONE, 0, 0.18, 0, 0.42, 0.3, 0.42, S0, { rx: Math.PI }),
  P(BOX, 0, 0.0, 0, 0.16, 0.1, 0.16, 0x8a5a2b),
  P(BOX, 0.07, 0.08, 0.07, 0.006, 0.12, 0.006, 0x5c4033),
  P(BOX, -0.07, 0.08, -0.07, 0.006, 0.12, 0.006, 0x5c4033),
  P(GBALL, 0, 0.12, 0, 0.05, 0.07, 0.05, 0xffb020, { alt: 0xff6b00, hz: 4 }),
];

/** A party balloon on a string (slot 0 colour). */
export const PARTY_BALLOON: Model = [
  P(BALL, 0, 0.5, 0, 0.12, 0.14, 0.12, S0),
  P(CONE, 0, 0.425, 0, 0.025, 0.02, 0.025, S0, { rx: Math.PI }),
  P(BOX, 0, 0.21, 0, 0.003, 0.42, 0.003, 0xf1f3f5),
];

// ---------------------------------------------------------------- on the water

/** A pirate ship: dark hull, black sails. */
export const PIRATE: Model = [
  P(BOX, 0, 0.1, 0, 1.0, 0.18, 0.3, 0x5c3a1e),
  P(CONE, 0.55, 0.1, 0, 0.3, 0.18, 0.3, 0x5c3a1e, { rz: -HALF }),
  P(BOX, -0.42, 0.24, 0, 0.22, 0.14, 0.3, 0x4a2e17),
  P(BOX, 0, 0.19, 0, 1.0, 0.02, 0.31, 0xc9a76f),
  P(CYL, 0.18, 0.55, 0, 0.03, 0.75, 0.03, 0x3b2a1a),
  P(CYL, -0.18, 0.5, 0, 0.03, 0.65, 0.03, 0x3b2a1a),
  P(BOX, 0.18, 0.55, 0, 0.02, 0.36, 0.4, 0x1c1c22),
  P(BOX, 0.18, 0.82, 0, 0.02, 0.16, 0.3, 0x1c1c22),
  P(BOX, -0.18, 0.48, 0, 0.02, 0.3, 0.36, 0x1c1c22),
  P(CYL, 0.68, 0.24, 0, 0.012, 0.3, 0.012, 0x3b2a1a, { rz: -1.1 }),
  ...[-0.25, 0, 0.25].map((x) => P(CYL, x, 0.12, 0.16, 0.035, 0.08, 0.035, 0x212529, { rx: HALF })),
];

/** A cruise ship: long white hull, stacked decks, red funnel, glowing windows. */
export const CRUISE: Model = [
  P(BOX, 0, 0.1, 0, 1.7, 0.2, 0.34, 0xf8f9fa),
  P(CONE, 0.92, 0.1, 0, 0.34, 0.2, 0.34, 0xf8f9fa, { rz: -HALF }),
  P(BOX, 0, 0.03, 0, 1.72, 0.06, 0.345, 0x1c3f6e),
  P(BOX, -0.1, 0.25, 0, 1.4, 0.1, 0.3, 0xf8f9fa),
  P(BOX, -0.15, 0.35, 0, 1.1, 0.1, 0.26, 0xf8f9fa),
  P(BOX, -0.2, 0.44, 0, 0.7, 0.08, 0.22, 0xf8f9fa),
  P(GBOX, -0.1, 0.25, 0, 1.38, 0.03, 0.305, 0x9fd3ff),
  P(GBOX, -0.15, 0.35, 0, 1.08, 0.03, 0.265, 0x9fd3ff),
  P(GBOX, 0, 0.14, 0, 1.6, 0.02, 0.345, 0xffe8a3),
  P(CYL, -0.5, 0.58, 0, 0.12, 0.2, 0.1, 0xe03131),
  P(BOX, -0.5, 0.67, 0, 0.12, 0.03, 0.1, 0x212529),
  P(BOX, 0.45, 0.32, 0, 0.12, 0.05, 0.3, 0x1c7ed6),
];

/** A container ship: dark hull, rows of coloured containers, bridge at the back. */
export const CARGO: Model = [
  P(BOX, 0, 0.09, 0, 1.6, 0.18, 0.34, 0x2b2f36),
  P(CONE, 0.86, 0.09, 0, 0.34, 0.18, 0.34, 0x2b2f36, { rz: -HALF }),
  P(BOX, 0, 0.02, 0, 1.62, 0.05, 0.345, 0xc92a2a),
  ...Array.from({ length: 12 }, (_, k) => {
    const i = k % 6;
    const h = Math.floor(k / 6);
    return P(BOX, 0.45 - i * 0.18, 0.22 + h * 0.08, 0, 0.17, 0.075, 0.3, [0xe03131, 0x1c7ed6, 0xf59f00, 0x2f9e44, 0xf76707, 0x7048e8][(i + h * 2) % 6]);
  }),
  P(BOX, -0.68, 0.3, 0, 0.18, 0.24, 0.3, 0xf8f9fa),
  P(GBOX, -0.68, 0.38, 0, 0.185, 0.03, 0.305, 0xffe8a3),
  P(CYL, -0.72, 0.48, 0, 0.05, 0.12, 0.05, 0xf08c00),
];

/** A tug boat (red and black). */
export const TUG: Model = [
  P(BOX, 0, 0.06, 0, 0.3, 0.1, 0.14, 0xc92a2a),
  P(BOX, 0, 0.0, 0, 0.31, 0.04, 0.145, 0x212529),
  P(BOX, -0.03, 0.15, 0, 0.12, 0.08, 0.1, 0xf8f9fa),
  P(CYL, -0.06, 0.22, 0, 0.03, 0.08, 0.03, 0xf08c00),
  P(TORUS, 0.15, 0.08, 0, 0.06, 0.06, 0.06, 0x343a40, { ry: HALF }),
];

/** A small boat (slot 0 hull): fishing boats, police launches, fire boats. */
export const BOAT: Model = [
  P(BOX, 0, 0.05, 0, 0.26, 0.08, 0.11, S0),
  P(CONE, 0.16, 0.05, 0, 0.11, 0.08, 0.11, S0, { rz: -HALF }),
  P(BOX, -0.03, 0.12, 0, 0.09, 0.07, 0.08, 0xf8f9fa),
];

/** A whale (blue-grey, pale belly). */
export const WHALE: Model = [
  P(BALL, 0, 0, 0, 1.3, 0.42, 0.46, 0x3d5a73),
  P(BALL, 0.08, -0.06, 0, 1.1, 0.3, 0.4, 0xd3dde6),
  P(BALL, 0.5, 0.02, 0, 0.42, 0.34, 0.4, 0x3d5a73),
  P(BOX, -0.66, 0.02, 0, 0.3, 0.1, 0.1, 0x3d5a73),
  P(BOX, -0.84, 0.03, 0.13, 0.2, 0.025, 0.24, 0x2f475c, { ry: 0.5 }),
  P(BOX, -0.84, 0.03, -0.13, 0.2, 0.025, 0.24, 0x2f475c, { ry: -0.5 }),
  P(BOX, 0.18, -0.08, 0.24, 0.24, 0.02, 0.12, 0x2f475c, { ry: -0.6, rx: 0.4 }),
  P(BOX, 0.18, -0.08, -0.24, 0.24, 0.02, 0.12, 0x2f475c, { ry: 0.6, rx: -0.4 }),
  P(BALL, 0.48, 0.06, 0.19, 0.04, 0.04, 0.04, 0x111111),
  P(BALL, 0.48, 0.06, -0.19, 0.04, 0.04, 0.04, 0x111111),
];

/** The giant inflatable duck. */
export const DUCK: Model = [
  P(BALL, 0, 0.32, 0, 1.25, 0.7, 0.95, 0xffd43b),
  P(BALL, -0.5, 0.48, 0, 0.32, 0.4, 0.4, 0xffd43b, { rz: -0.6 }),
  P(BALL, 0.42, 0.85, 0, 0.6, 0.58, 0.58, 0xffd43b),
  P(BALL, 0.75, 0.78, 0, 0.32, 0.12, 0.3, 0xff922b),
  P(BALL, 0.62, 0.95, 0.2, 0.09, 0.11, 0.06, 0x111111),
  P(BALL, 0.62, 0.95, -0.2, 0.09, 0.11, 0.06, 0x111111),
  P(BALL, 0.06, 0.48, 0.42, 0.5, 0.25, 0.14, 0xfcc419, { rx: 0.3 }),
  P(BALL, 0.06, 0.48, -0.42, 0.5, 0.25, 0.14, 0xfcc419, { rx: -0.3 }),
];

/** A treasure chest, lid open (gold glowing inside). */
export const CHEST: Model = [
  P(BOX, 0, 0.07, 0, 0.26, 0.13, 0.17, 0x8a5a2b),
  P(BOX, 0, 0.07, 0, 0.265, 0.02, 0.175, 0xd4af37),
  P(BOX, 0, 0.135, 0, 0.24, 0.02, 0.15, 0xffd43b),
  P(GBALL, 0, 0.15, 0, 0.2, 0.06, 0.12, 0xffe066),
  P(BOX, 0, 0.21, -0.1, 0.26, 0.15, 0.03, 0x8a5a2b, { rx: -0.35 }),
  P(BOX, 0.125, 0.07, 0, 0.012, 0.135, 0.18, 0xd4af37),
  P(BOX, -0.125, 0.07, 0, 0.012, 0.135, 0.18, 0xd4af37),
];

// ---------------------------------------------------------------- parade things

/** The giant dinosaur balloon (green, orange spikes). */
export const DINO: Model = [
  P(BALL, 0, 0.55, 0, 0.75, 0.55, 0.5, 0x51cf66),
  P(BALL, 0.05, 0.47, 0, 0.6, 0.35, 0.42, 0xb2f2bb),
  P(CYL, 0.32, 0.85, 0, 0.18, 0.5, 0.18, 0x51cf66, { rz: -0.5 }),
  P(BALL, 0.48, 1.12, 0, 0.36, 0.24, 0.26, 0x51cf66),
  P(BOX, 0.62, 1.07, 0, 0.12, 0.03, 0.18, 0xffffff),
  P(BALL, 0.55, 1.2, 0.1, 0.06, 0.07, 0.04, 0x111111),
  P(BALL, 0.55, 1.2, -0.1, 0.06, 0.07, 0.04, 0x111111),
  P(CONE, -0.55, 0.5, 0, 0.26, 0.6, 0.22, 0x51cf66, { rz: HALF + 0.25, swing: 0.15, swingHz: 0.6 }),
  ...[-0.25, -0.05, 0.15, 0.33].map((x, k) => P(CONE, x, 0.86 + (k === 3 ? 0.2 : 0), 0, 0.12, 0.14, 0.06, 0xff922b)),
  P(CYL, 0.12, 0.18, 0.15, 0.13, 0.36, 0.13, 0x51cf66, { swing: 0.3, swingHz: 0.7 }),
  P(CYL, 0.12, 0.18, -0.15, 0.13, 0.36, 0.13, 0x51cf66, { swing: 0.3, swingHz: 0.7, phase: Math.PI }),
  P(CYL, 0.34, 0.6, 0.14, 0.05, 0.16, 0.05, 0x51cf66, { rz: -1, swing: 0.4, swingHz: 1 }),
  P(CYL, 0.34, 0.6, -0.14, 0.05, 0.16, 0.05, 0x51cf66, { rz: -1, swing: 0.4, swingHz: 1, phase: 1 }),
];

/** A carnival float (slot 0 trailer, slot 1 and 2 decorations): feathers and a big mask. */
export const FLOAT: Model = [
  P(BOX, 0, 0.08, 0, 0.6, 0.1, 0.3, S0),
  P(BOX, 0, 0.04, 0, 0.62, 0.02, 0.32, 0xfcc419),
  P(CYL, 0.18, 0.04, 0.15, 0.06, 0.02, 0.06, TYRE, { rx: HALF }),
  P(CYL, -0.18, 0.04, 0.15, 0.06, 0.02, 0.06, TYRE, { rx: HALF }),
  P(CYL, 0.18, 0.04, -0.15, 0.06, 0.02, 0.06, TYRE, { rx: HALF }),
  P(CYL, -0.18, 0.04, -0.15, 0.06, 0.02, 0.06, TYRE, { rx: HALF }),
  P(BALL, -0.12, 0.3, 0, 0.3, 0.32, 0.18, S1),
  ...[-0.5, -0.25, 0, 0.25, 0.5].map((a, k) => P(CONE, -0.18 + Math.sin(a) * 0.05, 0.52, Math.sin(a) * 0.2, 0.05, 0.3, 0.02, [S1, S2, 0xfcc419, S2, S1][k], { rx: a, swing: 0.15, swingHz: 0.8, phase: k })),
  P(TORUS, 0.15, 0.2, 0, 0.16, 0.16, 0.16, S2, { ry: HALF, spin: 1.5 }),
];

/** A circus wagon (red and gold, a lion behind the bars). */
export const WAGON: Model = [
  P(BOX, 0, 0.16, 0, 0.42, 0.22, 0.22, 0xc92a2a),
  P(BOX, 0, 0.29, 0, 0.44, 0.03, 0.24, 0xfcc419),
  P(BOX, 0, 0.16, 0, 0.3, 0.16, 0.225, 0x2b1d14),
  ...[-0.12, -0.06, 0, 0.06, 0.12].map((x) => P(BOX, x, 0.16, 0, 0.008, 0.16, 0.23, 0xfcc419)),
  P(BALL, 0, 0.16, 0, 0.12, 0.12, 0.1, 0xe8a33d),
  P(CYL, 0.14, 0.05, 0.12, 0.09, 0.02, 0.09, 0xfcc419, { rx: HALF }),
  P(CYL, -0.14, 0.05, 0.12, 0.09, 0.02, 0.09, 0xfcc419, { rx: HALF }),
  P(CYL, 0.14, 0.05, -0.12, 0.09, 0.02, 0.09, 0xfcc419, { rx: HALF }),
  P(CYL, -0.14, 0.05, -0.12, 0.09, 0.02, 0.09, 0xfcc419, { rx: HALF }),
];

/** A masquerade: a whirling tower of coloured raffia with a carved mask on top. Slots 0-2. */
export const MASQUERADE: Model = [
  P(CONE, 0, 0.17, 0, 0.26, 0.34, 0.26, S0, { spin: 3 }),
  P(CONE, 0, 0.27, 0, 0.21, 0.26, 0.21, S1, { spin: -2 }),
  P(CONE, 0, 0.36, 0, 0.15, 0.2, 0.15, S2, { spin: 2.5 }),
  P(BOX, 0.04, 0.47, 0, 0.03, 0.08, 0.07, 0x5c3a1e),
  P(CONE, 0, 0.56, 0, 0.06, 0.14, 0.06, S0),
  P(BALL, 0, 0.48, 0, 0.08, 0.08, 0.08, 0xfcc419),
];

/** A robot (the bot, having a tantrum). */
export const ROBOT: Model = [
  P(BOX, 0, 0.32, 0, 0.18, 0.2, 0.14, 0xadb5bd),
  P(BOX, 0, 0.5, 0, 0.14, 0.12, 0.12, 0xced4da),
  P(GBOX, 0.071, 0.51, 0.03, 0.004, 0.025, 0.025, 0xff3b30),
  P(GBOX, 0.071, 0.51, -0.03, 0.004, 0.025, 0.025, 0xff3b30),
  P(BOX, 0, 0.6, 0, 0.01, 0.06, 0.01, 0x868e96),
  P(GBALL, 0, 0.64, 0, 0.03, 0.03, 0.03, 0xff3b30, { alt: 0x300000, hz: 4 }),
  P(BOX, 0, 0.38, 0.1, 0.035, 0.14, 0.035, 0x868e96, { swing: 1.2, swingHz: 3 }),
  P(BOX, 0, 0.38, -0.1, 0.035, 0.14, 0.035, 0x868e96, { swing: 1.2, swingHz: 3, phase: Math.PI }),
  P(BOX, 0, 0.11, 0.045, 0.045, 0.22, 0.045, 0x868e96, { swing: 0.5, swingHz: 3 }),
  P(BOX, 0, 0.11, -0.045, 0.045, 0.22, 0.045, 0x868e96, { swing: 0.5, swingHz: 3, phase: Math.PI }),
];

/** A drone (slot 0 body) with blue lights. */
export const DRONE: Model = [
  P(BOX, 0, 0, 0, 0.08, 0.025, 0.08, S0),
  P(BOX, 0, 0, 0, 0.18, 0.008, 0.012, 0x343a40, { ry: Math.PI / 4 }),
  P(BOX, 0, 0, 0, 0.18, 0.008, 0.012, 0x343a40, { ry: -Math.PI / 4 }),
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => P(CYL, a * 0.064, 0.01, b * 0.064, 0.06, 0.004, 0.06, 0x495057, { spin: 30 })),
  P(GBALL, 0, -0.016, 0, 0.03, 0.02, 0.03, 0x4dd8ff, { alt: 0x0a3050, hz: 5 }),
];

/** A stage: a platform, a lighting truss, speaker stacks and a screen (slot 0 deck). */
export const STAGE: Model = [
  P(BOX, 0, 0.06, 0, 0.9, 0.12, 0.5, S0),
  P(BOX, 0, 0.125, 0, 0.92, 0.01, 0.52, 0x212529),
  P(BOX, 0.43, 0.42, 0.24, 0.025, 0.72, 0.025, 0x868e96),
  P(BOX, 0.43, 0.42, -0.24, 0.025, 0.72, 0.025, 0x868e96),
  P(BOX, -0.43, 0.42, 0.24, 0.025, 0.72, 0.025, 0x868e96),
  P(BOX, -0.43, 0.42, -0.24, 0.025, 0.72, 0.025, 0x868e96),
  P(BOX, 0, 0.78, 0.24, 0.88, 0.03, 0.03, 0x868e96),
  P(BOX, 0, 0.78, -0.24, 0.88, 0.03, 0.03, 0x868e96),
  P(BOX, 0.43, 0.78, 0, 0.03, 0.03, 0.5, 0x868e96),
  P(BOX, -0.43, 0.78, 0, 0.03, 0.03, 0.5, 0x868e96),
  P(BOX, -0.36, 0.25, 0.3, 0.12, 0.26, 0.1, 0x212529),
  P(BOX, -0.36, 0.25, -0.3, 0.12, 0.26, 0.1, 0x212529),
];
