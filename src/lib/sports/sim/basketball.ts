// Basketball game engine: four quarters (and overtime if it's level), possession by
// possession. Bring the ball up, swing it, drive, shoot twos and threes, free throws,
// blocks, steals, rebounds, fast breaks and the odd buzzer-beater.

import type { Rng } from "../rng";
import { teamProfile } from "../teams";
import { BASKETBALL } from "../timeline";
import type { BasketballFrame, MatchEvent, MatchInfo, MatchResult } from "../types";
import { clamp, lerp, makeSay, surname } from "./common";

const W = 280;
const H = 150;
const CY = 75;
const RIM_IN = 16;

type Player = { name: string; num: number; skill: number; three: number; size: number; pts: number };

type Team = {
  i: 0 | 1;
  name: string;
  short: string;
  roster: Player[];
  /** Roster index on court per slot (0 PG .. 4 C). */
  on: number[];
  off: number;
  def: number;
  threes: number;
  pace: number;
  dir: 1 | -1;
  fouls: number;
  st: { paint: number; threes: number; fts: number; reb: number; stl: number; blk: number; tov: number; lead: number };
};

const L = {
  tip: ["{p} wins the tip for {team}!", "Tip-off! {team} control it.", "We're under way, {team} with the first possession."],
  three: ["{p} from downtown... BANG!", "Splash! {p} drains the three.", "{p} pulls up from deep and buries it!", "Three ball, {p}, nothing but net!", "{p} from the corner... GOOD!"],
  dunk: ["{p} throws it DOWN!", "Monster slam from {p}!", "{p} rises and hammers it home!", "Posterised! {p} dunks on {d}!"],
  layup: ["{p} lays it in.", "Smooth finish from {p} at the rim.", "{p} with the reverse layup!", "{p} spins and scores."],
  mid: ["{p} with the pull-up jumper.", "Fadeaway from {p}... good!", "{p} hits the mid-range shot."],
  block: ["REJECTED! {d} swats {p}'s shot!", "Get that outta here! {d} blocks {p}.", "{d} with the big block on {p}!"],
  steal: ["{d} picks {p}'s pocket!", "Stolen by {d}!", "{d} jumps the passing lane!"],
  andOne: ["And one! {p} scores through the contact.", "{p} scores AND gets fouled!"],
  ftBoth: ["{p} knocks down both free throws.", "Two from the line for {p}."],
  ftMiss: ["{p} misses at the line.", "{p} leaves one short."],
  run: ["{n}–0 run for {team}! Timeout called.", "{team} on a {n}–0 run. The crowd are loving it."],
  lead: ["{team} take the lead!", "Lead change! {team} in front."],
  quarter: ["End of the {q}: {home} {s0}–{s1} {away}.", "That's the {q}. {home} {s0}–{s1} {away}."],
  half: ["Half-time: {home} {s0}–{s1} {away}."],
  buzzer: ["AT THE BUZZER! {p} hits it from way downtown!", "{p} heaves it from half-court... IT'S GOOD!"],
  heaveMiss: ["{p} heaves it at the buzzer, no good."],
  ot: ["Level at the end of regulation! We're going to overtime!"],
  final: ["That's the game! {home} {s0}–{s1} {away}.", "Final buzzer: {home} {s0}–{s1} {away}."],
  winner: ["{p} wins it at the buzzer! {team} take it!"],
  sub: ["{on} checks in for {off}.", "{team} bring on {on} for {off}."],
  fast: ["{team} on the fast break!", "Coast to coast for {p}!"],
};

const QUARTER_NAMES = ["first quarter", "second quarter", "third quarter", "fourth quarter", "overtime"];

export function simBasketball(match: MatchInfo, rng: Rng): { frames: BasketballFrame[]; result: MatchResult } {
  const say = makeSay(rng);
  const frames: BasketballFrame[] = [];
  const pos = new Float64Array(20);
  const tgt = new Float64Array(20);

  function makeTeam(i: 0 | 1): Team {
    const side = i === 0 ? match.home : match.away;
    const prof = teamProfile("basketball", side.name);
    const form = rng.normal() * 4 + (i === 0 ? 1 : 0);
    const roster: Player[] = prof.roster.map((name, k) => {
      const role = k % 5;
      return {
        name,
        num: prof.numbers[k],
        skill: prof.att + form + rng.normal() * 4 - (k >= 5 ? 4 : 0),
        three: clamp(0.5 + prof.style * 0.3 - role * 0.12 + rng.normal() * 0.1, 0.02, 0.85),
        size: role,
        pts: 0,
      };
    });
    return {
      i,
      name: side.name,
      short: side.short,
      roster,
      on: [0, 1, 2, 3, 4],
      off: prof.att + form,
      def: prof.def + form,
      threes: prof.style,
      pace: 0.88 + prof.gk / 400,
      dir: i === 0 ? 1 : -1,
      fouls: 0,
      st: { paint: 0, threes: 0, fts: 0, reb: 0, stl: 0, blk: 0, tov: 0, lead: 0 },
    };
  }
  const teams: [Team, Team] = [makeTeam(0), makeTeam(1)];

  let t = 0;
  let q = 0;
  let ph = 0;
  let qs = 0;
  let qe = 1;
  let qSec = 720;
  const score = [0, 0];
  let bx = W / 2;
  let by = CY;
  let bh = 0;
  let handler = -1;
  let off: 0 | 1 = 0;
  let pending: MatchEvent[] = [];
  let run = { team: -1, pts: 0 };
  let lastTalk = 0;

  const teamOf = (k: number): 0 | 1 => (k < 5 ? 0 : 1);
  const player = (k: number) => {
    const tm = teams[teamOf(k)];
    return tm.roster[tm.on[k % 5]];
  };
  const nameOf = (k: number) => surname(player(k).name);
  const rimX = (tm: Team) => (tm.dir > 0 ? W - RIM_IN : RIM_IN);
  const clock = () => clamp(qSec * (1 - (t - qs) / (qe - qs)), 0, qSec);
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
  function emit() {
    const p = new Array<number>(20);
    for (let k = 0; k < 20; k++) p[k] = Math.round(pos[k]);
    const f: BasketballFrame = {
      t: Math.round(t),
      q,
      c: Math.round(clock() * 10) / 10,
      ph,
      p,
      b: [Math.round(bx), Math.round(by), Math.round(bh)],
      k: handler,
      s: [score[0], score[1]],
    };
    if (pending.length) {
      f.e = pending;
      pending = [];
    }
    const last = frames[frames.length - 1];
    if (last && f.t <= last.t) f.t = last.t + 1;
    frames.push(f);
  }
  const setAction = (a: string) => {
    const last = frames[frames.length - 1];
    if (last) last.a = a;
  };

  // Offensive spots from the attacking baseline: [distance from baseline, lateral].
  const SETS: [number, number][][] = [
    [[78, 75], [50, 18], [50, 132], [14, 30], [22, 100]],
    [[80, 60], [8, 10], [8, 140], [45, 110], [20, 55]],
    [[72, 92], [56, 28], [30, 140], [18, 48], [26, 96]],
    [[68, 75], [36, 14], [62, 125], [40, 75], [16, 92]],
  ];
  let set = SETS[0];
  const toX = (tm: Team, u: number) => (tm.dir > 0 ? W - u : u);

  function formation(transition: number) {
    const o = teams[off];
    const d = teams[1 - off];
    const rx = rimX(o);
    for (let s = 0; s < 5; s++) {
      const ko = o.i * 5 + s;
      const kd = d.i * 5 + s;
      const [u, v] = set[s];
      let ox = toX(o, u) + rng.normal() * 6;
      let oy = v + rng.normal() * 6;
      if (transition > 0) {
        ox = lerp(ox, W / 2 - o.dir * 10, transition);
        oy = lerp(oy, CY + (s - 2) * 22, transition * 0.5);
      }
      tgt[2 * ko] = clamp(ox, 4, W - 4);
      tgt[2 * ko + 1] = clamp(oy, 4, H - 4);
      // Man-to-man: between the man and the rim.
      const dx = rx - tgt[2 * ko];
      const dy = CY - tgt[2 * ko + 1];
      const l = Math.hypot(dx, dy) || 1;
      const gap = 9 + (transition > 0 ? 10 : 0);
      tgt[2 * kd] = tgt[2 * ko] + (dx / l) * gap + rng.normal() * 3;
      tgt[2 * kd + 1] = tgt[2 * ko + 1] + (dy / l) * gap + rng.normal() * 3;
    }
  }

  function settle(dur: number, overrides?: () => void) {
    overrides?.();
    const k = 1 - Math.exp(-dur / 380);
    for (let j = 0; j < 20; j++) pos[j] += (tgt[j] - pos[j]) * k;
    if (handler >= 0) {
      pos[2 * handler] = bx;
      pos[2 * handler + 1] = by;
    }
  }

  function moveBall(x: number, y: number, h: number, to: number, dur: number, overrides?: () => void) {
    t += dur;
    bx = x;
    by = y;
    bh = h;
    handler = to;
    settle(dur, overrides);
    if (to >= 0) {
      bx = pos[2 * to];
      by = pos[2 * to + 1];
    }
    emit();
  }

  function addPoints(k: number, n: number) {
    const s = teamOf(k);
    const before = score[s] - score[1 - s];
    score[s] += n;
    player(k).pts += n;
    const lead = score[s] - score[1 - s];
    teams[s].st.lead = Math.max(teams[s].st.lead, lead);
    if (run.team === s) run.pts += n;
    else run = { team: s, pts: n };
    if (before <= 0 && lead > 0 && q >= 2 && t - lastTalk > 6000 && rng.chance(0.5)) ev("lead", s, say(L.lead, { team: teams[s].name }));
    if (run.pts >= 8 && run.pts - n < 8) ev("run", s, say(L.run, { team: teams[s].name, n: run.pts }));
  }

  /** Shooter weights: skill, with stars getting more shots. */
  function pickShooter(tm: Team): number {
    const w = tm.on.map((r) => Math.exp((tm.roster[r].skill - tm.off) / 9));
    return tm.i * 5 + rng.weighted(w);
  }

  function inbound(side: 0 | 1, afterScore: boolean) {
    off = side;
    const tm = teams[side];
    // The ball comes in from under the other basket (after a score) or a rebound spot.
    const ownBase = tm.dir > 0 ? 6 : W - 6;
    set = rng.pick(SETS);
    formation(0.85);
    const pg = side * 5;
    if (afterScore) {
      const inb = side * 5 + 3;
      bx = ownBase;
      by = CY + 20;
      handler = inb;
      t += 300;
      settle(300, () => {
        tgt[2 * inb] = ownBase;
        tgt[2 * inb + 1] = CY + 20;
        tgt[2 * pg] = ownBase + tm.dir * 30;
        tgt[2 * pg + 1] = CY - 10;
      });
      emit();
      setAction("p");
      moveBall(pos[2 * pg], pos[2 * pg + 1], 0, pg, 260);
    }
  }

  // ------------------------------------------------------------ one possession

  function shoot(k: number, kind: "3" | "2" | "paint" | "dunk" | "heave", fouled = false) {
    const tm = teams[teamOf(k)];
    const opp = teams[1 - tm.i];
    const pl = player(k);
    const rx = rimX(tm);
    const skill = (pl.skill - opp.def) / 260;
    let p =
      kind === "3" ? 0.37 + skill + (pl.three - 0.4) * 0.12 : kind === "2" ? 0.43 + skill : kind === "paint" ? 0.6 + skill : kind === "dunk" ? 0.9 : 0.12;
    p = clamp(p, 0.05, 0.95);
    const shooterName = nameOf(k);
    const defender = (1 - tm.i) * 5 + (k % 5);
    const dName = nameOf(defender);
    // Blocks on shots near the rim.
    if ((kind === "paint" || kind === "2") && rng.chance(kind === "paint" ? 0.075 : 0.03)) {
      opp.st.blk++;
      setAction(kind === "paint" ? "s2" : "s2");
      const lx = clamp(bx + rng.range(-40, 40), 10, W - 10);
      const ly = clamp(by + rng.range(-40, 40), 10, H - 10);
      ev("block", opp.i, say(L.block, { p: shooterName, d: dName }));
      moveBall(lx, ly, 6, -1, 380);
      rebound(tm.i, 0.35, lx, ly);
      return;
    }
    const three = kind === "3" || kind === "heave";
    const fly = kind === "heave" ? 900 : three ? 640 : kind === "2" ? 540 : 380;
    setAction(three ? "s3" : "s2");
    const made = rng.chance(p);
    const foul = !fouled && kind !== "heave" && rng.chance(kind === "paint" || kind === "dunk" ? 0.17 : 0.05);
    if (made) {
      moveBall(rx, CY, 30, -1, fly);
      setAction("m");
      const pts = three ? 3 : 2;
      addPoints(k, pts);
      if (kind === "paint" || kind === "dunk") tm.st.paint += 2;
      if (three) tm.st.threes++;
      const vars = { p: shooterName, d: dName, team: tm.name };
      const line =
        kind === "heave" ? say(L.buzzer, vars) : foul ? say(L.andOne, vars) : three && rng.chance(0.55) ? say(L.three, vars) : kind === "dunk" ? say(L.dunk, vars) : kind === "paint" && rng.chance(0.2) ? say(L.layup, vars) : kind === "2" && rng.chance(0.15) ? say(L.mid, vars) : undefined;
      ev(three ? "three" : kind === "dunk" ? "dunk" : "score", tm.i, line, { n: pts });
      t += 260;
      bx = rx;
      by = CY;
      bh = 0;
      emit();
      if (foul) {
        freeThrows(k, 1);
        return;
      }
      if (q > 0 && t < qe) inbound(opp.i, true);
      return;
    }
    if (foul) {
      moveBall(rx + rng.range(-8, 8), CY + rng.range(-8, 8), 26, -1, fly);
      freeThrows(k, three ? 3 : 2);
      return;
    }
    moveBall(rx - tm.dir * rng.range(-3, 6), CY + rng.range(-7, 7), 30, -1, fly);
    if (kind === "heave") ev("miss", tm.i, say(L.heaveMiss, { p: shooterName }));
    rebound(tm.i, 0.26, rx, CY);
  }

  function rebound(shooting: 0 | 1, offShare: number, x: number, y: number) {
    if (t >= qe) return;
    const offTeam = teams[shooting];
    const rx = x;
    const ang = rng.range(0, Math.PI * 2);
    const r = rng.range(15, 45);
    const lx = clamp(rx - offTeam.dir * Math.abs(Math.cos(ang)) * r, 8, W - 8);
    const ly = clamp(y + Math.sin(ang) * r, 8, H - 8);
    const offensive = rng.chance(offShare);
    const side = offensive ? shooting : ((1 - shooting) as 0 | 1);
    const tm = teams[side];
    const w = [0.5, 0.6, 0.9, 1.6, 2.2].map((b, s) => b * (1 / (1 + Math.hypot(pos[2 * (side * 5 + s)] - lx, pos[2 * (side * 5 + s) + 1] - ly) / 30)));
    const k = side * 5 + rng.weighted(w);
    tm.st.reb++;
    setAction("r");
    off = side;
    moveBall(lx, ly, 0, k, 330, () => {
      tgt[2 * k] = lx;
      tgt[2 * k + 1] = ly;
    });
    if (offensive && rng.chance(0.4)) {
      shoot(k, "paint");
      return;
    }
    if (!offensive) {
      if (rng.chance(0.12)) return fastBreak(k);
      set = rng.pick(SETS);
    }
  }

  function freeThrows(k: number, n: number) {
    const tm = teams[teamOf(k)];
    const opp = teams[1 - tm.i];
    const rx = rimX(tm);
    const fx = rx - tm.dir * 42;
    // Line up on the lane.
    for (let s = 0; s < 5; s++) {
      const a = tm.i * 5 + s;
      const b = opp.i * 5 + s;
      if (a === k) {
        tgt[2 * a] = fx - tm.dir * 4;
        tgt[2 * a + 1] = CY;
      } else {
        tgt[2 * a] = rx - tm.dir * (s < 2 ? 70 : 12 + s * 7);
        tgt[2 * a + 1] = s < 2 ? CY + (s ? 40 : -40) : CY + (s % 2 ? 26 : -26);
      }
      tgt[2 * b] = rx - tm.dir * (s < 1 ? 66 : 8 + s * 7);
      tgt[2 * b + 1] = s < 1 ? CY : CY + (s % 2 ? -26 : 26);
    }
    handler = k;
    bx = fx;
    by = CY;
    bh = 0;
    t += 700;
    settle(900);
    emit();
    const pl = player(k);
    const pFt = clamp(0.76 + (pl.skill - 75) / 150 - pl.size * 0.025, 0.45, 0.94);
    let made = 0;
    let lastOk = false;
    for (let i = 0; i < n; i++) {
      setAction("ft");
      const ok = rng.chance(pFt);
      lastOk = ok;
      t += 600;
      bx = rx;
      by = CY;
      bh = 30;
      handler = -1;
      emit();
      if (ok) {
        made++;
        addPoints(k, 1);
        tm.st.fts++;
        setAction("m");
        ev("ft", tm.i, undefined, { n: 1 });
      }
      t += 300;
      bh = 0;
      if (i < n - 1) {
        bx = fx;
        handler = k;
      }
      emit();
    }
    if (n >= 2 && rng.chance(0.35)) ev("chat", tm.i, made === n ? say(L.ftBoth, { p: nameOf(k) }) : say(L.ftMiss, { p: nameOf(k) }));
    if (t >= qe) return;
    if (lastOk) {
      inbound(opp.i, true);
      return;
    }
    rebound(tm.i, 0.13, rx, CY);
  }

  function fastBreak(k: number) {
    const tm = teams[teamOf(k)];
    off = tm.i;
    const rx = rimX(tm);
    if (rng.chance(0.4)) ev("fast", tm.i, say(L.fast, { team: tm.name, p: nameOf(k) }));
    setAction("d");
    const tx = rx - tm.dir * 18;
    moveBall(tx, CY + rng.range(-15, 15), 0, k, 900, () => {
      for (let s = 0; s < 5; s++) {
        const a = tm.i * 5 + s;
        const b = (1 - tm.i) * 5 + s;
        tgt[2 * a] = lerp(pos[2 * a], rx - tm.dir * rng.range(30, 90), 0.7);
        tgt[2 * a + 1] = pos[2 * a + 1];
        tgt[2 * b] = lerp(pos[2 * b], rx - tm.dir * rng.range(10, 70), 0.6);
        tgt[2 * b + 1] = lerp(pos[2 * b + 1], CY, 0.3);
      }
      tgt[2 * k] = tx;
      tgt[2 * k + 1] = CY;
    });
    shoot(k, player(k).size >= 2 && rng.chance(0.45) ? "dunk" : "paint");
  }

  function possession() {
    const tm = teams[off];
    const opp = teams[1 - off];
    const pace = tm.pace;
    if (handler < 0 || teamOf(handler) !== off) handler = off * 5;
    // Bring it up.
    formation(0);
    setAction("d");
    const top = handler;
    moveBall(toX(tm, set[top % 5][0]), set[top % 5][1], 0, top, 470 / pace);
    if (t >= qe) return;
    // Turnover?
    if (rng.chance(0.12 + (opp.def - tm.off) / 700)) {
      tm.st.tov++;
      if (rng.chance(0.55)) {
        const d = opp.i * 5 + rng.int(0, 4);
        opp.st.stl++;
        if (rng.chance(0.55)) ev("steal", opp.i, say(L.steal, { d: nameOf(d), p: nameOf(handler) }));
        setAction("p");
        const sx = lerp(bx, pos[2 * d], 0.6);
        const sy = lerp(by, pos[2 * d + 1], 0.6);
        moveBall(sx, sy, 0, d, 300, () => {
          tgt[2 * d] = sx;
          tgt[2 * d + 1] = sy;
        });
        off = opp.i;
        if (rng.chance(0.5)) fastBreak(d);
        return;
      }
      // Out of bounds / travel: whistle and the other team inbounds from the side.
      t += 500;
      handler = -1;
      emit();
      off = opp.i;
      handler = opp.i * 5;
      bx = W / 2;
      by = 4;
      formation(0.6);
      settle(500);
      t += 500;
      emit();
      return;
    }
    // Swing it around until it reaches the shooter.
    const shooter = pickShooter(tm);
    const passes = rng.weighted([0.25, 0.35, 0.28, 0.12]);
    for (let i = 0; i < passes && t < qe; i++) {
      let r = off * 5 + rng.int(0, 4);
      if (r === handler) r = off * 5 + ((r % 5) + 1) % 5;
      if (i === passes - 1) r = shooter === handler ? off * 5 + ((shooter % 5) + 2) % 5 : shooter;
      formation(0);
      setAction("p");
      moveBall(pos[2 * r], pos[2 * r + 1], 0, r, 300 / pace);
    }
    if (t >= qe) return;
    const k = handler;
    const pl = player(k);
    const rx = rimX(tm);
    // Shot choice: threes, mid-range or attack the rim.
    const three = clamp(pl.three * (0.8 + tm.threes * 0.5), 0.02, 0.8);
    const kindIdx = rng.weighted([three, 0.17, 1 - three]);
    if (kindIdx === 0) {
      const ang = rng.range(-1.35, 1.35);
      const sx = rx - tm.dir * Math.cos(ang) * 71;
      const sy = clamp(CY + Math.sin(ang) * 71, 8, H - 8);
      setAction("d");
      moveBall(sx, sy, 0, k, 300, () => {
        formation(0);
        tgt[2 * k] = sx;
        tgt[2 * k + 1] = sy;
      });
      if (t < qe) shoot(k, "3");
      return;
    }
    if (kindIdx === 1) {
      const ang = rng.range(-1.2, 1.2);
      const r = rng.range(32, 52);
      const sx = rx - tm.dir * Math.cos(ang) * r;
      const sy = CY + Math.sin(ang) * r;
      setAction("d");
      moveBall(sx, sy, 0, k, 300, () => {
        formation(0);
        tgt[2 * k] = sx;
        tgt[2 * k + 1] = sy;
      });
      if (t < qe) shoot(k, "2");
      return;
    }
    // Drive.
    const sx = rx - tm.dir * rng.range(6, 18);
    const sy = CY + rng.range(-16, 16);
    setAction("d");
    moveBall(sx, sy, 0, k, 450 / pace, () => {
      formation(0);
      tgt[2 * k] = sx;
      tgt[2 * k + 1] = sy;
      // Help defence collapses.
      const d = (1 - off) * 5 + 4;
      tgt[2 * d] = lerp(tgt[2 * d], sx, 0.6);
      tgt[2 * d + 1] = lerp(tgt[2 * d + 1], sy, 0.6);
    });
    if (t >= qe) return;
    if (rng.chance(0.18)) {
      // Kick it out to an open shooter.
      const r = off * 5 + ((k % 5) + rng.int(1, 4)) % 5;
      formation(0);
      setAction("p");
      moveBall(pos[2 * r], pos[2 * r + 1], 0, r, 330);
      if (t < qe) shoot(r, player(r).three > 0.35 ? "3" : "2");
      return;
    }
    shoot(k, pl.size >= 2 && rng.chance(0.22) ? "dunk" : "paint");
  }

  function walkTo(target: Float64Array, total: number, steps: number) {
    const from = Float64Array.from(pos);
    for (let s = 1; s <= steps; s++) {
      t += total / steps;
      const u = s / steps;
      const e = u * u * (3 - 2 * u);
      for (let k = 0; k < 20; k++) pos[k] = lerp(from[k], target[k], e);
      emit();
    }
  }

  function benches(): Float64Array {
    const out = new Float64Array(20);
    for (let k = 0; k < 10; k++) {
      const s = teamOf(k);
      out[2 * k] = W / 2 + (s === 0 ? -1 : 1) * (20 + (k % 5) * 14);
      out[2 * k + 1] = H + 14 + (k % 2) * 6;
    }
    return out;
  }

  function tipOffPositions(): Float64Array {
    const out = new Float64Array(20);
    for (let k = 0; k < 10; k++) {
      const tm = teams[teamOf(k)];
      const s = k % 5;
      const back = -tm.dir;
      if (s === 4) {
        out[2 * k] = W / 2 + back * 5;
        out[2 * k + 1] = CY;
      } else {
        out[2 * k] = W / 2 + back * (s < 2 ? 45 : 22);
        out[2 * k + 1] = CY + (s % 2 ? 30 : -30) + (s < 2 ? (s ? 12 : -12) : 0);
      }
    }
    return out;
  }

  function substitutions() {
    for (const tm of teams) {
      const n = q === 3 ? rng.int(0, 1) : rng.int(0, 2);
      for (let j = 0; j < n; j++) {
        const s = rng.int(0, 4);
        const benchIdx = [5, 6, 7].filter((r) => !tm.on.includes(r));
        let inIdx: number;
        if (tm.on[s] >= 5) inIdx = s; // starter back on
        else if (benchIdx.length) inIdx = rng.pick(benchIdx);
        else continue;
        const outP = tm.roster[tm.on[s]];
        tm.on[s] = inIdx;
        const inP = tm.roster[inIdx];
        ev("sub", tm.i, rng.chance(0.4) ? say(L.sub, { on: surname(inP.name), off: surname(outP.name), team: tm.name }) : undefined, { i: s, n: inP.num });
      }
      if (q === 3) {
        // Starters close it out.
        for (let s = 0; s < 5; s++) {
          if (tm.on[s] !== s) {
            tm.on[s] = s;
            ev("sub", tm.i, undefined, { i: s, n: tm.roster[s].num });
          }
        }
      }
    }
  }

  function playPeriod(idx: number) {
    const [rs, re] = BASKETBALL.quarters[idx];
    q = idx + 1;
    qs = rs;
    qe = re;
    qSec = idx < 4 ? BASKETBALL.quarterSec : BASKETBALL.otSec;
    ph = 1;
    teams[0].dir = idx < 2 ? 1 : -1;
    teams[1].dir = idx < 2 ? -1 : 1;
    teams[0].fouls = 0;
    teams[1].fouls = 0;
    t = rs;
    // Tip-off for the first quarter and overtime; otherwise alternate possession.
    if (idx === 0 || idx === 4) {
      pos.set(tipOffPositions());
      bx = W / 2;
      by = CY;
      bh = 26;
      handler = -1;
      emit();
      const winner = rng.chance(0.5 + (teams[0].roster[4].skill - teams[1].roster[4].skill) / 200) ? 0 : 1;
      off = winner as 0 | 1;
      const k = winner * 5 + 0;
      setAction("p");
      ev("tip", off, idx === 0 ? say(L.tip, { p: nameOf(winner * 5 + 4), team: teams[off].name }) : undefined);
      moveBall(pos[2 * k], pos[2 * k + 1], 0, k, 500);
    } else {
      off = (idx % 2 === 1 ? 1 : 0) as 0 | 1;
      inbound(off, false);
      handler = off * 5;
      bx = pos[2 * handler];
      by = pos[2 * handler + 1];
      emit();
    }
    while (t < re - 250) {
      const remain = clock();
      if (remain < 4 && handler >= 0) {
        // Last shot of the quarter.
        const k = handler;
        const tm = teams[teamOf(k)];
        const deep = Math.abs(pos[2 * k] - rimX(tm)) > 90;
        if (deep) {
          setAction("d");
          shoot(k, "heave");
        } else shoot(k, "3");
        break;
      }
      possession();
    }
    t = Math.max(t + 200, re);
    handler = -1;
    bh = 0;
    ph = idx === 1 ? 3 : 2;
  }

  // ------------------------------------------------------------ the game
  pos.set(tipOffPositions());
  for (let idx = 0; idx < 4; idx++) {
    playPeriod(idx);
    const vars = { q: QUARTER_NAMES[idx], home: teams[0].short, away: teams[1].short, s0: score[0], s1: score[1] };
    if (idx === 3) {
      if (score[0] === score[1]) {
        ev("ot", undefined, say(L.ot, vars));
        emit();
      }
      break;
    }
    ev(idx === 1 ? "half" : "quarter", undefined, say(idx === 1 ? L.half : L.quarter, vars));
    emit();
    substitutions();
    const [ns] = BASKETBALL.quarters[idx + 1];
    const gap = ns - t;
    walkTo(benches(), Math.max(1000, gap * 0.45), Math.max(2, Math.ceil((gap * 0.45) / 900)));
    walkTo(tipOffPositions(), Math.max(1000, ns - 400 - t), Math.max(2, Math.ceil((ns - 400 - t) / 900)));
  }
  if (score[0] === score[1]) {
    walkTo(tipOffPositions(), Math.max(1000, BASKETBALL.quarters[4][0] - 300 - t), Math.max(2, Math.ceil((BASKETBALL.quarters[4][0] - 300 - t) / 900)));
    playPeriod(4);
    if (score[0] === score[1]) {
      // Still level: one last possession, and it goes in.
      const side = rng.chance(0.5) ? 0 : 1;
      const tm = teams[side];
      const k = side * 5 + rng.int(0, 2);
      ph = 1;
      handler = k;
      t -= 150;
      bx = rimX(tm) - tm.dir * 70;
      by = CY + 20;
      emit();
      setAction("s3");
      t += 700;
      bx = rimX(tm);
      by = CY;
      bh = 30;
      handler = -1;
      addPoints(k, 3);
      ev("three", tm.i, say(L.winner, { p: nameOf(k), team: tm.name }), { n: 3 });
      emit();
    }
  }
  ph = 4;
  const st = (tm: Team) => [tm.st.paint, tm.st.threes, tm.st.fts, tm.st.reb, tm.st.stl, tm.st.blk, tm.st.tov, tm.st.lead];
  ev("final", undefined, say(L.final, { home: teams[0].short, away: teams[1].short, s0: score[0], s1: score[1] }), {
    st: [st(teams[0]), st(teams[1])],
    sl: ["Points in the paint", "Threes made", "Free throws made", "Rebounds", "Steals", "Blocks", "Turnovers", "Biggest lead"],
  });
  t += 300;
  emit();
  walkTo(benches(), Math.max(1000, BASKETBALL.end - 500 - t), Math.max(2, Math.ceil((BASKETBALL.end - 500 - t) / 1000)));

  const [h, a] = score;
  const top = (tm: Team) => tm.roster.reduce((b, p) => (p.pts > b.pts ? p : b), tm.roster[0]);
  const th = top(teams[0]);
  const ta = top(teams[1]);
  const ot = frames.some((f) => f.q === 5) ? " (OT)" : "";
  const best = th.pts >= ta.pts ? th : ta;
  return {
    frames,
    result: {
      winner: h > a ? "home" : "away",
      score: `${h}–${a}${ot}`,
      summary: `${match.home.name} ${h}–${a} ${match.away.name}${ot}. Top scorer: ${surname(best.name)} with ${best.pts} points.`,
    },
  };
}
