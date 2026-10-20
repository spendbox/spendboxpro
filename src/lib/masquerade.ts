// Masquerade (docs/MASQUERADE.md): 5 minutes of chat with someone new, both masked; faces and
// names show only if both unmask. The rules and the questions, used by the server
// (src/app/api/masquerade) and the screens (src/app/play/masquerade.tsx).

/** How long a masquerade lasts, the "2 more minutes" (once, if both ask), and how long you have to decide. */
export const MASQ_MINUTES = 5;
export const MASQ_MORE_MINUTES = 2;
export const MASQ_DECIDE_SECONDS = 60;
/** Most masquerades a day each (keeps it special, and stops anyone going through everyone). */
export const MASQ_PER_DAY = 10;
/** A message: at most this many letters. */
export const MASQ_SAY_MAX = 300;

/** What you're here for: friends, dating, or a spicy link-up (no-strings fun between adults). */
export type MasqMode = "friends" | "dating" | "linkup";
export const MASQ_MODES: { mode: MasqMode; label: string; line: string }[] = [
  { mode: "friends", label: "Friends", line: "here for friends" },
  { mode: "dating", label: "Dating", line: "open to dating" },
  { mode: "linkup", label: "Spicy link-up 🔥", line: "here for a spicy link-up" },
];
/** Dating and spicy link-ups are for people who've switched on Open to dating. */
export const masqNeedsDating = (m: MasqMode) => m !== "friends";
/** Who you'd like to meet. */
export type MasqWant = "men" | "women" | "anyone";
/** How spicy you'd like the questions: 0 mild, 1 a little, 2 spicy, 3 extra spicy. */
export type MasqSpice = 0 | 1 | 2 | 3;
export const MASQ_SPICE: { level: MasqSpice; label: string; chillies: string }[] = [
  { level: 0, label: "Mild", chillies: "" },
  { level: 1, label: "A little spicy", chillies: "🌶️" },
  { level: 2, label: "Spicy", chillies: "🌶️🌶️" },
  { level: 3, label: "Extra spicy", chillies: "🌶️🌶️🌶️" },
];
/** Ages you can ask for (every player is 18+). */
export const MASQ_AGE_MIN = 18;
export const MASQ_AGE_MAX = 80;
/** A question: heat 0 easy, 1 spicy, 2 extra spicy. */
export type MasqQuestion = { text: string; heat: 0 | 1 | 2 };
/** The two of you pick a level each; the questions follow the average (a half rounds up). */
export const masqSpiceOf = (a: number, b: number): MasqSpice => Math.max(0, Math.min(3, Math.round((a + b) / 2))) as MasqSpice;

/** Easy ones, for anyone. */
const MILD: string[] = [
  "What's the best jollof you've ever had, and who made it?",
  "Which song gets you on the dance floor every single time?",
  "What's something small that made you happy this week?",
  "If you could live in any city in the world for a year, where?",
  "Amala or pounded yam? Defend your answer.",
  "What's the most Lagos thing that has ever happened to you?",
  "What would you do with a free Saturday and ₦1 million?",
  "Which Nollywood film could you watch again and again?",
  "What's a skill you'd love to learn if time and money didn't matter?",
  "Owambe or house party? Why?",
  "Who's the funniest person you know, and what makes them funny?",
  "What's the best advice anyone ever gave you?",
  "Beach day or a night out: which one wins?",
  "What's your go-to order at a buka?",
  "What did you want to be when you were ten?",
  "What's the last thing that made you laugh out loud?",
  "Which place in Nigeria should everyone visit once?",
  "What's your guilty-pleasure song?",
  "If your life had a theme song, what would it be?",
  "What's one thing people always get wrong about you?",
];

/** Spicy: flirty, cheeky, a bit daring (never explicit). Every player is 18+. */
const SPICY: string[] = [
  "What's the first thing you notice about someone you fancy?",
  "Kiss on the first date: yes, no, or depends?",
  "What's the boldest thing you've ever done to get someone's attention?",
  "Biggest red flag you ignored because they were fine?",
  "Have you ever slid into someone's DMs? How did it go?",
  "What's your love language, honestly?",
  "What's the most romantic thing you've done that went completely wrong?",
  "Rate your flirting from 1 to 10. Prove it.",
  "What's one thing that instantly makes someone more attractive?",
  "Have you ever had a crush on a friend's ex?",
  "What's your most toxic trait in a relationship?",
  "Describe your perfect date in Lagos in three words.",
  "Who should make the first move? Have you ever made it?",
  "What's the cheesiest pickup line that would actually work on you?",
  "Sweet text in the morning or a voice note at midnight?",
  "What's a secret talent you only show people you like?",
  "Have you ever been caught checking someone out?",
  "What would make you unmask right now?",
];

/** Extra spicy: bolder and more personal (still never explicit). Only when you've both asked for heat. */
const HOT: string[] = [
  "What's the most daring thing you've done for love (or lust)?",
  "Describe your type in three words. Am I close?",
  "What's the last thing that made you blush?",
  "Most unexpected place you've ever been kissed?",
  "What's a little secret about you nobody would guess?",
  "Have you ever fallen for someone you shouldn't have?",
  "What would your ideal late night look like, with the right person?",
  "Wildest thing you've done on a night out in Lagos?",
  "What's the boldest text you've ever sent?",
  "Truth: have you ever had a crush on someone in this game?",
  "What's the one thing that would make you say yes to a second date straight away?",
  "Slow dance or wild dance: which says more about someone?",
];

/** Every question, easy to extra spicy (their place in this list is what's kept). */
export const MASQ_QUESTIONS: MasqQuestion[] = [
  ...MILD.map((text) => ({ text, heat: 0 as const })),
  ...SPICY.map((text) => ({ text, heat: 1 as const })),
  ...HOT.map((text) => ({ text, heat: 2 as const })),
];
const POOLS = [MILD, SPICY, HOT];

/** A small fixed random from a number (the same everywhere, so both phones agree). */
function rand(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * The n-th question of a masquerade (n = 0 first, 1 after "Another question"...), at the level the
 * two of you average (masqSpiceOf): mild only; a spicy one about 1 in 4; about 1 in 2; or mostly
 * spicy and extra spicy. Up to "a little spicy" the first is always an easy one. Never the same
 * question twice in a row. Both phones work out the same question.
 */
export function masqQuestion(session: number, n: number, spice: MasqSpice): MasqQuestion {
  const heatOf = (k: number): 0 | 1 | 2 => {
    if (spice === 0 || (spice === 1 && k === 0)) return 0;
    const r = rand(session * 131 + k * 7 + 1);
    if (spice === 1) return r < 0.25 ? 1 : 0;
    if (spice === 2) return r < 0.55 ? 1 : 0;
    return r < 0.45 ? 2 : r < 0.85 ? 1 : 0;
  };
  // Walked in order, so each is checked against the one actually shown before it.
  let last = "";
  let shown: MasqQuestion = { text: "", heat: 0 };
  for (let k = 0; k <= Math.max(0, n); k++) {
    const heat = heatOf(k);
    const pool = POOLS[heat];
    let at = Math.floor(rand(session * 977 + k * 13 + 5) * pool.length);
    if (pool[at] === last) at = (at + 1) % pool.length;
    shown = { text: pool[at], heat };
    last = shown.text;
  }
  return shown;
}

/**
 * Before unmasking, no way to reach each other outside the game: no phone numbers, links or social
 * handles. Returns why not, or null when the message is fine.
 */
export function masqBlocked(text: string): string | null {
  const t = text.normalize("NFKC");
  if (/(\d[\s\-().]*){7,}/.test(t)) return "Numbers stay off until you both unmask.";
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|me|co)\b)/i.test(t)) return "Links stay off until you both unmask.";
  if (/(^|\s)@[a-z0-9_.]{3,}/i.test(t) || /\b(insta|instagram|snap|snapchat|whatsapp|tiktok|telegram)\b/i.test(t)) return "Socials stay off until you both unmask.";
  return null;
}
