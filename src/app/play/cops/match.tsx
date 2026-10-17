"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bomb, ChevronLeft, ChevronRight, Crosshair, Eye, HeartPulse, Map as MapIcon, MessageCircle, RotateCcw, Send, Shield, Swords, Target, Truck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { GUNS, SIDES, gunsOf, type GunId, type Loadout } from "@/lib/cops";
import { FullScreen } from "../minigames/fullscreen";
import { canWebGL } from "../minigames/webgl";
import { tone } from "../minigames/sfx";
import { playSfx } from "../sound";
import type { CopsNet, Msg } from "./net";
import { CopsScene, type Tod } from "./scene";
import {
  BASES, City, HIDEOUT, MAP, RULES, SHOT_KINDS, VAULT, activity, blast, blocks, fly, hitsPerson, hurt, layout, makeShot, newStats, rand, separate, shapeHit, spawns, tankBox, think,
  type Actor, type Bag, type Shot, type ShotKind, type V3,
} from "./world";

// One match of Police & Thieves (or practice against bots): full screen, third person.
// Thieves win points by taking bags of money from the bank's vault to their hideout (3 each);
// police by stopping them. A takedown is 1, a bag the police take back is 1. Most points when the
// time's up wins. Left thumb moves, right thumb looks; tap to shoot (or hold FIRE), AIM, JUMP,
// CROUCH (hide behind low cover), RELOAD, switch guns, throw a grenade, use a medkit, call in a
// tank. Auto-aim helps on a phone. Team chat and pings for your side only.

export type Seat = { i: string; n: string; tm: number; g: Loadout; b?: boolean };
export type Setup = { key: string | null; room: number; seed: number; fightAt: number; endsAt: number; roster: Seat[]; tod: Tod; watch: boolean; pool: number };
export type EndRow = { id: string; name: string; team: number; bot: boolean; kills: number; downs: number; loot: number; returns: number; dmg: number; act: number; me: boolean };
export type EndResult = { winner: number; scores: [number, number]; rows: EndRow[]; shot: string | null };

const GUN_ORDER: GunId[] = ["pistol", "smg", "shotgun", "rifle", "sniper", "rocket"];
const BOT_NAMES = ["Tunde", "Ada", "Bayo", "Chika", "Emeka", "Funmi", "Kemi", "Segun", "Ngozi", "Dayo", "Ife", "Obi", "Zainab", "Lola", "Musa", "Uche"];
const BOT_GUNS: Loadout[] = [{ rifle: 1 }, { smg: 1 }, { rifle: 1, grenade: 2 }, { shotgun: 1 }, { smg: 1, armour: 1 }, { rifle: 1, armour: 1 }];
export const QUICK = ["Enemy here!", "Need backup!", "Follow me", "Go for the vault", "Guard the bank", "Bag carrier!", "Tank coming!", "Nice one!"];

/** The roster with bots: the sides made even, and at least 4 a side (every phone makes the same). */
export function fillRoster(people: Seat[], seed: number): Seat[] {
  const r = rand(seed ^ 0x9e3779b9);
  const names = [...BOT_NAMES].sort(() => r() - 0.5);
  const out = people.map((p) => ({ ...p }));
  const side = [out.filter((p) => p.tm === 0).length, out.filter((p) => p.tm === 1).length];
  const each = Math.max(4, side[0], side[1]);
  let k = 0;
  for (const tm of [0, 1])
    for (let n = side[tm]; n < each; n++, k++) out.push({ i: `bot:${k}`, n: `${names[k % names.length]} (bot)`, tm, g: BOT_GUNS[Math.floor(r() * BOT_GUNS.length)], b: true });
  return out;
}

type Snap = { t: number; p: number[] };
type Feed = { id: number; text: string; team: number };
type Chat = { id: number; n: string; text: string; at: number };
type Hud = {
  left: number; score: [number, number]; hp: number; armour: number; tank: number; gun: GunId; ammo: number; reloading: boolean; out: number; by: string; count: number;
  feed: Feed[]; hit: boolean; head: boolean; hurt: number; aiming: boolean; crouch: boolean; shield: boolean; grenades: number; medkits: number; tankReady: boolean; rockets: number;
  bag: boolean; crack: number; goal: string; healing: number; watching: string; scoped: boolean; marker: { x: number; y: number } | null; clock: number;
};

export function Match({ me, setup, net, onQuit, onEnd }: { me: { id: string; name: string }; setup: Setup; net: CopsNet | null; onQuit: () => void; onEnd: (r: EndResult) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const bigMapRef = useRef<HTMLCanvasElement>(null);
  const roster = useMemo(() => fillRoster(setup.roster, setup.seed), [setup.roster, setup.seed]);
  const mySeat = roster.find((s) => s.i === me.id) ?? null;
  const watch = setup.watch || !mySeat;
  const myTeam = mySeat?.tm ?? 0;
  const input = useRef({ mx: 0, mz: 0, look: { dx: 0, dy: 0 }, fire: false, tap: 0, aim: false, jump: false, reload: false, crouch: false, swap: false, grenade: false, heal: false, tank: false, auto: true, ping: false, follow: 0, overview: false, keys: new Set<string>() });
  const [hud, setHud] = useState<Hud>({ left: 0, score: [0, 0], hp: 100, armour: 0, tank: 0, gun: "pistol", ammo: 0, reloading: false, out: 0, by: "", count: 0, feed: [], hit: false, head: false, hurt: 0, aiming: false, crouch: false, shield: false, grenades: 0, medkits: 0, tankReady: false, rockets: 0, bag: false, crack: 0, goal: "", healing: 0, watching: "", scoped: false, marker: null, clock: 0 });
  const [failed] = useState(() => !canWebGL());
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  const [chat, setChat] = useState<Chat[]>([]);
  const [draft, setDraft] = useState("");
  const [auto, setAuto] = useState(true);
  const sendChat = useRef<(text: string) => void>(() => {});
  const ends = useRef(onEnd);
  useEffect(() => {
    ends.current = onEnd;
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const shapes = layout(setup.seed);
    const city = new City(shapes);
    const low = (navigator.hardwareConcurrency || 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 3;
    let sc: CopsScene;
    try {
      sc = new CopsScene(el, city, blocks(setup.seed), setup.tod, low);
    } catch {
      return;
    }
    const r = rand(setup.seed ^ 0x5bd1e995);
    const nowS = () => (Date.now() - setup.fightAt) / 1000;
    const length = (setup.endsAt - setup.fightAt) / 1000;

    // Everyone in the match.
    const actors = new Map<string, Actor>();
    const gear = new Map<string, Loadout>();
    const used = [0, 0];
    for (const s of roster) {
      const sp = spawns(s.tm)[used[s.tm]++ % 10];
      const l = s.g ?? {};
      gear.set(s.i, l);
      const guns = gunsOf(l);
      actors.set(s.i, { id: s.i, name: s.n, team: s.tm, bot: !!s.b, body: { x: sp.x, y: 0, z: sp.z, vy: 0 }, yaw: sp.yaw, pitch: 0, alive: true, back: 0, shield: 0, hp: RULES.hp, armour: l.armour ? RULES.armour : 0, maxArmour: l.armour ? RULES.armour : 0, crouch: false, tank: 0, bag: false, gun: guns[0], stats: newStats() });
      sc.addActor(s.i, s.n, s.tm, s.i === me.id && !watch);
    }
    const mine = watch ? null : actors.get(me.id)!;
    const humans = roster.filter((s) => !s.b).map((s) => s.i);
    const snaps = new Map<string, Snap[]>();
    const lastHeard = new Map<string, number>();
    const seen = new Set<string>();
    const shots: Shot[] = [];
    let shotId = 1;
    const score: [number, number] = [0, 0];
    const bags = new Map<string, Bag>();
    let bagN = 0;
    let over = false;

    // My gear and its state.
    const myGear = mine ? gear.get(me.id)! : {};
    const myGuns = gunsOf(myGear);
    const mag = new Map<GunId, number>(myGuns.map((g) => [g, GUNS[g].mag]));
    let rockets = GUNS.rocket.ammo ?? 0;
    let grenades = myGear.grenade ?? 0;
    let medkits = myGear.medkit ?? 0;
    let tankLeft = myGear.tank ? 1 : 0;
    let tankReload = 0;
    let reloadUntil = 0;
    let nextShot = 0;
    let healUntil = 0;
    let crackT = 0;
    let myShots: number[][] = [];
    let botShots = new Map<string, number[][]>();
    let lastSend = 0;
    let lastSentKey = "";
    let lastHud = 0;
    let lastSync = 0;
    let hitFlash = 0;
    let headFlash = false;
    let hurtFlash = 0;
    let outBy = "";
    const feed: Feed[] = [];
    let feedId = 1;
    const botCrack = new Map<string, number>();

    const present = () => {
      const here = new Set((net?.members ?? []).filter((m) => m.st === "play").map((m) => m.id));
      if (mine) here.add(me.id);
      return here;
    };
    /** The host runs the bots (and stands in for anyone who isn't here): the first player in the roster who is. */
    const isHost = () => {
      if (watch && net) return false;
      if (!net) return true;
      const here = present();
      return humans.find((h) => here.has(h)) === me.id;
    };
    /** Bots, and people who aren't here (a bot plays for them so the sides stay even). */
    const driven = (a: Actor, here: Set<string>, t: number) => a.bot || (a.id !== me.id && !here.has(a.id) && t - (lastHeard.get(a.id) ?? -99) > 4);

    function fire(owner: Actor, kind: ShotKind, o: V3, d: V3, local: boolean) {
      const s = makeShot(shotId++, owner.id, owner.team, kind, o, d, local);
      shots.push(s);
      sc.addShot(s);
      if (kind !== "grenade") sc.flash(o);
      const dist = Math.hypot(o.x - (mine?.body.x ?? 0), o.z - (mine?.body.z ?? 0));
      if (owner.id === me.id) tone(kind === "rocket" || kind === "cannon" ? 70 : kind === "sniper" ? 120 : 180 + r() * 40, kind === "cannon" ? 0.25 : 0.06, kind === "shotgun" || kind === "cannon" ? "sawtooth" : "square", 0.05);
      else if (dist < 60) tone(150 + r() * 60, 0.04, "square", 0.02 * (1 - dist / 60));
    }
    const muzzleOf = (a: Actor): V3 => {
      if (a.tank > 0) return sc.muzzle(a.id) ?? { x: a.body.x - Math.sin(a.yaw) * 3.8, y: a.body.y + 2.4, z: a.body.z - Math.cos(a.yaw) * 3.8 };
      const y = a.body.y + (a.crouch ? 0.9 : 1.36);
      return { x: a.body.x - Math.sin(a.yaw) * 0.9 + Math.cos(a.yaw) * 0.12, y, z: a.body.z - Math.cos(a.yaw) * 0.9 - Math.sin(a.yaw) * 0.12 };
    };

    function addFeed(text: string, team: number) {
      feed.unshift({ id: feedId++, text, team });
      feed.splice(5);
    }
    /** Damage arrives (mine, or from another phone). */
    function damage(tg: Actor, by: Actor | undefined, d: number, h: string) {
      if (seen.has(h) || !tg.alive) return;
      seen.add(h);
      const wasTank = tg.tank > 0;
      const took = hurt(tg, d);
      if (by && by.team !== tg.team && !by.standin) by.stats.dmg += Math.round(took);
      if (tg.id === me.id) {
        hurtFlash = performance.now();
        healUntil = 0;
      }
      // The one who owns this person (their phone, or the host for bots) decides when they're down.
      const here = present();
      const owner = tg.id === me.id || (isHost() && driven(tg, here, nowS()));
      if (!owner) return;
      if (wasTank && tg.tank <= 0) {
        tg.tank = 0;
        const k = `${tg.id}:tank:${nowS().toFixed(1)}`;
        net?.send({ t: "ko", tg: tg.id, by: by?.id ?? "", k: 99, h: k });
        knocked(tg, by, 99, k);
      } else if (tg.hp <= 0) {
        const k = `${tg.id}:ko:${nowS().toFixed(1)}`;
        net?.send({ t: "ko", tg: tg.id, by: by?.id ?? "", k: 0, h: k });
        knocked(tg, by, 0, k);
        if (tg.bag) {
          const b = `${tg.id}:${++bagN}`;
          net?.send({ t: "loot", e: "drop", i: tg.id, b, x: tg.body.x, z: tg.body.z });
          loot("drop", tg, b, tg.body.x, tg.body.z);
        }
      }
    }
    /** Someone is taken down (k 0), or their tank is destroyed (k 99). */
    function knocked(tg: Actor, by: Actor | undefined, k: number, h: string) {
      if (seen.has(h)) return;
      seen.add(h);
      if (k === 99) {
        tg.tank = 0;
        sc.explode(tg.body, 8);
        addFeed(`${by?.name ?? "Someone"} destroyed ${tg.name}'s tank`, by?.team ?? 0);
        if (by && by.team !== tg.team) {
          if (!by.standin) by.stats.kills += 1;
          score[by.team] += RULES.killPoints;
        }
        return;
      }
      if (!tg.alive) return;
      tg.alive = false;
      tg.hp = 0;
      tg.crouch = false;
      tg.stats.downs += 1;
      tg.back = nowS() + RULES.respawn;
      if (by && by.team !== tg.team) {
        if (!by.standin) by.stats.kills += 1;
        score[by.team] += RULES.killPoints;
      }
      addFeed(`${by?.name ?? "Someone"} took down ${tg.name}`, by?.team ?? tg.team);
      if (tg.id === me.id) {
        outBy = by?.name ?? "";
        playSfx("miss");
      } else if (by?.id === me.id) {
        tone(660, 0.12, "triangle", 0.08);
        tone(990, 0.12, "triangle", 0.06);
      }
    }
    /** The loot: a bag picked up at the vault (or off the ground), dropped, banked or taken back. */
    function loot(e: "pick" | "drop" | "bank" | "return", a: Actor, b: string, x?: number, z?: number) {
      const key = `${e}:${b}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (e === "pick") {
        bags.delete(b);
        a.bag = true;
        if (a.team === myTeam || watch) addFeed(`${a.name} has a bag of money`, 1);
      } else if (e === "drop") {
        a.bag = false;
        bags.set(b, { id: b, x: x ?? a.body.x, z: z ?? a.body.z });
      } else if (e === "bank") {
        a.bag = false;
        if (!a.standin) a.stats.loot += 1;
        score[1] += RULES.lootPoints;
        addFeed(`${a.name} got a bag to the hideout! +${RULES.lootPoints}`, 1);
        if (a.team === myTeam) playSfx("found");
      } else {
        bags.delete(b);
        if (!a.standin) a.stats.returns += 1;
        score[0] += RULES.returnPoints;
        addFeed(`${a.name} took a bag back`, 0);
      }
      sc.setBags([...bags.values()]);
    }
    function respawn(a: Actor) {
      const list = spawns(a.team);
      const sp = list[Math.floor(r() * list.length)];
      a.body.x = sp.x;
      a.body.z = sp.z + (r() - 0.5) * 2;
      a.body.y = 0;
      a.yaw = sp.yaw;
      a.pitch = 0;
      a.alive = true;
      a.hp = RULES.hp;
      a.armour = a.maxArmour;
      a.tank = 0;
      a.shield = nowS() + RULES.shield;
      a.brain = undefined;
    }

    const toState = (a: Actor) => [a.body.x, a.body.y, a.body.z, a.yaw, a.pitch, a.alive ? 1 : 0, Math.round(a.hp), Math.round(a.armour), (a.crouch ? 1 : 0) | (a.tank > 0 ? 2 : 0) | (a.bag ? 4 : 0), GUN_ORDER.indexOf(a.gun), Math.round(a.tank)].map((v, k) => (k < 5 ? Math.round(v * 100) / 100 : v));
    function hear(a: Actor, p: number[], sh: number[][] | undefined, t: number, standin: boolean) {
      if (!standin) lastHeard.set(a.id, t);
      a.standin = standin && !a.bot;
      const list = snaps.get(a.id) ?? [];
      list.push({ t, p });
      if (list.length > 20) list.shift();
      snaps.set(a.id, list);
      a.hp = p[6] ?? a.hp;
      a.armour = p[7] ?? a.armour;
      const f = p[8] ?? 0;
      a.crouch = !!(f & 1);
      a.tank = f & 2 ? (p[10] ?? 1) : 0;
      a.gun = GUN_ORDER[p[9]] ?? a.gun;
      if (p[5] && !a.alive && t >= a.back - 0.6) {
        a.alive = true;
        a.shield = t + RULES.shield;
      }
      for (const s of sh ?? []) fire(a, SHOT_KINDS[s[6]] ?? "pistol", { x: s[0], y: s[1], z: s[2] }, { x: s[3], y: s[4], z: s[5] }, false);
    }

    const unlisten = net?.listen((m: Msg) => {
      const t = nowS();
      if (m.t === "s") {
        const a = actors.get(m.i);
        if (a && a.id !== me.id) hear(a, m.p, m.sh, t, false);
      } else if (m.t === "b") {
        if (isHost()) return;
        for (const bt of m.bots) {
          const a = actors.get(bt.i);
          if (a && a.id !== me.id) hear(a, bt.p, bt.sh, t, true);
        }
      } else if (m.t === "dmg") {
        const tg = actors.get(m.tg);
        if (tg) damage(tg, actors.get(m.by), m.d, m.h);
      } else if (m.t === "ko") {
        const tg = actors.get(m.tg);
        if (tg) knocked(tg, actors.get(m.by), m.k, m.h);
      } else if (m.t === "loot") {
        const a = actors.get(m.i);
        if (a) loot(m.e, a, m.b, m.x, m.z);
      } else if (m.t === "boom") sc.explode(m, m.k === 6 ? 6 : 7);
      else if (m.t === "chat") {
        if (m.tm !== myTeam || watch) return;
        setChat((c) => [...c.slice(-5), { id: Date.now() + Math.random(), n: m.n, text: m.text.slice(0, 80), at: Date.now() }]);
        tone(1200, 0.05, "sine", 0.04);
      } else if (m.t === "ping") {
        if (m.tm !== myTeam || watch) return;
        sc.ping(m.x, m.z, m.tm);
        setChat((c) => [...c.slice(-5), { id: Date.now() + Math.random(), n: m.n, text: "pinged a spot on the map", at: Date.now() }]);
      } else if (m.t === "sync") {
        // The host's numbers, so every phone (and anyone who came in late) shows the same.
        if (isHost()) return;
        score[0] = m.sc[0];
        score[1] = m.sc[1];
        for (const [id, v] of Object.entries(m.st)) {
          const a = actors.get(id);
          if (!a) continue;
          [a.stats.kills, a.stats.downs, a.stats.loot, a.stats.returns, a.stats.dmg, a.stats.alive] = v;
          a.bag = !!v[6];
        }
        bags.clear();
        for (const b of m.bags) bags.set(b.id, b);
        sc.setBags([...bags.values()]);
      }
    });
    sendChat.current = (text: string) => {
      if (!mine) return;
      const clean = text.trim().slice(0, 80);
      if (!clean) return;
      if (clean === "PING") {
        // Where the crosshair is pointing.
        const ray = sc.ray();
        const far = 140;
        const end = { x: ray.o.x + ray.d.x * far, y: ray.o.y + ray.d.y * far, z: ray.o.z + ray.d.z * far };
        const h = city.hit(ray.o, end);
        let u = h ? h.t : 1;
        if (ray.d.y < -1e-3) u = Math.min(u, -ray.o.y / ray.d.y / far);
        const x = ray.o.x + ray.d.x * far * u;
        const z = ray.o.z + ray.d.z * far * u;
        net?.send({ t: "ping", by: me.id, n: me.name, tm: myTeam, x, z });
        sc.ping(x, z, myTeam);
        return;
      }
      net?.send({ t: "chat", from: me.id, n: me.name, tm: myTeam, text: clean });
      setChat((c) => [...c.slice(-5), { id: Date.now() + Math.random(), n: "You", text: clean, at: Date.now() }]);
    };

    // ---- keys and the mouse (a computer)
    const keys = input.current.keys;
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.add(e.code);
      const inp = input.current;
      if (e.code === "Space") inp.jump = true;
      if (e.code === "KeyR") inp.reload = true;
      if (e.code === "KeyC" || e.code === "ControlLeft") inp.crouch = !inp.crouch;
      if (e.code === "KeyQ") inp.swap = true;
      if (e.code === "KeyG") inp.grenade = true;
      if (e.code === "KeyH") inp.heal = true;
      if (e.code === "KeyT") inp.tank = true;
      if (e.code === "KeyF") inp.ping = true;
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.code);
    const cv = sc.renderer.domElement;
    const mm = (e: MouseEvent) => {
      if (document.pointerLockElement !== cv) return;
      input.current.look.dx += e.movementX * 0.7;
      input.current.look.dy += e.movementY * 0.7;
    };
    const md = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (document.pointerLockElement !== cv) {
        void cv.requestPointerLock?.();
        return;
      }
      if (e.button === 0) input.current.fire = true;
      if (e.button === 2) input.current.aim = true;
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) input.current.fire = false;
      if (e.button === 2) input.current.aim = false;
    };
    const ctx = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", mm);
    cv.addEventListener("pointerdown", md);
    window.addEventListener("mouseup", mu);
    cv.addEventListener("contextmenu", ctx);
    const fit = () => sc.resize(el.clientWidth || 1, el.clientHeight || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    /** What a shot from me (or a bot I run) hits as it flies: people, tanks, then walls. */
    function resolve(s: Shot, from: V3, to: V3, t: number) {
      let best: Actor | null = null;
      let bt = 2;
      let head = false;
      for (const o of actors.values()) {
        if (o.team === s.team || !o.alive || o.shield > t) continue;
        if (o.tank > 0) {
          const hh = shapeHit(tankBox(o.body.x, o.body.z, o.yaw), from, to);
          if (hh && hh.t < bt) {
            bt = hh.t;
            best = o;
            head = false;
          }
          continue;
        }
        const hh = hitsPerson(from, to, o.body, o.crouch);
        if (hh && hh.t < bt) {
          bt = hh.t;
          best = o;
          head = hh.head;
        }
      }
      const wall = city.hit(from, to);
      const ground = to.y <= 0.02 ? Math.max(0, Math.min(1, (from.y - 0) / Math.max(1e-6, from.y - to.y))) : 2;
      const solid = Math.min(wall?.t ?? 2, ground);
      if (best && bt <= solid) {
        const at = { x: from.x + (to.x - from.x) * bt, y: from.y + (to.y - from.y) * bt, z: from.z + (to.z - from.z) * bt };
        if (s.splash) return { done: true, boom: at };
        const dmg = Math.round(s.dmg * (head ? (s.kind === "sniper" ? 2.2 : 1.6) : 1));
        const h = `${me.id}:${s.owner}:${s.id}`;
        net?.send({ t: "dmg", by: s.owner, tg: best.id, d: dmg, h, k: SHOT_KINDS.indexOf(s.kind) });
        damage(best, actors.get(s.owner), dmg, h);
        if (s.owner === me.id) {
          hitFlash = performance.now();
          headFlash = head;
          tone(head ? 1320 : 880, 0.05, "square", 0.05);
        }
        sc.spark(at);
        return { done: true, boom: null };
      }
      if (solid <= 1) {
        const at = { x: from.x + (to.x - from.x) * solid, y: Math.max(0.05, from.y + (to.y - from.y) * solid), z: from.z + (to.z - from.z) * solid };
        if (s.kind === "grenade") return { done: false, boom: null };
        if (s.splash) return { done: true, boom: at };
        sc.spark(at);
        return { done: true, boom: null };
      }
      return { done: false, boom: null };
    }
    /** An explosion of mine (or a bot's I run): everyone near is hurt, everyone sees it. */
    function explodeAt(s: Shot, at: V3) {
      net?.send({ t: "boom", x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, z: Math.round(at.z * 10) / 10, k: SHOT_KINDS.indexOf(s.kind) });
      sc.explode(at, s.kind === "grenade" ? 6 : 7);
      const t = nowS();
      for (const o of actors.values()) {
        if (o.team === s.team || !o.alive || o.shield > t) continue;
        // Tanks take full blast damage (rockets are what stops them).
        const d = blast(city, at, o.body, s.splash + (o.tank > 0 ? 2 : 0), s.dmg * (o.tank > 0 && s.kind === "rocket" ? 1.6 : 1));
        if (d <= 0) continue;
        const h = `${me.id}:${s.owner}:${s.id}:${o.id}`;
        net?.send({ t: "dmg", by: s.owner, tg: o.id, d, h, k: SHOT_KINDS.indexOf(s.kind) });
        damage(o, actors.get(s.owner), d, h);
        if (s.owner === me.id) hitFlash = performance.now();
      }
    }

    // ---- the loop
    let raf = 0;
    let last = performance.now();
    let ended = false;
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = nowS();
      const live = t >= 0 && t < length && !over;
      const host = isHost();
      const here = present();
      const inp = input.current;

      if (mine) {
        // Looking round, with a gentle pull towards an enemy near the crosshair (auto-aim).
        const scoped = inp.aim && GUNS[mine.gun].scope && mine.tank <= 0;
        const sens = scoped ? 0.0009 : inp.aim ? 0.0022 : 0.0042;
        mine.yaw -= inp.look.dx * sens;
        mine.pitch = Math.max(-0.9, Math.min(0.8, mine.pitch - inp.look.dy * sens));
        inp.look.dx = 0;
        inp.look.dy = 0;
        if (inp.auto && mine.alive && live) {
          const ray = sc.ray();
          let best: { yaw: number; pitch: number; ang: number } | null = null;
          for (const o of actors.values()) {
            if (o.team === mine.team || !o.alive) continue;
            const aim = { x: o.body.x, y: o.body.y + (o.tank > 0 ? 1.5 : o.crouch ? 0.8 : 1.2), z: o.body.z };
            const tx = aim.x - ray.o.x;
            const ty = aim.y - ray.o.y;
            const tz = aim.z - ray.o.z;
            const dl = Math.hypot(tx, ty, tz);
            if (dl > GUNS[mine.gun].range || dl < 1) continue;
            const ang = Math.acos(Math.max(-1, Math.min(1, (tx * ray.d.x + ty * ray.d.y + tz * ray.d.z) / dl)));
            if (ang > 0.16 || (best && ang > best.ang)) continue;
            if (!city.canSee(ray.o, aim)) continue;
            const ex = aim.x - mine.body.x;
            const ez = aim.z - mine.body.z;
            best = { yaw: Math.atan2(-ex, -ez), pitch: Math.atan2(aim.y - (mine.body.y + RULES.eye), Math.hypot(ex, ez)), ang };
          }
          if (best) {
            let dy = best.yaw - mine.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            const pull = Math.min(1, dt * (inp.fire || inp.tap ? 7 : 2.5));
            mine.yaw += dy * pull;
            mine.pitch += (best.pitch - mine.pitch) * pull * 0.6;
          }
        }
        let fx = inp.mx;
        let fz = inp.mz;
        if (keys.has("KeyW") || keys.has("ArrowUp")) fz -= 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) fz += 1;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) fx -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) fx += 1;
        const fl = Math.hypot(fx, fz);
        if (fl > 1) {
          fx /= fl;
          fz /= fl;
        }
        const c = Math.cos(mine.yaw);
        const sn = Math.sin(mine.yaw);
        const wx = fx * c + fz * sn;
        const wz = -fx * sn + fz * c;
        mine.crouch = inp.crouch && mine.tank <= 0;
        if (mine.alive && live) {
          const speed = mine.tank > 0 ? RULES.tankSpeed : mine.crouch ? RULES.crouch : (inp.aim ? RULES.run * 0.6 : RULES.run) * (mine.bag ? RULES.carry : 1);
          city.step(mine.body, wx, wz, inp.jump && mine.tank <= 0 && !mine.crouch, dt, speed, mine.tank > 0 ? RULES.tankRadius : RULES.radius, mine.tank > 0);
        } else if (!mine.alive && t >= mine.back && live) {
          respawn(mine);
          mag.forEach((_, g) => mag.set(g, GUNS[g].mag));
          reloadUntil = 0;
        }
        inp.jump = false;
        if (mine.alive && live) mine.stats.alive += dt;

        // The tank, guns, grenades and medkits.
        if (inp.tank && tankLeft > 0 && mine.alive && live && mine.tank <= 0) {
          tankLeft = 0;
          mine.tank = RULES.tankHp;
          mine.crouch = false;
          inp.crouch = false;
          addFeed(`${mine.name} called in a tank`, mine.team);
          tone(90, 0.4, "sawtooth", 0.06);
        }
        inp.tank = false;
        if (inp.swap && mine.tank <= 0) {
          const i = myGuns.indexOf(mine.gun);
          mine.gun = myGuns[(i + 1) % myGuns.length];
          reloadUntil = 0;
          nextShot = t + 0.25;
          playSfx("tick");
        }
        inp.swap = false;
        const gun = GUNS[mine.gun];
        if (inp.reload && mine.tank <= 0 && (mag.get(mine.gun) ?? 0) < gun.mag && t > reloadUntil && (mine.gun !== "rocket" || rockets > 0)) {
          reloadUntil = t + gun.reload;
          playSfx("tick");
        }
        inp.reload = false;
        if (reloadUntil && t >= reloadUntil) {
          mag.set(mine.gun, mine.gun === "rocket" ? Math.min(gun.mag, rockets) : gun.mag);
          reloadUntil = 0;
        }
        if (inp.heal && medkits > 0 && mine.alive && mine.hp < RULES.hp && !healUntil) {
          healUntil = t + RULES.heal;
          medkits -= 1;
          playSfx("tick");
        }
        inp.heal = false;
        if (healUntil && t >= healUntil) {
          mine.hp = RULES.hp;
          healUntil = 0;
          tone(720, 0.15, "sine", 0.06);
        }
        if (inp.grenade && grenades > 0 && mine.alive && live && mine.tank <= 0) {
          grenades -= 1;
          const ray = sc.ray();
          const o = { x: mine.body.x, y: mine.body.y + 1.7, z: mine.body.z };
          const d = { x: ray.d.x, y: ray.d.y + 0.25, z: ray.d.z };
          const l = Math.hypot(d.x, d.y, d.z);
          const dir = { x: d.x / l, y: d.y / l, z: d.z / l };
          fire(mine, "grenade", o, dir, true);
          myShots.push([o.x, o.y, o.z, dir.x, dir.y, dir.z].map((v) => Math.round(v * 1000) / 1000).concat(SHOT_KINDS.indexOf("grenade")));
        }
        inp.grenade = false;
        if (inp.ping) sendChat.current("PING");
        inp.ping = false;

        // Shooting.
        const inTank = mine.tank > 0;
        const ready = inTank ? t >= tankReload : t >= nextShot && t >= reloadUntil && (mag.get(mine.gun) ?? 0) > 0;
        const wants = inp.fire && (inTank || gun.auto) ? true : inp.tap > 0 || (inp.fire && t >= nextShot + 0.2);
        if (wants && mine.alive && live && ready) {
          inp.tap = Math.max(0, inp.tap - 1);
          const kind: ShotKind = inTank ? "cannon" : mine.gun;
          if (inTank) tankReload = t + RULES.tankReload;
          else {
            nextShot = t + 1 / gun.rate;
            const left = (mag.get(mine.gun) ?? 1) - 1;
            mag.set(mine.gun, left);
            if (mine.gun === "rocket") rockets = Math.max(0, rockets - 1);
            if (left <= 0 && (mine.gun !== "rocket" || rockets > 0)) reloadUntil = t + gun.reload;
          }
          const ray = sc.ray();
          // What the crosshair is on (a wall, the ground, or someone, with a little help on a phone).
          let far = inTank ? 200 : gun.range;
          const end = { x: ray.o.x + ray.d.x * far, y: ray.o.y + ray.d.y * far, z: ray.o.z + ray.d.z * far };
          const wall = city.hit(ray.o, end);
          if (wall) far *= wall.t;
          if (ray.d.y < -1e-3) far = Math.min(far, -ray.o.y / ray.d.y);
          let aimAt = { x: ray.o.x + ray.d.x * far, y: ray.o.y + ray.d.y * far, z: ray.o.z + ray.d.z * far };
          let bestAngle = inp.auto ? (inp.aim ? 0.035 : 0.06) : inp.aim ? 0.012 : 0.025;
          for (const o of actors.values()) {
            if (o.team === mine.team || !o.alive) continue;
            const ay = o.tank > 0 ? 1.4 : o.crouch ? 0.75 : 1.15;
            const tx = o.body.x - ray.o.x;
            const ty = o.body.y + ay - ray.o.y;
            const tz = o.body.z - ray.o.z;
            const dl = Math.hypot(tx, ty, tz);
            if (dl > far + 1.5) continue;
            const ang = Math.acos(Math.max(-1, Math.min(1, (tx * ray.d.x + ty * ray.d.y + tz * ray.d.z) / dl)));
            if (ang < bestAngle) {
              bestAngle = ang;
              aimAt = { x: o.body.x, y: o.body.y + ay, z: o.body.z };
            }
          }
          const mz0 = muzzleOf(mine);
          const dist = Math.hypot(aimAt.x - mz0.x, aimAt.z - mz0.z);
          if (kind === "rocket") aimAt.y += 0.5 * 0.6 * (dist / gun.speed) ** 2;
          if (kind === "cannon") aimAt.y += 0.5 * 1.2 * (dist / 95) ** 2;
          const moving = Math.min(1, Math.hypot(inp.mx, inp.mz));
          const spread = inTank ? 0.004 : (gun.scope ? (inp.aim ? 0.002 : gun.spread) : gun.spread * (inp.aim ? 0.45 : 1)) * (mine.crouch ? 0.7 : 1) + moving * (gun.scope ? 0.04 : 0.012);
          const pellets = inTank ? 1 : (gun.pellets ?? 1);
          for (let k = 0; k < pellets; k++) {
            let dx = aimAt.x - mz0.x + (r() - 0.5) * spread * dist * 2;
            let dy = aimAt.y - mz0.y + (r() - 0.5) * spread * dist * 2;
            let dz = aimAt.z - mz0.z + (r() - 0.5) * spread * dist * 2;
            const l = Math.hypot(dx, dy, dz) || 1;
            dx /= l;
            dy /= l;
            dz /= l;
            fire(mine, kind, mz0, { x: dx, y: dy, z: dz }, true);
            myShots.push([mz0.x, mz0.y, mz0.z, dx, dy, dz].map((v) => Math.round(v * 1000) / 1000).concat(SHOT_KINDS.indexOf(kind)));
          }
          if (inTank) sc.explode({ x: mz0.x, y: mz0.y - 0.5, z: mz0.z }, 1.5);
        }

        // The loot: cracking the vault (stand in it for 2 seconds), banking at the hideout, bags on the ground.
        if (mine.alive && live && mine.tank <= 0) {
          if (mine.team === 1 && !mine.bag && Math.hypot(mine.body.x - VAULT.x, mine.body.z - VAULT.z) < VAULT.r) {
            crackT += dt;
            if (crackT >= 2) {
              crackT = 0;
              const b = `${me.id}:${++bagN}`;
              net?.send({ t: "loot", e: "pick", i: me.id, b });
              loot("pick", mine, b);
              playSfx("found");
            }
          } else crackT = 0;
          if (mine.bag && Math.hypot(mine.body.x - HIDEOUT.x, mine.body.z - HIDEOUT.z) < HIDEOUT.r) {
            const b = `${me.id}:bank:${++bagN}`;
            net?.send({ t: "loot", e: "bank", i: me.id, b });
            loot("bank", mine, b);
          }
          for (const bag of bags.values()) {
            if (Math.hypot(bag.x - mine.body.x, bag.z - mine.body.z) > 1.6) continue;
            if (mine.team === 1 && !mine.bag) {
              net?.send({ t: "loot", e: "pick", i: me.id, b: bag.id });
              loot("pick", mine, bag.id);
            } else if (mine.team === 0) {
              net?.send({ t: "loot", e: "return", i: me.id, b: bag.id });
              loot("return", mine, bag.id);
            }
            break;
          }
        }
      }

      // The bots (and anyone not here): the host moves them; everyone else follows what the host says.
      const bodies = [...actors.values()].filter((a) => a.alive && a.tank <= 0).map((a) => a.body);
      if (mine?.alive && mine.tank <= 0) separate(mine.body, bodies, RULES.radius * 2.2);
      for (const a of actors.values()) {
        if (host) a.standin = !a.bot && driven(a, here, t);
        if (!host || !driven(a, here, t)) continue;
        if (!a.alive) {
          if (t >= a.back && live) respawn(a);
          continue;
        }
        if (!live) continue;
        const plan = think(a, [...actors.values()], [...bags.values()], city, t, dt, r);
        city.step(a.body, plan.mx, plan.mz, plan.jump, dt, RULES.run * (a.bag ? RULES.carry : 0.85));
        separate(a.body, bodies, RULES.radius * 2.2);
        if (plan.shot) {
          const o = muzzleOf(a);
          fire(a, a.gun, o, plan.shot, true);
          const list = botShots.get(a.id) ?? [];
          list.push([o.x, o.y, o.z, plan.shot.x, plan.shot.y, plan.shot.z].map((v) => Math.round(v * 1000) / 1000).concat(SHOT_KINDS.indexOf(a.gun)));
          botShots.set(a.id, list);
        }
        if (a.bot) a.stats.alive += dt;
        // Bots crack the vault and bank bags too.
        if (a.team === 1 && !a.bag && Math.hypot(a.body.x - VAULT.x, a.body.z - VAULT.z) < VAULT.r) {
          const c = (botCrack.get(a.id) ?? 0) + dt;
          botCrack.set(a.id, c);
          if (c >= 2.5) {
            botCrack.set(a.id, 0);
            const b = `${a.id}:${me.id}:${++bagN}`;
            net?.send({ t: "loot", e: "pick", i: a.id, b });
            loot("pick", a, b);
          }
        }
        if (a.bag && Math.hypot(a.body.x - HIDEOUT.x, a.body.z - HIDEOUT.z) < HIDEOUT.r) {
          const b = `${a.id}:bank:${me.id}:${++bagN}`;
          net?.send({ t: "loot", e: "bank", i: a.id, b });
          loot("bank", a, b);
        }
        for (const bag of bags.values()) {
          if (Math.hypot(bag.x - a.body.x, bag.z - a.body.z) > 1.6) continue;
          if (a.team === 1 && !a.bag) {
            net?.send({ t: "loot", e: "pick", i: a.id, b: bag.id });
            loot("pick", a, bag.id);
          } else if (a.team === 0) {
            net?.send({ t: "loot", e: "return", i: a.id, b: bag.id });
            loot("return", a, bag.id);
          }
          break;
        }
      }

      // Everyone else: where they were a moment ago (smooth, between the last two updates).
      for (const a of actors.values()) {
        if (a.id === me.id && mine) continue;
        if (host && driven(a, here, t)) continue;
        const list = snaps.get(a.id);
        if (!list?.length) continue;
        const rt = t - 0.15;
        let i = list.length - 1;
        while (i > 0 && list[i - 1].t > rt) i--;
        const s1 = list[i];
        const s0 = list[Math.max(0, i - 1)];
        const u = s1.t > s0.t ? Math.max(0, Math.min(1, (rt - s0.t) / (s1.t - s0.t))) : 1;
        a.body.x = s0.p[0] + (s1.p[0] - s0.p[0]) * u;
        a.body.y = s0.p[1] + (s1.p[1] - s0.p[1]) * u;
        a.body.z = s0.p[2] + (s1.p[2] - s0.p[2]) * u;
        let dy = s1.p[3] - s0.p[3];
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        a.yaw = s0.p[3] + dy * u;
        a.pitch = s1.p[4];
        if (!a.bot && !a.standin && a.alive && live) a.stats.alive += dt;
      }

      // What's flying.
      for (let k = shots.length - 1; k >= 0; k--) {
        const s = shots[k];
        const from = fly(s, dt, city);
        const to = { x: s.x, y: s.y, z: s.z };
        let done = false;
        let boom: V3 | null = null;
        if (s.mine && live) {
          const res = resolve(s, from, to, t);
          done = res.done;
          boom = res.boom;
          if (s.kind === "grenade" && s.age >= s.life) boom = to;
        } else if (s.kind !== "grenade") {
          const wall = city.hit(from, to);
          if (wall || to.y <= 0.02) {
            if (s.kind !== "rocket" && s.kind !== "cannon" && wall) sc.spark({ x: from.x + (to.x - from.x) * wall.t, y: from.y + (to.y - from.y) * wall.t, z: from.z + (to.z - from.z) * wall.t });
            done = true;
          }
        }
        if (boom) {
          explodeAt(s, boom);
          done = true;
        }
        if (!done && (s.age >= s.life || Math.abs(s.x) > MAP.h + 20 || Math.abs(s.z) > MAP.h + 20)) done = true;
        if (done) {
          sc.dropShot(s.id);
          shots.splice(k, 1);
        } else sc.moveShot(s);
      }

      // Tell the others where I am (and the bots, if I run them): 5 times a second when something changed, else once a second.
      if (net && !watch && mine && now - lastSend > 200) {
        const p = toState(mine);
        const key = p.join(",");
        if (key !== lastSentKey || myShots.length || now - lastSend > 1000) {
          lastSend = now;
          lastSentKey = key;
          net.send({ t: "s", i: me.id, p, sh: myShots.length ? myShots : undefined });
          myShots = [];
          if (host) {
            const bots = [...actors.values()].filter((a) => driven(a, here, t)).map((a) => ({ i: a.id, p: toState(a), sh: botShots.get(a.id) }));
            if (bots.length) net.send({ t: "b", bots });
            botShots = new Map();
          }
        }
      }
      if (net && host && !watch && now - lastSync > 3000) {
        lastSync = now;
        const st: Record<string, number[]> = {};
        for (const a of actors.values()) st[a.id] = [a.stats.kills, a.stats.downs, a.stats.loot, a.stats.returns, Math.round(a.stats.dmg), Math.round(a.stats.alive), a.bag ? 1 : 0];
        net.send({ t: "sync", sc: [score[0], score[1]], st, bags: [...bags.values()] });
      }

      // Draw.
      const everyone = [...actors.values()];
      const watched = mine ?? everyone[((inp.follow % everyone.length) + everyone.length) % everyone.length];
      for (const a of actors.values()) {
        const prev = (a as Actor & { _p?: { x: number; z: number } })._p ?? { x: a.body.x, z: a.body.z };
        const speed = Math.hypot(a.body.x - prev.x, a.body.z - prev.z) / Math.max(dt, 1e-3);
        (a as Actor & { _p?: { x: number; z: number } })._p = { x: a.body.x, z: a.body.z };
        const scopedMe = a === mine && inp.aim && GUNS[a.gun].scope && a.tank <= 0;
        sc.setActor(a.id, { x: a.body.x, y: a.body.y, z: a.body.z, yaw: a.yaw, pitch: a.pitch, speed, alive: a.alive, crouch: a.crouch, tank: a.tank, bag: a.bag, gun: a.gun, hp: a.hp, armour: a.armour, shield: a.shield > t }, dt, !!scopedMe);
      }
      if (watched) {
        const v = watched;
        if (inp.overview || !v.alive) sc.overview(v.body.x, v.body.z, now / 1000);
        else {
          const scoped = v === mine && inp.aim && GUNS[v.gun].scope && v.tank <= 0;
          const mode = v.tank > 0 ? "tank" : scoped ? "scope" : v === mine && inp.aim ? "aim" : v.crouch ? "crouch" : "walk";
          sc.follow(v.body.x, v.body.y, v.body.z, v.yaw, v.pitch, mode, dt);
        }
      }
      sc.render(dt);

      // The end: time's up.
      if (!ended && (t >= length || over)) {
        ended = true;
        over = true;
        const winner = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
        playSfx(winner === myTeam ? "found" : "miss");
        const shot = sc.capture();
        const rows: EndRow[] = [...actors.values()].map((a) => ({ id: a.id, name: a.name, team: a.team, bot: a.bot, kills: a.stats.kills, downs: a.stats.downs, loot: a.stats.loot, returns: a.stats.returns, dmg: Math.round(a.stats.dmg), act: activity(a.stats), me: a.id === me.id }));
        window.setTimeout(() => ends.current({ winner, scores: [score[0], score[1]], rows, shot }), 1800);
      }

      // The heads-up display, ten times a second.
      if (now - lastHud > 100) {
        lastHud = now;
        const v = watched;
        const g = mine ? GUNS[mine.gun] : null;
        let goal = "";
        if (mine) {
          const carrier = [...actors.values()].some((a) => a.team === 1 && a.bag && a.alive);
          if (mine.team === 1) goal = mine.bag ? "Get the bag to the hideout (the orange light, east)" : bags.size ? "A bag is on the ground: grab it!" : "Get a bag from the bank's vault (the gold light)";
          else goal = carrier ? "A thief has a bag: stop them before the hideout!" : bags.size ? "Take the dropped bag back" : "Guard the bank's vault";
        }
        // A marker at the screen's edge pointing where to go.
        let marker: Hud["marker"] = null;
        if (mine?.alive) {
          const tgt = mine.team === 1 ? (mine.bag ? HIDEOUT : VAULT) : VAULT;
          const pr = sc.project({ x: tgt.x, y: 2, z: tgt.z });
          const far = Math.hypot(mine.body.x - tgt.x, mine.body.z - tgt.z) > 12;
          if (far) marker = { x: Math.max(-0.92, Math.min(0.92, pr.front ? pr.x : -Math.sign(pr.x || 1))), y: Math.max(-0.8, Math.min(0.8, pr.front ? pr.y : -0.6)) };
        }
        setHud({
          left: Math.max(0, length - Math.max(0, t)),
          score: [score[0], score[1]],
          hp: Math.round(v?.hp ?? 0),
          armour: Math.round(v?.armour ?? 0),
          tank: Math.round(v?.tank ?? 0),
          gun: v?.gun ?? "pistol",
          ammo: mine ? (mag.get(mine.gun) ?? 0) : 0,
          reloading: reloadUntil > t,
          out: mine && !mine.alive ? Math.max(0, mine.back - t) : 0,
          by: outBy,
          count: t < 0 ? Math.ceil(-t) : 0,
          feed: feed.slice(0, 4),
          hit: now - hitFlash < 200,
          head: headFlash,
          hurt: Math.max(0, 1 - (now - hurtFlash) / 500),
          aiming: inp.aim,
          crouch: !!mine?.crouch,
          shield: !!mine && mine.shield > t,
          grenades,
          medkits,
          tankReady: tankLeft > 0 && !!mine?.alive && mine.tank <= 0,
          rockets,
          bag: !!mine?.bag,
          crack: crackT / 2,
          goal,
          healing: healUntil ? Math.max(0, 1 - (healUntil - t) / RULES.heal) : 0,
          watching: mine ? "" : (v?.name ?? ""),
          scoped: !!(mine && inp.aim && g?.scope && mine.tank <= 0),
          marker,
          clock: Date.now(),
        });
        drawMap(mapRef.current, v, 60);
        if (bigMapRef.current) drawMap(bigMapRef.current, v, 0);
      }
    }
    /** The map: round you (radius metres), or the whole city (radius 0). */
    function drawMap(cvs: HTMLCanvasElement | null, centre: Actor | undefined, radius: number) {
      const g = cvs?.getContext("2d");
      if (!cvs || !g || !centre) return;
      const W = cvs.width;
      const H = cvs.height;
      const whole = radius === 0;
      const scale = whole ? W / (MAP.h * 2) : W / (radius * 2);
      const cx = whole ? 0 : centre.body.x;
      const cz = whole ? 0 : centre.body.z;
      const X = (x: number) => W / 2 + (x - cx) * scale;
      const Z = (z: number) => H / 2 + (z - cz) * scale;
      g.save();
      g.clearRect(0, 0, W, H);
      if (!whole) {
        g.beginPath();
        g.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2);
        g.clip();
      }
      g.fillStyle = "rgba(25,28,34,0.82)";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,0.08)";
      for (const rd of [-90, -30, 30, 90]) {
        g.fillRect(X(rd - 5), 0, 10 * scale, H);
        g.fillRect(0, Z(rd - 5), W, 10 * scale);
      }
      g.fillStyle = "rgba(255,255,255,0.32)";
      for (const s of city.shapes) {
        if (s.h < 2 && !whole) continue;
        const x = X(s.x);
        const z = Z(s.z);
        if (x < -20 || x > W + 20 || z < -20 || z > H + 20) continue;
        if (s.kind === "box") {
          g.save();
          g.translate(x, z);
          g.rotate(-(s.ry ?? 0));
          g.fillRect((-s.w * scale) / 2, (-s.d * scale) / 2, s.w * scale, s.d * scale);
          g.restore();
        } else {
          g.beginPath();
          g.arc(x, z, Math.max(1, (s.w / 2) * scale), 0, Math.PI * 2);
          g.fill();
        }
      }
      // The vault, the hideout, the HQ, bags on the ground.
      const dot = (x: number, z: number, rr: number, c: string) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(X(x), Z(z), rr, 0, Math.PI * 2);
        g.fill();
      };
      dot(VAULT.x, VAULT.z, whole ? 7 : 5, "#fab005");
      dot(HIDEOUT.x, HIDEOUT.z, whole ? 7 : 5, "#fd7e14");
      dot(BASES[0].x, BASES[0].z, whole ? 6 : 4, "#4c6ef5");
      for (const b of bags.values()) dot(b.x, b.z, 4, "#ffd43b");
      // Teammates always; enemies when you can see them (police always see a thief with a bag).
      const eye = centre.body;
      for (const a of actors.values()) {
        if (!a.alive || a === centre) continue;
        const friend = a.team === centre.team || watch;
        const bagged = a.bag && centre.team === 0;
        if (!friend && !bagged && !city.canSee({ x: eye.x, y: eye.y + RULES.eye, z: eye.z }, { x: a.body.x, y: a.body.y + 1.2, z: a.body.z })) continue;
        dot(a.body.x, a.body.z, a.tank > 0 ? 5 : whole ? 4 : 3.2, SIDES[a.team].css);
        if (a.bag) dot(a.body.x, a.body.z, 1.6, "#ffd43b");
      }
      g.save();
      g.translate(X(centre.body.x), Z(centre.body.z));
      g.rotate(-centre.yaw);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 5);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.restore();
      g.restore();
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      cv.removeEventListener("pointerdown", md);
      cv.removeEventListener("contextmenu", ctx);
      if (document.pointerLockElement) document.exitPointerLock?.();
      unlisten?.();
      sc.dispose();
    };
  }, [setup, roster, net, me, watch, myTeam]);

  // ---- touch: left thumb moves, right thumb looks; a quick tap on the look side shoots
  const touches = useRef(new Map<number, { side: "move" | "look"; x: number; y: number; ox: number; oy: number; at: number }>());
  function tDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" || watch) return;
    const w = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = e.clientX - w.left < w.width * 0.42 ? "move" : "look";
    touches.current.set(e.pointerId, { side, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, at: e.timeStamp });
    if (side === "move") setStick({ x: e.clientX - w.left, y: e.clientY - w.top, dx: 0, dy: 0 });
  }
  function tMove(e: React.PointerEvent) {
    const tt = touches.current.get(e.pointerId);
    if (!tt) return;
    if (tt.side === "look") {
      input.current.look.dx += (e.clientX - tt.x) * 1.15;
      input.current.look.dy += (e.clientY - tt.y) * 1.15;
      tt.x = e.clientX;
      tt.y = e.clientY;
    } else {
      const R = 52;
      let dx = e.clientX - tt.ox;
      let dy = e.clientY - tt.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      input.current.mx = dx / R;
      input.current.mz = dy / R;
      setStick((s) => (s ? { ...s, dx, dy } : s));
    }
  }
  function tUp(e: React.PointerEvent) {
    const tt = touches.current.get(e.pointerId);
    touches.current.delete(e.pointerId);
    if (tt?.side === "look" && e.type === "pointerup" && e.timeStamp - tt.at < 320 && Math.hypot(e.clientX - tt.ox, e.clientY - tt.oy) < 14) input.current.tap = Math.min(input.current.tap + 1, 3);
    if (tt?.side === "move") {
      input.current.mx = 0;
      input.current.mz = 0;
      setStick(null);
    }
  }
  const fireLook = useRef<{ x: number; y: number } | null>(null);

  if (failed) {
    return (
      <FullScreen onQuit={onQuit}>
        <div className="grid flex-1 place-items-center p-6 text-center text-white/70">This phone couldn&apos;t start the 3D city.</div>
      </FullScreen>
    );
  }
  const m = Math.floor(hud.left / 60);
  const s = Math.floor(hud.left % 60);
  const gun = GUNS[hud.gun];
  const hpCol = hud.hp > 50 ? "#51cf66" : hud.hp > 25 ? "#fcc419" : "#ff6b6b";
  const fresh = chat.filter((c) => hud.clock - c.at < 12000).slice(-4);
  return (
    <FullScreen onQuit={onQuit} quitLabel={watch ? "Stop watching" : "Leave the match"} className="select-none bg-black">
      <div className="relative flex-1 touch-none overflow-hidden" onPointerDown={tDown} onPointerMove={tMove} onPointerUp={tUp} onPointerCancel={tUp} onContextMenu={(e) => e.preventDefault()}>
        <div ref={wrap} className="absolute inset-0" />

        {/* Hurt: red at the edges. */}
        {hud.hurt > 0 && <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 120px rgba(224,49,49,${0.7 * hud.hurt})` }} />}
        {/* The sniper's scope. */}
        {hud.scoped && (
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 50%, transparent 0, transparent 34vmin, rgba(0,0,0,.92) 34.5vmin)" }}>
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/70" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-black/70" />
          </div>
        )}

        {/* Score and time */}
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <div className="flex items-stretch overflow-hidden rounded-2xl bg-black/60 text-white shadow-lg backdrop-blur-sm">
            <span className="grid min-w-16 place-items-center px-2 py-0.5" style={{ background: "rgba(28,79,214,.7)" }}>
              <span className="text-[8px] font-black tracking-widest text-white/80">POLICE</span>
              <b className="text-xl leading-none tabular-nums">{hud.score[0]}</b>
            </span>
            <span className="grid place-items-center px-3">
              <b className="text-lg tabular-nums leading-none">
                {m}:{String(s).padStart(2, "0")}
              </b>
              {setup.pool > 0 && <span className="text-[9px] font-black tracking-widest text-[#ffd43b]">POOL</span>}
            </span>
            <span className="grid min-w-16 place-items-center px-2 py-0.5" style={{ background: "rgba(240,140,0,.75)" }}>
              <span className="text-[8px] font-black tracking-widest text-white/85">THIEVES</span>
              <b className="text-xl leading-none tabular-nums">{hud.score[1]}</b>
            </span>
          </div>
        </div>

        {/* The map (tap for the whole city) */}
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setBigMap(true)} className="absolute left-2 top-2 size-[96px] rounded-full border-2 border-white/25 shadow-lg sm:size-32" aria-label="Map">
          <canvas ref={mapRef} width={192} height={192} className="size-full rounded-full" />
        </button>
        {bigMap && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4" onPointerDown={(e) => e.stopPropagation()} onClick={() => setBigMap(false)}>
            <div className="relative w-full max-w-md">
              <canvas ref={bigMapRef} width={520} height={520} className="aspect-square w-full rounded-3xl border border-white/20" />
              <p className="mt-2 text-center text-xs text-white/70">
                <span className="text-[#fab005]">● Vault</span> · <span className="text-[#fd7e14]">● Hideout</span> · <span className="text-[#748ffc]">● Police HQ</span> · tap to close
              </p>
            </div>
          </div>
        )}

        {/* Who took down whom */}
        <div className="pointer-events-none absolute right-2 top-14 max-w-[55%] space-y-1 text-right">
          {hud.feed.map((f) => (
            <p key={f.id} className="truncate rounded-lg bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white" style={{ borderRight: `3px solid ${SIDES[f.team].css}` }}>
              {f.text}
            </p>
          ))}
        </div>

        {/* Team chat */}
        {fresh.length > 0 && (
          <div className="pointer-events-none absolute left-2 top-[118px] max-w-[52%] space-y-1 sm:top-40">
            {fresh.map((c) => (
              <p key={c.id} className="rounded-lg bg-black/55 px-2 py-0.5 text-[11px] text-white">
                <b style={{ color: SIDES[myTeam].css }}>{c.n}:</b> {c.text}
              </p>
            ))}
          </div>
        )}

        {/* What to do, and where */}
        {!watch && hud.goal && hud.count === 0 && <p className="pointer-events-none absolute inset-x-0 top-[108px] px-24 text-center text-[11px] font-bold text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,.9)] sm:top-16 sm:px-0">{hud.goal}</p>}
        {hud.marker && !hud.scoped && (
          <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm border-2 border-white shadow" style={{ left: `${50 + hud.marker.x * 50}%`, top: `${50 - hud.marker.y * 50}%`, background: hud.bag ? "#fd7e14" : "#fab005" }} />
        )}

        {/* Crosshair */}
        {!watch && !hud.scoped && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Crosshair className={cn("size-7 drop-shadow-[0_0_2px_rgba(0,0,0,.9)] transition", hud.hit ? (hud.head ? "scale-150 text-[#ffd43b]" : "scale-125 text-[#ff6b6b]") : "text-white/90", hud.aiming && "size-5")} strokeWidth={1.5} />
          </div>
        )}
        {hud.crack > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-[58%] w-40 -translate-x-1/2 text-center">
            <p className="text-[11px] font-black tracking-widest text-[#ffd43b]">CRACKING THE VAULT</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60">
              <div className="h-full bg-[#ffd43b]" style={{ width: `${Math.min(100, hud.crack * 100)}%` }} />
            </div>
          </div>
        )}
        {hud.healing > 0 && <p className="pointer-events-none absolute inset-x-0 top-[58%] text-center text-xs font-black tracking-widest text-[#8ce99a]">HEALING… {Math.round(hud.healing * 100)}%</p>}

        {/* Countdown, taken down, protected */}
        {hud.count > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <p className="text-xs font-black tracking-[0.3em] text-white/85 [text-shadow:0_2px_10px_rgba(0,0,0,.7)]">{watch ? "STARTING SOON" : myTeam === 0 ? "YOU'RE POLICE: GUARD THE VAULT" : "YOU'RE A THIEF: ROB THE BANK"}</p>
              <p key={hud.count} className="font-display text-8xl font-black text-white [text-shadow:0_6px_30px_rgba(0,0,0,.7)]">
                {hud.count}
              </p>
            </div>
          </div>
        )}
        {hud.out > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[40%] grid place-items-center">
            <div className="rounded-3xl bg-black/65 px-6 py-4 text-center text-white backdrop-blur-sm">
              <p className="font-display text-3xl font-black">TAKEN DOWN</p>
              <p className="text-sm text-white/75">
                {hud.by ? `${hud.by} got you.` : "You're out."} Back in {Math.ceil(hud.out)}…
              </p>
            </div>
          </div>
        )}
        {hud.shield && <p className="pointer-events-none absolute inset-x-0 top-[30%] text-center text-xs font-black tracking-widest text-white/80">PROTECTED</p>}

        {/* Watching */}
        {watch && (
          <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => (input.current.follow -= 1)} className="grid size-11 place-items-center rounded-full bg-black/55 text-white" aria-label="Previous player">
              <ChevronLeft className="size-5" />
            </button>
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white">
              <Eye className="size-4" /> {hud.watching || "Watching"}
            </span>
            <button onClick={() => (input.current.follow += 1)} className="grid size-11 place-items-center rounded-full bg-black/55 text-white" aria-label="Next player">
              <ChevronRight className="size-5" />
            </button>
            <button onClick={() => (input.current.overview = !input.current.overview)} className="grid size-11 place-items-center rounded-full bg-black/55 text-white" aria-label="From above">
              <MapIcon className="size-5" />
            </button>
          </div>
        )}

        {!watch && (
          <>
            {/* The move stick */}
            {stick && (
              <div className="pointer-events-none absolute size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-white/10" style={{ left: stick.x, top: stick.y }}>
                <span className="absolute left-1/2 top-1/2 size-12 rounded-full bg-white/60 shadow" style={{ transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))` }} />
              </div>
            )}
            {!stick && hud.count > 0 && <p className="pointer-events-none absolute bottom-28 left-6 text-xs font-bold text-white/75">Left thumb: move · Right thumb: look · Tap to shoot</p>}

            {/* Health, armour, gun */}
            <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 w-44 space-y-1 rounded-2xl bg-black/55 p-2 text-white">
              {hud.tank > 0 ? (
                <div className="flex items-center gap-1.5 text-xs font-black">
                  <Truck className="size-4 text-[#ffd43b]" /> TANK
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full bg-[#ffd43b]" style={{ width: `${(hud.tank / RULES.tankHp) * 100}%` }} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <HeartPulse className="size-3.5" style={{ color: hpCol }} />
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full transition-all" style={{ width: `${hud.hp}%`, background: hpCol }} />
                    </div>
                    <b className="w-7 text-right text-xs tabular-nums">{hud.hp}</b>
                  </div>
                  {hud.armour > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Shield className="size-3.5 text-[#74c0fc]" />
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full bg-[#74c0fc]" style={{ width: `${(hud.armour / RULES.armour) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}
              <p className="flex items-baseline justify-between text-xs">
                <b className="truncate">{hud.tank > 0 ? "Cannon" : gun.name}</b>
                <span className="tabular-nums text-white/80">{hud.tank > 0 ? "" : hud.reloading ? "reloading…" : hud.gun === "rocket" ? `${hud.ammo} · ${hud.rockets} left` : `${hud.ammo}/${gun.mag}`}</span>
              </p>
              {hud.bag && <p className="text-[11px] font-black text-[#ffd43b]">₦ CARRYING A BAG</p>}
            </div>

            {/* Chat, auto-aim, ping */}
            <div className="absolute right-2 top-[calc(env(safe-area-inset-top)+3rem)] flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => setChatOpen(true)} className="grid size-9 place-items-center rounded-full bg-black/55 text-white" aria-label="Team chat">
                <MessageCircle className="size-4" />
              </button>
              <button
                onClick={() => {
                  input.current.auto = !input.current.auto;
                  setAuto(input.current.auto);
                }}
                className={cn("grid size-9 place-items-center rounded-full text-[9px] font-black text-white", auto ? "bg-[#2f9e44]" : "bg-black/55")}
                aria-label="Auto-aim"
              >
                AUTO
              </button>
              <button onClick={() => sendChat.current("PING")} className="grid size-9 place-items-center rounded-full bg-black/55 text-white" aria-label="Ping where you're looking">
                <Target className="size-4" />
              </button>
            </div>
            {chatOpen && (
              <div className="absolute inset-0 z-40 grid place-items-end bg-black/40 p-3 sm:place-items-center" onPointerDown={(e) => e.stopPropagation()}>
                <div className="w-full max-w-sm space-y-2 rounded-3xl border border-white/10 bg-[#0d1117]/95 p-3 text-white">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-lg font-black">Team chat · {SIDES[myTeam].name}</p>
                    <button onClick={() => setChatOpen(false)} className="grid size-8 place-items-center rounded-full bg-white/10" aria-label="Close">
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        onClick={() => {
                          sendChat.current(q);
                          setChatOpen(false);
                        }}
                        className="rounded-xl bg-white/10 px-2 py-2 text-left text-xs font-semibold"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendChat.current(draft);
                      setDraft("");
                      setChatOpen(false);
                    }}
                  >
                    <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 80))} placeholder="Message your team" className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40" />
                    <button className="grid size-10 place-items-center rounded-xl text-white" style={{ background: SIDES[myTeam].css }} aria-label="Send">
                      <Send className="size-4" />
                    </button>
                  </form>
                  <p className="text-[11px] text-white/45">Only your side sees these.</p>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 flex items-end gap-2">
              <div className="flex flex-col items-center gap-2">
                {hud.tankReady && (
                  <button onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.tank = true;
                  }} className="grid size-12 place-items-center rounded-full bg-[#fab005] text-[9px] font-black text-black shadow-lg">
                    <Truck className="size-5" />
                    TANK
                  </button>
                )}
                {hud.medkits > 0 && (
                  <button onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.heal = true;
                  }} className="relative grid size-11 place-items-center rounded-full bg-black/50 text-white shadow-lg" aria-label="Medkit">
                    <HeartPulse className="size-5 text-[#8ce99a]" />
                    <b className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#2f9e44] text-[10px]">{hud.medkits}</b>
                  </button>
                )}
                {hud.grenades > 0 && hud.tank <= 0 && (
                  <button onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.grenade = true;
                  }} className="relative grid size-11 place-items-center rounded-full bg-black/50 text-white shadow-lg" aria-label="Grenade">
                    <Bomb className="size-5" />
                    <b className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#e8590c] text-[10px]">{hud.grenades}</b>
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.aim = !input.current.aim;
                  }}
                  className={cn("grid size-12 place-items-center rounded-full text-[10px] font-black text-white shadow-lg backdrop-blur-sm", hud.aiming ? "bg-[#1c7ed6]" : "bg-black/45")}
                >
                  {gun.scope && hud.tank <= 0 ? "SCOPE" : "AIM"}
                </button>
                <button onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.crouch = !input.current.crouch;
                  }} className={cn("grid size-12 place-items-center rounded-full text-[10px] font-black text-white shadow-lg", hud.crouch ? "bg-[#2f9e44]" : "bg-black/45")}>
                  DUCK
                </button>
                <button onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.jump = true;
                  }} className="grid size-12 place-items-center rounded-full bg-black/45 text-[10px] font-black text-white shadow-lg">
                  JUMP
                </button>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex gap-2">
                  <button onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.swap = true;
                  }} className="grid h-11 min-w-11 place-items-center rounded-full bg-black/50 px-2 text-[9px] font-black text-white shadow-lg" aria-label="Switch gun">
                    <Swords className="size-4" />
                    SWAP
                  </button>
                  <button onPointerDown={(e) => {
                    e.stopPropagation();
                    input.current.reload = true;
                  }} className="grid size-11 place-items-center rounded-full bg-black/50 text-white shadow-lg" aria-label="Reload">
                    <RotateCcw className="size-4" />
                  </button>
                </div>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    input.current.fire = true;
                    input.current.tap = Math.min(input.current.tap + 1, 2);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    input.current.fire = false;
                    fireLook.current = null;
                  }}
                  onPointerCancel={() => {
                    input.current.fire = false;
                    fireLook.current = null;
                  }}
                  onPointerMove={(e) => {
                    const p = fireLook.current;
                    if (p) {
                      input.current.look.dx += (e.clientX - p.x) * 1.15;
                      input.current.look.dy += (e.clientY - p.y) * 1.15;
                    }
                    fireLook.current = { x: e.clientX, y: e.clientY };
                  }}
                  className="grid size-24 place-items-center rounded-full text-white shadow-[0_6px_0_rgba(0,0,0,.35)] active:translate-y-1 active:shadow-none"
                  style={{ background: myTeam === 0 ? "rgba(28,79,214,.88)" : "rgba(232,89,12,.9)" }}
                >
                  <span className="text-center">
                    <Crosshair className="mx-auto size-7" />
                    <b className="text-xs tracking-widest">FIRE</b>
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </FullScreen>
  );
}
