// How a life on the real map can start (docs/PACKS.md): free with ₥5,000, or with a starter pack
// bought once, before your first home, through Paystack. Mint is never turned back into cash.

export type Pack = { id: "free" | "starter" | "bigboy" | "odogwu"; label: string; story: string; mint: number; naira: number; what: string };

export const PACKS: Pack[] = [
  // The ids are stored with payments: rename the labels freely, never the ids.
  { id: "free", label: "The Hustler", story: "Start from scratch", mint: 5_000, naira: 0, what: "A room in most of Lagos" },
  { id: "starter", label: "Uncle Abroad", story: "Family sent something small", mint: 20_000, naira: 1_000, what: "A flat in a cheaper area" },
  { id: "bigboy", label: "Comfortable Home", story: "Your parents helped you settle", mint: 50_000, naira: 2_500, what: "A good flat, or a bungalow" },
  { id: "odogwu", label: "Rich Family", story: "Born into money", mint: 100_000, naira: 7_500, what: "A house, and money to grow" },
];

export const packById = (id: string) => PACKS.find((p) => p.id === id);
