// Things that happen to you out on the street (docs/ENCOUNTERS.md): walking round Lagos, or on a
// keke, okada or danfo to somewhere. A hawker, an agbero at the park, a police checkpoint, money on
// the ground, a go-slow... Each one is a little card with two or three choices; what happens is
// rolled by the game's server (never the phone), and the money is small next to a day's pay.

import type { Commute } from "./work.ts";

/** What a choice can lead to: words, and money (naira: less than 0 you pay, more than 0 you get). */
export type Outcome = { text: string; naira: number };
/** A choice: always the same outcome, or a chance of the good one (`odds` 0..1) and otherwise the bad. */
export type Choice = { label: string; good: Outcome; bad?: Outcome; odds?: number };
export type Encounter = {
  id: string;
  /** On foot, on a ride (which kinds), or either. */
  where: "foot" | "ride" | "both";
  rides?: Commute[];
  /** A picture for the card (an emoji keeps it light and works everywhere). */
  icon: string;
  title: string;
  text: string;
  choices: Choice[];
};

const R = (text: string, naira = 0): Outcome => ({ text, naira });

export const ENCOUNTERS: Encounter[] = [
  // ---- on foot
  {
    id: "puff",
    where: "foot",
    icon: "🍩",
    title: "Puff-puff, hot hot!",
    text: "A woman with a tray on her head calls out: fresh puff-puff, five for ₦500.",
    choices: [
      { label: "Buy five (₦500)", good: R("Still warm. Sugar on your fingers, no regrets.", -500) },
      { label: "No thanks", good: R("You walk on. The smell follows you down the street.") },
    ],
  },
  {
    id: "money_ground",
    where: "foot",
    icon: "💵",
    title: "Money on the ground",
    text: "A folded ₦1,000 note is lying by the gutter. Nobody seems to have noticed.",
    choices: [
      { label: "Pick it up", good: R("Nobody claims it. Today is your lucky day.", 1_000), bad: R("A man rushes over: \"Na my own!\" You hand it back.", 0), odds: 0.7 },
      { label: "Leave it", good: R("You leave it. Someone else will have a good day.") },
    ],
  },
  {
    id: "agbero_walk",
    where: "foot",
    icon: "🧢",
    title: "Agbero at the junction",
    text: "\"Oga, settle us now! Na our area be this.\" A tout blocks the way with a grin.",
    choices: [
      { label: "Give ₦200", good: R("\"Correct person!\" He waves you through.", -200) },
      { label: "Walk past", good: R("You don't break stride. He shrugs and finds someone else."), bad: R("He follows you, shouting, until you give ₦500 to make it stop.", -500), odds: 0.6 },
      { label: "Crack a joke in pidgin", good: R("He laughs so hard he forgets to ask for money."), bad: R("He doesn't find it funny. ₦300 later you're on your way.", -300), odds: 0.5 },
    ],
  },
  {
    id: "directions",
    where: "foot",
    icon: "🗺️",
    title: "Lost visitor",
    text: "A young man with a big bag asks the way to the nearest bus stop. He's just arrived from Ibadan.",
    choices: [
      { label: "Walk him there", good: R("He presses ₦500 into your hand: \"God bless you!\"", 500), bad: R("He thanks you warmly. That's thanks enough.", 0), odds: 0.4 },
      { label: "Point the way", good: R("He nods and heads off. Hopefully the right way.") },
    ],
  },
  {
    id: "football",
    where: "foot",
    icon: "⚽",
    title: "Street football",
    text: "Some boys have stones for goalposts and need one more player. \"Bros, abeg join us!\"",
    choices: [
      { label: "Play a game", good: R("You score a cracker. They'll talk about it all week."), bad: R("You fall in the sand. The ball wins.", 0), odds: 0.6 },
      { label: "Bet ₦500 on your side", good: R("Your side wins! ₦1,000 back.", 500), bad: R("Your side loses 3-1. Easy come, easy go.", -500), odds: 0.5 },
      { label: "Not today", good: R("You watch for a minute, then move on.") },
    ],
  },
  {
    id: "preacher",
    where: "foot",
    icon: "📖",
    title: "Street preacher",
    text: "A man with a megaphone presses a pamphlet into your hand: \"Repent! The end is near!\"",
    choices: [
      { label: "Drop ₦200 in his bowl", good: R("\"You are blessed!\" You do feel a bit blessed.", -200) },
      { label: "Take the pamphlet", good: R("You fold it into your pocket and carry on.") },
    ],
  },
  {
    id: "rain",
    where: "foot",
    icon: "🌧️",
    title: "Rain is coming",
    text: "The sky goes black. A boy is selling umbrellas at ₦1,500, double the normal price.",
    choices: [
      { label: "Buy one (₦1,500)", good: R("Five minutes later it pours. Best ₦1,500 you ever spent.", -1_500) },
      { label: "Run for it", good: R("You make it under a shop's awning just in time."), bad: R("You're soaked to the skin. Lagos rain doesn't play.", 0), odds: 0.5 },
    ],
  },
  {
    id: "pickpocket",
    where: "foot",
    icon: "👀",
    title: "Hand in your pocket",
    text: "In the crowd by the market you feel a hand slide into your pocket.",
    choices: [
      { label: "Grab his wrist", good: R("He wriggles free and runs, empty-handed."), bad: R("He's quicker. ₦2,000 gone with him.", -2_000), odds: 0.65 },
      { label: "Shout \"Ole!\"", good: R("Everyone turns. He melts into the crowd with nothing."), bad: R("By the time anyone looks, ₦1,000 has gone.", -1_000), odds: 0.75 },
    ],
  },
  {
    id: "suya",
    where: "foot",
    icon: "🍢",
    title: "Suya spot",
    text: "The smoke from the suya stand hits you. Mallam is cutting fresh sticks with onions and pepper.",
    choices: [
      { label: "Buy ₦1,000 worth", good: R("Perfect amount of yaji. You eat it walking.", -1_000) },
      { label: "Keep walking", good: R("Your stomach complains, but your wallet thanks you.") },
    ],
  },
  {
    id: "bet_shop",
    where: "foot",
    icon: "🎰",
    title: "Betting shop",
    text: "Outside a betting shop a man swears tonight's match is sure: \"Put ₦1,000, collect ₦3,000!\"",
    choices: [
      { label: "Put ₦1,000 on it", good: R("It comes in! ₦3,000 in your hand.", 2_000), bad: R("The match ends 0-0. \"Next time,\" he says.", -1_000), odds: 0.3 },
      { label: "Walk away", good: R("Nothing is sure in football. You keep your money.") },
    ],
  },
  {
    id: "old_friend",
    where: "foot",
    icon: "🤝",
    title: "An old school mate",
    text: "\"Ah! Is it you?\" Someone from secondary school recognises you, and wants you to buy drinks.",
    choices: [
      { label: "Buy two malts (₦800)", good: R("You catch up for twenty minutes. Good times.", -800) },
      { label: "\"Next time, I'm in a hurry\"", good: R("You swap numbers and promise to link up.") },
    ],
  },
  {
    id: "ward_police",
    where: "foot",
    icon: "👮",
    title: "Stop and search",
    text: "Two policemen wave you over: \"Where are you going? Bring your phone, let's see.\"",
    choices: [
      { label: "Stay calm, show ID", good: R("They look at it, look at you, and let you go."), bad: R("\"Find something for the boys.\" ₦1,000 ends it.", -1_000), odds: 0.7 },
      { label: "Give ₦500 \"for water\"", good: R("\"Go well, my friend.\"", -500) },
      { label: "Ask for their names", good: R("They exchange looks and wave you on. Knowing your rights works."), bad: R("Wrong day for it. Forty minutes and ₦2,000 later you're free.", -2_000), odds: 0.55 },
    ],
  },

  // ---- on a ride
  {
    id: "checkpoint",
    where: "ride",
    icon: "🚔",
    title: "Police checkpoint",
    text: "Logs across the road. An officer leans in: \"Driver, particulars! Everybody, wetin you carry?\"",
    choices: [
      { label: "Chip in ₦200 with the others", good: R("The driver hands it over. The logs move.", -200) },
      { label: "Stay quiet", good: R("The driver settles it himself and you move on."), bad: R("Everyone gets searched. Thirty minutes later, off again.", 0), odds: 0.6 },
      { label: "Film it on your phone", good: R("He sees the phone and waves you all through, fast."), bad: R("\"Delete it!\" He takes ₦1,000 to forget your face.", -1_000), odds: 0.5 },
    ],
  },
  {
    id: "agbero_park",
    where: "ride",
    rides: ["danfo", "keke"],
    icon: "🧢",
    title: "Agbero at the park",
    text: "At the bus stop an agbero slaps the side: \"Driver! Ticket money!\" The driver looks at the passengers.",
    choices: [
      { label: "Add ₦100", good: R("Everyone adds a little. You're off.", -100) },
      { label: "Let the driver handle it", good: R("Shouting, a ₦200 note, and you're moving again.") },
    ],
  },
  {
    id: "change",
    where: "ride",
    rides: ["danfo"],
    icon: "🪙",
    title: "\"I no get change\"",
    text: "You paid with ₦1,000. The conductor stuffs it in his pocket: \"Change dey come.\"",
    choices: [
      { label: "Remind him at every stop", good: R("Two stops later, your change appears."), bad: R("He jumps off at a stop with your ₦500 change.", -500), odds: 0.7 },
      { label: "Let it go", good: R("₦500 is the price of peace today.", -500) },
    ],
  },
  {
    id: "go_slow",
    where: "ride",
    icon: "🚗",
    title: "Go-slow",
    text: "Traffic hasn't moved in twenty minutes. Hawkers weave between the cars selling everything.",
    choices: [
      { label: "Buy cold water and plantain chips (₦600)", good: R("Best purchase of the day.", -600) },
      { label: "Hop off and walk the rest", good: R("Faster on foot. You get there sweaty but early.") },
      { label: "Wait it out", good: R("It moves at last. Just Lagos things.") },
    ],
  },
  {
    id: "okada_shortcut",
    where: "ride",
    rides: ["okada"],
    icon: "🏍️",
    title: "Shortcut?",
    text: "Your okada man turns his head: \"Make I pass shortcut? E go fast, but na bad road.\"",
    choices: [
      { label: "Go for it", good: R("Through the back streets, bumpy but quick. He grins."), bad: R("A pothole. Your shoe and your pride, both muddy.", 0), odds: 0.6 },
      { label: "Main road, please", good: R("Slow and steady. You arrive in one piece.") },
      { label: "Add ₦200 to go faster", good: R("He takes off like a rocket. Hold on!", -200) },
    ],
  },
  {
    id: "keke_preacher",
    where: "ride",
    rides: ["danfo"],
    icon: "🙏",
    title: "Danfo preacher",
    text: "A man stands up at the front: \"Brethren, give me five minutes of your time!\" Then comes the offering bag.",
    choices: [
      { label: "Drop ₦100", good: R("\"Your journey is covered in the blood!\"", -100) },
      { label: "Pretend to sleep", good: R("Works every time.") },
    ],
  },
  {
    id: "fuel",
    where: "ride",
    icon: "⛽",
    title: "Out of fuel",
    text: "The engine coughs and dies. \"Fuel don finish. Make una add small make I buy.\"",
    choices: [
      { label: "Add ₦300", good: R("A boy runs with a jerrycan and you're off again.", -300) },
      { label: "Take another ride", good: R("You flag down another. ₦500 more, but no waiting.", -500) },
    ],
  },
  {
    id: "radio",
    where: "ride",
    icon: "📻",
    title: "The driver's radio",
    text: "The driver turns the radio up: they're giving away ₦5,000 to the first caller who knows the answer.",
    choices: [
      { label: "Call in", good: R("You get through and you're right! ₦5,000 on its way.", 5_000), bad: R("Engaged, engaged, engaged. Someone else wins.", 0), odds: 0.12 },
      { label: "Just sing along", good: R("The whole bus is singing by the chorus.") },
    ],
  },
];

export const encounterById = (id: string) => ENCOUNTERS.find((e) => e.id === id);

/** One for where you are (on foot, or on this kind of ride), not one of the last few you had. */
export function pickEncounter(where: "foot" | "ride", ride: Commute | null, recent: string[], rand: () => number = Math.random): Encounter | null {
  const fits = ENCOUNTERS.filter((e) => (e.where === where || e.where === "both") && (!e.rides || (ride && e.rides.includes(ride))));
  const fresh = fits.filter((e) => !recent.includes(e.id));
  const pool = fresh.length ? fresh : fits;
  return pool.length ? pool[Math.floor(rand() * pool.length) % pool.length] : null;
}

/** What a choice turns out to be (rolled on the server). */
export function rollChoice(c: Choice, rand: () => number = Math.random): Outcome {
  if (!c.bad || c.odds === undefined) return c.good;
  return rand() < c.odds ? c.good : c.bad;
}

/** At most this much (naira) won from encounters in a day, and this many encounters a day. */
export const ENCOUNTER_WIN_DAY = 15_000;
export const ENCOUNTERS_A_DAY = 20;
