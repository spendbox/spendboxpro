// The city's world events, drawn in 3D: ambulances racing to the hospital, fireworks over the
// stadium, a whale breaching off the harbour, a UFO over the rooftops... (100 of them, see
// src/lib/world-events.ts). City-view hands us the list the game state carries; each event
// shows from its start to its end, arriving with a short intro and leaving with an outro, at
// the nearest place in the city that fits it (see events/spots.ts). Everything is worked out
// from the event's id and its own clock, so every player sees the same thing at the same time.
//
// Each event also gets a floating pin (its icon, in its category's colour) so it can be found
// from anywhere on the map, and rewards (cash, a treasure chest, a lost dog...) can be tapped:
// pick() / pickAt() say which event was tapped.
//
// All events share one small drawing kit (events/kit.ts), so even with a few on at once they
// only add a fixed handful of draw calls.

import * as THREE from "three";
import type { CityPlan, Tile } from "@/lib/city/layout";
import { WORLD_EVENT_BY_KEY, type WorldEvent } from "@/lib/world-events";
import { playEventSound } from "./event-sounds";
import { CATEGORY_COLOR, createArtSheet, createUiSheet } from "./events/art";
import { clamp, easeOutBack, smooth, type Ev, type Scene } from "./events/common";
import { Kit } from "./events/kit";
import { sceneFor } from "./events/scenes";
import { findSpot, indexCity, type CityIndex } from "./events/spots";

export type WorldEventsHost = {
  scene: THREE.Scene;
  /** What the events hang off (hidden while the city is still a secret). */
  parent: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  tiles: () => Tile[];
  plan: () => CityPlan | null;
  /** Height of the land at (x, z) (hills round the city). */
  ground: (x: number, z: number) => number;
  /** 0 by day, 1 at night. */
  night: () => number;
};

export type WorldEventsLayer = ReturnType<typeof createWorldEvents>;

/**
 * A pin as drawn this frame: where its centre is, its size in world units (a camera-facing
 * square, the round head in its upper part), how visible it is, and what it says.
 */
export type EventPin = { id: number; x: number; y: number; z: number; size: number; alpha: number; title: string; color: string; claimable: boolean; coins: number };

/** Where the round head of a pin sits in its square (as a share of its size): up from the centre, and its radius. */
export const PIN_HEAD = { up: 0.094, r: 0.36, top: 0.453 };

type Inst = {
  ev: WorldEvent;
  start: number;
  end: number;
  scene: Scene;
  e: Ev | null;
  badge: number;
  sounded: boolean;
  /** Its scene threw: skip it (never let one event stop the whole city drawing). */
  broken: boolean;
};

const INTRO = 2.5;

export function createWorldEvents(host: WorldEventsHost) {
  const art = createArtSheet();
  const ui = createUiSheet();
  const kit = new Kit(host, art, ui);
  const list = new Map<number, Inst>();
  let city: CityIndex | null = null;
  let lastTiles: Tile[] | null = null;
  let idle = false;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  // The pins drawn this frame (reused records, never allocated per frame).
  const pins: EventPin[] = [];
  let pinN = 0;

  function release(inst: Inst) {
    if (inst.badge >= 0) ui.give(inst.badge);
    inst.badge = -1;
    if (inst.e && inst.e.cell >= 0) ui.give(inst.e.cell);
    if (inst.e) inst.e.cell = -1;
  }

  function set(events: WorldEvent[] | null | undefined) {
    const seen = new Set<number>();
    for (const ev of events ?? []) {
      if (!WORLD_EVENT_BY_KEY[ev.key]) continue;
      seen.add(ev.id);
      const start = Date.parse(ev.startsAt);
      const end = Date.parse(ev.endsAt);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const old = list.get(ev.id);
      if (old && old.ev.key === ev.key && old.ev.tile === ev.tile) {
        old.ev = ev;
        old.start = start;
        old.end = end;
        if (old.e) old.e.ev = ev;
        continue;
      }
      if (old) release(old);
      list.set(ev.id, { ev, start, end, scene: sceneFor(ev.key), e: null, badge: -1, sounded: false, broken: false });
    }
    for (const [id, inst] of list) {
      if (seen.has(id)) continue;
      release(inst);
      list.delete(id);
    }
  }

  function cityNow() {
    const tiles = host.tiles();
    if (tiles !== lastTiles) {
      lastTiles = tiles;
      city = tiles.length ? indexCity(tiles, host.plan()) : null;
      // The city changed (a new round, or it grew): place everything afresh.
      for (const inst of list.values()) {
        if (inst.e && inst.e.cell >= 0) ui.give(inst.e.cell);
        inst.e = null;
      }
    }
    return city;
  }

  function prepare(inst: Inst): Ev | null {
    if (inst.e) return inst.e;
    const c = cityNow();
    if (!c) return null;
    const kind = WORLD_EVENT_BY_KEY[inst.ev.key];
    const s = findSpot(c, kind.needs, inst.ev.tile, inst.ev.id, host.ground);
    if (!s) return null;
    const id = inst.ev.id;
    const e: Ev = {
      k: kit,
      id,
      key: inst.ev.key,
      kind,
      ev: inst.ev,
      s,
      t: 0,
      dur: Math.max(1, (inst.end - inst.start) / 1000),
      left: 0,
      life: 0,
      pop: 0,
      night: 0,
      claimable: false,
      bx: s.x,
      by: 0,
      bz: s.z,
      half: c.half,
      cell: -1,
      r: (n: number) => {
        let h = Math.imul(id | 0, 2654435761) ^ Math.imul(n | 0, 1597334677);
        h = Math.imul(h ^ (h >>> 15), 2246822519);
        h ^= h >>> 13;
        return (h >>> 0) / 4294967296;
      },
      a: { x: 0, y: 0, z: 0, yaw: 0 },
      b: { x: 0, y: 0, z: 0, yaw: 0 },
      v: new THREE.Vector3(),
    };
    inst.e = e;
    return e;
  }

  /** How loud (and which side) an event at (x, z) is from where the camera is looking. */
  function hearing(x: number, z: number) {
    const cam = host.camera;
    cam.getWorldDirection(fwd);
    // Where the view meets the ground.
    const d = fwd.y < -0.05 ? -cam.position.y / fwd.y : 30;
    const lx = cam.position.x + fwd.x * d;
    const lz = cam.position.z + fwd.z * d;
    const far = Math.hypot(x - lx, z - lz);
    const zoom = clamp(1.25 - cam.position.distanceTo(tmp.set(lx, 0, lz)) / 110, 0.25, 1);
    right.set(-fwd.z, 0, fwd.x).normalize();
    const dx = x - cam.position.x;
    const dz = z - cam.position.z;
    const pan = clamp((dx * right.x + dz * right.z) / Math.max(1, Math.hypot(dx, dz)), -1, 1) * 0.7;
    return { volume: clamp(1 - far / 38) * zoom, pan };
  }

  function update(dt: number, time: number, nowMs: number) {
    pinN = 0;
    if (!host.parent.visible || !list.size) {
      if (!idle) {
        kit.idle();
        idle = true;
      }
      return;
    }
    idle = false;
    cityNow();
    kit.begin();
    kit.night = host.night();
    for (const inst of list.values()) {
      if (inst.broken || nowMs < inst.start || nowMs >= inst.end) {
        if (nowMs >= inst.end) release(inst);
        continue;
      }
      const e = prepare(inst);
      if (!e) continue;
      const kind = e.kind;
      e.t = (nowMs - inst.start) / 1000;
      e.left = (inst.end - nowMs) / 1000;
      e.life = clamp(Math.min(e.t / INTRO, e.left / INTRO));
      e.pop = (e.t < 1.3 ? easeOutBack(clamp(e.t / 1.3)) : 1) * smooth(0, 2.2, e.left);
      e.night = kit.night;
      e.claimable = !!kind.reward && !inst.ev.claimed && (inst.ev.slotsLeft ?? kind.reward.slots) > 0;
      e.bx = e.s.x;
      e.bz = e.s.z;
      e.by = Math.max(e.s.top, e.s.ground) + 1.15;
      if (e.key === "bounty_board" && e.cell < 0) {
        e.cell = ui.take();
        if (e.cell >= 0) ui.poster(e.cell, inst.ev.name ?? "");
      }
      try {
        inst.scene.draw(e);
      } catch (err) {
        inst.broken = true;
        console.error(`World event "${e.key}" failed to draw`, err);
        continue;
      }
      if (inst.badge < 0) {
        inst.badge = ui.take();
        if (inst.badge >= 0) ui.badge(inst.badge, inst.scene.icon, CATEGORY_COLOR[kind.category] ?? "#495057", e.claimable ? "#ffe066" : "#ffffff");
      }
      if (inst.badge >= 0) {
        const py = e.by + Math.sin(time * 2 + e.id) * 0.06;
        kit.badge(inst.badge, e.bx, py, e.bz, 1, e.life);
        if (pinN >= pins.length) pins.push({ id: 0, x: 0, y: 0, z: 0, size: 1, alpha: 0, title: "", color: "", claimable: false, coins: 0 });
        const p = pins[pinN++];
        p.id = e.id;
        p.x = e.bx;
        p.y = py;
        p.z = e.bz;
        // Same size rule as Kit.badge().
        p.size = Math.min(3.4, Math.max(0.42, host.camera.position.distanceTo(tmp.set(e.bx, py, e.bz)) * 0.052));
        p.alpha = e.life;
        p.title = kind.title;
        p.color = CATEGORY_COLOR[kind.category] ?? "#495057";
        p.claimable = e.claimable;
        p.coins = kind.reward?.coins ?? 0;
      }
      if (!inst.sounded) {
        inst.sounded = true;
        // Only a fresh event makes a sound (not one already running when you arrive).
        if (e.t < 6) {
          const h = hearing(e.s.x, e.s.z);
          playEventSound(inst.scene.sound, h);
        }
      }
    }
    kit.end(time);
    kit.applySky();
    void dt;
  }

  /** Where an event is (for flying the camera there), or null if it isn't known / placeable. */
  function locate(id: number): THREE.Vector3 | null {
    const inst = list.get(id);
    if (!inst) return null;
    const e = prepare(inst);
    if (!e) return null;
    return new THREE.Vector3(e.s.x, 0, e.s.z);
  }

  /** Play an event's sound (e.g. when the camera flies to it). */
  function ping(id: number) {
    const inst = list.get(id);
    if (!inst?.e) return;
    playEventSound(inst.scene.sound, { volume: 0.8 });
  }

  /** Which event's reward is under this ray (the nearest), or null. */
  function pick(r: THREE.Raycaster): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    const cam = host.camera.position;
    for (let k = 0; k < kit.hitN; k++) {
      const o = k * 5;
      tmp.set(kit.hits[o + 1], kit.hits[o + 2], kit.hits[o + 3]);
      const dist = cam.distanceTo(tmp);
      // Generous: easy to tap even when zoomed right out.
      const rr = Math.max(kit.hits[o + 4], dist * 0.04);
      if (r.ray.distanceSqToPoint(tmp) > rr * rr) continue;
      if (dist < bestD) {
        bestD = dist;
        best = kit.hits[o];
      }
    }
    return best;
  }

  /** pick() for a tap at screen position (clientX, clientY) on the canvas. */
  function pickAt(clientX: number, clientY: number): number | null {
    if (!kit.hitN) return null;
    const rect = host.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, host.camera);
    return pick(ray);
  }

  /** How many pins were drawn this frame; pin(k) is the k-th (valid until the next update). */
  const pinCount = () => pinN;
  const pin = (k: number): EventPin => pins[k];

  /**
   * Which event's pin is under a tap at screen position (clientX, clientY), or null. Only the
   * round head counts (plus a few pixels), so taps just beside a pin still reach the map.
   */
  function pinAt(clientX: number, clientY: number): number | null {
    if (!pinN) return null;
    const cam = host.camera;
    const rect = host.renderer.domElement.getBoundingClientRect();
    // Pixels per world unit at depth 1.
    const f = rect.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    let best: number | null = null;
    let bestD = Infinity;
    for (let k = 0; k < pinN; k++) {
      const p = pins[k];
      if (p.alpha < 0.3) continue;
      const depth = -tmp.set(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse).z;
      if (depth < 0.1) continue;
      tmp.set(p.x, p.y, p.z).project(cam);
      const px = (f / depth) * p.size;
      const sx = rect.left + ((tmp.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - tmp.y) / 2) * rect.height - PIN_HEAD.up * px;
      const r = Math.max(14, PIN_HEAD.r * px + 4);
      const dx = clientX - sx;
      const dy = clientY - sy;
      if (dx * dx + dy * dy > r * r || depth >= bestD) continue;
      bestD = depth;
      best = p.id;
    }
    return best;
  }

  /** An event's title (if it's on the map right now). */
  function titleOf(id: number): string | null {
    const inst = list.get(id);
    return inst ? (WORLD_EVENT_BY_KEY[inst.ev.key]?.title ?? null) : null;
  }

  /** A short label for a reward under the pointer (for hover text), or null. */
  function hoverAt(clientX: number, clientY: number): string | null {
    const id = pickAt(clientX, clientY);
    if (id === null) return null;
    const inst = list.get(id);
    const kind = inst ? WORLD_EVENT_BY_KEY[inst.ev.key] : null;
    return kind?.reward ? `${kind.title} · tap to grab ${kind.reward.coins} coins` : null;
  }

  function dispose() {
    for (const inst of list.values()) release(inst);
    list.clear();
    kit.dispose();
    art.dispose();
    ui.dispose();
  }

  return { set, update, locate, ping, pick, pickAt, pinAt, pinCount, pin, titleOf, hoverAt, dispose };
}
