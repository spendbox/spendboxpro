"use client";

import { useEffect, useRef } from "react";
import { daylight, weatherAt } from "@/lib/city/sky";

// All sound here is made on the fly with the Web Audio API (no audio files to download).
//
// 1. City ambience (useCitySound): a soft distant traffic bed, the odd car driving past,
//    a rare far-off horn, muffled people chatting, quiet birds by day, faint crickets by
//    night, a distant dog now and then, a very rare cat, and rain when it rains.
//    Everything is mixed low so it sits in the background.
//    On top of that, sounds of what's close to you (the 3D view keeps `soundscape` up to
//    date): a helicopter's rotor coming and going as one flies near, busier street sounds
//    (cars, motorbikes, horns) near the roads, people whispering nonsense near crowds, chatter
//    in a foreign-sounding tongue near airports, hotels and markets, dogs among the houses,
//    and cockerels crowing out on the farms. All subtle.
// 2. Game sound effects (playSfx): short, soft "game" sounds for searching, finding,
//    moving, countdown ticks and so on.
//
// Nothing touches the browser until sound is actually used, so this is safe to import
// anywhere (including server rendering).

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ---------------------------------------------------------------------------------------
// Noise buffers: made once per audio context and reused by every sound.
// ---------------------------------------------------------------------------------------

type Noise = { white: AudioBuffer; brown: AudioBuffer };
const noiseCache = new WeakMap<BaseAudioContext, Noise>();

function makeNoise(ctx: BaseAudioContext, seconds: number, brown: boolean) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = white * 0.5;
  }
  return buf;
}

function noise(ctx: BaseAudioContext): Noise {
  let n = noiseCache.get(ctx);
  if (!n) {
    n = { white: makeNoise(ctx, 3, false), brown: makeNoise(ctx, 4, true) };
    noiseCache.set(ctx, n);
  }
  return n;
}

// A noise player (callers start it at a random offset, so repeats never line up).
function noiseSource(ctx: BaseAudioContext, buffer: AudioBuffer, loop = false) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  return src;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

// A stereo panner where supported (falls back to plain pass-through).
function panner(ctx: BaseAudioContext, pan: number): AudioNode & { pan?: AudioParam } {
  if (typeof ctx.createStereoPanner === "function") {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }
  return ctx.createGain();
}

// ---------------------------------------------------------------------------------------
// City ambience
// ---------------------------------------------------------------------------------------

/**
 * What's around you, 0 (nothing) to 1 (right next to it), kept up to date by the 3D view a few
 * times a second. The ambience turns each up or down to match.
 */
export const soundscape = {
  /** The nearest helicopter, and which side it's on (-1 left, 1 right). */
  heli: 0,
  heliPan: 0,
  /** Roads and traffic. */
  street: 0,
  /** Crowds: shops, offices, squares, clubs. */
  people: 0,
  /** Houses (dogs). */
  homes: 0,
  /** Farmland and the countryside (cockerels, dogs). */
  farm: 0,
  /** Airports, hotels, markets, the port: people talking in other languages. */
  foreign: 0,
  /** Inside a building (outside sounds muffled). */
  inside: false,
};

type Mood = { night: boolean; rain: number };

type Engine = {
  ctx: AudioContext;
  master: GainNode; // everything goes through here (used for the fade in/out)
  traffic: GainNode;
  /** The street close by (louder near roads). */
  street: GainNode;
  /** A helicopter's rotor, and which side it's on. */
  heli: GainNode;
  heliPan: AudioNode & { pan?: AudioParam };
  crowd: GainNode;
  rain: GainNode;
  events: GainNode; // one-off sounds (cars, birds, dogs...)
  timers: Set<number>;
  mood: { current: Mood };
};

const MASTER = 0.85;

// A car driving past: rumbling noise that rises then drops in pitch (a little doppler)
// while it travels from one side to the other.
function carPass(e: Engine) {
  const { ctx } = e;
  const t = ctx.currentTime + 0.05;
  const dur = rand(2, 4);
  const mid = t + dur * rand(0.4, 0.6);
  const src = noiseSource(ctx, noise(ctx).brown, true);
  const bp = filter(ctx, "bandpass", 260, 1.2);
  bp.frequency.setValueAtTime(rand(260, 340), t);
  bp.frequency.linearRampToValueAtTime(rand(650, 850), mid);
  bp.frequency.exponentialRampToValueAtTime(rand(220, 280), t + dur);
  const g = ctx.createGain();
  const peak = (e.mood.current.night ? 0.05 : 0.08) * rand(0.6, 1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, mid);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const p = panner(ctx, -0.85 * dir);
  p.pan?.linearRampToValueAtTime(0.85 * dir, t + dur);
  src.connect(bp).connect(g).connect(p).connect(e.events);
  src.start(t, rand(0, 3));
  src.stop(t + dur + 0.05);
}

// A short, soft, far-away horn: two slightly out-of-tune notes, heavily muffled.
function horn(e: Engine) {
  const { ctx } = e;
  const t = ctx.currentTime + 0.05;
  const len = rand(0.15, 0.32);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.012, t + 0.04);
  g.gain.setValueAtTime(0.012, t + len);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.12);
  const lp = filter(ctx, "lowpass", 650);
  const p = panner(ctx, rand(-0.8, 0.8));
  g.connect(lp).connect(p).connect(e.events);
  const base = rand(300, 380);
  for (const ratio of [1, 1.26]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = base * ratio;
    o.detune.value = rand(-15, 15);
    o.connect(g);
    o.start(t);
    o.stop(t + len + 0.15);
  }
}

// A little bird: a few quick warbling notes (a whistle wobbled very fast), kept quiet.
function bird(e: Engine) {
  const { ctx } = e;
  let t = ctx.currentTime + 0.05;
  const notes = Math.floor(rand(2, 5));
  const p = panner(ctx, rand(-0.9, 0.9));
  const out = ctx.createGain();
  out.gain.value = rand(0.004, 0.007);
  out.connect(p).connect(e.events);
  const base = rand(2400, 3600);
  for (let k = 0; k < notes; k++) {
    const len = rand(0.06, 0.14);
    const o = ctx.createOscillator();
    o.type = "sine";
    const f0 = base * rand(0.85, 1.2);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * rand(0.8, 1.3), t + len);
    // The warble: a fast wobble on the pitch
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(18, 40);
    const depth = ctx.createGain();
    depth.gain.value = rand(150, 450);
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.02);
    lfo.stop(t + len + 0.02);
    t += len + rand(0.03, 0.12);
  }
}

// Crickets: a faint, fast trill of filtered noise (not a tone, so it never "beeps").
function crickets(e: Engine) {
  const { ctx } = e;
  const t = ctx.currentTime + 0.05;
  const src = noiseSource(ctx, noise(ctx).white, true);
  const bp = filter(ctx, "bandpass", rand(4300, 5200), 18);
  const g = ctx.createGain();
  g.gain.value = 0;
  const pulses = Math.floor(rand(8, 16));
  const level = rand(0.02, 0.035);
  for (let k = 0; k < pulses; k++) {
    const s = t + k * 0.035;
    g.gain.setValueAtTime(level, s);
    g.gain.setValueAtTime(0, s + 0.018);
  }
  const p = panner(ctx, rand(-0.9, 0.9));
  src.connect(bp).connect(g).connect(p).connect(e.events);
  src.start(t, rand(0, 2));
  src.stop(t + pulses * 0.035 + 0.05);
}

// A distant dog: one to three short, rough "woof"s, muffled by distance.
function dog(e: Engine) {
  const { ctx } = e;
  const t0 = ctx.currentTime + 0.05;
  const barks = Math.floor(rand(1, 4));
  const p = panner(ctx, rand(-0.9, 0.9));
  const lp = filter(ctx, "lowpass", 1300);
  const formant = filter(ctx, "bandpass", rand(550, 800), 2.5);
  const out = ctx.createGain();
  out.gain.value = rand(0.025, 0.04);
  formant.connect(lp).connect(out).connect(p).connect(e.events);
  const pitch = rand(220, 340);
  for (let k = 0; k < barks; k++) {
    const t = t0 + k * rand(0.28, 0.42);
    const len = rand(0.1, 0.16);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    env.connect(formant);
    // The voice: a buzzy note that drops in pitch, plus a puff of breath
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(pitch * 1.3, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.8, t + len);
    o.connect(env);
    o.start(t);
    o.stop(t + len + 0.02);
    const breath = noiseSource(ctx, noise(ctx).white);
    const bg = ctx.createGain();
    bg.gain.value = 0.6;
    breath.connect(bg).connect(env);
    breath.start(t, rand(0, 2));
    breath.stop(t + len + 0.02);
  }
}

// A cat, very rarely: a gliding "mee-ow" (the mouth shape moves from "ee" to "ow").
function cat(e: Engine) {
  const { ctx } = e;
  const t = ctx.currentTime + 0.05;
  const len = rand(0.55, 0.85);
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  const f = rand(480, 620);
  o.frequency.setValueAtTime(f * 0.9, t);
  o.frequency.linearRampToValueAtTime(f * 1.35, t + len * 0.35);
  o.frequency.linearRampToValueAtTime(f * 0.8, t + len);
  const vib = ctx.createOscillator();
  vib.frequency.value = 6;
  const vd = ctx.createGain();
  vd.gain.value = 8;
  vib.connect(vd).connect(o.frequency);
  const formant = filter(ctx, "bandpass", 2200, 4);
  formant.frequency.setValueAtTime(2300, t);
  formant.frequency.exponentialRampToValueAtTime(850, t + len);
  const lp = filter(ctx, "lowpass", 2400);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.08);
  g.gain.setValueAtTime(0.03, t + len * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const p = panner(ctx, rand(-0.8, 0.8));
  o.connect(formant).connect(lp).connect(g).connect(p).connect(e.events);
  o.start(t);
  vib.start(t);
  o.stop(t + len + 0.05);
  vib.stop(t + len + 0.05);
}

// ---- sounds of what's close by

// Vowels by their two main resonances (formants), for made-up speech.
const VOWELS: [number, number][] = [
  [800, 1200], // a
  [500, 1900], // e
  [320, 2300], // i
  [500, 900], // o
  [350, 800], // u
  [650, 1700], // æ
];

// Someone whispering nonsense: breathy syllables (noise through vowel resonances), with hissy
// consonants in between. No pitch at all, which is what makes a whisper a whisper.
function whisper(e: Engine, level: number) {
  const { ctx } = e;
  const buf = noise(ctx).white;
  const p = panner(ctx, rand(-0.8, 0.8));
  const out = ctx.createGain();
  out.gain.value = rand(0.05, 0.09) * level;
  out.connect(p).connect(e.events);
  let t = ctx.currentTime + 0.05;
  const syllables = Math.floor(rand(3, 9));
  for (let k = 0; k < syllables; k++) {
    // A consonant: s, sh, f, h or a little t/k click.
    const c = Math.floor(rand(0, 5));
    const clen = c === 4 ? 0.018 : rand(0.04, 0.09);
    const cs = noiseSource(ctx, buf);
    const cf = c === 0 ? filter(ctx, "highpass", 4800) : c === 1 ? filter(ctx, "bandpass", 2600, 2) : c === 2 ? filter(ctx, "bandpass", 6000, 0.6) : filter(ctx, "bandpass", 1500, 0.8);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(c === 3 ? 0.25 : 0.5, t + 0.01);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + clen);
    cs.connect(cf).connect(cg).connect(out);
    cs.start(t, rand(0, 2));
    cs.stop(t + clen + 0.02);
    t += clen * 0.8;
    // The vowel.
    const [f1, f2] = VOWELS[Math.floor(rand(0, VOWELS.length))];
    const vlen = rand(0.08, 0.2);
    const vs = noiseSource(ctx, buf);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.exponentialRampToValueAtTime(1, t + 0.025);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + vlen);
    for (const [f, q, g] of [[f1, 9, 1], [f2, 11, 0.6]] as const) {
      const bp = filter(ctx, "bandpass", f * rand(0.92, 1.08), q);
      const gg = ctx.createGain();
      gg.gain.value = g;
      vs.connect(bp).connect(gg).connect(vg);
    }
    vg.connect(out);
    vs.start(t, rand(0, 2));
    vs.stop(t + vlen + 0.02);
    t += vlen + (Math.random() < 0.25 ? rand(0.12, 0.3) : rand(0.01, 0.05));
  }
}

// Someone a little way off talking in a language you don't know: a voice (a buzzy note with a
// sing-song pitch) shaped into made-up syllables, muffled by distance. Each speaker gets their
// own pitch, speed and tune, so it never sounds like one language.
function chatter(e: Engine, level: number) {
  const { ctx } = e;
  const t0 = ctx.currentTime + 0.05;
  const base = Math.random() < 0.5 ? rand(95, 140) : rand(170, 240);
  const speed = rand(0.75, 1.25);
  const tonal = Math.random() < 0.4; // each syllable its own tune, or one rising and falling line
  const syllables = Math.floor(rand(5, 14));
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  const voice = ctx.createGain();
  voice.gain.value = 0;
  const f1 = filter(ctx, "bandpass", 700, 6);
  const f2 = filter(ctx, "bandpass", 1500, 8);
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  const lp = filter(ctx, "lowpass", 2200);
  const out = ctx.createGain();
  out.gain.value = rand(0.02, 0.035) * level;
  const p = panner(ctx, rand(-0.8, 0.8));
  o.connect(voice);
  voice.connect(f1).connect(lp);
  voice.connect(f2).connect(g2).connect(lp);
  lp.connect(out).connect(p).connect(e.events);
  let t = t0;
  o.frequency.setValueAtTime(base, t);
  for (let k = 0; k < syllables; k++) {
    const len = rand(0.09, 0.2) / speed;
    const [a, b] = VOWELS[Math.floor(rand(0, VOWELS.length))];
    f1.frequency.setTargetAtTime(a, t, 0.02);
    f2.frequency.setTargetAtTime(b, t, 0.02);
    const pitch = tonal ? base * [1, 1.25, 0.85, 1.12][Math.floor(rand(0, 4))] : base * (1 + 0.25 * Math.sin((k / syllables) * Math.PI) - 0.1 * (k / syllables));
    o.frequency.setTargetAtTime(pitch, t, tonal ? 0.03 : 0.08);
    voice.gain.setTargetAtTime(rand(0.6, 1), t, 0.015);
    voice.gain.setTargetAtTime(0.05, t + len * 0.75, 0.02);
    t += len + (Math.random() < 0.15 ? rand(0.15, 0.35) : 0.02);
  }
  voice.gain.setTargetAtTime(0, t, 0.03);
  o.start(t0);
  o.stop(t + 0.3);
}

// A cockerel crowing far off: "cock-a-doodle-doo", four short notes and a long last one.
function rooster(e: Engine, level: number) {
  const { ctx } = e;
  const t0 = ctx.currentTime + 0.05;
  const base = rand(520, 680);
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  const formant = filter(ctx, "bandpass", 1300, 3);
  const lp = filter(ctx, "lowpass", 2600);
  const g = ctx.createGain();
  g.gain.value = 0;
  const p = panner(ctx, rand(-0.9, 0.9));
  const out = ctx.createGain();
  out.gain.value = rand(0.025, 0.045) * level;
  o.connect(formant).connect(lp).connect(g).connect(out).connect(p).connect(e.events);
  const notes: [number, number, number][] = [
    [1, 0.12, 0.06],
    [1.15, 0.1, 0.05],
    [1.3, 0.12, 0.05],
    [1.45, 0.7, 0],
  ];
  let t = t0;
  for (const [f, len, gap] of notes) {
    o.frequency.setValueAtTime(base * f * 0.9, t);
    o.frequency.linearRampToValueAtTime(base * f * (len > 0.5 ? 1.08 : 1), t + len * 0.4);
    if (len > 0.5) o.frequency.linearRampToValueAtTime(base * f * 0.8, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.02);
    g.gain.setValueAtTime(1, t + len * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    t += len + gap;
  }
  o.start(t0);
  o.stop(t + 0.05);
}

// A motorbike (an okada, a moped) buzzing past: a rough little engine note that rises and
// falls as it goes by.
function motorbike(e: Engine, level: number) {
  const { ctx } = e;
  const t = ctx.currentTime + 0.05;
  const dur = rand(2, 3.5);
  const mid = t + dur * rand(0.4, 0.6);
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  const f = rand(70, 95);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 1.25, mid);
  o.frequency.linearRampToValueAtTime(f * 0.85, t + dur);
  const lp = filter(ctx, "lowpass", 900);
  const g = ctx.createGain();
  const peak = rand(0.025, 0.045) * level;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, mid);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const p = panner(ctx, -0.8 * dir);
  if (p.pan) p.pan.linearRampToValueAtTime(0.8 * dir, t + dur);
  o.connect(lp).connect(g).connect(p).connect(e.events);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// The helicopter: a low "wop-wop-wop" (rumbling noise chopped by the blades) and a faint
// turbine whine. Always running; its loudness and side follow the nearest helicopter.
function startHeli(e: Engine) {
  const { ctx } = e;
  const src = noiseSource(ctx, noise(ctx).brown, true);
  const lp = filter(ctx, "lowpass", 520);
  const chop = ctx.createGain();
  chop.gain.value = 0.35;
  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 11;
  const depth = ctx.createGain();
  depth.gain.value = 0.32;
  lfo.connect(depth).connect(chop.gain);
  src.connect(lp).connect(chop).connect(e.heli);
  const whine = ctx.createOscillator();
  whine.frequency.value = 1850;
  const wg = ctx.createGain();
  wg.gain.value = 0.012;
  whine.connect(wg).connect(e.heli);
  src.start(ctx.currentTime, rand(0, 3));
  lfo.start();
  whine.start();
}

// Muffled chatter: a few "voices" of filtered noise whose loudness and pitch wander
// like syllables, so it reads as people talking a way off rather than static.
function startCrowd(e: Engine, voices: number) {
  const { ctx } = e;
  const buf = noise(ctx).white;
  for (let v = 0; v < voices; v++) {
    const src = noiseSource(ctx, buf, true);
    const centre = rand(350, 1000);
    const bp = filter(ctx, "bandpass", centre, 5);
    const lp = filter(ctx, "lowpass", 1400);
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = panner(ctx, rand(-0.7, 0.7));
    src.connect(bp).connect(lp).connect(g).connect(p).connect(e.crowd);
    src.start(ctx.currentTime, rand(0, 3));
    let talking = Math.random() < 0.5;
    let left = Math.floor(rand(4, 14));
    const step = () => {
      const t = ctx.currentTime;
      // Each voice talks in bursts of syllables, then pauses.
      if (--left <= 0) {
        talking = !talking;
        left = Math.floor(talking ? rand(5, 18) : rand(3, 12));
      }
      const level = talking ? rand(0.2, 1) : 0;
      g.gain.setTargetAtTime(level, t, 0.05);
      bp.frequency.setTargetAtTime(Math.min(1200, Math.max(300, centre * rand(0.8, 1.25))), t, 0.08);
      later(e, step, rand(140, 320));
    };
    later(e, step, rand(0, 400));
  }
}

function later(e: Engine, fn: () => void, ms: number) {
  const id = window.setTimeout(() => {
    e.timers.delete(id);
    fn();
  }, ms);
  e.timers.add(id);
}

// Run fn again and again at random gaps between min and max milliseconds.
function every(e: Engine, fn: () => void, min: number, max: number) {
  const tick = () => {
    fn();
    later(e, tick, rand(min, max));
  };
  later(e, tick, rand(min, max));
}

function setMix(e: Engine, mood: Mood, smooth: number) {
  const t = e.ctx.currentTime;
  e.traffic.gain.setTargetAtTime(mood.night ? 0.045 : 0.09, t, smooth);
  // What's close by.
  const sc = soundscape;
  const muffle = sc.inside ? 0.35 : 1;
  e.street.gain.setTargetAtTime(sc.street * (mood.night ? 0.05 : 0.09) * muffle, t, 0.4);
  e.heli.gain.setTargetAtTime(sc.heli * sc.heli * 0.12 * (sc.inside ? 0.5 : 1), t, 0.3);
  e.heliPan.pan?.setTargetAtTime(Math.max(-0.9, Math.min(0.9, sc.heliPan)), t, 0.3);
  e.crowd.gain.setTargetAtTime((mood.night ? 0.012 : 0.03) * (1 - mood.rain * 0.6), t, smooth);
  e.rain.gain.setTargetAtTime(mood.rain * 0.2, t, smooth);
}

export function useCitySound(on: boolean, roundId: number, progress: number) {
  const engine = useRef<Engine | null>(null);
  const mood = useRef<Mood>({ night: false, rain: 0 });

  // Day/night and rain set the mix (odd rounds start at night, like the game does).
  const night = daylight(progress, roundId % 2 === 1) < 0.35;
  const w = weatherAt(roundId, progress);
  const rain = w.kind === "rain" ? w.strength : 0;
  useEffect(() => {
    mood.current = { night, rain };
    if (engine.current) setMix(engine.current, mood.current, 1.5);
  }, [night, rain]);

  useEffect(() => {
    if (!on) return;
    const Ctx = audioCtor();
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const bus = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);
      return g;
    };
    const events = ctx.createGain();
    events.gain.value = 1;
    events.connect(master);
    const heliPan = panner(ctx, 0);
    heliPan.connect(master);
    const heli = ctx.createGain();
    heli.gain.value = 0;
    heli.connect(heliPan);
    const e: Engine = { ctx, master, traffic: bus(), street: bus(), heli, heliPan, crowd: bus(), rain: bus(), events, timers: new Set(), mood };
    engine.current = e;

    // The steady beds: distant traffic rumble and (when it rains) rain hiss.
    const n = noise(ctx);
    const trafficSrc = noiseSource(ctx, n.brown, true);
    trafficSrc.connect(filter(ctx, "lowpass", 340)).connect(e.traffic);
    trafficSrc.start();
    // The street close by: brighter and busier than the far-off rumble.
    const streetSrc = noiseSource(ctx, n.brown, true);
    streetSrc.connect(filter(ctx, "bandpass", 520, 0.6)).connect(e.street);
    streetSrc.start(ctx.currentTime, 1.5);
    startHeli(e);
    const rainSrc = noiseSource(ctx, n.white, true);
    rainSrc.connect(filter(ctx, "highpass", 1500)).connect(filter(ctx, "lowpass", 7000)).connect(e.rain);
    rainSrc.start();
    startCrowd(e, 3);
    setMix(e, mood.current, 0.3);

    // The occasional sounds. Busier by day, calmer at night; most animals hide in the rain.
    const m = () => mood.current;
    every(e, () => (!m().night || Math.random() < 0.4) && carPass(e), 4000, 11000);
    every(e, () => Math.random() < 0.5 && horn(e), 30000, 70000);
    every(e, () => !m().night && m().rain < 0.4 && bird(e), 6000, 15000);
    every(e, () => m().night && m().rain < 0.4 && crickets(e), 2500, 7000);
    every(e, () => m().rain < 0.6 && dog(e), 25000, 60000);
    every(e, () => m().rain < 0.4 && Math.random() < 0.5 && cat(e), 60000, 140000);

    // What's close by (see soundscape), checked often, played now and then.
    const sc = soundscape;
    const out = () => (sc.inside ? 0.45 : 1);
    every(e, () => setMix(e, m(), 0.4), 300, 400);
    every(e, () => sc.street > 0.25 && Math.random() < sc.street && carPass(e), 2500, 6000);
    every(e, () => sc.street > 0.3 && Math.random() < sc.street * (m().night ? 0.3 : 0.8) && motorbike(e, sc.street * out()), 6000, 16000);
    every(e, () => sc.street > 0.4 && Math.random() < sc.street * 0.35 && horn(e), 12000, 30000);
    every(e, () => sc.people > 0.15 && Math.random() < sc.people && whisper(e, sc.people), 2500, 7000);
    every(e, () => sc.foreign > 0.15 && Math.random() < sc.foreign && chatter(e, sc.foreign), 2500, 6500);
    every(e, () => sc.people > 0.4 && Math.random() < sc.people * 0.3 && chatter(e, sc.people * 0.7), 6000, 15000);
    every(e, () => (sc.homes > 0.2 || sc.farm > 0.2) && m().rain < 0.6 && Math.random() < Math.max(sc.homes, sc.farm) && dog(e), 7000, 18000);
    every(e, () => !m().night && m().rain < 0.4 && Math.random() < Math.max(sc.farm, sc.homes * 0.25, 0.04) && rooster(e, Math.max(0.3, sc.farm) * out()), 9000, 26000);

    // Fade in gently.
    master.gain.setTargetAtTime(MASTER, ctx.currentTime, 0.8);

    // Browsers only start audio after a tap; resume on the next one if needed.
    const resume = () => {
      if (ctx.state === "suspended") void ctx.resume();
    };
    window.addEventListener("pointerdown", resume);
    resume();
    return () => {
      window.removeEventListener("pointerdown", resume);
      e.timers.forEach((id) => clearTimeout(id));
      e.timers.clear();
      engine.current = null;
      // Fade out, then shut the whole thing down (this frees every node at once).
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      window.setTimeout(() => void ctx.close(), 700);
    };
  }, [on]);
}

// ---------------------------------------------------------------------------------------
// Game sound effects
// ---------------------------------------------------------------------------------------

export type Sfx =
  | "search"
  | "found"
  | "miss"
  | "move"
  | "sweep"
  | "pop"
  | "tick"
  | "start"
  | "shield"
  | "caught"
  | "explode"
  | "toy"
  | "respawn"
  | "levelup"
  | "thunder"
  | "decoy"
  | "denied"
  | "honk"
  | "splash"
  | "rustle"
  | "whoosh"
  | "chime"
  | "shutter";

let sfxOn = true;
let sfx: { ctx: AudioContext; out: GainNode } | null = null;

/** Switch game sound effects on or off (off = playSfx does nothing). */
export function setSfxEnabled(on: boolean) {
  sfxOn = on;
}

function sfxEngine() {
  if (sfx) return sfx;
  const Ctx = audioCtor();
  if (!Ctx) return null;
  const ctx = new Ctx();
  // A gentle limiter so stacked sounds never get harsh.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  const out = ctx.createGain();
  out.gain.value = 0.3;
  out.connect(comp).connect(ctx.destination);
  sfx = { ctx, out };
  return sfx;
}

type ToneOpts = {
  at?: number; // seconds from now
  dur: number;
  freq: number;
  to?: number; // glide to this pitch
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  lowpass?: number;
};

function tone(ctx: AudioContext, out: AudioNode, now: number, o: ToneOpts) {
  const t = now + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = ctx.createGain();
  const peak = o.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = osc;
  if (o.lowpass) node = node.connect(filter(ctx, "lowpass", o.lowpass));
  node.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
  return osc;
}

type NoiseOpts = {
  at?: number;
  dur: number;
  type: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  gain?: number;
  attack?: number;
  brown?: boolean;
};

function hiss(ctx: AudioContext, out: AudioNode, now: number, o: NoiseOpts) {
  const t = now + (o.at ?? 0);
  const n = noise(ctx);
  // Looping, so long sounds (thunder) never run off the end of the noise buffer.
  const src = noiseSource(ctx, o.brown ? n.brown : n.white, true);
  const f = filter(ctx, o.type, o.freq, o.q ?? 1);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.5, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, rand(0, 2));
  src.stop(t + o.dur + 0.02);
}

/**
 * Play a short game sound. Safe to call any time (does nothing on the server or when off).
 * `delay` (seconds) starts it a little later, e.g. thunder rolling in after the flash.
 */
export function playSfx(name: Sfx, opts: { delay?: number } = {}) {
  if (!sfxOn) return;
  const eng = sfxEngine();
  if (!eng) return;
  const { ctx, out } = eng;
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime + 0.01 + Math.max(0, opts.delay ?? 0);

  switch (name) {
    case "search":
      // A soft whoosh, then a little tap
      hiss(ctx, out, now, { dur: 0.28, type: "bandpass", freq: 500, to: 2800, q: 1.5, gain: 0.35, attack: 0.12 });
      tone(ctx, out, now, { at: 0.26, dur: 0.12, freq: 900, to: 520, gain: 0.45 });
      hiss(ctx, out, now, { at: 0.26, dur: 0.04, type: "highpass", freq: 2500, gain: 0.15 });
      break;
    case "found":
      // A bright rising chime
      [1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(ctx, out, now, { at: i * 0.07, dur: 0.35 + i * 0.05, freq: f, type: "triangle", gain: 0.4 }),
      );
      tone(ctx, out, now, { at: 0.28, dur: 0.5, freq: 3136, gain: 0.1 });
      break;
    case "miss":
      // A soft low "boop"
      tone(ctx, out, now, { dur: 0.25, freq: 240, to: 140, gain: 0.55, attack: 0.015 });
      hiss(ctx, out, now, { dur: 0.1, type: "lowpass", freq: 300, gain: 0.3, brown: true });
      break;
    case "move":
      // Two quick footsteps with a little swoosh
      hiss(ctx, out, now, { dur: 0.06, type: "lowpass", freq: 600, gain: 0.5 });
      hiss(ctx, out, now, { at: 0.13, dur: 0.06, type: "lowpass", freq: 480, gain: 0.45 });
      hiss(ctx, out, now, { dur: 0.22, type: "bandpass", freq: 1200, to: 2400, q: 1.2, gain: 0.08, attack: 0.08 });
      break;
    case "sweep": {
      // A drone whirr sweeping upward
      const osc = tone(ctx, out, now, { dur: 0.9, freq: 110, to: 440, type: "sawtooth", gain: 0.25, attack: 0.15, lowpass: 1100 });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 28;
      const d = ctx.createGain();
      d.gain.value = 12;
      lfo.connect(d).connect(osc.frequency);
      lfo.start(now);
      lfo.stop(now + 0.95);
      hiss(ctx, out, now, { dur: 0.9, type: "bandpass", freq: 400, to: 3000, q: 2, gain: 0.12, attack: 0.3 });
      break;
    }
    case "pop":
      // Balloon pop, then a coin jingle
      hiss(ctx, out, now, { dur: 0.07, type: "highpass", freq: 900, gain: 0.7, attack: 0.002 });
      tone(ctx, out, now, { dur: 0.06, freq: 180, to: 60, gain: 0.4, attack: 0.002 });
      tone(ctx, out, now, { at: 0.08, dur: 0.1, freq: 988, type: "square", gain: 0.12, lowpass: 4000 });
      tone(ctx, out, now, { at: 0.16, dur: 0.35, freq: 1319, type: "square", gain: 0.12, lowpass: 4000 });
      break;
    case "tick":
      // A very gentle countdown beep
      tone(ctx, out, now, { dur: 0.08, freq: 880, gain: 0.12, attack: 0.008 });
      break;
    case "start":
      // A little fanfare
      [392, 523, 659].forEach((f, i) =>
        tone(ctx, out, now, { at: i * 0.11, dur: 0.16, freq: f, type: "triangle", gain: 0.4 }),
      );
      tone(ctx, out, now, { at: 0.33, dur: 0.6, freq: 784, type: "triangle", gain: 0.45 });
      tone(ctx, out, now, { at: 0.33, dur: 0.6, freq: 392, type: "square", gain: 0.06, lowpass: 1800 });
      break;
    case "shield":
      // A shimmering magic sweep
      for (let k = 0; k < 4; k++) {
        const osc = tone(ctx, out, now, { at: k * 0.05, dur: 0.6, freq: 600 + k * 150, to: 2400 + k * 300, gain: 0.12, attack: 0.08 });
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 9 + k * 2;
        const d = ctx.createGain();
        d.gain.value = 40;
        lfo.connect(d).connect(osc.frequency);
        lfo.start(now);
        lfo.stop(now + 0.75);
      }
      hiss(ctx, out, now, { dur: 0.7, type: "highpass", freq: 5000, gain: 0.06, attack: 0.2 });
      break;
    case "caught":
      // A descending "uh-oh"
      tone(ctx, out, now, { dur: 0.2, freq: 523, to: 494, type: "square", gain: 0.18, lowpass: 1500 });
      tone(ctx, out, now, { at: 0.22, dur: 0.22, freq: 392, to: 370, type: "square", gain: 0.18, lowpass: 1500 });
      tone(ctx, out, now, { at: 0.46, dur: 0.45, freq: 294, to: 220, type: "square", gain: 0.16, lowpass: 1200 });
      break;
    case "explode":
      // A cartoon "ka-boom": a punchy low thump, a crackle, then a rumble that dies away
      tone(ctx, out, now, { dur: 0.5, freq: 140, to: 38, gain: 0.9, attack: 0.004 });
      hiss(ctx, out, now, { dur: 0.18, type: "highpass", freq: 1500, gain: 0.45, attack: 0.002 });
      hiss(ctx, out, now, { dur: 1.3, type: "lowpass", freq: 1400, to: 90, gain: 0.85, attack: 0.01, brown: true });
      for (let k = 0; k < 5; k++) hiss(ctx, out, now, { at: 0.12 + k * rand(0.05, 0.11), dur: 0.04, type: "bandpass", freq: rand(1800, 4200), q: 2, gain: 0.18 });
      break;
    case "toy":
      // A springy "boing" and two rubber-duck squeaks
      tone(ctx, out, now, { dur: 0.35, freq: 220, to: 660, type: "triangle", gain: 0.35, attack: 0.01 });
      for (const at of [0.32, 0.52]) {
        const osc = tone(ctx, out, now, { at, dur: 0.14, freq: 1150, to: 1550, type: "square", gain: 0.12, attack: 0.01, lowpass: 2600 });
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 35;
        const d = ctx.createGain();
        d.gain.value = 60;
        lfo.connect(d).connect(osc.frequency);
        lfo.start(now + at);
        lfo.stop(now + at + 0.16);
      }
      break;
    case "respawn":
      // Back in the game: a rising whoosh into a bright two-note chime
      hiss(ctx, out, now, { dur: 0.45, type: "bandpass", freq: 300, to: 3200, q: 1.4, gain: 0.25, attack: 0.3 });
      tone(ctx, out, now, { at: 0.38, dur: 0.3, freq: 784, type: "triangle", gain: 0.35 });
      tone(ctx, out, now, { at: 0.48, dur: 0.55, freq: 1175, type: "triangle", gain: 0.35 });
      tone(ctx, out, now, { at: 0.48, dur: 0.6, freq: 2349, gain: 0.06 });
      break;
    case "levelup":
      // A happy climbing arpeggio that lands on a chord
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, out, now, { at: i * 0.075, dur: 0.18, freq: f, type: "triangle", gain: 0.35 }));
      for (const f of [1047, 1319, 1568]) tone(ctx, out, now, { at: 0.4, dur: 0.8, freq: f, type: "triangle", gain: 0.22 });
      tone(ctx, out, now, { at: 0.4, dur: 0.8, freq: 523, type: "square", gain: 0.05, lowpass: 1600 });
      break;
    case "thunder":
      // A sharp crack, then a deep rumble that rolls on and fades
      hiss(ctx, out, now, { dur: 0.3, type: "highpass", freq: 1600, gain: 0.22, attack: 0.004 });
      hiss(ctx, out, now, { dur: 3.4, type: "lowpass", freq: 900, to: 110, gain: 0.95, attack: 0.04, brown: true });
      hiss(ctx, out, now, { at: 0.45, dur: 2.8, type: "lowpass", freq: 320, to: 70, gain: 0.8, attack: 0.35, brown: true });
      hiss(ctx, out, now, { at: 1.3, dur: 2.6, type: "lowpass", freq: 220, to: 60, gain: 0.6, attack: 0.5, brown: true });
      break;
    case "decoy":
      // Deploying a decoy: a quick airy whoosh and a soft "pomf" as it inflates
      hiss(ctx, out, now, { dur: 0.4, type: "bandpass", freq: 2400, to: 400, q: 1.3, gain: 0.3, attack: 0.05 });
      tone(ctx, out, now, { at: 0.3, dur: 0.28, freq: 180, to: 420, gain: 0.4, attack: 0.03 });
      hiss(ctx, out, now, { at: 0.3, dur: 0.12, type: "lowpass", freq: 700, gain: 0.3 });
      break;
    case "denied":
      // A soft "nuh-uh": two low buzzes, gently filtered
      tone(ctx, out, now, { dur: 0.12, freq: 196, type: "square", gain: 0.14, attack: 0.01, lowpass: 900 });
      tone(ctx, out, now, { at: 0.16, dur: 0.18, freq: 165, type: "square", gain: 0.14, attack: 0.01, lowpass: 800 });
      break;
    case "honk":
      // A friendly double "beep-beep" from a parked car
      for (const at of [0, 0.2]) {
        tone(ctx, out, now, { at, dur: 0.14, freq: 392, type: "sawtooth", gain: 0.13, attack: 0.008, lowpass: 1500 });
        tone(ctx, out, now, { at, dur: 0.14, freq: 494, type: "sawtooth", gain: 0.1, attack: 0.008, lowpass: 1500 });
      }
      break;
    case "splash":
      // A fountain splash: a watery burst and a few droplets
      hiss(ctx, out, now, { dur: 0.45, type: "bandpass", freq: 1800, to: 700, q: 0.9, gain: 0.35, attack: 0.01 });
      for (let k = 0; k < 4; k++) tone(ctx, out, now, { at: 0.08 + k * rand(0.05, 0.09), dur: 0.06, freq: rand(900, 1700), to: rand(1800, 2600), gain: 0.08 });
      break;
    case "rustle":
      // Leaves shaking
      for (let k = 0; k < 3; k++) hiss(ctx, out, now, { at: k * 0.12, dur: 0.22, type: "bandpass", freq: rand(2500, 4500), q: 0.8, gain: 0.12, attack: 0.04 });
      break;
    case "whoosh":
      // Off down the water slide: a long rushing whoosh and a happy "wheee"
      hiss(ctx, out, now, { dur: 1.6, type: "bandpass", freq: 400, to: 2600, q: 0.7, gain: 0.3, attack: 0.3 });
      tone(ctx, out, now, { at: 0.1, dur: 0.6, freq: 520, to: 1040, type: "triangle", gain: 0.08, attack: 0.05 });
      break;
    case "chime":
      // A little two-note chime (sitting down, a lift arriving)
      tone(ctx, out, now, { dur: 0.25, freq: 784, gain: 0.18 });
      tone(ctx, out, now, { at: 0.12, dur: 0.35, freq: 1047, gain: 0.16 });
      break;
    case "shutter":
      // A phone camera: two quick mechanical clicks
      hiss(ctx, out, now, { dur: 0.035, type: "highpass", freq: 1800, gain: 0.55 });
      tone(ctx, out, now, { dur: 0.03, freq: 1400, to: 600, type: "square", gain: 0.08, lowpass: 3000 });
      hiss(ctx, out, now, { at: 0.075, dur: 0.05, type: "bandpass", freq: 2600, q: 0.9, gain: 0.45 });
      tone(ctx, out, now, { at: 0.075, dur: 0.04, freq: 900, to: 400, type: "square", gain: 0.06, lowpass: 2400 });
      break;
  }
}
