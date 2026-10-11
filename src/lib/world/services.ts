// Services between people (docs/SERVICES.md). Players who own property can offer services; anyone
// living in the city can book one or post a request saying what they need and what they'll pay.
//
// - In-game services (a home makeover, personal training, a party...) are paid in mint inside the
//   game: the price is held when booked and paid to the provider when the buyer confirms it's done
//   (or by itself 6 hours after the provider marks it done), less VAT. They do something for you.
// - Real-life services (a barber, a plumber, a photographer...) are only listed here: people agree
//   and pay outside the game, and the game shows how to reach each other.

export type ServiceKind = "game" | "real";

export type GameService = { id: string; label: string; what: string; body?: number; mind?: number };

/** In-game services and what one does for the buyer when it's done. */
export const GAME_SERVICES: GameService[] = [
  { id: "home", label: "Home makeover", what: "Arranging and decorating someone's home", mind: 5 },
  { id: "fitness", label: "Personal training", what: "A training session", body: 5 },
  { id: "party", label: "Party planning", what: "Throwing a party for someone", mind: 8 },
  { id: "styling", label: "Styling and make-up", what: "A new look for an occasion", mind: 4 },
  { id: "tutoring", label: "Tutoring", what: "Help with a course or skill", mind: 3 },
  { id: "other", label: "Something else", what: "Anything else in the game" },
];

/** Real-life services (agreed and paid outside the game). */
export const REAL_SERVICES = [
  "Hair and beauty",
  "Repairs and plumbing",
  "Electrical",
  "Cleaning",
  "Tutoring",
  "Photography",
  "Catering",
  "Tech and phones",
  "Transport",
  "Something else",
] as const;

export const gameService = (id: string) => GAME_SERVICES.find((s) => s.id === id);

/** VAT on in-game services (paid by the provider out of the price, into the treasuries). */
export const SERVICE_VAT = 0.075;
/** Hours after the provider marks a job done before the money goes to them by itself. */
export const AUTO_RELEASE_HOURS = 6;
/** Offers each provider can have open at once. */
export const MAX_OFFERS = 5;

export type ServiceOffer = {
  id: string;
  kind: ServiceKind;
  category: string;
  title: string;
  about: string;
  /** Mint (in-game) or naira (real life). */
  price: number;
  area: string;
  phone: string | null;
  whatsapp: string | null;
  provider: string;
  mine: boolean;
};

export type ServiceRequest = {
  id: string;
  kind: ServiceKind;
  category: string;
  title: string;
  about: string;
  /** What they'll pay: mint (in-game) or naira (real life). */
  budget: number;
  area: string;
  phone: string | null;
  whatsapp: string | null;
  by: string;
  mine: boolean;
  status: "open" | "taken" | "closed";
};

export type ServiceJob = {
  id: string;
  title: string;
  category: string;
  price: number;
  status: "held" | "done" | "paid" | "refunded";
  /** You're the buyer (true) or the provider (false). */
  buying: boolean;
  other: string;
  doneAt: string | null;
  createdAt: string;
};

export type ServiceBoard = { offers: ServiceOffer[]; requests: ServiceRequest[]; jobs: ServiceJob[]; canOffer: boolean };

/** What someone fills in to offer a service or post a request. */
export type ServiceForm = { kind: ServiceKind; category: string; title: string; about: string; price: number; area: string; phone?: string; whatsapp?: string };

/** Tidy and check a form; an error message when it isn't right. */
export function checkServiceForm(f: ServiceForm): string | null {
  if (f.kind !== "game" && f.kind !== "real") return "Pick in-game or real life.";
  const cats: readonly string[] = f.kind === "game" ? GAME_SERVICES.map((s) => s.id) : REAL_SERVICES;
  if (!cats.includes(f.category)) return "Pick a kind of service.";
  if ((f.title ?? "").trim().length < 3 || f.title.trim().length > 60) return "A title of 3 to 60 characters, please.";
  if ((f.about ?? "").trim().length < 10 || f.about.trim().length > 300) return "Say a little more (10 to 300 characters).";
  if (!(Number(f.price) > 0)) return "Add a price.";
  if (f.kind === "game" && f.price > 100_000) return "In-game services can't cost more than ₥100,000.";
  if (f.kind === "real" && f.price > 50_000_000) return "That price looks too high.";
  if ((f.area ?? "").trim().length < 2 || f.area.trim().length > 60) return "Say where (an area of Lagos).";
  const phoneOk = (p?: string) => !p || /^[+\d][\d\s()-]{6,}$/.test(p);
  if (!phoneOk(f.phone) || !phoneOk(f.whatsapp)) return "That phone number doesn't look right.";
  if (f.kind === "real" && !f.phone && !f.whatsapp) return "Add a phone or WhatsApp number so people can reach you.";
  return null;
}
