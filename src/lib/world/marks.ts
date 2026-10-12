// Marks players leave on the map (docs/MARKS.md): writing on a wall, a review of a place, a tree,
// a bench, a statue, a fountain, a plaque, or a time capsule. Shared by the server (which works
// out costs and checks the writing here) and the screens. Database: game-db/052_marks.sql.

export type MarkKind = "writing" | "review" | "tree" | "bench" | "statue" | "fountain" | "plaque" | "capsule";

/** What each kind costs (naira) and how long it stands (days; 0 for as long as people let it). */
export const MARK_KINDS: { kind: MarkKind; label: string; what: string; price: number; days: number; text: "need" | "optional" | "none" }[] = [
  { kind: "writing", label: "Writing", what: "Write anything on a wall or the pavement. Your name goes with it.", price: 0, days: 0, text: "need" },
  { kind: "review", label: "Review", what: "Stars and a few words about this place, for everyone who comes by.", price: 0, days: 0, text: "need" },
  { kind: "tree", label: "Tree", what: "Plant a tree with a dedication. Stands 30 days.", price: 20_000, days: 30, text: "optional" },
  { kind: "bench", label: "Bench", what: "A bench with your words on a little plate. Stands 30 days.", price: 50_000, days: 30, text: "optional" },
  { kind: "plaque", label: "Plaque", what: "A brass plaque on the wall: who, what, when. Stands 60 days.", price: 100_000, days: 60, text: "need" },
  { kind: "statue", label: "Statue", what: "A statue of you, with your words under it. Stands 30 days.", price: 500_000, days: 30, text: "optional" },
  { kind: "fountain", label: "Fountain", what: "A fountain for the whole street, in your name. Stands 30 days.", price: 2_000_000, days: 30, text: "optional" },
  { kind: "capsule", label: "Time capsule", what: "Bury a message (and one of your things) that opens on a date. The first to open it gets the thing.", price: 5_000, days: 0, text: "need" },
];
export const markKind = (k: string) => MARK_KINDS.find((m) => m.kind === k);

/** Colours for writing. */
export const INKS = ["#e03131", "#1971c2", "#2f9e44", "#f08c00", "#7048e8", "#212529", "#d6336c", "#ffffff"];

/** Chipping in to keep a paid mark standing: what a day costs (naira), a thirtieth of its price. */
export const dayCost = (kind: MarkKind) => Math.max(500, Math.round((markKind(kind)?.price ?? 0) / 30));

export const REACTIONS = [
  { id: "like", label: "👍" },
  { id: "laugh", label: "😂" },
  { id: "fire", label: "🔥" },
  { id: "love", label: "❤️" },
] as const;
export type Reaction = (typeof REACTIONS)[number]["id"];

/**
 * Real-world contact details aren't allowed on the map (anything else is, and players vote on it):
 * phone numbers (7+ digits, with spaces, dashes or +) and email addresses. Says what it found, or null.
 */
export function personalInfo(text: string): string | null {
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return "an email address";
  const digits = text.replace(/[\s().-]/g, "");
  if (/\+?\d{7,}/.test(digits)) return "a phone number";
  return null;
}

/** Writing tidied: one line of spaces, at most 280 letters. */
export function cleanMarkText(raw: string) {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
}
