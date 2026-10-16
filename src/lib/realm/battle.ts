// The Spirit Realm's battle (docs/REALM.md). Every army starts at its gate on the arena's edge and
// marches to the centre; fighters go for the nearest enemy they can see and hit it until one of
// them falls. The battle is worked out the same way, step by step, on the server (who won, who is
// paid) and on every phone (what you watch), from the same armies and the same seed. So watching
// costs the server nothing: a phone fetches the armies once and plays the battle by itself, and
// thousands of people can watch or fight at once.
//
// To come out the same everywhere it only uses + - * / and Math.sqrt (exact in every browser),
// never Math.sin, Math.random or the order of an object's keys.

import { COUNTER, FIGHTERS, upgradeBoost, type Army, type Nature } from "./fighters.ts";
import { BATTLE_SECS, GATES } from "./schedule.ts";

/** Seconds of battle per step. */
export const DT = 0.25;
export const STEPS = Math.round(BATTLE_SECS / DT);
/** The arena's radius. */
export const ARENA_R = 100;
/** How far fighters see an enemy from. */
const SIGHT = 45;
const CELL = 15;
const CELLS = 16;
/** Cells to look through for an enemy in sight. */
const LOOK = Math.ceil(SIGHT / CELL);
/** Fighters in a squad, and most squads of one kind in an army. */
const SQUAD = 10;
const SQUADS_OF_KIND = 6;
/** Damage is scaled down so a battle lasts a couple of minutes, long enough to watch. */
const POWER = 0.25;

// The gates round the edge, 12 at the top and on clockwise like a clock (screen y points down).
const H = 0.8660254037844386;
const GATE_DIR: readonly (readonly [number, number])[] = [
  [0, -1], [0.5, -H], [H, -0.5], [1, 0], [H, 0.5], [0.5, H], [0, 1], [-0.5, H], [-H, 0.5], [-1, 0], [-H, -0.5], [-0.5, -H],
];
/** The gate's number as it's shown (gate 0 is "12"). */
export const gateLabel = (g: number) => String(g === 0 ? 12 : g);
export const gateDir = (g: number) => GATE_DIR[((g % GATES) + GATES) % GATES];

export type BattleArmy = { id: string; name: string; gate: number; army: Army };
export type BattleInput = { seed: number; armies: BattleArmy[] };

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
  /** The squad it's going for (-1: none in sight, heading for the centre). */
  target: number;
  /** Hitting its target this step (not just walking to it). */
  hitting: boolean;
  /** Damage taken this step (for the flash). */
  took: number;
};

export type ArmyState = {
  id: string;
  name: string;
  gate: number;
  /** What the army was worth when the battle began (its fighters). */
  start: number;
  /** What's left of it now. */
  now: number;
  /** The step it was wiped out on (null: still standing). */
  outAt: number | null;
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

export class Battle {
  readonly squads: Squad[] = [];
  readonly armies: ArmyState[] = [];
  step = 0;

  constructor(input: BattleInput) {
    const rand = rng(input.seed);
    const atGate = new Array<number>(GATES).fill(0);
    input.armies.forEach((a, ai) => {
      const g = ((a.gate % GATES) + GATES) % GATES;
      const [ux, uy] = GATE_DIR[g];
      // Armies sharing a gate stand side by side, then in rows further in.
      const c = atGate[g]++;
      const side = ((c % 4) - 1.5) * 16 + (rand() - 0.5) * 4;
      const inward = Math.floor(c / 4) * 12;
      const bx = ux * (ARENA_R * 0.92 - inward) - uy * side;
      const by = uy * (ARENA_R * 0.92 - inward) + ux * side;
      let start = 0;
      // Each kind of fighter in squads of up to SQUAD fighters (at most SQUADS_OF_KIND of them), so a
      // big army spreads out over a wide front instead of one crowd.
      const groups: { k: number; n: number }[] = [];
      FIGHTERS.forEach((f, k) => {
        const n = a.army.fighters[f.id] ?? 0;
        if (n <= 0) return;
        start += f.cost * n;
        const parts = Math.min(SQUADS_OF_KIND, Math.ceil(n / SQUAD));
        for (let p = 0; p < parts; p++) groups.push({ k, n: Math.floor(n / parts) + (p < n % parts ? 1 : 0) });
      });
      const cols = Math.min(6, groups.length);
      groups.forEach(({ k, n }, j) => {
        const f = FIGHTERS[k];
        // In rows of six across the gate, the first row nearest the middle.
        const along = ((j % cols) - (cols - 1) / 2) * 5;
        const back = Math.floor(j / cols) * 5;
        const unitHp = f.hp * upgradeBoost(a.army.armour);
        this.squads.push({
          army: ai,
          kind: k,
          nature: f.nature,
          x: bx - uy * along + ux * back + (rand() - 0.5),
          y: by + ux * along + uy * back + (rand() - 0.5),
          hp: unitHp * n,
          unitHp,
          atk: f.atk * upgradeBoost(a.army.weapons) * POWER,
          range: f.range,
          speed: f.speed,
          cost: f.cost,
          target: -1,
          hitting: false,
          took: 0,
        });
      });
      this.armies.push({ id: a.id, name: a.name, gate: g, start, now: start, outAt: start > 0 ? null : 0 });
    });
  }

  /** Over: one army (or none) left standing, or the time is up. */
  get done() {
    return this.step >= STEPS || this.armies.filter((a) => a.outAt === null).length <= 1;
  }

  /** One step of the battle (DT seconds). */
  advance() {
    if (this.done) return;
    const sq = this.squads;
    const n = sq.length;
    // Who is where, in a coarse grid, so looking for the nearest enemy stays quick with many armies.
    const grid: number[][] = Array.from({ length: CELLS * CELLS }, () => []);
    const cellOf = (v: number) => Math.max(0, Math.min(CELLS - 1, Math.floor((v + CELLS * CELL * 0.5) / CELL)));
    for (let i = 0; i < n; i++) if (sq[i].hp > 0) grid[cellOf(sq[i].y) * CELLS + cellOf(sq[i].x)].push(i);

    const nx = new Float64Array(n);
    const ny = new Float64Array(n);
    const dmg = new Float64Array(n);
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
      // Nobody in sight: march on the centre.
      const tx = t >= 0 ? sq[t].x : 0;
      const ty = t >= 0 ? sq[t].y : 0;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = t >= 0 ? s.range + squadRadius(s) + squadRadius(sq[t]) : 3;
      if (t >= 0 && d <= reach) {
        s.hitting = true;
        dmg[t] += alive(s) * s.atk * COUNTER[s.nature][sq[t].nature] * DT;
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
    // Everyone moves and hits at the same moment, so the order of the squads doesn't matter.
    for (let i = 0; i < n; i++) {
      const s = sq[i];
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
    for (const a of this.armies) if (a.outAt === null && a.now <= 0) a.outAt = this.step;
  }

  /** Play on to the step `to` (or the end). */
  runTo(to: number) {
    while (this.step < to && !this.done) this.advance();
  }

  /**
   * The armies from first to last (their indexes): those still standing, strongest first, then
   * those wiped out, the last to fall first. Level: the one that joined first.
   */
  ranking(): number[] {
    const idx = this.armies.map((_, i) => i);
    return idx.sort((i, j) => {
      const a = this.armies[i];
      const b = this.armies[j];
      if ((a.outAt === null) !== (b.outAt === null)) return a.outAt === null ? -1 : 1;
      if (a.outAt === null && b.outAt === null && a.now !== b.now) return b.now - a.now;
      if (a.outAt !== null && b.outAt !== null && a.outAt !== b.outAt) return b.outAt - a.outAt;
      return i - j;
    });
  }
}

const dist2 = (a: Squad, b: Squad) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** The whole battle at once (the server, to pay the winner): the armies' ids from first to last. */
export function fightOut(input: BattleInput): { ranks: string[]; steps: number } {
  const b = new Battle(input);
  b.runTo(STEPS);
  return { ranks: b.ranking().map((i) => input.armies[i].id), steps: b.step };
}

/** Each arena's own seed, from the battle's. */
export const arenaSeed = (seed: number, arena: number) => (Math.imul(seed | 0, 1) ^ Math.imul(arena + 1, 0x9e3779b1)) | 0;
