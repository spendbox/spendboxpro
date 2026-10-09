import "server-only";

import { createHmac } from "node:crypto";
import { makeRng } from "./rng";
import { matchById } from "./schedule";
import { simBasketball } from "./sim/basketball";
import { simBoxing } from "./sim/boxing";
import { simFootball } from "./sim/football";
import { simWrestling } from "./sim/wrestling";
import { basketballClock, footballMinute, mmss } from "./timeline";
import type {
  BasketballFrame,
  BoxingFrame,
  FootballFrame,
  Frame,
  MatchInfo,
  MatchResult,
  WrestlingFrame,
} from "./types";

// The secret half of the stadium. Every match is simulated from a seed that only the server
// knows (an HMAC of the match id), so nobody can work out a result before it's played, and the
// feed only ever hands out the frames up to "now". The same id always plays out the same way,
// so every server and every viewer sees the same match.

type Sim = { frames: Frame[]; result: MatchResult };

/** Bumping this replays every future match differently (old ids keep their seed otherwise). */
const ENGINE = "v1";

function secret(): string {
  return process.env.SPORTS_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? "dev-only";
}

function seedFor(id: string) {
  const d = createHmac("sha256", secret()).update(`${ENGINE}:${id}`).digest();
  return makeRng(d.readUInt32LE(0), d.readUInt32LE(4), d.readUInt32LE(8), d.readUInt32LE(12));
}

const cache = new Map<string, Sim>();
const CACHE_SIZE = 48;

function run(match: MatchInfo): Sim {
  const rng = seedFor(match.id);
  switch (match.sport) {
    case "football":
      return simFootball(match, rng);
    case "basketball":
      return simBasketball(match, rng);
    case "boxing":
      return simBoxing(match, rng);
    case "wrestling":
      return simWrestling(match, rng);
  }
}

/** The whole match (every frame and the result). Server only: never send this to a browser before it's played. */
export function simulate(id: string): { frames: Frame[]; result: MatchResult } | null {
  const hit = cache.get(id);
  if (hit) {
    // Keep recently used matches at the back of the queue.
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  const match = matchById(id);
  if (!match) return null;
  let sim: Sim;
  try {
    sim = run(match);
  } catch (error) {
    console.error("Simulating a match failed", id, error);
    return null;
  }
  cache.set(id, sim);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return sim;
}

/** Index of the first frame with t >= x (frames are sorted by t). */
function lowerBound(frames: Frame[], x: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const FINISH = new Set(["ko", "tko", "rtd", "decision", "pin", "tap", "countout", "dq"]);
const HOW: Record<string, string> = {
  ko: "KO",
  tko: "TKO",
  rtd: "TKO",
  decision: "decision",
  pin: "pinfall",
  tap: "submission",
  countout: "count-out",
  dq: "disqualification",
};

/** The fight's finish (who won and how) if it has happened by frame index `upto`. */
function finishBy(frames: Frame[], upto: number): { s: 0 | 1; how: string } | null {
  for (let i = upto; i >= 0 && i > upto - 200; i--) {
    for (const e of frames[i].e ?? []) {
      if (FINISH.has(e.k) && e.s !== undefined) return { s: e.s, how: HOW[e.k] };
    }
  }
  return null;
}

function scorelineOf(match: MatchInfo, frames: Frame[], upto: number): string | null {
  if (upto < 0) return null;
  const f = frames[upto];
  const h = match.home.short;
  const a = match.away.short;
  switch (match.sport) {
    case "football": {
      const x = f as FootballFrame;
      return `${h} ${x.s[0]}–${x.s[1]} ${a} · ${footballMinute(x.c, x.ph)}`;
    }
    case "basketball": {
      const x = f as BasketballFrame;
      return `${h} ${x.s[0]}–${x.s[1]} ${a} · ${basketballClock(x.q, x.c, x.ph)}`;
    }
    case "boxing": {
      const x = f as BoxingFrame;
      const fin = x.ph >= 3 ? finishBy(frames, upto) : null;
      if (fin) return `${fin.s === 0 ? h : a} wins by ${fin.how} · Round ${x.r}`;
      if (x.r === 0) return `${h} vs ${a} · Introductions`;
      const kd = x.kd[0] || x.kd[1] ? ` · knockdowns ${x.kd[1]}–${x.kd[0]}` : "";
      return `${h} vs ${a} · Round ${x.r}${kd}`;
    }
    case "wrestling": {
      const x = f as WrestlingFrame;
      const fin = x.ph >= 1 ? finishBy(frames, upto) : null;
      if (fin) return `${fin.s === 0 ? h : a} wins by ${fin.how}`;
      if (x.ph === 0) return `${h} vs ${a} · Entrances`;
      return `${h} vs ${a} · ${mmss(x.c)}`;
    }
  }
}

/**
 * What a viewer may see at `nowMs`: frames with fromT <= t <= (now - kick-off), whether the
 * match is over, the result once it has ended, and the score so far as short text.
 */
export function feed(
  id: string,
  nowMs: number,
  fromT = 0,
): { frames: Frame[]; done: boolean; result: MatchResult | null; scoreline: string | null } {
  const match = matchById(id);
  if (!match || nowMs < match.kickoffAt) return { frames: [], done: false, result: null, scoreline: null };
  const sim = simulate(id);
  if (!sim) return { frames: [], done: false, result: null, scoreline: null };
  const elapsed = nowMs - match.kickoffAt;
  const done = nowMs >= match.endsAt;
  const end = lowerBound(sim.frames, Math.floor(elapsed) + 1); // first frame after now
  const start = lowerBound(sim.frames, Math.max(0, Number.isFinite(fromT) ? fromT : 0));
  return {
    frames: start < end ? sim.frames.slice(start, end) : [],
    done,
    result: done ? sim.result : null,
    scoreline: scorelineOf(match, sim.frames, end - 1),
  };
}

/** The result, or null until the match has ended. */
export function resultOf(id: string, nowMs: number): MatchResult | null {
  const match = matchById(id);
  if (!match || nowMs < match.endsAt) return null;
  return simulate(id)?.result ?? null;
}
