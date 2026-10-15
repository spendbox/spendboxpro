// Events on the map (docs/EVENTS.md; the database part is game-db/095_events.sql). Anyone can host
// an event that others come to: pick what kind, where (the street you're on, or a landmark, a
// restaurant, a park...), when, and whether it's free or ticketed. It shines on the map, people
// nearby and your friends hear about it, and once it's on everyone who comes is in the same room:
// a party (music, icebreakers, meeting someone new, shout-outs, toasts, spraying the host) or a
// stage (slides or a video everyone watches together, reactions, questions for the speaker).

/** The kinds of event. Parties and the stage are built; the rest (Game challenge included) are coming. */
export const EVENT_CATEGORIES = [
  { id: "party", label: "Parties", icon: "🎉", colour: "#d6336c", blurb: "Street parties, owambes, concerts and raves. Music, dancing and meeting people.", ready: true },
  { id: "stage", label: "Talks & screenings", icon: "🎤", colour: "#7048e8", blurb: "Talks with slides, classes, open mics and watch parties: everyone sits and watches together.", ready: true },
  { id: "games", label: "Game challenge", icon: "🏆", colour: "#f08c00", blurb: "Whot!, Ludo and more for a stake. Everyone nearby has a minute to join.", ready: false },
  { id: "sport", label: "Sport & fitness", icon: "⚽", colour: "#2b8a3e", blurb: "Match viewings, street football, morning runs and workouts.", ready: false },
  { id: "market", label: "Pop-up market", icon: "🛍️", colour: "#e8590c", blurb: "A row of stalls for a day: sell your things and services.", ready: false },
  { id: "community", label: "Faith & community", icon: "🙏", colour: "#1c7ed6", blurb: "Prayer meetings, town meetings, clean-ups and drives.", ready: false },
  { id: "mixer", label: "Meet-ups & mixers", icon: "💞", colour: "#ae3ec9", blurb: "Singles mixers, networking, book clubs and fan meet-ups.", ready: false },
  { id: "adults", label: "18+ nights", icon: "🔞", colour: "#c92a2a", blurb: "Grown-up nights: late shows, comedy with no filter, after-parties. Every player is 18+ already.", ready: false },
] as const;
export type EventCategoryId = (typeof EVENT_CATEGORIES)[number]["id"];
/** The categories kept in the database (game-db/095 checks the same list). */
export type HostedCategory = "party" | "stage";

export type EventFormat = {
  /** Kept in the database: 2 to 20 small letters or _. Never change one once it's been used. */
  id: string;
  category: HostedCategory;
  title: string;
  icon: string;
  blurb: string;
  /** The scene played on the map at the spot while it's on (src/lib/world-events.ts), if any. */
  scene: string | null;
  /** The usual length (minutes). */
  minutes: number;
  /** The usual most people. */
  capacity: number;
  /** Where it suits best: "street" (the road you're on) and/or groups of places (src/lib/world/explore.ts). */
  suits: ("street" | "nightlife" | "parks" | "shopping" | "food" | "culture" | "sport" | "travel")[];
};

export const EVENT_FORMATS: EventFormat[] = [
  { id: "street_party", category: "party", title: "Street party", icon: "🎊", blurb: "Block the road, bring the speakers. Everyone on the street is invited.", scene: "street_party", minutes: 120, capacity: 300, suits: ["street", "parks"] },
  { id: "owambe", category: "party", title: "Owambe", icon: "👑", blurb: "Aso ebi, jollof and spraying the celebrant. A birthday, a wedding, any excuse.", scene: "owambe", minutes: 180, capacity: 300, suits: ["street", "food", "parks"] },
  { id: "concert", category: "party", title: "Concert", icon: "🎸", blurb: "A stage, a crowd, and you (or your favourite act) on the mic.", scene: "street_concert", minutes: 120, capacity: 1000, suits: ["street", "sport", "parks"] },
  { id: "rave", category: "party", title: "Rave", icon: "🪩", blurb: "A DJ in the middle of the road, lasers, and dancing until it ends.", scene: "street_rave", minutes: 180, capacity: 1000, suits: ["street", "nightlife"] },
  { id: "house_party", category: "party", title: "House party", icon: "🏠", blurb: "Small, warm and close: your friends and theirs, candles and good music.", scene: "blackout_party", minutes: 120, capacity: 40, suits: ["street", "food"] },
  { id: "drum_circle", category: "party", title: "Drum circle", icon: "🥁", blurb: "Drums, call and response, and everyone joining in.", scene: "drumming_circle", minutes: 60, capacity: 200, suits: ["parks", "street", "culture"] },
  { id: "talk", category: "stage", title: "Talk", icon: "🎙️", blurb: "You speak, with slides. Everyone sits, listens, reacts and asks questions.", scene: null, minutes: 60, capacity: 300, suits: ["culture", "food", "street"] },
  { id: "class", category: "stage", title: "Class or workshop", icon: "📚", blurb: "Teach something: cooking, coding, makeup, money. Slides and questions.", scene: null, minutes: 60, capacity: 100, suits: ["culture", "food"] },
  { id: "watch_party", category: "stage", title: "Watch party", icon: "🎬", blurb: "A film, a match highlight or a video everyone watches together, in sync.", scene: null, minutes: 120, capacity: 300, suits: ["nightlife", "parks", "culture", "food", "street"] },
  { id: "open_mic", category: "stage", title: "Open mic", icon: "🎤", blurb: "Poetry, comedy, music. People take turns on the stage.", scene: null, minutes: 90, capacity: 200, suits: ["nightlife", "food", "street"] },
];

export const eventFormat = (id: string) => EVENT_FORMATS.find((f) => f.id === id);
export const eventCategory = (id: string) => EVENT_CATEGORIES.find((c) => c.id === id);
export const formatsIn = (category: string) => EVENT_FORMATS.filter((f) => f.category === category);

// ---------------------------------------------------------------- the rules

export const TITLE_MIN = 3;
export const TITLE_MAX = 60;
export const ABOUT_MAX = 280;
/** How long an event can run (minutes). */
export const MINUTES_MIN = 15;
export const MINUTES_MAX = 240;
export const DURATIONS = [30, 60, 120, 180, 240];
/** How far ahead an event can be set (days). */
export const DAYS_AHEAD = 7;
/** Guests can come in this long before it starts (the host any time). */
export const EARLY_DOORS_MINS = 5;
/** How many people can come (the most the host can pick: the biggest parties, a carnival kilometres wide). */
export const CAPACITY_MIN = 2;
export const CAPACITY_MAX = 10_000;
/** Ticket prices to pick from (naira; 0 is free). The host can type any amount up to the most. */
export const TICKETS_NAIRA = [0, 1_000, 5_000, 20_000];
export const TICKET_MAX_NAIRA = 500_000;
/**
 * Tickets are taxed like everything else in the city (game-db/095 event_settle, the same rates as
 * game_settings service_vat and work_income_tax): the price includes VAT, and what's left is the
 * host's income, less income tax.
 */
export const TICKET_VAT = 0.075;
export const INCOME_TAX = 0.07;
/** What the host keeps of each ticket once it's over (about 86.5%). */
export const HOST_SHARE = (1 / (1 + TICKET_VAT)) * (1 - INCOME_TAX);
/** A ticket's money, split: VAT, income tax, and what the host keeps (to the kobo, as the database does). */
export function ticketSplit(price: number) {
  const vat = Math.round(((price * TICKET_VAT) / (1 + TICKET_VAT)) * 100) / 100;
  const tax = Math.round((price - vat) * INCOME_TAX * 100) / 100;
  return { vat, tax, host: Math.round((price - vat - tax) * 100) / 100 };
}
/** Events you can host a day. */
export const HOSTS_A_DAY = 3;
/** Events near enough to hear about the moment they start (tiles, 100 m each). */
export const NEAR_TILES = 40;
/** An event counts as hosted (for reputation) once this many guests came in. */
export const HOSTED_MIN_GUESTS = 3;
/** Reputation: for each event you hosted that people came to, and for every two you went to. */
export const REP_PER_HOSTED = 3;
export const REP_PER_TWO_ATTENDED = 1;
export const REP_MAX = 100;

/** Reputation from events: 3 for each one you hosted that 3+ people came to, 1 for every two you went to (up to 100). */
export function eventRep(hosted: number, attended: number) {
  const h = Math.max(0, Math.round(hosted || 0));
  const a = Math.max(0, Math.round(attended || 0));
  return Math.min(REP_MAX, h * REP_PER_HOSTED + Math.floor(a / 2) * REP_PER_TWO_ATTENDED);
}

/** A title tidied (spaces squeezed), or null when it's too short. */
export function cleanTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  return t.length >= TITLE_MIN ? t : null;
}
export const cleanAbout = (raw: string) => raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, ABOUT_MAX);

export type EventStatus = "upcoming" | "live" | "ended" | "cancelled";
/** Where an event is in its life, from its times (ms) and whether it was called off. */
export function eventStatus(startsAt: number, endsAt: number, cancelled: boolean, now = Date.now()): EventStatus {
  if (cancelled) return "cancelled";
  if (now >= endsAt) return "ended";
  if (now >= startsAt) return "live";
  return "upcoming";
}
/** Can a guest come in now (from a few minutes before it starts until it ends)? */
export const doorsOpen = (startsAt: number, endsAt: number, now = Date.now()) => now >= startsAt - EARLY_DOORS_MINS * 60_000 && now < endsAt;

/** When to start: now, soon, or a set time (the host can pick any time in the next week too). */
export function startChoices(now = Date.now()): { id: string; label: string; at: number }[] {
  const d = new Date(now);
  const at = (days: number, hour: number) => {
    const t = new Date(d);
    t.setDate(t.getDate() + days);
    t.setHours(hour, 0, 0, 0);
    return t.getTime();
  };
  const out = [
    { id: "now", label: "Now", at: now },
    { id: "30m", label: "In 30 min", at: now + 30 * 60_000 },
    { id: "1h", label: "In 1 hour", at: now + 60 * 60_000 },
  ];
  const tonight = at(0, 20);
  if (tonight > now + 60 * 60_000) out.push({ id: "tonight", label: "Tonight 8pm", at: tonight });
  out.push({ id: "tomorrow", label: "Tomorrow 8pm", at: at(1, 20) });
  // The coming Saturday (next week's if it's Saturday already).
  const toSat = (6 - d.getDay() + 7) % 7 || 7;
  if (toSat > 1) out.push({ id: "saturday", label: "Saturday 8pm", at: at(toSat, 20) });
  return out;
}

/** "Live now", "Starts in 25 min", "Today 8:00pm", "Sat 8:00pm". */
export function whenText(startsAt: number, endsAt: number, now = Date.now()) {
  if (now >= endsAt) return "Ended";
  if (now >= startsAt) return `Live now · ${untilText(endsAt - now)} left`;
  const mins = Math.round((startsAt - now) / 60_000);
  if (mins < 60) return `Starts in ${Math.max(1, mins)} min`;
  const s = new Date(startsAt);
  const n = new Date(now);
  const time = s.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "").toLowerCase();
  const sameDay = s.toDateString() === n.toDateString();
  const tomorrow = new Date(n);
  tomorrow.setDate(n.getDate() + 1);
  if (sameDay) return `Today ${time}`;
  if (s.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${s.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
}
/** "1h 20m", "45 min". */
export function untilText(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

// ---------------------------------------------------------------- the stage

/**
 * A YouTube video's id from a link people paste (watch, youtu.be, shorts, live, embed), or a bare
 * id; null for anything else. Videos play through YouTube's own player, so what's shown is what
 * YouTube allows to be embedded (its owners' licence), and nothing is copied to us.
 */
export function youtubeId(raw: string): string | null {
  const s = raw.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname);
      id = m ? m[2] : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** The most slides a talk can have. */
export const SLIDES_MAX = 30;

/**
 * What's on the stage (kept with the event, so people who come in late see the same): slides
 * (pictures, one shown at a time) or a video (playing or paused at a moment), or nothing yet.
 */
export type StageState = {
  mode: "none" | "slides" | "video";
  slides: string[];
  slide: number;
  video: string | null;
  playing: boolean;
  /** Where the video was (seconds) at `at` (ms, the host's clock). */
  pos: number;
  at: number;
  /** A party's DJ: the songs (YouTube ids) still to play after this one. */
  queue: string[];
};
export const EMPTY_STAGE: StageState = { mode: "none", slides: [], slide: 0, video: null, playing: false, pos: 0, at: 0, queue: [] };
/** The most songs waiting in a party's queue. */
export const QUEUE_MAX = 20;

/** A stage state from anything (the database, a message): only what's allowed, the slides only from our own storage. */
export function cleanStage(raw: unknown, slideBase?: string): StageState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const slides = (Array.isArray(o.slides) ? o.slides : [])
    .filter((s): s is string => typeof s === "string" && /^https:\/\/[^\s"'<>]+\.jpg$/.test(s) && (!slideBase || s.startsWith(slideBase)))
    .slice(0, SLIDES_MAX);
  const video = typeof o.video === "string" && /^[A-Za-z0-9_-]{11}$/.test(o.video) ? o.video : null;
  const mode = o.mode === "slides" && slides.length ? "slides" : o.mode === "video" && video ? "video" : "none";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    mode,
    slides,
    slide: Math.max(0, Math.min(slides.length - 1, Math.round(num(o.slide)))),
    video,
    playing: o.playing === true && mode === "video",
    pos: Math.max(0, num(o.pos)),
    at: Math.max(0, num(o.at)),
    queue: (Array.isArray(o.queue) ? o.queue : []).filter((q): q is string => typeof q === "string" && /^[A-Za-z0-9_-]{11}$/.test(q)).slice(0, QUEUE_MAX),
  };
}
/** Where a stage's video should be now (seconds). */
export const videoPosNow = (s: StageState, now = Date.now()) => (s.playing ? s.pos + Math.max(0, now - s.at) / 1000 : s.pos);

// ---------------------------------------------------------------- the party

/** Hot seat: a question for everyone at the party; the answers show with faces, and people can love them. */
export const ICEBREAKERS = [
  "What's the best jollof you've ever had, and who made it?",
  "Which song gets you on the dance floor every single time?",
  "What's something small that made you happy this week?",
  "If you could live in any city in the world for a year, where?",
  "What's your go-to karaoke song?",
  "What's the most Nigerian thing you've ever done?",
  "Best advice anyone ever gave you?",
  "What did you want to be when you were ten?",
  "What's a skill you'd love to learn this year?",
  "Who's the funniest person you know, and why?",
  "Suya, shawarma or small chops?",
  "What's your hidden talent?",
  "What's the best concert or party you've ever been to?",
  "If you won ₦100 million tomorrow, what's the first thing you'd do?",
  "What's a film you can watch again and again?",
  "Which celebrity would you love to have dinner with?",
  "What's your most-used emoji, honestly?",
  "Morning person or night person?",
  "What's one thing on your bucket list?",
  "What's the last thing that made you laugh out loud?",
  "Which old-school song should the DJ play next?",
  "What would your perfect Saturday look like?",
  "Tea or coffee? Defend your answer.",
  "What's a food you could eat every day?",
  "Who here would you trust to plan your birthday?",
  "What's the best gift you've ever been given?",
  "What are you proud of this year?",
  "If your life had a theme song, what would it be?",
  "Beach, mountains or the city?",
  "What's one word your friends would use to describe you?",
];

/** Meet someone new: a starter for two people who were paired at the party. */
export const MEET_PROMPTS = [
  "Find one thing you both love that has nothing to do with music.",
  "Tell each other the best thing that happened to you this month.",
  "Agree on the one song the DJ must play next.",
  "Swap your best food spot in the city.",
  "Guess each other's job. Then tell the truth.",
  "Share the last photo on your phone (in words!).",
  "What brought you to this party?",
  "Plan a dream day out together in three sentences.",
  "Find something you've both done that most people haven't.",
  "Name a film you think the other person should watch.",
];

/** Toasts to raise (the host or anyone can raise one, and everyone clinks). */
export const TOASTS = ["To good friends! 🥂", "To the host! 👑", "To new beginnings! ✨", "To the weekend! 🎉", "To Newtown! 🏙️", "To love! ❤️"];

/** Reactions for the stage and the party. */
export const REACTIONS = ["👏", "🔥", "😂", "❤️", "😮", "🙌"];

/** A hot seat question someone types (their own), tidied; null when too short. */
export const HOT_MAX = 140;
export function cleanQuestion(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().slice(0, HOT_MAX);
  if (t.length < 5) return null;
  return /[?？]$/.test(t) ? t : `${t}?`;
}

/** Dance moves everyone sees your face do at a party. */
export const MOVES = [
  { id: "spin", label: "Spin", icon: "🌀" },
  { id: "jump", label: "Jump", icon: "🦘" },
  { id: "wave", label: "Wave", icon: "👋" },
  { id: "shaku", label: "Shaku", icon: "🕺" },
  { id: "zanku", label: "Zanku", icon: "💃" },
] as const;
export type MoveId = (typeof MOVES)[number]["id"];

/** The party's hype: every reaction, clink, shout-out and spray fills it; full, the party goes off. */
export const HYPE_FULL = 100;
export const HYPE_POINTS: Record<string, number> = { react: 1, clink: 2, shout: 5, toast: 4, spray: 10, move: 1, ans: 2, chat: 1 };

// ---------------------------------------------------------------- what a party costs to host

/** A party costs this much (naira) an hour to host, for the smallest crowd on a quiet street. */
export const PARTY_NAIRA_PER_HOUR = 100_000;
/** How many people can come, and how that multiplies the price. */
export const CAPACITY_COST = [
  { max: 20, k: 1 },
  { max: 50, k: 1.25 },
  { max: 100, k: 1.6 },
  { max: 300, k: 2.4 },
  { max: 1000, k: 4.5 },
  { max: 3000, k: 8 },
  { max: 10_000, k: 14 },
] as const;

/**
 * How big a party is on the map: how far (metres) it reaches from where it is. A house party is one
 * spot; a carnival takes over kilometres of road, every street in it strung with lights and full
 * of dancing. Bigger parties cost more, can take more people, and the biggest make the news.
 */
export const PARTY_SIZES = [
  { m: 50, label: "One spot", blurb: "A few houses' worth", k: 1, most: 300 },
  { m: 150, label: "The block", blurb: "A whole block", k: 1.5, most: 1000 },
  { m: 300, label: "The street", blurb: "The road and the ones off it", k: 2.5, most: 1000 },
  { m: 600, label: "The area", blurb: "A neighbourhood's streets", k: 4.5, most: 3000 },
  { m: 1000, label: "Carnival", blurb: "A kilometre round: every road lit", k: 7, most: 10_000 },
  { m: 2500, label: "Mega carnival", blurb: "Five kilometres across", k: 14, most: 10_000 },
] as const;
export const PARTY_SIZE_DEFAULT = 50;
export const partySize = (m: number) => PARTY_SIZES.find((s) => s.m === m) ?? PARTY_SIZES[0];
/** The crowd sizes to pick from at a party size (up to what it can hold). */
export const capacityChoices = (m: number) => [20, 50, 100, 300, 1000, 3000, 10_000].filter((c) => c <= partySize(m).most);
/** A party this far across (metres) or this crowded or more is big news. */
export const BIG_PARTY_M = 600;
export const BIG_PARTY_PEOPLE = 1000;
export const isBigParty = (radiusM: number, capacity: number) => radiusM >= BIG_PARTY_M || capacity >= BIG_PARTY_PEOPLE;
export const capacityK = (capacity: number) => (CAPACITY_COST.find((c) => capacity <= c.max) ?? CAPACITY_COST[CAPACITY_COST.length - 1]).k;
/** What kind of place it's at, and how that multiplies the price. */
export const VENUE_COST = {
  street: { k: 1, label: "A street" },
  outdoors: { k: 1.2, label: "A park or square" },
  food: { k: 1.5, label: "A restaurant or hotel" },
  nightlife: { k: 1.6, label: "A club" },
  landmark: { k: 5, label: "A landmark" },
} as const;
export type VenueKind = keyof typeof VENUE_COST;
/** Explore's groups (src/lib/world/explore.ts) as venue kinds. */
export const VENUE_OF_GROUP: Record<string, VenueKind> = { parks: "outdoors", food: "food", nightlife: "nightlife", shopping: "landmark", culture: "landmark", sport: "landmark", travel: "landmark" };

/**
 * How pricey the area is (0.8 to 1.8): from the land price of the district round the spot (the
 * dearest parts of town, Ikoyi, Victoria Island, Eko Atlantic, cost most), 1 out of any district.
 */
export function areaK(centres: { x: number; z: number; radius: number; landPrice?: number }[], x: number, z: number) {
  let best = 0;
  let k = 1;
  for (const c of centres) {
    if (!c.landPrice) continue;
    const near = 1 - Math.hypot(c.x - x, c.z - z) / (c.radius * 1.5);
    if (near <= best) continue;
    best = near;
    const own = Math.max(0.8, Math.min(1.8, 0.6 + c.landPrice / 1_000_000));
    k = 1 + (own - 1) * Math.min(1, near * 1.5);
  }
  return Math.round(k * 100) / 100;
}

/** What a party costs to host (naira, to the nearest ₦1,000), and how it adds up. */
export function partyCost(o: { minutes: number; capacity: number; venue: VenueKind; area: number; radiusM?: number }) {
  const hours = Math.max(0.25, o.minutes / 60);
  const parts = {
    hours,
    capacity: capacityK(o.capacity),
    venue: VENUE_COST[o.venue]?.k ?? 1,
    area: Math.max(0.8, Math.min(1.8, o.area || 1)),
    size: partySize(o.radiusM ?? PARTY_SIZE_DEFAULT).k,
  };
  const naira = Math.round((PARTY_NAIRA_PER_HOUR * parts.hours * parts.capacity * parts.venue * parts.area * parts.size) / 1000) * 1000;
  return { naira, parts };
}
/** Called off before it starts: the hosting fee comes back. After that, it's spent. */
export const FEE_BACK_BEFORE_START = true;

/**
 * Street parties can't overlap: none within this many tiles (100 m each) of another one on at the
 * same time, and never where their areas (their sizes) would meet.
 */
export const STREET_GAP_TILES = 16;
/** Do two street parties clash (close enough, or their areas meeting, at the same time)? */
export function streetClash(a: { x: number; z: number; start: number; end: number; radiusM?: number }, b: { x: number; z: number; start: number; end: number; radiusM?: number }) {
  const apart = Math.max(STREET_GAP_TILES, ((a.radiusM ?? PARTY_SIZE_DEFAULT) + (b.radiusM ?? PARTY_SIZE_DEFAULT)) / 100);
  return Math.hypot(a.x - b.x, a.z - b.z) < apart && a.start < b.end && b.start < a.end;
}

/** A deterministic pick from a list for a seed (so every phone shows the same card). */
export const pick = <T,>(list: readonly T[], seed: number) => list[((Math.floor(seed) % list.length) + list.length) % list.length];
