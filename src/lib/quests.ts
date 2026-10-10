// Side quests: little missions handed to random players ("Today you are a thief…"). People
// sitting down in buildings get them most often, regulars (NPCs) hand some out, and now and
// then one just lands on someone. Each quest has a few steps; finishing them pays a few coins
// and sometimes unlocks a special move (steal some coins, get a hint, a free search…).
//
// This list is the source of truth. The database keeps a copy (game-db/019_activities.sql,
// table quest_catalog) with the same keys, titles, briefs, rewards, special moves and step
// targets. Change both together.
//
// No imports on purpose: the browser, the server and the SQL generator all read this file.

/** Anyone holding this many coins (or more) is a big fish. */
export const BIG_FISH_COINS = 10_000;

/** True for a big fish: more than 10,000 coins. */
export function isBigFish(coins: number | null | undefined) {
  return typeof coins === "number" && coins >= BIG_FISH_COINS;
}

/** The kinds of place a quest can send you to (from the room id, see placeKindOf). */
export type QuestPlace = "lobby" | "floor" | "roof" | "balloon" | "vehicle";
/** Rides: balloons, boats, trains and cars (taxis and buses count as cars). */
export type RideKind = "balloon" | "boat" | "train" | "car" | "any";
/** Mini games that can count towards a quest (see src/app/play/activities). */
export type QuestGame =
  | "archery"
  | "darts"
  | "reflex"
  | "pool"
  | "rps"
  | "dice"
  | "cards"
  | "trivia"
  | "dance"
  | "karaoke"
  | "jukebox"
  | "piano"
  | "slots"
  | "stairs"
  | "photo";

export type QuestStep =
  /** Go into `count` different places of one kind (rooftops, lobbies…). */
  | { type: "visit_kind"; kind: QuestPlace; count: number }
  /** Go into `count` different places (any kind). */
  | { type: "visit_rooms"; count: number }
  /** Go into `count` different buildings. */
  | { type: "visit_buildings"; count: number }
  /** Sit on seats for this long in total (optionally only in one kind of place). */
  | { type: "sit_seconds"; seconds: number; kind?: QuestPlace }
  /** Spend this long in one kind of place. */
  | { type: "stay_seconds"; seconds: number; kind: QuestPlace }
  /** Say hi to `count` different regulars. */
  | { type: "talk_npcs"; count: number }
  /** Take `count` rides (balloon, boat, train, car). */
  | { type: "ride_kind"; kind: RideKind; count: number }
  /** Play a mini game `count` times (any game, or one game; optionally with a score). */
  | { type: "play_game"; count: number; game?: QuestGame; minScore?: number }
  /** Win `count` duels (Rock-Paper-Scissors, dice…). */
  | { type: "win_duel"; count: number; game?: QuestGame }
  /** Order at `count` different restaurants or bars. */
  | { type: "order_food"; count: number; where?: "restaurant" | "bar" }
  /** Spray this many coins on a dance floor (checked by the server). */
  | { type: "spray"; coins: number }
  /** Give this many coins away in total (checked by the server). */
  | { type: "gift"; coins: number }
  /** Give coins to this many different people (checked by the server). */
  | { type: "gift_people"; count: number }
  /** Hunters: search this many spots (checked by the server). */
  | { type: "search_tiles"; count: number }
  /** Hunters: send the drone this many times (checked by the server). */
  | { type: "sweep"; count: number }
  /** Ghosts: stay hidden (not caught) for this many minutes. */
  | { type: "survive_minutes"; minutes: number }
  /** Grab a reward from a world event or a coin balloon (checked by the server). */
  | { type: "claim_event"; count: number }
  /** Hug or shake hands with this many different players (or only hug / only shake hands; checked by the server). */
  | { type: "greet"; count: number; kind?: "hug" | "handshake" };

export type QuestStepType = QuestStep["type"];

/** What finishing a quest can unlock (used from the quest card). */
export type SpecialAction =
  /** Take 1–5% (at most 100) of one player's coins. They're told, and safe for 24 hours. */
  | "steal"
  /** A rough idea of where a ghost is hiding (hunters), or where hunters are looking (ghosts). */
  | "hint"
  /** See the last few spots one hunter searched. */
  | "spy"
  /** Your next search is free (your daily free search comes back). */
  | "free_search"
  /** Ghosts: one extra move this game. */
  | "free_move";

/** Who a quest suits: ghosts only, hunters only, or anyone. */
export type QuestFit = "any" | "ghost" | "hunter";

/** Picture for the quest (the app picks a matching icon). */
export type QuestIcon =
  | "thief"
  | "detective"
  | "courier"
  | "food"
  | "party"
  | "tourist"
  | "spy"
  | "night"
  | "gift"
  | "treasure"
  | "camera"
  | "target"
  | "trophy"
  | "message"
  | "lookout"
  | "ghost"
  | "search"
  | "drone"
  | "music"
  | "mic"
  | "game"
  | "brain"
  | "cards"
  | "dice"
  | "building"
  | "chat"
  | "drink"
  | "balloon"
  | "train"
  | "boat"
  | "seat"
  | "dance"
  | "coins"
  | "hug";

export type QuestDef = {
  key: string;
  /** "Thief", "Detective"… */
  title: string;
  /** "Today you are a…" line, shown big when the quest arrives. */
  role: string;
  /** One or two plain sentences about what to do. */
  brief: string;
  icon: QuestIcon;
  fits: QuestFit;
  steps: QuestStep[];
  /** Coins for finishing (paid by the server). */
  reward: number;
  /** A special move unlocked when it's done. */
  action?: SpecialAction;
};

const STEAL_BRIEF = "Then pick a player and swipe a little of their mint (1–5%, at most 100).";

export const QUESTS: QuestDef[] = [
  // ------------------------------------------------------------------ thieves and tricksters
  {
    key: "thief",
    title: "Thief",
    role: "Today you are a thief.",
    brief: `Case the joint: wander into 2 places and sit somewhere quietly for 30 seconds. ${STEAL_BRIEF}`,
    icon: "thief",
    fits: "any",
    steps: [{ type: "visit_rooms", count: 2 }, { type: "sit_seconds", seconds: 30 }],
    reward: 5,
    action: "steal",
  },
  {
    key: "pickpocket",
    title: "Pickpocket",
    role: "Today you are a pickpocket.",
    brief: `Lobbies are busy. Slip through 2 of them and chat up a regular as a distraction. ${STEAL_BRIEF}`,
    icon: "thief",
    fits: "any",
    steps: [{ type: "visit_kind", kind: "lobby", count: 2 }, { type: "talk_npcs", count: 1 }],
    reward: 5,
    action: "steal",
  },
  {
    key: "cat_burglar",
    title: "Cat burglar",
    role: "Today you are a cat burglar.",
    brief: `Climb onto 2 rooftops and lie low up there for 45 seconds. ${STEAL_BRIEF}`,
    icon: "night",
    fits: "any",
    steps: [{ type: "visit_kind", kind: "roof", count: 2 }, { type: "stay_seconds", kind: "roof", seconds: 45 }],
    reward: 5,
    action: "steal",
  },
  {
    key: "heist_planner",
    title: "Heist planner",
    role: "Today you are planning a heist.",
    brief: `Scout 2 office floors, sweet-talk 2 regulars, then sit and wait for your moment (30 seconds). ${STEAL_BRIEF}`,
    icon: "thief",
    fits: "any",
    steps: [
      { type: "visit_kind", kind: "floor", count: 2 },
      { type: "talk_npcs", count: 2 },
      { type: "sit_seconds", seconds: 30 },
    ],
    reward: 10,
    action: "steal",
  },
  {
    key: "trickster",
    title: "Trickster",
    role: "Today you are a trickster.",
    brief: `Beat someone at Rock-Paper-Scissors while they're not looking. ${STEAL_BRIEF}`,
    icon: "thief",
    fits: "any",
    steps: [{ type: "win_duel", count: 1, game: "rps" }],
    reward: 5,
    action: "steal",
  },
  {
    key: "card_cheat",
    title: "Card cheat",
    role: "Today you are a card cheat.",
    brief: `Play Higher or Lower and get a streak of 4 or more. ${STEAL_BRIEF}`,
    icon: "cards",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "cards", minScore: 4 }],
    reward: 5,
    action: "steal",
  },

  // ------------------------------------------------------------------ detectives and spies
  {
    key: "detective",
    title: "Detective",
    role: "Today you are a detective.",
    brief: "Ask around: talk to 3 different regulars. They'll point you in the right direction.",
    icon: "detective",
    fits: "any",
    steps: [{ type: "talk_npcs", count: 3 }],
    reward: 10,
    action: "hint",
  },
  {
    key: "private_eye",
    title: "Private eye",
    role: "Today you are a private eye.",
    brief: "Stake out 2 office floors and sit and watch for 20 seconds. You'll get a tip-off.",
    icon: "detective",
    fits: "any",
    steps: [{ type: "visit_kind", kind: "floor", count: 2 }, { type: "sit_seconds", seconds: 20 }],
    reward: 10,
    action: "hint",
  },
  {
    key: "spy",
    title: "Spy",
    role: "Today you are a spy.",
    brief: "Sit in a lobby for 30 seconds, hiding behind a newspaper. Then you can follow one hunter's searches.",
    icon: "spy",
    fits: "any",
    steps: [{ type: "sit_seconds", seconds: 30, kind: "lobby" }],
    reward: 5,
    action: "spy",
  },
  {
    key: "lookout",
    title: "Lookout",
    role: "Today you are the lookout.",
    brief: "Take a seat on a rooftop and keep watch for a full minute. You'll spot something.",
    icon: "lookout",
    fits: "any",
    steps: [{ type: "sit_seconds", seconds: 60, kind: "roof" }],
    reward: 10,
    action: "hint",
  },
  {
    key: "informant",
    title: "Informant",
    role: "Today you are an informant.",
    brief: "Gossip with 2 regulars and ride a balloon to see the whole city. Then you can follow one hunter's searches.",
    icon: "spy",
    fits: "any",
    steps: [{ type: "talk_npcs", count: 2 }, { type: "ride_kind", kind: "balloon", count: 1 }],
    reward: 10,
    action: "spy",
  },
  {
    key: "apprentice_hunter",
    title: "Apprentice hunter",
    role: "Today you are learning the hunt.",
    brief: "Search 3 spots and send your drone once. Your teacher will give you a hint.",
    icon: "search",
    fits: "hunter",
    steps: [{ type: "search_tiles", count: 3 }, { type: "sweep", count: 1 }],
    reward: 10,
    action: "hint",
  },
  {
    key: "bounty_hunter",
    title: "Bounty hunter",
    role: "Today you are a bounty hunter.",
    brief: "Search 5 spots. Keep at it and your next search is on the house.",
    icon: "search",
    fits: "hunter",
    steps: [{ type: "search_tiles", count: 5 }],
    reward: 10,
    action: "free_search",
  },
  {
    key: "drone_pilot",
    title: "Drone pilot",
    role: "Today you fly the drones.",
    brief: "Send your drone out twice. Then enjoy a free search.",
    icon: "drone",
    fits: "hunter",
    steps: [{ type: "sweep", count: 2 }],
    reward: 15,
    action: "free_search",
  },

  // ------------------------------------------------------------------ ghosts
  {
    key: "decoy_master",
    title: "Decoy master",
    role: "Today you are the decoy master.",
    brief: "Pop into 3 places to confuse everyone, and stay hidden for 3 minutes. You'll earn an extra move.",
    icon: "ghost",
    fits: "ghost",
    steps: [{ type: "visit_rooms", count: 3 }, { type: "survive_minutes", minutes: 3 }],
    reward: 10,
    action: "free_move",
  },
  {
    key: "escape_artist",
    title: "Escape artist",
    role: "Today you are an escape artist.",
    brief: "Stay hidden for 8 minutes without being caught. Then you get one extra move.",
    icon: "ghost",
    fits: "ghost",
    steps: [{ type: "survive_minutes", minutes: 8 }],
    reward: 15,
    action: "free_move",
  },
  {
    key: "ghost_whisperer",
    title: "Ghost whisperer",
    role: "Today you whisper with ghosts.",
    brief: "Stay hidden for 5 minutes and say hi to a regular. You'll learn where the hunters are looking.",
    icon: "ghost",
    fits: "ghost",
    steps: [{ type: "survive_minutes", minutes: 5 }, { type: "talk_npcs", count: 1 }],
    reward: 15,
    action: "hint",
  },
  {
    key: "shadow",
    title: "Shadow",
    role: "Today you are a shadow.",
    brief: "Sit still in a quiet corner for 45 seconds and stay hidden for 4 minutes. Then you can follow a hunter's searches.",
    icon: "spy",
    fits: "ghost",
    steps: [{ type: "sit_seconds", seconds: 45 }, { type: "survive_minutes", minutes: 4 }],
    reward: 10,
    action: "spy",
  },

  // ------------------------------------------------------------------ couriers and givers
  {
    key: "courier",
    title: "Courier",
    role: "Today you are a courier.",
    brief: "Deliver a parcel of ₥50 to any player (tap someone, then Give mint).",
    icon: "courier",
    fits: "any",
    steps: [{ type: "gift", coins: 50 }],
    reward: 30,
  },
  {
    key: "philanthropist",
    title: "Philanthropist",
    role: "Today you are a philanthropist.",
    brief: "Share the love: give ₥100 in total to at least 2 different players.",
    icon: "gift",
    fits: "any",
    steps: [{ type: "gift", coins: 100 }, { type: "gift_people", count: 2 }],
    reward: 50,
  },
  {
    key: "good_samaritan",
    title: "Good Samaritan",
    role: "Today you are a Good Samaritan.",
    brief: "Give ₥20 to someone who could use it.",
    icon: "gift",
    fits: "any",
    steps: [{ type: "gift", coins: 20 }],
    reward: 20,
  },
  {
    key: "messenger",
    title: "Messenger",
    role: "Today you carry messages.",
    brief: "Run between 2 different buildings and pass a word to a regular in each.",
    icon: "message",
    fits: "any",
    steps: [{ type: "visit_buildings", count: 2 }, { type: "talk_npcs", count: 2 }],
    reward: 25,
  },

  // ------------------------------------------------------------------ party people
  {
    key: "party_starter",
    title: "Party starter",
    role: "Today you start the party.",
    brief: "Hit a club dance floor, do a dance-off and spray ₥100 on the dancers.",
    icon: "party",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "dance" }, { type: "spray", coins: 100 }],
    reward: 40,
  },
  {
    key: "big_spender",
    title: "Big spender",
    role: "Today you are the big spender.",
    brief: "Make it rain: spray ₥300 on a dance floor.",
    icon: "coins",
    fits: "any",
    steps: [{ type: "spray", coins: 300 }],
    reward: 60,
  },
  {
    key: "dance_machine",
    title: "Dance machine",
    role: "Today you are a dance machine.",
    brief: "Score 600 or more in a dance-off.",
    icon: "dance",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "dance", minScore: 600 }],
    reward: 30,
  },
  {
    key: "dj",
    title: "DJ for a day",
    role: "Today you are the DJ.",
    brief: "Pick 2 tunes on a jukebox or DJ deck and keep the room moving.",
    icon: "music",
    fits: "any",
    steps: [{ type: "play_game", count: 2, game: "jukebox" }],
    reward: 15,
  },
  {
    key: "karaoke_star",
    title: "Karaoke star",
    role: "Today you are a karaoke star.",
    brief: "Grab the mic and get the hype meter to 60 or more.",
    icon: "mic",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "karaoke", minScore: 60 }],
    reward: 25,
  },
  {
    key: "pianist",
    title: "Pianist",
    role: "Today you are the house pianist.",
    brief: "Play the piano, then sing one karaoke song.",
    icon: "music",
    fits: "any",
    steps: [
      { type: "play_game", count: 1, game: "piano" },
      { type: "play_game", count: 1, game: "karaoke" },
    ],
    reward: 20,
  },

  // ------------------------------------------------------------------ games and sport
  {
    key: "sharpshooter",
    title: "Sharpshooter",
    role: "Today you are a sharpshooter.",
    brief: "Score 40 or more at archery. Mind the wind!",
    icon: "target",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "archery", minScore: 40 }],
    reward: 25,
  },
  {
    key: "darts_pro",
    title: "Darts pro",
    role: "Today you are a darts pro.",
    brief: "Score 150 or more in one game of darts.",
    icon: "target",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "darts", minScore: 150 }],
    reward: 25,
  },
  {
    key: "arcade_ace",
    title: "Arcade ace",
    role: "Today you are an arcade ace.",
    brief: "Hit 25 or more targets in the arcade reflex game.",
    icon: "game",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "reflex", minScore: 25 }],
    reward: 20,
  },
  {
    key: "pool_shark",
    title: "Pool shark",
    role: "Today you are a pool shark.",
    brief: "Pot 3 or more balls in one game of trick-shot pool.",
    icon: "game",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "pool", minScore: 3 }],
    reward: 25,
  },
  {
    key: "quiz_master",
    title: "Quiz master",
    role: "Today you are the quiz master.",
    brief: "Get 5 or more right in a room trivia quiz.",
    icon: "brain",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "trivia", minScore: 5 }],
    reward: 30,
  },
  {
    key: "champion",
    title: "Champion",
    role: "Today you are the champion.",
    brief: "Win 2 duels against other players (Rock-Paper-Scissors or dice).",
    icon: "trophy",
    fits: "any",
    steps: [{ type: "win_duel", count: 2 }],
    reward: 40,
  },
  {
    key: "high_roller",
    title: "High roller",
    role: "Today you are a high roller.",
    brief: "Roll the dice 3 times (duel someone or practise).",
    icon: "dice",
    fits: "any",
    steps: [{ type: "play_game", count: 3, game: "dice" }],
    reward: 15,
  },
  {
    key: "hustler",
    title: "Hustler",
    role: "Today you are a hustler.",
    brief: "Play any 3 mini games inside buildings.",
    icon: "game",
    fits: "any",
    steps: [{ type: "play_game", count: 3 }],
    reward: 20,
  },
  {
    key: "stair_sprinter",
    title: "Stair sprinter",
    role: "Today you are training for the stair race.",
    brief: "Do a stair sprint with 50 steps or more.",
    icon: "building",
    fits: "any",
    steps: [{ type: "play_game", count: 1, game: "stairs", minScore: 50 }],
    reward: 15,
  },

  // ------------------------------------------------------------------ food and drink
  {
    key: "food_critic",
    title: "Food critic",
    role: "Today you are a food critic.",
    brief: "Order something at 3 different restaurants and judge every bite.",
    icon: "food",
    fits: "any",
    steps: [{ type: "order_food", count: 3, where: "restaurant" }],
    reward: 25,
  },
  {
    key: "mixologist",
    title: "Mixologist",
    role: "Today you are a mixologist.",
    brief: "Try mocktails at 2 different bars.",
    icon: "drink",
    fits: "any",
    steps: [{ type: "order_food", count: 2, where: "bar" }],
    reward: 15,
  },
  {
    key: "street_food_tour",
    title: "Street food tour",
    role: "Today you are on a food tour.",
    brief: "Take a car ride, then order at 2 different places.",
    icon: "food",
    fits: "any",
    steps: [{ type: "ride_kind", kind: "car", count: 1 }, { type: "order_food", count: 2 }],
    reward: 25,
  },

  // ------------------------------------------------------------------ explorers
  {
    key: "tourist",
    title: "Tourist",
    role: "Today you are a tourist.",
    brief: "See the sights: ride a hot-air balloon and a boat.",
    icon: "tourist",
    fits: "any",
    steps: [{ type: "ride_kind", kind: "balloon", count: 1 }, { type: "ride_kind", kind: "boat", count: 1 }],
    reward: 30,
  },
  {
    key: "photographer",
    title: "Photographer",
    role: "Today you are a photographer.",
    brief: "Visit 3 rooftops for the best shots of the city.",
    icon: "camera",
    fits: "any",
    steps: [{ type: "visit_kind", kind: "roof", count: 3 }],
    reward: 25,
  },
  {
    key: "night_owl",
    title: "Night owl",
    role: "Today you are a night owl.",
    brief: "Spend 2 quiet minutes on a rooftop, watching the city lights.",
    icon: "night",
    fits: "any",
    steps: [{ type: "stay_seconds", kind: "roof", seconds: 120 }],
    reward: 20,
  },
  {
    key: "globetrotter",
    title: "Globetrotter",
    role: "Today you are a globetrotter.",
    brief: "Step inside 4 different buildings.",
    icon: "building",
    fits: "any",
    steps: [{ type: "visit_buildings", count: 4 }],
    reward: 30,
  },
  {
    key: "lift_rider",
    title: "Lift rider",
    role: "Today you ride the lifts.",
    brief: "Visit 3 different upstairs floors.",
    icon: "building",
    fits: "any",
    steps: [{ type: "visit_kind", kind: "floor", count: 3 }],
    reward: 20,
  },
  {
    key: "high_flyer",
    title: "High flyer",
    role: "Today you are a high flyer.",
    brief: "Ride a balloon and stand on a rooftop.",
    icon: "balloon",
    fits: "any",
    steps: [{ type: "ride_kind", kind: "balloon", count: 1 }, { type: "visit_kind", kind: "roof", count: 1 }],
    reward: 25,
  },
  {
    key: "commuter",
    title: "Commuter",
    role: "Today you are a commuter.",
    brief: "Ride a train and a car across the city.",
    icon: "train",
    fits: "any",
    steps: [{ type: "ride_kind", kind: "train", count: 1 }, { type: "ride_kind", kind: "car", count: 1 }],
    reward: 25,
  },
  {
    key: "sailor",
    title: "Sailor",
    role: "Today you are a sailor.",
    brief: "Take 2 boat rides.",
    icon: "boat",
    fits: "any",
    steps: [{ type: "ride_kind", kind: "boat", count: 2 }],
    reward: 25,
  },
  {
    key: "treasure_hunter",
    title: "Treasure hunter",
    role: "Today you hunt treasure.",
    brief: "Grab a reward from a city event or a mint balloon before anyone else.",
    icon: "treasure",
    fits: "any",
    steps: [{ type: "claim_event", count: 1 }],
    reward: 40,
  },

  // ------------------------------------------------------------------ social butterflies
  {
    key: "socialite",
    title: "Socialite",
    role: "Today you are a socialite.",
    brief: "Visit 2 places and chat with 4 different regulars.",
    icon: "chat",
    fits: "any",
    steps: [{ type: "visit_rooms", count: 2 }, { type: "talk_npcs", count: 4 }],
    reward: 25,
  },
  {
    key: "regular",
    title: "The regular",
    role: "Today you are a regular.",
    brief: "Sit down for 90 seconds in total. Everyone knows your face by now.",
    icon: "seat",
    fits: "any",
    steps: [{ type: "sit_seconds", seconds: 90 }],
    reward: 20,
  },
  {
    key: "town_crier",
    title: "Town crier",
    role: "Today you are the town crier.",
    brief: "Spread the news: visit 3 places and talk to 3 regulars.",
    icon: "message",
    fits: "any",
    steps: [{ type: "visit_rooms", count: 3 }, { type: "talk_npcs", count: 3 }],
    reward: 30,
  },
  // ------------------------------------------------------------------ hugs and handshakes (game-db/028_hugs_gifts.sql)
  {
    key: "town_hugger",
    title: "Town hugger",
    role: "Today you are the town hugger.",
    brief: "Give 3 different players a hug (tap someone, then Hug).",
    icon: "hug",
    fits: "any",
    steps: [{ type: "greet", kind: "hug", count: 3 }],
    reward: 15,
  },
  {
    key: "diplomat",
    title: "Diplomat",
    role: "Today you are a diplomat.",
    brief: "Shake hands with 2 different players and say hi to a regular.",
    icon: "hug",
    fits: "any",
    steps: [{ type: "greet", kind: "handshake", count: 2 }, { type: "talk_npcs", count: 1 }],
    reward: 20,
  },
];

export const QUEST_BY_KEY: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.key, q]));

/** Steps the server checks by itself (from coins moved, searches, drone sweeps, event rewards). */
export const SERVER_STEPS: QuestStepType[] = ["spray", "gift", "gift_people", "search_tiles", "sweep", "claim_event", "greet"];
/** Steps measured in seconds (sit, stay, survive). */
export const TIMED_STEPS: QuestStepType[] = ["sit_seconds", "stay_seconds", "survive_minutes"];

/** The number a step has to reach (seconds for timed steps, coins for spray/gift, a count otherwise). */
export function stepTarget(step: QuestStep): number {
  switch (step.type) {
    case "sit_seconds":
    case "stay_seconds":
      return step.seconds;
    case "survive_minutes":
      return step.minutes * 60;
    case "spray":
    case "gift":
      return step.coins;
    default:
      return step.count;
  }
}

const PLACE_WORD: Record<QuestPlace, [string, string]> = {
  lobby: ["lobby", "lobbies"],
  floor: ["upstairs floor", "upstairs floors"],
  roof: ["rooftop", "rooftops"],
  balloon: ["balloon", "balloons"],
  vehicle: ["ride", "rides"],
};
const RIDE_WORD: Record<RideKind, [string, string]> = {
  balloon: ["balloon ride", "balloon rides"],
  boat: ["boat ride", "boat rides"],
  train: ["train ride", "train rides"],
  car: ["car ride", "car rides"],
  any: ["ride", "rides"],
};
const GAME_WORD: Record<QuestGame, string> = {
  archery: "archery",
  darts: "darts",
  reflex: "the arcade",
  pool: "pool",
  rps: "Rock-Paper-Scissors",
  dice: "dice",
  cards: "Higher or Lower",
  trivia: "trivia",
  dance: "a dance-off",
  karaoke: "karaoke",
  jukebox: "the jukebox",
  piano: "the piano",
  slots: "the free slots",
  stairs: "the stair sprint",
  photo: "the photo spot",
};
const plural = (n: number, w: [string, string]) => `${n} ${n === 1 ? w[0] : w[1]}`;
const secs = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} minute${s === 60 ? "" : "s"}` : `${s} seconds`);

/** A step in plain words, e.g. "Visit 2 rooftops" or "Sit down for 30 seconds". */
export function stepLabel(step: QuestStep): string {
  switch (step.type) {
    case "visit_kind":
      return `Visit ${plural(step.count, PLACE_WORD[step.kind])}`;
    case "visit_rooms":
      return `Go into ${step.count} different place${step.count === 1 ? "" : "s"}`;
    case "visit_buildings":
      return `Step inside ${step.count} different building${step.count === 1 ? "" : "s"}`;
    case "sit_seconds":
      return `Sit down${step.kind ? ` in a ${PLACE_WORD[step.kind][0]}` : ""} for ${secs(step.seconds)}`;
    case "stay_seconds":
      return `Spend ${secs(step.seconds)} on a ${PLACE_WORD[step.kind][0]}`;
    case "talk_npcs":
      return `Say hi to ${step.count} regular${step.count === 1 ? "" : "s"}`;
    case "ride_kind":
      return `Take ${step.count === 1 ? `a ${RIDE_WORD[step.kind][0]}` : plural(step.count, RIDE_WORD[step.kind])}`;
    case "play_game": {
      const what = step.game ? GAME_WORD[step.game] : "mini games";
      if (step.minScore) return `Score ${step.minScore}+ in ${what}`;
      return step.game ? `Play ${what}${step.count > 1 ? ` ${step.count} times` : ""}` : `Play ${step.count} mini game${step.count === 1 ? "" : "s"}`;
    }
    case "win_duel":
      return `Win ${step.count === 1 ? "a duel" : `${step.count} duels`}${step.game ? ` at ${GAME_WORD[step.game]}` : ""}`;
    case "order_food":
      return `Order at ${step.count} different ${step.where === "bar" ? "bars" : step.where === "restaurant" ? "restaurants" : "places"}`;
    case "spray":
      return `Spray ₥${step.coins} on a dance floor`;
    case "gift":
      return `Give ₥${step.coins} away`;
    case "gift_people":
      return `Give mint to ${step.count} different players`;
    case "search_tiles":
      return `Search ${step.count} spots`;
    case "sweep":
      return `Send your drone ${step.count === 1 ? "once" : `${step.count} times`}`;
    case "survive_minutes":
      return `Stay hidden for ${step.minutes} minute${step.minutes === 1 ? "" : "s"}`;
    case "claim_event":
      return "Grab a city event or mint balloon reward";
    case "greet": {
      const who = `${step.count} different player${step.count === 1 ? "" : "s"}`;
      return step.kind === "hug" ? `Hug ${who}` : step.kind === "handshake" ? `Shake hands with ${who}` : `Hug or shake hands with ${who}`;
    }
  }
}

/** "12/30 s", "1/2", "40/100 coins" for how far a step is. */
export function stepProgressText(step: QuestStep, value: number) {
  const target = stepTarget(step);
  const v = Math.min(Math.floor(value), target);
  if (step.type === "survive_minutes") return `${Math.floor(v / 60)}/${step.minutes} min`;
  if (step.type === "sit_seconds" || step.type === "stay_seconds") return `${v}/${target} s`;
  if (step.type === "spray" || step.type === "gift") return `₥${v}/${target}`;
  return `${v}/${target}`;
}

/** What the special move does, in plain words. */
export const ACTION_INFO: Record<SpecialAction, { label: string; button: string; about: string }> = {
  steal: {
    label: "Steal",
    button: "Steal from…",
    about: "Pick a player and take 1–5% of their mint (at most 100). They'll know it was you, and thieves can't touch them for 24 hours.",
  },
  hint: {
    label: "Hint",
    button: "Get my hint",
    about: "Hunters learn roughly where a ghost is hiding. Ghosts learn where the hunters have been looking.",
  },
  spy: {
    label: "Spy",
    button: "Follow a hunter",
    about: "See the last few spots one hunter searched in this hunt.",
  },
  free_search: {
    label: "Free search",
    button: "Claim free search",
    about: "Your next search costs nothing.",
  },
  free_move: {
    label: "Extra move",
    button: "Claim extra move",
    about: "Ghosts get one extra move in this hunt.",
  },
};

/** Which quests each kind of regular likes to hand out (by their job, see src/lib/npcs.ts). */
export const NPC_QUEST_KEYS: Record<string, string[]> = {
  Receptionist: ["spy", "detective", "messenger", "globetrotter"],
  "Security guard": ["detective", "lookout", "private_eye", "thief"],
  Courier: ["courier", "messenger", "commuter"],
  "Café owner": ["food_critic", "street_food_tour", "regular"],
  Cleaner: ["thief", "pickpocket", "treasure_hunter"],
  Visitor: ["tourist", "globetrotter", "socialite", "diplomat"],
  "Office worker": ["private_eye", "lift_rider", "hustler"],
  Accountant: ["philanthropist", "good_samaritan", "big_spender"],
  Designer: ["photographer", "night_owl", "high_flyer"],
  Intern: ["courier", "hustler", "stair_sprinter"],
  Manager: ["heist_planner", "champion", "quiz_master"],
  Tenant: ["socialite", "town_crier", "regular", "town_hugger"],
  Chef: ["food_critic", "street_food_tour", "mixologist"],
  Photographer: ["photographer", "high_flyer", "night_owl"],
  Gardener: ["night_owl", "cat_burglar", "lookout"],
  Stargazer: ["night_owl", "lookout", "high_flyer"],
  DJ: ["dj", "party_starter", "dance_machine", "karaoke_star"],
  "Pigeon keeper": ["cat_burglar", "messenger", "lookout"],
  "Balloon captain": ["tourist", "high_flyer", "informant"],
  Tourist: ["tourist", "photographer", "sailor"],
  Honeymooner: ["good_samaritan", "pianist", "karaoke_star"],
  Birdwatcher: ["lookout", "spy", "photographer"],
  Jogger: ["stair_sprinter", "globetrotter", "commuter"],
  "Street vendor": ["food_critic", "trickster", "high_roller"],
  "Dog walker": ["messenger", "detective", "socialite"],
  Painter: ["photographer", "night_owl", "pianist"],
};

/** What kind of place a room id is ("b:12:r" → roof, "balloon:3" → balloon, "v:boat:2" → vehicle). */
export function placeKindOf(roomId: string | null | undefined): QuestPlace | null {
  if (!roomId) return null;
  if (roomId.startsWith("balloon:")) return "balloon";
  if (roomId.startsWith("v:")) return "vehicle";
  if (/^b:\d+:r$/.test(roomId)) return "roof";
  if (/^b:\d+:f\d+$/.test(roomId)) return "floor";
  if (/^b:\d+(:g)?$/.test(roomId)) return "lobby";
  return null;
}

/** The ride a room id is ("balloon:3" → balloon, "v:taxi:2" → car), or null for buildings. */
export function rideKindOf(roomId: string | null | undefined, kind?: string | null): Exclude<RideKind, "any"> | null {
  const raw = (kind ?? (roomId?.startsWith("balloon:") ? "balloon" : /^v:([a-z_-]+):/.exec(roomId ?? "")?.[1]) ?? "").toLowerCase();
  if (!raw) return null;
  if (raw.includes("balloon")) return "balloon";
  if (/(boat|ferry|ship|yacht|canoe|kayak)/.test(raw)) return "boat";
  if (/(train|tram|metro|rail)/.test(raw)) return "train";
  if (/(car|taxi|bus|van|truck|lorry|keke|danfo|okada|bike)/.test(raw)) return "car";
  return null;
}

/** A player's quest as the server reports it (see quest_state in game-db/019_activities.sql). */
export type QuestState = {
  id: number;
  key: string;
  title: string;
  role: string;
  brief: string;
  status: "active" | "done" | "expired" | "dropped";
  /** One number per step (seconds for timed steps, coins for spray/gift, a count otherwise). */
  progress: number[];
  /** What each step has to reach. */
  targets: number[];
  startedAt: string;
  expiresAt: string;
  completedAt: string | null;
  /** Coins for finishing, and coins actually paid. */
  reward: number;
  paid: number;
  action: SpecialAction | null;
  /** Until when the special move can be used. */
  actionUntil: string | null;
  actionUsed: boolean;
  actionResult: QuestActionResult | null;
  roundId: number | null;
};

/** What using a special move gave you. */
export type QuestActionResult =
  | { kind: "steal"; target: string; amount: number }
  /** A ghost is hiding within `radius` tiles of `tile` (or: hunters searched around there). */
  | { kind: "ghost_near" | "hunters_near"; tile: number; radius: number; roundId: number }
  /** The last spots one hunter searched, newest first. */
  | { kind: "spy"; name: string; tiles: number[]; roundId: number }
  | { kind: "free_search" }
  | { kind: "free_move" };

/** Is every step of this quest done? */
export function questDone(q: Pick<QuestState, "progress" | "targets">) {
  return q.targets.every((t, i) => (q.progress[i] ?? 0) >= t);
}
