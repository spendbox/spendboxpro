// How a life on the real map can start (docs/PACKS.md): free with ₥19,500, or with a starter pack
// bought once, before your first home, through Paystack (with things to own and, for the bigger
// ones, a furnished home). Mint is never turned back into cash.

export type Pack = {
  id: "free" | "starter" | "bigboy" | "odogwu";
  label: string;
  story: string;
  mint: number;
  naira: number;
  what: string;
  /** What else comes with it, in words (shown on the pack). */
  perks: string[];
  /** Things from the shops given with it (SHOP ids in ./items). */
  gifts: string[];
  /** The first home comes furnished: on one floor, or on two with a dance hall. */
  furnished?: "home" | "dancehall";
};

// Rich Family is ₦900m of game money (600,000 mint at ₦1,500 a mint in Lagos). Paid packs bring
// more than money: things to own, a furnished home, a car (perks, not just more mint, so prices
// keep meaning something for everyone).
export const PACKS: Pack[] = [
  // The ids are stored with payments: rename the labels freely, never the ids.
  { id: "free", label: "The Hustler", story: "Start from scratch", mint: 19_500, naira: 0, what: "A flat almost anywhere in Lagos", perks: [], gifts: [] },
  {
    id: "starter",
    label: "Uncle Abroad",
    story: "Family sent something small",
    mint: 78_000,
    naira: 1_000,
    what: "A house in most of Lagos, with money to spare",
    perks: ["A new smartphone and designer sneakers, sent from abroad"],
    gifts: ["smartphone", "sneakers"],
  },
  {
    id: "bigboy",
    label: "Comfortable Home",
    story: "Your parents helped you settle",
    mint: 195_000,
    naira: 2_500,
    what: "Nearly any home in Lagos",
    perks: ["Your first home comes fully furnished", "A laptop, a wristwatch and a generator"],
    gifts: ["laptop", "wristwatch", "generator"],
    furnished: "home",
  },
  {
    id: "odogwu",
    label: "Rich Family",
    story: "Born into money",
    mint: 600_000,
    naira: 7_500,
    what: "The best houses in Lagos, and money to grow",
    perks: ["A Toyota Camry", "Your first home furnished: two floors, with its own dance hall", "A gold chain and a luxury watch", "A Rich Family badge on your profile"],
    gifts: ["car_camry", "gold_chain", "luxury_watch"],
    furnished: "dancehall",
  },
];

export const packById = (id: string) => PACKS.find((p) => p.id === id);
