"use client";

import { useEffect, useRef } from "react";
import { daylight, weatherAt } from "@/lib/city/sky";

// City sounds made on the fly with the Web Audio API (no audio files to download):
// a soft traffic hum, the odd car horn, birds by day, crickets by night, and rain.
// Very light on the device, and only runs while sound is switched on.

type Engine = {
  ctx: AudioContext;
  master: GainNode;
  traffic: GainNode;
  rain: GainNode;
  timers: number[];
};

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
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

function loop(ctx: AudioContext, buffer: AudioBuffer, to: AudioNode, filter: BiquadFilterType, freq: number) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  src.connect(f).connect(to);
  src.start();
}

function chirp(e: Engine, night: boolean) {
  const { ctx } = e;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(e.master);
  const o = ctx.createOscillator();
  o.type = "sine";
  if (night) {
    // A cricket: quick high pulses
    o.frequency.value = 4200 + Math.random() * 400;
    for (let k = 0; k < 3; k++) {
      g.gain.setValueAtTime(0.025, t + k * 0.09);
      g.gain.setValueAtTime(0, t + k * 0.09 + 0.05);
    }
  } else {
    // A little bird: a quick rising whistle
    const base = 2200 + Math.random() * 1500;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.22);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.03);
    g.gain.linearRampToValueAtTime(0, t + 0.24);
  }
  o.connect(g);
  o.start(t);
  o.stop(t + 0.4);
}

function horn(e: Engine) {
  const { ctx } = e;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.018, t + 0.02);
  g.gain.setValueAtTime(0.018, t + 0.18);
  g.gain.linearRampToValueAtTime(0, t + 0.22);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1400;
  g.connect(f).connect(e.master);
  for (const hz of [392, 494]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz * (0.9 + Math.random() * 0.2);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.25);
  }
}

export function useCitySound(on: boolean, roundId: number, progress: number) {
  const engine = useRef<Engine | null>(null);
  const mood = useRef({ night: false, rain: 0 });

  // Day/night and rain set the mix.
  const night = daylight(progress, roundId % 2 === 1) < 0.35;
  const w = weatherAt(roundId, progress);
  const rain = w.kind === "rain" ? w.strength : 0;
  useEffect(() => {
    mood.current = { night, rain };
    const e = engine.current;
    if (!e) return;
    const t = e.ctx.currentTime;
    e.rain.gain.setTargetAtTime(rain * 0.22, t, 1.5);
    e.traffic.gain.setTargetAtTime(night ? 0.05 : 0.11, t, 2);
  }, [night, rain]);

  useEffect(() => {
    if (!on) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    const traffic = ctx.createGain();
    traffic.gain.value = 0.1;
    traffic.connect(master);
    const rainGain = ctx.createGain();
    rainGain.gain.value = mood.current.rain * 0.22;
    rainGain.connect(master);
    loop(ctx, noiseBuffer(ctx, 4, true), traffic, "lowpass", 380);
    loop(ctx, noiseBuffer(ctx, 3, false), rainGain, "highpass", 1600);
    const e: Engine = { ctx, master, traffic, rain: rainGain, timers: [] };
    engine.current = e;
    const schedule = (fn: () => void, min: number, max: number) => {
      const tickOnce = () => {
        fn();
        e.timers.push(window.setTimeout(tickOnce, min + Math.random() * (max - min)));
      };
      e.timers.push(window.setTimeout(tickOnce, min + Math.random() * (max - min)));
    };
    schedule(() => mood.current.rain < 0.5 && chirp(e, mood.current.night), 1500, 5000);
    schedule(() => horn(e), 9000, 26000);
    // Browsers only start audio after a tap; resume on the next one if needed.
    const resume = () => ctx.state === "suspended" && ctx.resume();
    window.addEventListener("pointerdown", resume);
    resume();
    return () => {
      window.removeEventListener("pointerdown", resume);
      e.timers.forEach((id) => clearTimeout(id));
      ctx.close();
      engine.current = null;
    };
  }, [on]);
}
