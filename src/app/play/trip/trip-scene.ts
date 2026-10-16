// The trip there (docs/TRIPS.md): a short film when you go somewhere. You walk out to the danfo
// (or your car, a taxi, a keke, an okada) and get in; it pulls off, the camera swinging round from
// the side to behind it, and drives through a Lagos street: round a junction, under a welcome
// arch, past a mosque and a filling station, shops with painted signs, people on the pavements,
// traffic coming the other way, under a pedestrian bridge, and stops at the place you're going,
// its name across the front, where you get out and walk in. On foot, you walk there along the
// pavement. The sky is the time in Lagos. Something may happen on the way (a road moment,
// src/lib/world/road-moments.ts): the ride stops, it's acted out (./stages.ts), you choose, and
// the ride goes on. Everything is freed at the end.

import * as THREE from "three";
import type { Commute } from "@/lib/world/work";
import type { RoadStage } from "@/lib/world/road-moments";
import { LOD } from "@/lib/avatar3d/lod";
import { createMyAvatar } from "../city/npc3d";
import type { MomentMood } from "../moments/moment-card";
import { buildAtlas } from "./atlas";
import { createWalkers } from "./people";
import { makeRoute } from "./road-path";
import { buildSky, skyAt } from "./sky";
import { createStage, type Stage } from "./stages";
import { buildStreet, LANE, PAVE_MID } from "./street";
import { buildVehicle, type Vehicle, type VehicleKind } from "./vehicles";

/** How fast each ride goes (m/s; a film, so a little quicker than life), speeds up and turns. */
const RIDE: Record<Exclude<Commute, "walk">, { cruise: number; accel: number; turn: number }> = {
  car: { cruise: 21, accel: 7, turn: 9.5 },
  taxi: { cruise: 20, accel: 6.5, turn: 9 },
  danfo: { cruise: 18, accel: 6, turn: 8.5 },
  keke: { cruise: 13, accel: 5, turn: 7 },
  okada: { cruise: 17, accel: 7, turn: 8.5 },
};
const DECEL = 7.5;
const WALK_SPEED = 2.2;
const T_BOARD = { walk: 1.6, getIn: 0.55 };
const T_ARRIVE = 3.0;
/** After the choice, the ride goes on this long, then the film ends (seconds). */
const AFTER = 2.2;
const TRAFFIC: VehicleKind[] = ["car", "danfo", "taxi", "keke", "car", "okada", "bus", "truck", "danfo", "suv", "car"];

export type TripScene = {
  /** Jump to the end (Skip). */
  finish(): void;
  /** Something happens on the way: stage it (false if it's too late on this trip). */
  stage(kind: RoadStage, momentId: string): boolean;
  /** The choice was made: play out how it went, then ride on. */
  resolve(mood: MomentMood): void;
  dispose(): void;
};

/**
 * Play the trip in `host` (a full-screen box). mode: how you go; hour: the time in Lagos; area:
 * the area you're going to (the welcome arch); paint: your car's colour. onEvent: something on the
 * way is ready for the card; onDone: it's over (or skipped).
 */
export function createTripScene(
  host: HTMLElement,
  o: { mode: Commute; avatar: unknown; toName: string; area: string; hour: number; paint?: number; onProgress?: (u: number) => void; onEvent?: () => void; onDone: () => void },
): TripScene {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    o.onDone();
    return { finish() {}, stage: () => false, resolve() {}, dispose() {} };
  }
  const disposers: (() => void)[] = [];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);
  const walking = o.mode === "walk";
  const look = skyAt(o.hour);
  const night = look.lights;
  const scene = new THREE.Scene();
  scene.background = look.horizon.clone();
  scene.fog = new THREE.Fog(look.horizon.clone(), 70, 300);
  const hemi = new THREE.HemisphereLight(look.hemi, look.ground, look.hemiI);
  scene.add(hemi);
  if (night) scene.add(new THREE.AmbientLight(0x8090c0, 0.35));
  const sun = new THREE.DirectionalLight(look.sun, look.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
  scene.add(sun, sun.target);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  const sky = buildSky(look, disposers);
  scene.add(sky.group);

  // The road: two turns for a ride; a straight pavement on foot.
  const route = walking ? makeRoute([{ straight: 240 }]) : makeRoute([{ straight: 58 }, { turn: "left", r: 9 }, { straight: 60 }, { turn: "right", r: 9 }, { straight: 150 }]);
  const B = route.lines[Math.min(1, route.lines.length - 1)];
  const C = route.lines[route.lines.length - 1];
  const boardS = walking ? 76 : 40;
  const eventS = walking ? 84 : B.s0 + 22;
  const stopS = walking ? 98 : C.s0 + 30;
  const atlas = buildAtlas({ night, toName: o.toName, area: o.area || "Lagos" });
  disposers.push(() => atlas.texture.dispose());
  const street = buildStreet(scene, { route, boardS, stopS, eventS, walking, look, seed: (Math.random() * 2 ** 31) | 0 }, atlas, disposers);

  const mats = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    tex: new THREE.MeshLambertMaterial({ vertexColors: true, map: atlas.texture }),
  };
  disposers.push(() => (mats.solid.dispose(), mats.glow.dispose(), mats.tex.dispose()));
  const makeVehicle = (kind: VehicleKind, crew = false) => buildVehicle(kind, { paint: o.paint, mats, atlas, crew, night });

  // Your ride, parked at the kerb where you get in.
  const veh: Vehicle | null = walking ? null : makeVehicle(o.mode, true);
  const halfW = o.mode === "danfo" ? 0.96 : o.mode === "keke" ? 0.65 : o.mode === "okada" ? 0.25 : 0.92;
  const place = (v: Vehicle, s: number, lat: number, reverse = false) => {
    const p = route.place(s, lat);
    v.root.position.set(p.x, 0, p.z);
    v.root.rotation.y = p.yaw + (reverse ? Math.PI : 0);
    return p;
  };
  if (veh) {
    scene.add(veh.root);
    place(veh, boardS, LANE);
    if (night) {
      const lamp = new THREE.SpotLight(0xfff1c4, 40, 45, 0.55, 0.6, 1.6);
      lamp.position.set(veh.half, 0.9, 0);
      lamp.target.position.set(veh.half + 12, 0, 0);
      veh.body.add(lamp, lamp.target);
    }
  }

  // You.
  const me = createMyAvatar(o.avatar, LOD.near, "me");
  scene.add(me.root);
  // Out from the bus stop (just ahead) to the door.
  const startP = walking ? route.place(boardS, PAVE_MID) : route.place(boardS + 4.5, PAVE_MID + 0.9);
  me.root.position.set(startP.x, 0.16, startP.z);

  // Traffic coming the other way, and people on the pavements.
  const traffic = Array.from({ length: walking ? 6 : 8 }, (_, i) => {
    const v = makeVehicle(TRAFFIC[(i * 7 + Math.floor(Math.random() * 4)) % TRAFFIC.length]);
    scene.add(v.root);
    return { v, s: boardS - 20 + i * 24 + Math.random() * 10, speed: 8 + Math.random() * 6 };
  });
  const walkers = createWalkers(scene, route, { count: walking ? 12 : 10, night, mats });

  const size = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h);
    cam.aspect = w / h;
    // Narrow screens see a little wider.
    cam.fov = cam.aspect < 0.8 ? 62 : 50;
    cam.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);

  // ---------------------------------------------------------------- state
  type Phase = "board" | "go" | "event" | "outro" | "arrive";
  let phase: Phase = walking ? "go" : "board";
  let tPhase = 0;
  let s = boardS;
  let v = 0;
  let stage: Stage | null = null;
  let stageKind: RoadStage | null = null;
  let stageDone = false;
  let mood: MomentMood = "calm";
  let eventShown = false;
  let chase = 0;
  let done = false;
  const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const camPos = new THREE.Vector3(startP.x, 3, startP.z);
  const lookAt = new THREE.Vector3(startP.x, 1.3, startP.z);
  {
    const p = route.place(boardS - 2, walking ? -1 : 12.5);
    camPos.set(p.x, 2.4, p.z);
  }
  const ride = walking ? null : RIDE[o.mode as Exclude<Commute, "walk">];

  /** A point in the ride's frame (forward, up, right) in the world. */
  const frame = (f: number, up: number, r: number) => {
    const p = route.place(s + f, (walking ? PAVE_MID : LANE) + r);
    return new THREE.Vector3(p.x, up, p.z);
  };
  /** The top speed here: slow for the turns ahead. */
  const vmaxAt = (sAt: number) => {
    if (!ride) return WALK_SPEED;
    let vm = ride.cruise;
    for (const t of route.turns) {
      if (sAt >= t.s0 - 0.5 && sAt <= t.s1) vm = Math.min(vm, ride.turn);
      else if (sAt < t.s0) vm = Math.min(vm, Math.sqrt(ride.turn ** 2 + 2 * DECEL * (t.s0 - sAt)));
    }
    return vm;
  };
  const stopAt = () => {
    let at = stopS;
    if (stage && !stageDone && phase !== "outro") at = Math.min(at, eventS);
    const ob = stage?.obstacle();
    if (ob != null && !walking && ob > s) at = Math.min(at, ob - (veh?.half ?? 1) - 1.2);
    return at;
  };

  const finish = () => {
    if (done) return;
    done = true;
    o.onDone();
  };

  // ---------------------------------------------------------------- the frame
  let began = 0;
  let last = 0;
  let raf = 0;
  const lastProgress = { u: 0 };
  const frameFn = () => {
    raf = requestAnimationFrame(frameFn);
    const now = performance.now();
    const real = began ? Math.min(0.25, (now - last) / 1000) : 0;
    const dt = Math.min(0.05, real);
    last = now;
    /** Easing towards a target at the same pace on any phone (however few frames it draws). */
    const k = (rate: number) => 1 - Math.exp(-real * rate);
    tPhase += real;
    let doing = "sit";

    // Moving along.
    if (phase === "go" || phase === "outro") {
      if (phase === "outro" && stage && stage.canGo(tPhase)) {
        phase = "go";
        tPhase = 0;
      }
      if (phase === "go") {
        const target = stopAt();
        const vStop = Math.sqrt(2 * DECEL * Math.max(0, target - s));
        const want = Math.min(vmaxAt(s), vStop);
        const accel = ride?.accel ?? 3;
        v = v < want ? Math.min(want, v + accel * real) : Math.max(want, v - DECEL * 1.6 * real);
        if (target - s > 0.05 && v < 0.5 && want > 0.4) v = 0.5;
        s = Math.min(target, s + v * real);
        if (target - s < 0.04 && v <= Math.max(0.6, vStop)) {
          s = target;
          v = 0;
          if (Math.abs(s - stopS) < 0.05) {
            phase = "arrive";
            tPhase = 0;
          } else if (stage && !stageDone && Math.abs(s - eventS) < 0.08) {
            phase = "event";
            tPhase = 0;
          }
        }
        if (walking) doing = v > 0.2 ? "walk" : "idle";
        // The film is the ride up to what happens: a little after it's played out, it ends.
        if (stageDone && tPhase > AFTER) finish();
      }
    }
    if (stage && phase === "event" && !eventShown && stage.ready(tPhase)) {
      eventShown = true;
      o.onEvent?.();
    }

    // Your ride: placed on the road, wheels turning, a little bounce, leaning in the turns.
    if (veh) {
      place(veh, s, LANE);
      for (const w of veh.wheels) w.rotation.z -= (v * real) / Math.max(0.1, w.scale.x);
      const bounce = v > 1 ? Math.abs(Math.sin(now / 1000 * 9)) * 0.02 * Math.min(1, v / 10) : 0;
      veh.body.position.y = bounce;
      const turning = route.turns.find((t) => s > t.s0 && s < t.s1);
      const flat = stage?.flat && (phase === "event" || (phase === "outro" && tPhase < 1.5)) ? 0.06 : 0;
      veh.body.rotation.x += ((turning ? -turning.dir * Math.min(0.05, (v * v) / turning.r / 200) : 0) + flat - veh.body.rotation.x) * k(5);
      veh.body.rotation.z += (-(flat ? 0.025 : 0) - veh.body.rotation.z) * k(5);
      for (const e of veh.extras) e.update(dt, v > 0.5);
    }

    // You: out to the door, in, riding, out again and in through the doors.
    if (veh) {
      const door = veh.root.localToWorld(veh.door.clone());
      const seat = veh.body.localToWorld(new THREE.Vector3(veh.seat.x, veh.seat.y, veh.seat.z));
      if (phase === "board") {
        if (tPhase < T_BOARD.walk) {
          const u = ease(tPhase / T_BOARD.walk);
          me.root.position.set(startP.x + (door.x - startP.x) * u, u > 0.75 ? 0 : 0.16, startP.z + (door.z - startP.z) * u);
          me.root.rotation.y = Math.atan2(door.x - startP.x, door.z - startP.z);
          doing = "walk";
        } else {
          const u = ease((tPhase - T_BOARD.walk) / T_BOARD.getIn);
          me.root.position.lerpVectors(door, seat, u);
          me.root.rotation.y = veh.root.rotation.y + veh.seat.ry;
          doing = u > 0.6 ? "sit" : "walk";
          if (tPhase >= T_BOARD.walk + T_BOARD.getIn) {
            phase = "go";
            tPhase = 0;
          }
        }
      } else if (phase === "arrive") {
        const out = 0.5;
        if (tPhase < out) {
          me.root.position.lerpVectors(seat, door, ease(tPhase / out));
          doing = "walk";
        } else {
          const to = street.destDoor;
          const dx = to.x - me.root.position.x;
          const dz = to.z - me.root.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.3) {
            const step = Math.min(d, 2.0 * real);
            me.root.position.x += (dx / d) * step;
            me.root.position.z += (dz / d) * step;
            me.root.rotation.y = Math.atan2(dx, dz);
            doing = "walk";
          } else doing = "wave";
          const lat = Math.abs((me.root.position.x - veh.root.position.x) * Math.sin(veh.root.rotation.y) + (me.root.position.z - veh.root.position.z) * Math.cos(veh.root.rotation.y));
          me.root.position.y = lat > 3.4 ? 0.16 : 0;
        }
        if (tPhase > T_ARRIVE) finish();
      } else {
        me.root.position.copy(seat);
        me.root.rotation.y = veh.root.rotation.y + veh.seat.ry;
        doing = "sit";
      }
    } else {
      // On foot.
      const p = route.place(s, PAVE_MID);
      if (phase === "arrive") {
        const to = street.destDoor;
        const dx = to.x - me.root.position.x;
        const dz = to.z - me.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const step = Math.min(d, 1.8 * real);
          me.root.position.x += (dx / d) * step;
          me.root.position.z += (dz / d) * step;
          me.root.rotation.y = Math.atan2(dx, dz);
          doing = "walk";
        } else doing = "wave";
        if (tPhase > T_ARRIVE - 0.6) finish();
      } else {
        me.root.position.set(p.x, 0.16, p.z);
        me.root.rotation.y = Math.atan2(Math.cos(p.yaw), -Math.sin(p.yaw));
        doing = phase === "go" && v > 0.2 ? "walk" : "idle";
      }
    }
    me.update(dt, doing, veh?.seat.y ?? 0.45, doing === "walk" && walking ? WALK_SPEED / 1.35 : 1);

    // The stage, traffic and people.
    if (stage) {
      const sp = phase === "event" ? "stopped" : phase === "outro" || stageDone ? "outro" : "approach";
      stage.update(dt, sp, sp === "outro" ? outroT : tPhase, cam);
      if (phase === "outro" || stageDone) outroT += real;
    }
    const blocking = !!stage && !(stageDone && s > eventS + 30);
    const sorted = [...traffic].sort((a, b) => a.s - b.s);
    let queueAt = eventS + 26;
    for (const t of sorted) {
      let next = t.s - t.speed * real;
      if (blocking && t.s >= eventS + 20 && next < queueAt) {
        next = Math.max(next, queueAt);
        queueAt += t.v.half * 2 + 2.5;
      }
      const moved = t.s - next;
      t.s = next;
      if (t.s < s - 45) t.s = s + 140 + Math.random() * 60;
      place(t.v, t.s, -LANE, true);
      for (const w of t.v.wheels) w.rotation.z -= moved / Math.max(0.1, w.scale.x);
    }
    walkers.update(dt, s);

    // ---------------------------------------------------------------- the camera
    const back = cam.aspect < 0.8 ? 1.22 : 1;
    let want: THREE.Vector3;
    let wantLook: THREE.Vector3;
    if (walking) {
      want = frame(1.2 + 5.2 * Math.cos(-0.95), 2.0, -5.2 * Math.sin(0.95) * back);
      wantLook = frame(1.4, 1.25, 0);
    } else if (phase === "board") {
      want = frame(-2.2, 2.4 * back, 10.5 * back - 0.5);
      wantLook = frame(0.2, 1.4, 1.2);
    } else {
      // From the side round to behind as it pulls off.
      chase = Math.min(1, chase + real / 2.6);
      const c = ease(chase);
      const phi = THREE.MathUtils.lerp(Math.PI / 2, Math.PI - 0.16, c);
      const rad = THREE.MathUtils.lerp(10.5, 8.8, c) * back;
      want = frame(rad * Math.cos(phi), THREE.MathUtils.lerp(2.4, 3.3, c) * back, rad * Math.sin(phi));
      wantLook = frame(THREE.MathUtils.lerp(0.2, 7, c), THREE.MathUtils.lerp(1.4, 1.2, c), THREE.MathUtils.lerp(1.2, 0, c));
    }
    // Something happening: turn to it.
    if (stage) {
      const dist = eventS - s;
      const w = phase === "event" || (phase === "outro" && tPhase < 1.6) ? 1 : !stageDone && dist < 24 && dist > -2 ? ease(1 - dist / 24) : stageDone && s - eventS < 12 ? ease(1 - (s - eventS) / 12) * 0.9 : 0;
      if (w > 0) {
        const inside = stageKind === "inside";
        const vw = stage.view;
        // On foot the kerb side is shopfronts: watch from the road.
        const phi = walking && Math.sin(vw.phi) > 0 ? -vw.phi : vw.phi;
        const rad = (walking ? Math.min(vw.rad, 6.8) : vw.rad) * back;
        const ev = route.place(eventS + rad * Math.cos(phi), (walking ? PAVE_MID : LANE) + rad * Math.sin(phi));
        const eye = new THREE.Vector3(ev.x, vw.h * back, ev.z);
        const target = inside ? frame(0, 1.15, 0) : vw.focus;
        want.lerp(eye, w);
        wantLook.lerp(target, w);
      }
    }
    // Arriving: across the road, looking up at the place over your ride.
    const arriveSpan = walking ? 10 : 26;
    if (s > stopS - arriveSpan && phase !== "event" && phase !== "outro" && !(stage && !stageDone)) {
      const w = ease(1 - (stopS - s) / arriveSpan);
      const p = route.place(stopS - (walking ? 6 : 13) * back, walking ? 1.5 : -LANE - 2.6);
      const eye = new THREE.Vector3(p.x, walking ? 2.3 : 2.9, p.z);
      const tgt = street.destLook.clone().lerp(walking ? me.root.position.clone().setY(1.4) : frame(1, 1.2, 0), 0.4);
      want.lerp(eye, w);
      wantLook.lerp(tgt, w);
    }
    camPos.lerp(want, began ? k(phase === "event" ? 2.2 : 3.2) : 1);
    lookAt.lerp(wantLook, began ? k(4) : 1);
    cam.position.copy(camPos);
    cam.lookAt(lookAt);
    sky.follow(cam);
    const focus = veh ? veh.root.position : me.root.position;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(look.sunDir, 80);
    renderer.render(scene, cam);
    if (!began) began = last = performance.now();

    // How far along (the bar): getting in, the ride up to what happens, then on a little.
    const span = Math.max(1, (stage ? eventS : stopS) - boardS);
    const start = walking ? 0 : 0.12;
    const u = stageDone
      ? 0.85 + 0.15 * (phase === "go" ? Math.min(1, tPhase / AFTER) : 0)
      : phase === "board"
        ? start * Math.min(1, tPhase / (T_BOARD.walk + T_BOARD.getIn))
        : phase === "arrive"
          ? 0.9 + 0.1 * Math.min(1, tPhase / T_ARRIVE)
          : start + (0.85 - start) * Math.min(1, (s - boardS) / span);
    if (Math.abs(u - lastProgress.u) > 0.01) {
      lastProgress.u = u;
      o.onProgress?.(Math.min(1, Math.max(0, u)));
    }
  };
  let outroT = 0;
  frameFn();

  return {
    finish,
    stage(kind, momentId) {
      if (stage || done) return false;
      // Too late on this trip: it would pop up right in front of you.
      if (s > eventS - (walking ? 3 : 18)) return false;
      stageKind = kind;
      stage = createStage(kind, {
        scene,
        route,
        eventS,
        lane: walking ? PAVE_MID : LANE,
        walking,
        mode: o.mode,
        night,
        momentId,
        half: veh?.half ?? 0.4,
        halfW,
        driverF: o.mode === "danfo" ? 1.55 : o.mode === "keke" || o.mode === "okada" ? 0.5 : 0.1,
        seatF: veh?.seat.x ?? 0,
        mats,
        makeVehicle: (kk) => makeVehicle(kk),
      });
      if (stage.rain) {
        sky.gloom(1);
        hemi.intensity *= 0.7;
        sun.intensity *= 0.35;
        (scene.fog as THREE.Fog).far = 160;
        (scene.fog as THREE.Fog).color.lerp(new THREE.Color(0x868e96), 0.6);
        (scene.background as THREE.Color).lerp(new THREE.Color(0x868e96), 0.6);
      }
      return true;
    },
    resolve(m) {
      if (!stage || stageDone) return;
      mood = m;
      stageDone = true;
      stage.outro(mood);
      outroT = 0;
      if (phase === "event") {
        phase = "outro";
        tPhase = 0;
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage?.dispose();
      me.dispose();
      veh?.dispose();
      for (const t of traffic) t.v.dispose();
      walkers.dispose();
      for (const d of disposers) d();
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
