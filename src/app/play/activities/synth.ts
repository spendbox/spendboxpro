"use client";

// A tiny music box made with Web Audio (no sound files): drum loops in a few styles for the
// jukebox, the DJ deck and the dance-off, and piano notes. Only one loop plays at a time.

export type Vibe = "afrobeats" | "amapiano" | "highlife" | "lofi" | "disco" | "reggae";

export const VIBES: { id: Vibe; name: string; bpm: number; color: string; blurb: string }[] = [
  { id: "afrobeats", name: "Afrobeats groove", bpm: 104, color: "#e5484d", blurb: "Bouncy drums and a warm bass. Gets everyone moving." },
  { id: "amapiano", name: "Amapiano log drum", bpm: 112, color: "#7048e8", blurb: "Soft keys, shakers and that deep log drum." },
  { id: "highlife", name: "Highlife sunshine", bpm: 120, color: "#f5a524", blurb: "Bright guitar-style plucks and a busy bell." },
  { id: "lofi", name: "Lo-fi rooftop", bpm: 80, color: "#0b7285", blurb: "Lazy beats and dreamy chords for chilling." },
  { id: "disco", name: "Disco fever", bpm: 120, color: "#e64980", blurb: "Four on the floor and an octave bass. Shine on!" },
  { id: "reggae", name: "Reggae one-drop", bpm: 76, color: "#12a37a", blurb: "Laid-back skanks and a rolling bassline." },
];
export const VIBE_BY_ID = Object.fromEntries(VIBES.map((v) => [v.id, v])) as Record<Vibe, (typeof VIBES)[number]>;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function engine() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function env(c: AudioContext, t: number, peak: number, attack: number, dur: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function osc(c: AudioContext, out: AudioNode, t: number, o: { f: number; to?: number; type?: OscillatorType; dur: number; gain: number; attack?: number; lp?: number }) {
  const n = c.createOscillator();
  n.type = o.type ?? "sine";
  n.frequency.setValueAtTime(o.f, t);
  if (o.to) n.frequency.exponentialRampToValueAtTime(o.to, t + o.dur * 0.8);
  const g = env(c, t, o.gain, o.attack ?? 0.005, o.dur);
  let node: AudioNode = n;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lp;
    node = n.connect(f);
  }
  node.connect(g).connect(out);
  n.start(t);
  n.stop(t + o.dur + 0.05);
}

function noise(c: AudioContext, out: AudioNode, t: number, o: { type: BiquadFilterType; f: number; dur: number; gain: number; q?: number }) {
  if (!noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = o.f;
  f.Q.value = o.q ?? 0.8;
  const g = env(c, t, o.gain, 0.002, o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.05);
}

const kick = (c: AudioContext, out: AudioNode, t: number, g = 0.9) => osc(c, out, t, { f: 150, to: 45, dur: 0.22, gain: g, attack: 0.002 });
const clap = (c: AudioContext, out: AudioNode, t: number, g = 0.4) => {
  noise(c, out, t, { type: "bandpass", f: 1500, dur: 0.12, gain: g, q: 1.2 });
  noise(c, out, t + 0.012, { type: "bandpass", f: 1800, dur: 0.1, gain: g * 0.7, q: 1.2 });
};
const hat = (c: AudioContext, out: AudioNode, t: number, g = 0.12, open = false) =>
  noise(c, out, t, { type: "highpass", f: 7000, dur: open ? 0.18 : 0.04, gain: g });
const shaker = (c: AudioContext, out: AudioNode, t: number, g = 0.07) => noise(c, out, t, { type: "bandpass", f: 5200, dur: 0.06, gain: g, q: 2 });
const rim = (c: AudioContext, out: AudioNode, t: number, g = 0.2) => osc(c, out, t, { f: 1700, dur: 0.03, gain: g, type: "square", lp: 3000 });
const bell = (c: AudioContext, out: AudioNode, t: number, g = 0.12) => {
  osc(c, out, t, { f: 1320, dur: 0.18, gain: g, type: "triangle" });
  osc(c, out, t, { f: 1980, dur: 0.12, gain: g * 0.5 });
};
const bass = (c: AudioContext, out: AudioNode, t: number, m: number, dur: number, g = 0.45) =>
  osc(c, out, t, { f: midi(m), dur, gain: g, type: "triangle", lp: 600, attack: 0.01 });
const logDrum = (c: AudioContext, out: AudioNode, t: number, m: number, g = 0.6) =>
  osc(c, out, t, { f: midi(m) * 1.5, to: midi(m), dur: 0.35, gain: g, type: "sine", attack: 0.004 });
const chord = (c: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, g = 0.08, type: OscillatorType = "triangle", lp = 1800) => {
  for (const m of notes) osc(c, out, t, { f: midi(m), dur, gain: g, type, lp, attack: 0.02 });
};
const pluck = (c: AudioContext, out: AudioNode, t: number, m: number, g = 0.14) =>
  osc(c, out, t, { f: midi(m), dur: 0.25, gain: g, type: "square", lp: 2200, attack: 0.003 });

const on = (pattern: string, step: number) => pattern[step % pattern.length] === "x";

// Chord progressions (MIDI notes), one chord per bar.
const AM_F_C_G = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const C_F_G_C = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
const LOFI = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
const AMAP = [[57, 60, 64, 67], [55, 59, 62, 65], [53, 57, 60, 64], [52, 55, 59, 62]];

/** Plays one 16th-note step of a style. */
function playStep(vibe: Vibe, c: AudioContext, out: AudioNode, t: number, step: number, bar: number, beatLen: number) {
  const s = step % 16;
  const sixteenth = beatLen / 4;
  switch (vibe) {
    case "afrobeats": {
      const ch = AM_F_C_G[bar % 4];
      if (on("x.....x...x.....", s)) kick(c, out, t);
      if (on("....x.......x...", s)) clap(c, out, t);
      if (on("x.xxx.xxx.xxx.xx", s)) hat(c, out, t, 0.08);
      if (on("..x...x...x...x.", s)) shaker(c, out, t, 0.08);
      if (on("...x..x....x..x.", s)) rim(c, out, t, 0.14);
      if (on("x.....x...x.....", s)) bass(c, out, t, ch[0] - 12, sixteenth * 3);
      if (on("..x.....x.x.....", s)) chord(c, out, t, ch, sixteenth * 1.6, 0.07, "square", 1400);
      break;
    }
    case "amapiano": {
      const ch = AMAP[bar % 4];
      if (on("x...x...x...x...", s)) kick(c, out, t, 0.6);
      if (on("....x.......x...", s)) clap(c, out, t, 0.25);
      if (on("xxxxxxxxxxxxxxxx", s)) shaker(c, out, t, s % 2 ? 0.05 : 0.08);
      if (on("x..x..x.....x.x.", s)) logDrum(c, out, t, ch[0] - 24 + (s === 12 ? 7 : s === 14 ? 5 : 0));
      if (s === 0) chord(c, out, t, ch, beatLen * 3.5, 0.05, "sine", 1200);
      if (on("......x.......x.", s)) rim(c, out, t, 0.08);
      break;
    }
    case "highlife": {
      const ch = C_F_G_C[bar % 4];
      if (on("x.......x.......", s)) kick(c, out, t, 0.7);
      if (on("....x.......x...", s)) rim(c, out, t, 0.12);
      if (on("x.x.xx.x.x.xx.x.", s)) bell(c, out, t, 0.08);
      if (on("x.x.x.x.x.x.x.x.", s)) pluck(c, out, t, ch[(s / 2) % 3] + (s >= 8 ? 12 : 0), 0.08);
      if (on("x.....x.x.......", s)) bass(c, out, t, ch[0] - 24, sixteenth * 2);
      break;
    }
    case "lofi": {
      const ch = LOFI[bar % 4];
      if (on("x.......x.x.....", s)) kick(c, out, t, 0.7);
      if (on("....x.......x...", s)) clap(c, out, t, 0.2);
      if (on("x.x.x.x.x.x.x.x.", s)) hat(c, out, t, 0.05);
      if (s === 0) chord(c, out, t, ch, beatLen * 3.8, 0.06, "sine", 900);
      if (on("x.......x.......", s)) bass(c, out, t, ch[0] - 12, beatLen * 1.5, 0.35);
      break;
    }
    case "disco": {
      const ch = AM_F_C_G[bar % 4];
      if (on("x...x...x...x...", s)) kick(c, out, t, 0.8);
      if (on("....x.......x...", s)) clap(c, out, t, 0.3);
      if (on("..x...x...x...x.", s)) hat(c, out, t, 0.1, true);
      if (on("x.x.x.x.x.x.x.x.", s)) bass(c, out, t, ch[0] - 12 + (s % 4 === 2 ? 12 : 0), sixteenth * 1.6, 0.4);
      if (on("..x.......x.....", s)) chord(c, out, t, ch.map((n) => n + 12), sixteenth * 1.4, 0.05, "sawtooth", 2500);
      break;
    }
    case "reggae": {
      const ch = [[55, 59, 62], [60, 64, 67], [62, 66, 69], [60, 64, 67]][bar % 4];
      if (on("........x.......", s)) {
        kick(c, out, t, 0.8);
        clap(c, out, t, 0.2);
      }
      if (on("x.x.x.x.x.x.x.x.", s)) hat(c, out, t, 0.05);
      if (on("....x.......x...", s)) chord(c, out, t, ch, sixteenth * 1.2, 0.08, "square", 1600);
      if (on("x..x....x.x..x..", s)) bass(c, out, t, ch[0] - 24 + (s === 3 || s === 13 ? 7 : 0), sixteenth * 2.5);
      break;
    }
  }
}

let stopCurrent: (() => void) | null = null;

/**
 * Play a style for `seconds` (then it fades out). onBeat is called on every beat (0, 1, 2…),
 * roughly in time with the sound. Returns stop().
 */
export function playLoop(vibe: Vibe, opts: { seconds?: number; onBeat?: (beat: number) => void; volume?: number } = {}) {
  stopCurrent?.();
  const e = engine();
  if (!e) return () => {};
  const { ctx: c } = e;
  const bus = c.createGain();
  bus.gain.value = opts.volume ?? 1;
  bus.connect(e.out);
  const beatLen = 60 / VIBE_BY_ID[vibe].bpm;
  const sixteenth = beatLen / 4;
  const start = c.currentTime + 0.08;
  const end = start + (opts.seconds ?? 24);
  let step = 0;
  let stopped = false;
  const timers: number[] = [];
  const tick = () => {
    if (stopped) return;
    while (start + step * sixteenth < Math.min(c.currentTime + 0.15, end)) {
      const t = start + step * sixteenth;
      playStep(vibe, c, bus, t, step, Math.floor(step / 16), beatLen);
      if (step % 4 === 0 && opts.onBeat) {
        const beat = step / 4;
        timers.push(window.setTimeout(() => !stopped && opts.onBeat?.(beat), Math.max(0, (t - c.currentTime) * 1000)));
      }
      step++;
    }
    if (start + step * sixteenth >= end) stop();
  };
  const id = window.setInterval(tick, 25);
  tick();
  function stop() {
    if (stopped) return;
    stopped = true;
    window.clearInterval(id);
    timers.forEach(clearTimeout);
    const t = c.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.4);
    window.setTimeout(() => bus.disconnect(), 600);
    if (stopCurrent === stop) stopCurrent = null;
  }
  stopCurrent = stop;
  return stop;
}

/** Stop whatever loop is playing. */
export function stopLoop() {
  stopCurrent?.();
}

/** One piano note (MIDI number), a soft bright tone that rings out. */
export function pianoNote(m: number, gain = 0.35) {
  const e = engine();
  if (!e) return;
  const { ctx: c, out } = e;
  const t = c.currentTime + 0.005;
  osc(c, out, t, { f: midi(m), dur: 1.6, gain, type: "triangle", attack: 0.004, lp: 3200 });
  osc(c, out, t, { f: midi(m) * 2, dur: 0.6, gain: gain * 0.25, type: "sine", attack: 0.004 });
  osc(c, out, t, { f: midi(m) * 3, dur: 0.25, gain: gain * 0.08, type: "sine", attack: 0.002 });
}

/** A quick blip for game moments (hits, ticks) with a pitch. */
export function blip(freq = 880, dur = 0.08, type: OscillatorType = "triangle", gain = 0.2) {
  const e = engine();
  if (!e) return;
  osc(e.ctx, e.out, e.ctx.currentTime + 0.005, { f: freq, dur, gain, type });
}
