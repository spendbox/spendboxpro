// Short sounds for the city's world events (sirens, cheers, fireworks, thunder, splashes,
// drums, engines, a magic chime, an eerie hum...), made on the fly with the Web Audio API: no
// audio files. They play when an event starts near where you're looking (quieter further
// away, panned left or right), and when you fly to one. Off when the game's sound is off:
// the game calls setEventSoundsEnabled(on) alongside setSfxEnabled.
//
// Nothing touches the browser until a sound actually plays (safe to import anywhere).

export type EventSound =
  | "siren"
  | "alarm"
  | "cheer"
  | "fireworks"
  | "thunder"
  | "splash"
  | "drums"
  | "engine"
  | "jet"
  | "chime"
  | "eerie"
  | "hum"
  | "horn"
  | "foghorn"
  | "boom"
  | "wind"
  | "moo"
  | "quack"
  | "bark"
  | "roar"
  | "whistle"
  | "crowd"
  | "zap"
  | "none";

let enabled = true;
let eng: { ctx: AudioContext; out: GainNode; noise: AudioBuffer; brown: AudioBuffer } | null = null;

/** Switch event sounds on or off (off = playEventSound does nothing). */
export function setEventSoundsEnabled(on: boolean) {
  enabled = on;
}

function engine() {
  if (eng) return eng;
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 6;
  const out = ctx.createGain();
  out.gain.value = 0.32;
  out.connect(comp).connect(ctx.destination);
  const make = (seconds: number, brown: boolean) => {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w * 0.5;
    }
    return buf;
  };
  eng = { ctx, out, noise: make(2, false), brown: make(3, true) };
  return eng;
}

type Bus = { ctx: AudioContext; dest: AudioNode; now: number; noise: AudioBuffer; brown: AudioBuffer };

function tone(b: Bus, at: number, dur: number, freq: number, opts: { to?: number; type?: OscillatorType; gain?: number; attack?: number; lowpass?: number; vibrato?: [number, number] } = {}) {
  const { ctx } = b;
  const t = b.now + at;
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  if (opts.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = opts.vibrato[0];
    const g = ctx.createGain();
    g.gain.value = opts.vibrato[1];
    lfo.connect(g).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.4, t + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (opts.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.lowpass;
    node = node.connect(f);
  }
  node.connect(g).connect(b.dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}

function hiss(b: Bus, at: number, dur: number, type: BiquadFilterType, freq: number, opts: { to?: number; q?: number; gain?: number; attack?: number; brown?: boolean } = {}) {
  const { ctx } = b;
  const t = b.now + at;
  const src = ctx.createBufferSource();
  src.buffer = opts.brown ? b.brown : b.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = opts.q ?? 1;
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.4, t + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(b.dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Play an event sound. volume 0..1 (by distance), pan -1 (left) .. 1 (right), delay seconds.
 * Safe to call any time; does nothing when off, on the server, or before the page was touched.
 */
export function playEventSound(name: EventSound, opts: { volume?: number; pan?: number; delay?: number } = {}) {
  if (!enabled || name === "none") return;
  const vol = Math.min(1, Math.max(0, opts.volume ?? 1));
  if (vol < 0.04) return;
  const e = engine();
  if (!e) return;
  const { ctx } = e;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const g = ctx.createGain();
  g.gain.value = vol;
  if (typeof ctx.createStereoPanner === "function") {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.min(1, Math.max(-1, opts.pan ?? 0));
    g.connect(p).connect(e.out);
  } else g.connect(e.out);
  const b: Bus = { ctx, dest: g, now: ctx.currentTime + 0.02 + Math.max(0, opts.delay ?? 0), noise: e.noise, brown: e.brown };
  switch (name) {
    case "siren":
      // Wee-woo, twice, a little far off.
      for (let k = 0; k < 4; k++) tone(b, k * 0.45, 0.45, k % 2 ? 660 : 880, { type: "triangle", gain: 0.22, attack: 0.04, lowpass: 2400 });
      break;
    case "alarm":
      // A bell ringing hard.
      for (let k = 0; k < 14; k++) tone(b, k * 0.09, 0.08, 1250, { type: "square", gain: 0.1, lowpass: 3200 });
      break;
    case "cheer":
    case "crowd":
      // A crowd: many voices (filtered noise swells) and a few whoops.
      hiss(b, 0, name === "cheer" ? 2.4 : 2.8, "bandpass", 900, { q: 0.6, gain: 0.35, attack: 0.25 });
      hiss(b, 0.1, 2.2, "bandpass", 1700, { q: 0.8, gain: 0.18, attack: 0.3 });
      if (name === "cheer") for (let k = 0; k < 4; k++) tone(b, 0.2 + k * 0.35, 0.3, rnd(500, 800), { to: rnd(900, 1300), type: "triangle", gain: 0.05, attack: 0.05 });
      break;
    case "fireworks":
      for (let k = 0; k < 5; k++) {
        const at = k * rnd(0.3, 0.55);
        hiss(b, at, 0.35, "bandpass", 600, { to: 2400, q: 2, gain: 0.08, attack: 0.25 });
        tone(b, at + 0.35, 0.4, 110, { to: 40, gain: 0.6, attack: 0.003 });
        hiss(b, at + 0.35, 0.6, "highpass", 2500, { gain: 0.18, attack: 0.003 });
      }
      break;
    case "thunder":
      hiss(b, 0, 0.25, "highpass", 1500, { gain: 0.3, attack: 0.003 });
      hiss(b, 0.05, 3, "lowpass", 800, { to: 90, gain: 0.95, attack: 0.03, brown: true });
      hiss(b, 0.6, 2.4, "lowpass", 260, { to: 60, gain: 0.7, attack: 0.3, brown: true });
      break;
    case "boom":
      tone(b, 0, 0.7, 120, { to: 32, gain: 0.95, attack: 0.004 });
      hiss(b, 0, 1.8, "lowpass", 1200, { to: 80, gain: 0.9, attack: 0.01, brown: true });
      for (let k = 0; k < 6; k++) hiss(b, 0.1 + k * 0.08, 0.05, "bandpass", rnd(1500, 4000), { q: 2, gain: 0.15 });
      break;
    case "splash":
      hiss(b, 0, 0.6, "bandpass", 1600, { to: 600, q: 0.8, gain: 0.45 });
      for (let k = 0; k < 6; k++) tone(b, 0.1 + k * rnd(0.04, 0.09), 0.07, rnd(900, 1600), { to: rnd(1800, 2800), gain: 0.07 });
      break;
    case "drums":
      // A talking-drum groove: low booms and bright slaps.
      [0, 0.3, 0.45, 0.75, 1.05, 1.2, 1.5, 1.8].forEach((at, k) => {
        if (k % 3 === 0) tone(b, at, 0.25, 140, { to: 70, gain: 0.7, attack: 0.004 });
        else tone(b, at, 0.15, k % 2 ? 330 : 260, { to: k % 2 ? 420 : 200, gain: 0.35, attack: 0.003 });
        hiss(b, at, 0.05, "highpass", 3000, { gain: 0.08 });
      });
      break;
    case "engine":
      // A big engine roaring past.
      tone(b, 0, 2.2, 55, { to: 90, type: "sawtooth", gain: 0.3, attack: 0.4, lowpass: 500, vibrato: [18, 6] });
      hiss(b, 0, 2.2, "lowpass", 400, { to: 900, gain: 0.4, attack: 0.5, brown: true });
      break;
    case "jet":
      hiss(b, 0, 3, "bandpass", 300, { to: 2400, q: 0.7, gain: 0.5, attack: 1.2 });
      hiss(b, 0, 3, "lowpass", 300, { gain: 0.5, attack: 1, brown: true });
      break;
    case "chime":
      [1047, 1319, 1568, 2093, 2637].forEach((f, k) => tone(b, k * 0.09, 0.9, f, { type: "triangle", gain: 0.18 }));
      tone(b, 0.45, 1.2, 3136, { gain: 0.06 });
      break;
    case "eerie":
      tone(b, 0, 3, 220, { to: 196, type: "sine", gain: 0.2, attack: 0.8, vibrato: [5, 6] });
      tone(b, 0.3, 2.7, 311, { to: 293, type: "sine", gain: 0.12, attack: 0.8, vibrato: [4, 8] });
      hiss(b, 0, 3, "bandpass", 500, { to: 1400, q: 4, gain: 0.08, attack: 1 });
      break;
    case "hum":
      // A flying saucer: a wobbling electric hum.
      tone(b, 0, 3, 90, { type: "sawtooth", gain: 0.2, attack: 0.6, lowpass: 600, vibrato: [7, 12] });
      tone(b, 0, 3, 720, { to: 1100, type: "sine", gain: 0.06, attack: 0.8, vibrato: [3, 60] });
      break;
    case "horn":
      // Wedding-convoy honking: beep-beep-beeeep.
      [0, 0.22, 0.44].forEach((at, k) => {
        const len = k === 2 ? 0.5 : 0.16;
        tone(b, at, len, 392, { type: "sawtooth", gain: 0.12, attack: 0.008, lowpass: 1500 });
        tone(b, at, len, 494, { type: "sawtooth", gain: 0.1, attack: 0.008, lowpass: 1500 });
      });
      break;
    case "foghorn":
      tone(b, 0, 2.2, 87, { type: "sawtooth", gain: 0.35, attack: 0.15, lowpass: 380 });
      tone(b, 0, 2.2, 130, { type: "sawtooth", gain: 0.18, attack: 0.15, lowpass: 380 });
      break;
    case "wind":
      hiss(b, 0, 3.5, "bandpass", 300, { to: 900, q: 1.5, gain: 0.45, attack: 1.2 });
      hiss(b, 0.5, 3, "bandpass", 1200, { to: 500, q: 3, gain: 0.15, attack: 1 });
      break;
    case "moo":
      tone(b, 0, 1.1, 140, { to: 110, type: "sawtooth", gain: 0.25, attack: 0.12, lowpass: 700, vibrato: [5, 3] });
      break;
    case "quack":
      for (const at of [0, 0.3]) tone(b, at, 0.18, 520, { to: 380, type: "sawtooth", gain: 0.18, attack: 0.01, lowpass: 1600 });
      break;
    case "bark":
      for (const at of [0, 0.28]) {
        tone(b, at, 0.14, 420, { to: 260, type: "sawtooth", gain: 0.2, attack: 0.005, lowpass: 1800 });
        hiss(b, at, 0.1, "bandpass", 900, { q: 1.5, gain: 0.2 });
      }
      break;
    case "roar":
      tone(b, 0, 1.4, 120, { to: 70, type: "sawtooth", gain: 0.35, attack: 0.1, lowpass: 900, vibrato: [24, 10] });
      hiss(b, 0, 1.4, "bandpass", 500, { to: 250, q: 1, gain: 0.35, attack: 0.1 });
      break;
    case "whistle":
      tone(b, 0, 0.25, 2600, { type: "sine", gain: 0.2, vibrato: [40, 120] });
      tone(b, 0.35, 0.6, 2600, { type: "sine", gain: 0.2, vibrato: [40, 120] });
      break;
    case "zap":
      tone(b, 0, 0.5, 1800, { to: 120, type: "sawtooth", gain: 0.15, lowpass: 3000 });
      hiss(b, 0, 0.4, "highpass", 3000, { gain: 0.2 });
      tone(b, 0.15, 1.2, 60, { to: 40, type: "sawtooth", gain: 0.15, attack: 0.05, lowpass: 300 });
      break;
  }
}
