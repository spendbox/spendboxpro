// Standing and quiet badges (docs/LIFE_WHEEL.md, phase 4). From what you've lived in moments, how
// the cast feels about you and what's been on you, the game works out:
//
//   - Trust: do people believe you? Honest choices, keeping your word and people who like you
//     raise it; shady choices lower it. From 0 to 100, starting at 50, recent counting most.
//   - Fame: how known you are. Big moments people saw, being talked about. It fades if you go quiet.
//   - Legacy: how much your life has happened, not how rich you are. It only grows, and it's the
//     number on the "most legendary lives" board.
//   - Badges, earned by patterns over weeks (never one answer), arriving quietly a while after
//     they're earned. Character ones can fade if you change; story ones are yours for good.
//
// Pure rules, shared by the server (which works them out and keeps them, game-db/114) and the tests.

import { CAST_BY_ID } from "./cast.ts";
import { BADGE_INFO, LIFE_BADGE_BY_ID, badgeName, type BadgeInfo } from "./life-badges.ts";
import { MOMENT_BY_ID, TRAIT_KEYS, characterOf, type Trait, type TraitNudge } from "./moments.ts";

/** One moment you lived, as the rules need it. */
export type LivedMoment = {
  moment: string;
  choice: number;
  /** When you answered (ms). */
  at: number;
  traits: TraitNudge | null;
  /** Money it moved (mint; below 0: it cost you). */
  cash: number;
  /** Reputation it moved. */
  rep: number;
  /** What the game noted at the time (game-db/114): trust it moved, whether anyone saw, the effect it left. */
  marks: { trust?: number; unseen?: boolean; effect?: string } | null;
  /** It was the next step of a story. */
  followed: boolean;
};
/** Where you are with a character. */
export type LivedBond = { who: string; step: number; feeling: number };

export type LifeFacts = {
  character: Record<Trait, number>;
  /** For each side of each slider: how many answers leaned that way, how many of them cost you, and over how long (days). */
  sides: Record<string, { count: number; costly: number; days: number }>;
  lived: Set<string>;
  /** Choices made, as "moment:choice". */
  chose: Set<string>;
  bonds: Record<string, LivedBond>;
  /** Times you were talked about in the last 60 days. */
  talkedAbout: number;
  trust: number;
  fame: number;
  legacy: number;
};

const DAY = 86_400_000;
const sideKey = (t: Trait, side: 1 | -1) => `${t}${side > 0 ? "+" : "-"}`;

/** Trust from what you chose: what a moment noted, or half of how honest the answer was. */
const trustOf = (m: LivedMoment) => (m.marks?.trust != null ? m.marks.trust : (m.traits?.truth ?? 0) * 0.5);

/** Fame from a moment: bigger and seen counts more; being talked about counts. */
function fameOf(m: LivedMoment) {
  const def = MOMENT_BY_ID.get(m.moment);
  if (!def) return 0;
  const size = def.size ?? "small";
  let f = size === "life" ? 12 : size === "big" ? 4 : m.rep !== 0 && !m.marks?.unseen ? 1 : 0;
  if (m.marks?.effect === "talked_about") f += 3;
  return f;
}

/** How known you are, in words. */
export function fameWord(fame: number) {
  if (fame >= 150) return "Famous";
  if (fame >= 60) return "Known across the city";
  if (fame >= 20) return "Known in your area";
  if (fame >= 5) return "Known on your street";
  return "Not known yet";
}

/** Everything the badges and standing need, from your moments and the cast. */
export function lifeFacts(moments: LivedMoment[], bonds: LivedBond[], now = Date.now()): LifeFacts {
  const character = characterOf(
    moments.filter((m) => m.traits).map((m) => ({ traits: m.traits!, at: m.at })),
    now,
  );
  const sides: LifeFacts["sides"] = {};
  const spans: Record<string, [number, number]> = {};
  for (const m of moments) {
    for (const t of TRAIT_KEYS) {
      const v = m.traits?.[t] ?? 0;
      if (!v) continue;
      const k = sideKey(t, v > 0 ? 1 : -1);
      const s = (sides[k] ??= { count: 0, costly: 0, days: 0 });
      s.count++;
      if (m.cash < 0) s.costly++;
      const span = (spans[k] ??= [m.at, m.at]);
      span[0] = Math.min(span[0], m.at);
      span[1] = Math.max(span[1], m.at);
    }
  }
  for (const k of Object.keys(sides)) sides[k].days = (spans[k][1] - spans[k][0]) / DAY;

  // Trust: from 50, recent counting most (half after two months), plus how the cast feels about you.
  let trust = 50;
  for (const m of moments) trust += trustOf(m) * 0.5 ** ((now - m.at) / (60 * DAY));
  const feelings = bonds.map((b) => b.feeling);
  if (feelings.length) trust += (feelings.reduce((a, f) => a + f, 0) / feelings.length) * 3;
  trust = Math.round(Math.max(0, Math.min(100, trust)));

  // Fame: fades by half in three months.
  let fame = 0;
  for (const m of moments) fame += fameOf(m) * 0.5 ** ((now - m.at) / (90 * DAY));
  fame = Math.round(fame);

  // Legacy: how much has happened.
  let legacy = 0;
  for (const m of moments) {
    const size = MOMENT_BY_ID.get(m.moment)?.size ?? "small";
    legacy += size === "life" ? 15 : size === "big" ? 5 : 1;
    if (m.followed) legacy += 3;
  }
  for (const b of bonds) {
    if (!CAST_BY_ID.has(b.who)) continue;
    legacy += 2;
    if (b.step < 0) legacy += 10;
    if (b.feeling >= 2) legacy += 5;
  }

  return {
    character,
    sides,
    lived: new Set(moments.map((m) => m.moment)),
    chose: new Set(moments.map((m) => `${m.moment}:${m.choice}`)),
    bonds: Object.fromEntries(bonds.map((b) => [b.who, b])),
    talkedAbout: moments.filter((m) => m.marks?.effect === "talked_about" && now - m.at < 60 * DAY).length,
    trust,
    fame,
    legacy,
  };
}

/** A slider leaning far enough one way, for long enough, often enough (and, if `costly`, when it cost you). */
function leans(f: LifeFacts, t: Trait, side: 1 | -1, o: { strength: number; count: number; costly?: number }) {
  const s = f.sides[sideKey(t, side)];
  return f.character[t] * side >= o.strength && !!s && s.count >= o.count && s.days >= 14 && s.costly >= (o.costly ?? 0);
}
const strong = (t: Trait, side: 1 | -1, costly?: number) => (f: LifeFacts) => leans(f, t, side, { strength: 60, count: 10, costly });
const mix = (...parts: [Trait, 1 | -1][]) => (f: LifeFacts) => parts.every(([t, side]) => leans(f, t, side, { strength: 40, count: 6 }));
const feels = (who: string, at: number) => (f: LifeFacts) => (f.bonds[who]?.feeling ?? 0) >= at;

/** How each badge is earned (what they're called is in ./life-badges.ts). */
const RULES: Record<string, (f: LifeFacts) => boolean> = {
  open_hand: strong("giving", 1, 5),
  money_wise: strong("giving", -1),
  lion_heart: strong("daring", 1),
  wise_owl: strong("daring", -1),
  person_of_honour: strong("truth", 1, 5),
  street_scholar: strong("truth", -1),
  pillar: strong("people", 1),
  self_made: strong("people", -1),
  big_heart: strong("wrongs", 1),
  the_judge: strong("wrongs", -1),
  custodian: strong("ways", 1),
  trailblazer: strong("ways", -1),
  robin_hood: mix(["giving", 1], ["truth", -1]),
  the_elder: mix(["daring", -1], ["people", 1], ["ways", 1]),
  hustler: mix(["daring", 1], ["truth", -1], ["people", -1]),
  peacemaker: mix(["wrongs", 1], ["people", 1]),
  father_christmas: mix(["giving", 1], ["daring", 1]),
  vault: mix(["giving", -1], ["daring", -1]),
  mamas_favourite: (f) => f.lived.has("nkechi_3") || feels("mama_nkechi", 4)(f),
  bellos_nightmare: (f) => ["bello_0:3", "bello_1_cold:1", "bello_2_up:2", "bello_1_pal:1"].filter((c) => f.chose.has(c)).length >= 2,
  street_whisperer: feels("baba_sule", 4),
  kunles_partner: (f) => f.lived.has("kunle_3"),
  kept_my_word: (f) => f.trust >= 80,
  prodigal: (f) => f.chose.has("japa_letter:2"),
  wahala_magnet: (f) => f.talkedAbout >= 5,
  good_neighbour: feels("chioma_neighbour", 4),
  family_pillar: (f) => feels("uncle_sunday", 4)(f) && (f.lived.has("sister_wedding") || f.lived.has("land_later")),
  well_known: (f) => f.fame >= 60,
  touched_by_fate: (f) => [...f.lived].some((id) => MOMENT_BY_ID.get(id)?.rarity === "legendary"),
};

export type LifeBadge = BadgeInfo & { earned: (f: LifeFacts) => boolean };
export const LIFE_BADGES: LifeBadge[] = BADGE_INFO.map((b) => ({ ...b, earned: RULES[b.id] ?? (() => false) }));

export { LIFE_BADGE_BY_ID, badgeName };

/** How long after it's earned a badge quietly shows up (hours): between half a day and a day and a quarter. */
export const BADGE_DELAY_HOURS: [number, number] = [12, 30];
