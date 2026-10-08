// The city's regulars: made-up people (NPCs) who hang around every building floor, rooftop
// and balloon. Everything here is worked out from the place and the round, so every player
// sees the same people saying the same things, with nothing stored anywhere.
import { defaultAvatar, type Avatar } from "@/lib/avatar";

export type PlaceKind = "lobby" | "floor" | "roof" | "balloon" | "outdoor";

export type Npc = {
  id: string; // "npc:<room>:<n>"
  name: string;
  /** What they do, e.g. "Receptionist". */
  role: string;
  /** One friendly line about them, for their card. */
  blurb: string;
  avatar: Avatar;
};

const FIRST = [
  "Amaka", "Tunde", "Ngozi", "Chidi", "Bisi", "Femi", "Zainab", "Ibrahim", "Kemi", "Segun", "Halima", "Emeka", "Funmi",
  "Yusuf", "Adaeze", "Kunle", "Folake", "Musa", "Ifeoma", "Dayo", "Aisha", "Obinna", "Tolu", "Hauwa", "Nnamdi", "Bola",
  "Grace", "Daniel", "Mary", "Samuel", "Joy", "David", "Esther", "Michael", "Blessing", "Peter", "Lara", "Victor", "Ruth",
  "Kwame", "Ama", "Kofi", "Wanjiru", "Thabo", "Naledi", "Sipho", "Fatou", "Moussa", "Lina", "Omar", "Sofia", "Leo",
];
const LAST = ["O.", "A.", "B.", "C.", "D.", "E.", "F.", "I.", "K.", "M.", "N.", "S.", "T.", "U.", "Y."];

const ROLES: Record<PlaceKind, { role: string; blurb: string }[]> = {
  lobby: [
    { role: "Receptionist", blurb: "Knows everyone who comes in. Never tells." },
    { role: "Security guard", blurb: "Has seen a lot of ghosts tonight. Says nothing." },
    { role: "Courier", blurb: "Always in a hurry, always lost." },
    { role: "Café owner", blurb: "Makes the best puff-puff on the block." },
    { role: "Cleaner", blurb: "Finds everything people leave behind." },
    { role: "Visitor", blurb: "Just here to use the Wi-Fi." },
  ],
  floor: [
    { role: "Office worker", blurb: "Pretends to work, mostly watches the hunt." },
    { role: "Accountant", blurb: "Counts coins for fun." },
    { role: "Designer", blurb: "Thinks every billboard could be prettier." },
    { role: "Intern", blurb: "First week. Very excited about everything." },
    { role: "Manager", blurb: "In a meeting. Always in a meeting." },
    { role: "Tenant", blurb: "Has lived here for years and knows the gossip." },
    { role: "Chef", blurb: "Cooks jollof that could end any argument." },
  ],
  roof: [
    { role: "Photographer", blurb: "Here for the sunset shot." },
    { role: "Gardener", blurb: "Grows tomatoes on the roof." },
    { role: "Stargazer", blurb: "Counts planes and pretends they're stars." },
    { role: "DJ", blurb: "Testing speakers for tonight's party." },
    { role: "Pigeon keeper", blurb: "Knows each pigeon by name." },
  ],
  balloon: [
    { role: "Balloon captain", blurb: "Has flown over every city in the game." },
    { role: "Tourist", blurb: "Taking a thousand photos a minute." },
    { role: "Honeymooner", blurb: "Very much in love. Very loud about it." },
    { role: "Birdwatcher", blurb: "Just spotted an eagle. Probably." },
  ],
  outdoor: [
    { role: "Jogger", blurb: "On lap twelve. Not tired at all." },
    { role: "Street vendor", blurb: "Sells cold drinks and hot news." },
    { role: "Dog walker", blurb: "Walks five dogs, controls none." },
    { role: "Painter", blurb: "Painting the city, one tree at a time." },
  ],
};

const LINES: Record<PlaceKind | "any", string[]> = {
  any: [
    "Anyone else hear that drone just now?",
    "I swear the price of moving goes up every time I blink.",
    "Who do you think wins this round?",
    "Somebody just got caught two streets away. Wild.",
    "I'd hide in the park if I were a ghost. Too obvious?",
    "The bot is somewhere around here, I can feel it.",
    "This city looks different every time I wake up.",
    "Hunters are getting really good lately.",
    "Did you see the billboard on the corner? Nice ad.",
    "Hello! First time here?",
    "Tell me your best hiding spot. I won't tell. Probably.",
    "I keep hearing sirens. Someone's having a bad day.",
    "Night shift is my favourite. The lights are beautiful.",
    "Never trust a quiet street.",
    "Decoys everywhere today. Hunters are confused.",
  ],
  lobby: [
    "Please sign in at the desk. Just kidding, come in.",
    "The lift is slow but the gist is fast.",
    "Delivery for… anyone? No? Okay.",
    "Coffee's fresh if you want some.",
  ],
  floor: [
    "This meeting could have been an email.",
    "From up here you can see half the hunt.",
    "Who keeps eating my lunch from the fridge?",
    "Window seat is the best seat. Fight me.",
  ],
  roof: [
    "What a view. You can see the whole city from here!",
    "Watch out for the pigeons, they're bold.",
    "The sunset from this roof is unbeatable.",
    "I can see three drones from here. Busy night.",
  ],
  balloon: [
    "Hold on to your hat, we're climbing!",
    "Look down! You can see the hunters searching.",
    "Best seat in the city, no traffic up here.",
    "Captain says we land in a few minutes.",
  ],
  outdoor: [
    "Lovely day for a walk, isn't it?",
    "Fresh air and a good hunt. Perfect.",
    "I saw someone run past here earlier…",
  ],
};

/** A tiny repeatable random number generator (same seed → same numbers). */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** What kind of place a room id is: b:<tile>:g (ground), b:<tile>:f<n> (floor n), b:<tile>:r (roof), balloon:<k>. */
export function placeKind(roomId: string): PlaceKind {
  if (roomId.startsWith("balloon:")) return "balloon";
  if (roomId.endsWith(":r")) return "roof";
  if (/:f\d+$/.test(roomId)) return "floor";
  if (roomId.endsWith(":g")) return "lobby";
  return "outdoor";
}

/** The regulars in a place this round (1–8 of them, more in bigger places). */
export function npcsFor(roomId: string, roundId: number, capacity = 30): Npc[] {
  const kind = placeKind(roomId);
  const rand = seeded(`${roundId}|${roomId}`);
  const count = Math.max(1, Math.min(8, Math.round(capacity / 25) + Math.floor(rand() * 3)));
  const pool = ROLES[kind];
  const used = new Set<string>();
  const out: Npc[] = [];
  for (let n = 0; n < count; n++) {
    let name = "";
    for (let tries = 0; tries < 6 && (!name || used.has(name)); tries++) {
      name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
    }
    used.add(name);
    const job = pool[Math.floor(rand() * pool.length)];
    out.push({ id: `npc:${roomId}:${n}`, name, role: job.role, blurb: job.blurb, avatar: defaultAvatar(`${name}|${roomId}|${roundId}`) });
  }
  return out;
}

export type NpcMessage = { id: string; npc: Npc; body: string; at: number };

/**
 * The regulars chat now and then: one line roughly every 40–90 seconds per place, the same for
 * everyone. Returns the lines said between `from` and `to` (ms timestamps), oldest first.
 */
export function npcChatter(roomId: string, roundId: number, from: number, to: number, capacity = 30): NpcMessage[] {
  const npcs = npcsFor(roomId, roundId, capacity);
  if (!npcs.length) return [];
  const kind = placeKind(roomId);
  const lines = [...LINES[kind], ...LINES.any];
  const SLOT = 30_000;
  const out: NpcMessage[] = [];
  for (let slot = Math.floor(from / SLOT); slot <= Math.floor(to / SLOT); slot++) {
    const rand = seeded(`${roundId}|${roomId}|${slot}`);
    if (rand() > 0.45) continue; // most slots are quiet
    const at = slot * SLOT + Math.floor(rand() * SLOT);
    if (at < from || at > to) continue;
    const npc = npcs[Math.floor(rand() * npcs.length)];
    out.push({ id: `npc:${roomId}:${slot}`, npc, body: lines[Math.floor(rand() * lines.length)], at });
  }
  return out;
}

/** A friendly reply when someone says hi to a regular (they don't do private chats). */
export function npcReply(npc: Npc, seed: number): string {
  const replies = [
    `Hi! I'm ${npc.name.split(" ")[0]}. ${npc.blurb}`,
    "Oh, hello! Enjoying the hunt?",
    "Hey there! Careful out there, the drones are busy.",
    "Nice to meet you! Come back anytime.",
    "Hello! I'd tell you a secret, but I don't know any.",
  ];
  return replies[Math.abs(Math.floor(seed)) % replies.length];
}
