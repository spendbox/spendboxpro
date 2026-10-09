// Shapes shared by the stadium's matches: the public schedule (schedule.ts), the secret
// simulation (sim.server.ts), the feed API and the tactical viewer.

export type Sport = "football" | "basketball" | "boxing" | "wrestling";

/**
 * One side of a match: a team, or a fighter. For teams, `roster` is the squad in order
 * (football: the first 11 start, index 0 is the keeper, the rest are subs; basketball: the
 * first 5 start). For boxing and wrestling it's just `[their name]`.
 */
export type Side = { name: string; short: string; colour: string; colour2: string; roster: string[] };

/** Something to bet on. Football: home/draw/away; the others: home/away. */
export type MatchOption = { key: string; label: string };

/** A scheduled match (all public). Times are ms since epoch; bets are taken from opensAt until kickoffAt. */
export type MatchInfo = {
  id: string;
  sport: Sport;
  slot: number;
  title: string;
  home: Side;
  away: Side;
  options: MatchOption[];
  opensAt: number;
  kickoffAt: number;
  endsAt: number;
  /** The competition or bill ("Eko Premier League · Matchday 12", "Lightweight · 6 rounds"). */
  league?: string;
};

/** How it ended. `winner` is one of the match's option keys. */
export type MatchResult = { winner: string; score: string; summary: string };

/** A key moment (commentary line, goal, card, knockdown...). */
export type MatchEvent = {
  /** What happened: "goal", "save", "yellow", "ko", "nearfall"... (see each sport's frames). */
  k: string;
  /** Which side it's about (0 home, 1 away), if any. */
  s?: 0 | 1;
  /** The commentary line. */
  tx?: string;
  /** Pitch slot (0..10) for subs, cards and injuries; with `n` the new shirt number. */
  i?: number;
  n?: number;
  /** Stats for half-time / full-time cards: one row per side, labels in `sl`. */
  st?: [number[], number[]];
  sl?: string[];
};

/**
 * Football, on a 105 x 68 m pitch measured in decimetres (x 0..1050, y 0..680). Home attacks
 * towards x = 1050 in the first half and towards x = 0 in the second.
 */
export type FootballFrame = {
  t: number;
  /** 0 before kick-off, 1 first half, 2 half-time, 3 second half, 4 full time. */
  ph: number;
  /** Match clock in seconds of play (2700 = 45:00, 5400 = 90:00, beyond = added time). */
  c: number;
  /** Players: [x, y] for home slots 0..10 (0 = keeper), then away slots 0..10. 44 numbers. */
  p: number[];
  /** Ball [x, y, height in dm]. */
  b: number[];
  /** Who has the ball: player index 0..21, or -1 if loose / dead. */
  k: number;
  /** Score so far [home, away]. */
  s: number[];
  /** How the ball travels to the next frame: p pass, l long ball, c cross, s shot, d dribble, k clearance/kick, t throw. */
  a?: string;
  e?: MatchEvent[];
};

/**
 * Basketball, on a 28 x 15 m court in decimetres (x 0..280, y 0..150). Home attacks the
 * basket at x = 264 in the first half and x = 16 in the second.
 */
export type BasketballFrame = {
  t: number;
  /** Quarter 1..4, 5 = overtime; 0 before tip-off. */
  q: number;
  /** Seconds left in the quarter. */
  c: number;
  /** 0 before, 1 playing, 2 break between quarters, 3 half-time, 4 final. */
  ph: number;
  /** Players: [x, y] for home 0..4 then away 0..4. 20 numbers. */
  p: number[];
  /** Ball [x, y, height in dm]. */
  b: number[];
  /** Ball handler 0..9, or -1. */
  k: number;
  s: number[];
  /** Ball to the next frame: p pass, d dribble, s2 / s3 / ft shot, m made (falls through), r rebound. */
  a?: string;
  e?: MatchEvent[];
};

/** Boxing, in a 6 m ring measured in ring units (0..1000 inside the ropes). */
export type BoxingFrame = {
  t: number;
  /** Round 1..6 (0 = before the first bell). */
  r: number;
  /** Seconds into the round (0..180). */
  c: number;
  /** 0 intro, 1 fighting, 2 between rounds, 3 knockdown count, 4 over. */
  ph: number;
  /** Fighters [x, y, facing degrees] home then away. */
  f: number[];
  /** Health 0..100 [home, away]. */
  hp: number[];
  /** Stamina 0..100 [home, away]. */
  sp: number[];
  /** Knockdowns so far [home, away] (how often each one has been down). */
  kd: number[];
  /** A punch thrown towards the next frame: [who 0|1, hand 0 lead / 1 rear, type 0 jab 1 cross 2 hook 3 uppercut 4 body, result 0 miss 1 blocked 2 landed 3 big]. */
  pu?: number[];
  /** Referee's count (1..10) during a knockdown. */
  n?: number;
  /** Who is down (0|1) during a knockdown, or the loser lying there at the end. */
  dn?: number;
  e?: MatchEvent[];
};

/** Wrestling, in a ring of 0..1000 units inside the ropes (the floor outside goes to -250 / 1250). */
export type WrestlingFrame = {
  t: number;
  /** Match clock in seconds. */
  c: number;
  /** 0 entrances, 1 bell rung, 2 over. */
  ph: number;
  /** Wrestlers [x, y, facing degrees] home then away. */
  w: number[];
  /** Two letters, home then away: s standing, d down, g groggy, t on the top rope, r running, h holding a submission, p pinning. */
  st: string;
  /** Energy 0..100. */
  hp: number[];
  /** Momentum 0..100 (fills up for the finisher). */
  mo: number[];
  /** A move that pops up: [who 0|1, name, kind 0 strike 1 grapple 2 aerial 3 signature 4 finisher 5 submission 6 pin]. */
  mv?: [number, string, number];
  /** Referee's count: pin 1..3, count-out 1..10, a submission's tension 1..5. */
  n?: number;
  /** What the count is: p pin, o count-out, s submission. */
  nk?: string;
  e?: MatchEvent[];
};

export type Frame = FootballFrame | BasketballFrame | BoxingFrame | WrestlingFrame;

export type FeedResponse =
  | {
      ok: true;
      now: number;
      match: MatchInfo;
      ticket: boolean;
      frames: Frame[];
      done: boolean;
      result: MatchResult | null;
      scoreline: string | null;
      pool: Record<string, number>;
    }
  | { ok: false; error: string };
