"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Crosshair, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { drum, tone } from "../sfx";
import { FullScreen } from "../fullscreen";
import { canWebGL } from "../webgl";
import { Pad, Pads, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";
import { planRounds, RangeWorld, WEAPONS, type RoundPlan, type ShotResult } from "./range3d-scene";

// Shooting Range in 3D: you stand at the bench of an indoor range and shoot paper targets.
// Drag anywhere to aim (the drag moves your aim), tap without dragging (or FIRE) to shoot.
// Three rounds: static papers at 10 m (pistol), turning targets at 25 m against the clock
// (carbine), runners on rails at 50 m with a scope (rifle, hits count double). Rings score 10
// (the orange bullseye) down to 1; blue hostages cost points. Each round has a few magazines;
// Reload swaps one in (and it happens by itself when you run dry). The targets come from the
// seed, so everyone playing the same seed gets the same range.

type Phase = "intro" | "play" | "over" | "summary";
type Result = { name: string; tag: string; points: number; shots: number; hits: number; bulls: number; hostages: number };
type Pop = { id: number; text: string; sub?: string; colour: string; big?: boolean };

type G = {
  phase: Phase;
  phaseT: number;
  ri: number;
  /** Round time (only runs while playing: the targets follow it). */
  t: number;
  clock: number;
  score: number;
  rScore: number;
  shots: number;
  hits: number;
  bulls: number;
  hostages: number;
  mag: number;
  reserve: number;
  reloadUntil: number;
  nextShot: number;
  yaw: number;
  pitch: number;
  baseYaw: number;
  basePitch: number;
  recoil: number;
  scoped: boolean;
  zoom: number;
  k: number;
  sx: number;
  sy: number;
  drag: { id: number; x: number; y: number; at: number; moved: number } | null;
  results: Result[];
  count: number;
  hinted: boolean;
};

const INTRO = 3.2;
const SUMMARY = 7;

export default function Range3D({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const plans = useMemo(() => planRounds(seed), [seed]);
  const wrap = useRef<HTMLDivElement>(null);
  const world = useRef<RangeWorld | null>(null);
  const cross = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const timeBar = useRef<HTMLDivElement>(null);
  const autoBar = useRef<HTMLDivElement>(null);
  const timers = useRef(new Set<number>());
  const popId = useRef(1);
  const g = useRef<G | null>(null);
  const [failed] = useState(() => !canWebGL());
  const [pops, setPops] = useState<Pop[]>([]);
  const [hitMark, setHitMark] = useState<{ id: number; colour: string } | null>(null);
  const [hud, setHud] = useState({ phase: "intro" as Phase, ri: 0, score: 0, rScore: 0, mag: 0, reserve: 0, reloading: false, scoped: false, count: 3, hint: true, results: [] as Result[] });

  function state(): G {
    if (!g.current) {
      const p = plans[0];
      const a = RangeWorld.aimAt(p.aim);
      g.current = {
        phase: "intro", phaseT: 0, ri: 0, t: 0, clock: 0, score: 0, rScore: 0, shots: 0, hits: 0, bulls: 0, hostages: 0,
        mag: p.mag, reserve: p.mag * (p.mags - 1), reloadUntil: 0, nextShot: 0, yaw: a.yaw, pitch: a.pitch, baseYaw: a.yaw, basePitch: a.pitch,
        recoil: 0, scoped: false, zoom: 0, k: 0, sx: 0, sy: 0, drag: null, results: [], count: 3, hinted: false,
      };
    }
    return g.current;
  }
  function sync() {
    const s = state();
    setHud({ phase: s.phase, ri: s.ri, score: s.score, rScore: s.rScore, mag: s.mag, reserve: s.reserve, reloading: s.reloadUntil > s.clock, scoped: s.scoped, count: s.count, hint: !s.hinted, results: s.results });
  }
  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }
  function pop(p: Omit<Pop, "id">) {
    const id = popId.current++;
    setPops((list) => [...list.slice(-3), { ...p, id }]);
    later(() => setPops((list) => list.filter((x) => x.id !== id)), 1000);
  }

  // ------------------------------------------------------------------ the round's flow

  function startRound(ri: number) {
    const s = state();
    const p = plans[ri];
    const a = RangeWorld.aimAt(p.aim);
    Object.assign(s, { phase: "intro", phaseT: 0, ri, t: 0, rScore: 0, shots: 0, hits: 0, bulls: 0, hostages: 0, mag: p.mag, reserve: p.mag * (p.mags - 1), reloadUntil: 0, nextShot: 0, yaw: a.yaw, pitch: a.pitch, baseYaw: a.yaw, basePitch: a.pitch, recoil: 0, scoped: false, count: 3 });
    world.current?.loadRound(p);
    world.current?.lower(true);
    sync();
  }
  function go() {
    const s = state();
    if (s.phase !== "intro") return;
    s.phase = "play";
    s.phaseT = 0;
    world.current?.lower(false);
    playSfx("start");
    pop({ text: "GO!", colour: "#ffd43b", big: true });
    sync();
  }
  function endRound(why: string) {
    const s = state();
    if (s.phase !== "play") return;
    const p = plans[s.ri];
    s.phase = "over";
    s.phaseT = 0;
    s.scoped = false;
    s.drag = null;
    s.results = [...s.results, { name: p.name, tag: p.tag, points: s.rScore, shots: s.shots, hits: s.hits, bulls: s.bulls, hostages: s.hostages }];
    pop({ text: why, colour: "#fff", big: true });
    sync();
  }
  function next() {
    const s = state();
    if (s.phase !== "summary") return;
    if (s.ri + 1 < plans.length) startRound(s.ri + 1);
    else finish(Math.max(0, s.score));
  }

  // ------------------------------------------------------------------ shooting

  function aimLimits(s: G, p: RoundPlan) {
    s.yaw = Math.max(s.baseYaw - p.yawLimit, Math.min(s.baseYaw + p.yawLimit, s.yaw));
    s.pitch = Math.max(s.basePitch - 7, Math.min(s.basePitch + 7, s.pitch));
  }
  function bang(w: RoundPlan["weapon"]) {
    drum(0, false);
    drum(2, false);
    if (w === "rifle") tone(62, 0.3, "sine", 0.3);
    else if (w === "carbine") tone(95, 0.12, "square", 0.05);
  }
  function fire() {
    const s = state();
    const W = world.current;
    if (s.phase !== "play" || !W) return;
    const p = plans[s.ri];
    if (s.reloadUntil > s.clock || s.clock < s.nextShot) return;
    if (s.mag <= 0) {
      tone(1900, 0.03, "square", 0.05);
      reload();
      return;
    }
    s.hinted = true;
    s.mag--;
    s.shots++;
    const wp = WEAPONS[p.weapon];
    s.nextShot = s.clock + wp.rof;
    const res: ShotResult = W.shoot(s.yaw + s.sx, s.pitch + s.recoil + s.sy);
    s.recoil += wp.kick;
    W.fire();
    bang(p.weapon);
    if (res.kind === "ring") {
      const pts = res.ring * p.mult;
      if (res.ring > 0) {
        s.hits++;
        s.rScore += pts;
        s.score += pts;
        setHitMark({ id: popId.current++, colour: res.ring === 10 ? "#ff922b" : "#fff" });
      }
      if (res.ring === 10) {
        s.bulls++;
        playSfx("found");
        pop({ text: "BULLSEYE!", sub: `+${pts}`, colour: "#ff922b", big: true });
      } else if (res.ring > 0) {
        later(() => tone(900 + res.ring * 70, 0.07, "triangle", 0.1), 60);
        pop({ text: `+${pts}`, sub: res.ring >= 8 ? "Great shot" : undefined, colour: res.ring >= 8 ? "#69db7c" : "#f1f3f5" });
      } else pop({ text: "Edge", sub: "0", colour: "#ced4da" });
    } else if (res.kind === "hostage") {
      s.hostages++;
      s.rScore -= p.penalty;
      s.score -= p.penalty;
      playSfx("denied");
      setHitMark({ id: popId.current++, colour: "#ff6b6b" });
      pop({ text: "HOSTAGE!", sub: `-${p.penalty}`, colour: "#ff6b6b", big: true });
    } else {
      if (res.steel) later(() => tone(2400, 0.15, "sine", 0.06), 80);
      pop({ text: "Miss", colour: "#adb5bd" });
    }
    if (s.mag === 0 && s.reserve > 0) later(() => reload(), 280);
    sync();
  }
  function reload() {
    const s = state();
    const p = plans[s.ri];
    if (s.phase !== "play" || s.reloadUntil > s.clock || s.reserve <= 0 || s.mag >= p.mag) return;
    const dur = WEAPONS[p.weapon].reload;
    s.reloadUntil = s.clock + dur;
    s.scoped = false;
    world.current?.startReload(dur);
    playSfx("shutter");
    const ri = s.ri;
    later(() => {
      if (s.ri !== ri || s.phase !== "play") return;
      const n = Math.max(0, Math.min(p.mag - s.mag, s.reserve));
      s.mag += n;
      s.reserve -= n;
      playSfx("shutter");
      sync();
    }, dur * 1000);
    sync();
  }
  function toggleScope() {
    const s = state();
    const p = plans[s.ri];
    if (s.phase !== "play" || !p.scopeFov || s.reloadUntil > s.clock) return;
    s.scoped = !s.scoped;
    tone(s.scoped ? 520 : 380, 0.05, "triangle", 0.06);
    sync();
  }

  useKeys((k) => {
    const s = state();
    if (k === " " || k === "f" || k === "Enter") {
      if (s.phase === "intro") go();
      else if (s.phase === "summary") next();
      else fire();
    } else if (k === "r") reload();
    else if (k === "z" || k === "Shift") toggleScope();
    else if (s.phase === "play") {
      const step = 0.35 * (s.scoped ? 0.3 : 1);
      if (k === "ArrowLeft") s.yaw += step;
      if (k === "ArrowRight") s.yaw -= step;
      if (k === "ArrowUp") s.pitch += step;
      if (k === "ArrowDown") s.pitch -= step;
      aimLimits(s, plans[s.ri]);
    }
  });

  // ------------------------------------------------------------------ the 3D view and its loop

  useEffect(() => {
    const box = wrap.current;
    if (!box) return;
    // A fresh canvas each time (a context that was let go can't be had again).
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full";
    box.prepend(canvas);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      canvas.remove();
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const W = new RangeWorld({ anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
    W.attach(renderer);
    world.current = W;
    const s = state();
    W.loadRound(plans[s.ri]);
    W.lower(true);
    let w = 0;
    let h = 0;
    const size = () => {
      const r = box.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false);
      W.setSize(w, h);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = plans[s.ri];
      s.clock += dt;
      s.phaseT += dt;
      // Flow.
      if (s.phase === "intro") {
        const c = Math.max(1, 3 - Math.floor(s.phaseT / ((INTRO - 0.2) / 3)));
        if (c !== s.count) {
          s.count = c;
          playSfx("tick");
          sync();
        }
        if (s.phaseT >= INTRO) go();
      } else if (s.phase === "play") {
        s.t += dt;
        const lastEnd = Math.max(...p.targets.map((x) => (x.motion.kind === "turn" ? x.motion.off : x.motion.kind === "rail" ? x.motion.t1 : Infinity))) + 0.6;
        const dry = s.mag === 0 && s.reserve === 0 && s.reloadUntil <= s.clock;
        if (s.t >= p.seconds) endRound("Time!");
        else if (dry && s.clock >= s.nextShot + 0.5) endRound("Out of ammo");
        else if (s.t >= lastEnd) endRound("Cease fire");
        if (s.t > 4 && !s.hinted) {
          s.hinted = true;
          sync();
        }
      } else if (s.phase === "over" && s.phaseT >= 1.1) {
        s.phase = "summary";
        s.phaseT = 0;
        W.lower(true);
        playSfx(s.ri + 1 < plans.length ? "chime" : "levelup");
        sync();
      } else if (s.phase === "summary") {
        if (autoBar.current) autoBar.current.style.width = `${Math.min(100, (s.phaseT / SUMMARY) * 100)}%`;
        if (s.phaseT >= SUMMARY) next();
      }
      // Aim: recoil settles, the sights sway with your breathing, zoom eases in and out.
      s.recoil *= Math.exp(-dt * 6.5);
      const wp = WEAPONS[p.weapon];
      const c = s.clock;
      const amp = wp.sway * (s.scoped ? 1.25 : 1);
      s.sx = amp * (Math.sin(c * 0.83) * 0.75 + Math.sin(c * 2.1 + 1.3) * 0.3);
      s.sy = amp * (Math.sin(c * 1.21 + 0.4) * 0.6 + Math.sin(c * 0.37) * 0.5 + Math.sin(c * 2.9) * 0.15);
      const kTo = s.phase === "play" || s.phase === "over" || (s.phase === "intro" && s.phaseT > INTRO - 0.9) ? 1 : 0;
      s.k += (kTo - s.k) * Math.min(1, dt * 3.2);
      s.zoom += ((s.scoped ? 1 : 0) - s.zoom) * Math.min(1, dt * 12);
      const playFov = p.scopeFov ? p.fov + (p.scopeFov - p.fov) * s.zoom : p.fov;
      const ek = s.k * s.k * (3 - 2 * s.k);
      const fov = 52 + (playFov - 52) * ek;
      const yawV = s.baseYaw + (s.yaw - s.baseYaw) * ek;
      const pitchV = s.basePitch - 1.5 * (1 - ek) + (s.pitch - s.basePitch) * ek;
      const scoped = s.zoom > 0.6;
      W.setView(yawV + (scoped ? s.sx : 0), pitchV + s.recoil + (scoped ? s.sy : 0), fov, s.k);
      W.setTime(s.t);
      W.update(dt);
      W.render(renderer, !scoped);
      // The crosshair drifts with the sway (the scope's view sways instead).
      if (cross.current) {
        const f = Math.tan(THREE.MathUtils.degToRad(fov / 2));
        const px = (-Math.tan(THREE.MathUtils.degToRad(s.sx)) / f) * (h / 2);
        const py = (-Math.tan(THREE.MathUtils.degToRad(s.sy)) / f) * (h / 2);
        const spread = 6 + s.recoil * 9;
        cross.current.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        cross.current.style.setProperty("--gap", `${spread.toFixed(1)}px`);
        cross.current.style.opacity = s.phase === "play" && !scoped ? "1" : "0";
      }
      if (scopeRef.current) scopeRef.current.style.opacity = String(Math.max(0, (s.zoom - 0.4) / 0.6));
      if (timeBar.current) {
        const left = Math.max(0, 1 - s.t / p.seconds);
        timeBar.current.style.width = `${(left * 100).toFixed(2)}%`;
        timeBar.current.style.background = left < 0.2 ? "#ff6b6b" : "#ffd43b";
      }
    };
    raf = requestAnimationFrame(loop);
    const pending = timers.current;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
      W.dispose();
      world.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
    // The world is built once; plans only change with the seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  // ------------------------------------------------------------------ touch: drag to aim, tap to fire

  function down(e: React.PointerEvent) {
    const s = state();
    if (s.phase !== "play" || s.drag) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    s.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), moved: 0 };
  }
  function move(e: React.PointerEvent) {
    const s = state();
    const d = s.drag;
    if (!d || d.id !== e.pointerId || s.phase !== "play") return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    const p = plans[s.ri];
    const h = wrap.current?.clientHeight || 480;
    const fov = p.scopeFov ? p.fov + (p.scopeFov - p.fov) * s.zoom : p.fov;
    const sens = (fov / h) * 0.8;
    s.yaw -= dx * sens;
    s.pitch -= dy * sens;
    aimLimits(s, p);
    world.current?.nudge(dx, dy);
  }
  function up(e: React.PointerEvent) {
    const s = state();
    const d = s.drag;
    if (!d || d.id !== e.pointerId) return;
    s.drag = null;
    if (e.type === "pointerup" && d.moved < 10 && performance.now() - d.at < 350) fire();
  }

  const p = plans[hud.ri];
  const res = hud.results[hud.results.length - 1];
  const lastRound = hud.ri + 1 >= plans.length;
  const reloading = hud.reloading;

  if (failed)
    return (
      <div className="grid aspect-[3/4] w-full place-items-center rounded-3xl bg-[#14171c] p-6 text-center text-sm text-white/70">
        <div>
          <p>This phone couldn&apos;t start the 3D range.</p>
          <button className="mt-3 rounded-2xl bg-white/10 px-4 py-2 font-bold text-white" onClick={() => finish(0)}>
            Leave the range
          </button>
        </div>
      </div>
    );

  return (
    <FullScreen onQuit={() => finish(g.current?.score ?? 0)} quitLabel="Leave the range" className="select-none bg-[#14171c]">
      <style>{CSS}</style>
      <div
        ref={wrap}
        className="relative w-full flex-1 touch-none overflow-hidden bg-[#14171c]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Scope */}
        <div ref={scopeRef} className="pointer-events-none absolute inset-0 opacity-0" style={{ background: "radial-gradient(circle closest-side at 50% 50%, transparent 0 86%, rgba(0,0,0,.6) 88.5%, #000 91%)" }}>
          <div className="absolute left-1/2 top-1/2 aspect-square w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[inset_0_0_40px_14px_rgba(0,0,0,.75)]">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-black/85" />
            <div className="absolute bottom-0 top-0 left-1/2 w-px -translate-x-1/2 bg-black/85" />
            <div className="absolute left-0 top-1/2 h-[3px] w-[30%] -translate-y-1/2 bg-black" />
            <div className="absolute right-0 top-1/2 h-[3px] w-[30%] -translate-y-1/2 bg-black" />
            <div className="absolute bottom-0 left-1/2 h-[30%] w-[3px] -translate-x-1/2 bg-black" />
            {[-3, -2, -1, 1, 2, 3].map((i) => (
              <div key={i} className="absolute left-1/2 top-1/2 h-[5px] w-[5px] rounded-full bg-black" style={{ transform: `translate(calc(-50% + ${i * 22}px), -50%)` }} />
            ))}
            <div className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3b30] shadow-[0_0_6px_#ff3b30]" />
          </div>
        </div>

        {/* Crosshair */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
          <div ref={cross} className="r3d-cross absolute left-0 top-0" style={{ opacity: 0 }}>
            <i className="r3d-l" style={{ transform: "translate(calc(-100% - var(--gap)), -50%)" }} />
            <i className="r3d-l" style={{ transform: "translate(var(--gap), -50%)" }} />
            <i className="r3d-l r3d-v" style={{ transform: "translate(-50%, calc(-100% - var(--gap)))" }} />
            <i className="r3d-l r3d-v" style={{ transform: "translate(-50%, var(--gap))" }} />
            <i className="r3d-dot" />
            {hitMark && <b key={hitMark.id} className="r3d-hit" style={{ color: hitMark.colour }} />}
          </div>
        </div>

        {/* Top: round, score, time */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-2.5 text-white">
          <div className="flex items-start justify-between gap-2 pr-20">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] text-[#ffa94d]">
                <Crosshair className="h-3 w-3" /> ROUND {hud.ri + 1}/{plans.length}
              </div>
              <div className="truncate text-base font-black leading-tight">{p.name}</div>
              <div className="text-[11px] font-semibold text-white/60">{p.tag}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black tracking-[0.18em] text-white/55">SCORE</div>
              <div className="text-3xl font-black leading-none tabular-nums [text-shadow:0_2px_8px_rgba(0,0,0,.6)]">{hud.score}</div>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div ref={timeBar} className="h-full rounded-full bg-[#ffd43b]" style={{ width: "100%" }} />
          </div>
        </div>

        {/* Ammo */}
        {(hud.phase === "play" || hud.phase === "over") && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl bg-black/45 px-2.5 py-2 text-white backdrop-blur-sm">
            <div className="flex items-end gap-[3px]">
              {Array.from({ length: p.mag }, (_, i) => (
                <span key={i} className={cn("block h-5 w-[7px] rounded-t-full rounded-b-[2px]", i < hud.mag ? "bg-gradient-to-b from-[#ffe08a] to-[#c9a24a]" : "bg-white/15")} />
              ))}
              <span className="ml-1.5 text-xs font-bold tabular-nums text-white/70">+{hud.reserve}</span>
            </div>
            <div className={cn("mt-1 text-[10px] font-black tracking-widest", reloading ? "animate-pulse text-[#ffd43b]" : hud.mag === 0 && hud.reserve === 0 ? "text-[#ff6b6b]" : "text-white/50")}>
              {reloading ? "RELOADING" : hud.mag === 0 ? (hud.reserve ? "EMPTY" : "NO AMMO") : WEAPONS[p.weapon].label.toUpperCase()}
            </div>
          </div>
        )}

        {/* Hint */}
        {hud.phase === "play" && hud.hint && hud.ri === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center">
            <div className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">Drag to aim · tap to fire</div>
          </div>
        )}

        {/* Hit popups */}
        <div className="pointer-events-none absolute left-1/2 top-[38%]">
          {pops.map((x) => (
            <div key={x.id} className="r3d-pop absolute left-0 top-0 whitespace-nowrap text-center" style={{ color: x.colour }}>
              <div className={cn("font-black [text-shadow:0_2px_6px_rgba(0,0,0,.8)]", x.big ? "text-3xl" : "text-2xl")}>{x.text}</div>
              {x.sub && <div className="text-sm font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">{x.sub}</div>}
            </div>
          ))}
        </div>

        {/* Round card */}
        {hud.phase === "intro" && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#101318]/85 p-5 text-center text-white shadow-2xl backdrop-blur-md">
            <div className="text-[11px] font-black tracking-[0.2em] text-[#ffa94d]">ROUND {hud.ri + 1} OF {plans.length}</div>
            <div className="mt-1 text-3xl font-black">{p.name}</div>
            <div className="text-sm font-semibold text-white/60">{p.tag}</div>
            <p className="mx-auto mt-3 max-w-[16rem] text-sm leading-snug text-white/85">{p.brief}</p>
            <div className="mt-3 flex justify-center gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-white/10 px-2.5 py-1">{p.mag * p.mags} shots</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">{p.seconds} s</span>
              {p.mult > 1 && <span className="rounded-full bg-[#e8590c]/30 px-2.5 py-1 text-[#ffc078]">×{p.mult} points</span>}
              {p.penalty > 0 && <span className="rounded-full bg-[#1c7ed6]/30 px-2.5 py-1 text-[#a5d8ff]">Hostage −{p.penalty}</span>}
            </div>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={go}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#e8590c] text-base font-black text-white active:scale-95"
            >
              Start <span className="grid h-7 w-7 place-items-center rounded-full bg-black/25 tabular-nums">{hud.count}</span>
            </button>
          </div>
        )}

        {/* Summary */}
        {hud.phase === "summary" && res && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#101318]/88 p-5 text-white shadow-2xl backdrop-blur-md">
            <div className="text-center text-[11px] font-black tracking-[0.2em] text-[#ffa94d]">{lastRound ? "RANGE COMPLETE" : `ROUND ${hud.ri + 1} DONE`}</div>
            <div className="mt-1 text-center text-4xl font-black tabular-nums">{lastRound ? hud.score : `${res.points >= 0 ? "+" : ""}${res.points}`}</div>
            <div className="text-center text-xs font-semibold text-white/55">{lastRound ? "final score" : `${res.name} · total ${hud.score}`}</div>
            {lastRound ? (
              <div className="mt-3 space-y-1.5">
                {hud.results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <span className="font-bold">
                      {r.name} <span className="font-medium text-white/50">{acc(r)}%</span>
                    </span>
                    <span className="font-black tabular-nums">{r.points}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <Stat label="Accuracy" value={`${acc(res)}%`} />
                <Stat label="Hits" value={`${res.hits}/${res.shots}`} />
                <Stat label="Bullseyes" value={String(res.bulls)} accent="#ff922b" />
                <Stat label="Hostages hit" value={String(res.hostages)} accent={res.hostages ? "#ff6b6b" : undefined} />
              </div>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={next}
              className="relative mt-4 flex min-h-12 w-full items-center justify-center overflow-hidden rounded-2xl bg-[#e8590c] text-base font-black text-white active:scale-95"
            >
              <span ref={autoBar} className="absolute inset-y-0 left-0 bg-black/20" style={{ width: 0 }} />
              <span className="relative">{lastRound ? "Finish" : `Next: ${plans[hud.ri + 1].name} →`}</span>
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pb-3">
      <Pads>
        <Pad onDown={reload} className={cn("max-w-[30%] bg-[#343a40]", (hud.phase !== "play" || hud.mag === p.mag || !hud.reserve) && "opacity-40")}>
          <RotateCcw className="h-5 w-5" /> Reload
        </Pad>
        {p.scopeFov > 0 && (
          <Pad onDown={toggleScope} className={cn("max-w-[30%]", hud.scoped ? "bg-[#1c7ed6]" : "bg-[#343a40]", hud.phase !== "play" && "opacity-40")}>
            {hud.scoped ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />} Scope
          </Pad>
        )}
        <Pad onDown={fire} className={cn("bg-[#e03131] text-lg tracking-wider shadow-[0_4px_0_#a51d1d]", hud.phase !== "play" && "opacity-40")}>
          <Crosshair className="h-6 w-6" /> FIRE
        </Pad>
      </Pads>
      </div>
    </FullScreen>
  );
}

function acc(r: Result) {
  return r.shots ? Math.round((r.hits / r.shots) * 100) : 0;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2">
      <div className="text-xl font-black tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}

const CSS = `
.r3d-cross{--gap:6px;transition:opacity .2s}
.r3d-l{position:absolute;left:0;top:0;width:11px;height:2px;background:#fff;border-radius:1px;box-shadow:0 0 0 1px rgba(0,0,0,.45)}
.r3d-v{width:2px;height:11px}
.r3d-dot{position:absolute;left:0;top:0;width:3px;height:3px;transform:translate(-50%,-50%);background:#ff3b30;border-radius:50%;box-shadow:0 0 4px #ff3b30}
.r3d-hit{position:absolute;left:0;top:0;width:30px;height:30px;transform:translate(-50%,-50%) rotate(45deg);animation:r3dHit .32s ease-out forwards}
.r3d-hit::before,.r3d-hit::after{content:"";position:absolute;background:currentColor;box-shadow:0 0 3px rgba(0,0,0,.6)}
.r3d-hit::before{left:50%;top:0;bottom:0;width:2px;margin-left:-1px;-webkit-mask:linear-gradient(#000 0 35%,transparent 35% 65%,#000 65%);mask:linear-gradient(#000 0 35%,transparent 35% 65%,#000 65%)}
.r3d-hit::after{top:50%;left:0;right:0;height:2px;margin-top:-1px;-webkit-mask:linear-gradient(90deg,#000 0 35%,transparent 35% 65%,#000 65%);mask:linear-gradient(90deg,#000 0 35%,transparent 35% 65%,#000 65%)}
@keyframes r3dHit{0%{opacity:1;transform:translate(-50%,-50%) rotate(45deg) scale(.7)}100%{opacity:0;transform:translate(-50%,-50%) rotate(45deg) scale(1.25)}}
.r3d-pop{animation:r3dPop 1s ease-out forwards}
@keyframes r3dPop{0%{opacity:0;transform:translate(-50%,0) scale(.6)}14%{opacity:1;transform:translate(-50%,-8px) scale(1.12)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-52px) scale(1)}}
`;
