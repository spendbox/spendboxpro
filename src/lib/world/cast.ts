// The cast (docs/LIFE_WHEEL.md, phase 3): people who live in the city and remember you. Mama Nkechi
// sells oranges at the bus stop; Officer Bello runs the Ojota checkpoint; Baba Sule's boys own your
// street. Each has places where you meet them, and their own story with you that moves on as you
// choose (src/lib/world/cast-moments.ts): what they feel about you (from −5, an enemy, to 5,
// family) and how far your story together has gone are kept for every player (game-db/113).
//
// The cast isn't fixed. Characters arrive over time (`since`), and the world changes them: every
// player's choices add up (a character's "good" and "bad" counts, shared by everyone), so if enough
// people help Mama Nkechi she opens a shop, and if enough people report Officer Bello he's moved.
// Each city gets its own cast (`region`); Lagos is first.

import type { LifeArea, MomentSpot } from "./moments.ts";

export type CastMember = {
  id: string;
  name: string;
  emoji: string;
  /** Who they are, in a few words. */
  role: string;
  /** Where you meet them. */
  where: MomentSpot[];
  area: LifeArea;
  /** The city they live in. */
  region: string;
  /** In the game from this day (YYYY-MM-DD); from the start when not given. */
  since?: string;
  /** Their story with you is written (cast-moments.ts); others are in the city but not yet met. */
  story?: boolean;
};

export const CAST: CastMember[] = [
  // the street
  { id: "mama_nkechi", name: "Mama Nkechi", emoji: "🍊", role: "sells oranges at the bus stop", where: ["street"], area: "street", region: "lagos", story: true },
  { id: "baba_sule", name: "Baba Sule", emoji: "🧢", role: "the area boys' oga", where: ["street"], area: "street", region: "lagos", story: true },
  { id: "tunde_spanner", name: "Tunde Spanner", emoji: "🔧", role: "roadside mechanic", where: ["street"], area: "money", region: "lagos" },
  { id: "emeka_phones", name: "Emeka", emoji: "📱", role: "fixes phones under an umbrella", where: ["street"], area: "money", region: "lagos" },
  { id: "mallam_garba", name: "Mallam Garba", emoji: "🍢", role: "the suya man at night", where: ["street", "outdoors"], area: "friends", region: "lagos" },
  { id: "blessing_braids", name: "Blessing", emoji: "💇🏾‍♀️", role: "braids hair by the junction", where: ["street"], area: "friends", region: "lagos" },
  { id: "kola_papers", name: "Kola", emoji: "📰", role: "newspaper vendor who knows everything", where: ["street"], area: "community", region: "lagos" },
  // the road
  { id: "officer_bello", name: "Officer Bello", emoji: "👮🏾", role: "runs the Ojota checkpoint", where: ["road"], area: "street", region: "lagos", story: true },
  { id: "kunle_conductor", name: "Kunle", emoji: "🚌", role: "your danfo's conductor", where: ["road"], area: "street", region: "lagos", story: true },
  { id: "musa_okada", name: "Musa", emoji: "🏍️", role: "okada rider who always finds you", where: ["road"], area: "work", region: "lagos" },
  { id: "mrs_adeyemi", name: "Mrs Adeyemi", emoji: "🦺", role: "LASTMA officer at the junction", where: ["road"], area: "street", region: "lagos" },
  // home
  { id: "chioma_neighbour", name: "Chioma", emoji: "🚪", role: "your next-door neighbour", where: ["home"], area: "community", region: "lagos", story: true },
  { id: "chief_okafor", name: "Chief Okafor", emoji: "🏠", role: "landlord of half the street", where: ["home"], area: "money", region: "lagos" },
  { id: "ibrahim_gate", name: "Ibrahim", emoji: "🛡️", role: "the estate's gateman", where: ["home"], area: "community", region: "lagos" },
  { id: "mama_tobi", name: "Mama Tobi", emoji: "👀", role: "sees everything from downstairs", where: ["home"], area: "community", region: "lagos" },
  { id: "little_tobi", name: "Tobi", emoji: "⚽", role: "Mama Tobi's football-mad son", where: ["home"], area: "community", region: "lagos" },
  // food and nights out
  { id: "aunty_bisi", name: "Aunty Bisi", emoji: "🍲", role: "runs the buka round the corner", where: ["food"], area: "friends", region: "lagos", story: true },
  { id: "segun_waiter", name: "Segun", emoji: "🧑🏾‍🍳", role: "waiter at the lounge", where: ["food"], area: "work", region: "lagos" },
  { id: "dj_spinz", name: "DJ Spinz", emoji: "🎧", role: "the club's DJ", where: ["night"], area: "friends", region: "lagos" },
  { id: "big_sam", name: "Big Sam", emoji: "🚫", role: "the club's bouncer", where: ["night"], area: "street", region: "lagos" },
  { id: "kemi_promoter", name: "Kemi", emoji: "🎟️", role: "promoter who knows every party", where: ["night"], area: "friends", region: "lagos" },
  // sport
  { id: "coach_dayo", name: "Coach Dayo", emoji: "🏋🏾", role: "trainer at the gym", where: ["sport"], area: "friends", region: "lagos", story: true },
  { id: "halima_boxer", name: "Halima", emoji: "🥊", role: "boxer with a big fight coming", where: ["sport"], area: "community", region: "lagos" },
  // shops and markets
  { id: "iya_ronke", name: "Iya Ronke", emoji: "🧵", role: "fabric trader at the market", where: ["shop"], area: "money", region: "lagos" },
  { id: "alhaji_danjuma", name: "Alhaji Danjuma", emoji: "📺", role: "electronics dealer", where: ["shop"], area: "money", region: "lagos" },
  { id: "mr_chen", name: "Mr Chen", emoji: "🛒", role: "owns the supermarket", where: ["shop"], area: "money", region: "lagos" },
  // worship
  { id: "pastor_femi", name: "Pastor Femi", emoji: "⛪", role: "pastor of the church on your street", where: ["worship"], area: "faith", region: "lagos" },
  { id: "imam_abdullahi", name: "Imam Abdullahi", emoji: "🕌", role: "imam of the central mosque", where: ["worship"], area: "faith", region: "lagos" },
  // parks and beaches
  { id: "baba_ludo", name: "Baba Ludo", emoji: "🎲", role: "never loses at ludo under the tree", where: ["outdoors"], area: "friends", region: "lagos" },
  { id: "zainab_horses", name: "Zainab", emoji: "🐎", role: "rents horses on the beach", where: ["outdoors"], area: "money", region: "lagos" },
  { id: "ade_park", name: "Ade", emoji: "🌳", role: "keeps the park", where: ["outdoors"], area: "community", region: "lagos" },
  // work
  { id: "ify_colleague", name: "Ify", emoji: "💻", role: "your sharpest colleague", where: ["work"], area: "work", region: "lagos", story: true },
  { id: "mr_adebayo", name: "Mr Adebayo", emoji: "👔", role: "your boss", where: ["work"], area: "work", region: "lagos" },
  { id: "uche_cleaner", name: "Uche", emoji: "🧹", role: "cleans the office and hears everything", where: ["work"], area: "work", region: "lagos" },
  { id: "fola_intern", name: "Fola", emoji: "🎓", role: "the new intern", where: ["work"], area: "work", region: "lagos", since: "2026-11-15" },
  // anywhere: they call
  { id: "uncle_sunday", name: "Uncle Sunday", emoji: "☎️", role: "your uncle in the village", where: ["street", "home", "work", "food", "shop", "outdoors"], area: "family", region: "lagos", story: true },
  { id: "cousin_ngozi", name: "Ngozi", emoji: "👩🏾", role: "your cousin with big plans", where: ["home", "food"], area: "family", region: "lagos" },
  { id: "obinna_old", name: "Obinna", emoji: "🤜🏾", role: "your friend since primary school", where: ["street", "food", "night"], area: "friends", region: "lagos" },
  { id: "amaka_press", name: "Amaka", emoji: "🎙️", role: "a journalist who's heard of you", where: ["street", "food", "night"], area: "community", region: "lagos", since: "2026-12-01" },
  { id: "oga_felix", name: "Oga Felix", emoji: "💰", role: "lends money, at a price", where: ["street", "shop"], area: "money", region: "lagos" },
];

export const CAST_BY_ID = new Map(CAST.map((c) => [c.id, c]));

/** Whether a character is in the game yet. */
export const castHere = (c: CastMember, now = Date.now()) => !c.since || Date.parse(`${c.since}T00:00:00Z`) <= now;

/** How a character feels about you, in words (from −5 to 5). */
export function feelingWord(f: number) {
  if (f >= 4) return "Like family";
  if (f >= 2) return "A friend";
  if (f >= 1) return "Warm";
  if (f > -1) return "Knows you";
  if (f > -3) return "Wary";
  return "Can't stand you";
}

/** How long at least between two steps of the same character's story with you (hours): stories take weeks. */
export const CAST_GAP_HOURS = 36;
