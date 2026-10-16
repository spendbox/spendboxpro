// The Spirit Realm's battle (docs/REALM.md). It lasts the whole hour. Players send troops in waves:
// each wave comes through a portal at the spot its player picked inside the arena, then marches on
// the middle. Fighters go for the nearest enemy they can see and hit it until one of them falls.
// Wild spirits roam in every few minutes too, so there is always something to fight. Every enemy
// fighter an army brings down scores its price in points; the most points win.
//
// The battle is worked out the same way, step by step, on the server (who won, who is paid) and on
// every phone (what you watch on the map), from the same armies, waves and seed. So watching costs
// the server next to nothing: a phone fetches an arena's waves now and then and plays the battle
// by itself, and thousands of people can watch or fight at once.
//
// To come out the same everywhere it only uses + - * / and Math.sqrt (exact in every browser),
// never Math.sin, Math.random or the order of an object's keys.

import { COUNTER, FIGHTERS, upgradeBoost, type Army, type FighterId, type Nature } from "./fighters.ts";
import { BATTLE_SECS } from "./schedule.ts";

/** Seconds of battle per step. */
export const DT = 0.25;
export const STEPS = Math.round(BATTLE_SECS / DT);
/** The arena's radius (battle units; the map draws it bigger or smaller). */
export const ARENA_R = 100;
/** How far fighters see an enemy from. */
const SIGHT = 45;
const CELL = 15;
const CELLS = 16;
/** Cells to look through for an enemy in sight. */
const LOOK = Math.ceil(SIGHT / CELL);
/** Fighters in a squad, and most squads of one kind in a wave. */
const SQUAD = 20;
const SQUADS_OF_KIND = 3;
/** Most squads in an arena at once (waves beyond it don't come through). */
export const MAX_SQUADS = 1500;
/** Damage is scaled down so fights last long enough to watch. */
const POWER = 0.25;
/** Wild spirits come in this often (steps), from the edge. */
const WILD_EVERY = 1200;
const WILD_FIRST = 120;

// Twelve points round the edge, 12 o'clock first and on clockwise (screen y, map z, points down).
const H = 0.8660254037844386;
const EDGE: readonly (readonly [number, number])[] = [
  [0, -1], [0.5, -H], [H, -0.5], [1, 0], [H, 0.5], [0.5, H], [0, 1], [-0.5, H], [-H, 0.5], [-1, 0], [-H, -0.5], [-0.5, -H],
];

/** A player in the battle (id: their place in the queue, as a string). Wild spirits are WILD. */
export type BattleArmy = { id: string; name: string };
export const WILD = "wild";
/** Troops sent in: by which player (their index in the armies), the step they come through, where (battle units from the middle). */
export type Wave = { by: number; n: number; step: number; x: number; y: number; troops: Army };
export type BattleInput = { seed: number; armies: BattleArmy[]; waves: Wave[] };

export type Squad = {
  army: number;
  /** Index in FIGHTERS. */
  kind: number;
  nature: Nature;
  x: number;
  y: number;
  hp: number;
  /** Health of one fighter in it (armour included). */
  unitHp: number;
  /** Damage one fighter does each second (weapons included). */
  atk: number;
  range: number;
  speed: number;
  cost: number;
  /** The squad it's going for (-1: none in sight, heading for the middle). */
  target: number;
  /** Hitting its target this step (not just walking to it). */
  hitting: boolean;
  /** Damage taken this step (for the flash). */
  took: number;
  /** The step it came through its portal. */
  born: number;
  /** Where it was a step ago (for drawing it smoothly between steps). */
  px: number;
  py: number;
};

export type ArmyState = {
  id: string;
  name: string;
  /** What it has sent in so far (its fighters' prices). */
  sent: number;
  /** What's left of it on the field now. */
  now: number;
  /** Enemy fighters brought down (their prices): the score. */
  points: number;
};

/** A small, fast random number maker, the same everywhere for the same seed. */
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alive = (s: Squad) => (s.hp > 0 ? Math.ceil(s.hp / s.unitHp) : 0);
/** How much room a squad takes (more fighters: a bigger crowd). */
export const squadRadius = (s: Squad) => 1.5 + 0.5 * Math.sqrt(alive(s));
export const squadAlive = alive;
const dist2 = (a: Squad, b: Squad) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** Waves in the order they come through (the same order on every phone and the server). */
const waveOrder = (a: Wave, b: Wave) => a.step - b.step || a.by - b.by || a.n - b.n;

/** Is a spot inside the arena (where troops may be sent)? */
export const inArena = (x: number, y: number) => x * x + y * y <= ARENA_R * ARENA_R;

/** The wild spirits that come in (the later in the hour, the more of them). */
function wildTroops(k: number): Army {
  const m = 1 + Math.floor(k / 3);
  const picks: Partial<Record<FighterId, number>>[] = [
    { ghost: 6 * m, wolf: 6 * m },
    { ghost: 8 * m, devil: 1 + m },
    { wolf: 10 * m, angel: m },
    { ghost: 5 * m, giant: m },
  ];
  return { fighters: picks[k % picks.length], weapons: Math.min(3, Math.floor(k / 4)), armour: 0 };
}

export class Battle {
  squads: Squad[] = [];
  readonly armies: ArmyState[] = [];
  /** Waves still to come through (in order). */
  readonly pending: Wave[] = [];
  /** Waves that came through (for the portals' flash). */
  readonly arrived: Wave[] = [];
  step = 0;
  private readonly seed: number;

  constructor(input: BattleInput) {
    this.seed = input.seed;
    // The wild spirits are army 0; the players follow in queue order.
    this.armies.push({ id: WILD, name: "Wild spirits", sent: 0, now: 0, points: 0 });
    for (const a of input.armies) this.addArmy(a);
    const rand = rng(input.seed);
    for (let k = 0, s = WILD_FIRST; s < STEPS - 400; k++, s += WILD_EVERY) {
      const [ex, ey] = EDGE[Math.floor(rand() * EDGE.length)];
      this.pending.push({ by: -1, n: k, step: s, x: ex * ARENA_R * 0.95, y: ey * ARENA_R * 0.95, troops: wildTroops(k) });
    }
    for (const w of input.waves) this.pending.push(w);
    this.pending.sort(waveOrder);
  }

  /** A player who joined after the battle was set up (players only ever join at the end of the list). */
  addArmy(a: BattleArmy) {
    this.armies.push({ id: a.id, name: a.name, sent: 0, now: 0, points: 0 });
  }

  /** Troops sent after the battle was set up. False if they should already have come through (start again from the beginning). */
  addWave(w: Wave): boolean {
    if (w.step < this.step) return false;
    this.pending.push(w);
    this.pending.sort(waveOrder);
    return true;
  }

  /** Over: the hour is up. */
  get done() {
    return this.step >= STEPS;
  }

  private bringIn(w: Wave) {
    const ai = w.by < 0 ? 0 : w.by + 1;
    const army = this.armies[ai];
    if (!army) return;
    // The way to the middle from the portal (straight down when it's right in the middle).
    const d = Math.sqrt(w.x * w.x + w.y * w.y);
    const ux = d > 1 ? -w.x / d : 0;
    const uy = d > 1 ? -w.y / d : 1;
    const groups: { k: number; n: number }[] = [];
    FIGHTERS.forEach((f, k) => {
      const n = w.troops.fighters[f.id] ?? 0;
      if (n <= 0) return;
      const parts = Math.min(SQUADS_OF_KIND, Math.ceil(n / SQUAD));
      for (let p = 0; p < parts; p++) groups.push({ k, n: Math.floor(n / parts) + (p < n % parts ? 1 : 0) });
    });
    if (this.squads.length + groups.length > MAX_SQUADS) return;
    const cols = Math.min(5, groups.length);
    const rand = rng(this.seed ^ Math.imul(w.step + 1, 0x85ebca6b) ^ Math.imul(ai + 1, 0xc2b2ae35));
    groups.forEach(({ k, n }, j) => {
      const f = FIGHTERS[k];
      army.sent += f.cost * n;
      // In rows across the way to the middle, the first row in front.
      const along = ((j % cols) - (cols - 1) / 2) * 5;
      const back = Math.floor(j / cols) * 5;
      const unitHp = f.hp * upgradeBoost(w.troops.armour);
      const x = w.x - uy * along - ux * back + (rand() - 0.5);
      const y = w.y + ux * along - uy * back + (rand() - 0.5);
      this.squads.push({
        army: ai,
        kind: k,
        nature: f.nature,
        x,
        y,
        px: x,
        py: y,
        hp: unitHp * n,
        unitHp,
        atk: f.atk * upgradeBoost(w.troops.weapons) * POWER,
        range: f.range,
        speed: f.speed,
        cost: f.cost,
        target: -1,
        hitting: false,
        took: 0,
        born: this.step,
      });
    });
    this.arrived.push(w);
  }

  /** One step of the battle (DT seconds). */
  advance() {
    if (this.done) return;
    // The fallen are cleared away now and then (in the same steps everywhere), so a long battle stays quick.
    if (this.step % 200 === 0) this.sweep();
    while (this.pending.length && this.pending[0].step <= this.step) this.bringIn(this.pending.shift()!);
    const sq = this.squads;
    const n = sq.length;
    // Who is where, in a coarse grid, so looking for the nearest enemy stays quick with many armies.
    const grid: number[][] = Array.from({ length: CELLS * CELLS }, () => []);
    const cellOf = (v: number) => Math.max(0, Math.min(CELLS - 1, Math.floor((v + CELLS * CELL * 0.5) / CELL)));
    for (let i = 0; i < n; i++) if (sq[i].hp > 0) grid[cellOf(sq[i].y) * CELLS + cellOf(sq[i].x)].push(i);

    const nx = new Float64Array(n);
    const ny = new Float64Array(n);
    const dmg = new Float64Array(n);
    // Who hit whom, and how hard (for the points).
    const hits: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = sq[i];
      nx[i] = s.x;
      ny[i] = s.y;
      s.hitting = false;
      s.took = 0;
      if (s.hp <= 0) continue;
      // Keep going for the same enemy while it stands and is near; look again now and then
      // (a quarter of the squads each step), or when it falls.
      let t = s.target;
      const keep = t >= 0 && sq[t].hp > 0 && (this.step + i) % 4 !== 0;
      if (!keep || dist2(s, sq[t]) > SIGHT * SIGHT * 2.25) {
        t = -1;
        let best = SIGHT * SIGHT;
        const cx = cellOf(s.x);
        const cy = cellOf(s.y);
        for (let gy = Math.max(0, cy - LOOK); gy <= Math.min(CELLS - 1, cy + LOOK); gy++) {
          for (let gx = Math.max(0, cx - LOOK); gx <= Math.min(CELLS - 1, cx + LOOK); gx++) {
            for (const j of grid[gy * CELLS + gx]) {
              if (sq[j].army === s.army) continue;
              const d = dist2(s, sq[j]);
              if (d < best) {
                best = d;
                t = j;
              }
            }
          }
        }
      }
      s.target = t;
      // Nobody in sight: march on the middle.
      const tx = t >= 0 ? sq[t].x : 0;
      const ty = t >= 0 ? sq[t].y : 0;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = t >= 0 ? s.range + squadRadius(s) + squadRadius(sq[t]) : 3;
      if (t >= 0 && d <= reach) {
        s.hitting = true;
        const hit = alive(s) * s.atk * COUNTER[s.nature][sq[t].nature] * DT;
        dmg[t] += hit;
        hits.push(i, t, hit);
      } else if (d > 0) {
        const go = Math.min(s.speed * DT, d - reach * 0.9);
        if (go > 0) {
          nx[i] = s.x + (dx / d) * go;
          ny[i] = s.y + (dy / d) * go;
        }
      }
      // Squads don't stand on each other: a little shove apart from any it overlaps.
      const ri = squadRadius(s);
      const cx = cellOf(s.x);
      const cy = cellOf(s.y);
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(CELLS - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(CELLS - 1, cx + 1); gx++) {
          for (const j of grid[gy * CELLS + gx]) {
            if (j === i) continue;
            const ox = s.x - sq[j].x;
            const oy = s.y - sq[j].y;
            const room = ri + squadRadius(sq[j]);
            const od2 = ox * ox + oy * oy;
            if (od2 >= room * room) continue;
            if (od2 === 0) {
              nx[i] += i < j ? -0.2 : 0.2;
              continue;
            }
            const od = Math.sqrt(od2);
            const push = Math.min(0.6, (room - od) * 0.3);
            nx[i] += (ox / od) * push;
            ny[i] += (oy / od) * push;
          }
        }
      }
    }
    // The points: each hitter gets its share of the fighters its target lost.
    for (let h = 0; h < hits.length; h += 3) {
      const t = sq[hits[h + 1]];
      const lost = Math.min(dmg[hits[h + 1]], t.hp);
      this.armies[sq[hits[h]].army].points += ((hits[h + 2] / dmg[hits[h + 1]]) * lost * t.cost) / t.unitHp;
    }
    // Everyone moves and hits at the same moment, so the order of the squads doesn't matter.
    for (let i = 0; i < n; i++) {
      const s = sq[i];
      s.px = s.x;
      s.py = s.y;
      s.x = nx[i];
      s.y = ny[i];
      if (dmg[i] > 0 && s.hp > 0) {
        s.took = dmg[i];
        s.hp = Math.max(0, s.hp - dmg[i]);
      }
    }
    this.step++;
    for (const a of this.armies) a.now = 0;
    for (const s of sq) if (s.hp > 0) this.armies[s.army].now += (s.hp / s.unitHp) * s.cost;
  }

  /** Clear away the fallen squads (everyone looks for a target again). */
  private sweep() {
    if (this.squads.every((s) => s.hp > 0)) return;
    this.squads = this.squads.filter((s) => s.hp > 0);
    for (const s of this.squads) s.target = -1;
  }

  /** Play on to the step `to` (or the end). */
  runTo(to: number) {
    while (this.step < to && !this.done) this.advance();
  }

  /** The players (not the wild spirits) from first to last: most points first; level, the one that joined first. */
  ranking(): number[] {
    return this.armies
      .map((_, i) => i)
      .filter((i) => i > 0)
      .sort((i, j) => this.armies[j].points - this.armies[i].points || i - j);
  }
}

/** The whole battle at once (the server, to pay the winners): the players' ids from first to last, and their points. */
export function fightOut(input: BattleInput): { ranks: string[]; points: Record<string, number>; steps: number } {
  const b = new Battle(input);
  b.runTo(STEPS);
  const points: Record<string, number> = {};
  for (const a of b.armies.slice(1)) points[a.id] = Math.round(a.points * 100) / 100;
  return { ranks: b.ranking().map((i) => b.armies[i].id), points, steps: b.step };
}

/** Each arena's own seed, from the battle's. */
export const arenaSeed = (seed: number, arena: number) => (Math.imul(seed | 0, 1) ^ Math.imul(arena + 1, 0x9e3779b1)) | 0;
