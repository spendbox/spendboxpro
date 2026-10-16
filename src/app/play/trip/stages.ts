// What happens on the road, acted out (docs/TRIPS.md): the scene the trip film stages for a road
// moment (src/lib/world/road-moments.ts). Drums across the road and an officer waving you down
// with his torch; area boys getting up off a bench to bang on the bonnet; a woman with a baby on
// her back coming to the window; hawkers running alongside with trays on their heads; a flat tyre
// and the vulcaniser with his jack; smoke from the engine; a crash with the drivers arguing; a
// go-slow; boys with a rope across the road and a pothole full of sand; goats crossing; a broken-
// down car with its hazards on; rain; a siren convoy; a wedding convoy dancing in the road; a fan
// running up; a bag in the road; the bus stop; a fight. The ride stops at the spot, they come up,
// and the card asks what you do; what you choose plays out (they cheer, wave, argue, walk off),
// and the ride goes on.

import * as THREE from "three";
import type { Commute } from "@/lib/world/work";
import type { RoadStage } from "@/lib/world/road-moments";
import { Kit } from "../city/kit";
import type { MomentMood } from "../moments/moment-card";
import { createActor, type Actor, type Costume, type Prop } from "./people";
import { ahead, type Route } from "./road-path";
import { kitPerson, PAVE_MID, PAVE_OUT, ROAD_HALF } from "./street";
import type { Vehicle, VehicleKind } from "./vehicles";

export type StageCtx = {
  scene: THREE.Scene;
  route: Route;
  /** Where the ride stops for it (the middle of the vehicle), and where in the road. */
  eventS: number;
  lane: number;
  walking: boolean;
  mode: Commute;
  night: boolean;
  momentId: string;
  /** Your ride's size: half its length and width; where the driver and you sit (along it). */
  half: number;
  halfW: number;
  driverF: number;
  seatF: number;
  mats: { solid: THREE.Material; glow: THREE.Material };
  makeVehicle(kind: VehicleKind): Vehicle;
};

export type Stage = {
  /** The camera while it happens: the angle round your ride (0 ahead, positive towards the kerb), how far, how high, and what it looks at. */
  view: { phi: number; rad: number; h: number; focus: THREE.Vector3 };
  /** Rain falls (the sky darkens). */
  rain: boolean;
  /** Your ride leans on a flat tyre while stopped. */
  flat: boolean;
  /** Something in your lane ahead (route s of its back), or null. */
  obstacle(): number | null;
  /** phase: the ride is coming, stopped here, or going (after the choice); t: seconds in it. */
  update(dt: number, phase: "approach" | "stopped" | "outro", t: number, cam: THREE.Camera): void;
  /** Everyone's in place: time for the card. */
  ready(t: number): boolean;
  /** The choice was made and how it went. */
  outro(mood: MomentMood): void;
  /** Done enough for the ride to go on. */
  canGo(t: number): boolean;
  dispose(): void;
};

type F = [number, number];

export function createStage(kind: RoadStage, c: StageCtx): Stage {
  const E = c.route.at(c.eventS);
  const fw = ahead(E.yaw);
  const W = ([f, r]: F) => ({ x: E.x + fw.fx * f + fw.rx * r, z: E.z + fw.fz * f + fw.rz * r });
  const lateral = (x: number, z: number) => (x - E.x) * fw.rx + (z - E.z) * fw.rz;
  const own: (() => void)[] = [];
  const actors: Actor[] = [];
  const vehicles: Vehicle[] = [];
  const kitG: THREE.Object3D[] = [];
  let seed = 0;
  for (const ch of c.momentId) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 8) / 0x1000000;

  // Where you are: the window on the kerb side, the driver's window, in front, behind.
  const kerbWin: F = c.walking ? [1.1, PAVE_MID] : [c.seatF, c.lane + c.halfW + 0.55];
  const driverWin: F = c.walking ? [1.1, PAVE_MID - 0.8] : [c.driverF, c.lane - c.halfW - 0.55];
  const front: F = c.walking ? [1.7, PAVE_MID - 0.2] : [c.half + 0.9, c.lane];
  const you = W(c.walking ? [0, PAVE_MID] : [c.seatF, c.lane]);
  const near = ([f, r]: F, df: number, dr: number): F => [f + df, r + dr];

  const actor = (costume: Costume, at: F, props: Prop[] = [], scale = 1) => {
    const p = W(at);
    const a = createActor({ costume, props, seed: `${c.momentId}-${actors.length}`, x: p.x, z: p.z, yaw: E.yaw + Math.PI / 2, night: c.night, mats: c.mats, scale });
    c.scene.add(a.root);
    actors.push(a);
    a.face(you.x, you.z);
    return a;
  };
  const goTo = (a: Actor, at: F, speed = 1.4, then = "talk") => {
    const p = W(at);
    a.go(p.x, p.z, speed, then);
    a.face(you.x, you.z);
  };
  const kitProps = (draw: (k: Kit) => void) => {
    const k = new Kit();
    k.at(E.x, 0, E.z, E.yaw, () => draw(k));
    const g = k.build({ solid: c.mats.solid, glow: c.mats.glow });
    g.traverse((m) => {
      if (m instanceof THREE.Mesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        own.push(() => m.geometry.dispose());
      }
    });
    c.scene.add(g);
    kitG.push(g);
    return g;
  };
  const vehicle = (kind: VehicleKind, at: F, yawOff = 0) => {
    const v = c.makeVehicle(kind);
    const p = W(at);
    v.root.position.set(p.x, 0, p.z);
    v.root.rotation.y = E.yaw + yawOff;
    c.scene.add(v.root);
    vehicles.push(v);
    return v;
  };

  // A little timeline: things that happen some seconds after the ride stops, and after the choice.
  const onStop: { at: number; fn: () => void; done?: boolean }[] = [];
  const onOutro: { at: number; fn: (m: MomentMood) => void; done?: boolean }[] = [];
  const afterStop = (at: number, fn: () => void) => onStop.push({ at, fn });
  const afterChoice = (at: number, fn: (m: MomentMood) => void) => onOutro.push({ at, fn });
  let mood: MomentMood = "calm";
  let readyAt = 1.6;
  let goAt = 1.6;
  let obstacle: () => number | null = () => null;
  // The camera while it happens: from which angle round your ride (0 ahead, positive towards the
  // kerb), how far and how high, looking at what.
  let V = { phi: 0.62, at: [c.walking ? 1 : c.seatF + 0.8, c.walking ? PAVE_MID - 0.5 : c.lane + 0.6] as F, rad: 8.6, h: 2.6 };
  const view = (phi: number, at: F, rad = 8.6, h = 2.6) => (V = { phi, at, rad, h });
  const extra: ((dt: number, phase: "approach" | "stopped" | "outro", t: number, cam: THREE.Camera) => void)[] = [];
  let rain = false;
  let flat = false;

  /** How someone reacts to how it went (a move), then walks off to `away`. */
  const react = (a: Actor, away: F | null, moves: Partial<Record<MomentMood, string>> = {}, delay = 0) => {
    afterChoice(delay, (m) => a.act(m === "happy" ? (moves.happy ?? "cheer") : m === "angry" ? (moves.angry ?? "talk") : (moves.calm ?? "wave"), m === "angry" ? 1.8 : 1));
    if (away) afterChoice(delay + 1.3, () => goTo(a, away, 1.5, "idle"));
  };

  // ---------------------------------------------------------------- particles
  const blob = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    own.push(() => t.dispose());
    return t;
  })();
  /** Smoke (or steam) rising from a point. */
  const smoke = (at: () => { x: number; y: number; z: number }, color = 0x9a9a9a, on: () => boolean = () => true) => {
    const mat = new THREE.SpriteMaterial({ map: blob, color, transparent: true, depthWrite: false, opacity: 0.55 });
    own.push(() => mat.dispose());
    const puffs = Array.from({ length: 16 }, (_, i) => {
      const s = new THREE.Sprite(mat.clone());
      s.visible = false;
      c.scene.add(s);
      own.push(() => (s.material.dispose(), s.removeFromParent()));
      return { s, life: -i * 0.18 };
    });
    extra.push((dt) => {
      for (const p of puffs) {
        p.life += dt;
        if (p.life > 2.6) p.life = on() ? 0 : -1;
        if (p.life < 0) {
          p.s.visible = false;
          continue;
        }
        if (p.life < dt * 1.5) {
          const o = at();
          p.s.position.set(o.x + (Math.random() - 0.5) * 0.3, o.y, o.z + (Math.random() - 0.5) * 0.3);
        }
        p.s.visible = true;
        p.s.position.y += dt * 1.1;
        p.s.position.x += dt * 0.3;
        p.s.scale.setScalar(0.5 + p.life * 0.9);
        p.s.material.opacity = 0.5 * (1 - p.life / 2.6);
      }
    });
  };
  /** Rain round the camera. */
  const makeRain = () => {
    rain = true;
    const n = 1400;
    const pos = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xc5d3e0, transparent: true, opacity: 0.55, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    c.scene.add(lines);
    own.push(() => (geo.dispose(), mat.dispose(), lines.removeFromParent()));
    const drops = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 40, y: Math.random() * 18, z: (Math.random() - 0.5) * 40 }));
    extra.push((dt, _p, _t, cam) => {
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y -= dt * 22;
        if (d.y < 0) {
          d.y += 18;
          d.x = (Math.random() - 0.5) * 40;
          d.z = (Math.random() - 0.5) * 40;
        }
        const x = cam.position.x + d.x;
        const z = cam.position.z + d.z;
        pos.set([x, d.y, z, x + 0.05, d.y + 0.7, z], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    });
  };
  /** Naira notes in the air (spraying at the wedding). */
  const money = (around: F) => {
    const geo = new THREE.PlaneGeometry(0.16, 0.08);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8fd18f, side: THREE.DoubleSide });
    own.push(() => (geo.dispose(), mat.dispose()));
    const notes = Array.from({ length: 40 }, () => {
      const m = new THREE.Mesh(geo, mat);
      c.scene.add(m);
      own.push(() => m.removeFromParent());
      return { m, t: Math.random() * 2, a: Math.random() * 6, r: Math.random() * 2.2 };
    });
    extra.push((dt) => {
      const o = W(around);
      for (const n of notes) {
        n.t += dt;
        if (n.t > 2.2) n.t = 0;
        n.m.position.set(o.x + Math.cos(n.a) * n.r, 2.6 - n.t * 1.15, o.z + Math.sin(n.a) * n.r);
        n.m.rotation.set(n.t * 4 + n.a, n.t * 3, 0);
      }
    });
  };
  /** Blink lights (hazards, police bars). */
  const blinking = (objs: THREE.Object3D[], speed = 3) => extra.push((_dt, _p, t) => objs.forEach((o, i) => (o.visible = Math.floor((t + i * 0.25) * speed) % 2 === 0)));
  let clock = 0;
  extra.push((dt) => void (clock += dt));

  // ---------------------------------------------------------------- the scenes
  const id = c.momentId;
  switch (kind) {
    case "police":
    case "lastma": {
      const lastma = kind === "lastma";
      view(-2.6, c.walking ? front : [c.half + 3, c.lane - 0.8], 9.5, 3.4);
      const ahead1: F = c.walking ? [6, PAVE_MID] : [c.half + 4.5, c.lane - 0.6];
      if (!lastma) {
        // Drums making a chicane, a plank of nails, the pickup by the kerb, its bar flashing.
        if (!c.walking)
          kitProps((k) => {
            for (const [f, r] of [[c.half + 9, -1.2], [c.half + 9, 0.6], [c.half + 12, 3.6], [c.half + 12, 5.0]] as F[]) {
              k.cyl(f, 0, r, 0.3, 0.3, 0.9, 0xe8590c, 14);
              for (const y of [0.25, 0.6]) k.cyl(f, y, r, 0.305, 0.305, 0.12, 0xf8f9fa, 14);
            }
            k.box(c.half + 10.5, 0, -2.8, 0.25, 0.08, 2.6, 0x8d6e63);
            for (let i = 0; i < 8; i++) k.box(c.half + 10.5, 0.08, -3.9 + i * 0.32, 0.03, 0.08, 0.03, 0xadb5bd, { noAo: true });
          });
        const v = vehicle("police", c.walking ? [9, ROAD_HALF - 1] : [c.half + 16, ROAD_HALF - 1.1]);
        blinking(v.blink, 4);
        const second = actor("police", c.walking ? [8, PAVE_MID] : [c.half + 13.5, ROAD_HALF + 0.4], ["rifle"]);
        second.act("idle");
        react(second, null, { happy: "wave", angry: "talk", calm: "idle" }, 0.3);
      }
      const officer = actor(lastma ? "lastma" : "police", ahead1, lastma ? ["notebook"] : ["torch"]);
      officer.act("wave", 1.4);
      const target = c.mode === "danfo" || c.mode === "taxi" || c.mode === "car" ? driverWin : c.walking ? front : kerbWin;
      afterStop(0.1, () => goTo(officer, target, 2.0, "talk"));
      readyAt = 2.6;
      react(officer, near(ahead1, 0, c.walking ? 0 : -2.6), { happy: "wave", angry: "talk", calm: "wave" });
      goAt = 2.2;
      break;
    }
    case "thugs": {
      view(0.7, c.walking ? front : [c.half * 0.4, c.lane + 1.2], 8, 2.9);
      const bench: F = c.walking ? [5, PAVE_OUT - 0.6] : [c.half + 3, ROAD_HALF + 1.4];
      kitProps((k) => {
        k.box(bench[0], 0.16, bench[1], 2.6, 0.45, 0.45, 0x6b4f3a);
        k.cyl(bench[0] + 1.6, 0.16, bench[1] + 0.3, 0.25, 0.25, 0.55, 0x2f9e44, 10);
      });
      const boys = [0, 1, 2].map((i) => {
        const a = actor("thug", [bench[0] - 0.9 + i * 0.9, bench[1] + 0.3]);
        a.sit(0.61);
        return a;
      });
      const spots: F[] = c.walking ? [front, near(front, -0.6, -0.9), near(front, 0.9, 0.7)] : [front, kerbWin, near(kerbWin, 1.4, 0)];
      boys.forEach((b, i) => {
        afterStop(0.2 + i * 0.35, () => goTo(b, spots[i], 1.7, i === 0 ? "talk" : i === 1 ? "cheer" : "idle"));
        react(b, near(bench, (i - 1) * 1.2, 1.2), { happy: "clap", angry: "talk", calm: "wave" }, i * 0.2);
      });
      readyAt = 2.6;
      goAt = 1.8;
      break;
    }
    case "beggar": {
      view(0.7, kerbWin);
      const mum = actor("woman", c.walking ? [7, PAVE_OUT - 0.4] : [c.half + 5, PAVE_MID], ["baby"]);
      const kid = id.includes("widow") ? null : actor("kid", c.walking ? [7.6, PAVE_OUT - 0.2] : [c.half + 5.6, PAVE_MID + 0.5], [], 0.62);
      afterStop(0.2, () => goTo(mum, kerbWin, 1.2, "talk"));
      if (kid) afterStop(0.5, () => goTo(kid, near(kerbWin, -0.8, 0.5), 1.2, "idle"));
      react(mum, c.walking ? [-6, PAVE_OUT - 0.5] : [-6, PAVE_MID], { happy: "wave", angry: "idle", calm: "idle" });
      if (kid) react(kid, c.walking ? [-6.6, PAVE_OUT - 0.3] : [-6.6, PAVE_MID + 0.4], { happy: "jump", calm: "idle" }, 0.2);
      readyAt = 3.2;
      break;
    }
    case "hawkers":
    case "wiper": {
      view(0.85, kerbWin);
      if (kind === "wiper") {
        const boy = actor("kid", c.walking ? [5, PAVE_OUT] : [c.half + 4, ROAD_HALF + 0.6], ["squeegee", "bucket"], 0.72);
        afterStop(0.1, () => goTo(boy, c.walking ? front : [c.half + 0.7, c.lane - 0.4], 2.4, "work"));
        afterStop(2.0, () => goTo(boy, driverWin, 1.4, "talk"));
        react(boy, [c.half + 4, ROAD_HALF + 0.6], { happy: "jump", angry: "talk", calm: "wave" });
        readyAt = 3.3;
        view(-0.6, front);
        break;
      }
      const school = id.includes("school");
      const sellers: { a: Actor; to: F }[] = [];
      const n = school ? 1 : 3;
      for (let i = 0; i < n; i++) {
        const costume: Costume = school ? "schoolkid" : i === 1 ? "man" : "woman";
        const a = actor(costume, c.walking ? [7 + i * 1.5, PAVE_OUT - 0.3] : [c.half + 7 + i * 2.5, ROAD_HALF + 0.8], ["tray"], school ? 0.7 : 1);
        a.act("idle");
        const to: F = i === 0 ? kerbWin : i === 1 ? (c.walking ? near(front, 0.6, -0.6) : driverWin) : near(kerbWin, 1.5, 0.1);
        sellers.push({ a, to });
      }
      sellers.forEach(({ a, to }, i) => {
        afterStop(0.05 + i * 0.25, () => goTo(a, to, 3.2, i % 2 ? "wave" : "talk"));
        react(a, c.walking ? [-8 - i * 2, PAVE_OUT - 0.4] : [-8 - i * 2, ROAD_HALF + 0.8], { happy: "cheer", angry: "idle", calm: "wave" }, i * 0.15);
      });
      readyAt = 1.8;
      break;
    }
    case "flat":
    case "breakdown": {
      if (kind === "flat") view(2.2, [-c.half * 0.4, c.lane + 1.0], 5.6, 2.3);
      else view(0.5, [c.half, c.lane]);
      flat = kind === "flat";
      kitProps((k) => {
        // The vulcaniser's shed: a board, a stack of tyres, a compressor.
        const f = c.half + 4;
        const r = PAVE_OUT + 0.4;
        k.box(f, 0.16, r + 0.5, 2.4, 2.2, 1.6, 0x8d6e63);
        k.box(f, 2.36, r + 0.5, 2.8, 0.1, 2.0, 0x495057);
        for (let i = 0; i < 4; i++) k.cyl(f + 1.6, 0.16 + i * 0.22, r - 0.2, 0.32, 0.32, 0.2, 0x1b1b1b, 14);
        k.box(f - 1.7, 0.16, r - 0.2, 0.6, 0.5, 0.4, 0xc92a2a);
      });
      if (kind === "flat") {
        kitProps((k) => k.quad(c.half + 4, 2.6, PAVE_OUT - 0.4, 2.4, 0.45, 0xe8590c, { ry: Math.PI }));
        const man = actor("mechanic", [c.half + 4, PAVE_MID + 0.6], ["shovel"]);
        afterStop(0.4, () => goTo(man, [-c.half * 0.55, c.lane + c.halfW + 0.7], 1.4, "work"));
        react(man, [c.half + 4, PAVE_MID + 0.6], { happy: "wave", angry: "talk", calm: "wave" }, 0.6);
        readyAt = 3.2;
        goAt = 2.6;
      } else {
        // Smoke (or steam) from the engine; people come to look and help.
        const steam = id.includes("overheat");
        let smoking = true;
        smoke(() => {
          const p = W([c.half - 0.3, c.lane]);
          return { x: p.x, y: 1.3, z: p.z };
        }, steam ? 0xf1f3f5 : 0x7a7a7a, () => smoking);
        const helpers = id.includes("push") ? 3 : id.includes("chain") ? 1 : 2;
        for (let i = 0; i < helpers; i++) {
          const a = actor(i === 0 ? "mechanic" : "man", [c.half + 6 + i, PAVE_MID + (i % 2) * 0.6], i === 0 && steam ? ["bucket"] : []);
          const to: F = id.includes("push") ? [-c.half - 0.7, c.lane - 0.6 + i * 0.6] : i === 0 ? [c.half + 0.8, c.lane + 0.4] : near(kerbWin, 0.6 * i, 0.3);
          afterStop(0.3 + i * 0.3, () => goTo(a, to, 1.6, id.includes("push") ? "lean" : i === 0 ? "work" : "talk"));
          react(a, [c.half + 6 + i, PAVE_MID + (i % 2) * 0.6], { happy: "cheer", angry: "talk", calm: "wave" }, 0.4 + i * 0.2);
        }
        afterChoice(0.3, () => (smoking = false));
        readyAt = 2.8;
        goAt = 2.2;
      }
      break;
    }
    case "crash": {
      view(id.includes("blame") ? -1.9 : -2.5, id.includes("blame") ? [-c.half - 1, c.lane - 0.5] : [c.half + 6, 0], 7.5, 3);
      const blame = id.includes("blame");
      // Two cars nose to nose (or one in your back), hazards on, glass on the road.
      const a1 = blame ? vehicle("car", [-c.half - 2.8, c.lane], 0.05) : vehicle("car", [c.half + 9, -c.lane + 0.6], Math.PI - 0.5);
      const a2 = blame ? null : vehicle(rand() < 0.5 ? "danfo" : "suv", [c.half + 12.5, -c.lane - 0.2], Math.PI + 0.25);
      blinking([...a1.blink, ...(a2?.blink ?? [])]);
      kitProps((k) => {
        for (let i = 0; i < 14; i++) k.box((blame ? -c.half - 0.6 : c.half + 10.6) + (rand() - 0.5) * 2, 0.01, (blame ? c.lane : -c.lane) + (rand() - 0.5) * 2, 0.08, 0.02, 0.06, 0xd0ebff, { noAo: true });
      });
      const d1 = actor("man", blame ? [-c.half - 1.6, c.lane - 1.4] : [c.half + 10.5, -0.4]);
      const d2 = blame ? null : actor(rand() < 0.5 ? "woman" : "man", [c.half + 10.6, 1.0]);
      if (d2) {
        const p2 = W([c.half + 10.6, 1.0]);
        const p1 = W([c.half + 10.5, -0.4]);
        d1.face(p2.x, p2.z);
        d2.face(p1.x, p1.z);
        d1.act("talk", 1.7);
        d2.act("talk", 1.9);
      }
      for (let i = 0; i < 2; i++) actor("any", [c.half + 8 + i * 3, ROAD_HALF + 1]).act(i ? "talk" : "idle");
      afterStop(blame ? 0.3 : 1.0, () => goTo(d1, c.walking ? front : blame ? driverWin : driverWin, 1.6, "talk"));
      readyAt = blame ? 2.4 : 3.6;
      react(d1, blame ? [-c.half - 1.6, c.lane - 1.4] : [c.half + 10.5, -0.4], { happy: "handshake", angry: "talk", calm: "wave" });
      if (d2) react(d2, null, { happy: "clap", angry: "talk", calm: "idle" }, 0.2);
      break;
    }
    case "goslow": {
      view(-2.6, [c.half + 7, 0], 10, 4.6);
      const kinds: VehicleKind[] = ["danfo", "car", "bus", "keke", "car", "truck", "taxi", "car"];
      let f = c.walking ? -6 : c.half + 1.6;
      const queue: { v: Vehicle; f: number; speed: number }[] = [];
      for (let i = 0; i < 5; i++) {
        const v = vehicle(kinds[(i + Math.floor(rand() * 3)) % kinds.length], [0, c.walking ? LANE_OF(c) : c.lane]);
        f += v.half;
        const p = W([f, c.walking ? LANE_OF(c) : c.lane]);
        v.root.position.set(p.x, 0, p.z);
        queue.push({ v, f, speed: 0 });
        f += v.half + 1.6 + rand() * 1.5;
      }
      for (let i = 0, g = c.half + 2; i < 6; i++) {
        const v = vehicle(kinds[(i * 3 + 1) % kinds.length], [g, -LANE_OF(c)], Math.PI);
        g += v.half * 2 + 2 + rand() * 3;
      }
      if (!c.walking) obstacle = () => c.eventS + queue[0].f - queue[0].v.half;
      const seller = actor("woman", [c.half + 6, -0.2], ["tray"]);
      seller.act("idle");
      const guide = actor(id.includes("okada") ? "man" : id.includes("mirror") ? "thug" : "kid", c.walking ? [5, PAVE_MID - 1] : [c.half + 3, -1.4], [], id.includes("guide") ? 0.75 : 1);
      afterStop(0.3, () => goTo(guide, c.walking ? front : driverWin, 1.6, "talk"));
      afterStop(0.6, () => goTo(seller, [c.half + 3.6, 0], 1.0, "wave"));
      react(guide, c.walking ? [5, PAVE_MID - 1] : [c.half + 3, -1.6], { happy: "wave", angry: "talk", calm: "idle" });
      react(seller, [c.half + 7, -0.2], { happy: "cheer", calm: "idle" }, 0.3);
      // After the choice the queue creeps off, and you follow.
      extra.push((dt, phase, t) => {
        if (phase !== "outro") return;
        queue.forEach((q, i) => {
          if (t < i * 0.35) return;
          q.speed = Math.min(10, q.speed + dt * 4);
          q.f += q.speed * dt;
          const p = c.route.place(c.eventS + q.f, c.walking ? LANE_OF(c) : c.lane);
          q.v.root.position.set(p.x, 0, p.z);
          q.v.root.rotation.y = p.yaw;
          for (const w of q.v.wheels) w.rotation.z -= (q.speed * dt) / 0.35;
        });
      });
      readyAt = 2.2;
      goAt = 1.0;
      break;
    }
    case "pothole": {
      view(0.6, c.walking ? [2, ROAD_HALF - 1.2] : [c.half + 2.6, c.lane]);
      const splash = c.walking || id.includes("splash");
      const hole: F = splash ? [2, ROAD_HALF - 1.2] : [c.half + 2.6, c.lane];
      kitProps((k) => {
        k.mat(hole[0], 0.012, hole[1], 2.6, 2.0, 0x5a4a3a, { noAo: true });
        k.mat(hole[0], 0.016, hole[1], 2.0, 1.5, splash ? 0x6b5a46 : 0x4a3b2c, { noAo: true });
        if (!splash) {
          k.ball(hole[0] + 1.6, 0, ROAD_HALF + 1.2, 0.8, 0xd4a373, { part: 0.5, sy: 0.55 });
        }
      });
      // The rope across the road, dropped once they've had their say.
      const rope = splash ? null : kitProps((k) => k.box(hole[0] + 0.5, 0.75, (ROAD_HALF + 1.4 - 3.2) / 2, 0.03, 0.03, ROAD_HALF + 1.4 + 3.2, 0xf8f9fa, { noAo: true }));
      if (rope) afterChoice(1.2, () => (rope.visible = false));
      if (splash) {
        // A car comes through the puddle and soaks you.
        const v = vehicle(rand() < 0.5 ? "danfo" : "car", [-30, ROAD_HALF - 1.6]);
        let vf = -30;
        const drops = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x8a6e4b, size: 0.09, transparent: true, opacity: 0.9 }));
        const dn = 160;
        const dp = new Float32Array(dn * 3);
        const dv = Array.from({ length: dn }, () => [0, 0, 0]);
        drops.geometry.setAttribute("position", new THREE.BufferAttribute(dp, 3));
        drops.visible = false;
        drops.frustumCulled = false;
        c.scene.add(drops);
        own.push(() => (drops.geometry.dispose(), (drops.material as THREE.Material).dispose(), drops.removeFromParent()));
        let splashed = -1;
        extra.push((dt, phase) => {
          if (phase === "approach") return;
          vf += dt * 16;
          const p = c.route.place(c.eventS + vf, ROAD_HALF - 1.6);
          v.root.position.set(p.x, 0, p.z);
          for (const w of v.wheels) w.rotation.z -= (16 * dt) / 0.35;
          if (splashed < 0 && vf > hole[0]) {
            splashed = 0;
            const o = W(hole);
            for (let i = 0; i < dn; i++) {
              dp.set([o.x + (Math.random() - 0.5) * 1.5, 0.1, o.z + (Math.random() - 0.5) * 1.2], i * 3);
              const sp = 2 + Math.random() * 3;
              dv[i] = [fw.fx * (Math.random() - 0.3) * 2 + fw.rx * sp, 2 + Math.random() * 3, fw.fz * (Math.random() - 0.3) * 2 + fw.rz * sp];
            }
            drops.visible = true;
          }
          if (splashed >= 0) {
            splashed += dt;
            for (let i = 0; i < dn; i++) {
              dv[i][1] -= 9.8 * dt;
              dp[i * 3] += dv[i][0] * dt;
              dp[i * 3 + 1] = Math.max(0.02, dp[i * 3 + 1] + dv[i][1] * dt);
              dp[i * 3 + 2] += dv[i][2] * dt;
            }
            drops.geometry.attributes.position.needsUpdate = true;
            if (splashed > 1.4) drops.visible = false;
          }
        });
        readyAt = 2.8;
      } else {
        const holders = [actor("thug", [hole[0] + 0.5, -3.2], ["shovel"]), actor("thug", [hole[0] + 0.5, ROAD_HALF + 1.4], ["shovel"])];
        holders.forEach((h) => h.act("idle"));
        const asker = actor("kid", [hole[0] + 1.6, ROAD_HALF + 0.6], ["bucket"], 0.78);
        afterStop(0.3, () => goTo(asker, kerbWin, 1.5, "talk"));
        react(asker, [hole[0] + 1.6, ROAD_HALF + 0.8], { happy: "jump", angry: "talk", calm: "wave" });
        holders.forEach((h, i) => react(h, null, { happy: "cheer", angry: "talk", calm: "idle" }, 0.2 + i * 0.2));
        readyAt = 2.6;
      }
      break;
    }
    case "crossing": {
      view(-2.75, [c.half + 3, 1], 9, 3.4);
      const kids = id.includes("kids");
      const cross: F = c.walking ? [3, 0] : [c.half + 3.2, 0];
      const crossers: { a?: Actor; g?: THREE.Group; from: number; speed: number; delay: number }[] = [];
      if (kids) {
        for (let i = 0; i < 5; i++) {
          const a = actor("schoolkid", [cross[0] + (i % 2) * 0.8, ROAD_HALF + 1 + i * 0.9], ["backpack"], 0.62 + (i % 3) * 0.04);
          crossers.push({ a, from: ROAD_HALF + 1 + i * 0.9, speed: 1.3, delay: i * 0.45 });
        }
        const teacher = actor("woman", [cross[0] - 1.2, ROAD_HALF + 0.4]);
        teacher.act("wave");
        react(teacher, null, { happy: "wave", angry: "talk", calm: "idle" });
      } else {
        // Goats: brown and white, heads bobbing.
        for (let i = 0; i < 5; i++) {
          const k = new Kit();
          const col = [0xf1f3f5, 0x8d6e63, 0x343a40, 0xe9dcc9][i % 4];
          k.soft(0, 0.38, 0, 0.75, 0.38, 0.32, col, 0.12);
          for (const [x, z] of [[0.28, 0.1], [0.28, -0.1], [-0.28, 0.1], [-0.28, -0.1]]) k.box(x, 0, z, 0.06, 0.4, 0.06, col);
          k.soft(0.45, 0.62, 0, 0.26, 0.22, 0.18, col, 0.06);
          for (const z of [-0.05, 0.05]) k.box(0.4, 0.84, z, 0.03, 0.14, 0.03, 0x495057, { rz: 0.5 });
          const g = k.build({ solid: c.mats.solid });
          g.traverse((m) => m instanceof THREE.Mesh && (own.push(() => m.geometry.dispose()), (m.castShadow = true)));
          c.scene.add(g);
          kitG.push(g);
          crossers.push({ g, from: ROAD_HALF + 1.2 + i * 1.3, speed: 1.6 + rand() * 0.5, delay: i * 0.35 });
        }
        const herder = actor("kid", [cross[0] - 0.8, ROAD_HALF + 8], ["stick"], 0.8);
        crossers.push({ a: herder, from: ROAD_HALF + 8, speed: 1.5, delay: 1.2 });
        react(herder, null, { happy: "wave", angry: "talk", calm: "wave" });
      }
      // They wait at the kerb (grazing, chatting) until the ride stops, then cross; one goat stops in
      // the middle and stares.
      let started = 0;
      const rs = crossers.map((x) => x.from);
      extra.push((dt, phase, t) => {
        if (phase !== "approach") started += dt;
        crossers.forEach((x, i) => {
          const tt = Math.max(0, started - x.delay);
          const slow = phase === "stopped" && !kids && i === 1 && t < 2.8 && rs[i] < c.lane + 0.4;
          const r = Math.max(phase === "outro" ? -14 : -ROAD_HALF - 1.5, slow ? rs[i] : x.from - tt * x.speed);
          rs[i] = r;
          const p = W([cross[0] + (i % 3) * 0.7, r]);
          if (x.g) {
            x.g.position.set(p.x, Math.abs(Math.sin(tt * 7)) * 0.04 + (Math.abs(r) > ROAD_HALF ? 0.16 : 0), p.z);
            x.g.rotation.y = E.yaw + Math.PI / 2;
          } else if (x.a) {
            if (r > -ROAD_HALF - 1.4) {
              x.a.root.position.set(p.x, x.a.root.position.y, p.z);
              x.a.root.rotation.y = E.yaw + Math.PI;
              x.a.act("walk");
            } else x.a.act("wave");
          }
        });
      });
      if (!c.walking) obstacle = () => (rs.some((r) => Math.abs(r - c.lane) < c.halfW + 0.7) ? c.eventS + c.half + 1.8 : null);
      readyAt = 2.2;
      goAt = 1.6;
      break;
    }
    case "stranded": {
      view(2.55, [c.half + 5, c.lane + 2], 9.5, 3);
      const v = vehicle(rand() < 0.5 ? "car" : "suv", [c.half + 8, ROAD_HALF - 1.05]);
      blinking(v.blink);
      kitProps((k) => {
        // Bonnet up, a warning triangle.
        k.box(c.half + 8 + 1.6, 1.0, ROAD_HALF - 1.05, 0.9, 0.05, 1.6, 0xadb5bd, { rz: 1.1 });
        k.cyl(c.half + 3.5, 0, ROAD_HALF - 1.05, 0, 0.35, 0.6, 0xe03131, 3);
      });
      const labour = id.includes("labour");
      const student = id.includes("student");
      const waver = actor(labour ? "man" : student ? "student" : "woman", [c.half + 6, ROAD_HALF + 0.6], student ? ["backpack"] : []);
      waver.act("wave", 1.5);
      if (labour) {
        const wife = actor("woman", [c.half + 7.5, PAVE_MID + 0.4]);
        wife.sit(0.16);
        react(wife, null, { happy: "wave", calm: "idle" }, 0.5);
      }
      afterStop(0.2, () => goTo(waver, kerbWin, 2.2, "talk"));
      react(waver, [c.half + 6, ROAD_HALF + 0.6], { happy: "cheer", angry: "talk", calm: "wave" });
      readyAt = 2.4;
      break;
    }
    case "rain": {
      view(0.7, kerbWin);
      makeRain();
      const flood = id.includes("flood");
      if (flood) {
        const geo = new THREE.PlaneGeometry(14, 44).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshLambertMaterial({ color: 0x6b5a46, transparent: true, opacity: 0.85 });
        const water = new THREE.Mesh(geo, mat);
        const p = W([c.half + 14, 0]);
        water.position.set(p.x, 0.22, p.z);
        water.rotation.y = E.yaw + Math.PI / 2;
        c.scene.add(water);
        own.push(() => (geo.dispose(), mat.dispose(), water.removeFromParent()));
        for (let i = 0; i < 3; i++) {
          const a = actor("thug", [c.half + 5 + i, ROAD_HALF + 0.8]);
          afterStop(0.2 + i * 0.3, () => goTo(a, i === 0 ? kerbWin : [-c.half - 0.8, c.lane - 0.5 + i * 0.5], 1.8, i === 0 ? "talk" : "idle"));
          react(a, [c.half + 5 + i, ROAD_HALF + 0.8], { happy: "cheer", angry: "talk", calm: "wave" }, i * 0.2);
        }
      } else {
        const boy = actor("kid", c.walking ? [6, PAVE_OUT - 0.4] : [c.half + 5, PAVE_MID], ["umbrella"], 0.75);
        afterStop(0.1, () => goTo(boy, kerbWin, 3.0, "talk"));
        react(boy, c.walking ? [6, PAVE_OUT - 0.4] : [c.half + 5, PAVE_MID], { happy: "jump", calm: "wave", angry: "idle" });
      }
      readyAt = 2.0;
      break;
    }
    case "convoy":
    case "wedding": {
      view(-2.5, [c.half + 5, 0], 10, 3.4);
      const wedding = kind === "wedding";
      const cars: { v: Vehicle; f: number; speed: number }[] = [];
      const kinds: VehicleKind[] = wedding ? ["wedding", "wedding", "car"] : ["police", "suv", "suv", "suv"];
      let f = c.walking ? -2 : c.half + 3;
      for (const kk of kinds) {
        const v = vehicle(kk, [0, 0]);
        f += v.half;
        cars.push({ v, f, speed: 0 });
        f += v.half + 2.2;
        if (!wedding) blinking(v.blink, 5);
      }
      const laneOf = (i: number) => (wedding ? (c.walking ? LANE_OF(c) : c.lane) : i % 2 ? -0.4 : 0.6);
      const placeCars = () =>
        cars.forEach((q, i) => {
          const p = c.route.place(c.eventS + q.f, laneOf(i));
          q.v.root.position.set(p.x, 0, p.z);
          q.v.root.rotation.y = p.yaw;
        });
      placeCars();
      if (!c.walking) obstacle = () => c.eventS + cars[0].f - cars[0].v.half;
      if (wedding) {
        const dancers = [actor("aunty", [c.half + 4, 0.4]), actor("chief", [c.half + 5, -0.8]), actor("aunty", [c.half + 6, 1.2]), actor("woman", [c.half + 4.6, -2.4])];
        const moves = ["dance_shaku", "dance_groove", "dance_legwork", "dance_wave"];
        dancers.forEach((d, i) => {
          d.act(moves[i]);
          react(d, null, { happy: "cheer", angry: "dance_groove", calm: "dance_groove" }, i * 0.1);
          afterChoice(1.8 + i * 0.2, () => goTo(d, [c.half + 4 + i, ROAD_HALF + 1.2 + (i % 2)], 1.6, "dance_groove"));
        });
        const aunty = dancers[0];
        afterStop(0.6, () => goTo(aunty, kerbWin, 1.4, "dance_armsup"));
        money([c.half + 5, -0.2]);
        kitProps((k) => {
          // A drummer by the kerb.
          kitPerson(k, c.half + 7, ROAD_HALF + 1.1, Math.PI, rand);
          k.cyl(c.half + 6.6, 0.75, ROAD_HALF + 1.1, 0.16, 0.12, 0.5, 0x8d6e63, 10, { rz: 0.5 });
        });
        readyAt = 2.6;
      } else {
        const escort = actor("escort", [c.half + 1.6, -1.6], ["stick"]);
        escort.act("wave", 1.8);
        afterStop(0.2, () => goTo(escort, c.walking ? front : driverWin, 1.8, "talk"));
        react(escort, [c.half + 2.5, -0.6], { happy: "wave", angry: "talk", calm: "wave" });
        readyAt = 2.2;
      }
      // After the choice they drive off ahead.
      extra.push((dt, phase) => {
        if (phase !== "outro") return;
        cars.forEach((q) => {
          q.speed = Math.min(wedding ? 12 : 24, q.speed + dt * (wedding ? 3 : 8));
          q.f += q.speed * dt;
          for (const w of q.v.wheels) w.rotation.z -= (q.speed * dt) / 0.36;
        });
        placeCars();
      });
      goAt = wedding ? 2.6 : 1.2;
      break;
    }
    case "fan": {
      view(0.7, kerbWin);
      const fan = actor(rand() < 0.5 ? "student" : "woman", c.walking ? [8, PAVE_OUT - 0.4] : [c.half + 7, PAVE_MID]);
      const friend = actor("any", c.walking ? [9, PAVE_OUT - 0.8] : [c.half + 8, PAVE_MID + 0.6], ["phone"]);
      afterStop(0.1, () => goTo(fan, kerbWin, 3.6, "jump"));
      afterStop(0.6, () => goTo(friend, near(kerbWin, 1.6, 0.6), 1.4, "idle"));
      react(fan, null, { happy: "cheer", angry: "idle", calm: "wave" });
      react(friend, null, { happy: "clap", calm: "idle" }, 0.2);
      afterChoice(2.0, () => {
        goTo(fan, c.walking ? [6, PAVE_OUT - 0.4] : [c.half + 6, PAVE_MID], 1.4, "wave");
        goTo(friend, c.walking ? [7, PAVE_OUT - 0.8] : [c.half + 7, PAVE_MID + 0.6], 1.4, "idle");
      });
      readyAt = 1.8;
      break;
    }
    case "bag": {
      view(-2.6, c.walking ? [2.2, ROAD_HALF - 0.8] : [c.half + 2.2, c.lane - 0.3], 8, 3);
      const at: F = c.walking ? [2.2, ROAD_HALF - 0.8] : [c.half + 2.2, c.lane - 0.3];
      const g = kitProps((k) => {
        k.soft(at[0], 0, at[1], 0.55, 0.32, 0.3, 0x7c2d12, 0.08, { ry: 0.4 });
        k.box(at[0], 0.32, at[1], 0.3, 0.12, 0.03, 0x5c2a0e, { ry: 0.4 });
        k.box(at[0] + 0.4, 0.005, at[1] + 0.2, 0.15, 0.01, 0.08, 0x8fd18f, { ry: 1, noAo: true });
      });
      afterChoice(0.6, (m) => {
        if (m !== "angry") g.visible = false;
      });
      readyAt = 1.0;
      break;
    }
    case "busstop": {
      view(1.0, kerbWin, 8);
      kitProps((k) => {
        const f = c.seatF + 1.5;
        k.at(f, 0, PAVE_OUT - 1.2, Math.PI, () => {
          k.box(0, 2.5, 0, 4.4, 0.12, 1.8, 0x1864ab);
          for (const x of [-2, 2]) k.box(x, 0.16, -0.7, 0.1, 2.34, 0.1, 0x495057);
          k.box(0, 0.6, -0.4, 3.4, 0.08, 0.4, 0x868e96);
          for (let i = 0; i < 4; i++) kitPerson(k, -1.6 + i * 1.1, 0, Math.PI + (rand() - 0.5), rand, { wrapper: rand() < 0.5, tray: i === 2 });
        });
      });
      const preacher = id.includes("preacher");
      const squeeze = id.includes("squeeze");
      const who = actor(preacher ? "preacher" : squeeze ? "woman" : "man", [c.seatF + 4, PAVE_MID + 0.5], preacher ? ["bible"] : squeeze ? ["basin"] : []);
      afterStop(0.3, () => goTo(who, kerbWin, 1.3, preacher ? "talk" : "idle"));
      react(who, null, { happy: "clap", angry: "talk", calm: "idle" });
      readyAt = 2.6;
      break;
    }
    case "inside": {
      // In the ride: the camera comes close to the window.
      view(1.25, [c.seatF, c.lane], 3.4, 1.5);
      readyAt = 0.8;
      goAt = 0.6;
      break;
    }
    case "fight": {
      view(-2.5, c.walking ? [5, ROAD_HALF - 1.5] : [c.half + 6, 0], 10, 3.4);
      const thief = id.includes("thief");
      const centre: F = c.walking ? [5, ROAD_HALF - 1.5] : [c.half + 6, 0];
      const a = actor(thief ? "thug" : "man", near(centre, 0, -0.6));
      const b = actor("man", near(centre, 0, 0.6));
      const pa = W(near(centre, 0, 0.6));
      const pb = W(near(centre, 0, -0.6));
      a.face(pa.x, pa.z);
      b.face(pb.x, pb.z);
      a.act(thief ? "idle" : "talk", 2);
      b.act("talk", 2.2);
      const crowd = [0, 1, 2, 3].map((i) => {
        const p: F = near(centre, (i % 2 ? 1.6 : -1.6) + (i > 1 ? 0.6 : 0), (i > 1 ? 1.4 : -1.4));
        const x = actor(i % 2 ? "woman" : "any", p);
        const q = W(centre);
        x.face(q.x, q.z);
        x.act(i % 2 ? "cheer" : "talk");
        return x;
      });
      // The two square up and shove, now and then.
      extra.push((_dt, phase) => {
        if (phase === "outro") return;
        const k = Math.sin(clock * 3.1) * 0.25;
        const p1 = W(near(centre, 0, -0.6 + Math.max(0, k)));
        const p2 = W(near(centre, 0, 0.6 + Math.min(0, k)));
        a.root.position.x = p1.x;
        a.root.position.z = p1.z;
        b.root.position.x = p2.x;
        b.root.position.z = p2.z;
      });
      react(a, near(centre, -3, -4), { happy: "handshake", angry: "talk", calm: "idle" });
      react(b, near(centre, 3, -4), { happy: "handshake", angry: "talk", calm: "idle" });
      crowd.forEach((x, i) => react(x, near(centre, (i - 1.5) * 3, ROAD_HALF + 1.6), { happy: "clap", angry: "cheer", calm: "idle" }, 0.2 * i));
      readyAt = 2.0;
      goAt = 2.4;
      break;
    }
  }

  // People step up on to the pavement and down into the road.
  const groundY = (x: number, z: number) => (Math.abs(lateral(x, z)) > ROAD_HALF + 0.05 ? 0.16 : 0);
  const fp = W(V.at);
  return {
    view: { phi: V.phi, rad: V.rad, h: V.h, focus: new THREE.Vector3(fp.x, 1.3, fp.z) },
    rain,
    flat,
    obstacle: () => {
      let at = obstacle();
      if (c.walking) return at;
      // Anyone standing in your lane ahead.
      for (const a of actors) {
        const dx = a.root.position.x - E.x;
        const dz = a.root.position.z - E.z;
        const f = dx * fw.fx + dz * fw.fz;
        const r = dx * fw.rx + dz * fw.rz;
        if (Math.abs(r - c.lane) < c.halfW + 0.5 && f > c.half - 0.5) at = Math.min(at ?? Infinity, c.eventS + f - 0.5);
      }
      return at;
    },
    update(dt, phase, t, cam) {
      if (phase === "stopped")
        for (const e of onStop)
          if (!e.done && t >= e.at) {
            e.done = true;
            e.fn();
          }
      if (phase === "outro") {
        for (const e of onOutro)
          if (!e.done && t >= e.at) {
            e.done = true;
            e.fn(mood);
          }
      }
      for (const fn of extra) fn(dt, phase, t, cam);
      for (const a of actors) {
        a.update(dt);
        a.root.position.y = groundY(a.root.position.x, a.root.position.z);
      }
      for (const v of vehicles) for (const e of v.extras) e.update(dt, false);
    },
    ready: (t) => t >= readyAt && actors.every((a) => a.arrived()),
    outro(m) {
      mood = m;
      // Anyone still walking up finishes their walk first.
      for (const e of onStop)
        if (!e.done) {
          e.done = true;
          e.fn();
        }
    },
    canGo: (t) => t >= goAt + (mood === "angry" ? 0.4 : 0),
    dispose() {
      for (const a of actors) a.dispose();
      for (const v of vehicles) v.dispose();
      for (const g of kitG) g.removeFromParent();
      for (const d of own) d();
    },
  };
}

/** The lane a walker's traffic drives in (the near lane, beside the pavement). */
function LANE_OF(c: StageCtx) {
  return c.walking ? 2.2 : c.lane;
}
