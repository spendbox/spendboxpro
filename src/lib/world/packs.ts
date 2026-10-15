// How a life on the real map can start (docs/PACKS.md): free with ₦2,000,000 and a free home, or with a
// starter pack bought once, in your first 72 hours (game-db/105), through Paystack: it raises your starting
// money to ₦20m, ₦80m or ₦300m (with things to own and, for the bigger ones, a furnished home). Packs are
// paid like top-ups (src/app/play/topup-actions.ts, game-db/090). Mint is never turned back into cash.

export type Pack = {
  id: "free" | "starter" | "bigboy" | "odogwu";
  label: string;
  story: string;
  /** The starting money it brings, in mint (Lagos, ₦1,500 a mint); `game` is the same in naira. */
  mint: number;
  game: number;
  /** What it costs, in real naira. */
  naira: number;
  what: string;
  /** What else comes with it, in words (shown on the pack). */
  perks: string[];
  /** Things from the shops given with it (SHOP ids in ./items). */
  gifts: string[];
  /** The first home comes furnished: on one floor, or on two with a dance hall. */
  furnished?: "home" | "dancehall";
};

// Rich Family is ₦300m of game money to start with (200,000 mint at ₦1,500 a mint in Lagos). Paid packs bring
// more than money: things to own, a furnished home, a car (perks, not just more mint, so prices
// keep meaning something for everyone).
export const PACKS: Pack[] = [
  // The ids are stored with payments: rename the labels freely, never the ids.
  { id: "free", label: "The Hustler", story: "Start from scratch", mint: 1_333.33, game: 2_000_000, naira: 0, what: "A free home to live in, and ₦2,000,000 to start", perks: [], gifts: [] },
  {
    id: "starter",
    label: "Uncle Abroad",
    story: "Family sent something small",
    mint: 13_333.33,
    game: 20_000_000,
    naira: 1_000,
    what: "Start with ₦20,000,000",
    perks: ["A new smartphone and designer sneakers, sent from abroad"],
    gifts: ["smartphone", "sneakers"],
  },
  {
    id: "bigboy",
    label: "Comfortable Home",
    story: "Your parents helped you settle",
    mint: 53_333.33,
    game: 80_000_000,
    naira: 2_500,
    what: "Start with ₦80,000,000",
    perks: ["Your first home comes fully furnished", "A laptop, a wristwatch and a generator"],
    gifts: ["laptop", "wristwatch", "generator"],
    furnished: "home",
  },
  {
    id: "odogwu",
    label: "Rich Family",
    story: "Born into money",
    mint: 200_000,
    game: 300_000_000,
    naira: 5_000,
    what: "Start with ₦300,000,000",
    perks: ["A Toyota Camry", "Your first home furnished: two floors, with its own dance hall", "A gold chain and a luxury watch", "A Rich Family badge on your profile"],
    gifts: ["car_camry", "gold_chain", "luxury_watch"],
    furnished: "dancehall",
  },
];

export const packById = (id: string) => PACKS.find((p) => p.id === id);

/** The packs on sale (the free start left out). */
export const PAID_PACKS = PACKS.filter((p) => p.naira > 0);
