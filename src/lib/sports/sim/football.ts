// Football match engine. Plays a whole 90 minutes (plus added time) as a chain of touches:
// passes, long balls, through balls, dribbles, crosses, shots, saves, set pieces, fouls,
// cards, offsides, injuries and substitutions, with 22 players holding their formation shape
// around the ball. Each touch is a keyframe; the viewer tweens between them.

import type { Rng } from "../rng";
import { FORMATION_SPOTS, teamProfile, type Spot } from "../teams";
import { FOOTBALL, footballMinute } from "../timeline";
import type { FootballFrame, MatchEvent, MatchInfo, MatchResult } from "../types";
import { clamp, lerp, makeSay, sig, surname } from "./common";

const W = 1050;
const H = 680;
const CY = H / 2;
const BOX_D = 165;
const BOX_HALF = 202;
const GOAL_HALF = 37;

type Stats = {
  poss: number;
  shots: number;
  sot: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
  offside: number;
  passes: number;
  passOk: number;
  saves: number;
};

type Team = {
  i: 0 | 1;
  name: string;
  short: string;
  spots: Spot[];
  full: string[];
  nums: number[];
  bench: { name: string; num: number }[];
  off: boolean[];
  yellow: boolean[];
  subbed: boolean[];
  subsLeft: number;
  att: number;
  mid: number;
  def: number;
  gk: number;
  style: number;
  dir: 1 | -1;
  st: Stats;
  subTimes: number[];
};

type Mode = "open" | "kickoff" | "throw" | "goalkick" | "corner" | "freekick" | "indirect" | "penalty";

const L = {
  kickoff: ["And we're off! {team} get us started.", "The referee blows and {team} kick off.", "Here we go! {team} get the ball rolling."],
  kickoff2: ["The second half is under way.", "We're back! {team} start the second half.", "Second half, here we go."],
  goal: [
    "GOAL! {p} finds the net for {team}! {score}.",
    "GOAL! What a finish from {p}! {score}.",
    "{p} SCORES! The {short} fans go wild. {score}.",
    "GOAL! {p} keeps calm and slots it past {gk}. {score}.",
    "It's in! {p} with the goal for {team}. {score}.",
    "GOAL! {p} picks his spot and buries it. {score}.",
  ],
  goalHeader: ["GOAL! {p} rises highest and heads it in! {score}.", "Bullet header from {p}! GOAL! {score}.", "GOAL! {p} gets his head on it and it's in! {score}."],
  goalLong: ["GOAL! {p} from distance, an absolute screamer! {score}.", "WOW! {p} hits it from 25 yards and it flies in! {score}.", "GOAL! {p} lets fly and {gk} has no chance! {score}."],
  goalPen: ["GOAL! {p} sends {gk} the wrong way from the spot. {score}.", "Penalty scored. {p} makes no mistake. {score}."],
  goalFk: ["GOAL! {p} curls the free kick over the wall and in! {score}.", "Free-kick GOAL! {p} bends it into the top corner! {score}."],
  equaliser: [" They're level!", " All square!", " Game on!"],
  save: [
    "What a save! {gk} denies {p}.",
    "{p} shoots... {gk} gets down well to save.",
    "Strong hands from {gk} to keep out {p}.",
    "{gk} tips {p}'s shot round the post!",
    "Point-blank stop from {gk}!",
    "{p} forces a good save from {gk}.",
  ],
  headerSave: ["{p} heads it towards goal, {gk} saves.", "Header from {p}, straight at {gk}."],
  post: ["Off the post! {p} so close for {team}!", "{p} rattles the woodwork!", "CRASH, off the bar from {p}!"],
  wide: [
    "{p} shoots, but it's wide.",
    "{p} blazes it over the bar.",
    "Ambitious from {p}, but that's in the stands.",
    "{p} drags it wide of the post.",
    "Not far away from {p}!",
    "{p} snatches at it and it goes wide.",
  ],
  headerWide: ["{p} gets his head to it, but it's over.", "{p} heads wide. Should have done better."],
  block: ["{p}'s shot is blocked by {d}.", "Great block from {d} to stop {p}.", "{d} throws himself in front of {p}'s shot."],
  corner: ["Corner to {team}.", "{team} win a corner.", "That's a corner for {short}."],
  foul: ["Foul by {p} on {q}.", "{p} catches {q} late. Free kick.", "{q} goes down under the challenge from {p}."],
  yellow: ["Yellow card for {p} after that foul on {q}.", "{p} goes into the book.", "The referee shows {p} a yellow card."],
  red: ["RED CARD! {p} is sent off! {team} down to {n} men.", "Straight red for {p}! {team} down to {n}."],
  second: ["Second yellow for {p}, and he's off! {team} down to {n}.", "{p} already had a yellow... RED CARD!"],
  offside: ["Flag up, {p} was offside.", "{p} timed his run too early. Offside.", "Offside against {p}."],
  injury: ["{p} is down and needs treatment.", "Worrying moment: {p} is hurt.", "The physio is on for {p}."],
  sub: ["Change for {team}: {on} comes on for {off}.", "{off} makes way for {on}.", "{team} make a change: {on} on, {off} off."],
  board: ["The fourth official shows {n} of added time.", "{n} added on."],
  ht: ["Half-time: {home} {s0}–{s1} {away}.", "The referee blows for half-time. {home} {s0}–{s1} {away}."],
  ft: ["FULL TIME! {home} {s0}–{s1} {away}.", "It's all over! {home} {s0}–{s1} {away}."],
  penWon: ["PENALTY! {q} is brought down by {p}!", "The referee points to the spot! Foul on {q} by {p}."],
  penSaved: ["SAVED! {gk} guesses right and stops {p}'s penalty!", "{gk} dives the right way and saves from {p}!"],
  penMissed: ["{p} skies the penalty!", "{p} hits the post from the spot!"],
  freekick: ["Free kick in a dangerous position for {team}.", "{team} have a free kick around 25 yards out.", "{p} stands over this free kick..."],
  claim: ["{gk} comes out and claims it.", "Safe hands from {gk}."],
  clear: ["{d} heads it clear.", "Cleared by {d}.", "{d} gets it away."],
  flavour: [
    "{team} are knocking it about nicely.",
    "Lovely one-two between {p} and {q}.",
    "{p} picks out {q} with a raking pass.",
    "{team} pressing high now.",
    "The crowd are right behind {team}.",
    "{p} is pulling the strings for {short}.",
    "Patient build-up from {team}.",
    "{short} looking dangerous on the counter.",
  ],
  skill: ["{p} skips past {d}!", "Lovely footwork from {p} to beat {d}.", "{p} nutmegs {d}! The crowd love it."],
  tackle: ["Big tackle from {d} on {p}.", "{d} reads it well and wins the ball.", "Superb challenge from {d}."],
  through: ["{p} slides {q} through...", "Clever pass from {p} into the path of {q}."],
};

export function simFootball(match: MatchInfo, rng: Rng): { frames: FootballFrame[]; result: MatchResult } {
  const say = makeSay(rng);
  const frames: FootballFrame[] = [];
  const pos = new Float64Array(44);
  const drift = new Float64Array(44);
  const tgt = new Float64Array(44);
  const homeAdv = 3;

  function makeTeam(i: 0 | 1): Team {
    const side = i === 0 ? match.home : match.away;
    const prof = teamProfile("football", side.name);
    const form = rng.normal() * 5.5 + (i === 0 ? homeAdv : 0);
    const r = (v: number) => v + form + rng.normal() * 2;
    const spots = FORMATION_SPOTS[prof.formation];
    const subTimes: number[] = [];
    const n = rng.int(2, 4);
    for (let k = 0; k < n; k++) subTimes.push(rng.int(55, 86) * 60);
    subTimes.sort((a, b) => a - b);
    return {
      i,
      name: side.name,
      short: side.short,
      spots,
      full: prof.roster.slice(0, 11),
      nums: prof.numbers.slice(0, 11),
      bench: prof.roster.slice(11).map((name, k) => ({ name, num: prof.numbers[11 + k] })),
      off: new Array(11).fill(false),
      yellow: new Array(11).fill(false),
      subbed: new Array(11).fill(false),
      subsLeft: 5,
      att: r(prof.att),
      mid: r(prof.mid),
      def: r(prof.def),
      gk: r(prof.gk),
      style: prof.style,
      dir: i === 0 ? 1 : -1,
      st: { poss: 0, shots: 0, sot: 0, corners: 0, fouls: 0, yellow: 0, red: 0, offside: 0, passes: 0, passOk: 0, saves: 0 },
      subTimes,
    };
  }
  const teams: [Team, Team] = [makeTeam(0), makeTeam(1)];

  // ------------------------------------------------------------ state
  let t = 0;
  let ph = 0;
  let halfStart = 0;
  let halfEnd = 1;
  let clockStart = 0;
  let clockLen = 2700;
  const added = [rng.int(1, 4), rng.int(2, 6)];
  const score = [0, 0];
  let bx = W / 2;
  let by = CY;
  let bh = 0;
  let carrier = -1;
  let poss: 0 | 1 = 0;
  let mode: Mode = "kickoff";
  let pending: MatchEvent[] = [];
  let lastPasser = -1;
  let lastTalk = 0;
  const goals: { s: 0 | 1; min: string; who: string; how: string }[] = [];

  const teamOf = (k: number): 0 | 1 => (k < 11 ? 0 : 1);
  const nameOf = (k: number) => surname(teams[teamOf(k)].full[k % 11]);
  const depth = (tm: Team, x: number) => (tm.dir > 0 ? x / W : 1 - x / W);
  const toX = (tm: Team, d: number) => (tm.dir > 0 ? d * W : (1 - d) * W);
  const width = (tm: Team, y: number) => (tm.dir > 0 ? y / H : 1 - y / H);
  const toY = (tm: Team, w: number) => (tm.dir > 0 ? w * H : (1 - w) * H);
  const goalX = (tm: Team) => (tm.dir > 0 ? W : 0);
  const clockAt = (tt: number) => clockStart + clamp((tt - halfStart) / (halfEnd - halfStart), 0, 1) * clockLen;
  const minute = () => footballMinute(clockAt(t), ph);
  const scoreText = () => `${teams[0].short} ${score[0]}–${score[1]} ${teams[1].short}`;

  function ev(k: string, s: 0 | 1 | undefined, tx: string | undefined, extra?: Partial<MatchEvent>) {
    const e: MatchEvent = { k };
    if (s !== undefined) e.s = s;
    if (tx) e.tx = tx;
    if (extra) Object.assign(e, extra);
    pending.push(e);
    if (tx) lastTalk = t;
  }

  function emit() {
    const p = new Array<number>(44);
    for (let k = 0; k < 44; k++) p[k] = Math.round(pos[k]);
    const f: FootballFrame = {
      t: Math.round(t),
      ph,
      c: Math.round(clockAt(t)),
      p,
      b: [Math.round(bx), Math.round(by), Math.round(bh)],
      k: carrier,
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

  // ------------------------------------------------------------ positions

  function shape(tm: Team, inPoss: boolean) {
    const base = tm.i * 11;
    const bd = depth(tm, bx);
    const bw = width(tm, by);
    let dl: number;
    let fl: number;
    if (inPoss) {
      dl = clamp(bd - 0.33, 0.13, 0.55);
      fl = clamp(bd + 0.2, 0.48, 0.9);
    } else {
      dl = clamp(bd - 0.2, 0.05, 0.42);
      fl = clamp(bd + 0.06, 0.26, 0.6);
    }
    if (fl - dl < 0.22) fl = dl + 0.22;
    for (let s = 0; s < 11; s++) {
      const k = base + s;
      if (tm.off[s]) {
        tgt[2 * k] = W / 2 + (tm.i ? 40 : -40);
        tgt[2 * k + 1] = -170;
        continue;
      }
      const sp = tm.spots[s];
      let d: number;
      let w: number;
      if (s === 0) {
        d = 0.012 + (inPoss ? 0.035 : 0.008) + clamp(bd - 0.5, 0, 0.5) * 0.14;
        w = 0.5 + (bw - 0.5) * 0.28;
      } else {
        d = dl + sp.d * (fl - dl);
        w = inPoss ? 0.5 + (sp.w - 0.5) * 0.96 + (bw - 0.5) * 0.14 : 0.5 + (sp.w - 0.5) * 0.7 + (bw - 0.5) * 0.34;
      }
      tgt[2 * k] = clamp(toX(tm, d) + (s ? drift[2 * k] : 0), 4, W - 4);
      tgt[2 * k + 1] = clamp(toY(tm, w) + (s ? drift[2 * k + 1] : drift[2 * k + 1] * 0.2), 8, H - 8);
    }
  }

  function nearest(tm: Team, x: number, y: number, exclude = -1, allowGk = false): number {
    let best = -1;
    let bd = Infinity;
    for (let s = allowGk ? 0 : 1; s < 11; s++) {
      const k = tm.i * 11 + s;
      if (k === exclude || tm.off[s]) continue;
      const d = (pos[2 * k] - x) ** 2 + (pos[2 * k + 1] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }
  const distTo = (k: number, x: number, y: number) => Math.hypot(pos[2 * k] - x, pos[2 * k + 1] - y);

  /** Moves everyone towards their shape for the current ball position. */
  function settle(dur: number, overrides?: (tg: Float64Array) => void) {
    for (let k = 0; k < 44; k++) drift[k] = drift[k] * 0.82 + rng.normal() * 14;
    shape(teams[0], poss === 0 && carrier >= 0);
    shape(teams[1], poss === 1 && carrier >= 0);
    if (carrier >= 0) {
      const opp = teams[1 - poss];
      const own = goalX(opp) === W ? 0 : W; // the defending team's own goal line
      const presser = nearest(opp, bx, by);
      if (presser >= 0) {
        const dx = own - bx;
        const dy = CY - by;
        const l = Math.hypot(dx, dy) || 1;
        tgt[2 * presser] = bx + (dx / l) * 24 + rng.normal() * 6;
        tgt[2 * presser + 1] = by + (dy / l) * 24 + rng.normal() * 6;
        const cover = nearest(opp, bx, by, presser);
        if (cover >= 0) {
          tgt[2 * cover] = lerp(tgt[2 * cover], bx, 0.45);
          tgt[2 * cover + 1] = lerp(tgt[2 * cover + 1], by, 0.45);
        }
      }
      const mate = nearest(teams[poss], bx, by, carrier);
      if (mate >= 0) {
        tgt[2 * mate] = lerp(tgt[2 * mate], bx, 0.3);
        tgt[2 * mate + 1] = lerp(tgt[2 * mate + 1], by, 0.3);
      }
      tgt[2 * carrier] = bx - teams[poss].dir * 6;
      tgt[2 * carrier + 1] = by;
    }
    overrides?.(tgt);
    const k = 1 - Math.exp(-dur / 650);
    for (let j = 0; j < 44; j++) pos[j] += (tgt[j] - pos[j]) * k;
    if (carrier >= 0) {
      pos[2 * carrier] = bx - teams[poss].dir * 6;
      pos[2 * carrier + 1] = by;
    }
  }

  /** The ball travels to (x, y) over `dur` ms and ends with `to` (or loose). */
  function moveBall(x: number, y: number, to: number, dur: number, h = 0, overrides?: (tg: Float64Array) => void) {
    teams[poss].st.poss += dur;
    t += dur;
    bx = clamp(x, -30, W + 30);
    by = clamp(y, -30, H + 30);
    bh = h;
    carrier = to;
    if (to >= 0) poss = teamOf(to);
    settle(dur, overrides);
    emit();
  }

  /** Emits frames every second or so while everyone walks to `targets` (a full set of 44). */
  function walk(targets: Float64Array, total: number, steps = Math.max(1, Math.ceil(total / 1000))) {
    const from = Float64Array.from(pos);
    for (let s = 1; s <= steps; s++) {
      t += total / steps;
      const u = s / steps;
      const e = u * u * (3 - 2 * u);
      for (let k = 0; k < 44; k++) pos[k] = lerp(from[k], targets[k], e);
      emit();
    }
  }

  /** Frames every second while nothing moves, until `until`. */
  function hold(until: number) {
    while (t + 1000 <= until) {
      t += 1000;
      emit();
    }
  }

  function kickoffTargets(kicking: 0 | 1, out: Float64Array) {
    for (const tm of teams) {
      const base = tm.i * 11;
      let front = 1;
      let second = 1;
      for (let s = 1; s < 11; s++) {
        if (tm.spots[s].d > tm.spots[front].d) {
          second = front;
          front = s;
        } else if (s !== front && tm.spots[s].d >= tm.spots[second].d) second = s;
      }
      for (let s = 0; s < 11; s++) {
        const k = base + s;
        if (tm.off[s]) {
          out[2 * k] = W / 2 + (tm.i ? 40 : -40);
          out[2 * k + 1] = -170;
          continue;
        }
        const sp = tm.spots[s];
        const d = s === 0 ? 0.015 : 0.08 + sp.d * 0.36;
        out[2 * k] = toX(tm, d);
        out[2 * k + 1] = toY(tm, s === 0 ? 0.5 : sp.w);
        if (tm.i === kicking && s === front) {
          out[2 * k] = W / 2 - tm.dir * 4;
          out[2 * k + 1] = CY;
        } else if (tm.i === kicking && s === second) {
          out[2 * k] = W / 2 - tm.dir * 40;
          out[2 * k + 1] = CY + 70;
        } else if (tm.i !== kicking) {
          const dx = out[2 * k] - W / 2;
          const dy = out[2 * k + 1] - CY;
          const l = Math.hypot(dx, dy);
          if (l < 100) {
            out[2 * k] = W / 2 + (dx / (l || 1)) * 100;
            out[2 * k + 1] = CY + (dy / (l || 1)) * 100;
          }
        }
        if (tm.dir > 0) out[2 * k] = Math.min(out[2 * k], W / 2 - 3);
        else out[2 * k] = Math.max(out[2 * k], W / 2 + 3);
      }
    }
  }

  function strikerOf(tm: Team): number {
    let front = 1;
    for (let s = 1; s < 11; s++) if (!tm.off[s] && tm.spots[s].d > tm.spots[front].d) front = s;
    return tm.i * 11 + front;
  }

  // ------------------------------------------------------------ chances

  function goalDist(tm: Team, x: number, y: number) {
    return Math.hypot(goalX(tm) - x, CY - y) / 10;
  }
  /** Expected goals of a shot from (x, y) attacking `tm`'s target goal. */
  function xgAt(tm: Team, x: number, y: number): number {
    const dx = Math.abs(goalX(tm) - x) / 10;
    const dy = Math.abs(y - CY) / 10;
    const dist = Math.hypot(dx, dy);
    let ang = Math.atan2(7.32 * dx, dx * dx + dy * dy - 3.66 * 3.66);
    if (ang < 0) ang += Math.PI;
    let p = sig(-1.05 + 1.65 * ang - 0.16 * dist);
    if (dy > dx * 1.6) p *= 0.5;
    return clamp(p, 0.003, 0.65);
  }
  const inBox = (tm: Team, x: number, y: number) => Math.abs(goalX(tm) - x) < BOX_D && Math.abs(y - CY) < BOX_HALF;
  function pressureOn(k: number): number {
    const opp = teams[1 - teamOf(k)];
    const j = nearest(opp, pos[2 * k], pos[2 * k + 1], -1, true);
    if (j < 0) return 0;
    return clamp(1 - (distTo(j, pos[2 * k], pos[2 * k + 1]) - 12) / 70, 0, 1);
  }

  // ------------------------------------------------------------ actions

  function pickReceiver(tm: Team, from: number, kind: "any" | "back" | "near" | "forward"): number {
    const weights: number[] = [];
    const ids: number[] = [];
    const d0 = depth(tm, bx);
    for (let s = 0; s < 11; s++) {
      const k = tm.i * 11 + s;
      if (k === from || tm.off[s]) continue;
      if (s === 0 && (kind === "forward" || d0 > 0.35 || !rng.chance(0.25))) continue;
      const x = pos[2 * k];
      const y = pos[2 * k + 1];
      const dist = Math.hypot(x - bx, y - by) / 10;
      const gain = depth(tm, x) - d0;
      let w = Math.exp(-(((dist - (kind === "near" ? 12 : 17)) / 11) ** 2));
      if (kind === "back") w *= gain < 0 ? 2 : 0.2;
      else w *= 1 + Math.max(0, gain) * (kind === "forward" ? 6 : 3.4) * (tm.style + 0.6);
      if (gain < -0.12 && kind !== "back") w *= 0.4;
      w *= 0.25 + (1 - pressureOn(k)) * 0.75;
      ids.push(k);
      weights.push(w + 0.01);
    }
    return ids.length ? ids[rng.weighted(weights)] : from;
  }

  function maybeFlavour(a: number, b: number) {
    if (t - lastTalk > 32_000 && rng.chance(0.1)) {
      const tm = teams[teamOf(a)];
      ev("chat", tm.i, say(L.flavour, { team: tm.name, short: tm.short, p: nameOf(a), q: nameOf(b) }));
    }
  }

  function doPass(r: number, code: "p" | "t" | "l" = "p") {
    const tm = teams[poss];
    const opp = teams[1 - poss];
    const from = carrier;
    const tx = clamp(pos[2 * r] + tm.dir * rng.range(0, 45), 10, W - 10);
    const ty = clamp(pos[2 * r + 1] + rng.range(-28, 28), 4, H - 4);
    const dist = Math.hypot(tx - bx, ty - by) / 10;
    const d = depth(tm, bx);
    const p =
      (d < 0.33 ? 0.91 : d < 0.66 ? 0.85 : 0.76) +
      (tm.mid - opp.def) / 260 -
      (dist > 30 ? 0.1 : 0) -
      pressureOn(r) * 0.12 +
      (code === "t" ? 0.05 : 0);
    const dur = clamp(330 + dist * 21, 400, 1200);
    tm.st.passes++;
    setAction(code === "t" ? "t" : dist > 28 ? "l" : "p");
    if (rng.chance(p)) {
      tm.st.passOk++;
      lastPasser = from;
      moveBall(tx, ty, r, dur, 0, (tg) => {
        tg[2 * r] = tx - tm.dir * 6;
        tg[2 * r + 1] = ty;
      });
      maybeFlavour(from, r);
      const dd = depth(tm, tx);
      if (dd > 0.3 && rng.chance(0.03 + pressureOn(r) * 0.03)) {
        const j = nearest(opp, tx, ty);
        if (j >= 0) {
          t += 400;
          emit();
          foul(opp, j, r, tx, ty, inBox(tm, tx, ty) && rng.chance(0.25));
        }
      }
      return;
    }
    lastPasser = -1;
    if (ty < 30 || ty > H - 30 || rng.chance(0.15)) {
      const oy = ty < CY ? -8 : H + 8;
      const ox = clamp(lerp(bx, tx, 1.1), 20, W - 20);
      moveBall(ox, oy, -1, dur);
      throwIn((1 - poss) as 0 | 1, ox, oy < 0 ? 0 : H);
      return;
    }
    const u = rng.range(0.5, 1);
    const ix = lerp(bx, tx, u);
    const iy = lerp(by, ty, u);
    const j = nearest(opp, ix, iy, -1, inBox(tm, ix, iy));
    moveBall(ix, iy, j, dur * u, 0, (tg) => {
      tg[2 * j] = ix;
      tg[2 * j + 1] = iy;
    });
    if (t - lastTalk > 20_000 && rng.chance(0.12)) ev("tackle", opp.i, say(L.tackle, { d: nameOf(j), p: nameOf(r) }));
  }

  function doLong(from: number) {
    const tm = teams[poss];
    const opp = teams[1 - poss];
    const r = pickReceiver(tm, from, "forward");
    const tx = clamp(pos[2 * r] + tm.dir * rng.range(10, 60), 30, W - 30);
    const ty = clamp(pos[2 * r + 1] + rng.range(-50, 50), 20, H - 20);
    const dist = Math.hypot(tx - bx, ty - by) / 10;
    const dur = clamp(600 + dist * 16, 800, 1400);
    setAction(from % 11 === 0 ? "k" : "l");
    tm.st.passes++;
    if (rng.chance(0.47 + (tm.att - opp.def) / 200)) {
      tm.st.passOk++;
      lastPasser = from;
      moveBall(tx, ty, r, dur, 0, (tg) => {
        tg[2 * r] = tx;
        tg[2 * r + 1] = ty;
      });
      return;
    }
    lastPasser = -1;
    if (rng.chance(0.12)) {
      const oy = ty < CY ? -8 : H + 8;
      moveBall(tx, oy, -1, dur);
      throwIn((1 - poss) as 0 | 1, tx, oy < 0 ? 0 : H);
      return;
    }
    const j = nearest(opp, tx, ty);
    moveBall(tx, ty, j, dur, 0, (tg) => {
      tg[2 * j] = tx;
      tg[2 * j + 1] = ty;
    });
  }

  function doThrough(from: number) {
    const tm = teams[poss];
    const opp = teams[1 - poss];
    let f = -1;
    let fd = -1;
    for (let s = 1; s < 11; s++) {
      const k = tm.i * 11 + s;
      if (k === from || tm.off[s]) continue;
      const d = depth(tm, pos[2 * k]);
      if (d > fd) {
        fd = d;
        f = k;
      }
    }
    if (f < 0) return doPass(pickReceiver(tm, from, "any"));
    const tx = clamp(toX(tm, Math.min(0.97, fd + rng.range(0.06, 0.13))), 20, W - 20);
    const ty = clamp(lerp(pos[2 * f + 1], CY, 0.3) + rng.range(-40, 40), 30, H - 30);
    const dur = clamp(500 + (Math.hypot(tx - bx, ty - by) / 10) * 18, 700, 1300);
    setAction("p");
    tm.st.passes++;
    if (rng.chance(0.15)) {
      tm.st.offside++;
      lastPasser = -1;
      ev("offside", tm.i, say(L.offside, { p: nameOf(f) }));
      moveBall(tx, ty, -1, dur, 0, (tg) => {
        tg[2 * f] = tx;
        tg[2 * f + 1] = ty;
      });
      freeKick((1 - poss) as 0 | 1, pos[2 * f], pos[2 * f + 1], true);
      return;
    }
    if (rng.chance(0.43 + (tm.att - opp.def) / 180)) {
      tm.st.passOk++;
      lastPasser = from;
      if (rng.chance(0.25) && t - lastTalk > 8000) ev("chat", tm.i, say(L.through, { p: nameOf(from), q: nameOf(f) }));
      moveBall(tx, ty, f, dur, 0, (tg) => {
        tg[2 * f] = tx;
        tg[2 * f + 1] = ty;
      });
      return;
    }
    lastPasser = -1;
    const gkK = opp.i * 11;
    const keeperCan = Math.abs(goalX(tm) - tx) < BOX_D + 40 && !opp.off[0];
    const j = keeperCan && rng.chance(0.6) ? gkK : nearest(opp, tx, ty);
    moveBall(tx, ty, j, dur, 0, (tg) => {
      tg[2 * j] = tx;
      tg[2 * j + 1] = ty;
    });
    if (j === gkK && rng.chance(0.4)) ev("claim", opp.i, say(L.claim, { gk: nameOf(gkK) }));
  }

  function doDribble(from: number) {
    const tm = teams[poss];
    const opp = teams[1 - poss];
    const d = depth(tm, bx);
    const len = rng.range(55, 120);
    const toCentre = d > 0.7 ? (CY - by) * 0.25 : rng.range(-30, 30);
    const tx = clamp(bx + tm.dir * len, 15, W - 15);
    const ty = clamp(by + toCentre + rng.range(-25, 25), 15, H - 15);
    const dur = rng.range(700, 1050);
    setAction("d");
    const defender = nearest(opp, bx, by);
    const p = 0.57 + (tm.att - opp.def) / 190 - pressureOn(from) * 0.12;
    if (rng.chance(p)) {
      if (t - lastTalk > 15_000 && rng.chance(0.18) && defender >= 0) ev("skill", tm.i, say(L.skill, { p: nameOf(from), d: nameOf(defender) }));
      moveBall(tx, ty, from, dur);
      return;
    }
    const u = rng.range(0.3, 0.75);
    const ix = lerp(bx, tx, u);
    const iy = lerp(by, ty, u);
    const box = inBox(tm, ix, iy);
    if (defender >= 0 && rng.chance(box ? 0.075 : 0.33)) {
      moveBall(ix, iy, -1, dur * u, 0, (tg) => {
        tg[2 * defender] = ix + tm.dir * 8;
        tg[2 * defender + 1] = iy + 6;
        tg[2 * from] = ix;
        tg[2 * from + 1] = iy;
      });
      foul(opp, defender, from, ix, iy, box);
      return;
    }
    if (depth(tm, ix) > 0.85 && rng.chance(0.25)) {
      moveBall(ix, iy, -1, dur * u);
      setAction("k");
      moveBall(goalX(tm) + tm.dir * 10, iy < CY ? 60 : H - 60, -1, 400);
      cornerKick(tm.i, iy < CY ? 0 : H);
      return;
    }
    const j = defender >= 0 ? defender : nearest(opp, ix, iy);
    moveBall(ix, iy, j, dur * u, 0, (tg) => {
      tg[2 * j] = ix;
      tg[2 * j + 1] = iy;
    });
    if (t - lastTalk > 18_000 && rng.chance(0.2)) ev("tackle", opp.i, say(L.tackle, { d: nameOf(j), p: nameOf(from) }));
  }

  function doCross(from: number, corner: boolean) {
    const tm = teams[poss];
    const opp = teams[1 - poss];
    const gx = goalX(tm);
    const tx = gx - tm.dir * rng.range(45, 140);
    const ty = CY + rng.range(-120, 120);
    const dur = rng.range(850, 1150);
    setAction("c");
    lastPasser = from;
    const pHead = (corner ? 0.3 : 0.27) + (tm.att - opp.def) / 260;
    const pClaim = 0.15 + (opp.gk - 70) / 400;
    const r = rng.next();
    // While the cross is in the air everyone holds their run (nobody drifts back into shape).
    const hold = (tg: Float64Array) => {
      for (let j = 0; j < 44; j++) tg[j] = lerp(pos[j], tg[j], 0.2);
    };
    if (r < pHead) {
      const a = nearest(tm, tx, ty, from);
      moveBall(tx, ty, a, dur, 8, (tg) => {
        hold(tg);
        tg[2 * a] = tx;
        tg[2 * a + 1] = ty;
      });
      doShot(a, xgAt(tm, tx, ty) * 0.6, "header");
      return;
    }
    if (r < pHead + pClaim && !opp.off[0]) {
      const g = opp.i * 11;
      const gxx = gx - tm.dir * rng.range(30, 70);
      moveBall(gxx, ty * 0.5 + CY * 0.5, g, dur, 10, (tg) => {
        hold(tg);
        tg[2 * g] = gxx;
        tg[2 * g + 1] = ty * 0.5 + CY * 0.5;
      });
      if (rng.chance(0.35)) ev("claim", opp.i, say(L.claim, { gk: nameOf(g) }));
      return;
    }
    const d = nearest(opp, tx, ty);
    moveBall(tx, ty, -1, dur, 8, (tg) => {
      hold(tg);
      tg[2 * d] = tx;
      tg[2 * d + 1] = ty;
    });
    if (rng.chance(0.3)) ev("clear", opp.i, say(L.clear, { d: nameOf(d) }));
    if (rng.chance(corner ? 0.22 : 0.36)) {
      t += 500;
      bx = gx + tm.dir * 12;
      by = ty < CY ? 30 : H - 30;
      emit();
      cornerKick(tm.i, by < CY ? 0 : H);
      return;
    }
    // Headed away: loose ball somewhere outside the box.
    const lx = gx - tm.dir * rng.range(200, 380);
    const ly = clamp(CY + rng.range(-220, 220), 30, H - 30);
    setAction("k");
    const att = nearest(tm, lx, ly);
    const def = nearest(opp, lx, ly);
    const win = rng.chance(0.4) ? att : def;
    moveBall(lx, ly, win, 800, 0, (tg) => {
      tg[2 * win] = lx;
      tg[2 * win + 1] = ly;
    });
  }

  function doShot(from: number, xg: number, kind: "open" | "header" | "fk" | "pen" | "long") {
    const tm = teams[poss];
    const opp = teams[1 - poss];
    const gx = goalX(tm);
    const dir = tm.dir;
    const g = opp.i * 11;
    tm.st.shots++;
    const p = nameOf(from);
    const gk = nameOf(g);
    const q = 1.22 * clamp(1 + (tm.att - opp.def) / 100, 0.6, 1.5);
    const gkf = opp.off[0] ? 1.6 : clamp(1 - (opp.gk - 72) / 150, 0.75, 1.3);
    const pressure = pressureOn(from);
    const pGoal = kind === "pen" ? clamp(0.77 + (tm.att - opp.gk) / 300, 0.62, 0.9) : clamp(xg * q * gkf, 0.004, 0.72);
    const pPost = kind === "pen" ? 0.03 : 0.028;
    const pSave = kind === "pen" ? 0.15 : clamp(0.22 + xg * 0.45, 0.14, 0.45) / gkf;
    const pBlock = kind === "pen" || kind === "header" ? 0 : 0.08 + pressure * 0.22;
    const dist = goalDist(tm, bx, by);
    const dur = clamp(260 + dist * 13, 320, 760);
    const r = rng.next();
    const aimY = CY + rng.range(-GOAL_HALF + 4, GOAL_HALF - 4);
    setAction(kind === "header" ? "h" : "s");
    if (r < pGoal) {
      tm.st.sot++;
      score[tm.i]++;
      const assist = lastPasser >= 0 && teamOf(lastPasser) === tm.i && lastPasser !== from ? nameOf(lastPasser) : "";
      const lines = kind === "header" ? L.goalHeader : kind === "pen" ? L.goalPen : kind === "fk" ? L.goalFk : dist > 22 ? L.goalLong : L.goal;
      let tx = say(lines, { p, team: tm.name, short: tm.short, gk, score: scoreText() });
      if (score[0] === score[1]) tx += rng.pick(L.equaliser);
      else if (assist && kind !== "pen" && kind !== "fk" && rng.chance(0.6)) tx += ` Lovely ball from ${assist}.`;
      goals.push({ s: tm.i, min: minute(), who: p, how: kind === "pen" ? " (pen)" : "" });
      moveBall(gx + dir * 14, aimY, -1, dur, rng.range(2, 18), (tg) => {
        tg[2 * g] = gx - dir * 10;
        tg[2 * g + 1] = CY + (aimY > CY ? -30 : 30);
      });
      // The goal is announced as the ball crosses the line.
      const f = frames[frames.length - 1];
      f.e = [...(f.e ?? []), { k: "goal", s: tm.i, tx }];
      lastTalk = t;
      celebrate(from);
      kickoff((1 - tm.i) as 0 | 1);
      return;
    }
    if (r < pGoal + pPost) {
      const py = CY + (aimY > CY ? GOAL_HALF : -GOAL_HALF);
      ev("post", tm.i, say(kind === "pen" ? L.penMissed : L.post, { p, team: tm.name }));
      moveBall(gx, py, -1, dur, 6);
      loose(gx - dir * rng.range(60, 140), CY + rng.range(-120, 120), 0.45);
      return;
    }
    if (r < pGoal + pPost + pSave && !opp.off[0]) {
      tm.st.sot++;
      opp.st.saves++;
      const sx = gx - dir * rng.range(8, 25);
      ev("save", opp.i, say(kind === "pen" ? L.penSaved : kind === "header" ? L.headerSave : L.save, { p, gk }));
      moveBall(sx, aimY, -1, dur, 4, (tg) => {
        tg[2 * g] = sx;
        tg[2 * g + 1] = aimY;
      });
      const r2 = rng.next();
      if (r2 < 0.52) {
        carrier = g;
        poss = opp.i;
        t += 700;
        bx = sx;
        by = aimY;
        settle(700);
        emit();
        return;
      }
      if (r2 < 0.82) {
        setAction("k");
        moveBall(gx + dir * 10, aimY < CY ? CY - 120 : CY + 120, -1, 450);
        cornerKick(tm.i, aimY < CY ? 0 : H);
        return;
      }
      setAction("k");
      loose(gx - dir * rng.range(50, 120), CY + rng.range(-110, 110), 0.45);
      return;
    }
    if (r < pGoal + pPost + pSave + pBlock) {
      const d = nearest(opp, bx, by);
      const blx = lerp(bx, gx, 0.12);
      const bly = lerp(by, CY, 0.12);
      if (rng.chance(0.55)) ev("block", opp.i, say(L.block, { p, d: nameOf(d) }));
      moveBall(blx, bly, -1, 260, 0, (tg) => {
        tg[2 * d] = blx;
        tg[2 * d + 1] = bly;
      });
      if (rng.chance(0.48)) {
        setAction("k");
        moveBall(gx + dir * 10, by < CY ? 40 : H - 40, -1, 500);
        cornerKick(tm.i, by < CY ? 0 : H);
        return;
      }
      setAction("k");
      loose(lerp(bx, gx, -0.15), by + rng.range(-150, 150), 0.4);
      return;
    }
    // Off target.
    const wy = CY + (rng.chance(0.5) ? 1 : -1) * rng.range(GOAL_HALF + 8, GOAL_HALF + 170);
    ev("wide", tm.i, say(kind === "pen" ? L.penMissed : kind === "header" ? L.headerWide : L.wide, { p }));
    moveBall(gx + dir * 25, clamp(wy, 20, H - 20), -1, dur, rng.range(0, 30));
    goalKick(opp.i);
  }

  /** A loose ball at (x, y): whoever's nearer gets it (attackers win `attShare` of close calls). */
  function loose(x: number, y: number, attShare: number) {
    x = clamp(x, 20, W - 20);
    y = clamp(y, 20, H - 20);
    const a = nearest(teams[poss], x, y);
    const d = nearest(teams[1 - poss], x, y, -1, true);
    const da = a >= 0 ? distTo(a, x, y) : Infinity;
    const dd = d >= 0 ? distTo(d, x, y) : Infinity;
    const pa = clamp(attShare + (dd - da) / 200, 0.1, 0.85);
    const win = rng.chance(pa) ? a : d;
    moveBall(x, y, win, 650, 0, (tg) => {
      tg[2 * win] = x;
      tg[2 * win + 1] = y;
    });
  }

  function doPenalty(from: number) {
    doShot(from, 0.77, "pen");
  }

  // ------------------------------------------------------------ fouls, cards, injuries, subs

  function foul(by: Team, offender: number, victim: number, x: number, y: number, box: boolean) {
    by.st.fouls++;
    const victimTeam = teams[1 - by.i];
    const s = offender % 11;
    const r = rng.next();
    const vars = { p: nameOf(offender), q: nameOf(victim), team: by.name, n: 0 };
    let card = false;
    if (r < 0.004 || (r < 0.032 && by.yellow[s])) {
      const second = by.yellow[s] && r >= 0.004;
      by.off[s] = true;
      by.st.red++;
      if (second) by.st.yellow++;
      by.att -= 3;
      by.mid -= 4;
      by.def -= 4;
      vars.n = by.off.filter((o) => !o).length;
      ev("red", by.i, say(second ? L.second : L.red, vars), { i: s });
      card = true;
    } else if (r < 0.17) {
      by.yellow[s] = true;
      by.st.yellow++;
      ev("yellow", by.i, say(L.yellow, vars), { i: s });
      card = true;
    }
    if (box) {
      ev("penalty", victimTeam.i, say(L.penWon, vars));
      t += 900;
      emit();
      penaltyKick(victimTeam.i, victim);
      return;
    }
    if (!card && rng.chance(0.3)) ev("foul", by.i, say(L.foul, vars));
    t += card ? 1600 : 700;
    emit();
    freeKick(victimTeam.i, x, y, false, victim);
  }

  function substitute(tm: Team, s: number, why: "injury" | "tactical") {
    if (tm.subsLeft <= 0 || !tm.bench.length || tm.off[s]) return false;
    const on = tm.bench.shift()!;
    const offName = surname(tm.full[s]);
    tm.full[s] = on.name;
    tm.nums[s] = on.num;
    tm.subbed[s] = true;
    tm.yellow[s] = false;
    tm.subsLeft--;
    ev("sub", tm.i, say(L.sub, { team: tm.name, on: surname(on.name), off: offName }), { i: s, n: on.num });
    if (why === "tactical") tm.att += rng.range(-1, 2);
    return true;
  }

  /** Subs that are due happen when the ball is dead. */
  function deadBall() {
    const c = clockAt(t);
    for (const tm of teams) {
      while (tm.subTimes.length && tm.subTimes[0] <= c && ph === 3) {
        tm.subTimes.shift();
        const choices: number[] = [];
        for (let s = 1; s < 11; s++) if (!tm.off[s] && !tm.subbed[s]) choices.push(s);
        if (!choices.length) continue;
        // Forwards and midfielders get changed more often.
        const w = choices.map((s) => 0.5 + tm.spots[s].d);
        const s = choices[rng.weighted(w)];
        if (substitute(tm, s, "tactical")) {
          t += 600;
          emit();
        }
      }
    }
    if (rng.chance(0.006)) {
      const tm = teams[rng.int(0, 1)];
      const s = rng.int(1, 10);
      if (!tm.off[s]) {
        ev("injury", tm.i, say(L.injury, { p: surname(tm.full[s]) }), { i: s });
        t += 1000;
        emit();
        t += 1200;
        emit();
        substitute(tm, s, "injury");
        t += 800;
        emit();
      }
    }
  }

  // ------------------------------------------------------------ restarts

  function takerNear(tm: Team, x: number, y: number) {
    return nearest(tm, x, y);
  }

  function throwIn(side: 0 | 1, x: number, y: number) {
    deadBall();
    const tm = teams[side];
    const k = takerNear(tm, x, y);
    poss = side;
    carrier = -1;
    t += 500;
    settle(500, (tg) => {
      tg[2 * k] = x;
      tg[2 * k + 1] = y === 0 ? -6 : H + 6;
    });
    emit();
    bx = x;
    by = y === 0 ? -4 : H + 4;
    carrier = k;
    t += 600;
    pos[2 * k] = x;
    pos[2 * k + 1] = y === 0 ? -6 : H + 6;
    emit();
    mode = "throw";
  }

  function goalKick(side: 0 | 1) {
    deadBall();
    const tm = teams[side];
    const g = side * 11;
    const gx = tm.dir > 0 ? 55 : W - 55;
    const gy = CY + rng.range(-60, 60);
    poss = side;
    carrier = -1;
    bx = gx;
    by = gy;
    t += 900;
    settle(900, (tg) => {
      tg[2 * g] = gx;
      tg[2 * g + 1] = gy;
    });
    emit();
    carrier = g;
    t += 700;
    settle(700);
    emit();
    mode = "goalkick";
  }

  function cornerKick(side: 0 | 1, y: number) {
    deadBall();
    const tm = teams[side];
    const opp = teams[1 - side];
    tm.st.corners++;
    if (rng.chance(0.45)) ev("corner", tm.i, say(L.corner, { team: tm.name, short: tm.short }));
    const gx = goalX(tm);
    const cx = gx - tm.dir * 5;
    const cy = y === 0 ? 5 : H - 5;
    const out = new Float64Array(44);
    shape(tm, true);
    shape(opp, false);
    out.set(tgt);
    // Attackers: the tallest five into the box, two on the edge, the rest stay back.
    const order: number[] = [];
    for (let s = 1; s < 11; s++) if (!tm.off[s]) order.push(s);
    order.sort((a, b) => tm.spots[b].d - tm.spots[a].d);
    const taker = order.find((s) => /W|M|B/.test(tm.spots[s].role)) ?? order[0];
    let n = 0;
    const marks: number[] = [];
    for (const s of order) {
      const k = side * 11 + s;
      if (s === taker) {
        out[2 * k] = cx;
        out[2 * k + 1] = cy;
        continue;
      }
      if (n < 5 || tm.spots[s].role === "CB") {
        out[2 * k] = gx - tm.dir * rng.range(45, 140);
        out[2 * k + 1] = CY + rng.range(-110, 110);
        marks.push(k);
      } else if (n < 7) {
        out[2 * k] = gx - tm.dir * rng.range(190, 230);
        out[2 * k + 1] = CY + rng.range(-150, 150);
      } else {
        out[2 * k] = W / 2 + tm.dir * rng.range(-20, 80);
        out[2 * k + 1] = CY + rng.range(-150, 150);
      }
      n++;
    }
    let m = 0;
    for (let s = 0; s < 11; s++) {
      const k = opp.i * 11 + s;
      if (opp.off[s]) continue;
      if (s === 0) {
        out[2 * k] = gx - tm.dir * 8;
        out[2 * k + 1] = CY + (y === 0 ? -12 : 12);
        continue;
      }
      if (opp.spots[s].d > 0.9 && m > 6) continue;
      const mk = marks[m % Math.max(1, marks.length)];
      if (mk !== undefined && m < marks.length + 3) {
        out[2 * k] = out[2 * mk] + tm.dir * 18 + rng.range(-8, 8);
        out[2 * k + 1] = out[2 * mk + 1] + rng.range(-15, 15);
      } else {
        out[2 * k] = gx - tm.dir * rng.range(60, 160);
        out[2 * k + 1] = CY + rng.range(-120, 120);
      }
      m++;
    }
    poss = side;
    carrier = -1;
    bx = cx;
    by = cy;
    walk(out, 1800, 2);
    carrier = side * 11 + taker;
    t += 500;
    emit();
    mode = "corner";
  }

  function freeKick(side: 0 | 1, x: number, y: number, indirect: boolean, taker = -1) {
    deadBall();
    const tm = teams[side];
    const opp = teams[1 - side];
    x = clamp(x, 15, W - 15);
    y = clamp(y, 15, H - 15);
    poss = side;
    carrier = -1;
    bx = x;
    by = y;
    const dist = goalDist(tm, x, y);
    const direct = !indirect && dist < 32 && depth(tm, x) > 0.68;
    const k = taker >= 0 && teamOf(taker) === side ? taker : takerNear(tm, x, y);
    shape(tm, true);
    shape(opp, false);
    const out = Float64Array.from(tgt);
    out[2 * k] = x - tm.dir * 12;
    out[2 * k + 1] = y;
    if (direct) {
      // A wall 9 m away, between the ball and the goal.
      const gx = goalX(tm);
      const dx = gx - x;
      const dy = CY - y;
      const l = Math.hypot(dx, dy) || 1;
      const wx = x + (dx / l) * 92;
      const wy = y + (dy / l) * 92;
      let placed = 0;
      for (let s = 1; s < 11 && placed < 4; s++) {
        const j = opp.i * 11 + s;
        if (opp.off[s]) continue;
        if (opp.spots[s].d > 0.85) continue;
        const off = (placed - 1.5) * 8;
        out[2 * j] = wx + (-dy / l) * off;
        out[2 * j + 1] = wy + (dx / l) * off;
        placed++;
      }
      ev("freekick", tm.i, say(L.freekick, { team: tm.name, p: nameOf(k) }));
    }
    walk(out, direct ? 1600 : 800, direct ? 2 : 1);
    carrier = k;
    pos[2 * k] = x - tm.dir * 6;
    pos[2 * k + 1] = y;
    t += 400;
    emit();
    mode = indirect ? "indirect" : "freekick";
  }

  function penaltyKick(side: 0 | 1, taker: number) {
    deadBall();
    const tm = teams[side];
    const opp = teams[1 - side];
    const gx = goalX(tm);
    const sx = gx - tm.dir * 110;
    const out = new Float64Array(44);
    for (let s = 0; s < 11; s++) {
      for (const team of [tm, opp]) {
        const k = team.i * 11 + s;
        if (team.off[s]) {
          out[2 * k] = W / 2;
          out[2 * k + 1] = -170;
          continue;
        }
        out[2 * k] = gx - tm.dir * rng.range(190, 240);
        out[2 * k + 1] = CY + rng.range(-200, 200);
      }
    }
    const g = opp.i * 11;
    out[2 * g] = gx - tm.dir * 4;
    out[2 * g + 1] = CY;
    const k = taker >= 0 && teamOf(taker) === side && !tm.off[taker % 11] ? taker : strikerOf(tm);
    out[2 * k] = sx - tm.dir * 18;
    out[2 * k + 1] = CY + 6;
    // Keepers stay home.
    out[2 * (tm.i * 11)] = tm.dir > 0 ? 40 : W - 40;
    out[2 * (tm.i * 11) + 1] = CY;
    poss = side;
    carrier = -1;
    bx = sx;
    by = CY;
    walk(out, 2400, 3);
    carrier = k;
    t += 600;
    emit();
    mode = "penalty";
  }

  function celebrate(scorer: number) {
    const tm = teams[teamOf(scorer)];
    const cx = goalX(tm) - tm.dir * 70;
    const cy = pos[2 * scorer + 1] < CY ? 40 : H - 40;
    carrier = -1;
    for (let step = 0; step < 4; step++) {
      t += 1000;
      for (let s = 0; s < 11; s++) {
        const k = tm.i * 11 + s;
        if (tm.off[s]) continue;
        const u = k === scorer ? 0.55 : s === 0 ? 0.05 : 0.32;
        const tx = k === scorer ? cx : pos[2 * scorer] + rng.range(-25, 25);
        const ty = k === scorer ? cy : pos[2 * scorer + 1] + rng.range(-25, 25);
        pos[2 * k] = lerp(pos[2 * k], tx, u);
        pos[2 * k + 1] = lerp(pos[2 * k + 1], ty, u);
      }
      emit();
    }
  }

  function kickoff(side: 0 | 1, walkMs = 2600) {
    deadBall();
    const out = new Float64Array(44);
    kickoffTargets(side, out);
    poss = side;
    carrier = -1;
    bx = W / 2;
    by = CY;
    bh = 0;
    if (walkMs > 0) walk(out, walkMs, 3);
    else {
      pos.set(out);
      emit();
    }
    carrier = strikerOf(teams[side]);
    mode = "kickoff";
  }

  // ------------------------------------------------------------ open play

  function step() {
    const k = carrier;
    if (k < 0) {
      loose(bx, by, 0.5);
      return;
    }
    const tm = teams[poss];
    const s = k % 11;
    const m = mode;
    mode = "open";
    switch (m) {
      case "kickoff":
        return doPass(pickReceiver(tm, k, "back"));
      case "throw":
        return doPass(pickReceiver(tm, k, "near"), "t");
      case "goalkick":
        return rng.chance(0.3 + tm.style * 0.4) ? doLong(k) : doPass(pickReceiver(tm, k, "near"));
      case "corner":
        return doCross(k, true);
      case "penalty":
        return doPenalty(k);
      case "freekick": {
        const dist = goalDist(tm, bx, by);
        if (dist < 32 && depth(tm, bx) > 0.68) {
          const wide = Math.abs(by - CY) > 160;
          if (!wide && rng.chance(0.55)) return doShot(k, 0.065 * clamp(1 - (dist - 18) / 25, 0.3, 1.2), "fk");
          return doCross(k, false);
        }
        return depth(tm, bx) > 0.55 && rng.chance(0.4) ? doCross(k, false) : doPass(pickReceiver(tm, k, "any"));
      }
      case "indirect":
        return doPass(pickReceiver(tm, k, "any"));
    }
    if (s === 0) return rng.chance(0.28 + tm.style * 0.35) ? doLong(k) : doPass(pickReceiver(tm, k, "near"));
    const d = depth(tm, bx);
    const xg = xgAt(tm, bx, by);
    const dist = goalDist(tm, bx, by);
    const wide = Math.abs(by - CY) > 190;
    const role = tm.spots[s].role;
    const forward = /ST|SS|W|AM/.test(role);
    const pShoot = d > 0.6 ? clamp(xg * 5.6, 0, 0.85) + (dist > 17 && dist < 31 ? 0.05 + (forward ? 0.035 : 0) : 0) : 0;
    if (rng.chance(pShoot)) return doShot(k, xg, dist > 20 ? "long" : "open");
    const choice = rng.weighted([
      0.6, // pass
      d > 0.7 && wide ? 0.62 : 0, // cross
      0.1 + (forward ? 0.08 : 0) + (pressureOn(k) < 0.3 ? 0.05 : 0), // dribble
      d < 0.45 ? 0.04 + tm.style * 0.09 : 0.015, // long
      d > 0.4 && d < 0.8 ? 0.065 + (forward ? 0 : 0.03) : 0, // through
    ]);
    if (choice === 1) return doCross(k, false);
    if (choice === 2) return doDribble(k);
    if (choice === 3) return doLong(k);
    if (choice === 4) return doThrough(k);
    return doPass(pickReceiver(tm, k, "any"));
  }

  function statsRow(tm: Team, total: number): number[] {
    const s = tm.st;
    return [Math.round((s.poss / Math.max(1, total)) * 100), s.shots, s.sot, s.corners, s.fouls, s.yellow, s.red, s.offside];
  }
  const STAT_LABELS = ["Possession %", "Shots", "On target", "Corners", "Fouls", "Yellow cards", "Red cards", "Offsides"];
  function statsEvent(k: string, tx: string) {
    const total = teams[0].st.poss + teams[1].st.poss;
    const a = statsRow(teams[0], total);
    const b = statsRow(teams[1], total);
    b[0] = 100 - a[0];
    ev(k, undefined, tx, { st: [a, b], sl: STAT_LABELS });
  }

  function playHalf(half: 1 | 2, kicking: 0 | 1) {
    const [rs, re] = half === 1 ? FOOTBALL.h1 : FOOTBALL.h2;
    halfStart = rs;
    halfEnd = re;
    clockStart = half === 1 ? 0 : 2700;
    clockLen = 2700 + added[half - 1] * 60;
    ph = half === 1 ? 1 : 3;
    teams[0].dir = half === 1 ? 1 : -1;
    teams[1].dir = half === 1 ? -1 : 1;
    t = rs;
    const out = new Float64Array(44);
    kickoffTargets(kicking, out);
    pos.set(out);
    bx = W / 2;
    by = CY;
    bh = 0;
    poss = kicking;
    carrier = strikerOf(teams[kicking]);
    mode = "kickoff";
    ev("kickoff", kicking, say(half === 1 ? L.kickoff : L.kickoff2, { team: teams[kicking].name }));
    emit();
    let board = false;
    while (t < re - 400) {
      if (!board && clockAt(t + 900) >= clockStart + 2700) {
        board = true;
        const n = added[half - 1];
        ev("board", undefined, say(L.board, { n: n === 1 ? "1 minute" : `${n} minutes` }));
      }
      step();
    }
    // Whistle wherever the ball is.
    bh = 0;
    carrier = -1;
    t = Math.max(t + 200, re);
  }

  // ------------------------------------------------------------ the match
  const first = rng.chance(0.5) ? 0 : 1;
  playHalf(1, first as 0 | 1);
  ph = 2;
  statsEvent("ht", say(L.ht, { home: teams[0].short, away: teams[1].short, s0: score[0], s1: score[1] }));
  emit();
  // Off to the tunnel and back out, now attacking the other way.
  const tunnel = new Float64Array(44);
  for (let k = 0; k < 22; k++) {
    tunnel[2 * k] = W / 2 + rng.range(-60, 60);
    tunnel[2 * k + 1] = H + 40 + rng.range(0, 25);
  }
  bx = W / 2;
  by = CY;
  walk(tunnel, Math.max(2000, FOOTBALL.ht[0] + 12_000 - t), 12);
  hold(FOOTBALL.ht[0] + 16_000);
  teams[0].dir = -1;
  teams[1].dir = 1;
  const back = new Float64Array(44);
  kickoffTargets((1 - first) as 0 | 1, back);
  walk(back, Math.max(2000, FOOTBALL.h2[0] - 600 - t), 12);
  playHalf(2, (1 - first) as 0 | 1);
  ph = 4;
  statsEvent("ft", say(L.ft, { home: teams[0].short, away: teams[1].short, s0: score[0], s1: score[1] }));
  emit();
  // Handshakes in the middle, then off.
  const mid = new Float64Array(44);
  for (let k = 0; k < 22; k++) {
    mid[2 * k] = W / 2 + rng.range(-120, 120);
    mid[2 * k + 1] = CY + rng.range(-110, 110);
  }
  walk(mid, Math.max(2000, FOOTBALL.end - 500 - t), 8);

  const [h, a] = score;
  const winner = h > a ? "home" : h < a ? "away" : "draw";
  const list = (s: 0 | 1) =>
    goals
      .filter((g) => g.s === s)
      .map((g) => `${g.who} ${g.min}${g.how}`)
      .join(", ");
  const total = teams[0].st.poss + teams[1].st.poss;
  const possH = Math.round((teams[0].st.poss / Math.max(1, total)) * 100);
  let summary = `${match.home.name} ${h}–${a} ${match.away.name}.`;
  if (goals.length) {
    const hs = list(0);
    const as = list(1);
    summary += ` Goals: ${[hs && `${match.home.short}: ${hs}`, as && `${match.away.short}: ${as}`].filter(Boolean).join("; ")}.`;
  } else summary += " A goalless draw.";
  summary += ` Possession ${possH}%–${100 - possH}%.`;
  return { frames, result: { winner, score: `${h}–${a}`, summary } };
}
