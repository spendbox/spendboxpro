// Police & Thieves' sounds, made with the Web Audio API (no files to download): each gun its own
// shot (a sharp crack, a body of noise shaped for that gun, a low thump and a short echo off the
// buildings), rockets that whoosh, grenades and tank shells that boom with a deep rumble and a
// crackle. Shots further away are quieter and duller, and come from the left or right of where
// you're looking. Silent when the game's sound is off.

import { sfxEnabled } from "../sound";

type Kind = "pistol" | "smg" | "shotgun" | "rifle" | "sniper" | "rocket" | "grenade" | "cannon";
type Pos = { x: number; z: number };

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let echo: { input: GainNode } | null = null;
let noise: AudioBuffer | null = null;
let voices = 0;
const MAX_VOICES = 28;
const ear = { x: 0, z: 0, yaw: 0 };

function audio() {
  if (typeof window === "undefined" || !sfxEnabled()) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    // Everything through a gentle limiter, so many shots at once don't clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(comp).connect(ctx.destination);
    // A short slap-back echo, like a shot between buildings.
    const input = ctx.createGain();
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.11;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    input.connect(delay).connect(lp).connect(fb).connect(delay);
    lp.connect(out);
    echo = { input };
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Where you're listening from (call each frame): your position and which way you face. */
export function listen(x: number, z: number, yaw: number) {
  ear.x = x;
  ear.z = z;
  ear.yaw = yaw;
}

/** How loud (0-1), how far left or right (-1..1) and how dull (lowpass Hz) a sound at p is. */
function place(p: Pos | null, reach: number) {
  if (!p) return { vol: 1, pan: 0, dull: 20000 };
  const dx = p.x - ear.x;
  const dz = p.z - ear.z;
  const d = Math.hypot(dx, dz);
  const vol = Math.max(0, 1 - d / reach) ** 1.6;
  // Your right is (cos yaw, -sin yaw) in the world.
  const pan = d < 1 ? 0 : Math.max(-1, Math.min(1, ((dx * Math.cos(ear.yaw) - dz * Math.sin(ear.yaw)) / d) * 0.85));
  return { vol, pan, dull: Math.max(500, 16000 - d * 140) };
}

/** A chain to the speakers for one sound: gain → lowpass (distance) → pan → out (and the echo). */
function chain(a: AudioContext, vol: number, pan: number, dull: number, wet = 0.35) {
  const g = a.createGain();
  g.gain.value = vol;
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = dull;
  const p = a.createStereoPanner();
  p.pan.value = pan;
  g.connect(lp).connect(p).connect(out!);
  if (wet > 0 && echo) {
    const w = a.createGain();
    w.gain.value = wet;
    p.connect(w).connect(echo.input);
  }
  return g;
}

function noiseBurst(a: AudioContext, to: AudioNode, t: number, o: { type: BiquadFilterType; f: number; f2?: number; q?: number; gain: number; attack?: number; dur: number }) {
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bf = a.createBiquadFilter();
  bf.type = o.type;
  bf.frequency.setValueAtTime(o.f, t);
  if (o.f2) bf.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  bf.Q.value = o.q ?? 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(bf).connect(g).connect(to);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
  return src;
}

function thump(a: AudioContext, to: AudioNode, t: number, f: number, f2: number, gain: number, dur: number) {
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(to);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** Counts a sound while it plays (too many at once and the quiet far ones are skipped). */
function track(node: AudioScheduledSourceNode) {
  voices++;
  node.onended = () => voices--;
}

// Each gun: its crack (high noise), body (band of noise), thump (low sine), length, loudness, reach (m).
const GUN: Record<Exclude<Kind, "grenade" | "cannon">, { crack: number; body: number; q: number; thump: [number, number]; dur: number; vol: number; reach: number }> = {
  pistol: { crack: 4200, body: 1600, q: 1.1, thump: [190, 70], dur: 0.16, vol: 0.55, reach: 90 },
  smg: { crack: 5200, body: 2100, q: 1.2, thump: [220, 90], dur: 0.09, vol: 0.4, reach: 80 },
  rifle: { crack: 3600, body: 1300, q: 0.9, thump: [150, 55], dur: 0.2, vol: 0.62, reach: 130 },
  shotgun: { crack: 2600, body: 800, q: 0.7, thump: [110, 40], dur: 0.32, vol: 0.8, reach: 110 },
  sniper: { crack: 3000, body: 1000, q: 0.8, thump: [95, 35], dur: 0.45, vol: 0.9, reach: 220 },
  rocket: { crack: 1200, body: 700, q: 0.6, thump: [80, 40], dur: 0.25, vol: 0.6, reach: 120 },
};

/** A shot (at: where it was fired; null for your own). */
export function gunshot(kind: Kind, at: Pos | null) {
  if (kind === "grenade") return;
  const a = audio();
  if (!a || !noise) return;
  if (kind === "cannon") return cannon(at);
  const g = GUN[kind];
  const { vol, pan, dull } = place(at, g.reach);
  if (vol < 0.02 || (voices > MAX_VOICES && at)) return;
  const t = a.currentTime;
  const to = chain(a, g.vol * vol, pan, dull, kind === "sniper" ? 0.6 : 0.35);
  const v = 0.94 + Math.random() * 0.12;
  noiseBurst(a, to, t, { type: "highpass", f: g.crack * v, gain: 0.9, dur: 0.035 });
  track(noiseBurst(a, to, t, { type: "bandpass", f: g.body * v, f2: g.body * 0.45, q: g.q, gain: 1, dur: g.dur }));
  thump(a, to, t, g.thump[0] * v, g.thump[1], 0.9, g.dur * 1.3);
  if (kind === "rocket") {
    // The rocket leaving: a rising whoosh.
    noiseBurst(a, to, t + 0.03, { type: "bandpass", f: 500, f2: 2600, q: 1.4, gain: 0.7, attack: 0.05, dur: 0.6 });
  }
}

/** A tank's cannon: a huge low boom with a ring. */
function cannon(at: Pos | null) {
  const a = audio()!;
  const { vol, pan, dull } = place(at, 220);
  if (vol < 0.02) return;
  const t = a.currentTime;
  const to = chain(a, vol, pan, dull, 0.7);
  noiseBurst(a, to, t, { type: "highpass", f: 2400, gain: 0.8, dur: 0.05 });
  track(noiseBurst(a, to, t, { type: "lowpass", f: 2200, f2: 160, gain: 1, dur: 0.7 }));
  thump(a, to, t, 90, 28, 1, 0.9);
  thump(a, to, t + 0.02, 140, 60, 0.5, 0.35);
}

/** An explosion (size: its blast radius in metres): a deep rumble, a blast of noise, a crackle after. */
export function explosion(at: Pos, size: number) {
  const a = audio();
  if (!a || !noise) return;
  const { vol, pan, dull } = place(at, 160 + size * 10);
  if (vol < 0.02) return;
  const t = a.currentTime;
  const big = Math.min(1.6, size / 7);
  const to = chain(a, Math.min(1, 0.85 * vol * big + 0.15), pan, dull, 0.8);
  noiseBurst(a, to, t, { type: "highpass", f: 1800, gain: 0.9, dur: 0.06 });
  track(noiseBurst(a, to, t, { type: "lowpass", f: 4000, f2: 120, gain: 1, attack: 0.004, dur: 1.2 + big * 0.6 }));
  thump(a, to, t, 70, 22, 1, 1.1 + big * 0.5);
  thump(a, to, t, 45, 20, 0.8, 1.6 + big * 0.5);
  // Bits landing after the blast.
  for (let k = 0; k < 6; k++) noiseBurst(a, to, t + 0.25 + Math.random() * 0.9, { type: "bandpass", f: 1500 + Math.random() * 2500, q: 2, gain: 0.18, dur: 0.05 + Math.random() * 0.06 });
}

/** Little sounds of your own: a hit, a head shot, reloading, an empty click, a grenade's pin. */
export function cue(k: "hit" | "head" | "reload" | "empty" | "pin" | "down") {
  const a = audio();
  if (!a || !noise) return;
  const t = a.currentTime;
  const to = chain(a, 0.45, 0, 20000, 0);
  if (k === "hit" || k === "head") {
    thump(a, to, t, k === "head" ? 1400 : 950, k === "head" ? 1300 : 900, 0.35, 0.07);
    if (k === "head") thump(a, to, t + 0.05, 1900, 1850, 0.3, 0.08);
  } else if (k === "reload") {
    noiseBurst(a, to, t, { type: "bandpass", f: 2600, q: 4, gain: 0.5, dur: 0.04 });
    noiseBurst(a, to, t + 0.25, { type: "bandpass", f: 1900, q: 4, gain: 0.6, dur: 0.05 });
  } else if (k === "empty") noiseBurst(a, to, t, { type: "bandpass", f: 3200, q: 6, gain: 0.4, dur: 0.03 });
  else if (k === "pin") noiseBurst(a, to, t, { type: "bandpass", f: 4200, q: 8, gain: 0.4, dur: 0.06 });
  else {
    thump(a, to, t, 660, 640, 0.3, 0.12);
    thump(a, to, t + 0.1, 990, 980, 0.3, 0.16);
  }
}
