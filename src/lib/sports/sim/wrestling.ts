// Wrestling engine: entrances, then one fall. Momentum swings back and forth through
// strikes, whips, slams, high-flying moves, brawls on the outside, submission holds and pin
// attempts with near falls, until someone gets the three-count, taps out, is counted out or
// disqualified. Each wrestler has a signature move and a finisher with a silly local name.

import type { Rng } from "../rng";
import { fighterProfile, WRESTLING_HOLDS, type FighterProfile } from "../teams";
import { WRESTLING } from "../timeline";
import type { MatchEvent, MatchInfo, MatchResult, WrestlingFrame } from "../types";
import { clamp, lerp, makeSay } from "./common";

const STRIKES = ["chop", "forearm smash", "headbutt", "knee strike", "big boot", "superkick", "enziguri", "running knee", "discus punch", "open-hand slap"];
const GRAPPLES = ["body slam", "suplex", "DDT", "spinebuster", "powerbomb", "German suplex", "backbreaker", "neckbreaker", "piledriver", "sidewalk slam", "belly-to-belly", "chokeslam"];
const RUNNING = ["clothesline", "shoulder tackle", "spear", "dropkick", "back body drop", "crossbody", "flying forearm"];
const AERIAL = ["moonsault", "elbow drop from the top", "frog splash", "missile dropkick", "450 splash", "diving headbutt", "top-rope crossbody", "senton bomb"];
const HOLDS = ["sleeper hold", "Boston crab", "figure-four leg lock", "ankle lock", "crossface", "camel clutch", "armbar"];
const OUTSIDE = ["the steel steps", "the barricade", "the announce table", "the ring post"];

type W = {
  i: 0 | 1;
  name: string;
  short: string;
  p: FighterProfile;
  power: number;
  agility: number;
  tough: number;
  engine: number;
  tech: number;
  hp: number;
  mo: number;
  moves: number;
  big: number;
  usedSig: number;
  usedFin: number;
};

const L = {
  entrance: ["Making his way to the ring, from {town}... {name}!", "The crowd go wild as {name} comes out! {phrase}", "Here comes {name}, all the way from {town}!"],
  bell: ["The bell rings, here we go!", "Ding ding ding! We're under way.", "And this one is under way!"],
  move: ["{p} with a {move}!", "{p} hits {q} with a {move}!", "{move} from {p}!", "What a {move} by {p}!", "{p} plants {q} with a {move}."],
  strike: ["{p} lays in a {move}.", "Big {move} from {p}!", "{p} hits a {move}, the crowd go 'OOOH!'"],
  signature: ["{p} hits the {move}! That's the signature!", "Here it comes... the {move}!", "{p} sets up the {move}... and connects!"],
  finisher: ["{P} HITS THE {MOVE}!", "{p} calls for the {move}... AND HITS IT!", "THE {MOVE}! {p} nails it!"],
  cover: ["{p} goes for the cover...", "Cover by {p}!", "{p} hooks the leg..."],
  kick1: ["{q} kicks out at one.", "Only a one-count, {q} powers out."],
  near: ["NEAR FALL! {q} kicks out at two and a half!", "{q} kicks out at 2.9! Unbelievable!", "How did {q} kick out of that?!", "TWO! {q} gets the shoulder up just in time!"],
  miss: ["{p} goes up top... {q} moves! {p} crashes and burns!", "{p} flies off the top rope and hits nothing but canvas!", "{p} misses the {move}!"],
  counter: ["{q} reverses it!", "Counter by {q}!", "{q} sees it coming and turns it around!"],
  outside: ["They spill to the outside!", "{p} throws {q} over the top rope!", "{p} sends {q} into {thing}!", "{p} slams {q} on {thing}!"],
  count: ["The referee starts the count..."],
  back: ["{q} slides back in at {n}!", "{q} beats the count at {n}."],
  hold: ["{p} locks in the {move}!", "{q} is trapped in the {move}!", "{p} wrenches on the {move}!"],
  ropes: ["{q} gets to the ropes! The hold is broken.", "{q} drags himself to the ropes. Rope break!"],
  tap: ["{Q} TAPS OUT! {p} wins by submission!", "{q} has to tap! The {move} wins it for {p}!"],
  comeback: ["{p} is fired up! The crowd are behind him!", "{p} shakes off the punches... here comes the comeback!", "{p} is feeling it now!"],
  cheat: ["{p} pokes {q} in the eye behind the referee's back!", "{p} grabs a chair... the referee didn't see it!", "{p} uses the ropes for leverage, cheeky."],
  dq: ["The referee saw it! {p} is disqualified! {q} wins!", "That's a DQ! {p} hit {q} with a chair in full view of the referee!"],
  pin: ["ONE! TWO! THREE! {p} wins!", "One... two... THREE! It's over, {p} gets the win!", "THREE! {p} pins {q}!"],
  countout: ["{q} can't make it back in! {p} wins by count-out!"],
  rollup: ["Roll-up out of nowhere! ONE, TWO, THREE! {p} steals it!", "Small package! {p} gets the three-count from nowhere!"],
  taunt: ["{p} plays to the crowd.", "{p} tells {q}: {phrase}", "{p} poses on the turnbuckle. The crowd love it."],
  lockup: ["Collar-and-elbow tie-up in the middle.", "{p} and {q} lock up.", "{p} grabs a side headlock."],
};

const cap = (s: string) => s.toUpperCase();
/** How much each move hurts (tuned so most matches go 2-4 minutes of real time). */
const DAMAGE = 0.2;

export function simWrestling(match: MatchInfo, rng: Rng): { frames: WrestlingFrame[]; result: MatchResult } {
  const say = makeSay(rng);
  const frames: WrestlingFrame[] = [];
  const mk = (i: 0 | 1): W => {
    const side = i === 0 ? match.home : match.away;
    const p = fighterProfile("wrestling", side.name);
    const form = rng.normal() * 6;
    const r = (v: number) => clamp(v + form + rng.normal() * 2, 35, 99);
    return {
      i,
      name: side.name,
      short: side.short,
      p,
      power: r(p.power),
      agility: r(p.speed),
      tough: r(p.chin),
      engine: r(p.engine),
      tech: r(p.guard),
      hp: 100,
      mo: 10,
      moves: 0,
      big: 0,
      usedSig: 0,
      usedFin: 0,
    };
  };
  const A: [W, W] = [mk(0), mk(1)];
  let t = 0;
  let ph = 0;
  const pos = [500, -140, 90, 500, 1140, 270];
  let st = ["s", "s"];
  let pending: MatchEvent[] = [];
  let lastTalk = 0;

  const clock = () => (ph >= 1 ? ((Math.min(t, WRESTLING.latest) - WRESTLING.bell) * WRESTLING.speed) / 1000 : 0);
  const ev = (k: string, s: 0 | 1 | undefined, tx?: string, extra?: Partial<MatchEvent>) => {
    const e: MatchEvent = { k };
    if (s !== undefined) e.s = s;
    if (tx) {
      e.tx = tx;
      lastTalk = t;
    }
    if (extra) Object.assign(e, extra);
    pending.push(e);
  };
  function emit(extra?: Partial<WrestlingFrame>) {
    const f: WrestlingFrame = {
      t: Math.round(t),
      c: Math.round(clock()),
      ph,
      w: pos.map((v) => Math.round(v)),
      st: st.join(""),
      hp: [Math.round(A[0].hp), Math.round(A[1].hp)],
      mo: [Math.round(A[0].mo), Math.round(A[1].mo)],
      ...extra,
    };
    if (pending.length) {
      f.e = pending;
      pending = [];
    }
    const last = frames[frames.length - 1];
    if (last && f.t <= last.t) f.t = last.t + 1;
    frames.push(f);
  }
  const face = () => {
    const a = (Math.atan2(pos[4] - pos[1], pos[3] - pos[0]) * 180) / Math.PI;
    pos[2] = a;
    pos[5] = a + 180;
  };
  /** Moves both wrestlers to (x0,y0) and (x1,y1) over `dur`, with states, as one frame. */
  function to(x0: number, y0: number, x1: number, y1: number, dur: number, s0?: string, s1?: string, extra?: Partial<WrestlingFrame>) {
    t += dur;
    pos[0] = x0;
    pos[1] = y0;
    pos[3] = x1;
    pos[4] = y1;
    if (s0) st[0] = s0;
    if (s1) st[1] = s1;
    face();
    emit(extra);
  }
  const setMove = (who: 0 | 1, name: string, kind: number) => {
    const last = frames[frames.length - 1];
    if (last) last.mv = [who, name, kind];
  };
  const xy = (w: W) => [pos[w.i * 3], pos[w.i * 3 + 1]] as const;
  const near = (w: W, d = 60) => {
    const [x, y] = xy(w);
    const a = rng.range(0, Math.PI * 2);
    return [clamp(x + Math.cos(a) * d, 90, 910), clamp(y + Math.sin(a) * d, 90, 910)] as const;
  };
  function place(att: W, ax: number, ay: number, vx: number, vy: number, dur: number, sa?: string, sv?: string, extra?: Partial<WrestlingFrame>) {
    if (att.i === 0) to(ax, ay, vx, vy, dur, sa, sv, extra);
    else to(vx, vy, ax, ay, dur, sv, sa, extra);
  }
  const vars = (a: W, v: W, move = "") => ({
    p: a.short,
    q: v.short,
    P: cap(a.short),
    Q: cap(v.short),
    move,
    MOVE: cap(move),
    phrase: a.p.record,
    thing: rng.pick(OUTSIDE),
  });

  function hurt(v: W, amount: number) {
    v.hp = Math.max(0, v.hp - amount * DAMAGE * Math.pow(72 / v.tough, 0.6));
  }
  function gain(a: W, amount: number) {
    a.mo = clamp(a.mo + (amount > 0 ? amount * 0.6 : amount), 0, 100);
  }

  let finish: { winner: 0 | 1; how: "pin" | "sub" | "countout" | "dq"; move: string } | null = null;
  let lastBig = "";

  /** A pin attempt after a move of `power` (0 small .. 1 finisher). */
  function cover(a: W, v: W, power: number, quick = false) {
    const [vx, vy] = xy(v);
    if (!quick && rng.chance(0.6)) ev("cover", a.i, say(L.cover, vars(a, v)));
    place(a, vx + 18, vy + 6, vx, vy, 450, "p", "d");
    // Time running out makes everyone more desperate (and tired).
    const late = clamp((t - (WRESTLING.latest - 40_000)) / 30_000, 0, 1);
    const keep = clamp(v.hp / 100 + (v.tough - 70) / 160 + 0.12 - power * 0.42 - late * 0.4 + rng.normal() * 0.12, -1, 2);
    for (let n = 1; n <= 3; n++) {
      t += 460;
      if (n === 1 && keep > 0.85) {
        emit({ n, nk: "p" });
        ev("kickout", v.i, rng.chance(0.4) ? say(L.kick1, vars(a, v)) : undefined);
        const [x0, y0, x1, y1] = spread();
        place(a, x0, y0, x1, y1, 500, "s", "g");
        return false;
      }
      if (n === 3) {
        if (keep > 0) {
          // Kick-out right before three.
          ev("nearfall", v.i, power >= 0.5 || keep < 0.25 ? say(L.near, vars(a, v)) : undefined);
          emit({ n: 2, nk: "p" });
          gain(v, 6);
          const [x0, y0, x1, y1] = spread();
          place(a, x0, y0, x1, y1, 500, "g", "d");
          return false;
        }
        emit({ n: 3, nk: "p" });
        finish = { winner: a.i, how: "pin", move: lastBig };
        ev("pin", a.i, say(quick ? L.rollup : L.pin, vars(a, v)));
        return true;
      }
      emit({ n, nk: "p" });
    }
    return false;
  }
  /** Positions with the two a little apart (keeps the current order). */
  function spread(): [number, number, number, number] {
    const cx = clamp((pos[0] + pos[3]) / 2, 200, 800);
    const cy = clamp((pos[1] + pos[4]) / 2, 200, 800);
    const a = rng.range(0, Math.PI * 2);
    return [cx + Math.cos(a) * 70, cy + Math.sin(a) * 70, cx - Math.cos(a) * 70, cy - Math.sin(a) * 70];
  }

  function spot() {
    const [a0, a1] = A;
    // Who's in control: momentum, skill and luck.
    const pow = (w: W) => (w.p.rating + w.mo * 0.12) * (0.7 + (w.hp / 100) * 0.3) * (0.55 + rng.next() * 0.9);
    let att = pow(a0) >= pow(a1) ? a0 : a1;
    let vic = A[1 - att.i];
    const elapsed = t - WRESTLING.bell;
    const late = t > WRESTLING.latest - 45_000;
    // Counters.
    if (rng.chance(0.14 + (vic.tech - att.tech) / 400)) {
      ev("counter", vic.i, rng.chance(0.5) && t - lastTalk > 3000 ? say(L.counter, vars(att, vic)) : undefined);
      [att, vic] = [vic, att];
    }
    // Comeback: a wrestler down on momentum but still standing fires up.
    if (att.mo < 25 && vic.mo > 60 && att.hp > 30 && rng.chance(0.25)) {
      ev("comeback", att.i, say(L.comeback, vars(att, vic)));
      gain(att, 30);
    }
    const style = att.p.stance;
    const fin = att.mo >= 85 && rng.chance(late ? 0.85 : 0.6);
    const sig = !fin && att.mo >= 62 && rng.chance(0.45);
    const kind = fin
      ? "fin"
      : sig
        ? "sig"
        : ["strike", "whip", "grapple", "aerial", "outside", "hold", "lockup", "cheat", "taunt"][
            rng.weighted([
              style === "brawler" ? 1.4 : 1,
              0.75,
              style === "powerhouse" ? 1.3 : 0.9,
              style === "high-flyer" ? 0.7 : 0.18,
              elapsed > 30_000 ? (style === "brawler" ? 0.3 : 0.15) : 0,
              style === "technician" ? 0.45 : 0.18,
              elapsed < 30_000 ? 0.8 : 0.12,
              elapsed < 40_000 ? 0 : style === "brawler" ? 0.08 : 0.025,
              0.1,
            ])
          ];
    const [vx, vy] = xy(vic);
    att.moves++;
    switch (kind) {
      case "lockup": {
        const mx = clamp((vx + pos[att.i * 3]) / 2, 250, 750);
        const my = clamp((vy + pos[att.i * 3 + 1]) / 2, 250, 750);
        place(att, mx - 25, my, mx + 25, my, 700, "s", "s");
        if (t - lastTalk > 6000) ev("lockup", undefined, say(L.lockup, vars(att, vic)));
        place(att, mx - 20, my + 10, mx + 15, my - 5, 700, "s", "g");
        gain(att, 3);
        return;
      }
      case "taunt": {
        if (t - lastTalk > 4000) ev("taunt", att.i, say(L.taunt, vars(att, vic)));
        const [ax, ay] = near(vic, 140);
        place(att, ax, ay, vx, vy, 900, "s", vic.hp < 50 ? "d" : "g");
        gain(att, 5);
        return;
      }
      case "strike": {
        const n = rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const move = rng.pick(STRIKES);
          const [ax, ay] = near(vic, 55);
          place(att, ax, ay, vx + rng.range(-20, 20), vy + rng.range(-20, 20), 420, "s", "s");
          setMove(att.i, move, 0);
          if (k === n - 1 && rng.chance(0.4) && t - lastTalk > 3000) ev("move", att.i, say(L.strike, vars(att, vic, move)));
          hurt(vic, rng.range(1.5, 4) * (att.power / 70));
          gain(att, 3);
          gain(vic, -2);
        }
        place(att, pos[att.i * 3], pos[att.i * 3 + 1], vx, vy, 350, "s", vic.hp < 40 && rng.chance(0.5) ? "d" : "g");
        return;
      }
      case "whip": {
        // Irish whip into the ropes, then the running move.
        const side = rng.int(0, 3);
        const rx = side === 0 ? 30 : side === 1 ? 970 : rng.range(200, 800);
        const ry = side === 2 ? 30 : side === 3 ? 970 : rng.range(200, 800);
        place(att, pos[att.i * 3], pos[att.i * 3 + 1], rx, ry, 650, "s", "r");
        const mx = lerp(rx, 500, 0.45);
        const my = lerp(ry, 500, 0.45);
        const move = rng.pick(RUNNING);
        const hit = rng.chance(0.78);
        if (!hit) {
          // Ducks it and hits something back.
          const back = rng.pick(RUNNING);
          place(att, mx + 30, my + 20, mx - 30, my - 20, 450, "d", "s");
          setMove(vic.i, back, 0);
          if (t - lastTalk > 3500) ev("counter", vic.i, say(L.counter, vars(att, vic)));
          hurt(att, rng.range(4, 7));
          gain(vic, 10);
          return;
        }
        place(att, mx - 25, my, mx + 15, my, 500, "s", "d");
        setMove(att.i, move, move === "spear" ? 1 : 0);
        hurt(vic, rng.range(5, 9) * (att.power / 70));
        gain(att, 9);
        gain(vic, -4);
        if (rng.chance(0.45) && t - lastTalk > 2500) ev("move", att.i, say(L.move, vars(att, vic, move)));
        if (rng.chance(0.14 + (late ? 0.3 : 0))) cover(att, vic, 0.15);
        return;
      }
      case "grapple": {
        const move = rng.pick(GRAPPLES);
        const [ax, ay] = near(vic, 45);
        place(att, ax, ay, vx, vy, 600, "s", "s");
        place(att, ax, ay, clamp(vx + rng.range(-60, 60), 120, 880), clamp(vy + rng.range(-60, 60), 120, 880), 550, "s", "d");
        setMove(att.i, move, 1);
        const power = /bomb|driver|chokeslam/.test(move) ? 0.3 : 0.15;
        hurt(vic, rng.range(7, 12) * (att.power / 70) * (1 + power));
        gain(att, 10 + power * 15);
        gain(vic, -5);
        lastBig = move;
        if (rng.chance(0.5) && t - lastTalk > 2500) ev("move", att.i, say(L.move, vars(att, vic, move)));
        if (rng.chance(0.18 + power + (late ? 0.3 : 0))) cover(att, vic, power);
        return;
      }
      case "aerial": {
        // To the nearest corner, up top, and fly.
        const cx = pos[att.i * 3] < 500 ? 50 : 950;
        const cy = pos[att.i * 3 + 1] < 500 ? 50 : 950;
        place(att, cx, cy, vx, vy, 900, "t", "d");
        const move = rng.pick(AERIAL);
        const hits = rng.chance(0.68 + (att.agility - 70) / 200);
        if (!hits) {
          place(att, lerp(cx, vx, 0.75), lerp(cy, vy, 0.75), clamp(vx + 110, 100, 900), clamp(vy + 70, 100, 900), 600, "d", "g");
          setMove(att.i, move, 2);
          ev("miss", att.i, say(L.miss, vars(att, vic, move)));
          hurt(att, rng.range(6, 10));
          gain(att, -15);
          gain(vic, 12);
          return;
        }
        place(att, vx + 12, vy + 8, vx, vy, 650, "p", "d");
        setMove(att.i, move, 2);
        hurt(vic, rng.range(9, 15));
        gain(att, 14);
        lastBig = move;
        if (t - lastTalk > 2500) ev("move", att.i, say(L.move, vars(att, vic, move)));
        cover(att, vic, 0.3);
        return;
      }
      case "outside": {
        // Over the top rope and a brawl on the floor.
        const side = rng.chance(0.5) ? -1 : 1;
        const fy = side < 0 ? -150 : 1150;
        const fx = rng.range(150, 850);
        place(att, pos[att.i * 3], side < 0 ? 40 : 960, fx, side < 0 ? -40 : 1040, 700, "s", "d");
        place(att, fx - 50, fy, fx + 30, fy + side * 20, 700, "s", "g");
        ev("outside", att.i, say(L.outside, vars(att, vic)));
        hurt(vic, rng.range(6, 10));
        gain(att, 8);
        ev("count", undefined, say(L.count, vars(att, vic)));
        let n = 0;
        // The attacker gets back in first; will the victim beat the count?
        const backAt = vic.hp < 22 && rng.chance(0.22) ? 11 : clamp(Math.round(9 - (vic.hp / 100) * 5 - rng.range(0, 3)), 3, 9);
        for (n = 1; n <= 10; n++) {
          if (n === 2) place(att, fx, side < 0 ? 60 : 940, fx + 30, fy, 450, "s", "g", { n, nk: "o" });
          else {
            t += 450;
            emit({ n, nk: "o" });
          }
          if (n === backAt) break;
        }
        if (n > 10) {
          finish = { winner: att.i, how: "countout", move: "" };
          ev("countout", att.i, say(L.countout, vars(att, vic)));
          return;
        }
        ev("back", vic.i, say(L.back, { ...vars(att, vic), n: backAt }));
        place(att, fx, side < 0 ? 200 : 800, fx + 40, side < 0 ? 80 : 920, 600, "s", "d");
        return;
      }
      case "hold": {
        const move = att.usedSig === 0 && WRESTLING_HOLDS.includes(att.p.signature) && rng.chance(0.4) ? att.p.signature : rng.pick(HOLDS);
        place(att, vx + 14, vy + 10, vx, vy, 600, "h", "d");
        setMove(att.i, move, 5);
        ev("hold", att.i, say(L.hold, vars(att, vic, move)));
        // Tension builds; break or tap.
        const late2 = t > WRESTLING.latest - 30_000;
        const resist = vic.hp / 100 + (vic.tough - 70) / 150 + rng.normal() * 0.15 - (late2 ? 0.3 : 0);
        const tapAt = resist < 0.12 ? rng.int(3, 5) : 99;
        const breakAt = rng.int(2, 5);
        for (let n = 1; n <= 5; n++) {
          t += 520;
          hurt(vic, 1.5);
          emit({ n, nk: "s" });
          if (n === tapAt) {
            finish = { winner: att.i, how: "sub", move };
            ev("tap", att.i, say(L.tap, vars(att, vic, move)));
            return;
          }
          if (n === breakAt) break;
        }
        ev("ropes", vic.i, say(L.ropes, vars(att, vic)));
        place(att, vx + 60, vy - 40, clamp(vx > 500 ? 940 : 60, 60, 940), vy, 600, "s", "g");
        gain(att, 6);
        return;
      }
      case "cheat": {
        const seen = rng.chance(0.055);
        const [ax, ay] = near(vic, 50);
        place(att, ax, ay, vx, vy, 600, "s", "d");
        setMove(att.i, rng.chance(0.5) ? "chair shot" : "eye poke", 0);
        if (seen) {
          finish = { winner: vic.i, how: "dq", move: "" };
          ev("dq", vic.i, say(L.dq, vars(att, vic)));
          return;
        }
        ev("cheat", att.i, say(L.cheat, vars(att, vic)));
        hurt(vic, rng.range(8, 12));
        gain(att, 12);
        if (rng.chance(0.5)) cover(att, vic, 0.35);
        return;
      }
      case "sig":
      case "fin": {
        const move = kind === "fin" ? att.p.finisher : att.p.signature;
        const holdMove = WRESTLING_HOLDS.includes(move);
        const [ax, ay] = near(vic, 45);
        place(att, ax, ay, vx, vy, 650, "s", "g");
        // Big moves can be countered too.
        if (rng.chance(kind === "fin" ? 0.16 : 0.12) && att.usedFin + att.usedSig > 0) {
          ev("counter", vic.i, say(L.counter, vars(att, vic)));
          place(att, ax + 40, ay + 40, vx, vy, 500, "d", "s");
          gain(att, -25);
          gain(vic, 15);
          return;
        }
        if (holdMove) {
          att.usedSig++;
          att.big++;
          place(att, vx + 14, vy + 10, vx, vy, 600, "h", "d");
          setMove(att.i, move, 3);
          ev("hold", att.i, say(L.signature, vars(att, vic, move)));
          const resist = vic.hp / 100 + (vic.tough - 70) / 150 + rng.normal() * 0.15;
          for (let n = 1; n <= 5; n++) {
            t += 520;
            hurt(vic, 2.5);
            emit({ n, nk: "s" });
            if (resist < 0.3 && n === 4) {
              finish = { winner: att.i, how: "sub", move };
              ev("tap", att.i, say(L.tap, vars(att, vic, move)));
              return;
            }
          }
          ev("ropes", vic.i, say(L.ropes, vars(att, vic)));
          place(att, vx + 60, vy - 40, vx > 500 ? 940 : 60, vy, 600, "s", "d");
          gain(att, -20);
          return;
        }
        place(att, ax, ay, clamp(vx + rng.range(-50, 50), 150, 850), clamp(vy + rng.range(-50, 50), 150, 850), 650, "s", "d");
        setMove(att.i, move, kind === "fin" ? 4 : 3);
        lastBig = move;
        if (kind === "fin") {
          att.usedFin++;
          ev("finisher", att.i, say(L.finisher, vars(att, vic, move)));
          hurt(vic, rng.range(16, 24));
          att.mo = 20;
        } else {
          att.usedSig++;
          ev("signature", att.i, say(L.signature, vars(att, vic, move)));
          hurt(vic, rng.range(10, 16));
          att.mo = Math.max(30, att.mo - 30);
        }
        att.big++;
        cover(att, vic, kind === "fin" ? 1 : 0.55);
        return;
      }
    }
  }

  // ------------------------------------------------------------ the match
  // Entrances: one at a time down the ramp, then the bell.
  st = ["s", "s"];
  emit();
  t = 600;
  ev("entrance", 0, say(L.entrance, { name: A[0].name, town: A[0].p.hometown, phrase: A[0].p.record }));
  emit();
  for (let k = 1; k <= 4; k++) {
    t += 1000;
    pos[1] = lerp(-140, 260, k / 4);
    pos[0] = 500 - k * 30;
    face();
    emit();
  }
  t = 5600;
  ev("entrance", 1, say(L.entrance, { name: A[1].name, town: A[1].p.hometown, phrase: A[1].p.record }));
  emit();
  for (let k = 1; k <= 5; k++) {
    t += 1000;
    pos[4] = lerp(1140, 700, k / 5);
    pos[3] = 500 + k * 25;
    face();
    emit();
  }
  t = WRESTLING.bell;
  ph = 1;
  ev("bell", undefined, say(L.bell, {}));
  to(420, 470, 580, 530, 0, "s", "s");

  while (!finish && t < WRESTLING.latest - 6000) {
    spot();
    // Regain energy a little between spots.
    for (const w of A) w.hp = Math.min(100, w.hp + 0.25 * (w.engine / 70));
    if (!finish && st.includes("d") && rng.chance(0.65)) {
      // Back to their feet.
      const [x0, y0, x1, y1] = spread();
      to(x0, y0, x1, y1, 650, "s", "s");
    }
  }
  if (!finish) {
    // Out of time? Someone sneaks a roll-up.
    const winner = A[0].hp + A[0].mo * 0.3 + rng.normal() * 10 > A[1].hp + A[1].mo * 0.3 ? A[0] : A[1];
    const loser = A[1 - winner.i];
    cover(winner, loser, 2, true);
    if (!finish) {
      finish = { winner: winner.i, how: "pin", move: "roll-up" };
      t += 300;
      emit({ n: 3, nk: "p" });
      ev("pin", winner.i, say(L.rollup, vars(winner, loser)));
    }
  }
  const fin = finish as { winner: 0 | 1; how: "pin" | "sub" | "countout" | "dq"; move: string };
  const w = A[fin.winner];
  const l = A[1 - fin.winner];
  const endClock = clock();
  ph = 2;
  ev("final", fin.winner, undefined, {
    st: [
      [A[0].moves, A[0].big, Math.round(A[0].hp)],
      [A[1].moves, A[1].big, Math.round(A[1].hp)],
    ],
    sl: ["Moves", "Big moves", "Energy left"],
  });
  st = fin.winner === 0 ? ["s", "d"] : ["d", "s"];
  t += 500;
  emit();
  // The winner celebrates on the turnbuckles.
  const corners = [
    [60, 60],
    [940, 60],
    [940, 940],
    [60, 940],
  ];
  let k = 0;
  while (t < WRESTLING.end - 1500) {
    const c = corners[k++ % 4];
    const dur = Math.min(1600, WRESTLING.end - 300 - t);
    if (fin.winner === 0) to(c[0], c[1], pos[3], pos[4], dur, k % 2 ? "t" : "s", k > 2 ? "g" : "d");
    else to(pos[0], pos[1], c[0], c[1], dur, k > 2 ? "g" : "d", k % 2 ? "t" : "s");
  }

  const mm = Math.floor(endClock / 60);
  const ss = String(Math.floor(endClock % 60)).padStart(2, "0");
  const time = `${mm}:${ss}`;
  const how =
    fin.how === "pin" ? "Pinfall" : fin.how === "sub" ? "Submission" : fin.how === "countout" ? "Count-out" : "Disqualification";
  const detail =
    fin.how === "pin"
      ? fin.move === "roll-up"
        ? `${w.name} rolled up ${l.name} for the three-count`
        : `${w.name} pinned ${l.name}${fin.move ? ` after the ${fin.move}` : ""}`
      : fin.how === "sub"
        ? `${l.name} tapped out to ${w.name}'s ${fin.move}`
        : fin.how === "countout"
          ? `${l.name} was counted out, ${w.name} wins`
          : `${l.name} was disqualified, ${w.name} wins`;
  return { frames, result: { winner: fin.winner === 0 ? "home" : "away", score: `${how} · ${time}`, summary: `${detail} (${time}).` } };
}
