// The street and dating (docs/STREET.md, docs/DATING.md): what stealing, fines, bribes and pranks
// cost, and what each dating moment is. Chances are rolled by the database (game-db/055_street.sql,
// 056_dating.sql); prices here are in naira and turned into mint with the region's prices.

/** Picking a pocket: at most this much cash, or failing that a small thing worth at most this. */
export const PICK_CASH_MAX = 20_000;
export const PICK_ITEM_MAX = 50_000;
/** Caught picking a pocket: the fine. */
export const PICK_FINE = 30_000;
/** Caught shoplifting or pickpocketing: about how likely, before who you're robbing changes it. */
export const PICK_CATCH = 0.35;
/** A bribe to get out of jail (it works about 7 times in 10; the money's gone either way). */
export const BRIBE = 25_000;

export type PrankId = "eggs" | "toilet_paper" | "glitter" | "fake_parcel" | "stickers" | "air_horn";
export const PRANKS: { id: PrankId; label: string; emoji: string; price: number; did: string }[] = [
  { id: "eggs", label: "Egg their door", emoji: "🥚", price: 2_000, did: "egged your door" },
  { id: "toilet_paper", label: "Toilet-paper the house", emoji: "🧻", price: 3_000, did: "covered your house in toilet paper" },
  { id: "glitter", label: "Glitter bomb", emoji: "✨", price: 5_000, did: "left a glitter bomb at your door" },
  { id: "fake_parcel", label: "Fake parcel", emoji: "📦", price: 2_000, did: "left you a parcel... full of packing peanuts" },
  { id: "stickers", label: "Sticker the gate", emoji: "🌟", price: 1_000, did: "covered your gate in stickers" },
  { id: "air_horn", label: "Air horn at dawn", emoji: "📯", price: 1_500, did: "set off an air horn at your door" },
];
export const prankOf = (id: string | null | undefined) => PRANKS.find((p) => p.id === id);

export type DateAct = "date" | "hug" | "kiss" | "make_out" | "make_out_plus";
/** What each ask is, and what's shown when the answer is yes (more than a kiss fades to black). */
export const DATE_ACTS: { act: DateAct; label: string; ask: string; yes: string }[] = [
  { act: "date", label: "Ask on a date", ask: "asked you out on a date", yes: "You're dating now. Take it slow and be kind." },
  { act: "hug", label: "Hug", ask: "wants a hug", yes: "A long, warm hug." },
  { act: "kiss", label: "Kiss", ask: "wants to kiss you", yes: "A kiss. Butterflies." },
  { act: "make_out", label: "Make out", ask: "wants to make out", yes: "Things got steamy for a while." },
  { act: "make_out_plus", label: "Make out ++", ask: "wants to take things further tonight", yes: "The lights went out. What happens next stays between you two." },
];
export const dateAct = (act: string) => DATE_ACTS.find((d) => d.act === act);
