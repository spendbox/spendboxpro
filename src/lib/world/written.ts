// Player-written moments (docs/LIFE_WHEEL.md, phase 7). Anyone can write a moment: what happens, two
// to four answers, and what each can lead to. It's checked here first (lengths, money and
// reputation within limits, no links, phone numbers or bad words), then other players vote on it,
// then the owner approves it from the dashboard; once approved it comes to everyone like any other
// moment, with the author's name on it, and the author is paid. Pure rules, shared by the phone
// (the form shows problems as you type) and the server (which checks again).

import type { MomentDef, MomentSpot } from "./moments.ts";

export const WRITE_SPOTS: { id: MomentSpot; name: string }[] = [
  { id: "street", name: "On the street" },
  { id: "home", name: "At home" },
  { id: "food", name: "Eating out" },
  { id: "night", name: "A night out" },
  { id: "shop", name: "Shops and markets" },
  { id: "work", name: "At work" },
  { id: "worship", name: "Church or mosque" },
  { id: "outdoors", name: "Parks and beaches" },
  { id: "sport", name: "Gym and sport" },
];

/** How much money is in it (naira ranges, as built-in moments use). */
export const WRITE_ASKS = {
  none: null,
  small: [500, 3_000],
  medium: [2_000, 15_000],
  big: [10_000, 50_000],
} as const;
export type WriteAsk = keyof typeof WRITE_ASKS;

export type DraftOutcome = {
  text: string;
  /** Money: below 0 you pay that many times the amount, above 0 you get it (−2 to 2). */
  money: number;
  /** Reputation, −3 to 3. */
  rep: number;
  /** How likely, against the answer's other outcomes (1 to 3). */
  chance: number;
};
export type Draft = {
  title: string;
  emoji: string;
  spot: MomentSpot;
  ask: WriteAsk;
  text: string;
  choices: { label: string; outcomes: DraftOutcome[] }[];
};

export const DRAFT_LIMITS = {
  title: [3, 40],
  text: [20, 320],
  label: [2, 60],
  outcome: [5, 220],
  choices: [2, 4],
  outcomes: [1, 3],
  money: 2,
  rep: 3,
} as const;

/** What the owner pays the author when their moment is approved (naira). */
export const AUTHOR_REWARD = 50_000;

const LINK = /(https?:\/\/|www\.|\.(com|ng|net|org|io)\b|@[a-z0-9_]{3,}|\b\d{7,}\b|\+?234\s?\d)/i;
// Kept short and plain: the owner reads every one before it goes in.
const BAD = /\b(fuck|shit|bitch|cunt|nigger|whore|rape|kill yourself)\b/i;

const len = (s: string) => s.trim().length;

/** Problems with a draft, in plain words (empty: it's fine to send). */
export function checkDraft(d: Draft): string[] {
  const out: string[] = [];
  const all = [d.title, d.text, ...d.choices.flatMap((c) => [c.label, ...c.outcomes.map((o) => o.text)])];
  if (len(d.title) < DRAFT_LIMITS.title[0] || len(d.title) > DRAFT_LIMITS.title[1]) out.push(`The title should be ${DRAFT_LIMITS.title[0]} to ${DRAFT_LIMITS.title[1]} letters.`);
  if (len(d.text) < DRAFT_LIMITS.text[0] || len(d.text) > DRAFT_LIMITS.text[1]) out.push(`What happens should be ${DRAFT_LIMITS.text[0]} to ${DRAFT_LIMITS.text[1]} letters.`);
  if (!WRITE_SPOTS.some((s) => s.id === d.spot)) out.push("Choose where it happens.");
  if (!(d.ask in WRITE_ASKS)) out.push("Choose how much money is in it.");
  if (!d.emoji || [...d.emoji].length > 4) out.push("Choose one emoji.");
  if (d.choices.length < DRAFT_LIMITS.choices[0] || d.choices.length > DRAFT_LIMITS.choices[1]) out.push("Give 2 to 4 answers.");
  d.choices.forEach((c, i) => {
    const n = i + 1;
    if (len(c.label) < DRAFT_LIMITS.label[0] || len(c.label) > DRAFT_LIMITS.label[1]) out.push(`Answer ${n} should be ${DRAFT_LIMITS.label[0]} to ${DRAFT_LIMITS.label[1]} letters.`);
    if (c.outcomes.length < DRAFT_LIMITS.outcomes[0] || c.outcomes.length > DRAFT_LIMITS.outcomes[1]) out.push(`Answer ${n} needs 1 to 3 things that can happen.`);
    c.outcomes.forEach((o) => {
      if (len(o.text) < DRAFT_LIMITS.outcome[0] || len(o.text) > DRAFT_LIMITS.outcome[1]) out.push(`What happens after answer ${n} should be ${DRAFT_LIMITS.outcome[0]} to ${DRAFT_LIMITS.outcome[1]} letters.`);
      if (!Number.isFinite(o.money) || Math.abs(o.money) > DRAFT_LIMITS.money) out.push(`Answer ${n}: money can be at most 2 times the amount either way.`);
      if (!Number.isFinite(o.rep) || Math.abs(o.rep) > DRAFT_LIMITS.rep || Math.round(o.rep) !== o.rep) out.push(`Answer ${n}: reputation can be −3 to 3.`);
      if (!Number.isFinite(o.chance) || o.chance < 1 || o.chance > 3) out.push(`Answer ${n}: how likely is 1 to 3.`);
      if (o.money !== 0 && d.ask === "none") out.push(`Answer ${n} moves money, but the moment has no amount: choose how much money is in it.`);
    });
  });
  if (all.some((t) => /\{ask\}/.test(t)) && d.ask === "none") out.push("You used {ask}, but the moment has no amount.");
  if (all.some((t) => /\{(?!name\}|ask\}|place\})[^}]*\}/.test(t))) out.push("Only {name}, {ask} and {place} can be filled in.");
  if (all.some((t) => LINK.test(t))) out.push("No links, handles or phone numbers.");
  if (all.some((t) => BAD.test(t))) out.push("Keep it clean: no insults or slurs.");
  // Every moment needs a way out that doesn't cost anything.
  if (d.choices.length && !d.choices.some((c) => c.outcomes.every((o) => o.money >= 0))) out.push("At least one answer should cost nothing.");
  return [...new Set(out)];
}

/** An approved draft as a moment like any other ("w_" and its number), by its author. */
export function draftToMoment(id: number, d: Draft, by: string): MomentDef {
  const ask = WRITE_ASKS[d.ask];
  return {
    id: `w_${id}`,
    spots: [d.spot],
    ask: ask ? [ask[0], ask[1]] : undefined,
    emoji: d.emoji,
    title: d.title.trim(),
    text: [d.text.trim()],
    by,
    choices: d.choices.map((c) => ({
      label: c.label.trim(),
      tone: "calm",
      outcomes: c.outcomes.map((o) => ({
        text: o.text.trim(),
        chance: o.chance,
        ...(o.money < 0 ? { pay: -o.money } : o.money > 0 ? { get: o.money } : {}),
        ...(o.rep ? { rep: o.rep } : {}),
      })),
    })),
  };
}

/** An empty draft to start the form with. */
export const emptyDraft = (): Draft => ({
  title: "",
  emoji: "✨",
  spot: "street",
  ask: "small",
  text: "",
  choices: [
    { label: "", outcomes: [{ text: "", money: 0, rep: 0, chance: 1 }] },
    { label: "", outcomes: [{ text: "", money: 0, rep: 0, chance: 1 }] },
  ],
});
