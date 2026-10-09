// The city's people (NPCs): made-up characters who hang around every building floor, rooftop,
// balloon and ride. Everything here is worked out from the place and the round, so every player
// sees the same people saying the same things, with nothing stored anywhere.
//
// Each person is a mix of: a name (first name, surname or initial, maybe a title, a street
// nickname), an age, a hometown, a job that fits the place, and a PERSONALITY (gossip, liar,
// clown, rude, generous, quest-giver… see npc/personas.ts) with their own catchphrase and verbal
// tic. Their mood changes as the round goes on. What they say comes from a story grammar
// (npc/grammar.ts + npc/lines.ts), so it almost never repeats.
//
// Room ids: "b:<tile>:g" ground floor, "b:<tile>:f<n>" floor n, "b:<tile>:r" roof, "b:<tile>:o"
// open-air spot, "balloon:<k>", rides "v:<train|bus|car|boat|ferris|slide>:<n>". A building level
// can't tell from its id whether it's a club, a restaurant, an office… so callers may pass a
// `hint` (the level's theme, e.g. "lounge", "foodcourt", "office", or a PlaceKind itself).
// Hints only change jobs: names, personalities and everything the server checks stay the same.

import { defaultAvatar, type Avatar } from "@/lib/avatar";
import { say, type Voice } from "./npc/grammar";
import { JOBS, PLACE_NOUN, type Job, type PlaceKind } from "./npc/jobs";
import { BASE, MOOD_RULES, MOODS, TOPICS, type Mood, type Topic } from "./npc/lines";
import { FIRST_NAMES, HOMETOWNS, NICKNAMES, SURNAMES, TITLES } from "./npc/names";
import { PERSONA_BY_KEY, PERSONAS, TICS, type Persona, type PersonaKey } from "./npc/personas";
import { chance, hashText, pick, sample, seeded, weighted, type Rand } from "./npc/rng";

export type { PlaceKind } from "./npc/jobs";
export type { Mood, Topic } from "./npc/lines";
export type { PersonaKey } from "./npc/personas";

export type Npc = {
  id: string; // "npc:<room>:<n>"
  name: string;
  /** What they do, e.g. "Receptionist". */
  role: string;
  /** One friendly line about them, for their card. */
  blurb: string;
  avatar: Avatar;
  /** First name (what friends call them). */
  first: string;
  /** Street nickname ("Pepper", "Oga Boss"…). */
  nickname: string;
  age: number;
  /** Where they say they're from. */
  from: string;
  room: string;
  roundId: number;
  kind: PlaceKind;
  /** Their personality (behaviour). */
  persona: PersonaKey;
  /** Short label for the personality, e.g. "Gossip", "Tall tales". */
  personaLabel: string;
  /** Lines for their profile, e.g. "Spills a lot. Sometimes it's even true." */
  traits: string[];
  /** "real": may whisper a real (rough) clue; "fake": makes clues up; "none": no clues. */
  clue: "real" | "fake" | "none";
  /** May give a few coins. */
  gives: boolean;
  /** Hands out side quests. */
  quests: boolean;
  catchphrase: string;
  tic: string;
  /** Favourite things to talk about. */
  topics: Topic[];
};

export type NpcMessage = {
  id: string;
  npc: Npc;
  body: string;
  at: number;
  /** When this line answers another regular: their first name. */
  replyTo?: string;
};

/** "npc:<room>:<n>" for every kind of room the city has. */
export const NPC_ID_RE = /^npc:(b:[0-9]{1,7}(?::(?:g|r|o|f[0-9]{1,3}))?|balloon:[0-9]{1,2}|v:(?:train|bus|car|boat|ferris|slide):[0-9]{1,7}):([0-7])$/;

const RIDE_RE = /^v:(train|bus|car|boat|ferris|slide):\d+$/;

/** Level themes (and plain words) → the kind of people you meet there. */
const HINTS: Record<string, PlaceKind> = {
  living: "home", upstairs: "home", house: "home", home: "home", flat: "home",
  lobby: "lobby", reception: "lobby", ground: "lobby",
  office: "office", control: "office", tower: "office", bank: "office",
  lounge: "club", club: "club", bar: "club", party: "club",
  foodcourt: "restaurant", restaurant: "restaurant", cafe: "restaurant", kitchen: "restaurant", buka: "restaurant",
  suite: "hotel", hotelLobby: "hotel", hotel: "hotel",
  ward: "hospital", hospital: "hospital", clinic: "hospital",
  police: "police", detectives: "police",
  shop: "mall", mall: "mall", store: "mall",
  gallery: "museum", rotunda: "museum", museum: "museum", clockroom: "museum",
  library: "school", lecture: "school", school: "school", campus: "school",
  terminal: "terminal", concourse: "terminal", skybridge: "terminal", station: "terminal", airport: "terminal",
  roofGarden: "roof", roofTerrace: "roof", helipad: "roof", poolDeck: "roof", roof: "roof",
  platform: "works", damTop: "works", rigDeck: "works", solar: "works", power: "works", works: "works", factory: "works",
  park: "outdoor", plaza: "outdoor", woods: "outdoor", pond: "outdoor", parade: "outdoor", outdoor: "outdoor", street: "outdoor",
  market: "market", funfair: "ferris", ferris: "ferris", quay: "boat", boat: "boat", port: "boat",
  floor: "floor", balloon: "balloon", train: "train", bus: "bus", car: "car", slide: "slide",
};

/**
 * What kind of place a room id is. b:<tile>:g ground floor, :f<n> a floor, :r the roof, :o an
 * open-air spot, balloon:<k>, v:<kind>:<n> a ride. A building level's `hint` (its theme, or a
 * word like "club" / "restaurant" / "office") picks better jobs for it.
 */
export function placeKind(roomId: string, hint?: string | null): PlaceKind {
  if (roomId.startsWith("balloon:")) return "balloon";
  const ride = RIDE_RE.exec(roomId);
  if (ride) return ride[1] as PlaceKind;
  const hinted = hint ? HINTS[hint] : undefined;
  if (hinted && hinted !== "balloon" && !["train", "bus", "car", "slide"].includes(hinted)) return hinted;
  if (roomId.endsWith(":r")) return "roof";
  if (/:f\d+$/.test(roomId)) return "floor";
  if (roomId.endsWith(":o")) return "outdoor";
  if (roomId.endsWith(":g") || /^b:\d+$/.test(roomId)) return "lobby";
  return "outdoor";
}

/** Persona-shaped ages: elders are old, gamers young… */
const AGE_RANGE: Partial<Record<PersonaKey, [number, number]>> = {
  elder: [62, 94], wise: [45, 88], storyteller: [50, 92], gamer: [16, 34], influencer: [18, 33], hype: [18, 38], newbie: [18, 40], fitness: [19, 52],
};

/** How people's moods lean, by personality. */
const MOOD_LEAN: Partial<Record<PersonaKey, Mood>> = {
  sleepy: "sleepy", rude: "grumpy", elder: "grumpy", complainer: "grumpy", sunshine: "cheerful", hype: "excited", drama: "excited", gossip: "chatty",
  conspiracy: "suspicious", detective: "suspicious", foodie: "hungry", poet: "dreamy", worrier: "stressed", clown: "playful", generous: "cheerful",
};

const PERSONA_WEIGHTS = PERSONAS.map((p) => [p, p.weight] as const);

function nameFor(rand: Rand, first: string, surname: string, nickname: string) {
  const style = weighted(rand, [["initial", 4], ["surname", 4], ["title", 2], ["nick", 1]] as const);
  if (style === "surname" && first.length + surname.length < 20) return `${first} ${surname}`;
  if (style === "title") return `${pick(rand, TITLES)} ${first}`;
  if (style === "nick" && first.length + nickname.length < 17) return `${first} "${nickname}"`;
  return `${first} ${surname.charAt(0)}.`;
}

/** Tidies a catchphrase that has [inline|choices] in it. */
function settle(rand: Rand, text: string) {
  return text.replace(/\[([^[\]]*)\]/g, (_, body: string) => pick(rand, body.split("|")));
}

function jobFor(roomId: string, roundId: number, n: number, kind: PlaceKind): Job {
  const pool = JOBS[kind];
  return pick(seeded(`${roundId}|${roomId}|${n}|job|${kind}`), pool);
}

/** One of the people in a place: the same for the same (room, round, n). */
function makeNpc(roomId: string, roundId: number, n: number, kind: PlaceKind, taken: Set<string>): Npc {
  const rand = seeded(`${roundId}|${roomId}|${n}|npc`);
  // Personality first: it never depends on the place hint (the server checks it).
  const persona = weighted(rand, PERSONA_WEIGHTS);
  let first = pick(rand, FIRST_NAMES);
  for (let tries = 0; tries < 6 && taken.has(first); tries++) first = pick(rand, FIRST_NAMES);
  taken.add(first);
  const surname = pick(rand, SURNAMES);
  const nickname = pick(rand, NICKNAMES);
  const name = nameFor(rand, first, surname, nickname);
  const [lo, hi] = AGE_RANGE[persona.key] ?? weighted(rand, [[[18, 29], 35], [[30, 45], 35], [[46, 64], 20], [[65, 90], 10]] as const);
  let age = lo + Math.floor(rand() * (hi - lo + 1));
  const from = pick(rand, HOMETOWNS);
  const catchphrase = settle(rand, pick(rand, persona.catchphrases));
  const tic = pick(rand, TICS);
  const others = TOPICS.filter((t) => !persona.topics.includes(t));
  const topics = [...sample(rand, persona.topics, 3), pick(rand, others)];
  const about = pick(rand, persona.about);

  const job = jobFor(roomId, roundId, n, kind);
  if (job.age && (age < job.age[0] || age > job.age[1])) age = job.age[0] + (age % (job.age[1] - job.age[0] + 1));
  const blurb = pick(seeded(`${roundId}|${roomId}|${n}|blurb|${job.role}`), job.blurbs);

  const avatar = defaultAvatar(`${name}|${roomId}|${roundId}`);
  if (job.top?.length) avatar.top = job.top[hashText(`${name}|top`) % job.top.length];
  if (age >= 62 && hashText(`${name}|grey`) % 3 !== 0) avatar.hairColor = 6; // grey
  if (age < 30 && avatar.beard && hashText(`${name}|beard`) % 2 === 0) avatar.beard = 0;

  const traits = [about];
  if (persona.clue === "fake" && !/tall tales|wrong|unreliable/i.test(about)) traits.push("Tells tall tales.");
  if (persona.gives) traits.push("Known to give mint to people they like.");
  if (persona.quests) traits.push("Might have a side quest for you.");

  return {
    id: `npc:${roomId}:${n}`,
    name,
    role: job.role,
    blurb,
    avatar,
    first,
    nickname,
    age,
    from,
    room: roomId,
    roundId,
    kind,
    persona: persona.key,
    personaLabel: persona.label,
    traits,
    clue: persona.clue,
    gives: Boolean(persona.gives),
    quests: Boolean(persona.quests),
    catchphrase,
    tic,
    topics,
  };
}

/** The people in a place this round (1–8 of them, more in bigger places). */
export function npcsFor(roomId: string, roundId: number, capacity = 30, hint?: string | null): Npc[] {
  const kind = placeKind(roomId, hint);
  const count = Math.max(1, Math.min(8, Math.round(capacity / 25) + Math.floor(seeded(`${roundId}|${roomId}`)() * 3)));
  const taken = new Set<string>();
  const out: Npc[] = [];
  for (let n = 0; n < count; n++) out.push(makeNpc(roomId, roundId, n, kind, taken));
  return out;
}

/** One person from their id ("npc:<room>:<n>"), or null. The first people in a place are the same whatever its size. */
export function npcById(id: string, roundId: number, hint?: string | null): Npc | null {
  const m = NPC_ID_RE.exec(id);
  if (!m) return null;
  return npcsFor(m[1], roundId, 1000, hint).find((n) => n.id === id) ?? null;
}

export function personaOf(npc: Npc): Persona {
  return PERSONA_BY_KEY[npc.persona];
}

/** Their mood right now: it changes every quarter of an hour or so (and leans with their personality). */
export function moodAt(npc: Npc, at: number): Mood {
  const rand = seeded(`${npc.id}|${npc.roundId}|mood|${Math.floor(at / 900_000)}`);
  const lean = MOOD_LEAN[npc.persona];
  return lean && chance(rand, 0.45) ? lean : pick(rand, MOODS);
}

/** Everything the grammar needs to talk as this person. */
export function voiceFor(npc: Npc, rand: Rand, at: number, extra?: Record<string, string | number | undefined>): Voice {
  return {
    rand,
    base: BASE,
    own: personaOf(npc).rules,
    mood: MOOD_RULES[moodAt(npc, at)],
    vars: {
      first: npc.first,
      name: npc.name,
      nick: npc.nickname,
      role: npc.role,
      roleLower: npc.role.charAt(0).toLowerCase() + npc.role.slice(1),
      place: pick(rand, PLACE_NOUN[npc.kind]),
      from: npc.from,
      age: npc.age,
      catch: npc.catchphrase,
      tic: npc.tic,
      player: "friend",
      num: pick(rand, ["2", "3", "4", "5", "7", "9", "11", "12", "21"]),
      ...extra,
    },
  };
}

/** Adds a person's habits to a line now and then: their verbal tic, a quirk, their catchphrase. */
export function flavour(npc: Npc, text: string, rand: Rand, at: number): string {
  let s = text;
  if (chance(rand, 0.2)) {
    // "…, sha." at the end of the first proper sentence (not after a short "Huh?").
    const m = /^(.{14,}?[^.!?…,])([.!?])(\s|$)/.exec(s);
    if (m) s = `${m[1]}, ${npc.tic}${m[2]}${m[3]}${s.slice(m[0].length)}`;
  }
  if (chance(rand, 0.14)) {
    const quirk = say("quirk", voiceFor(npc, rand, at));
    if (!s.includes(quirk)) s = `${s} ${quirk}`;
  } else if (chance(rand, 0.07) && !s.includes(npc.catchphrase)) s = `${s} ${npc.catchphrase}`;
  return s;
}

/**
 * The people in a place chat now and then: one line roughly every 40–90 seconds, the same for
 * everyone; sometimes another one answers. Returns the lines said between `from` and `to`
 * (ms timestamps), oldest first.
 */
export function npcChatter(roomId: string, roundId: number, from: number, to: number, capacity = 30, hint?: string | null): NpcMessage[] {
  const npcs = npcsFor(roomId, roundId, capacity, hint);
  if (!npcs.length) return [];
  const SLOT = 30_000;
  const out: NpcMessage[] = [];
  for (let slot = Math.floor(from / SLOT); slot <= Math.floor(to / SLOT); slot++) {
    const rand = seeded(`${roundId}|${roomId}|${slot}|chat`);
    if (rand() > 0.45) continue; // most slots are quiet
    const at = slot * SLOT + Math.floor(rand() * SLOT);
    const npc = pick(rand, npcs);
    const topic = chance(rand, 0.7) ? pick(rand, npc.topics) : pick(rand, TOPICS);
    const rule = weighted(rand, [[`t_${topic}`, 7], ["chatter_place", 2], ["mood_line", 1]] as const);
    const body = flavour(npc, say(rule, voiceFor(npc, rand, at)), rand, at);
    if (at >= from && at <= to) out.push({ id: `npc:${roomId}:${slot}`, npc, body, at });
    // Now and then somebody answers.
    if (npcs.length > 1 && chance(rand, 0.3)) {
      const other = pick(rand, npcs.filter((n) => n !== npc));
      const at2 = at + 4000 + Math.floor(rand() * 20_000);
      if (at2 >= from && at2 <= to) {
        const reply = flavour(other, say("chatter_reply", voiceFor(other, rand, at2, { to: npc.first })), rand, at2);
        out.push({ id: `npc:${roomId}:${slot}:r`, npc: other, body: reply, at: at2, replyTo: npc.first });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** A hello from one of the city's people (a different one for each seed). */
export function npcReply(npc: Npc, seed: number): string {
  const at = Date.now();
  const rand = seeded(`${npc.id}|${npc.roundId}|hello|${seed}`);
  return flavour(npc, say("greet", voiceFor(npc, rand, at)), rand, at);
}
