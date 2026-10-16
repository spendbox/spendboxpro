// Moves (animations) for the skinned avatar: idle, walk, run, wave, dance, jump, talk, and the
// everyday ones: sitting (still, talking, sipping, eating, typing), leaning, sipping and eating
// standing, cooking, DJing, working at a counter, clapping, cheering, a handshake and a hug.
//
// Each move gives, at time t, rotations for some bones (radians, about the avatar's own axes: x to
// its left, y up, z forward, since bones rest unrotated), how the hips shift, and where each foot
// should be. The legs are then solved to put the feet there (two-bone inverse kinematics), so feet
// plant on the ground, roll heel to toe and lift on the swing instead of sliding or sinking.
// Timings follow human gait: stance about 60% of a walking stride, the pelvis lowest at heel strike
// and highest over the standing leg, arms swinging opposite the legs.

import { Euler, type Object3D, Quaternion, Vector3 } from "three";

type V3 = [number, number, number];
/** Where a foot goes, relative to where it rests: forward (z), up (y), sideways (x); pitch tips the toes down. */
export type FootTarget = { x?: number; y: number; z: number; pitch: number; toe?: number };
/**
 * rot: rotations (radians, about the avatar's axes); twist: turns about a bone's own length after
 * that (the forearm and wrist turning the palm); hips: how the hips shift; feet: where each foot goes.
 */
export type Pose = {
  rot: Record<string, V3>; twist?: Record<string, number>; hips?: V3; feet?: [FootTarget, FootTarget];
  /** A turn of the whole body about its feet (a dance spin), for whoever moves the avatar to apply. */
  spin?: number;
};

/** What a move needs to know about this body. */
/** stride: 1 normally; less in narrow long garments (a fitted wrapper allows only short steps). */
export type Dims = {
  height: number; leg: number; ankle: number; ball: number; stride: number;
  /** Hip joint height standing, thigh and shin lengths (model units). */
  hip: number; thigh: number; shin: number;
  /** Sitting: the seat's height above the floor (model units); unset, a chair at knee height. */
  seat?: number;
};

export type Move = {
  id: string;
  n: string;
  /** Seconds per cycle. */
  period: number;
  /** How fast the avatar travels while doing it (units per second), for moving it through the world. */
  speed: number;
  pose(t: number, D: Dims): Pose;
};

const TAU = Math.PI * 2;
const s01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x: number) => x - Math.floor(x);

/**
 * One foot through a stride. ph: 0..1 from heel strike; duty: share of the stride on the ground;
 * step: how far the foot travels (relative to the hips) while on the ground; lift: swing clearance.
 */
function stride(ph: number, duty: number, step: number, lift: number, D: Dims): FootTarget {
  if (ph < duty) {
    // Stance: the foot stays put on the ground as the body passes over it (moves back relative to the hips).
    const u = ph / duty, z = step * (0.5 - u);
    // Heel strike (toes up) -> flat -> heel rises and the foot rolls over the ball of the foot (toe-off).
    const heelUp = s01((u - 0.6) / 0.4), pitch = -0.25 * (1 - s01(u / 0.15)) + 0.6 * heelUp;
    return { z, y: D.ball * Math.sin(Math.max(0, pitch)), pitch, toe: -0.5 * heelUp };
  }
  // Swing: the knee folds and the heel comes up high behind first (the foot lags behind the knee),
  // then the leg swings through low and reaches forward, toes up, for the next heel strike.
  const u = (ph - duty) / (1 - duty), z = step * (-0.5 + s01((u - 0.08) / 0.92));
  const pitch = 0.6 * (1 - s01(u / 0.35)) - 0.25 * s01((u - 0.6) / 0.4);
  // (Limited so the knee folds no further than in real jogging, about 100 degrees.)
  const heel = D.height * D.stride * (lift / D.stride / D.height > 0.1 ? 0.11 : 0.08) * Math.sin(Math.PI * Math.min(1, u / 0.6));
  return { z, y: heel + lift * 0.4 * Math.sin(Math.PI * u) + D.ball * Math.sin(Math.max(0, pitch)) * (1 - u), pitch, toe: 0 };
}

const walk = (run: boolean): Move["pose"] => (t, D) => {
  const P = run ? 0.72 : 1.1, ph = frac(t / P), duty = run ? 0.38 : 0.6, step = D.height * (run ? 0.46 : 0.38) * D.stride;
  const lift = D.height * (run ? 0.13 : 0.06) * D.stride, c = Math.cos(TAU * ph), sn = Math.sin(TAU * ph), c2 = Math.cos(2 * TAU * ph);
  // Right foot strikes at 0, left at 0.5.
  const feet: [FootTarget, FootTarget] = [stride(ph, duty, step, lift, D), stride(frac(ph + 0.5), duty, step, lift, D)];
  // The pelvis, as measured in human gait (sizes for a 1.75 m adult): it rises and falls about 2.5 cm
  // twice a stride (lowest with both feet down, highest over the standing leg), shifts about 2 cm
  // over the standing leg, turns about 5 degrees with the forward leg, and drops about 5 degrees on
  // the swinging side. Running: all larger. The lower back and chest turn the other way, keeping the
  // shoulders level and square.
  const bob = D.height * (run ? 0.022 : 0.013), lean = run ? 0.16 : 0.04;
  const turn = run ? 0.13 : 0.085, drop = run ? 0.1 : 0.08, shift = D.height * (run ? 0.008 : 0.013);
  const hips: V3 = [-shift * sn, -bob * c2 - (run ? D.height * 0.03 : 0), 0];
  const swingArm = run ? 0.65 : 0.32, elbow = run ? 1.5 : 0.22;
  return {
    hips,
    feet,
    rot: {
      hips: [lean * 0.5 + 0.03 * c2, turn * c, -drop * sn],
      spine: [lean * 0.3, -turn * 0.6 * c, drop * 0.7 * sn],
      chest: [lean * 0.3 + 0.02 * c2, -turn * 0.7 * c, drop * 0.3 * sn],
      neck: [-lean * 0.6, 0.06 * c, 0.02 * sn],
      skull: [-lean * 0.3, 0.04 * c, 0],
      // Arms swing opposite the legs: the right arm forward as the left leg is forward.
      // (Held a little out from the body, so the hands pass beside the hips.)
      upperArm0: [swingArm * c, 0, run ? -0.2 : -0.06],
      upperArm1: [-swingArm * c, 0, run ? 0.2 : 0.06],
      forearm0: [-(elbow + (run ? 0.25 : 0.18) * Math.max(0, c)), 0, 0],
      forearm1: [-(elbow + (run ? 0.25 : 0.18) * Math.max(0, -c)), 0, 0],
      clavicle0: [0, 0, run ? 0.04 : 0.015 * Math.max(0, c)],
      clavicle1: [0, 0, run ? -0.04 : -0.015 * Math.max(0, -c)],
    },
  };
};

const standing = (sway = 0): [FootTarget, FootTarget] => [
  { x: sway, y: 0, z: 0, pitch: 0 },
  { x: sway, y: 0, z: 0, pitch: 0 },
];

export const MOVES: Move[] = [
  {
    id: "idle", n: "Idle", period: 8, speed: 0,
    pose: (t, D) => {
      // Breathing, a slow shift of weight from foot to foot, small looks around.
      const br = Math.sin((TAU * t) / 4), w = Math.sin((TAU * t) / 8), look = Math.sin((TAU * t) / 8 + 1.2);
      return {
        hips: [D.height * 0.012 * w, -D.height * 0.004 * (1 - Math.abs(w)), 0],
        feet: standing(),
        rot: {
          hips: [0, 0.02 * w, -0.025 * w],
          spine: [0.01 * br, 0, 0.02 * w],
          chest: [-0.015 * br, 0, 0.012 * w],
          clavicle0: [0, 0, -0.012 * br],
          clavicle1: [0, 0, 0.012 * br],
          neck: [0.01 * br, 0.06 * look, -0.01 * w],
          skull: [0.02 * Math.sin(TAU * t / 5), 0.08 * look, 0],
          upperArm0: [0.03 * w, 0, 0.03],
          upperArm1: [-0.03 * w, 0, -0.03],
          forearm0: [-0.12, 0, 0],
          forearm1: [-0.12, 0, 0],
        },
      };
    },
  },
  { id: "walk", n: "Walk", period: 1.1, speed: 0, pose: walk(false) },
  { id: "run", n: "Run", period: 0.72, speed: 0, pose: walk(true) },
  {
    id: "wave", n: "Wave", period: 2, speed: 0,
    pose: (t) => {
      // Right hand raised beside the head: upper arm out to the side and a little forward at about
      // shoulder height, forearm standing up from the bent elbow, waving side to side from the elbow.
      const wv = Math.sin(TAU * t * 1.6), wr = Math.sin(TAU * t * 1.6 + 0.9), palm = Number(globalThis.process?.env?.PALM ?? -1.4);
      return {
        feet: standing(),
        rot: {
          chest: [0, 0.06, 0.03],
          neck: [0, -0.05, 0],
          skull: [0.03, -0.12, 0.05],
          clavicle0: [0, 0, -0.14],
          upperArm0: [-0.45, 0, -1.3],
          forearm0: [0, 0, -1.35 + 0.3 * wv],
          // The wrist rocks a little with each wave, trailing the forearm.
          hand0: [0.1 * wr, 0, 0.22 * wr],
          upperArm1: [0, 0, 0.03],
          forearm1: [-0.15, 0, 0],
        },
        // The palm turns to face forward: the turn shared along the forearm and wrist, as in life.
        twist: { forearm0: palm * 0.6, hand0: palm * 0.4 },
      };
    },
  },
  {
    id: "dance", n: "Dance", period: 1.0, speed: 0,
    pose: (t, D) => {
      // Two-step groove: bounce on the beat, hips sway, arms pump alternately.
      const ph = frac(t), b = Math.abs(Math.sin(Math.PI * ph)), sw = Math.sin(TAU * t * 0.5), pump = Math.sin(TAU * ph);
      return {
        hips: [D.height * 0.03 * sw, -D.height * 0.03 * (1 - b), 0],
        feet: standing(),
        rot: {
          hips: [0.05, 0.12 * sw, -0.08 * sw],
          spine: [0.04, -0.06 * sw, 0.06 * sw],
          chest: [0.04 * b, -0.08 * sw, 0.05 * sw],
          skull: [0.12 * (b - 0.5), 0.1 * sw, 0],
          upperArm0: [-0.5 - 0.4 * pump, 0, -0.25],
          upperArm1: [-0.5 + 0.4 * pump, 0, 0.25],
          forearm0: [-1.5, 0, 0],
          forearm1: [-1.5, 0, 0],
        },
      };
    },
  },
  {
    id: "jump", n: "Jump", period: 1.6, speed: 0,
    pose: (t, D) => {
      // Crouch, spring up with the arms thrown up, tuck in the air, land and absorb.
      const ph = frac(t / 1.6), crouch = s01(ph / 0.22) * (1 - s01((ph - 0.24) / 0.08)) + s01((ph - 0.82) / 0.06) * (1 - s01((ph - 0.92) / 0.08));
      const air = ph > 0.32 && ph < 0.86 ? Math.sin((Math.PI * (ph - 0.32)) / 0.54) : 0, H = D.height * 0.16 * air;
      const arms = s01((ph - 0.22) / 0.1) * (1 - s01((ph - 0.6) / 0.25));
      const tuck = air * 0.5 * D.stride;
      const feet: [FootTarget, FootTarget] = [
        { y: H + D.height * 0.03 * tuck, z: -D.height * 0.01 * tuck, pitch: 0.35 * air },
        { y: H + D.height * 0.03 * tuck, z: -D.height * 0.01 * tuck, pitch: 0.35 * air },
      ];
      return {
        hips: [0, -D.height * 0.09 * crouch + H, 0],
        feet,
        rot: {
          // Hips fold into the crouch, straighten at take-off, tuck in the air, fold again on landing.
          hips: [0.35 * crouch - 0.12 * arms * (1 - air) + 0.22 * tuck, 0, 0],
          spine: [0.15 * crouch, 0, 0],
          chest: [0.1 * crouch - 0.08 * arms, 0, 0],
          skull: [-0.2 * crouch, 0, 0],
          upperArm0: [0.6 * crouch - 2.4 * arms, 0, -0.2 * arms],
          upperArm1: [0.6 * crouch - 2.4 * arms, 0, 0.2 * arms],
          forearm0: [-0.3 - 0.3 * crouch, 0, 0],
          forearm1: [-0.3 - 0.3 * crouch, 0, 0],
        },
      };
    },
  },
  {
    id: "talk", n: "Talk", period: 6, speed: 0,
    pose: (t) => {
      // Conversational gestures: forearms up, hands opening and turning, small nods.
      const g1 = Math.sin(TAU * t / 3), g2 = Math.sin(TAU * t / 2.2 + 1), nod = Math.sin(TAU * t / 1.4);
      return {
        feet: standing(),
        rot: {
          chest: [0.01 * nod, 0.04 * g1, 0],
          skull: [0.05 * nod, 0.08 * g1, 0.03 * g2],
          upperArm0: [-0.25 - 0.1 * g1, 0, 0.12],
          upperArm1: [-0.25 - 0.1 * g2, 0, -0.12],
          forearm0: [-1.2 - 0.25 * g2, 0.3 * g1, 0],
          forearm1: [-1.1 - 0.25 * g1, -0.3 * g2, 0],
          hand0: [0.2 * g1, 0, -0.2],
          hand1: [0.2 * g2, 0, 0.2],
        },
      };
    },
  },
];


// ---- sitting, and the everyday things people do (docs/AVATAR_POSES.md) ----

/**
 * Sitting on a seat (D.seat high, or a chair at knee height): the hips lowered onto it, thighs
 * along the seat, feet on the floor in front (dangling from a high stool). Arms and head come from
 * `top`, so every seated move shares the same legs.
 */
function seated(D: Dims, top: Record<string, V3>, hipsX = 0): Pose {
  const seat = D.seat ?? D.shin + D.ankle;
  // The hip joints sit a little above the seat's top (the flesh of the thighs).
  const hipAt = seat + D.height * 0.06;
  const drop = D.hip - hipAt;
  // Feet in front, under the knees; on the floor, or hanging when the seat is high.
  const reach = D.thigh * 0.92;
  const ankleY = Math.max(0, hipAt - D.shin * 0.98 - D.ankle);
  const foot: FootTarget = { x: 0, y: ankleY, z: reach, pitch: ankleY > 0 ? 0.35 : 0 };
  return {
    hips: [0, -drop, -D.height * 0.015],
    feet: [{ ...foot, x: D.height * 0.01 }, { ...foot, x: -D.height * 0.01 }],
    rot: { hips: [hipsX, 0, 0], ...top },
  };
}
/** Hands resting on the thighs. */
const lap = (b = 0): Record<string, V3> => ({
  upperArm0: [-0.42 + 0.02 * b, 0, -0.08],
  upperArm1: [-0.42 + 0.02 * b, 0, 0.08],
  forearm0: [-0.95, 0, 0.15],
  forearm1: [-0.95, 0, -0.15],
});
/** A cup or a fork coming up to the mouth now and then (0 down .. 1 at the mouth). */
const toMouth = (t: number, every: number, hold = 1.2) => {
  const p = t % every;
  return p < 0.5 ? s01(p / 0.5) : p < 0.5 + hold ? 1 : p < 1 + hold ? 1 - s01((p - 0.5 - hold) / 0.5) : 0;
};
/** The right arm bringing something to the mouth, by how far (0..1). */
const mouthArm = (k: number, base: [V3, V3]): Record<string, V3> => ({
  upperArm0: [base[0][0] + (-0.55 - base[0][0]) * k, 0, base[0][2] + (-0.3 - base[0][2]) * k],
  forearm0: [base[1][0] + (-2.35 - base[1][0]) * k, 0.2 * k, base[1][2] * (1 - k)],
});

MOVES.push(
  {
    id: "sit", n: "Sit", period: 8, speed: 0,
    pose: (t, D) => {
      const br = Math.sin((TAU * t) / 4), look = Math.sin((TAU * t) / 9 + 0.7);
      return seated(D, { spine: [-0.04 + 0.01 * br, 0, 0], chest: [-0.03 - 0.012 * br, 0, 0], neck: [0.04, 0.12 * look, 0], skull: [0.03, 0.15 * look, 0], ...lap(br) });
    },
  },
  {
    id: "sitTalk", n: "Sit and talk", period: 6, speed: 0,
    pose: (t, D) => {
      const g1 = Math.sin(TAU * t / 3), g2 = Math.sin(TAU * t / 2.2 + 1), nod = Math.sin(TAU * t / 1.4);
      return seated(D, {
        spine: [0.04, 0.04 * g1, 0], chest: [0.02 + 0.01 * nod, 0.05 * g1, 0], skull: [0.06 * nod, 0.12 * g1, 0.03 * g2],
        upperArm0: [-0.5 - 0.1 * g1, 0, -0.05], upperArm1: [-0.45 - 0.1 * g2, 0, 0.05],
        forearm0: [-1.25 - 0.25 * g2, 0.3 * g1, 0], forearm1: [-1.0 - 0.2 * g1, -0.3 * g2, 0],
        hand0: [0.2 * g1, 0, -0.2], hand1: [0.2 * g2, 0, 0.2],
      });
    },
  },
  {
    id: "sitSip", n: "Sit and sip", period: 7, speed: 0,
    pose: (t, D) => {
      const k = toMouth(t, 7), look = Math.sin((TAU * t) / 7 + 0.3);
      const base: [V3, V3] = [[-0.5, 0, -0.1], [-1.35, 0, 0]];
      return seated(D, {
        spine: [-0.02, 0, 0], chest: [-0.02, 0, 0], neck: [-0.05 * k, 0.1 * look * (1 - k), 0], skull: [-0.12 * k, 0.12 * look * (1 - k), 0],
        ...lap(), ...mouthArm(k, base), hand0: [0.3 * k, 0, 0],
      });
    },
  },
  {
    id: "sitEat", n: "Sit and eat", period: 4, speed: 0,
    pose: (t, D) => {
      const k = toMouth(t, 4, 0.5), chew = Math.sin(TAU * t * 2.5) * (1 - k);
      const base: [V3, V3] = [[-0.55, 0, -0.12], [-1.3, 0, 0.1]];
      return seated(D, {
        spine: [0.12, 0, 0], chest: [0.08, 0, 0], neck: [0.1 - 0.08 * k, 0, 0], skull: [0.12 + 0.03 * chew - 0.1 * k, 0, 0],
        upperArm1: [-0.55, 0, 0.12], forearm1: [-1.3, 0, -0.1],
        ...mouthArm(k, base),
      });
    },
  },
  {
    id: "sitType", n: "Sit and type", period: 2, speed: 0,
    pose: (t, D) => {
      const a = Math.sin(TAU * t * 2.3), b = Math.sin(TAU * t * 3.1 + 1), look = Math.sin(TAU * t / 6);
      return seated(D, {
        spine: [0.08, 0, 0], chest: [0.06, 0, 0], neck: [0.12, 0.05 * look, 0], skull: [0.14, 0.06 * look, 0],
        upperArm0: [-0.5, 0, -0.18], upperArm1: [-0.5, 0, 0.18],
        forearm0: [-1.4 + 0.04 * a, 0, 0.35], forearm1: [-1.4 + 0.04 * b, 0, -0.35],
        hand0: [0.15 + 0.08 * Math.max(0, a), 0, 0], hand1: [0.15 + 0.08 * Math.max(0, b), 0, 0],
      });
    },
  },
  {
    id: "lean", n: "Lean", period: 8, speed: 0,
    pose: (t, D) => {
      // Weight on one leg, the other crossed over in front, shoulders back against the wall.
      const br = Math.sin((TAU * t) / 4), look = Math.sin((TAU * t) / 8 + 1.2);
      return {
        hips: [D.height * 0.02, -D.height * 0.006, -D.height * 0.02],
        feet: [{ x: 0, y: 0, z: 0, pitch: 0 }, { x: -D.height * 0.09, y: 0, z: D.height * 0.06, pitch: 0.2, toe: -0.2 }],
        rot: {
          hips: [0, 0.05, -0.06], spine: [-0.06, 0, 0.03], chest: [-0.06 - 0.01 * br, 0, 0.02],
          neck: [0.02, 0.1 * look, 0], skull: [0.02, 0.12 * look, -0.04],
          // Hands in the pockets.
          upperArm0: [0.12, 0, -0.14], upperArm1: [0.12, 0, 0.14],
          forearm0: [-0.55, 0, 0.1], forearm1: [-0.55, 0, -0.1], hand0: [0.3, 0, 0], hand1: [0.3, 0, 0],
        },
      };
    },
  },
  {
    id: "sip", n: "Sip a drink", period: 7, speed: 0,
    pose: (t, D) => {
      const k = toMouth(t, 7), w = Math.sin((TAU * t) / 8), look = Math.sin((TAU * t) / 8 + 1.2);
      return {
        hips: [D.height * 0.01 * w, 0, 0], feet: standing(),
        rot: {
          hips: [0, 0.02 * w, -0.02 * w], chest: [-0.02 * k, 0, 0], neck: [-0.05 * k, 0.06 * look * (1 - k), 0], skull: [-0.12 * k, 0.08 * look, 0],
          upperArm1: [0.03, 0, -0.03], forearm1: [-0.15, 0, 0],
          ...mouthArm(k, [[-0.45, 0, -0.08], [-1.4, 0, 0]]), hand0: [0.3 * k, 0, 0],
        },
      };
    },
  },
  {
    id: "eat", n: "Eat standing", period: 4, speed: 0,
    pose: (t) => {
      const k = toMouth(t, 4, 0.5);
      return {
        feet: standing(), hips: [0, 0, 0],
        rot: {
          chest: [0.04, 0, 0], neck: [0.1 - 0.1 * k, 0, 0], skull: [0.1 - 0.1 * k, 0, 0],
          // A plate in the left hand, the right hand bringing food up.
          upperArm1: [-0.4, 0, 0.15], forearm1: [-1.45, 0, -0.2],
          ...mouthArm(k, [[-0.5, 0, -0.1], [-1.35, 0, 0.1]]),
        },
      };
    },
  },
  {
    id: "cook", n: "Cook", period: 2.4, speed: 0,
    pose: (t, D) => {
      // At the cooker: leaning in, stirring the pot, the other hand on the counter.
      const a = TAU * t / 1.2, look = Math.sin(TAU * t / 6);
      return {
        hips: [0, -D.height * 0.005, 0], feet: standing(),
        rot: {
          hips: [0.08, 0, 0], spine: [0.08, 0, 0], chest: [0.06, 0.05 * Math.sin(a), 0], neck: [0.15, 0.08 * look, 0], skull: [0.15, 0.1 * look, 0],
          upperArm0: [-0.75 + 0.1 * Math.sin(a), 0.15 * Math.cos(a), -0.1], forearm0: [-1.2 + 0.15 * Math.cos(a), 0, 0.1],
          upperArm1: [-0.55, 0, 0.12], forearm1: [-0.85, 0, 0],
        },
      };
    },
  },
  {
    id: "dj", n: "DJ", period: 0.5, speed: 0,
    pose: (t, D) => {
      // One hand on the decks, the other holding the headphones to an ear, nodding on the beat.
      const b = Math.abs(Math.sin(TAU * t)), sc = Math.sin(TAU * t * 0.5);
      return {
        hips: [0, -D.height * 0.015 * b, 0], feet: standing(),
        rot: {
          hips: [0.05, 0, 0], spine: [0.06, 0, 0], chest: [0.05 + 0.03 * b, 0, 0], neck: [0.1 + 0.12 * b, 0, 0.1], skull: [0.1 + 0.15 * b, 0, 0.12],
          upperArm0: [-0.8, 0, -0.15], forearm0: [-1.1 + 0.15 * sc, 0.2 * sc, 0.1], hand0: [0.3, 0, 0],
          clavicle1: [0, 0, 0.12], upperArm1: [-0.35, 0, 1.25], forearm1: [0, 0, 1.9], hand1: [0, 0, 0.3],
        },
      };
    },
  },
  {
    id: "work", n: "Work at a counter", period: 2, speed: 0,
    pose: (t, D) => {
      // Wiping, sorting, serving: both hands busy in front, leaning in a little.
      const a = TAU * t / 2, look = Math.sin(TAU * t / 5);
      return {
        hips: [0, -D.height * 0.004, 0], feet: standing(),
        rot: {
          hips: [0.06, 0, 0], spine: [0.08, 0, 0], chest: [0.05, 0.06 * Math.sin(a), 0], neck: [0.15, 0.1 * look, 0], skull: [0.12, 0.12 * look, 0],
          upperArm0: [-0.7 + 0.15 * Math.sin(a), 0.2 * Math.cos(a), -0.1], forearm0: [-1.0, 0, 0.1],
          upperArm1: [-0.6, 0, 0.15], forearm1: [-1.1 + 0.1 * Math.sin(a * 2), 0, -0.1],
        },
      };
    },
  },
  {
    id: "clap", n: "Clap", period: 0.5, speed: 0,
    pose: (t) => {
      const c = Math.max(0, Math.sin(TAU * t));
      return {
        feet: standing(),
        rot: {
          chest: [-0.02, 0, 0], skull: [-0.05, 0, 0],
          upperArm0: [-0.75, 0, -0.1 + 0.32 * c], upperArm1: [-0.75, 0, 0.1 - 0.32 * c],
          forearm0: [-1.0, 0, 0.5 + 0.2 * c], forearm1: [-1.0, 0, -0.5 - 0.2 * c],
        },
      };
    },
  },
  {
    id: "cheer", n: "Cheer", period: 1, speed: 0,
    pose: (t, D) => {
      const b = Math.abs(Math.sin(Math.PI * t)), w = Math.sin(TAU * t);
      return {
        hips: [0, -D.height * 0.02 * (1 - b), 0], feet: standing(),
        rot: {
          chest: [-0.1, 0, 0], neck: [-0.15, 0, 0], skull: [-0.15, 0, 0],
          upperArm0: [-0.4, 0, -2.4 + 0.15 * w], upperArm1: [-0.4, 0, 2.4 - 0.15 * w],
          forearm0: [-0.3, 0, 0], forearm1: [-0.3, 0, 0],
        },
      };
    },
  },
  {
    id: "handshake", n: "Handshake", period: 1.2, speed: 0,
    pose: (t) => {
      const sh = Math.sin(TAU * t * 2.5) * (t % 1.2 < 0.8 ? 1 : 0);
      return {
        feet: standing(),
        rot: {
          chest: [0.04, -0.05, 0], skull: [0.05, 0, 0],
          upperArm0: [-0.6, 0, 0.12], forearm0: [-0.7 + 0.12 * sh, 0, 0.15], hand0: [0, 0, 0],
          upperArm1: [0.03, 0, -0.03], forearm1: [-0.15, 0, 0],
        },
        twist: { forearm0: -1.2 },
      };
    },
  },
  {
    id: "hug", n: "Hug", period: 4, speed: 0,
    pose: (t) => {
      const sq = 0.08 * Math.sin(TAU * t / 2);
      return {
        feet: standing(),
        rot: {
          spine: [0.06, 0, 0], chest: [0.06, 0, 0], neck: [0.05, 0.4, 0.1], skull: [0.05, 0.3, 0.1],
          upperArm0: [-1.25, 0, -0.35 + sq], upperArm1: [-1.25, 0, 0.35 - sq],
          forearm0: [-0.2, -1.2, 0], forearm1: [-0.2, 1.2, 0],
        },
      };
    },
  },
);


// ---- the club's dances (src/app/play/city/dance-moves.ts), on the beat: two beats a second ----
// t is seconds; the beat is t × 2 (CLUB_BPS), so pass the club's beat ÷ 2 to dance in time.

const onBeat = (b: number) => 0.5 + 0.5 * Math.cos(TAU * b);
/** Knees bent (by about c radians): the hips drop and the feet stay on the floor. */
const crouchY = (D: Dims, c: number) => -D.leg * 0.5 * (1 - Math.cos(c));
const flat = (x = 0): FootTarget => ({ x, y: 0, z: 0, pitch: 0 });
/** A foot lifted with the knee up (side: +1 the left foot, -1 the right), out to the side by `out`. */
const lifted = (D: Dims, k: number, side: number, out = 0, fwd = 0.05): FootTarget => ({ x: side * D.height * out * k, y: D.height * 0.13 * k, z: D.height * fwd * k, pitch: 0.4 * k });

MOVES.push(
  {
    id: "dance_groove", n: "Groove", period: 1, speed: 0,
    pose: (t, D) => {
      const b = t * 2, sw = Math.sin(Math.PI * b), ob = onBeat(b), c = 0.16 + 0.16 * ob;
      return {
        hips: [D.height * 0.03 * sw, crouchY(D, c), 0],
        feet: [flat(-D.height * 0.02 * Math.max(0, -sw)), flat(D.height * 0.02 * Math.max(0, sw))],
        rot: {
          hips: [0.04, 0, -0.07 * sw], spine: [0.04, 0, 0.08 * sw], chest: [0, 0.2 * Math.sin(Math.PI * b + 0.6), 0], skull: [0.12 * ob, 0, -0.06 * sw],
          upperArm0: [-0.35 - 0.45 * sw, 0, -0.22], upperArm1: [-0.35 + 0.45 * sw, 0, 0.22],
          forearm0: [-1.25 - 0.2 * ob, 0, 0], forearm1: [-1.25 - 0.2 * ob, 0, 0],
        },
      };
    },
  },
  {
    id: "dance_armsup", n: "Hands up", period: 1, speed: 0,
    pose: (t, D) => {
      const b = t * 2, ob = onBeat(b), w = Math.sin(TAU * b), w2 = Math.sin(TAU * b + 1);
      return {
        hips: [0, crouchY(D, 0.24 * ob) + D.height * 0.02 * (1 - ob), 0],
        feet: [flat(), flat()],
        rot: {
          chest: [-0.08, 0, 0], skull: [-0.2 + 0.12 * ob, 0, 0],
          upperArm0: [-2.85 + 0.2 * w, 0, -0.34 - 0.14 * w], upperArm1: [-2.85 + 0.2 * w2, 0, 0.34 + 0.14 * w2],
          forearm0: [-0.25 - 0.5 * ob, 0, 0], forearm1: [-0.25 - 0.5 * ob, 0, 0],
        },
      };
    },
  },
  {
    id: "dance_shaku", n: "Shaku shaku", period: 1, speed: 0,
    pose: (t, D) => {
      // A knee lifted out to the side on each beat (right, then left), arms swinging across.
      const b = t * 2, side = Math.floor(b) % 2 === 0 ? -1 : 1, lift = Math.sin(Math.PI * (b - Math.floor(b))), sw = Math.sin(Math.PI * b);
      const up = lifted(D, lift, side, 0.07);
      return {
        hips: [-side * D.height * 0.015 * lift, crouchY(D, 0.2), 0],
        feet: side < 0 ? [up, flat()] : [flat(), up],
        rot: {
          spine: [0.05, 0, side * 0.12 * lift], chest: [0, 0.35 * sw, 0], skull: [0.1, 0.22 * sw, 0],
          upperArm0: [-0.95 - 0.25 * sw, 0, 0.12], upperArm1: [-0.95 + 0.25 * sw, 0, -0.12],
          forearm0: [-1.6, 0, 0], forearm1: [-1.6, 0, 0],
        },
      };
    },
  },
  {
    id: "dance_point", n: "Disco point", period: 1, speed: 0,
    pose: (t, D) => {
      const b = t * 2, sw = Math.sin(Math.PI * b), snap = Math.min(1, (b - Math.floor(b)) * 4), k = Math.floor(b) % 2 === 0 ? snap : 1 - snap;
      return {
        hips: [D.height * 0.025 * sw, crouchY(D, 0.12 + 0.1 * onBeat(b)), 0],
        feet: [flat(), flat()],
        rot: {
          hips: [0, 0, -0.1 * sw], skull: [-0.25 * k + 0.1 * (1 - k), 0.3 * k - 0.1, 0],
          upperArm0: [-0.4 - 0.2 * (1 - k), 0, 0.5 - 3.0 * k], forearm0: [-0.3 * (1 - k), 0, 0],
          upperArm1: [0.15, 0, 0.75], forearm1: [-1.7, 0, 0],
        },
      };
    },
  },
  {
    id: "dance_wave", n: "Body wave", period: 2, speed: 0,
    pose: (t, D) => {
      const ph = Math.PI * t * 2;
      return {
        hips: [0, crouchY(D, 0.22 + 0.12 * Math.sin(ph + 1.5)), D.height * 0.025 * Math.sin(ph + 1)],
        feet: [flat(), flat()],
        rot: {
          spine: [0.2 * Math.sin(ph), 0, 0], chest: [0.22 * Math.sin(ph - 1), 0, 0], neck: [0.1 * Math.sin(ph - 1.5), 0, 0], skull: [0.2 * Math.sin(ph - 2), 0, 0],
          upperArm0: [-0.45, 0, -0.7 - 0.45 * Math.sin(ph)], upperArm1: [-0.45, 0, 0.7 + 0.45 * Math.sin(ph + 1.2)],
          forearm0: [-0.7 - 0.5 * Math.sin(ph + 1), 0, 0], forearm1: [-0.7 - 0.5 * Math.sin(ph + 2.2), 0, 0],
        },
      };
    },
  },
  {
    id: "dance_gwara", n: "Gwara gwara", period: 4, speed: 0,
    pose: (t, D) => {
      // One arm swings in a big circle over the head, the other knee lifts (sides swap every 4 beats).
      const b = t * 2, side = Math.floor(b / 4) % 2 === 0 ? 1 : -1, a = Math.PI * b, lift = Math.max(0, Math.sin(TAU * b));
      const big: V3 = [-1.9 + 0.75 * Math.sin(a), 0, -(0.95 + 0.6 * Math.cos(a))];
      const small: V3 = [-0.5, 0, 0.3];
      const knee = lifted(D, lift, side > 0 ? 1 : -1, 0.02, 0.08);
      return {
        hips: [0, crouchY(D, 0.2), 0],
        feet: side > 0 ? [flat(), knee] : [knee, flat()],
        rot: {
          hips: [0, 0, side * 0.06], chest: [0, 0.2 * Math.sin(TAU * b * 2), 0], skull: [0.08 * onBeat(b), -side * 0.15, 0],
          upperArm0: side > 0 ? big : [small[0], 0, -small[2]], upperArm1: side > 0 ? small : [big[0], 0, -big[2]],
          forearm0: [side > 0 ? -0.4 : -1.5, 0, 0], forearm1: [side > 0 ? -1.5 : -0.4, 0, 0],
        },
      };
    },
  },
  {
    id: "dance_legwork", n: "Legwork", period: 0.5, speed: 0,
    pose: (t, D) => {
      // Quick little kicks forward, one after the other, leaning in, arms pumping.
      const b = t * 2, kr = Math.max(0, Math.sin(TAU * b)), kl = Math.max(0, Math.sin(TAU * b + Math.PI));
      const kick = (k: number): FootTarget => ({ x: 0, y: D.height * 0.05 * k, z: D.height * 0.14 * k, pitch: -0.2 * k });
      return {
        hips: [0, crouchY(D, 0.3), -D.height * 0.01],
        feet: [kick(kr), kick(kl)],
        rot: {
          spine: [0.22, 0, 0], skull: [-0.05 + 0.15 * onBeat(b), 0, 0],
          upperArm0: [-0.6 + 0.4 * Math.sin(TAU * b + Math.PI), 0, -0.15], upperArm1: [-0.6 + 0.4 * Math.sin(TAU * b), 0, 0.15],
          forearm0: [-1.4, 0, 0], forearm1: [-1.4, 0, 0],
        },
      };
    },
  },
  {
    id: "dance_pole", n: "Pole dance", period: 4, speed: 0,
    pose: (t, D) => {
      // Facing the pole, one hand high on it: a slow grind down and back up over eight beats, the
      // hips swaying and rolling, a knee hooking up now and then, the free arm flowing out, and a
      // swivel round the pole.
      const b = t * 2, ph = Math.PI * b, drop = 0.5 - 0.5 * Math.cos((TAU * b) / 8);
      const hook = Math.max(0, Math.sin((TAU * b) / 4)) ** 2;
      const knee: FootTarget = { x: -D.height * 0.03 * hook, y: D.height * 0.16 * hook, z: D.height * 0.08 * hook, pitch: 0.5 * hook };
      return {
        spin: 0.45 * Math.sin((TAU * b) / 16),
        hips: [D.height * 0.035 * Math.sin(ph), crouchY(D, 0.12 + 0.6 * drop), D.height * 0.02 * Math.sin(ph + 1)],
        feet: [flat(), knee],
        rot: {
          hips: [0, 0.12 * Math.sin(ph), -0.1 * Math.sin(ph)],
          spine: [0.16 * Math.sin(ph) - 0.08, 0, 0.06 * Math.sin(ph)],
          chest: [0.2 * Math.sin(ph - 1) - 0.1, 0, 0],
          skull: [-0.25 + 0.2 * Math.sin(ph - 2), 0.2 * Math.sin(ph * 0.5), 0],
          // The right hand up on the pole, the left arm out and flowing.
          upperArm0: [-2.3, 0, -0.35], forearm0: [-0.35, 0, 0],
          upperArm1: [-0.6, 0, 0.9 + 0.5 * Math.sin(ph + 1)], forearm1: [-0.5 - 0.4 * Math.sin(ph + 2), 0, 0],
        },
      };
    },
  },
  {
    id: "dance_spin", n: "Spin", period: 2, speed: 0,
    pose: (t, D) => {
      // A slow turn (once round every four beats), arms out wide.
      const b = t * 2, w = Math.sin(TAU * b);
      return {
        spin: TAU * ((b / 4) % 1),
        hips: [0, crouchY(D, 0.15 * onBeat(b)), 0],
        feet: [flat(), flat()],
        rot: {
          skull: [-0.1, 0, 0],
          upperArm0: [-0.1, 0, -1.35 - 0.1 * w], upperArm1: [-0.1, 0, 1.35 + 0.1 * w],
          forearm0: [-0.2, 0, 0], forearm1: [-0.2, 0, 0],
        },
      };
    },
  },
);

// ---- applying a pose to the skeleton ----

export type Rest = Map<string, { p: Vector3; q: Quaternion }>;

const BODY = ["hips", "spine", "chest", "neck", "skull", "clavicle0", "upperArm0", "forearm0", "hand0", "clavicle1", "upperArm1", "forearm1", "hand1",
  "thigh0", "shin0", "foot0", "toe0", "thigh1", "shin1", "foot1", "toe1"];

/** Sizes of this body for the moves (from the skeleton's rest offsets). */
export function dims(rest: Rest, stride = 1): Dims {
  const v = (id: string) => rest.get(id)!.p;
  const leg = v("shin1").length() + v("foot1").length();
  const ankle = v("hips").y + v("thigh1").y + v("shin1").y + v("foot1").y;
  return {
    height: 1 - (ankle - 0.55), leg, ankle, ball: Math.hypot(v("toe1").y, v("toe1").z), stride,
    hip: v("hips").y + v("thigh1").y, thigh: v("shin1").length(), shin: v("foot1").length(),
  };
}

const e = new Euler(), q = new Quaternion(), down = new Vector3(0, -1, 0), Y = new Vector3(0, 1, 0);

/** Poses the skeleton (bones by name, with their rest transforms) for a move at time t. */
/** stride: the model's meta.stride (short steps in narrow long garments). */
/** extra: things about where it's done (a seat's height, for sitting). */
export function applyMove(bones: Record<string, Object3D>, rest: Rest, move: Move, t: number, stride = 1, extra?: Partial<Dims>): Pose {
  const D = { ...dims(rest, stride), ...extra }, P = move.pose(t, D);
  for (const id of BODY) {
    const b = bones[id], r = rest.get(id);
    if (!b || !r) continue;
    b.position.copy(r.p);
    const a = P.rot[id];
    b.quaternion.copy(r.q);
    if (a) b.quaternion.multiply(q.setFromEuler(e.set(a[0], a[1], a[2], "YXZ")));
    const tw = P.twist?.[id];
    if (tw) b.quaternion.multiply(q.setFromAxisAngle(Y, tw));
  }
  if (P.hips) bones.hips.position.add(new Vector3(...P.hips));
  // Knees never quite lock: the hips sit a touch lower, which also leaves the legs room to reach.
  if (P.feet) bones.hips.position.y -= D.height * 0.01;
  if (P.feet) [0, 1].forEach((i) => solveLeg(bones, rest, i, P.feet![i]));
  return P;
}

/** Two-bone leg IK: bends hip and knee so the ankle reaches its target, knee pointing forward. */
function solveLeg(bones: Record<string, Object3D>, rest: Rest, i: number, f: FootTarget) {
  const hips = bones.hips, thigh = bones[`thigh${i}`], shin = bones[`shin${i}`], foot = bones[`foot${i}`], toe = bones[`toe${i}`];
  const qh = hips.quaternion;
  // Hip joint and the ankle's rest position, in the avatar's space.
  const H = rest.get(`thigh${i}`)!.p.clone().applyQuaternion(qh).add(hips.position);
  const a = rest.get(`shin${i}`)!.p.length(), b = rest.get(`foot${i}`)!.p.length();
  const ankleRest = rest.get("hips")!.p.clone().add(rest.get(`thigh${i}`)!.p).add(rest.get(`shin${i}`)!.p).add(rest.get(`foot${i}`)!.p);
  const A = ankleRest.add(new Vector3(f.x ?? 0, f.y, f.z));
  const toA = A.clone().sub(H), d = Math.min(Math.max(toA.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3), u = toA.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d), alpha = Math.acos(Math.min(1, Math.max(-1, cosA)));
  // Forward for this body (the pelvis's facing), square to the hip-ankle line: the knee goes that way.
  const fwd = new Vector3(0, 0, 1).applyQuaternion(qh), perp = fwd.sub(u.clone().multiplyScalar(fwd.dot(u))).normalize();
  const K = H.clone().addScaledVector(u, a * Math.cos(alpha)).addScaledVector(perp, a * Math.sin(alpha));
  const dT = K.clone().sub(H).normalize(), dS = A.clone().sub(K).normalize();
  // World rotations: thigh from straight down to dT (keeping the pelvis's turn), shin from the thigh's line to dS.
  const yaw = new Quaternion().setFromEuler(new Euler(0, new Euler().setFromQuaternion(qh, "YXZ").y, 0, "YXZ"));
  const qT = new Quaternion().setFromUnitVectors(down, dT.clone().applyQuaternion(yaw.clone().invert())).premultiply(yaw);
  const qS = new Quaternion().setFromUnitVectors(dT, dS).multiply(qT);
  const qF = yaw.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), f.pitch));
  // Keep the ankle within what a real one does: from about 20 degrees up (toes towards the shin) to
  // 35 degrees down from square to the shin.
  const fd = new Vector3(0, 0, 1).applyQuaternion(qF), ang = fd.angleTo(dS) - Math.PI / 2;
  const lim = Math.min(Math.max(ang, -0.35), 0.6);
  if (lim !== ang) {
    const axis = new Vector3().crossVectors(dS, fd).normalize();
    if (axis.lengthSq() > 0.5) qF.premultiply(new Quaternion().setFromAxisAngle(axis, lim - ang));
  }
  thigh.quaternion.copy(qh.clone().invert().multiply(qT));
  shin.quaternion.copy(qT.clone().invert().multiply(qS));
  foot.quaternion.copy(qS.clone().invert().multiply(qF));
  toe.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), f.toe ?? 0);
}
