// Extra sounds for the minigames, made with the Web Audio API (no files): drum hits for the
// talking drums, and a short tone. Quiet, and silent when the game's sound is off.

import { sfxEnabled } from "../sound";

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined" || !sfxEnabled()) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A drum hit: lane 0 low (dùndún), 1 middle, 2 high (a slap). Talking drums bend in pitch. */
export function drum(lane: number, bend = true) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const f = [110, 170, 260][lane] ?? 170;
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f * (bend ? 1.35 : 1), t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.4);
  // The skin's slap.
  const len = Math.floor(a.sampleRate * 0.04);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const n = a.createBufferSource();
  n.buffer = buf;
  const ng = a.createGain();
  ng.gain.value = lane === 2 ? 0.25 : 0.1;
  const hp = a.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  n.connect(hp).connect(ng).connect(a.destination);
  n.start(t);
}

/** A short tone (for countdowns and the odd effect). */
export function tone(freq: number, dur = 0.12, type: OscillatorType = "triangle", gain = 0.15) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
