"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Copy, Crosshair, Crown, LoaderCircle, Lock, Play, RotateCcw, Swords, Target, Users, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { FullScreen } from "../minigames/fullscreen";
import { FeeLine, usePlayFee } from "../minigames/fee";
import { playSfx } from "../sound";
import { tone } from "../minigames/sfx";
import { PaintballNet, newCode, type Member, type Msg, type Seat } from "./net";
import { PaintballScene } from "./scene";
import { FIELD, RULES, TEAM, fly, hitsPerson, layout, rand, segmentHit, spawns, step, think, type Actor, type Ball, type V3 } from "./world";

// Paintball: two teams (red and blue, up to 8 players, bots in the empty places) on a speedball
// field, full screen, third person over the shoulder. Team Splat: every hit is a splat for your
// team; the hit player is out for 3 seconds and comes back at their end. First to 25, or the most
// after 4 minutes. Quick match (whoever else is looking for a game), a private match with a code
// for friends, or practice against bots. Each game costs its fee (../minigames/fee); nothing is
// paid out. Left thumb moves, right thumb looks; FIRE (hold), AIM, JUMP, RELOAD. On a computer:
// WASD, the mouse (click to lock it), Space, R, right button to aim.

type Me = { id: string; name: string };
type Result = { won: boolean; draw: boolean; scores: [number, number]; rows: { name: string; team: number; hits: number; outs: number; me: boolean; bot: boolean }[] };
type Screen = { k: "menu" } | { k: "room"; code: string; quick: boolean } | { k: "play"; code: string | null; quick: boolean; start: Extract<Msg, { t: "start" }> } | { k: "done"; code: string | null; quick: boolean; result: Result };

const MAX = 8;
const BOT_NAMES = ["Tunde", "Ada", "Bayo", "Chika", "Emeka", "Funmi", "Kemi", "Segun", "Ngozi", "Dayo", "Ife", "Obi", "Zainab", "Lola"];

/** Fill a roster to 4 a side (people first, then bots), teams in turn. */
function makeRoster(people: { id: string; name: string }[], seed: number): Seat[] {
  const r = rand(seed);
  const out: Seat[] = people.slice(0, MAX).map((p, k) => ({ i: p.id, n: p.name, tm: k % 2, b: false }));
  const names = [...BOT_NAMES].sort(() => r() - 0.5);
  for (let k = out.length; k < MAX; k++) out.push({ i: `bot:${k}`, n: `${names[k % names.length]} (bot)`, tm: k % 2, b: true });
  return out;
}

export function Paintball({ me: who, onClose }: { me: Me | null; onClose: () => void }) {
  // The same you for the whole time paintball is open (a new object each render would restart it).
  const meId = who?.id ?? null;
  const meName = who?.name ?? "Player";
  const me = useMemo(() => (meId ? { id: meId, name: meName } : null), [meId, meName]);
  const [screen, setScreen] = useState<Screen>({ k: "menu" });
  const fee = usePlayFee("paintball", !!me);
  const [joinCode, setJoinCode] = useState("");
  const [paying, setPaying] = useState(false);
  // One live channel for the room, from waiting through the match and back (practice: none).
  const roomCode = screen.k === "menu" ? null : screen.code;
  const [net, setNet] = useState<PaintballNet | null>(null);
  useEffect(() => {
    if (!roomCode || !me) return;
    const n = new PaintballNet(roomCode, me);
    setNet(n);
    return () => {
      n.close();
      setNet(null);
    };
  }, [roomCode, me]);

  async function begin(start: Extract<Msg, { t: "start" }>, code: string | null, quick: boolean) {
    setPaying(true);
    const ok = await fee.pay();
    setPaying(false);
    if (!ok) return setScreen({ k: "menu" });
    setScreen({ k: "play", code, quick, start });
  }
  function practice() {
    if (!me) return void fee.pay();
    const seed = Math.floor(Math.random() * 1e9);
    void begin({ t: "start", m: `solo-${seed}`, seed, at: Date.now() + 3200, roster: makeRoster([me], seed) }, null, false);
  }

  if (screen.k === "play" && me) {
    return (
      <Match
        me={me}
        start={screen.start}
        net={screen.code ? net : null}
        onQuit={() => setScreen(screen.code ? { k: "room", code: screen.code, quick: screen.quick } : { k: "menu" })}
        onEnd={(result) => setScreen({ k: "done", code: screen.code, quick: screen.quick, result })}
      />
    );
  }

  return (
    <FullScreen onQuit={screen.k === "menu" ? onClose : () => setScreen({ k: "menu" })} quitLabel={screen.k === "menu" ? "Close paintball" : "Back"} className="bg-[#0d1117]">
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(224,49,49,.35),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(28,126,214,.35),transparent_55%)]" />
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-5 py-14">
          <div className="text-center">
            <p className="text-[11px] font-black tracking-[0.3em] text-[#ffa94d]">TEAM SPLAT · 4 V 4</p>
            <h1 className="font-display text-5xl font-black tracking-tight text-white [text-shadow:0_4px_24px_rgba(0,0,0,.6)]">
              PAINT<span className="text-[#ff6b6b]">BALL</span>
            </h1>
            <p className="mt-1 text-sm text-white/65">Red against blue. Every hit is a splat for your team: first to {RULES.target}, or the most in 4 minutes.</p>
          </div>

          {screen.k === "menu" && (
            <>
              {!me && <p className="rounded-2xl bg-white/10 p-3 text-center text-sm text-white/80">Sign in to play paintball.</p>}
              <button disabled={!me || paying} onClick={() => setScreen({ k: "room", code: "quick", quick: true })} className="flex items-center gap-3 rounded-3xl bg-[#e03131] px-5 py-4 text-left text-white shadow-[0_6px_0_#a51d1d] active:translate-y-1 active:shadow-none disabled:opacity-50">
                <Zap className="size-7 shrink-0" />
                <span>
                  <b className="block text-lg leading-tight">Quick match</b>
                  <span className="text-sm text-white/80">Play whoever else is looking for a game right now</span>
                </span>
              </button>
              <button disabled={!me || paying} onClick={() => setScreen({ k: "room", code: newCode(), quick: false })} className="flex items-center gap-3 rounded-3xl bg-[#1c7ed6] px-5 py-4 text-left text-white shadow-[0_6px_0_#11497d] active:translate-y-1 active:shadow-none disabled:opacity-50">
                <Lock className="size-7 shrink-0" />
                <span>
                  <b className="block text-lg leading-tight">Private match</b>
                  <span className="text-sm text-white/80">Get a code and send it to your friends</span>
                </span>
              </button>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = joinCode.trim().toUpperCase();
                  if (c.length >= 4) setScreen({ k: "room", code: c, quick: false });
                }}
              >
                <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="Friend's code" className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 font-bold tracking-widest text-white placeholder:font-normal placeholder:tracking-normal placeholder:text-white/40" />
                <button disabled={!me || joinCode.trim().length < 4} className="rounded-2xl bg-white/15 px-4 font-bold text-white disabled:opacity-40">
                  Join
                </button>
              </form>
              <button disabled={!me || paying} onClick={practice} className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 font-semibold text-white disabled:opacity-50">
                {paying ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />} Practice against bots
              </button>
              <div className="rounded-2xl bg-black/30 p-3 text-xs leading-relaxed text-white/60">
                <b className="text-white/85">Controls.</b> Left thumb: move. Right thumb: look. Hold FIRE to shoot, AIM to look down the sights, JUMP over low bunkers. On a computer: WASD, the mouse (click the field to lock it), Space to jump, R to reload, right button to aim.
              </div>
              <div className="[&_p]:text-white/60">
                <FeeLine fee={fee.fee} error={fee.error} />
              </div>
            </>
          )}

          {screen.k === "room" && me && (net ? (
            <Room key={screen.code} me={me} net={net} code={screen.code} quick={screen.quick} paying={paying} onStart={(st) => void begin(st, screen.code, screen.quick)} />
          ) : (
            <p className="flex items-center justify-center gap-2 py-6 text-sm font-semibold text-white/80">
              <LoaderCircle className="size-4 animate-spin" /> Going in…
            </p>
          ))}

          {screen.k === "done" && <Results result={screen.result} again={() => (screen.code ? setScreen({ k: "room", code: screen.code, quick: screen.quick }) : practice())} menu={() => setScreen({ k: "menu" })} />}
        </div>
      </div>
    </FullScreen>
  );
}

// ---------------------------------------------------------------- waiting in a room

function Room({ me, net, code, quick, paying, onStart }: { me: Me; net: PaintballNet; code: string; quick: boolean; paying: boolean; onStart: (s: Extract<Msg, { t: "start" }>) => void }) {
  const [members, setMembers] = useState<Member[]>(net.members);
  const [count, setCount] = useState<number | null>(null);
  const started = useRef(false);
  const cb = useRef(onStart);
  useEffect(() => {
    cb.current = onStart;
  });
  useEffect(() => {
    net.status("wait");
    setMembers(net.members);
    net.onMembers = setMembers;
    net.onMsg = (m) => {
      if (m.t !== "start" || started.current) return;
      if (!m.roster.some((s) => s.i === me.id)) return;
      started.current = true;
      cb.current(m);
    };
    return () => {
      net.onMembers = () => {};
      net.onMsg = () => {};
    };
  }, [net, me]);

  const waiting = members.filter((m) => m.st === "wait");
  const playing = members.filter((m) => m.st === "play");
  const host = waiting[0]?.id === me.id;
  // Quick match: once two are waiting and no match is on, a short countdown, then the host starts.
  const ready = quick && waiting.length >= 2 && !playing.length;
  useEffect(() => {
    if (!ready) return setCount(null);
    setCount(8);
    const id = window.setInterval(() => setCount((c) => (c === null ? null : Math.max(0, c - 1))), 1000);
    return () => window.clearInterval(id);
  }, [ready]);
  function start() {
    if (started.current) return;
    const seed = Math.floor(Math.random() * 1e9);
    const msg: Extract<Msg, { t: "start" }> = { t: "start", m: `${code}-${seed}`, seed, at: Date.now() + 4000, roster: makeRoster(waiting.map((w) => ({ id: w.id, name: w.name })), seed) };
    net.send(msg);
    started.current = true;
    onStart(msg);
  }
  useEffect(() => {
    if (count === 0 && host) start();
  });

  return (
    <div className="space-y-3 rounded-3xl border border-white/10 bg-black/35 p-4 text-white backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-black tracking-[0.2em] text-white/50">{quick ? "QUICK MATCH" : "PRIVATE MATCH"}</p>
          {!quick && (
            <button onClick={() => void navigator.clipboard?.writeText(code).catch(() => {})} className="flex items-center gap-2 font-mono text-3xl font-black tracking-[0.25em]">
              {code} <Copy className="size-4 text-white/50" />
            </button>
          )}
        </div>
        <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-sm font-bold">
          <Users className="size-4" /> {waiting.length}/{MAX}
        </span>
      </div>
      {!quick && <p className="text-sm text-white/60">Send your friends this code: they tap Private match, put it in and Join.</p>}
      <ul className="grid grid-cols-2 gap-1.5">
        {waiting.slice(0, MAX).map((m, k) => (
          <li key={m.id} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold" style={{ background: k % 2 ? "rgba(28,126,214,.25)" : "rgba(224,49,49,.25)" }}>
            {k === 0 && <Crown className="size-3.5 shrink-0 text-[#ffd43b]" />}
            <span className="truncate">{m.id === me.id ? `${m.name} (you)` : m.name}</span>
          </li>
        ))}
        {Array.from({ length: Math.max(0, MAX - waiting.length) }, (_, k) => (
          <li key={`b${k}`} className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-2 text-sm text-white/35">
            <Bot className="size-3.5" /> Bot
          </li>
        ))}
      </ul>
      {playing.length > 0 && <p className="rounded-xl bg-[#ffd43b]/15 p-2 text-center text-sm text-[#ffe066]">A match is on in here. You&apos;ll play the next one.</p>}
      {paying ? (
        <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold">
          <LoaderCircle className="size-4 animate-spin" /> Paying and going in…
        </p>
      ) : quick ? (
        <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-white/80">
          {count !== null ? (
            <>Starting in {count}…</>
          ) : (
            <>
              <LoaderCircle className="size-4 animate-spin" /> Looking for players…
            </>
          )}
        </p>
      ) : null}
      {host && !playing.length && !paying && (
        <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2f9e44] py-3 font-bold shadow-[0_5px_0_#1e6b2d] active:translate-y-1 active:shadow-none">
          <Play className="size-4" /> {waiting.length > 1 ? `Start (${waiting.length} players, bots fill the rest)` : "Start now with bots"}
        </button>
      )}
      {!host && !quick && <p className="text-center text-xs text-white/50">The first one in starts the match.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- the end

function Results({ result, again, menu }: { result: Result; again: () => void; menu: () => void }) {
  const best = [...result.rows].sort((a, b) => b.hits - a.hits || a.outs - b.outs);
  return (
    <div className="space-y-3 rounded-3xl border border-white/10 bg-black/40 p-4 text-white backdrop-blur">
      <p className="text-center text-[11px] font-black tracking-[0.25em] text-white/50">MATCH OVER</p>
      <p className={cn("text-center font-display text-4xl font-black", result.won ? "text-[#ffd43b]" : "text-white")}>{result.draw ? "A draw!" : result.won ? "Victory!" : "Defeat"}</p>
      <p className="text-center text-3xl font-black tabular-nums">
        <span style={{ color: TEAM[0].css }}>{result.scores[0]}</span> <span className="text-white/40">–</span> <span style={{ color: TEAM[1].css }}>{result.scores[1]}</span>
      </p>
      <ol className="space-y-1">
        {best.map((r, k) => (
          <li key={k} className={cn("flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm", r.me ? "bg-white/15" : "bg-white/5")}>
            <span className="w-5 text-center font-black text-white/50">{k === 0 ? <Crown className="mx-auto size-4 text-[#ffd43b]" /> : k + 1}</span>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: TEAM[r.team].css }} />
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <span className="tabular-nums text-white/80">
              <Target className="mr-0.5 inline size-3.5" />
              {r.hits}
            </span>
            <span className="w-10 text-right tabular-nums text-white/45">out {r.outs}</span>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <button onClick={again} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#e03131] py-3 font-bold">
          <RotateCcw className="size-4" /> Play again
        </button>
        <button onClick={menu} className="flex-1 rounded-2xl bg-white/10 py-3 font-bold">
          Menu
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the match

type Snap = { t: number; p: number[] };
type Hud = { left: number; red: number; blue: number; hopper: number; reloading: boolean; out: number; by: string; count: number; feed: { id: number; text: string; team: number }[]; hit: number; aiming: boolean; shield: boolean };

function Match({ me, start, net, onQuit, onEnd }: { me: Me; start: Extract<Msg, { t: "start" }>; net: PaintballNet | null; onQuit: () => void; onEnd: (r: Result) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const shapes = useMemo(() => layout(start.seed), [start.seed]);
  const input = useRef({ mx: 0, mz: 0, look: { dx: 0, dy: 0 }, fire: false, aim: false, jump: false, reload: false, keys: new Set<string>() });
  const [hud, setHud] = useState<Hud>({ left: RULES.seconds, red: 0, blue: 0, hopper: RULES.hopper, reloading: false, out: 0, by: "", count: 3, feed: [], hit: 0, aiming: false, shield: false });
  const [failed, setFailed] = useState(false);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const ends = useRef(onEnd);
  useEffect(() => {
    ends.current = onEnd;
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let sc: PaintballScene;
    try {
      sc = new PaintballScene(el, shapes);
    } catch {
      setFailed(true);
      return;
    }
    net?.status("play");
    const r = rand(start.seed ^ 0x5bd1e995);
    const t0 = start.at / 1000;
    const nowS = () => Date.now() / 1000 - t0;

    // Everyone in the match.
    const actors = new Map<string, Actor>();
    const used = [0, 0];
    for (const s of start.roster) {
      const sp = spawns(s.tm)[used[s.tm]++ % 5];
      actors.set(s.i, { id: s.i, name: s.n, team: s.tm, bot: s.b, body: { x: sp.x, y: 0, z: sp.z, vy: 0 }, yaw: sp.yaw, pitch: 0, alive: true, back: 0, shield: 0, hits: 0, outs: 0 });
      sc.addActor(s.i, s.n, s.tm, s.i === me.id);
    }
    const mine = actors.get(me.id)!;
    const humans = start.roster.filter((s) => !s.b).map((s) => s.i);
    const snaps = new Map<string, Snap[]>();
    const lastHeard = new Map<string, number>();
    const seenHits = new Set<string>();
    const balls: Ball[] = [];
    let ballId = 1;
    const score = [0, 0];
    let over = false;
    let hopper = RULES.hopper;
    let reloadUntil = 0;
    let nextShot = 0;
    let myShots: number[][] = [];
    let botShots = new Map<string, number[][]>();
    let lastSend = 0;
    let lastHud = 0;
    let hitFlash = 0;
    let outBy = "";
    const feed: Hud["feed"] = [];
    let feedId = 1;

    /** The host runs the bots: the first person in the roster who's still here. */
    const isHost = () => {
      if (!net) return true;
      const here = new Set(net.members.filter((m) => m.st === "play").map((m) => m.id));
      here.add(me.id);
      return humans.find((h) => here.has(h)) === me.id;
    };

    function shoot(owner: Actor, o: V3, d: V3, local: boolean) {
      const b: Ball = { id: ballId++, owner: owner.id, team: owner.team, x: o.x, y: o.y, z: o.z, vx: d.x * RULES.speed, vy: d.y * RULES.speed, vz: d.z * RULES.speed, age: 0, mine: local };
      balls.push(b);
      sc.addBall(b);
    }
    const muzzle = (a: Actor) => ({ x: a.body.x - Math.sin(a.yaw) * 0.9 + Math.cos(a.yaw) * 0.12, y: a.body.y + 1.36, z: a.body.z - Math.cos(a.yaw) * 0.9 - Math.sin(a.yaw) * 0.12 });

    function out(tg: Actor, by: Actor | undefined, h: string) {
      if (seenHits.has(h) || !tg.alive) return;
      seenHits.add(h);
      tg.alive = false;
      tg.outs += 1;
      tg.back = nowS() + RULES.respawn;
      if (by) {
        by.hits += 1;
        score[by.team] += 1;
      }
      sc.markActor(tg.id, by?.team ?? 0);
      feed.unshift({ id: feedId++, text: `${by?.name ?? "Someone"} splatted ${tg.name}`, team: by?.team ?? 0 });
      feed.splice(5);
      if (tg.id === me.id) {
        outBy = by?.name ?? "";
        playSfx("miss");
      } else if (by?.id === me.id) {
        hitFlash = performance.now();
        tone(880, 0.08, "square", 0.06);
      }
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
      a.shield = nowS() + RULES.shield;
      a.brain = undefined;
      sc.clearMarks(a.id);
    }

    if (net) {
      net.onMsg = (m) => {
        if (!("m" in m) || m.m !== start.m) return;
        const t = nowS();
        if (m.t === "s") {
          const a = actors.get(m.i);
          if (!a || a.id === me.id) return;
          lastHeard.set(a.id, t);
          const list = snaps.get(a.id) ?? [];
          list.push({ t, p: m.p });
          if (list.length > 20) list.shift();
          snaps.set(a.id, list);
          if (m.p[5] && !a.alive && t >= a.back - 0.3) {
            a.alive = true;
            a.shield = t + RULES.shield;
            sc.clearMarks(a.id);
          }
          for (const s of m.sh ?? []) shoot(a, { x: s[0], y: s[1], z: s[2] }, { x: s[3], y: s[4], z: s[5] }, false);
        } else if (m.t === "b") {
          if (isHost()) return;
          for (const bt of m.bots) {
            const a = actors.get(bt.i);
            if (!a) continue;
            lastHeard.set(a.id, t);
            const list = snaps.get(a.id) ?? [];
            list.push({ t, p: bt.p });
            if (list.length > 20) list.shift();
            snaps.set(a.id, list);
            if (bt.p[5] && !a.alive && t >= a.back - 0.3) {
              a.alive = true;
              a.shield = t + RULES.shield;
              sc.clearMarks(a.id);
            }
            for (const s of bt.sh ?? []) shoot(a, { x: s[0], y: s[1], z: s[2] }, { x: s[3], y: s[4], z: s[5] }, false);
          }
        } else if (m.t === "hit") {
          const tg = actors.get(m.tg);
          if (tg) out(tg, actors.get(m.by), m.h);
        } else if (m.t === "end") over = true;
      };
    }

    // ---- input: keys and the mouse (a computer)
    const keys = input.current.keys;
    const kd = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "Space") input.current.jump = true;
      if (e.code === "KeyR") input.current.reload = true;
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

    // ---- the loop
    let raf = 0;
    let last = performance.now();
    let ended = false;
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = nowS();
      const live = t >= 0 && !over;
      const host = isHost();
      const inp = input.current;

      // Looking round (touch drags and the mouse), then moving.
      const sens = inp.aim ? 0.0022 : 0.0042;
      mine.yaw -= inp.look.dx * sens;
      mine.pitch = Math.max(-0.9, Math.min(0.75, mine.pitch - inp.look.dy * sens));
      inp.look.dx = 0;
      inp.look.dy = 0;
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
      // (fx, fz): right and back, in your own view; turned to the world.
      const c = Math.cos(mine.yaw);
      const sn = Math.sin(mine.yaw);
      const wx = fx * c + fz * sn;
      const wz = -fx * sn + fz * c;
      const before = { x: mine.body.x, z: mine.body.z };
      if (mine.alive && live) step(mine.body, shapes, wx, wz, inp.jump, dt, inp.aim ? RULES.run * 0.55 : RULES.run);
      else if (!mine.alive && t >= mine.back && live) respawn(mine);
      inp.jump = false;
      const mySpeed = Math.hypot(mine.body.x - before.x, mine.body.z - before.z) / Math.max(dt, 1e-3);

      // Firing.
      if (inp.reload && hopper < RULES.hopper && t > reloadUntil) {
        reloadUntil = t + RULES.reload;
        playSfx("tick");
      }
      inp.reload = false;
      if (reloadUntil && t >= reloadUntil && hopper < RULES.hopper) {
        hopper = RULES.hopper;
        reloadUntil = 0;
      }
      if (inp.fire && mine.alive && live && hopper > 0 && t >= nextShot && t >= reloadUntil) {
        nextShot = t + 1 / RULES.rate;
        hopper -= 1;
        if (!hopper) reloadUntil = t + RULES.reload;
        const ray = sc.ray();
        // What the crosshair is on (a bunker, the turf, or someone, with a little help on a phone).
        let far = 110;
        const end = { x: ray.o.x + ray.d.x * far, y: ray.o.y + ray.d.y * far, z: ray.o.z + ray.d.z * far };
        const wall = segmentHit(shapes, ray.o, end);
        if (wall) far *= wall.t;
        if (ray.d.y < -1e-3) far = Math.min(far, -ray.o.y / ray.d.y);
        let aimAt = { x: ray.o.x + ray.d.x * far, y: ray.o.y + ray.d.y * far, z: ray.o.z + ray.d.z * far };
        let bestAngle = inp.aim ? 0.02 : 0.04;
        for (const o of actors.values()) {
          if (o.team === mine.team || !o.alive) continue;
          const tx = o.body.x - ray.o.x;
          const ty = o.body.y + 1.15 - ray.o.y;
          const tz = o.body.z - ray.o.z;
          const dl = Math.hypot(tx, ty, tz);
          if (dl > far + 1) continue;
          const ang = Math.acos(Math.max(-1, Math.min(1, (tx * ray.d.x + ty * ray.d.y + tz * ray.d.z) / dl)));
          if (ang < bestAngle) {
            bestAngle = ang;
            aimAt = { x: o.body.x, y: o.body.y + 1.15, z: o.body.z };
          }
        }
        const mz0 = muzzle(mine);
        const dist = Math.hypot(aimAt.x - mz0.x, aimAt.z - mz0.z);
        aimAt.y += 0.5 * RULES.gravity * (dist / RULES.speed) ** 2;
        const spread = (inp.aim ? 0.006 : 0.016) + Math.min(1, mySpeed / RULES.run) * 0.018;
        let dx = aimAt.x - mz0.x + (r() - 0.5) * spread * dist * 2;
        let dy = aimAt.y - mz0.y + (r() - 0.5) * spread * dist * 2;
        let dz = aimAt.z - mz0.z + (r() - 0.5) * spread * dist * 2;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
        shoot(mine, mz0, { x: dx, y: dy, z: dz }, true);
        myShots.push([mz0.x, mz0.y, mz0.z, dx, dy, dz].map((v) => Math.round(v * 1000) / 1000));
        tone(170 + r() * 40, 0.05, "triangle", 0.05);
      }

      // The bots (the host moves them; everyone else follows what the host says).
      for (const a of actors.values()) {
        if (!a.bot) continue;
        if (host) {
          if (!a.alive) {
            if (t >= a.back && live) respawn(a);
            continue;
          }
          if (!live) continue;
          const plan = think(a, [...actors.values()], shapes, t, dt, r);
          step(a.body, shapes, plan.mx, plan.mz, plan.jump, dt, RULES.run * 0.82);
          if (plan.shot) {
            const o = muzzle(a);
            shoot(a, o, plan.shot, true);
            const list = botShots.get(a.id) ?? [];
            list.push([o.x, o.y, o.z, plan.shot.x, plan.shot.y, plan.shot.z].map((v) => Math.round(v * 1000) / 1000));
            botShots.set(a.id, list);
          }
        }
      }

      // Everyone else: where they were a moment ago (smooth, between the last two updates).
      for (const a of actors.values()) {
        if (a.id === me.id || (a.bot && host)) continue;
        const list = snaps.get(a.id);
        if (!list?.length) continue;
        const rt = t - 0.13;
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
        // Gone quiet: they've left (nobody can hit them; they don't show).
        if (t - (lastHeard.get(a.id) ?? -99) > 4) a.alive = false;
      }

      // The paint in the air.
      for (let k = balls.length - 1; k >= 0; k--) {
        const b = balls[k];
        const from = fly(b, dt);
        const to = { x: b.x, y: b.y, z: b.z };
        let done = false;
        if (b.mine && live) {
          // My shots (and the host's bots'): did they hit someone?
          let best: Actor | null = null;
          let bt = 2;
          for (const o of actors.values()) {
            if (o.team === b.team || !o.alive || o.shield > t) continue;
            const ht = hitsPerson(from, to, { x: o.body.x, y: o.body.y, z: o.body.z });
            if (ht >= 0 && ht < bt) {
              bt = ht;
              best = o;
            }
          }
          if (best) {
            const wall = segmentHit(shapes, from, to);
            if (!wall || wall.t > bt) {
              const h = `${me.id}:${b.owner}:${b.id}`;
              net?.send({ t: "hit", m: start.m, by: b.owner, tg: best.id, h });
              out(best, actors.get(b.owner), h);
              done = true;
            }
          }
        }
        if (!done) {
          const wall = segmentHit(shapes, from, to);
          if (wall) {
            sc.splat({ x: from.x + (to.x - from.x) * wall.t, y: from.y + (to.y - from.y) * wall.t, z: from.z + (to.z - from.z) * wall.t }, wall.n, b.team);
            done = true;
          } else if (to.y <= 0.01) {
            sc.splat({ x: to.x, y: 0.005, z: to.z }, { x: 0, y: 1, z: 0 }, b.team);
            done = true;
          } else if (Math.abs(to.x) > FIELD.hx + 3 || Math.abs(to.z) > FIELD.hz + 1.5) {
            const nx = Math.abs(to.x) > FIELD.hx + 3 ? -Math.sign(to.x) : 0;
            sc.splat(to, { x: nx, y: 0, z: nx ? 0 : -Math.sign(to.z) }, b.team);
            done = true;
          } else if (b.age > 2.4) done = true;
        }
        if (done) {
          sc.dropBall(b.id);
          balls.splice(k, 1);
        } else sc.moveBall(b);
      }

      // Tell the others where I am (and the bots, if I run them), about 8 times a second.
      if (net && now - lastSend > 125) {
        lastSend = now;
        const p = [mine.body.x, mine.body.y, mine.body.z, mine.yaw, mine.pitch, mine.alive ? 1 : 0].map((v) => Math.round(v * 100) / 100);
        net.send({ t: "s", m: start.m, i: me.id, p, sh: myShots.length ? myShots : undefined });
        myShots = [];
        if (host) {
          const bots = [...actors.values()].filter((a) => a.bot).map((a) => ({ i: a.id, p: [a.body.x, a.body.y, a.body.z, a.yaw, a.pitch, a.alive ? 1 : 0].map((v) => Math.round(v * 100) / 100), sh: botShots.get(a.id) }));
          net.send({ t: "b", m: start.m, bots });
          botShots = new Map();
        }
      }

      // Draw.
      for (const a of actors.values()) {
        const prev = (a as Actor & { _p?: { x: number; z: number } })._p ?? { x: a.body.x, z: a.body.z };
        const sp = a.id === me.id ? mySpeed : Math.hypot(a.body.x - prev.x, a.body.z - prev.z) / Math.max(dt, 1e-3);
        (a as Actor & { _p?: { x: number; z: number } })._p = { x: a.body.x, z: a.body.z };
        sc.setActor(a.id, a.body.x, a.body.y, a.body.z, a.yaw, a.pitch, sp, a.alive, a.shield > t, dt, a.id === me.id && inp.aim);
      }
      sc.follow(mine.body.x, mine.body.y, mine.body.z, mine.yaw, mine.pitch, inp.aim && mine.alive, dt);
      const left = Math.max(0, RULES.seconds - Math.max(0, t));
      sc.setScore(score[0], score[1], left);
      sc.render(now / 1000);

      // The end: a team got there, or time's up.
      if (!ended && t > 0 && (over || left <= 0 || score[0] >= RULES.target || score[1] >= RULES.target)) {
        ended = true;
        over = true;
        if (host) net?.send({ t: "end", m: start.m });
        playSfx(score[mine.team] > score[1 - mine.team] ? "found" : "miss");
        const rows = [...actors.values()].map((a) => ({ name: a.name, team: a.team, hits: a.hits, outs: a.outs, me: a.id === me.id, bot: a.bot }));
        window.setTimeout(() => ends.current({ won: score[mine.team] > score[1 - mine.team], draw: score[0] === score[1], scores: [score[0], score[1]], rows }), 2200);
      }

      // The heads-up display, ten times a second.
      if (now - lastHud > 100) {
        lastHud = now;
        setHud({
          left,
          red: score[0],
          blue: score[1],
          hopper,
          reloading: reloadUntil > t,
          out: mine.alive ? 0 : Math.max(0, mine.back - t),
          by: outBy,
          count: t < 0 ? Math.ceil(-t) : 0,
          feed: feed.slice(0, 4),
          hit: hitFlash,
          aiming: inp.aim,
          shield: mine.shield > t,
        });
        drawMap();
      }
    }
    function drawMap() {
      const cvs = mapRef.current;
      const g = cvs?.getContext("2d");
      if (!cvs || !g) return;
      const W = cvs.width;
      const H = cvs.height;
      const sx = W / (FIELD.hx * 2);
      const sz = H / (FIELD.hz * 2);
      g.clearRect(0, 0, W, H);
      g.fillStyle = "rgba(20,60,30,0.75)";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,0.55)";
      for (const s of shapes) {
        const x = (s.x + FIELD.hx) * sx;
        const z = (s.z + FIELD.hz) * sz;
        if (s.kind === "box") g.fillRect(x - (s.w * sx) / 2, z - (s.d * sz) / 2, s.w * sx, s.d * sz);
        else {
          g.beginPath();
          g.arc(x, z, (s.w / 2) * sx, 0, Math.PI * 2);
          g.fill();
        }
      }
      const eye = { x: mine.body.x, y: mine.body.y + RULES.eye, z: mine.body.z };
      for (const a of actors.values()) {
        if (!a.alive || a.id === me.id) continue;
        const friend = a.team === mine.team;
        if (!friend && segmentHit(shapes, eye, { x: a.body.x, y: a.body.y + 1.2, z: a.body.z })) continue;
        g.fillStyle = TEAM[a.team].css;
        g.beginPath();
        g.arc((a.body.x + FIELD.hx) * sx, (a.body.z + FIELD.hz) * sz, friend ? 3 : 3.5, 0, Math.PI * 2);
        g.fill();
      }
      // You: an arrow the way you look.
      const x = (mine.body.x + FIELD.hx) * sx;
      const z = (mine.body.z + FIELD.hz) * sz;
      g.save();
      g.translate(x, z);
      g.rotate(-mine.yaw);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(4, 4);
      g.lineTo(-4, 4);
      g.closePath();
      g.fill();
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
      if (net) net.onMsg = () => {};
      net?.status("wait");
      sc.dispose();
    };
  }, [shapes, start, net, me]);

  // ---- touch: left thumb moves, right thumb looks
  const touches = useRef(new Map<number, { side: "move" | "look"; x: number; y: number; ox: number; oy: number }>());
  function tDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    const w = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = e.clientX - w.left < w.width * 0.42 ? "move" : "look";
    touches.current.set(e.pointerId, { side, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
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
    if (tt?.side === "move") {
      input.current.mx = 0;
      input.current.mz = 0;
      setStick(null);
    }
  }
  const hold = (key: "fire" | "aim") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (key === "aim") input.current.aim = !input.current.aim;
      else input.current.fire = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (key === "fire") input.current.fire = false;
    },
    onPointerCancel: () => {
      if (key === "fire") input.current.fire = false;
    },
  });
  // The look drag can start on the FIRE button too (shoot while you turn).
  const fireLook = useRef<{ x: number; y: number } | null>(null);

  const m = Math.floor(hud.left / 60);
  const s = Math.floor(hud.left % 60);
  const flash = performance.now() - hud.hit < 220;
  if (failed) {
    return (
      <FullScreen onQuit={onQuit}>
        <div className="grid flex-1 place-items-center p-6 text-center text-white/70">This phone couldn&apos;t start the 3D field.</div>
      </FullScreen>
    );
  }
  return (
    <FullScreen onQuit={onQuit} quitLabel="Leave the match" className="select-none bg-black">
      <div className="relative flex-1 touch-none" onPointerDown={tDown} onPointerMove={tMove} onPointerUp={tUp} onPointerCancel={tUp} onContextMenu={(e) => e.preventDefault()}>
        <div ref={wrap} className="absolute inset-0" />

        {/* Score and time */}
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <div className="flex items-stretch overflow-hidden rounded-2xl bg-black/55 text-white shadow-lg backdrop-blur-sm">
            <span className="grid min-w-14 place-items-center px-3 text-2xl font-black tabular-nums" style={{ background: "rgba(224,49,49,.55)" }}>
              {hud.red}
            </span>
            <span className="grid place-items-center px-3">
              <b className="text-lg tabular-nums leading-none">
                {m}:{String(s).padStart(2, "0")}
              </b>
              <span className="text-[9px] font-black tracking-widest text-white/55">TO {RULES.target}</span>
            </span>
            <span className="grid min-w-14 place-items-center px-3 text-2xl font-black tabular-nums" style={{ background: "rgba(28,126,214,.55)" }}>
              {hud.blue}
            </span>
          </div>
        </div>

        {/* The map */}
        <canvas ref={mapRef} width={160} height={96} className="pointer-events-none absolute left-2 top-2 h-[72px] w-[120px] rounded-lg border border-white/20 shadow sm:h-24 sm:w-40" />

        {/* Who splatted whom */}
        <div className="pointer-events-none absolute right-2 top-14 space-y-1 text-right">
          {hud.feed.map((f) => (
            <p key={f.id} className="rounded-lg bg-black/50 px-2 py-0.5 text-[11px] font-bold text-white" style={{ borderRight: `3px solid ${TEAM[f.team].css}` }}>
              {f.text}
            </p>
          ))}
        </div>

        {/* Crosshair */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Crosshair className={cn("size-7 drop-shadow-[0_0_2px_rgba(0,0,0,.9)] transition", flash ? "scale-125 text-[#ff6b6b]" : "text-white/90", hud.aiming && "size-5")} strokeWidth={1.5} />
          {flash && <span className="absolute -inset-2 animate-ping rounded-full border-2 border-[#ff6b6b]" />}
        </div>

        {/* Countdown, out, shield */}
        {hud.count > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p key={hud.count} className="font-display text-8xl font-black text-white [text-shadow:0_6px_30px_rgba(0,0,0,.7)]">
              {hud.count}
            </p>
          </div>
        )}
        {hud.out > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#e03131]/20">
            <div className="rounded-3xl bg-black/60 px-6 py-4 text-center text-white backdrop-blur-sm">
              <p className="font-display text-3xl font-black">SPLAT!</p>
              <p className="text-sm text-white/75">{hud.by ? `${hud.by} got you.` : "You're out."} Back in {Math.ceil(hud.out)}…</p>
            </div>
          </div>
        )}
        {hud.shield && <p className="pointer-events-none absolute inset-x-0 top-[30%] text-center text-xs font-black tracking-widest text-white/80">PROTECTED</p>}

        {/* The move stick */}
        {stick && (
          <div className="pointer-events-none absolute size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-white/10" style={{ left: stick.x, top: stick.y }}>
            <span className="absolute left-1/2 top-1/2 size-12 rounded-full bg-white/60 shadow" style={{ transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))` }} />
          </div>
        )}
        {!stick && hud.count > 0 && <p className="pointer-events-none absolute bottom-24 left-6 text-xs font-bold text-white/70">Left thumb: move · Right thumb: look</p>}

        {/* Paint left */}
        <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-xl bg-black/50 px-3 py-1 text-center text-white">
          <b className="text-xl tabular-nums">{hud.reloading ? "…" : hud.hopper}</b>
          <span className="ml-1 text-[10px] font-black tracking-widest text-white/60">{hud.reloading ? "RELOADING" : "PAINT"}</span>
        </div>

        {/* Buttons */}
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-3 flex items-end gap-2">
          <div className="flex flex-col gap-2">
            <button {...hold("aim")} className={cn("grid size-14 place-items-center rounded-full text-[10px] font-black text-white shadow-lg backdrop-blur-sm", hud.aiming ? "bg-[#1c7ed6]" : "bg-black/45")}>
              AIM
            </button>
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                input.current.jump = true;
              }}
              className="grid size-14 place-items-center rounded-full bg-black/45 text-[10px] font-black text-white shadow-lg backdrop-blur-sm"
            >
              JUMP
            </button>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                input.current.reload = true;
              }}
              className="grid size-11 place-items-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm"
              aria-label="Reload"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              {...hold("fire")}
              onPointerMove={(e) => {
                // Drag on FIRE to turn while shooting.
                const p = fireLook.current;
                if (p) {
                  input.current.look.dx += (e.clientX - p.x) * 1.15;
                  input.current.look.dy += (e.clientY - p.y) * 1.15;
                }
                fireLook.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerLeave={() => (fireLook.current = null)}
              onPointerUpCapture={() => (fireLook.current = null)}
              className="grid size-24 place-items-center rounded-full bg-[#e03131]/85 text-white shadow-[0_6px_0_#a51d1d] active:translate-y-1 active:shadow-none"
            >
              <span className="text-center">
                <Swords className="mx-auto size-7" />
                <b className="text-xs tracking-widest">FIRE</b>
              </span>
            </button>
          </div>
        </div>
      </div>
    </FullScreen>
  );
}
