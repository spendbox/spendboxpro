// Boxing engine: up to six three-minute rounds. Two fighters with health, stamina, power,
// speed, chin and guard trade jabs, crosses, hooks, uppercuts and body shots. Knockdowns get a
// ten count; three in a round, a referee stoppage or a corner retirement end it early;
// otherwise three judges score every round 10-9.

import type { Rng } from "../rng";
import { fighterProfile, type FighterProfile } from "../teams";
import { BOXING, roundStart } from "../timeline";
import type { BoxingFrame, MatchEvent, MatchInfo, MatchResult } from "../types";
import { clamp, lerp, makeSay } from "./common";

const R = 1000;
const PUNCH = ["jab", "cross", "hook", "uppercut", "body shot"] as const;
const BASE_LAND = [0.33, 0.29, 0.27, 0.24, 0.35];
const BASE_DMG = [1.2, 3.1, 3.7, 4.1, 1.7];
/** Health lost per point of punch damage. */
const HURT = 0.48;

type Fighter = {
  i: 0 | 1;
  name: string;
  short: string;
  p: FighterProfile;
  power: number;
  speed: number;
  chin: number;
  engine: number;
  guard: number;
  hp: number;
  sp: number;
  kd: number;
  kdRound: number;
  thrown: number;
  landed: number;
  power_landed: number;
  roundScore: number;
  recentHits: number;
};

const L = {
  introRed: ["In the red corner, from {town}, {rec}... {name}!", "Fighting out of the red corner, {rec}, from {town}: {name}!"],
  introBlue: ["And in the blue corner, from {town}, {rec}... {name}!", "His opponent, in the blue corner, {rec}, from {town}: {name}!"],
  seconds: ["Seconds out... here we go!", "The referee calls them together. Touch gloves, and we're ready."],
  bell: ["Round {r}!", "Ding ding, round {r}.", "Here comes round {r}."],
  last: ["Final round! Everything to fight for.", "Round 6, the last one. Who wants it more?"],
  big: [
    "Huge right hand from {p}!",
    "{p} lands a crunching {punch}!",
    "{p} snaps {q}'s head back with a {punch}!",
    "{p} rocks {q}!",
    "Big {punch} from {p}! The crowd are on their feet!",
  ],
  body: ["{p} digs a brutal shot to the body.", "{p} goes downstairs, {q} winces.", "Thudding body shot from {p}."],
  combo: ["{p} lets the hands go, a lovely combination!", "One-two-three from {p}!", "{p} puts together a fast flurry."],
  jab: ["{p} working behind the jab.", "{p} pumping out the jab nicely.", "{p} finding a home for the jab."],
  slip: ["{q} slips the {punch} and makes {p} miss.", "Great defence from {q}.", "{p} swings and misses!"],
  down: ["DOWN GOES {Q}! {p} drops him with a {punch}!", "{q} is DOWN! What a {punch} from {p}!", "{p} puts {q} on the canvas!"],
  up: ["{q} beats the count at {n}.", "{q} is up at {n}... but is he OK?", "{q} gets up at {n}, legs a bit wobbly."],
  ko: ["It's all over! {q} can't beat the count! {p} wins by KNOCKOUT!", "TEN! {q} is counted out! {p} wins by KO!"],
  tko: ["The referee steps in to save {q}! {p} wins by TKO!", "That's enough, the referee waves it off! TKO win for {p}!"],
  three: ["Three knockdowns in the round! It's over, {p} wins by TKO!"],
  rtd: ["{q}'s corner pulls him out! {p} wins by TKO (retirement).", "{q} won't come out for the next round. {p} wins!"],
  clinch: ["They tie up, the referee breaks them.", "{q} holds on and the referee separates them.", "A clinch in the middle of the ring."],
  tired: ["{p} looks tired.", "{p} is breathing heavily now.", "{p}'s hands are dropping."],
  endRound: ["That's the end of round {r}. A good round for {p}.", "Bell! Round {r} goes to {p} on my card.", "End of round {r}, close one, maybe {p}."],
  cards: ["We go to the judges' scorecards..."],
  decision: ["{scores}: {how} decision, {p} wins!", "The judges score it {scores}. Winner by {how} decision: {p}!"],
};

export function simBoxing(match: MatchInfo, rng: Rng): { frames: BoxingFrame[]; result: MatchResult } {
  const say = makeSay(rng);
  const frames: BoxingFrame[] = [];
  const mk = (i: 0 | 1): Fighter => {
    const side = i === 0 ? match.home : match.away;
    const p = fighterProfile("boxing", side.name);
    const form = rng.normal() * 4;
    const r = (v: number) => clamp(v + form + rng.normal() * 2, 35, 99);
    return {
      i,
      name: side.name,
      short: side.short,
      p,
      power: r(p.power),
      speed: r(p.speed),
      chin: r(p.chin),
      engine: r(p.engine),
      guard: r(p.guard),
      hp: 100,
      sp: 100,
      kd: 0,
      kdRound: 0,
      thrown: 0,
      landed: 0,
      power_landed: 0,
      roundScore: 0,
      recentHits: 0,
    };
  };
  const F: [Fighter, Fighter] = [mk(0), mk(1)];
  // Three judges, each with their own taste.
  const judges = [0, 1, 2].map(() => ({ bias: rng.normal() * 0.6, cards: [0, 0] as number[] }));

  let t = 0;
  let r = 0;
  let ph = 0;
  let pending: MatchEvent[] = [];
  // Ring geometry: centre of the action, the axis between the fighters, their distance.
  let cx = 500;
  let cy = 500;
  let ang = Math.PI / 4;
  let dist = 260;
  const pos = [180, 180, 45, 820, 820, 225];
  let lastTalk = 0;

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
  const clockNow = () => (r >= 1 && (ph === 1 || ph === 3) ? clamp(((t - roundStart(r)) / BOXING.round) * BOXING.roundSec, 0, BOXING.roundSec) : 0);
  function emit(extra?: Partial<BoxingFrame>) {
    const f: BoxingFrame = {
      t: Math.round(t),
      r,
      c: Math.round(clockNow()),
      ph,
      f: pos.map((v) => Math.round(v)),
      hp: [Math.round(F[0].hp), Math.round(F[1].hp)],
      sp: [Math.round(F[0].sp), Math.round(F[1].sp)],
      kd: [F[0].kd, F[1].kd],
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
  const setPunch = (pu: number[]) => {
    const last = frames[frames.length - 1];
    if (last) last.pu = pu;
  };

  function place() {
    const dx = Math.cos(ang) * (dist / 2);
    const dy = Math.sin(ang) * (dist / 2);
    pos[0] = clamp(cx - dx, 60, R - 60);
    pos[1] = clamp(cy - dy, 60, R - 60);
    pos[3] = clamp(cx + dx, 60, R - 60);
    pos[4] = clamp(cy + dy, 60, R - 60);
    const a = Math.atan2(pos[4] - pos[1], pos[3] - pos[0]);
    pos[2] = (a * 180) / Math.PI;
    pos[5] = pos[2] + 180;
  }

  function walk(to: number[], total: number, extra?: Partial<BoxingFrame>) {
    const from = pos.slice();
    const steps = Math.max(1, Math.ceil(total / 900));
    for (let s = 1; s <= steps; s++) {
      t += total / steps;
      const u = s / steps;
      const e = u * u * (3 - 2 * u);
      for (let k = 0; k < 6; k++) pos[k] = lerp(from[k], to[k], e);
      emit(extra);
    }
  }
  const hold = (until: number, extra?: Partial<BoxingFrame>) => {
    while (t + 900 <= until) {
      t += 900;
      emit(extra);
    }
  };

  let finish: { winner: 0 | 1; how: "KO" | "TKO" | "RTD" | "DEC"; detail: string } | null = null;

  /** A knockdown: the ten count. Returns true if they got up. */
  function knockdown(down: Fighter, by: Fighter, punch: string, dmg: number): boolean {
    down.kd++;
    down.kdRound++;
    by.roundScore += 3;
    ev("down", by.i, say(L.down, { p: by.short, q: down.short, Q: down.short.toUpperCase(), punch }));
    ph = 3;
    // The other fighter goes to a neutral corner.
    const neutral = by.i === 0 ? [880, 120] : [120, 880];
    const to = pos.slice();
    to[by.i * 3] = neutral[0];
    to[by.i * 3 + 1] = neutral[1];
    t += 500;
    emit({ dn: down.i });
    walk(to, 1000, { dn: down.i });
    if (down.kdRound >= 3) {
      finish = { winner: by.i, how: "TKO", detail: "three knockdowns" };
      ev("tko", by.i, say(L.three, { p: by.short, q: down.short }));
      emit({ dn: down.i });
      return false;
    }
    // Will they get up? Depends on health, chin and how many times they've been down.
    const toughness = down.hp / 100 + (down.chin - 70) / 100 - down.kd * 0.12 - Math.max(0, dmg - 4) / 5 + rng.normal() * 0.25;
    const getsUp = toughness > -0.1;
    const upAt = getsUp ? clamp(Math.round(9 - toughness * 9 + rng.range(-1, 1)), 2, 9) : 11;
    for (let n = 1; n <= 10; n++) {
      t += 520;
      if (n === upAt) {
        emit({ n, dn: down.i });
        ev("up", down.i, say(L.up, { q: down.short, n }));
        down.hp = Math.min(100, down.hp + 9 + down.chin / 15);
        down.sp = Math.min(100, down.sp + 6);
        ph = 1;
        t += 600;
        emit();
        return true;
      }
      emit({ n, dn: down.i });
    }
    finish = { winner: by.i, how: "KO", detail: `${punch}` };
    ev("ko", by.i, say(L.ko, { p: by.short, q: down.short }));
    return false;
  }

  function exchange(): boolean {
    const [a, b] = F;
    // Who's working? Busier, fresher fighters throw more.
    const act = (f: Fighter) => (f.speed / 70) * (0.45 + (f.sp / 100) * 0.55) * (f.p.style === "slugger" || f.p.style === "pressure fighter" ? 1.12 : 1) * (0.7 + (f.hp / 100) * 0.3);
    const wa = act(a);
    const wb = act(b);
    const idle = 0.22;
    const pick = rng.weighted([wa, wb, idle * (wa + wb)]);
    // Movement first.
    const aggressor = rng.chance(wa / (wa + wb)) ? a : b;
    const push = rng.range(5, 32) * (aggressor.i === 0 ? 1 : -1);
    cx += Math.cos(ang) * push;
    cy += Math.sin(ang) * push;
    ang += rng.normal() * 0.18;
    // Near the ropes: pivot out and drift back to the middle.
    for (const k of [0, 3]) {
      if (pos[k] < 150 || pos[k] > 850 || pos[k + 1] < 150 || pos[k + 1] > 850) {
        ang += (rng.chance(0.5) ? 1 : -1) * 0.4;
        cx = lerp(cx, 500, 0.25);
        cy = lerp(cy, 500, 0.25);
      }
    }
    cx = clamp(cx, 200, 800);
    cy = clamp(cy, 200, 800);
    if (pick === 2) {
      dist = rng.range(210, 290);
      place();
      for (const f of F) f.sp = Math.min(100, f.sp + 0.35 * (f.engine / 70));
      t += rng.range(380, 620);
      emit();
      if (rng.chance(0.04)) {
        dist = 105;
        place();
        if (t - lastTalk > 10_000) ev("clinch", undefined, say(L.clinch, { q: F[rng.int(0, 1)].short }));
        t += 600;
        emit();
      }
      return true;
    }
    const att = F[pick];
    const def = F[1 - pick];
    dist = rng.range(150, 200);
    place();
    const style = att.p.style;
    const w = [0.46, 0.2, 0.15, 0.07, 0.12];
    if (style === "slugger") {
      w[0] = 0.3;
      w[2] = 0.22;
      w[3] = 0.11;
    } else if (style === "out-boxer") {
      w[0] = 0.58;
    } else if (style === "pressure fighter") w[4] = 0.2;
    const type = rng.weighted(w);
    const hand = type === 0 ? 0 : type === 1 ? 1 : rng.chance(0.5) ? 0 : 1;
    att.thrown++;
    att.sp = Math.max(0, att.sp - (type === 0 ? 0.35 : 0.8) * (70 / att.engine));
    const land =
      BASE_LAND[type] *
      Math.pow(att.speed / def.guard, 0.7) *
      (0.62 + (att.sp / 100) * 0.38) *
      (1.12 - (def.sp / 100) * 0.25) *
      (1.15 - (def.hp / 100) * 0.2);
    const landed = rng.chance(clamp(land, 0.05, 0.75));
    let result = 0;
    let dmg = 0;
    if (landed) {
      dmg = BASE_DMG[type] * (att.power / 72) * rng.range(0.55, 1.45) * (1 + (1 - def.sp / 100) * 0.5);
      result = dmg > 6.2 ? 3 : 2;
      att.landed++;
      if (type) att.power_landed++;
      att.roundScore += type === 0 ? 0.6 : 1.4 + dmg * 0.1;
      def.hp = Math.max(0, def.hp - dmg * HURT * Math.pow(75 / def.chin, 0.7));
      if (type === 4) def.sp = Math.max(0, def.sp - rng.range(2.5, 6));
      def.recentHits = type ? def.recentHits + 1 : def.recentHits;
    } else {
      result = rng.chance(0.55) ? 1 : 0;
      def.recentHits = Math.max(0, def.recentHits - 0.5);
    }
    setPunch([att.i, hand, type, result]);
    const vars = { p: att.short, q: def.short, punch: PUNCH[type] };
    if (result === 3 && t - lastTalk > 2500) ev("big", att.i, say(type === 4 ? L.body : L.big, vars));
    else if (landed && type === 4 && rng.chance(0.12) && t - lastTalk > 6000) ev("body", att.i, say(L.body, vars));
    else if (!landed && type >= 2 && rng.chance(0.06) && t - lastTalk > 7000) ev("slip", def.i, say(L.slip, vars));
    else if (landed && type === 0 && rng.chance(0.03) && t - lastTalk > 9000) ev("jab", att.i, say(L.jab, vars));
    if (att.sp < 30 && rng.chance(0.03) && t - lastTalk > 9000) ev("tired", att.i, say(L.tired, { p: att.short }));
    t += type === 0 ? rng.range(300, 420) : rng.range(380, 560);
    emit();
    // Knockdown?
    if (landed && type >= 1 && type <= 3) {
      const hurt = 1 - def.hp / 100;
      const pKd = clamp(clamp((dmg - 2.8) / 4, 0, 1.2) * (0.07 + 0.34 * hurt * hurt) * Math.pow(82 / def.chin, 1.5), 0, 0.5);
      if (rng.chance(pKd)) {
        if (!knockdown(def, att, PUNCH[type], dmg)) return false;
        // Back to the middle after the count.
        cx = 500;
        cy = 500;
        dist = 260;
        const to = pos.slice();
        const dx = Math.cos(ang) * 130;
        const dy = Math.sin(ang) * 130;
        to[0] = 500 - dx;
        to[1] = 500 - dy;
        to[3] = 500 + dx;
        to[4] = 500 + dy;
        walk(to, 800);
        return true;
      }
    }
    // Referee stoppage: a hurt fighter taking unanswered shots.
    if (def.hp < 20 && def.recentHits >= 3 && rng.chance(0.3)) {
      finish = { winner: att.i, how: "TKO", detail: "referee stoppage" };
      ev("tko", att.i, say(L.tko, { p: att.short, q: def.short }));
      emit();
      return false;
    }
    // Combination: a quick follow-up punch.
    if (rng.chance(0.28 * (att.sp / 100) + (landed ? 0.12 : 0)) && clockNow() < BOXING.roundSec - 3) {
      const t2 = rng.weighted([0.25, 0.35, 0.3, 0.1, 0]);
      const hand2 = 1 - hand;
      const land2 = rng.chance(clamp(BASE_LAND[t2] * 1.05 * Math.pow(att.speed / def.guard, 0.7), 0.05, 0.7));
      att.thrown++;
      att.sp = Math.max(0, att.sp - 0.7);
      let res2 = rng.chance(0.55) ? 1 : 0;
      if (land2) {
        const d2 = BASE_DMG[t2] * (att.power / 72) * rng.range(0.5, 1.3);
        res2 = d2 > 6.2 ? 3 : 2;
        att.landed++;
        att.power_landed += t2 ? 1 : 0;
        att.roundScore += t2 ? 1.2 : 0.5;
        def.hp = Math.max(0, def.hp - d2 * HURT * Math.pow(75 / def.chin, 0.7));
        if (landed && t - lastTalk > 5000 && rng.chance(0.3)) ev("combo", att.i, say(L.combo, vars));
      }
      setPunch([att.i, hand2, t2, res2]);
      t += rng.range(260, 340);
      emit();
    }
    return true;
  }

  function corners() {
    return [110, 110, 45, 890, 890, 225];
  }

  // ------------------------------------------------------------ the fight
  // Introductions.
  for (let k = 0; k < 6; k++) pos[k] = corners()[k];
  emit();
  t = 1200;
  ev("intro", 0, say(L.introRed, { town: F[0].p.hometown, rec: F[0].p.record, name: F[0].name }));
  emit();
  hold(4500);
  t = 4600;
  ev("intro", 1, say(L.introBlue, { town: F[1].p.hometown, rec: F[1].p.record, name: F[1].name }));
  emit();
  hold(7800);
  ev("seconds", undefined, say(L.seconds, {}));
  walk([380, 380, 45, 620, 620, 225], BOXING.intro - 400 - t);

  for (r = 1; r <= BOXING.rounds && !finish; r++) {
    const rs = roundStart(r);
    t = Math.max(t, rs);
    ph = 1;
    F[0].kdRound = 0;
    F[1].kdRound = 0;
    F[0].roundScore = 0;
    F[1].roundScore = 0;
    cx = 500;
    cy = 500;
    ang = Math.atan2(pos[4] - pos[1], pos[3] - pos[0]);
    dist = 240;
    ev("bell", undefined, say(r === BOXING.rounds ? L.last : L.bell, { r }), { n: r });
    place();
    emit();
    while (t < rs + BOXING.round - 300 && !finish) {
      if (!exchange()) break;
    }
    if (finish) break;
    // End of the round: score it.
    t = Math.max(t, rs + BOXING.round);
    ph = 2;
    const diff = F[0].roundScore - F[1].roundScore;
    for (const j of judges) {
      const d = diff + j.bias + rng.normal() * 2.2;
      let a = 10;
      let b = 10;
      if (Math.abs(d) >= 0.7) {
        if (d > 0) b = 9;
        else a = 9;
      }
      a -= F[0].kdRound;
      b -= F[1].kdRound;
      if (F[0].kdRound && F[1].kdRound === 0 && b === 9 && a < 10) {
        // A knockdown round for the other fighter.
        b = 10;
      }
      j.cards[0] += a;
      j.cards[1] += b;
    }
    const better = diff >= 0 ? F[0] : F[1];
    ev("endround", undefined, say(L.endRound, { r, p: better.short }), { n: r });
    emit();
    walk(corners(), 1800);
    // Recover on the stool.
    for (const f of F) {
      f.hp = Math.min(100, f.hp + 3 + f.engine / 25);
      f.sp = Math.min(100, f.sp + 22 + f.engine / 8);
      f.recentHits = 0;
    }
    if (r < BOXING.rounds) {
      for (const f of F) {
        if (f.hp < 24 && f.kd >= 1 && rng.chance(0.35)) {
          const other = F[1 - f.i];
          finish = { winner: other.i, how: "RTD", detail: "corner retirement" };
          ev("rtd", other.i, say(L.rtd, { p: other.short, q: f.short }));
          t += 1500;
          emit();
          break;
        }
      }
      if (finish) break;
      hold(roundStart(r + 1) - 1500);
      walk([380, 380, 45, 620, 620, 225], roundStart(r + 1) - 200 - t);
    }
  }

  // ------------------------------------------------------------ the result
  r = Math.min(r, BOXING.rounds);
  ph = 4;
  let scores = "";
  if (!finish) {
    t += 600;
    ev("cards", undefined, say(L.cards, {}));
    emit();
    hold(t + 3600);
    let wins0 = 0;
    let wins1 = 0;
    for (const j of judges) {
      if (j.cards[0] > j.cards[1]) wins0++;
      else if (j.cards[1] > j.cards[0]) wins1++;
    }
    let winner: 0 | 1;
    let how: string;
    if (wins0 === wins1) {
      // A draw on the cards: the fighter who landed more gets the nod on a split decision.
      winner = F[0].landed >= F[1].landed ? 0 : 1;
      const j = judges.find((x) => x.cards[0] === x.cards[1]) ?? judges[2];
      j.cards[winner] += 1;
      how = "split";
    } else {
      winner = wins0 > wins1 ? 0 : 1;
      const lost = winner === 0 ? wins1 : wins0;
      const won = winner === 0 ? wins0 : wins1;
      how = won === 3 ? "unanimous" : lost === 0 ? "majority" : "split";
    }
    scores = judges.map((j) => `${j.cards[winner]}–${j.cards[1 - winner]}`).join(", ");
    finish = { winner, how: "DEC", detail: how };
    ev("decision", winner, say(L.decision, { scores, how, p: F[winner].name }));
    emit();
  } else {
    t += 400;
    emit();
  }
  const fin = finish as { winner: 0 | 1; how: "KO" | "TKO" | "RTD" | "DEC"; detail: string };
  ev("final", fin.winner, undefined, {
    st: [
      [F[0].thrown, F[0].landed, F[0].power_landed, F[1].kd],
      [F[1].thrown, F[1].landed, F[1].power_landed, F[0].kd],
    ],
    sl: ["Punches thrown", "Punches landed", "Power punches landed", "Knockdowns scored"],
  });
  t += 300;
  emit(fin.how === "KO" ? { dn: 1 - fin.winner } : undefined);
  const w = F[fin.winner];
  const l = F[1 - fin.winner];
  // The winner celebrates, the loser goes back to the corner.
  const loser = l.i === 0 ? [110, 110] : [890, 890];
  const lap = [
    [500, 500],
    [300, 700],
    [700, 300],
    [500, 500],
  ];
  let step = 0;
  const lieUntil = fin.how === "KO" ? t + 4000 : t;
  while (t < BOXING.end - 900) {
    const to = pos.slice();
    const p = lap[step++ % lap.length];
    to[w.i * 3] = p[0];
    to[w.i * 3 + 1] = p[1];
    if (t > lieUntil) {
      to[l.i * 3] = loser[0];
      to[l.i * 3 + 1] = loser[1];
    }
    walk(to, Math.min(1800, BOXING.end - 300 - t), t < lieUntil ? { dn: l.i } : undefined);
  }

  const roundOf = frames.length ? frames[frames.length - 1].r : r;
  const minute = (() => {
    const last = [...frames].reverse().find((f) => f.ph === 1 || f.ph === 3);
    if (!last) return "";
    const s = Math.round(last.c);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  })();
  let score: string;
  let summary: string;
  if (fin.how === "DEC") {
    score = `Points (${scores})`;
    summary = `${w.name} beat ${l.name} by ${fin.detail} decision (${scores}).`;
  } else {
    const kind = fin.how === "KO" ? "KO" : "TKO";
    score = `${kind} · Round ${roundOf}`;
    summary =
      fin.how === "RTD"
        ? `${w.name} beat ${l.name} by TKO: ${l.short}'s corner retired him after round ${roundOf}.`
        : `${w.name} beat ${l.name} by ${kind} in round ${roundOf} (${minute})${fin.how === "KO" ? `, ${/^[aeiou]/.test(fin.detail) ? "an" : "a"} ${fin.detail} did it` : ""}.`;
  }
  summary += ` Punches landed ${F[0].landed}–${F[1].landed}.`;
  return { frames, result: { winner: fin.winner === 0 ? "home" : "away", score, summary } };
}
