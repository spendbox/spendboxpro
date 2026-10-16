// Moments (docs/MOMENTS.md): little stories that happen to you as you go about the city. A woman
// by the road asks for money, a wallet lies on the pavement, the waiter spills a drink on you. Each
// has two or three choices; what you choose can cost or bring money and reputation, and some come
// back days later (the woman you helped returns with her grandson). The game picks them by where
// you are, the time of day and who you are, and fills in names, amounts and places, so they rarely
// repeat. Pure data and rules, shared by the phone (to show them) and the server (which picks and
// settles them, so nobody can choose their own luck).

import type { Commute } from "./work.ts";
import { BIG_MOMENTS } from "./big-moments.ts";
import { CAST_BY_ID, CAST_GAP_HOURS, castHere } from "./cast.ts";
import { CAST_MOMENTS } from "./cast-moments.ts";
import { MORE_ANSWERS } from "./more-answers.ts";
import { ROAD_MOMENTS, type RoadStage } from "./road-moments.ts";
import { LOCAL_MOMENTS } from "./local-moments.ts";
import { PLAYER_MOMENTS } from "./player-moments.ts";
import { SEASON_MOMENTS } from "./season-moments.ts";
import { TEMPLATE_MOMENTS } from "./template-moments.ts";
import { TEMPLATE_MOMENTS_2 } from "./template-moments-2.ts";
import { THING_ANSWERS } from "./thing-answers.ts";
import { THING_MOMENTS } from "./thing-moments.ts";
import { VENTURE_MOMENTS } from "./venture-moments.ts";
import type { VentureChange } from "./ventures.ts";

/** Where a moment can happen. */
export type MomentSpot = "street" | "home" | "food" | "night" | "sport" | "shop" | "worship" | "outdoors" | "work" | "road";

export type MomentOutcome = {
  /** How likely, against the choice's other outcomes (default 1). */
  chance?: number;
  /** What happens ({name}, {ask}, {place} filled in). */
  text: string;
  /** Pay this many times the moment's amount (from Fun money, then the wallet). */
  pay?: number;
  /** Get this many times the moment's amount. */
  get?: number;
  /** Reputation, up or down. */
  rep?: number;
  /** A moment that follows, some hours later. */
  follow?: string;
  /** Something that stays on you for a while (see EFFECTS). */
  effect?: EffectId;
  /** Likelier (about 2.5 times) for people who are this way, or while this is on them. */
  likelier?: Likely[];
  /** In a character's story (./cast-moments.ts): how much more (or less) they like you, from −3 to 3. */
  bond?: number;
  /** In a character's story: the step that comes next (default the one after; −1: the story ends). */
  next?: number;
  /** In a character's story: this adds to how much the whole city has helped or hurt them. */
  world?: "good" | "bad";
  /** Nobody saw it: it shapes who you are, but your reputation doesn't move (`rep` is what it would have been). */
  unseen?: boolean;
  /** How much it moves Trust (default: half of how honest the answer was; ./standing.ts). */
  trust?: number;
  /** What it does to your business (./ventures.ts). */
  biz?: VentureChange;
  /** Opens a screen after: choosing a business to start. */
  opens?: "career";
  /** With another player (./player-moments.ts): the moment it sends them next, how many hours later, and its amount (times this one's; default the same). */
  link?: { send: string; hours: number; ask?: number };
  /** With another player: real money you give them, this many times the amount (within the gift limits). */
  give?: number;
  /** With another player: how much more (or less) you like them, from −3 to 3. */
  feel?: number;
  /** With another player: you stood by them (it counts towards Ride or Die). */
  stood?: boolean;
};
/** When an outcome is likelier: a side of who you are (strongly enough), or an effect on you. */
export type Likely = { trait: Trait; side: 1 | -1 } | { effect: EffectId } | { venture: "quality" } | { tag: string };
export type MomentChoice = {
  label: string;
  /**
   * What kind of answer it is: kind, bold, mean or calm. Never shown (every button looks the
   * same, docs/LIFE_WHEEL.md); it sets the character nudges when `traits` isn't given.
   */
  tone?: "kind" | "bold" | "mean" | "calm";
  /** How this answer nudges who you are (see TRAITS), when the tone's guess isn't right. */
  traits?: TraitNudge;
  /**
   * Only for people who own one of these (a thing's kind, "gold_chain", or a whole category,
   * "cat:car"): what you have gives you more ways to answer (lend your generator, give a lift).
   */
  has?: string[];
  outcomes: MomentOutcome[];
};
export type MomentDef = {
  id: string;
  /** Where it can happen ("any": anywhere). */
  spots: MomentSpot[] | "any";
  /** Only by day (6am to 7pm Lagos time) or only at night. */
  time?: "day" | "night";
  /** Only for players at least this level (people know them). */
  minLevel?: number;
  /** Only as the follow-up of another moment. */
  followOnly?: boolean;
  /** On the road (docs/TRIPS.md): the rides it can happen on, and the scene the trip film plays. */
  rides?: Commute[];
  stage?: RoadStage;
  /** How often, against the others (default 1). */
  weight?: number;
  /** How big it is in your life (default small): big ones come about twice a week at most. */
  size?: MomentSize;
  /** How rare (default common): rare about monthly, legendary about yearly. */
  rarity?: MomentRarity;
  /** The part of life it touches, for the wheel (default: from where it happens, see areaOf). */
  area?: LifeArea;
  /** A step in a character's story with you (./cast.ts, ./cast-moments.ts). */
  cast?: string;
  step?: number;
  /** Only if they feel this way about you (from −5 to 5, both ends included). */
  feel?: [number, number];
  /** Only once the whole city has helped (`good`) or hurt (`bad`) them at least this much, or while less than (`goodBelow`, `badBelow`). */
  world?: { good?: number; bad?: number; goodBelow?: number; badBelow?: number };
  /** Only for people with this badge (./standing.ts): what you're known for brings its own moments. */
  badge?: string;
  /**
   * A business moment (./venture-moments.ts): only while you run one (or, `none`, while you don't),
   * at these stages, in a crisis (`crisis`) or when it's ready to grow (`grow`).
   */
  venture?: { none?: boolean; stages?: [number, number]; crisis?: boolean; grow?: boolean };
  /** With a real player as {name} (./player-moments.ts); `start`: it begins a thread, picked only when there's someone to be in it. */
  player?: { start?: boolean };
  /**
   * Built from parts (./template-moments.ts): for each {slot} in its text, labels and outcomes, one
   * of these is picked (by the seed), so one moment reads hundreds of ways. A part can make the
   * amount bigger or smaller (`ask`) and carry a `tag` that outcomes can be likelier with.
   */
  parts?: Record<string, MomentPart[]>;
  /** Only in these seasons or on these days (./calendar.ts), when it's three times as likely. */
  season?: string[];
  /** Only in these areas of the city (by name, as the map calls them). */
  areas?: string[];
  /** Only for people like this (rich, famous, stingy, with a car, new in town). */
  fits?: Fit[];
  /** Written by a player (./written.ts): their name, shown on the card. */
  by?: string;
  /** Only for people who own one of these (kinds, or "cat:" and a category); {item} is the one they have (./thing-moments.ts). */
  item?: string[];
  /** The amount in it, in naira: somewhere between these (rounded the way people say prices). */
  ask?: [number, number];
  emoji: string;
  title: string;
  /** Ways of telling it (one is picked). */
  text: string[];
  choices: MomentChoice[];
};

export type MomentSize = "small" | "big" | "life";
/** One option for a slot in a moment built from parts. */
export type MomentPart = { text: string; ask?: number; tag?: string };
/** Kinds of people some moments are for. */
export type Fit = "rich" | "famous" | "stingy" | "car" | "newcomer";

/** The parts of life a moment can touch: the colours on the wheel (docs/LIFE_WHEEL.md). */
export const LIFE_AREAS = {
  money: { name: "Money", colour: "#2b9a48" },
  family: { name: "Family", colour: "#e8590c" },
  love: { name: "Love", colour: "#d6336c" },
  friends: { name: "Friends", colour: "#1c7ed6" },
  work: { name: "Work", colour: "#7048e8" },
  street: { name: "Street", colour: "#e8a200" },
  faith: { name: "Faith", colour: "#0c8599" },
  community: { name: "Community", colour: "#74a312" },
} as const;
export type LifeArea = keyof typeof LIFE_AREAS;

/**
 * Short effects (docs/LIFE_WHEEL.md): something that stays on you for a while after a moment and
 * wears off by itself. Some change how later moments turn out (good: outcomes that bring money or
 * reputation; bad: ones that cost and bring nothing, or lose face).
 */
export const EFFECTS = {
  blessed: { emoji: "🙏🏾", name: "Blessed", hours: 24, about: "Good things are a little likelier." },
  lucky: { emoji: "🍀", name: "Lucky streak", hours: 12, about: "Gambles go your way more often." },
  bad_day: { emoji: "🌧️", name: "Bad day", hours: 12, about: "Things go wrong a little more often." },
  talked_about: { emoji: "👀", name: "Talked about", hours: 12, about: "People have heard about you; some are wary." },
  hurt: { emoji: "🩹", name: "Hurt", hours: 24, about: "No sport for a day." },
  under_watch: { emoji: "🚓", name: "Under watch", hours: 48, about: "The police know your face." },
  owed_favour: { emoji: "🤝🏾", name: "Owed a favour", hours: 168, about: "Someone owes you one." },
  in_debt: { emoji: "📒", name: "In debt", hours: 168, about: "You owe someone, and they'll ask." },
} as const;
export type EffectId = keyof typeof EFFECTS;
export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];
export type MomentRarity = "common" | "uncommon" | "rare" | "legendary";

/**
 * Who you are (docs/LIFE_WHEEL.md): six pairs of opposites, each a slider. Plus is the first
 * word, minus the second; both ends are fine and both ends have badges.
 */
export const TRAITS = {
  giving: ["Generous", "Prudent"],
  daring: ["Bold", "Careful"],
  truth: ["Straight", "Street-smart"],
  people: ["Community", "Self-made"],
  wrongs: ["Forgiving", "Firm"],
  ways: ["Traditional", "Modern"],
} as const;
export type Trait = keyof typeof TRAITS;
export const TRAIT_KEYS = Object.keys(TRAITS) as Trait[];
/** A nudge to the sliders: a few points either way. */
export type TraitNudge = Partial<Record<Trait, number>>;

const SMALL: [number, number] = [500, 3_000];
const MEDIUM: [number, number] = [2_000, 15_000];
const BIG: [number, number] = [10_000, 50_000];

/** Names for the people in them. */
export const MOMENT_NAMES = [
  "Tunde", "Chiamaka", "Emeka", "Aisha", "Bola", "Ngozi", "Femi", "Kemi", "Musa", "Ifeoma", "Segun", "Halima", "Yemi", "Uche", "Zainab", "Dayo",
  "Funke", "Obinna", "Hauwa", "Tobi", "Amaka", "Sani", "Bisi", "Chidi", "Fatima", "Kunle", "Nneka", "Ibrahim", "Lola", "Ade", "Ronke", "Kelechi",
];

export const MOMENTS: MomentDef[] = [
  // ---------------------------------------------------------------- the street
  {
    id: "mama_roadside",
    spots: ["street"],
    ask: SMALL,
    emoji: "👵🏾",
    title: "Mama by the roadside",
    text: [
      "An old woman sits by the road with a tray of oranges nobody is buying. \"My child, help me with {ask} for transport home.\"",
      "\"God bless you, my son, my daughter.\" An old woman by the gutter holds out her hand. She asks for {ask}.",
    ],
    choices: [
      { label: "Give her {ask}", tone: "kind", outcomes: [{ text: "She holds your hand and prays for you, loud enough for the whole street to hear.", pay: 1, rep: 2 }, { chance: 0.35, text: "She blesses you and asks your name. \"I won't forget you.\"", pay: 1, rep: 2, follow: "mama_returns" }] },
      { label: "Buy all her oranges", tone: "bold", outcomes: [{ text: "You leave with a bag of oranges and she leaves early, smiling. People clap.", pay: 2, rep: 3, follow: "mama_returns" }] },
      { label: "Walk on", tone: "calm", outcomes: [{ text: "You keep walking. She calls out to the next person." }] },
    ],
  },
  {
    id: "lost_child",
    spots: ["street", "shop", "outdoors"],
    emoji: "🧒🏾",
    title: "A lost child",
    text: ["A little boy is crying near {place}. He can't find his mother.", "A small girl in a school uniform is standing alone, crying for her mummy."],
    choices: [
      { label: "Help find the parents", tone: "kind", outcomes: [{ text: "Twenty minutes later a very relieved mother hugs her child and then hugs you.", rep: 3 }, { chance: 0.4, text: "The father runs over and presses some money into your hand. \"You don't know what you've done for us.\"", rep: 3, get: 1 }] },
      { label: "Take them to the police post", tone: "calm", outcomes: [{ text: "The officers take over. You did the right thing.", rep: 1 }] },
      { label: "Not your business", tone: "mean", outcomes: [{ text: "A woman nearby gives you a long look as she goes to help.", rep: -2 }] },
    ],
    ask: SMALL,
  },
  {
    id: "dropped_wallet",
    spots: ["street", "shop", "food"],
    ask: MEDIUM,
    emoji: "👛",
    title: "A wallet on the ground",
    text: ["There's a wallet on the pavement. Inside: {ask} and an ID card for {name}.", "Someone just dropped a wallet. It's bulging: {ask} in cash, and a card that says {name}."],
    choices: [
      { label: "Find {name} and return it", tone: "kind", outcomes: [{ text: "{name} nearly cries. \"Nobody does this in Lagos!\" They tell everyone about you.", rep: 3 }, { chance: 0.5, text: "{name} insists you take something for your trouble.", rep: 3, get: 0.3 }] },
      { label: "Keep the cash", tone: "mean", outcomes: [{ text: "You pocket the money and drop the wallet in a gutter. Nobody saw.", get: 1, rep: -3, unseen: true, trust: -2 }, { chance: 0.3, text: "\"That's my wallet!\" {name} saw everything. The crowd is not kind to you.", rep: -6 }] },
      { label: "Leave it there", tone: "calm", outcomes: [{ text: "You leave it for someone else to deal with." }] },
    ],
  },
  {
    id: "danfo_change",
    spots: ["street"],
    ask: SMALL,
    emoji: "🚌",
    title: "\"Owa o!\"",
    text: ["The danfo conductor still owes you {ask} in change, and the bus is about to move.", "\"Wait, my change!\" The conductor pretends not to hear you. He owes you {ask}."],
    choices: [
      { label: "Shout for your change", tone: "bold", outcomes: [{ chance: 0.6, text: "The whole bus backs you up. He hands it over, grumbling.", get: 1 }, { chance: 0.4, text: "The bus zooms off with your change. Classic Lagos." }] },
      { label: "Chase the bus", tone: "bold", outcomes: [{ chance: 0.5, text: "You catch up at the next bus stop. Change collected, legs burning.", get: 1, rep: 1 }, { chance: 0.5, text: "You trip on the kerb and everyone at the bus stop laughs.", rep: -1 }] },
      { label: "Let it go", tone: "calm", outcomes: [{ text: "It's not worth your peace of mind. You let it go." }] },
    ],
  },
  {
    id: "area_boys",
    spots: ["street"],
    ask: SMALL,
    emoji: "🧢",
    title: "\"Owo ile!\"",
    text: ["Three area boys block your way. \"Oga, you no fit pass without settling us. {ask}.\"", "\"Boss, drop something for the boys.\" They want {ask} before you go on."],
    choices: [
      { label: "Settle them", tone: "calm", outcomes: [{ text: "\"Correct person!\" They wave you through, all smiles.", pay: 1 }] },
      { label: "Bargain them down", tone: "bold", outcomes: [{ chance: 0.5, text: "After some back and forth they take half. Everybody laughs.", pay: 0.5 }, { chance: 0.5, text: "They like your style and let you pass for free.", rep: 1 }] },
      { label: "Stand your ground", tone: "mean", outcomes: [{ chance: 0.45, text: "You stare them down. They step aside. Word gets round: you're not one to mess with.", rep: 2 }, { chance: 0.55, text: "It gets loud and a crowd gathers. In the end you pay double to end the drama.", pay: 2, rep: -1 }] },
    ],
  },
  {
    id: "rain_umbrella",
    spots: ["street", "outdoors"],
    ask: SMALL,
    emoji: "🌧️",
    title: "The sky opens",
    text: ["Out of nowhere, heavy rain. A boy appears with umbrellas: {ask} each.", "Lagos rain, the sudden kind. An umbrella seller grins at you: \"{ask} only!\""],
    choices: [
      { label: "Buy one", tone: "calm", outcomes: [{ text: "You stay dry while everyone else runs.", pay: 1 }] },
      { label: "Buy two, give one away", tone: "kind", outcomes: [{ text: "You hand the second one to a woman with a baby. She won't stop thanking you.", pay: 2, rep: 2 }] },
      { label: "Run for it", tone: "bold", outcomes: [{ text: "You're soaked through, but you're laughing." }] },
    ],
  },
  {
    id: "fan_selfie",
    spots: "any",
    minLevel: 5,
    emoji: "🤳🏾",
    title: "\"Are you not…?\"",
    text: ["{name} stops in front of you, eyes wide. \"It's you! I follow everything you do!\"", "A group of young people whisper and point. Then {name} comes over: \"Please, one picture!\""],
    choices: [
      { label: "Take a selfie", tone: "kind", outcomes: [{ text: "The picture goes round every group chat in Lagos by evening.", rep: 2 }] },
      { label: "Sign an autograph", tone: "bold", outcomes: [{ text: "{name} says they'll frame it.", rep: 1 }] },
      { label: "\"You've got the wrong person\"", tone: "calm", outcomes: [{ text: "{name} looks confused and walks off. You keep your sunglasses on." }] },
    ],
  },
  {
    id: "hawker_gala",
    spots: ["street"],
    ask: [300, 1_500],
    emoji: "🥤",
    title: "Gala and La Casera",
    text: ["A hawker runs beside you in the go-slow: \"Gala! La Casera! Pure water!\" {ask} for the lot.", "\"Buy gala, buy gala!\" A hawker taps on your window. {ask}."],
    choices: [
      { label: "Buy some", tone: "calm", outcomes: [{ text: "Gala and a cold drink in traffic. Perfect.", pay: 1 }] },
      { label: "Buy for everyone nearby", tone: "kind", outcomes: [{ text: "You buy his whole tray and share it out. The street loves you.", pay: 4, rep: 3 }] },
      { label: "Shake your head", tone: "calm", outcomes: [{ text: "He's already at the next car." }] },
    ],
  },
  {
    id: "go_slow",
    spots: ["street"],
    emoji: "🚗",
    title: "Go-slow",
    text: ["The traffic hasn't moved in twenty minutes. The driver next to you is blasting Burna Boy.", "Hold-up on the bridge. Nobody's going anywhere."],
    choices: [
      { label: "Turn your music up too", tone: "bold", outcomes: [{ text: "It becomes a little party in the traffic. Someone starts dancing on the road.", rep: 1 }] },
      { label: "Chat with the driver next door", tone: "kind", outcomes: [{ text: "You talk about football and bad roads. Time flies.", rep: 1 }, { chance: 0.4, text: "You swap numbers. They say they'll invite you for suya sometime.", rep: 1, follow: "new_friend" }] },
      { label: "Lean on the horn", tone: "mean", outcomes: [{ text: "Everyone glares at you. It doesn't make the traffic move.", rep: -1 }] },
    ],
  },
  {
    id: "pickpocket",
    spots: ["street", "shop"],
    ask: MEDIUM,
    emoji: "🫳🏾",
    title: "A hand in your pocket",
    text: ["In the crowd you feel a hand slide into your pocket.", "Someone bumps into you a little too closely. Your wallet feels lighter."],
    choices: [
      { label: "Grab the hand", tone: "bold", outcomes: [{ chance: 0.6, text: "You catch him in the act. The crowd cheers and he runs off empty-handed.", rep: 2 }, { chance: 0.4, text: "He twists free and disappears with {ask}.", pay: 1 }] },
      { label: "Shout \"Thief!\"", tone: "bold", outcomes: [{ chance: 0.7, text: "He panics and drops your money as he runs.", rep: 1 }, { chance: 0.3, text: "By the time anyone looks, he's gone, and so is {ask}.", pay: 1 }] },
      { label: "Stay calm and check", tone: "calm", outcomes: [{ chance: 0.5, text: "False alarm: your wallet was in the other pocket." }, { chance: 0.5, text: "Too late. {ask} gone.", pay: 1 }] },
    ],
  },
  {
    id: "stranded_student",
    spots: ["street", "outdoors"],
    ask: SMALL,
    emoji: "🎒",
    title: "Stranded student",
    text: ["{name}, a student at Unilag, lost their purse and needs {ask} for transport back to campus.", "A young student with a heavy bag asks politely: \"Please, I just need {ask} to get back to school.\""],
    choices: [
      { label: "Give {ask}", tone: "kind", outcomes: [{ text: "{name} promises to pay it forward one day.", pay: 1, rep: 2 }, { chance: 0.4, text: "{name} asks for your name. \"I'll remember this.\"", pay: 1, rep: 2, follow: "student_thanks" }] },
      { label: "Pay for a ride for them", tone: "kind", outcomes: [{ text: "You flag down a keke and pay the driver. Safe and sorted.", pay: 1.2, rep: 3 }] },
      { label: "\"Not today\"", tone: "calm", outcomes: [{ text: "They nod and move on to ask someone else." }] },
    ],
  },
  {
    id: "prophet_seed",
    spots: ["street", "worship"],
    ask: MEDIUM,
    emoji: "🔮",
    title: "A vision for you",
    text: ["A man in a white garment grabs your arm. \"I see great wealth coming to you! Sow a seed of {ask} today!\""],
    choices: [
      { label: "Sow the seed", tone: "bold", outcomes: [{ chance: 0.85, text: "He blesses you, takes the money and vanishes into the crowd." , pay: 1 }, { chance: 0.15, text: "Strange: later that day, an old debt is paid back to you, with extra.", pay: 1, get: 4 }] },
      { label: "Tell him to sow his own seed", tone: "mean", outcomes: [{ text: "The people around you burst out laughing. Even he smiles.", rep: 1 }] },
      { label: "Walk away", tone: "calm", outcomes: [{ text: "You pull your arm back and keep going." }] },
    ],
  },
  {
    id: "baba_ijebu",
    spots: ["street"],
    ask: [500, 2_000],
    emoji: "🎟️",
    title: "Today's numbers",
    text: ["A lottery kiosk calls out: \"Today na your day! Stake {ask}!\""],
    choices: [
      { label: "Stake {ask}", tone: "bold", outcomes: [{ chance: 0.82, text: "Not today. The numbers don't come.", pay: 1 }, { chance: 0.18, text: "Your numbers come in! The kiosk man can't believe it.", pay: 1, get: 6 }] },
      { label: "Walk past", tone: "calm", outcomes: [{ text: "You keep your money. Probably wise." }] },
    ],
  },
  {
    id: "money_on_ground",
    spots: ["street", "outdoors"],
    ask: [200, 1_000],
    emoji: "💵",
    title: "Money on the ground",
    text: ["There's a crumpled {ask} on the ground. Nobody seems to have noticed."],
    choices: [
      { label: "Pick it up", tone: "calm", outcomes: [{ text: "Lucky day.", get: 1 }] },
      { label: "Give it to the beggar nearby", tone: "kind", outcomes: [{ text: "You pick it up and hand it to a man by the bus stop. He thanks you twice.", rep: 2 }] },
      { label: "Leave it", tone: "calm", outcomes: [{ text: "Somebody else's luck, then." }] },
    ],
  },
  {
    id: "car_breakdown",
    spots: ["street"],
    ask: MEDIUM,
    emoji: "🛞",
    title: "Broken down",
    text: ["{name}'s car has broken down in the middle of the road. They need a push and {ask} for a mechanic."],
    choices: [
      { label: "Help push", tone: "kind", outcomes: [{ text: "Three of you push it to the side of the road. Sweaty but satisfying.", rep: 2 }] },
      { label: "Lend {ask} for the mechanic", tone: "kind", outcomes: [{ text: "{name} takes your number. \"I'll pay you back, I promise.\"", pay: 1, rep: 2, follow: "loan_back" }] },
      { label: "Drive around them", tone: "calm", outcomes: [{ text: "Somebody else will help." }] },
    ],
  },
  {
    id: "dance_battle",
    spots: ["street", "outdoors", "night"],
    emoji: "🕺🏾",
    title: "Dance-off!",
    text: ["A crowd is gathered round a speaker. Someone points at you: \"You! Come and dance!\""],
    choices: [
      { label: "Show them your moves", tone: "bold", outcomes: [{ chance: 0.6, text: "You kill it. People are filming. You're trending on the street WhatsApp.", rep: 3 }, { chance: 0.4, text: "Let's just say they laughed. Kindly. Mostly.", rep: -1 }] },
      { label: "Hype the dancers", tone: "kind", outcomes: [{ text: "You cheer louder than anyone. The dancers love you.", rep: 1 }] },
      { label: "Slip away", tone: "calm", outcomes: [{ text: "Not today." }] },
    ],
  },
  {
    id: "suya_night",
    spots: ["street", "outdoors"],
    time: "night",
    ask: [1_500, 6_000],
    emoji: "🍢",
    title: "Suya o'clock",
    text: ["The smell of suya fills the street. The mallam waves you over: \"Fresh one, {ask}.\""],
    choices: [
      { label: "Buy some", tone: "calm", outcomes: [{ text: "Hot, spicy, perfect. Worth every naira.", pay: 1 }] },
      { label: "Buy for everyone waiting", tone: "kind", outcomes: [{ text: "You pay for the whole queue. Instant friends.", pay: 3, rep: 3 }] },
      { label: "Not tonight", tone: "calm", outcomes: [{ text: "You walk on, but the smell follows you." }] },
    ],
  },
  {
    id: "street_photographer",
    spots: ["street", "outdoors"],
    ask: [1_000, 4_000],
    emoji: "📸",
    title: "Snap snap",
    text: ["A street photographer holds up his camera: \"Fine person like you! One portrait, {ask}.\""],
    choices: [
      { label: "Pose for it", tone: "bold", outcomes: [{ text: "It's a great picture. You look like a star.", pay: 1, rep: 1 }] },
      { label: "No thanks", tone: "calm", outcomes: [{ text: "He finds another customer straight away." }] },
    ],
  },
  {
    id: "fake_officer",
    spots: ["street"],
    ask: MEDIUM,
    emoji: "🦺",
    title: "\"Particulars!\"",
    text: ["A man in a reflective vest says you've broken a rule nobody's heard of. The fine, he says, is {ask}."],
    choices: [
      { label: "Pay to end it", tone: "calm", outcomes: [{ text: "He pockets it and waves you on. You'll never know if he was real.", pay: 1 }] },
      { label: "Ask for his ID", tone: "bold", outcomes: [{ chance: 0.6, text: "He suddenly remembers he's needed somewhere else.", rep: 1 }, { chance: 0.4, text: "He's real, and now he's annoyed. You pay one and a half times.", pay: 1.5 }] },
      { label: "Call a lawyer friend", tone: "bold", outcomes: [{ chance: 0.7, text: "Two minutes on the phone and he lets you go.", rep: 1 }, { chance: 0.3, text: "Your friend doesn't pick up. You pay.", pay: 1 }] },
    ],
  },
  {
    id: "keke_shortcut",
    spots: ["street"],
    ask: [500, 2_500],
    emoji: "🛺",
    title: "A shortcut",
    text: ["A keke driver leans out: \"I know shortcut, no traffic at all. {ask}.\""],
    choices: [
      { label: "Hop in", tone: "bold", outcomes: [{ chance: 0.7, text: "Through back streets and markets: you get there in record time.", pay: 1 }, { chance: 0.3, text: "The \"shortcut\" goes through a flooded road. You arrive late and muddy.", pay: 1 }] },
      { label: "No thanks", tone: "calm", outcomes: [{ text: "You stick to the main road." }] },
    ],
  },

  // ---------------------------------------------------------------- at home
  {
    id: "nepa",
    spots: ["home"],
    ask: [2_000, 8_000],
    emoji: "💡",
    title: "NEPA took light",
    text: ["Darkness. The whole street groans at once. It's going to be a while.", "Light is gone again. The fan slows down and stops."],
    choices: [
      { label: "Fire up the generator", tone: "bold", outcomes: [{ text: "Fuel isn't cheap, but you've got light, and the neighbours' kids come to charge their phones.", pay: 1, rep: 1 }] },
      { label: "Light candles and tell stories", tone: "kind", outcomes: [{ text: "Neighbours gather outside. It turns into a lovely evening.", rep: 1 }] },
      { label: "Go to bed early", tone: "calm", outcomes: [{ text: "When light comes back at 2am, the whole street shouts \"Up NEPA!\"" }] },
    ],
  },
  {
    id: "neighbour_sugar",
    spots: ["home"],
    emoji: "🍚",
    title: "A knock at the door",
    text: ["Your neighbour {name} is at the door with an empty cup. \"Please, do you have some sugar?\""],
    choices: [
      { label: "Give some", tone: "kind", outcomes: [{ text: "{name} brings back a plate of puff-puff later.", rep: 1 }] },
      { label: "Invite them in", tone: "kind", outcomes: [{ text: "Sugar becomes tea becomes two hours of gist.", rep: 2 }, { chance: 0.3, text: "You get on so well that {name} invites you to their family's party.", rep: 2, follow: "owambe" }] },
      { label: "Pretend you're not in", tone: "mean", outcomes: [{ text: "You hold your breath until they leave. They heard the TV.", rep: -1 }] },
    ],
  },
  {
    id: "uncle_emergency",
    spots: ["home", "work"],
    ask: MEDIUM,
    emoji: "📱",
    title: "Uncle on the phone",
    text: ["Uncle {name} calls from the village. \"Small emergency.\" He needs {ask}, urgently.", "A cousin you haven't heard from in a year calls. \"Things are hard. Can you send {ask}?\""],
    choices: [
      { label: "Send it", tone: "kind", outcomes: [{ text: "Family is family. The prayers on the phone are long and loud.", pay: 1, rep: 1 }, { chance: 0.3, text: "\"God bless you!\" You have a feeling you'll hear from him again.", pay: 1, rep: 1, follow: "uncle_again" }] },
      { label: "Send half", tone: "calm", outcomes: [{ text: "\"Thank you… I'll manage.\"", pay: 0.5 }] },
      { label: "\"Network is bad, I can't hear you\"", tone: "mean", outcomes: [{ text: "You hang up. Your phone rings again. And again." }] },
    ],
  },
  {
    id: "mystery_parcel",
    spots: ["home"],
    ask: MEDIUM,
    emoji: "📦",
    title: "A parcel for you?",
    text: ["A dispatch rider drops a parcel at your door and rides off before you can ask anything."],
    choices: [
      { label: "Open it", tone: "bold", outcomes: [{ chance: 0.5, text: "It's a gift from a friend, with cash inside and a note: \"For being you.\"", get: 1 }, { chance: 0.5, text: "It's for your neighbour {name}. Awkward. You tape it back up and hand it over.", rep: 1 }] },
      { label: "Take it next door", tone: "kind", outcomes: [{ text: "It was for {name} next door. They're very grateful.", rep: 1 }] },
    ],
  },
  {
    id: "football_window",
    spots: ["home"],
    ask: [3_000, 12_000],
    emoji: "⚽",
    title: "Crash!",
    text: ["A football smashes through your window. Outside, five kids are very suddenly very quiet."],
    choices: [
      { label: "Join their game", tone: "kind", outcomes: [{ text: "You play until it gets dark. You score the winner. The kids will talk about it for weeks.", rep: 2 }] },
      { label: "Ask the parents to pay", tone: "bold", outcomes: [{ chance: 0.6, text: "The parents apologise and pay for the glass.", get: 1 }, { chance: 0.4, text: "The parents argue it was already cracked. You end up paying for it yourself.", pay: 1, rep: -1 }] },
      { label: "Shout at them", tone: "mean", outcomes: [{ text: "They scatter. Their mothers are not impressed with you.", rep: -2 }] },
    ],
  },
  {
    id: "estate_dues",
    spots: ["home"],
    ask: [5_000, 20_000],
    emoji: "🏘️",
    title: "Estate meeting",
    text: ["The residents' association wants everyone to put {ask} towards street lights."],
    choices: [
      { label: "Pay your share", tone: "kind", outcomes: [{ text: "A month later, your street is the brightest in the area.", pay: 1, rep: 2 }] },
      { label: "Pay double", tone: "bold", outcomes: [{ text: "The chairman thanks you by name at the next meeting.", pay: 2, rep: 4 }] },
      { label: "Skip it", tone: "calm", outcomes: [{ text: "You don't go. People notice who wasn't there.", rep: -1 }] },
    ],
  },
  {
    id: "water_seller",
    spots: ["home"],
    ask: [1_000, 3_000],
    emoji: "💧",
    title: "Mai ruwa",
    text: ["The water seller pushes his cart up to your gate. \"Water! {ask} for the full tank.\""],
    choices: [
      { label: "Fill the tank", tone: "calm", outcomes: [{ text: "Full tank. Peace of mind.", pay: 1 }] },
      { label: "Fill it and give him a drink", tone: "kind", outcomes: [{ text: "He's been pushing that cart all morning. He's grateful.", pay: 1.2, rep: 1 }] },
      { label: "Not today", tone: "calm", outcomes: [{ text: "He moves on to the next house." }] },
    ],
  },

  // ---------------------------------------------------------------- restaurants and bars
  {
    id: "wrong_bill",
    spots: ["food"],
    ask: [2_000, 9_000],
    emoji: "🧾",
    title: "The bill is wrong",
    text: ["Your bill has two plates of asun you never ordered: {ask} extra.", "You check the bill. You've been charged {ask} for drinks you didn't have."],
    choices: [
      { label: "Point it out politely", tone: "kind", outcomes: [{ chance: 0.75, text: "The manager apologises, fixes it and sends a free dessert.", rep: 1 }, { chance: 0.25, text: "The manager insists it's right. You pay, annoyed.", pay: 1 }] },
      { label: "Make a scene", tone: "mean", outcomes: [{ text: "You get your money back, but the whole restaurant is staring.", rep: -2 }] },
      { label: "Just pay it", tone: "calm", outcomes: [{ text: "You don't have the energy today.", pay: 1 }] },
    ],
  },
  {
    id: "birthday_table",
    spots: ["food", "night"],
    ask: [3_000, 10_000],
    emoji: "🎂",
    title: "Happy birthday!",
    text: ["The next table is singing for {name}'s birthday. They're a few voices short."],
    choices: [
      { label: "Sing along", tone: "kind", outcomes: [{ text: "You sing loudest of all. {name} gives you a slice of cake.", rep: 2 }] },
      { label: "Send them a bottle", tone: "bold", outcomes: [{ text: "The whole table raises their glasses to you.", pay: 1, rep: 3 }] },
      { label: "Carry on eating", tone: "calm", outcomes: [{ text: "Your food's getting cold anyway." }] },
    ],
  },
  {
    id: "spilled_drink",
    spots: ["food", "night"],
    ask: [3_000, 12_000],
    emoji: "🥤",
    title: "Oops!",
    text: ["A waiter trips and a whole glass of Chapman lands on your clothes."],
    choices: [
      { label: "Laugh it off", tone: "kind", outcomes: [{ text: "The waiter is so relieved. The manager says your meal is free.", get: 1, rep: 2 }, { chance: 0.5, text: "Everyone laughs with you. You're the most relaxed person in the room.", rep: 2 }] },
      { label: "Ask them to pay for cleaning", tone: "bold", outcomes: [{ text: "The manager pays for the dry cleaning, a little stiffly.", get: 1, rep: -1 }] },
      { label: "Storm out", tone: "mean", outcomes: [{ text: "You leave sticky and angry.", rep: -1 }] },
    ],
  },
  {
    id: "chef_special",
    spots: ["food"],
    emoji: "👨🏾‍🍳",
    title: "Chef's special",
    text: ["The chef comes to your table: \"I'm trying something new. Will you taste it?\""],
    choices: [
      { label: "Taste it", tone: "bold", outcomes: [{ chance: 0.7, text: "It's incredible. The chef names it after you, at least for tonight.", rep: 1 }, { chance: 0.3, text: "It's the hottest pepper soup you've ever had. You cry. The chef laughs. Somehow you're friends now.", rep: 1 }] },
      { label: "No thanks", tone: "calm", outcomes: [{ text: "The chef shrugs and offers it to the next table." }] },
    ],
  },
  {
    id: "alone_diner",
    spots: ["food"],
    ask: [2_000, 6_000],
    emoji: "🍽️",
    title: "Table for one",
    text: ["{name} is eating alone at the next table, looking at their phone, a bit sad."],
    choices: [
      { label: "Ask to join them", tone: "kind", outcomes: [{ text: "Turns out you have loads in common. You talk for an hour.", rep: 2 }, { chance: 0.4, text: "You swap numbers. {name} says they'll call you.", rep: 2, follow: "new_friend" }] },
      { label: "Send them dessert", tone: "kind", outcomes: [{ text: "{name} looks over and smiles. That smile was worth it.", pay: 1, rep: 2 }] },
      { label: "Mind your business", tone: "calm", outcomes: [{ text: "You leave them to it." }] },
    ],
  },
  {
    id: "waiter_tip",
    spots: ["food"],
    ask: [500, 3_000],
    emoji: "🤵🏾",
    title: "Great service",
    text: ["Your waiter, {name}, has been brilliant all evening."],
    choices: [
      { label: "Leave a tip of {ask}", tone: "kind", outcomes: [{ text: "{name} will remember you next time. Best table in the house.", pay: 1, rep: 1 }] },
      { label: "Leave a big tip", tone: "bold", outcomes: [{ text: "{name} has to sit down. \"God bless you, sir! Madam!\"", pay: 3, rep: 2 }] },
      { label: "Just say thank you", tone: "calm", outcomes: [{ text: "A warm thank you. That counts too." }] },
    ],
  },

  // ---------------------------------------------------------------- clubs at night
  {
    id: "dj_shoutout",
    spots: ["night"],
    ask: [5_000, 25_000],
    emoji: "🎧",
    title: "The DJ calls your name",
    text: ["The music drops and the DJ shouts: \"Big man in the house! Big woman in the house! Spray us!\" Every eye turns to you."],
    choices: [
      { label: "Spray the DJ", tone: "bold", outcomes: [{ text: "Notes rain down. The club goes wild. You're the night's legend.", pay: 1, rep: 3 }] },
      { label: "Wave and dance", tone: "kind", outcomes: [{ text: "The crowd cheers anyway.", rep: 1 }] },
      { label: "Hide behind a pillar", tone: "calm", outcomes: [{ text: "The DJ moves on to someone else." }] },
    ],
  },
  {
    id: "vip_table",
    spots: ["night"],
    ask: BIG,
    emoji: "🍾",
    title: "VIP section",
    text: ["{name} waves you over to the VIP section. \"Join us! Let's split the bottle.\" Your share: {ask}."],
    choices: [
      { label: "Join and split", tone: "bold", outcomes: [{ text: "Sparklers, music, good company. You meet half of Lekki.", pay: 1, rep: 2 }] },
      { label: "Just say hi", tone: "kind", outcomes: [{ text: "You chat for a bit and go back to the dance floor.", rep: 1 }] },
      { label: "Pretend you didn't see", tone: "calm", outcomes: [{ text: "You turn to the bar." }] },
    ],
  },
  {
    id: "bouncer",
    spots: ["night"],
    ask: [3_000, 10_000],
    emoji: "🚪",
    title: "Not on the list",
    text: ["The bouncer folds his arms. \"Your name isn't on the list.\" He looks at your wallet."],
    choices: [
      { label: "Slip him {ask}", tone: "calm", outcomes: [{ text: "Suddenly your name is on the list.", pay: 1 }] },
      { label: "Call a friend inside", tone: "bold", outcomes: [{ chance: 0.6, text: "Your friend comes out and walks you straight in.", rep: 1 }, { chance: 0.4, text: "Your friend doesn't pick up. Long wait." }] },
      { label: "Go somewhere else", tone: "calm", outcomes: [{ text: "Lagos has plenty of clubs." }] },
    ],
  },

  // ---------------------------------------------------------------- gyms and sport
  {
    id: "plank_challenge",
    spots: ["sport"],
    ask: [2_000, 10_000],
    emoji: "💪🏾",
    title: "Plank challenge",
    text: ["{name} is holding a plank and grinning at you. \"Bet you {ask} you can't beat me.\""],
    choices: [
      { label: "Take the bet", tone: "bold", outcomes: [{ chance: 0.55, text: "You hold it for three minutes. {name} collapses first. Pay up!", get: 1, rep: 2 }, { chance: 0.45, text: "Your arms give way at a minute forty. {name} is very smug.", pay: 1 }] },
      { label: "Cheer them on", tone: "kind", outcomes: [{ text: "{name} sets a gym record with you counting.", rep: 1 }] },
      { label: "Not today", tone: "calm", outcomes: [{ text: "You stick to your own workout." }] },
    ],
  },
  {
    id: "trainer_offer",
    spots: ["sport"],
    ask: [5_000, 20_000],
    emoji: "🏋🏾",
    title: "Personal trainer",
    text: ["A trainer comes over. \"Your form is good, but I can make it great. A session is {ask}.\""],
    choices: [
      { label: "Book a session", tone: "bold", outcomes: [{ text: "It's brutal. You can't feel your legs. People notice the effort.", pay: 1, rep: 1 }] },
      { label: "Ask for a free tip", tone: "kind", outcomes: [{ text: "He shows you a trick for squats. Free and useful.", rep: 1 }] },
      { label: "No thanks", tone: "calm", outcomes: [{ text: "You've got your own plan." }] },
    ],
  },
  {
    id: "bench_hog",
    spots: ["sport"],
    emoji: "⏱️",
    title: "Bench hog",
    text: ["Someone has been sitting on the bench for twenty minutes, scrolling on their phone."],
    choices: [
      { label: "Ask nicely to share", tone: "kind", outcomes: [{ chance: 0.75, text: "\"Oh, sorry!\" They move straight away.", rep: 1 }, { chance: 0.25, text: "They pretend not to hear you." }] },
      { label: "Complain loudly", tone: "mean", outcomes: [{ text: "It works, but the whole gym thinks you're rude.", rep: -1 }] },
      { label: "Use something else", tone: "calm", outcomes: [{ text: "Plenty of other machines." }] },
    ],
  },
  {
    id: "stray_ball",
    spots: ["sport", "outdoors"],
    emoji: "🏀",
    title: "Heads up!",
    text: ["A ball comes flying out of the game, straight at you."],
    choices: [
      { label: "Send it back in style", tone: "bold", outcomes: [{ chance: 0.6, text: "Perfect. The players applaud.", rep: 2 }, { chance: 0.4, text: "It goes the wrong way entirely. Everyone laughs.", rep: -1 }] },
      { label: "Catch it and hand it back", tone: "kind", outcomes: [{ text: "Simple and polite.", rep: 1 }] },
      { label: "Duck", tone: "calm", outcomes: [{ text: "It flies over your head." }] },
    ],
  },

  // ---------------------------------------------------------------- markets and shops
  {
    id: "too_much_change",
    spots: ["shop"],
    ask: [1_000, 8_000],
    emoji: "🪙",
    title: "Too much change",
    text: ["The cashier is rushing and gives you {ask} too much change."],
    choices: [
      { label: "Give it back", tone: "kind", outcomes: [{ text: "The cashier is so grateful: it would have come out of her pay.", rep: 3 }] },
      { label: "Keep it", tone: "mean", outcomes: [{ text: "You walk out quickly. Nobody noticed.", get: 1, rep: -2, unseen: true, trust: -1 }, { chance: 0.3, text: "\"Excuse me!\" The man behind you saw it all.", get: 1, rep: -3 }] },
    ],
  },
  {
    id: "trader_jara",
    spots: ["shop"],
    ask: [1_000, 5_000],
    emoji: "🧺",
    title: "Jara!",
    text: ["Iya {name} the trader likes your smile and adds extra to everything you buy. \"Jara for you!\""],
    choices: [
      { label: "Buy something extra from her", tone: "kind", outcomes: [{ text: "She calls you her favourite customer to everyone in earshot.", pay: 1, rep: 2 }] },
      { label: "Thank her warmly", tone: "kind", outcomes: [{ text: "She waves you off with a blessing.", rep: 1 }] },
    ],
  },
  {
    id: "two_traders",
    spots: ["shop"],
    emoji: "🗣️",
    title: "\"Customer! Customer!\"",
    text: ["Two traders are pulling at your arms. \"Come to my shop!\" \"No, my own is better!\""],
    choices: [
      { label: "Pick the older one", tone: "kind", outcomes: [{ text: "She wins. The other one sulks, then laughs.", rep: 1 }] },
      { label: "Buy from both", tone: "kind", outcomes: [{ text: "Peace is restored. Both of them bless you.", rep: 2 }] },
      { label: "Escape", tone: "calm", outcomes: [{ text: "You slip away between the stalls." }] },
    ],
  },
  {
    id: "sweets_child",
    spots: ["shop", "street"],
    ask: [200, 1_000],
    emoji: "🍬",
    title: "Just one sweet",
    text: ["A little boy tugs your sleeve and points at the sweets. \"Please, just one!\""],
    choices: [
      { label: "Buy him some", tone: "kind", outcomes: [{ text: "His smile could light up the whole of Balogun.", pay: 1, rep: 1 }] },
      { label: "Ask where his parents are", tone: "calm", outcomes: [{ text: "His mother appears, embarrassed, and leads him away." }] },
    ],
  },

  // ---------------------------------------------------------------- churches and mosques
  {
    id: "offering",
    spots: ["worship"],
    ask: [1_000, 10_000],
    emoji: "🙏🏾",
    title: "The basket comes round",
    text: ["The offering basket is coming down your row.", "Time for the collection. Everyone is digging in their pockets."],
    choices: [
      { label: "Give {ask}", tone: "kind", outcomes: [{ text: "You give with a happy heart.", pay: 1, rep: 1 }] },
      { label: "Give big", tone: "bold", outcomes: [{ text: "The person next to you notices. So does everyone after the service.", pay: 3, rep: 3 }] },
      { label: "Pass it on", tone: "calm", outcomes: [{ text: "You pass the basket along." }] },
    ],
  },
  {
    id: "pray_for_me",
    spots: ["worship"],
    emoji: "🕊️",
    title: "\"Please, pray with me\"",
    text: ["{name}, a stranger, asks if you'll pray with them. Their mother is ill."],
    choices: [
      { label: "Pray with them", tone: "kind", outcomes: [{ text: "You hold hands and pray. {name} thanks you with tears in their eyes.", rep: 2 }] },
      { label: "Offer kind words", tone: "kind", outcomes: [{ text: "Your words mean a lot to them.", rep: 1 }] },
      { label: "Smile and nod", tone: "calm", outcomes: [{ text: "They understand. Everybody has their own troubles." }] },
    ],
  },
  {
    id: "owambe_invite",
    spots: ["worship", "food"],
    emoji: "💃🏾",
    title: "An invitation",
    text: ["After the service, {name} hands you a card: their sister's wedding, next Saturday. \"You must come!\""],
    choices: [
      { label: "\"I'll be there!\"", tone: "kind", outcomes: [{ text: "{name} is delighted. Better find your best agbada or gele.", rep: 1, follow: "owambe" }] },
      { label: "Decline politely", tone: "calm", outcomes: [{ text: "\"Next time, then!\"" }] },
    ],
  },

  // ---------------------------------------------------------------- parks and beaches
  {
    id: "ludo_game",
    spots: ["outdoors"],
    ask: [1_000, 5_000],
    emoji: "🎲",
    title: "Ludo under the tree",
    text: ["Some older men are playing ludo under a tree. \"Young one! {ask} a game?\""],
    choices: [
      { label: "Play", tone: "bold", outcomes: [{ chance: 0.5, text: "You win! They demand a rematch tomorrow.", get: 1, rep: 1 }, { chance: 0.5, text: "Baba {name} has been playing for forty years. You lose.", pay: 1 }] },
      { label: "Watch for a while", tone: "kind", outcomes: [{ text: "The arguments are better than the game.", rep: 1 }] },
      { label: "Move on", tone: "calm", outcomes: [{ text: "Maybe another day." }] },
    ],
  },
  {
    id: "horse_ride",
    spots: ["outdoors"],
    ask: [2_000, 6_000],
    emoji: "🐎",
    title: "A ride on the beach",
    text: ["A horseman leads his horse over. \"Ride along the beach? {ask} only.\""],
    choices: [
      { label: "Ride", tone: "bold", outcomes: [{ text: "Wind in your face, waves at your feet. The photos are amazing.", pay: 1, rep: 1 }] },
      { label: "Just pat the horse", tone: "kind", outcomes: [{ text: "The horse is called {name}. The horseman thinks that's hilarious." }] },
      { label: "No thanks", tone: "calm", outcomes: [{ text: "He moves on." }] },
    ],
  },
  {
    id: "litter",
    spots: ["outdoors", "street"],
    emoji: "🧴",
    title: "Rubbish everywhere",
    text: ["Someone has left a pile of bottles and wrappers right next to the bin."],
    choices: [
      { label: "Pick it up", tone: "kind", outcomes: [{ text: "Two kids see you and start helping. Soon it's spotless.", rep: 2 }] },
      { label: "Leave it", tone: "calm", outcomes: [{ text: "Not your mess." }] },
    ],
  },
  {
    id: "kite_tangle",
    spots: ["outdoors"],
    emoji: "🪁",
    title: "Stuck kite",
    text: ["A little girl's kite is stuck in a tree. She's trying very hard not to cry."],
    choices: [
      { label: "Climb up and get it", tone: "bold", outcomes: [{ chance: 0.7, text: "You get it down. She's your biggest fan now.", rep: 2 }, { chance: 0.3, text: "You get it down, and tear your trousers on the way.", rep: 2 }] },
      { label: "Help her find a stick", tone: "kind", outcomes: [{ text: "Together you poke it free.", rep: 1 }] },
      { label: "Walk on", tone: "calm", outcomes: [{ text: "Her father arrives to help." }] },
    ],
  },

  // ---------------------------------------------------------------- at work and in offices
  {
    id: "colleague_loan",
    spots: ["work"],
    ask: MEDIUM,
    emoji: "💼",
    title: "\"Until month end\"",
    text: ["Your colleague {name} pulls you aside. \"Please, lend me {ask}. I'll pay back at month end.\""],
    choices: [
      { label: "Lend it", tone: "kind", outcomes: [{ text: "{name} hugs you. \"Month end, I promise.\"", pay: 1, rep: 1, follow: "loan_back" }] },
      { label: "Politely say no", tone: "calm", outcomes: [{ text: "{name} understands. Money is tight for everyone." }] },
      { label: "\"I'm broke too\"", tone: "calm", outcomes: [{ text: "You both laugh about it. Lagos." }] },
    ],
  },
  {
    id: "boss_praise",
    spots: ["work"],
    emoji: "🏆",
    title: "Praise from the top",
    text: ["In the meeting, the boss praises the project you worked on with your team."],
    choices: [
      { label: "Credit your team", tone: "kind", outcomes: [{ text: "Your team will go anywhere for you now.", rep: 3 }] },
      { label: "Take the credit", tone: "mean", outcomes: [{ text: "The boss is impressed. Your team is not.", rep: -1 }] },
      { label: "Say thank you", tone: "calm", outcomes: [{ text: "Short, sweet and professional.", rep: 1 }] },
    ],
  },
  {
    id: "office_birthday",
    spots: ["work"],
    ask: [1_000, 5_000],
    emoji: "🎁",
    title: "Office collection",
    text: ["It's {name}'s birthday and everyone is putting {ask} towards a gift."],
    choices: [
      { label: "Put in {ask}", tone: "kind", outcomes: [{ text: "{name} loves the gift and thanks everyone.", pay: 1, rep: 1 }] },
      { label: "Skip it", tone: "calm", outcomes: [{ text: "Someone writes the names down. Yours isn't on it.", rep: -1 }] },
    ],
  },

  // ---------------------------------------------------------------- anywhere
  {
    id: "scam_call",
    spots: "any",
    ask: MEDIUM,
    emoji: "☎️",
    title: "\"Congratulations!\"",
    text: ["An unknown number calls. \"You've won ₦5 million! Just send {ask} for processing.\""],
    choices: [
      { label: "Send the fee", tone: "bold", outcomes: [{ text: "The line goes dead. Of course it does.", pay: 1 }] },
      { label: "Hang up", tone: "calm", outcomes: [{ text: "Smart move." }] },
      { label: "Waste their time", tone: "kind", outcomes: [{ text: "You keep them on the phone for forty minutes asking silly questions. They hang up on you.", rep: 1 }] },
    ],
  },
  {
    id: "friend_borrow",
    spots: "any",
    ask: MEDIUM,
    emoji: "💬",
    title: "\"Abeg, send me something\"",
    text: ["Your friend {name} texts: \"Abeg, can you send me {ask}? I'll pay you back on Friday.\""],
    choices: [
      { label: "Send it", tone: "kind", outcomes: [{ chance: 0.65, text: "\"You're the best!\"", pay: 1, rep: 1, follow: "loan_back" }, { chance: 0.35, text: "\"Thanks! Friday!\" Hmm.", pay: 1, rep: 1, follow: "loan_ghost" }] },
      { label: "Say no", tone: "calm", outcomes: [{ text: "\"No wahala.\"" }] },
    ],
  },
  {
    id: "lucky_find",
    spots: "any",
    ask: [1_000, 5_000],
    weight: 0.5,
    emoji: "🍀",
    title: "Lucky day",
    text: ["You put your hand in an old jacket pocket and find {ask} you forgot about."],
    choices: [{ label: "Nice!", tone: "kind", outcomes: [{ text: "Small things.", get: 1 }] }],
  },

  // ---------------------------------------------------------------- what comes back later
  {
    id: "mama_returns",
    spots: "any",
    followOnly: true,
    ask: BIG,
    emoji: "👵🏾",
    title: "She remembered you",
    text: ["The old woman you helped is here, with her grandson. He runs a business now. \"Mama never stopped talking about you.\" He holds out {ask}."],
    choices: [
      { label: "Accept it", tone: "calm", outcomes: [{ text: "\"What goes around comes around,\" Mama says.", get: 1 }] },
      { label: "\"Keep it, Mama\"", tone: "kind", outcomes: [{ text: "Mama laughs and prays for you again, even louder this time.", rep: 4 }] },
    ],
  },
  {
    id: "student_thanks",
    spots: "any",
    followOnly: true,
    emoji: "🎓",
    title: "Remember me?",
    text: ["{name}, the student you helped get home, sends you a photo: they graduated with first class honours. \"You were part of my story.\""],
    choices: [{ label: "Congratulate them", tone: "kind", outcomes: [{ text: "They post about you. Lots of people like it.", rep: 3 }] }],
  },
  {
    id: "uncle_again",
    spots: "any",
    followOnly: true,
    ask: MEDIUM,
    emoji: "📱",
    title: "Uncle again",
    text: ["Uncle {name} is calling again. \"Another small emergency.\" This time it's {ask}."],
    choices: [
      { label: "Send it", tone: "kind", outcomes: [{ text: "\"You are the pride of this family!\"", pay: 1, rep: 1 }] },
      { label: "Ask what it's for", tone: "bold", outcomes: [{ text: "There is a very long pause. Then: \"Network is bad.\" Click." }] },
      { label: "Don't answer", tone: "calm", outcomes: [{ text: "You let it ring." }] },
    ],
  },
  {
    id: "loan_back",
    spots: "any",
    followOnly: true,
    ask: MEDIUM,
    emoji: "🤝🏾",
    title: "Paid back",
    text: ["{name} is as good as their word: they send back the money you lent them, with a little extra and a thank-you."],
    choices: [
      { label: "Take it", tone: "calm", outcomes: [{ text: "Trust is a beautiful thing.", get: 1.2, rep: 1 }] },
      { label: "Keep only what you lent", tone: "kind", outcomes: [{ text: "{name} insists you're the realest friend they have.", get: 1, rep: 2 }] },
    ],
  },
  {
    id: "loan_ghost",
    spots: "any",
    followOnly: true,
    ask: MEDIUM,
    emoji: "👻",
    title: "Friday came and went",
    text: ["It's well past Friday. {name} has seen your messages and not replied."],
    choices: [
      { label: "Let it go", tone: "kind", outcomes: [{ text: "Some lessons cost money. You're at peace with it.", rep: 1 }] },
      { label: "Call them out in the group chat", tone: "mean", outcomes: [{ chance: 0.5, text: "Shamed in front of everyone, {name} pays up within the hour.", get: 1, rep: -1 }, { chance: 0.5, text: "It turns into a big fight in the group chat. Nobody comes out well.", rep: -2 }] },
    ],
  },
  {
    id: "new_friend",
    spots: "any",
    followOnly: true,
    ask: [2_000, 6_000],
    emoji: "🍻",
    title: "\"Suya on me\"",
    text: ["{name}, who you met the other day, messages: \"Are you free? Let's get suya and drinks.\""],
    choices: [
      { label: "Go and hang out", tone: "kind", outcomes: [{ text: "A great evening. You've got a real friend in this city now.", pay: 1, rep: 2 }] },
      { label: "Another time", tone: "calm", outcomes: [{ text: "\"Sure, let me know!\"" }] },
    ],
  },
  {
    id: "owambe",
    spots: "any",
    followOnly: true,
    ask: [5_000, 25_000],
    emoji: "🎉",
    title: "Owambe time!",
    text: ["The party you were invited to is today: jollof, aso-ebi, a live band and a hundred aunties."],
    choices: [
      { label: "Go and spray the couple", tone: "bold", outcomes: [{ text: "You dance into the hall with notes flying. The MC calls your name twice.", pay: 1, rep: 4 }] },
      { label: "Go, eat and dance", tone: "kind", outcomes: [{ text: "Three plates of jollof and one very sore pair of feet later, you head home happy.", rep: 2 }] },
      { label: "Send your apologies", tone: "calm", outcomes: [{ text: "\"We missed you!\" they say. They mean it, a bit.", rep: -1 }] },
    ],
  },
];

MOMENTS.push(...ROAD_MOMENTS, ...BIG_MOMENTS, ...CAST_MOMENTS, ...VENTURE_MOMENTS, ...PLAYER_MOMENTS, ...TEMPLATE_MOMENTS, ...TEMPLATE_MOMENTS_2, ...SEASON_MOMENTS, ...LOCAL_MOMENTS, ...THING_MOMENTS);
// Each moment's pool of answers: the ones written with it, and more (./more-answers.ts).
for (const m of MOMENTS) if (MORE_ANSWERS[m.id]) m.choices.push(...MORE_ANSWERS[m.id]);
// Answers your things give you (./thing-answers.ts): only shown if you have one.
for (const m of MOMENTS) if (THING_ANSWERS[m.id]) m.choices.push(...THING_ANSWERS[m.id]);

export const MOMENT_BY_ID = new Map(MOMENTS.map((m) => [m.id, m]));

/**
 * Add player-written moments (./written.ts, ids starting "w_") so they can be shown and settled
 * like any other. Only those: the game's own moments can't be replaced.
 */
export function registerMoments(defs: MomentDef[]) {
  for (const d of defs) if (d.id.startsWith("w_")) MOMENT_BY_ID.set(d.id, d);
}

/** How often moments come, and how far they can move you in a day (docs/LIFE_WHEEL.md: fewer, each one mattering more). */
export const MOMENT_RULES = {
  /** At least this long between two (seconds): the game asks every 12 to 18 minutes online, so 3 or 4 an hour. */
  gapSeconds: 600,
  /** At most this many a day, on the street and the road together (about ten hours online). */
  perDay: 40,
  /** A big one at most this often (days). */
  bigEveryDays: 3,
  /** A moment not answered in this long is gone (seconds). */
  answerSeconds: 1_800,
  /** Answers shown at most (drawn from the moment's pool, in a shuffled order). */
  shown: 4,
  /** Reputation from moments: at most this much either way in a day, and in all (wide: stories last months). */
  repPerDay: 10,
  repMin: -100,
  repMax: 150,
  /** Money moments can bring in a day (naira; what they cost isn't limited). */
  gainPerDay: 300_000,
};

/**
 * On the road (the trip film): how likely a trip of at least `minKm` brings a moment, and how close
 * together they can come (the day's count is shared with the rest).
 */
export const ROAD_RULES = { chance: 0.33, minKm: 0.3, gapSeconds: 600, perDay: MOMENT_RULES.perDay };

/** The places in the game (an inside's theme) as where a moment can happen. */
export function spotOfTheme(theme: string | null | undefined, home: boolean): MomentSpot {
  if (home) return "home";
  switch (theme) {
    case "living":
    case "upstairs":
      return "home";
    case "restaurant":
    case "foodcourt":
    case "lounge":
    case "suite":
      return "food";
    case "club":
      return "night";
    case "gym":
    case "spa":
    case "court":
    case "boxing":
    case "wrestling":
    case "stands":
    case "courtside":
      return "sport";
    case "shop":
    case "mall":
    case "market":
      return "shop";
    case "church":
    case "mosque":
      return "worship";
    case "park":
    case "plaza":
    case "woods":
    case "pond":
    case "ferris":
    case "funfair":
    case "quay":
    case "parade":
    case "waterpark":
    case "poolDeck":
    case "roofGarden":
    case "roofTerrace":
      return "outdoors";
    case null:
    case undefined:
    case "":
      return "street";
    default:
      return "work";
  }
}

/** Lagos time (UTC+1): day from 6am to 7pm. */
export const isDayInLagos = (now = Date.now()) => {
  const h = (new Date(now).getUTCHours() + 1) % 24;
  return h >= 6 && h < 19;
};

/** A little seeded random. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round an amount the way people say prices (₦1,350 → ₦1,400; ₦12,340 → ₦12,500). */
export const niceNaira = (n: number) => (n < 1_000 ? Math.round(n / 50) * 50 : n < 5_000 ? Math.round(n / 100) * 100 : Math.round(n / 500) * 500);

/** Where you are with a character: how far your story has gone (−1: it's over), how they feel, and when you last met (ms). */
export type Bond = { step: number; feeling: number; last: number };
/** How much the whole city has helped and hurt a character. */
export type CastWorld = { good: number; bad: number };

/**
 * Whether a character's step can happen for someone now: it's the step they're on (or the first,
 * when they haven't met), they feel the right way, it's been long enough since the last one, the
 * character is in the game yet, and the city has done enough (or not too much) for them.
 */
export function castFits(m: MomentDef, bonds: Record<string, Bond>, world: Record<string, CastWorld>, now: number): boolean {
  if (!m.cast) return true;
  const who = CAST_BY_ID.get(m.cast);
  if (!who || !castHere(who, now)) return false;
  const b = bonds[m.cast];
  if ((b?.step ?? 0) !== (m.step ?? 0)) return false;
  if (b && now - b.last < CAST_GAP_HOURS * 3_600_000) return false;
  const f = b?.feeling ?? 0;
  if (m.feel && (f < m.feel[0] || f > m.feel[1])) return false;
  const w = world[m.cast] ?? { good: 0, bad: 0 };
  const need = m.world;
  if (need?.good != null && w.good < need.good) return false;
  if (need?.bad != null && w.bad < need.bad) return false;
  if (need?.goodBelow != null && w.good >= need.goodBelow) return false;
  if (need?.badBelow != null && w.bad >= need.badBelow) return false;
  return true;
}

/** Where someone's business is, for picking its moments. */
export type VentureState = { open: boolean; stage: number; crisis: boolean; grow: boolean; due: boolean };

/** Whether a business moment fits: they run one (or not, for the invitation), it's time, at the right stage. */
export function ventureFits(m: MomentDef, b: VentureState | undefined): boolean {
  const v = m.venture;
  if (!v) return true;
  if (!b) return false;
  if (v.none) return !b.open;
  if (!b.open || !b.due) return false;
  if (v.crisis) return b.crisis;
  if (v.grow) return b.grow && !b.crisis;
  if (v.stages && (b.stage < v.stages[0] || b.stage > v.stages[1])) return false;
  return true;
}

/** How likely each rarity is, against common. Rare is about monthly, legendary about yearly, at 5 a day. */
const RARITY_WEIGHT: Record<MomentRarity, number> = { common: 1, uncommon: 0.4, rare: 0.05, legendary: 0.004 };

/**
 * Pick a moment for someone: one that can happen here and now, not one they've had lately (`recent`
 * ids), weighted. Ones they've never had (`seen`: every one they've ever had) come first. `bigOk`:
 * a big one may come (none in the last few days). `rand` from 0 to 1. On the road, `ride`: how
 * they're going.
 */
export function pickMoment(o: {
  spot: MomentSpot;
  day: boolean;
  level: number;
  recent: string[];
  seen?: Set<string>;
  bigOk?: boolean;
  /** What's on them now: hurt means no sport; under watch, the police stop them more. */
  effects?: EffectId[];
  /** Where they are with the cast (game-db/113). Without it, no character's story comes. */
  bonds?: Record<string, Bond>;
  /** How much the city has helped and hurt each character. */
  castWorld?: Record<string, CastWorld>;
  /** The badges they have (moments for people known for something). */
  badges?: string[];
  /** Their business, if they run one (`due`: it's time for its next moment). Without it, no business moment comes. */
  business?: VentureState;
  /** There's another player who can be in their story right now. */
  partner?: boolean;
  /** The seasons and special days it is now (./calendar.ts). */
  seasons?: string[];
  /** The area of the city they're in. */
  area?: string;
  /** What kind of person they are now (rich, famous...). */
  fits?: Fit[];
  /** More moments to choose from (written by players and approved, ./written.ts). */
  extra?: MomentDef[];
  /** What they own: kinds, and "cat:" and each category they have something in. */
  owned?: string[];
  now?: number;
  rand: () => number;
  ride?: Commute;
}): MomentDef | null {
  const hurt = !!o.effects?.includes("hurt");
  const watched = !!o.effects?.includes("under_watch");
  const pool = o.extra?.length ? [...MOMENTS, ...o.extra] : MOMENTS;
  const fits = pool.filter(
    (m) =>
      !m.followOnly &&
      // On the road, only road moments (each has a scene in the trip film), for this ride.
      (m.spots === "any" ? o.spot !== "road" : m.spots.includes(o.spot)) &&
      (!m.rides || (!!o.ride && m.rides.includes(o.ride))) &&
      (!m.time || (m.time === "day") === o.day) &&
      (m.minLevel ?? 0) <= o.level &&
      ((m.size ?? "small") === "small" || !!o.bigOk) &&
      !(hurt && m.spots !== "any" && m.spots.includes("sport")) &&
      (!m.cast || (!!o.bonds && castFits(m, o.bonds, o.castWorld ?? {}, o.now ?? Date.now()))) &&
      (!m.badge || !!o.badges?.includes(m.badge)) &&
      (!m.venture || ventureFits(m, o.business)) &&
      (!m.player || (!!m.player.start && !!o.partner)) &&
      (!m.season || m.season.some((x) => !!o.seasons?.includes(x))) &&
      (!m.areas || (!!o.area && m.areas.some((a) => o.area!.toLowerCase().includes(a.toLowerCase())))) &&
      (!m.fits || m.fits.some((x) => !!o.fits?.includes(x))) &&
      (!m.item || m.item.some((x) => !!o.owned?.includes(x))) &&
      !o.recent.includes(m.id),
  );
  // Moments for this kind of place come first; "anywhere" ones fill in. Never had: three times as likely.
  const weight = (m: MomentDef) =>
    (m.weight ?? 1) *
    (m.spots === "any" ? 0.5 : 1.5) *
    RARITY_WEIGHT[m.rarity ?? "common"] *
    (o.seen && !o.seen.has(m.id) ? 3 : 1) *
    (watched && (m.stage === "police" || m.stage === "lastma") ? 3 : 1) *
    // People you already know come back more than strangers turn up.
    (m.cast && (m.step ?? 0) > 0 ? 2 : 1) *
    // What you're known for comes looking for you.
    (m.badge ? 2 : 1) *
    // Your business needs you when it's time.
    (m.venture && !m.venture.none ? 4 : 1) *
    // The season, your area and who you are make their moments likelier.
    (m.season ? 3 : 1) *
    (m.areas ? 2 : 1) *
    (m.fits ? 2 : 1) *
    // What you own turns up in your life.
    (m.item ? 2 : 1);
  const total = fits.reduce((a, m) => a + weight(m), 0);
  let r = o.rand() * total;
  for (const m of fits) if ((r -= weight(m)) <= 0) return m;
  return fits.at(-1) ?? null;
}

/** The things filled into a moment: a name, an amount (naira) and where. */
export type MomentVars = { name: string; ask: number; place: string; parts?: Record<string, string>; tags?: string[]; has?: string[] };

/** Fill a moment's names and amounts, the same every time for the same seed. Richer players get asked for a bit more. */
export function momentVars(m: MomentDef, seed: number, level: number, place: string): MomentVars {
  const rand = rng(seed);
  const name = MOMENT_NAMES[Math.floor(rand() * MOMENT_NAMES.length)];
  const [lo, hi] = m.ask ?? [0, 0];
  const lift = 1 + Math.min(1.5, Math.max(0, level - 1) * 0.08);
  let ask = hi ? niceNaira((lo + rand() * (hi - lo)) * lift) : 0;
  // Built from parts: one option for each slot.
  const parts: Record<string, string> = {};
  const tags: string[] = [];
  for (const [slot, options] of Object.entries(m.parts ?? {})) {
    const o = options[Math.floor(rand() * options.length)];
    parts[slot] = o.text;
    if (o.ask) ask = niceNaira(ask * o.ask);
    if (o.tag) tags.push(o.tag);
  }
  return m.parts ? { name, ask, place: place || "the bus stop", parts, tags } : { name, ask, place: place || "the bus stop" };
}

/** Which way of telling it (by the seed). */
export const momentText = (m: MomentDef, seed: number) => m.text[Math.abs(seed) % m.text.length];

/** Fill in {name}, {ask} and {place}; `money` shows an amount (naira) the player's way. */
export function fillMoment(text: string, v: MomentVars, money: (naira: number) => string) {
  let out = text;
  // Parts first: a part can itself say {name} or {ask}.
  for (const [slot, part] of Object.entries(v.parts ?? {})) out = out.split(`{${slot}}`).join(part);
  return out.replace(/\{name\}/g, v.name).replace(/\{ask\}/g, money(v.ask)).replace(/\{place\}/g, v.place);
}

/** How many ways a moment built from parts can read (1 for any other). */
export const partVersions = (m: MomentDef) => Object.values(m.parts ?? {}).reduce((a, o) => a * o.length, 1) * Math.max(1, m.text.length);

/** What a choice costs at most (naira), to grey it out when you can't afford it. */
export const choiceCost = (c: MomentChoice, ask: number) => Math.max(0, ...c.outcomes.map((o) => ((o.pay ?? 0) + (o.give ?? 0)) * ask));

/** Who you are and what's on you, when an outcome is rolled (outcomes shift with it). */
export type RollContext = { character?: Partial<Record<Trait, number>>; effects?: EffectId[]; venture?: { quality: number }; tags?: string[] };

/** How far a side of you has to lean for an outcome to count you as that way. */
export const LEAN = 30;

const good = (o: MomentOutcome) => (o.get ?? 0) > 0 || (o.rep ?? 0) > 0;
const bad = (o: MomentOutcome) => (o.rep ?? 0) < 0 || ((o.pay ?? 0) > 0 && (o.rep ?? 0) <= 0) || o.effect === "bad_day";

/**
 * An outcome's weight here and now: its chance, times about 2.5 for each `likelier` that fits you,
 * and a nudge from what's on you (blessed and lucky: good outcomes likelier; a bad day: bad ones;
 * talked about: people are a bit wary). So the same answer doesn't always turn out the same.
 */
export function outcomeWeight(o: MomentOutcome, ctx: RollContext = {}): number {
  let w = o.chance ?? 1;
  const fx = ctx.effects ?? [];
  for (const l of o.likelier ?? []) {
    const fits =
      "effect" in l
        ? fx.includes(l.effect)
        : "venture" in l
          ? (ctx.venture?.quality ?? 0) >= 60
          : "tag" in l
            ? !!ctx.tags?.includes(l.tag)
            : (ctx.character?.[l.trait] ?? 0) * l.side >= LEAN;
    if (fits) w *= 2.5;
  }
  if (good(o) && (fx.includes("blessed") || fx.includes("lucky"))) w *= 1.5;
  if (bad(o) && fx.includes("bad_day")) w *= 1.5;
  if (good(o) && fx.includes("talked_about")) w *= 0.8;
  return w;
}

/** Roll a choice's outcome (weighted by chance, shifted by who you are and what's on you). */
export function rollOutcome(c: MomentChoice, rand: () => number, ctx: RollContext = {}): MomentOutcome {
  const weights = c.outcomes.map((o) => outcomeWeight(o, ctx));
  const total = weights.reduce((a, w) => a + w, 0);
  let r = rand() * total;
  for (let i = 0; i < c.outcomes.length; i++) if ((r -= weights[i]) <= 0) return c.outcomes[i];
  return c.outcomes[c.outcomes.length - 1];
}

/** The part of life a moment touches (for the wheel): what it says, or a guess from where it happens. */
export function areaOf(m: MomentDef): LifeArea {
  if (m.area) return m.area;
  if (m.cast && CAST_BY_ID.get(m.cast)) return CAST_BY_ID.get(m.cast)!.area;
  const spot = m.spots === "any" ? "any" : m.spots[0];
  switch (spot) {
    case "home":
      return "family";
    case "food":
    case "night":
    case "sport":
      return "friends";
    case "shop":
      return "money";
    case "worship":
      return "faith";
    case "outdoors":
      return "community";
    case "work":
      return "work";
    case "any":
      return /borrow|loan|scam|lucky|paid|friday/i.test(m.id) ? "money" : "friends";
    default:
      return "street";
  }
}

/**
 * Which answers to show, in what order (the same every time for the same seed): at most
 * MOMENT_RULES.shown drawn from the moment's pool, shuffled, so no position gives an answer away.
 * Indexes into `choices`.
 */
export function choiceOrder(m: MomentDef, seed: number, has: string[] = []): number[] {
  const rand = rng((seed ^ 0x5bd1e995) >>> 0);
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // Answers your things give you always show (they're why you have them); the rest fill up.
  const yours = m.choices.map((c, i) => (c.has && c.has.some((h) => has.includes(h)) ? i : -1)).filter((i) => i >= 0);
  const open = shuffle(m.choices.map((c, i) => (c.has ? -1 : i)).filter((i) => i >= 0));
  return shuffle([...yours.slice(0, 2), ...open].slice(0, MOMENT_RULES.shown));
}

/** What someone owns, as moments ask about it: each kind, and "cat:" with each category. */
export function ownedTokens(items: { kind: string; category: string }[]): string[] {
  return [...new Set(items.flatMap((i) => [i.kind, `cat:${i.category}`]))];
}

/** Of what someone owns, what a moment cares about (its answers' `has` and its `item`). */
export function relevantOwned(m: MomentDef, owned: string[]): string[] {
  const wants = new Set([...(m.item ?? []), ...m.choices.flatMap((c) => c.has ?? [])]);
  return owned.filter((o) => wants.has(o));
}

/** How a kind of answer nudges who you are, when a choice doesn't say. */
const TONE_TRAITS: Record<NonNullable<MomentChoice["tone"]>, TraitNudge> = {
  kind: { giving: 2, people: 1, wrongs: 1 },
  bold: { daring: 2 },
  mean: { wrongs: -2, people: -1 },
  calm: { daring: -2 },
};

/**
 * How an answer nudges the six sliders: what the choice says, or a guess from its tone and what it
 * does (paying out is giving; taking money and losing face for it is street-smart; keeping your
 * money is prudent).
 */
export function choiceTraits(c: MomentChoice): TraitNudge {
  if (c.traits) return c.traits;
  const out: TraitNudge = { ...TONE_TRAITS[c.tone ?? "calm"] };
  const pays = c.outcomes.some((o) => (o.pay ?? 0) > 0);
  const shady = c.outcomes.some((o) => (o.get ?? 0) > 0 && (o.rep ?? 0) < 0);
  if (pays && c.tone === "kind") out.giving = (out.giving ?? 0) + 1;
  if (shady) out.truth = (out.truth ?? 0) - 2;
  if (!pays && c.tone === "calm") out.giving = (out.giving ?? 0) - 1;
  return out;
}

/** One answer you gave: its nudges and when (ms). */
export type TraitAnswer = { traits: TraitNudge; at: number };

/** Lately counts more: an answer is worth half after this many days. */
export const TRAIT_HALF_LIFE_DAYS = 21;

/**
 * Who you are now, from the answers you gave: each slider from −100 to 100. Recent answers count
 * most (they fade), and it takes many answers to reach either end, so one choice never decides it.
 */
export function characterOf(answers: TraitAnswer[], now = Date.now()): Record<Trait, number> {
  const sum = Object.fromEntries(TRAIT_KEYS.map((k) => [k, 0])) as Record<Trait, number>;
  for (const a of answers) {
    const days = Math.max(0, (now - a.at) / 86_400_000);
    const w = 0.5 ** (days / TRAIT_HALF_LIFE_DAYS);
    for (const k of TRAIT_KEYS) sum[k] += (Number(a.traits?.[k]) || 0) * w;
  }
  // About 25 points of steady nudging makes a slider read strongly (about 76).
  for (const k of TRAIT_KEYS) sum[k] = Math.round(100 * Math.tanh(sum[k] / 25));
  return sum;
}

/** Who you are, in words (the wheel's middle): the strongest sides, "a bit" for the milder ones. */
export function characterWords(c: Record<Trait, number>, most = 3): string[] {
  return TRAIT_KEYS.map((k) => ({ k, v: c[k] }))
    .filter((t) => Math.abs(t.v) >= 20)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, most)
    .map(({ k, v }) => `${Math.abs(v) < 45 ? "a bit " : ""}${TRAITS[k][v > 0 ? 0 : 1].toLowerCase()}`);
}
