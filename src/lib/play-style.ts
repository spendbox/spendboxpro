// How a player played a game: twelve play styles ("The Explorer", "The Detective"…), worked
// out from what they did (buildings visited, rides, searches, catches, bets…).
//
// Pure maths, no React and no database: the same rules live in game-db/024_play_style.sql
// (play_style_kinds, play_counters, play_style_rules). The server works the style out itself
// from the diary the app keeps plus what it knows for sure; this file is used to show it (titles,
// tease lines, the stats that explain it) and as a fallback when the server can't be reached.
// Change a rule here, change it there too.

/** The play styles, in a fixed order (the order they're listed in). */
export const STYLE_KEYS = [
  "explorer",
  "tourist",
  "detective",
  "phantom",
  "escape",
  "socialite",
  "party",
  "foodie",
  "high_roller",
  "thief",
  "gamer",
  "sports_fan",
] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

/** Line icons (Lucide names) the screens draw for each style. */
export type StyleIconName =
  | "Compass"
  | "Camera"
  | "ScanSearch"
  | "Ghost"
  | "Footprints"
  | "MessageCircleHeart"
  | "PartyPopper"
  | "UtensilsCrossed"
  | "Dices"
  | "VenetianMask"
  | "Gamepad2"
  | "Trophy";

export type PlayStyle = {
  key: StyleKey;
  /** "The Explorer". */
  title: string;
  /** "Explorer" (for tight spaces). */
  short: string;
  icon: StyleIconName;
  /** Main colour (white text reads well on it). */
  color: string;
  /** What it means, said to the player. */
  blurb: string;
  /** What makes it (for the "all your styles" list). */
  how: string;
  /** Used after "with": "The Explorer with a Party Animal streak". */
  combo: string;
  /** Tease and hype lines (one is picked per game). */
  lines: string[];
  /** Lines for a ghost who got caught (so we never say "they never found you" when they did). */
  caughtLines?: string[];
  /** A mint amount worth showing with this style ("300 mint sprayed"). */
  mintStat?: CounterKey;
  /** Breaks a dead heat: the lower number wins (rarer, more fun styles first). */
  tie: number;
};

export const STYLES: Record<StyleKey, PlayStyle> = {
  explorer: {
    key: "explorer",
    title: "The Explorer",
    short: "Explorer",
    icon: "Compass",
    color: "#0d9488",
    blurb: "If it had a door, you opened it. Lobbies, floors, rooftops, town events: you went everywhere.",
    how: "Buildings, floors and rooftops visited, town events grabbed",
    combo: "an Explorer's itchy feet",
    tie: 12,
    lines: [
      "If it has a door, you've been through it.",
      "Maps are for people who haven't met you.",
      "You didn't visit the town. You toured it.",
      "Somewhere a lift is still catching its breath.",
      "Every rooftop in town knows your footsteps.",
      "Curiosity didn't just win. It took a victory lap.",
      "The town has secrets. You have a list of them.",
      "You found corners the builders forgot about.",
      "Lost? Never. Just exploring with style.",
      "Next time bring a passport. You've earned the stamps.",
    ],
  },
  tourist: {
    key: "tourist",
    title: "The Tourist",
    short: "Tourist",
    icon: "Camera",
    color: "#0284c7",
    blurb: "Balloons, trains, boats and the Ferris wheel. You came for the views and you got every one.",
    how: "Balloon, train, bus, car and boat rides, Ferris wheel spins, water slides, photos",
    combo: "a Tourist's window seat",
    tie: 10,
    lines: [
      "Window seat, every time. Respect.",
      "You saw the whole town and barely walked a step.",
      "Balloon? Train? Boat? You said yes to all of it.",
      "Your camera roll needs its own storage plan.",
      "The ticket inspector knows you by name now.",
      "Life's a ride and you're riding all of them.",
      "Some people hunt. You sightsee. Both valid.",
      "Best views in town, and you had the front row.",
      "You treat public transport like a theme park. Iconic.",
    ],
  },
  detective: {
    key: "detective",
    title: "The Detective",
    short: "Detective",
    icon: "ScanSearch",
    color: "#2563eb",
    blurb: "Searching spots, sending drones, catching ghosts. The hunt is your happy place.",
    how: "Spots searched, drones sent, ghosts caught",
    combo: "a Detective's nose",
    tie: 4,
    lines: [
      "No spot left unsearched, no ghost left unbothered.",
      "Ghosts check under the bed for you.",
      "Magnifying glass? You ARE the magnifying glass.",
      "You searched like rent was due.",
      "Elementary, my dear ghost.",
      "Your drone has more flying hours than a pilot.",
      "Somewhere a ghost is moving house because of you.",
      "Clues fear you. Ghosts fear you more.",
      "Hide and seek? You only heard the second word.",
    ],
  },
  phantom: {
    key: "phantom",
    title: "The Phantom",
    short: "Phantom",
    icon: "Ghost",
    color: "#7c3aed",
    blurb: "You hid, you held your nerve, and the hunters walked right past.",
    how: "Playing a ghost and staying hidden to the end",
    combo: "a Phantom's vanishing trick",
    tie: 2,
    lines: [
      "They searched. They swept. They never found you.",
      "Hunters walked past you like you were furniture.",
      "Invisible is a skill, and you've mastered it.",
      "You hid so well even you weren't sure where you were.",
      "Silent, patient, untouchable. Very spooky.",
      "The drones are still looking. Let them.",
      "A ghost so quiet the other ghosts got jealous.",
      "Hide and seek champion of the town. Say it louder.",
      "Peekaboo is not in your vocabulary.",
    ],
    caughtLines: [
      "So close to vanishing for good. Next hour is yours.",
      "You hid like a pro. The hunters just got lucky.",
      "A phantom in training. The town should be worried.",
      "They found you, but they had to work for it.",
      "Spooky, sneaky, nearly perfect. Run it back.",
      "Even the best ghosts get spotted once. Once.",
      "That was a warm-up. The real vanishing act is next.",
      "The hunters are still bragging. Make it their last time.",
    ],
  },
  escape: {
    key: "escape",
    title: "The Escape Artist",
    short: "Escape Artist",
    icon: "Footprints",
    color: "#a21caf",
    blurb: "Always on the move. Shields up, decoys down, never in the same spot twice.",
    how: "Ghost moves, shields, decoys and comebacks",
    combo: "an Escape Artist's quick feet",
    tie: 3,
    lines: [
      "Catch me if you can? They couldn't.",
      "You moved so much the map got dizzy.",
      "Here one minute, gone the next. Classic you.",
      "Decoys, dodges and disappearing acts. Bravo.",
      "Hunters need a sat-nav just to keep up with you.",
      "You don't hide. You relocate dramatically.",
      "Slippery? You're practically buttered.",
      "Houdini called. He wants tips.",
    ],
    caughtLines: [
      "You gave the hunters a proper chase. They had to earn it.",
      "Moves like that deserve a rematch. Next hour?",
      "Caught, but never cornered for long. What a run.",
      "Even Houdini had off nights. Yours was still a show.",
      "All those dodges? The hunters will be dreaming about them.",
      "You made them sweat for every step. Respect.",
      "Next time the getaway car waits for you. Promise.",
      "The great escape got a sequel. Coming next hour.",
    ],
  },
  socialite: {
    key: "socialite",
    title: "The Socialite",
    short: "Socialite",
    icon: "MessageCircleHeart",
    color: "#f97316",
    blurb: "Chatting, gifting, taking a seat with the locals. You came to play and stayed to talk.",
    how: "Chat messages, locals chatted up, gifts given, time on a seat",
    combo: "a Socialite's charm",
    mintStat: "gift_mint",
    tie: 11,
    lines: [
      "You didn't play the game. You hosted it.",
      "Every regular in town has your number now.",
      "You make friends faster than hunters make searches.",
      "The chat gets louder when you're around.",
      "Small talk? You only do big talk.",
      "The town's unofficial welcome committee.",
      "Even the locals are telling stories about you.",
      "Generous, chatty and impossible to ignore.",
      "Popular is an understatement.",
    ],
  },
  party: {
    key: "party",
    title: "The Party Animal",
    short: "Party Animal",
    icon: "PartyPopper",
    color: "#e11d48",
    blurb: "Clubs, dance floors and mint showers. Wherever the music was, so were you.",
    how: "Clubs visited, time in the club, dance-offs and jams, mint sprayed",
    combo: "a Party Animal streak",
    mintStat: "spray_mint",
    tie: 7,
    lines: [
      "The DJ played your song. Twice.",
      "You came, you danced, you made it rain mint.",
      "The dance floor misses you already.",
      "Ghosts hide. You shine under the disco lights.",
      "Sleep is for people without dance moves.",
      "You don't find the party. The party finds you.",
      "Your feet are tired. Your vibe is not.",
      "Owambe energy, all hour long.",
      "You turned a hunt into a headline show.",
    ],
  },
  foodie: {
    key: "foodie",
    title: "The Foodie",
    short: "Foodie",
    icon: "UtensilsCrossed",
    color: "#ea580c",
    blurb: "Jollof, suya and a chapman on the side. You ate your way round town.",
    how: "Food and drinks ordered, restaurants tried",
    combo: "a Foodie's appetite",
    tie: 8,
    lines: [
      "Hunger games? You won the tasty one.",
      "The chef has started saving you a table.",
      "Calories don't count in Newtown. You checked.",
      "You came for the hunt. You stayed for the jollof.",
      "Puff-puff keeps disappearing around you. Suspicious.",
      "Your taste buds deserve a medal.",
      "Waiters wave when they see you coming.",
      "Five stars for the food, five stars for your appetite.",
      "Somebody give this person a food show.",
    ],
  },
  high_roller: {
    key: "high_roller",
    title: "The High Roller",
    short: "High Roller",
    icon: "Dices",
    color: "#b7791f",
    blurb: "Bets on the big matches and a spin of the slots. Cool head, big moments.",
    how: "Bets placed and won, slots played",
    combo: "a High Roller's nerve",
    mintStat: "bet_mint",
    tie: 5,
    lines: [
      "Fortune favours the bold, and you are very bold.",
      "You don't watch the odds. The odds watch you.",
      "Cool head, steady hands, big plays.",
      "The bookies whisper your name.",
      "You play it cool, even when it's close.",
      "You treat every match like a final.",
      "Smooth as a winning ticket.",
      "Big plays only. The town noticed.",
    ],
  },
  thief: {
    key: "thief",
    title: "The Master Thief",
    short: "Master Thief",
    icon: "VenetianMask",
    color: "#334155",
    blurb: "Side quests, sneaky jobs and a swiped mint or two. Smooth.",
    how: "Mint swiped, thief jobs and other side quests finished",
    combo: "a Master Thief's light fingers",
    tie: 1,
    lines: [
      "Light fingers, big smile, zero regrets.",
      "Nobody saw anything. Nobody ever does.",
      "Smooth operator energy, all game long.",
      "You don't take mint. You relocate it.",
      "The job was clean. The getaway was cleaner.",
      "Lock your pockets, the legend is in town.",
      "Every heist needs a mastermind. Hello.",
      "Sneaky? You prefer 'strategically quiet'.",
      "The town's favourite outlaw.",
    ],
  },
  gamer: {
    key: "gamer",
    title: "The Gamer",
    short: "Gamer",
    icon: "Gamepad2",
    color: "#4d7c0f",
    blurb: "Darts, pool, trivia, cards. If there was a high score, you went for it.",
    how: "Mini games played and won",
    combo: "a Gamer's thumbs",
    tie: 9,
    lines: [
      "High scores tremble when you walk in.",
      "Darts, pool, trivia: you collected them all.",
      "One more game turned into ten. We saw.",
      "Your thumbs deserve a holiday.",
      "Bullseye, jackpot, streak. Repeat.",
      "The arcade should name a machine after you.",
      "You play mini games like they're the main event.",
      "Respect the grind, fear the streak.",
      "Somewhere a leaderboard just got updated.",
    ],
  },
  sports_fan: {
    key: "sports_fan",
    title: "The Sports Fan",
    short: "Sports Fan",
    icon: "Trophy",
    color: "#15803d",
    blurb: "In the stands, ticket in hand. You never miss a match.",
    how: "Matches watched, stadium visits, time in the stands",
    combo: "a Sports Fan's lungs",
    tie: 6,
    lines: [
      "You cheered so loud the ghosts heard it.",
      "Best seat in the stadium, as usual.",
      "Football, boxing, wrestling: you watched it all.",
      "The players should thank you for the support.",
      "Hunt? Sure. But first, the match.",
      "You know the score before the scoreboard does.",
      "Season ticket energy.",
      "If cheering was a sport, you'd have a trophy.",
    ],
  },
};

/** Who knows a number best: the app ("client"), the server ("server", replaces the app's), or both (the bigger one wins). */
export type CounterSource = "client" | "server" | "max";

type CounterInfo = {
  /** Most that can count in one game (the app can be fibbed to; this keeps it sane). */
  max: number;
  source: CounterSource;
  /** [one, many] after the number ("1 building visited", "5 buildings visited"); null: never shown. */
  label: [string, string] | null;
  /** A mint amount ("300 mint sprayed"): shown as "{n} {label[1]}". */
  mint?: boolean;
};

/** Everything that's counted in a game. Mirrors play_counters in game-db/024_play_style.sql. */
export const COUNTERS = {
  // Only the app sees these (where you went, what you rode, what you ate…).
  buildings: { max: 60, source: "client", label: ["building visited", "buildings visited"] },
  rooms: { max: 150, source: "client", label: ["room explored", "rooms explored"] },
  roofs: { max: 40, source: "client", label: ["rooftop climbed", "rooftops climbed"] },
  clubs: { max: 30, source: "client", label: ["club visited", "clubs visited"] },
  club_minutes: { max: 70, source: "client", label: ["minute in the club", "minutes in the club"] },
  restaurants: { max: 30, source: "client", label: ["restaurant tried", "restaurants tried"] },
  arenas: { max: 20, source: "client", label: ["stadium visit", "stadium visits"] },
  arena_minutes: { max: 70, source: "client", label: ["minute in the stands", "minutes in the stands"] },
  ride_balloon: { max: 20, source: "client", label: ["balloon ride", "balloon rides"] },
  ride_train: { max: 30, source: "client", label: ["train ride", "train rides"] },
  ride_bus: { max: 30, source: "client", label: ["bus ride", "bus rides"] },
  ride_car: { max: 30, source: "client", label: ["car ride", "car rides"] },
  ride_boat: { max: 30, source: "client", label: ["boat trip", "boat trips"] },
  ride_ferris: { max: 30, source: "client", label: ["Ferris wheel spin", "Ferris wheel spins"] },
  ride_slide: { max: 40, source: "client", label: ["trip down the slide", "trips down the slide"] },
  photos: { max: 60, source: "client", label: ["photo snapped", "photos snapped"] },
  seats: { max: 60, source: "client", label: ["seat taken", "seats taken"] },
  seat_minutes: { max: 70, source: "client", label: ["minute on a seat", "minutes on a seat"] },
  slots: { max: 100, source: "client", label: ["game of slots", "games of slots"] },
  orders_food: { max: 40, source: "client", label: ["dish ordered", "dishes ordered"] },
  orders_drink: { max: 40, source: "client", label: ["drink ordered", "drinks ordered"] },
  // Both see these: the bigger number wins.
  npc_chats: { max: 60, source: "max", label: ["local chatted up", "locals chatted up"] },
  arcade_games: { max: 100, source: "max", label: ["mini game played", "mini games played"] },
  party_games: { max: 60, source: "max", label: ["dance-off or jam", "dance-offs and jams"] },
  games_won: { max: 100, source: "max", label: ["mini game won", "mini games won"] },
  // The server knows these for sure (the app's numbers are replaced).
  searches: { max: 5000, source: "server", label: ["spot searched", "spots searched"] },
  sweeps: { max: 1000, source: "server", label: ["drone sent out", "drones sent out"] },
  catches: { max: 1000, source: "server", label: ["ghost caught", "ghosts caught"] },
  hunter: { max: 1, source: "server", label: null },
  ghost: { max: 1, source: "server", label: null },
  survived: { max: 1, source: "server", label: null },
  moves: { max: 50, source: "server", label: ["sneaky move", "sneaky moves"] },
  tricks: { max: 3, source: "server", label: ["trick pulled", "tricks pulled"] },
  bets: { max: 100, source: "server", label: ["bet placed", "bets placed"] },
  bets_won: { max: 100, source: "server", label: ["bet won", "bets won"] },
  bet_mint: { max: 100000, source: "server", label: ["mint on the line", "mint on the line"], mint: true },
  tickets: { max: 50, source: "server", label: ["match watched", "matches watched"] },
  gifts: { max: 200, source: "server", label: ["gift given", "gifts given"] },
  gift_mint: { max: 1000000, source: "server", label: ["mint gifted", "mint gifted"], mint: true },
  sprays: { max: 200, source: "server", label: ["mint shower", "mint showers"] },
  spray_mint: { max: 1000000, source: "server", label: ["mint sprayed", "mint sprayed"], mint: true },
  steals: { max: 50, source: "server", label: ["sneaky swipe", "sneaky swipes"] },
  quests_done: { max: 20, source: "server", label: ["side quest done", "side quests done"] },
  thief_quests: { max: 20, source: "server", label: ["thief job pulled off", "thief jobs pulled off"] },
  events: { max: 50, source: "server", label: ["town event grabbed", "town events grabbed"] },
  chats: { max: 2000, source: "server", label: ["chat message", "chat messages"] },
} as const satisfies Record<string, CounterInfo>;

export type CounterKey = keyof typeof COUNTERS;
export type Counters = Partial<Record<CounterKey, number>>;
export const COUNTER_KEYS = Object.keys(COUNTERS) as CounterKey[];

/**
 * How each style scores: weight × the counter (counted up to cap). Mirrors play_style_rules in
 * game-db/024_play_style.sql. Whole numbers only, so the app and the server always agree.
 */
export const RULES: { style: StyleKey; counter: CounterKey; weight: number; cap: number }[] = [
  { style: "explorer", counter: "buildings", weight: 4, cap: 15 },
  { style: "explorer", counter: "rooms", weight: 1, cap: 30 },
  { style: "explorer", counter: "roofs", weight: 2, cap: 10 },
  { style: "explorer", counter: "events", weight: 4, cap: 5 },

  { style: "tourist", counter: "ride_balloon", weight: 5, cap: 6 },
  { style: "tourist", counter: "ride_train", weight: 4, cap: 8 },
  { style: "tourist", counter: "ride_bus", weight: 3, cap: 8 },
  { style: "tourist", counter: "ride_car", weight: 3, cap: 8 },
  { style: "tourist", counter: "ride_boat", weight: 4, cap: 8 },
  { style: "tourist", counter: "ride_ferris", weight: 4, cap: 6 },
  { style: "tourist", counter: "ride_slide", weight: 3, cap: 8 },
  { style: "tourist", counter: "photos", weight: 4, cap: 6 },

  { style: "detective", counter: "catches", weight: 8, cap: 6 },
  { style: "detective", counter: "searches", weight: 1, cap: 40 },
  { style: "detective", counter: "sweeps", weight: 2, cap: 10 },
  { style: "detective", counter: "hunter", weight: 2, cap: 1 },

  { style: "phantom", counter: "survived", weight: 20, cap: 1 },
  { style: "phantom", counter: "ghost", weight: 4, cap: 1 },

  { style: "escape", counter: "moves", weight: 6, cap: 5 },
  { style: "escape", counter: "tricks", weight: 6, cap: 3 },

  { style: "socialite", counter: "npc_chats", weight: 3, cap: 10 },
  { style: "socialite", counter: "gifts", weight: 4, cap: 5 },
  { style: "socialite", counter: "chats", weight: 1, cap: 30 },
  { style: "socialite", counter: "seat_minutes", weight: 1, cap: 15 },

  { style: "party", counter: "club_minutes", weight: 1, cap: 30 },
  { style: "party", counter: "sprays", weight: 5, cap: 6 },
  { style: "party", counter: "clubs", weight: 4, cap: 6 },
  { style: "party", counter: "party_games", weight: 3, cap: 10 },

  { style: "foodie", counter: "orders_food", weight: 4, cap: 10 },
  { style: "foodie", counter: "orders_drink", weight: 3, cap: 10 },
  { style: "foodie", counter: "restaurants", weight: 3, cap: 6 },

  { style: "high_roller", counter: "bets", weight: 6, cap: 10 },
  { style: "high_roller", counter: "bets_won", weight: 4, cap: 10 },
  { style: "high_roller", counter: "slots", weight: 2, cap: 10 },

  { style: "thief", counter: "steals", weight: 12, cap: 3 },
  { style: "thief", counter: "thief_quests", weight: 8, cap: 3 },
  { style: "thief", counter: "quests_done", weight: 3, cap: 5 },

  { style: "gamer", counter: "arcade_games", weight: 3, cap: 15 },
  { style: "gamer", counter: "games_won", weight: 2, cap: 15 },

  { style: "sports_fan", counter: "tickets", weight: 8, cap: 5 },
  { style: "sports_fan", counter: "arenas", weight: 4, cap: 5 },
  { style: "sports_fan", counter: "arena_minutes", weight: 1, cap: 30 },
];

/** Second style counts as a "combo" when it scores at least this share of the top one… */
export const COMBO_SHARE = 0.65;
/** …and at least this many points. */
export const COMBO_MIN = 5;

export type StyleScores = Record<StyleKey, number>;

const isStyle = (v: unknown): v is StyleKey => typeof v === "string" && (STYLE_KEYS as readonly string[]).includes(v);
export { isStyle };

/** Whole, non-negative numbers, each capped to its sane maximum; unknown keys dropped. */
export function cleanCounters(raw: unknown): Counters {
  const out: Counters = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const k of COUNTER_KEYS) {
    const v = src[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const n = Math.min(Math.max(Math.floor(v), 0), COUNTERS[k].max);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** The app's diary plus what the server knows (same as play_merge in the database). */
export function mergeCounters(client: Counters, server: Counters): Counters {
  const out: Counters = {};
  for (const k of COUNTER_KEYS) {
    const a = client[k] ?? 0;
    const b = server[k] ?? 0;
    const src: CounterSource = COUNTERS[k].source;
    const n = src === "client" ? a : src === "server" ? b : Math.max(a, b);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** How much one rule adds. */
const part = (c: Counters, r: (typeof RULES)[number]) => r.weight * Math.min(c[r.counter] ?? 0, r.cap);

/** Points for every style. */
export function scoreStyles(c: Counters): StyleScores {
  const out = Object.fromEntries(STYLE_KEYS.map((k) => [k, 0])) as StyleScores;
  for (const r of RULES) out[r.style] += part(c, r);
  return out;
}

/** Styles from best to worst (dead heats: the rarer style first). */
export function rankStyles(scores: Partial<StyleScores>): StyleKey[] {
  return [...STYLE_KEYS].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || STYLES[a].tie - STYLES[b].tie);
}

/** The style with the most points. Nothing at all to go on: The Explorer (you came and looked around). */
export function pickStyle(scores: Partial<StyleScores>): StyleKey {
  const best = rankStyles(scores)[0];
  return (scores[best] ?? 0) > 0 ? best : "explorer";
}

/** A close second style, for "The Explorer with a Party Animal streak", or null. */
export function sideStyle(scores: Partial<StyleScores>, top: StyleKey): StyleKey | null {
  const topScore = scores[top] ?? 0;
  const next = rankStyles(scores).find((k) => k !== top);
  if (!next || topScore <= 0) return null;
  const s = scores[next] ?? 0;
  return s >= COMBO_MIN && s >= topScore * COMBO_SHARE ? next : null;
}

/** "with a Party Animal streak", or null. */
export function comboText(side: StyleKey | null) {
  return side ? `with ${STYLES[side].combo}` : null;
}

export type StyleStat = { key: CounterKey | "survived" | "visited"; value: number; text: string };

/** "5 buildings visited", "300 mint sprayed", "Stayed hidden to the end". */
export function statText(key: CounterKey | "survived" | "visited", value: number): string | null {
  if (key === "survived") return value > 0 ? "Stayed hidden to the end" : null;
  if (key === "visited") return "Dropped into town";
  const info: CounterInfo = COUNTERS[key];
  if (!info.label || value <= 0) return null;
  const n = value.toLocaleString("en");
  return `${n} ${value === 1 ? info.label[0] : info.label[1]}`;
}

/**
 * The 3 or 4 numbers that best explain a style: the style's own biggest contributions first
 * (with its mint amount, if any), then the biggest from the other styles to fill up.
 */
export function explainStyle(c: Counters, style: StyleKey, max = 4): StyleStat[] {
  const out: StyleStat[] = [];
  const add = (key: StyleStat["key"], value: number) => {
    if (out.length >= max || out.some((s) => s.key === key)) return;
    const text = statText(key, value);
    if (text) out.push({ key, value, text });
  };
  const ranked = (rules: typeof RULES) => [...rules].filter((r) => part(c, r) > 0).sort((a, b) => part(c, b) - part(c, a));
  const own = ranked(RULES.filter((r) => r.style === style));
  const mint = STYLES[style].mintStat;
  own.forEach((r, i) => {
    if (r.counter === "survived") add("survived", c.survived ?? 0);
    else add(r.counter, c[r.counter] ?? 0);
    if (i === 0 && mint) add(mint, c[mint] ?? 0);
  });
  if (mint) add(mint, c[mint] ?? 0);
  if (out.length < 3) {
    for (const r of ranked(RULES.filter((x) => x.style !== style))) {
      if (out.length >= 3) break;
      if (r.counter === "survived") add("survived", c.survived ?? 0);
      else add(r.counter, c[r.counter] ?? 0);
    }
  }
  if (!out.length) add("visited", 1);
  return out;
}

/** Small, stable number from anything (so the same game always gets the same line). */
function seedOf(seed: number | string) {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A tease / hype line for this style (the same one for the same game; ghosts who got caught get kinder ones). */
export function lineFor(style: StyleKey, seed: number | string, c?: Counters): string {
  const s = STYLES[style];
  const caught = (c?.ghost ?? 0) > 0 && (c?.survived ?? 0) === 0;
  const list = caught && s.caughtLines?.length ? s.caughtLines : s.lines;
  return list[seedOf(`${style}:${seed}`) % list.length];
}

/** Everything the end-of-game card needs, from a game's counters. */
export type StyleResult = {
  style: StyleKey;
  side: StyleKey | null;
  scores: StyleScores;
  counters: Counters;
  stats: StyleStat[];
};

export function describeGame(counters: Counters, style?: StyleKey | null, scores?: Partial<StyleScores> | null): StyleResult {
  const sc = scores && Object.keys(scores).length ? ({ ...scoreStyles({}), ...scores } as StyleScores) : scoreStyles(counters);
  const top = style && isStyle(style) ? style : pickStyle(sc);
  const side = sideStyle(sc, top);
  return { style: top, side, scores: sc, counters, stats: explainStyle(counters, top) };
}

/** Your lifetime mix, as the server sends it (see my_play_style). */
export type LifetimeStyle = {
  /** Games counted. */
  games: number;
  /** Share of each style over all your games (adds up to 1). */
  shares: Record<StyleKey, number>;
  /** Games where each style came out on top. */
  tops: Record<StyleKey, number>;
  /** Your latest games, newest first. */
  recent: { round: number; style: StyleKey; at: string }[];
};

/** Your style over time: the biggest share and a close second ("Mostly The Explorer, with a Detective's nose"). */
export function lifetimeSummary(l: LifetimeStyle): { style: StyleKey; side: StyleKey | null } | null {
  if (!l.games) return null;
  const order = rankStyles(l.shares);
  const style = order[0];
  if (!(l.shares[style] > 0)) return null;
  const next = order[1];
  const side = next && l.shares[next] >= l.shares[style] * COMBO_SHARE && l.shares[next] >= 0.1 ? next : null;
  return { style, side };
}
