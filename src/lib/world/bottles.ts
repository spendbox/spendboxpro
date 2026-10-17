// Bottle service in a club (docs/CLUBS.md): champagne, cognac and tequila at real Lagos club prices
// (the big Victoria Island clubs charge more), brought to your table by a line of hostesses holding
// the bottles up with sparklers, one carrying a light-up sign with your name, for the whole club to
// see. The server works out the bill from this list, never from the phone.

/** How a bottle looks: its glass, its label, and the shape (a champagne bottle, a squat cognac, a tall tequila). */
export type BottleLook = { glass: number; label: number; shape: "champagne" | "cognac" | "tequila" | "big" };

export type Bottle = {
  id: string;
  name: string;
  blurb: string;
  /** Naira, at an ordinary club (a ₦10m-door club charges more: bottleLevel). */
  naira: number;
  look: BottleLook;
};

export const BOTTLES: Bottle[] = [
  { id: "belaire", name: "Belaire Rosé", blurb: "Pink, sweet and loud. The party starter.", naira: 250_000, look: { glass: 0x1a1a1a, label: 0xf783ac, shape: "champagne" } },
  { id: "hennessy_vs", name: "Hennessy VS", blurb: "The cognac every table knows.", naira: 300_000, look: { glass: 0x6b3a1e, label: 0xe9dcc4, shape: "cognac" } },
  { id: "moet", name: "Moët & Chandon Impérial", blurb: "The classic bottle of bubbles.", naira: 450_000, look: { glass: 0x1f3d2b, label: 0xf8f4ec, shape: "champagne" } },
  { id: "martell_blue_swift", name: "Martell Blue Swift", blurb: "Smooth cognac in a blue-labelled bottle.", naira: 450_000, look: { glass: 0x5c3317, label: 0x1c4e9a, shape: "cognac" } },
  { id: "veuve", name: "Veuve Clicquot", blurb: "That famous yellow label.", naira: 500_000, look: { glass: 0x1f3d2b, label: 0xf2a900, shape: "champagne" } },
  { id: "moet_rose", name: "Moët Nectar Impérial Rosé", blurb: "Sweeter, pinker, fancier.", naira: 550_000, look: { glass: 0x1a1a1a, label: 0xf06595, shape: "champagne" } },
  { id: "hennessy_vsop", name: "Hennessy VSOP", blurb: "Older, rounder, a step up.", naira: 600_000, look: { glass: 0x6b3a1e, label: 0x343a40, shape: "cognac" } },
  { id: "hennessy_xo", name: "Hennessy XO", blurb: "The big cognac. People notice.", naira: 1_800_000, look: { glass: 0x4a2c17, label: 0xc9a227, shape: "cognac" } },
  { id: "don_julio_1942", name: "Don Julio 1942", blurb: "The tall tequila bottle everyone films.", naira: 2_500_000, look: { glass: 0xd9c08a, label: 0xc9a227, shape: "tequila" } },
  { id: "dom_perignon", name: "Dom Pérignon", blurb: "Quiet money in a bottle.", naira: 2_500_000, look: { glass: 0x1f3d2b, label: 0xc9a227, shape: "champagne" } },
  { id: "clase_azul", name: "Clase Azul Reposado", blurb: "The painted tequila bottle. A show on its own.", naira: 3_000_000, look: { glass: 0xf8f9fa, label: 0x1c7ed6, shape: "tequila" } },
  { id: "ace_of_spades", name: "Ace of Spades Gold", blurb: "Armand de Brignac: the gold bottle. The whole club turns round.", naira: 5_000_000, look: { glass: 0xd4a017, label: 0xd4a017, shape: "champagne" } },
  { id: "ace_of_spades_rose", name: "Ace of Spades Rosé", blurb: "The pink gold bottle. Even louder.", naira: 6_000_000, look: { glass: 0xe599b5, label: 0xd4a017, shape: "champagne" } },
  { id: "ace_jeroboam", name: "Ace of Spades Jeroboam (3 L)", blurb: "Four bottles in one giant gold bottle. You are the night.", naira: 30_000_000, look: { glass: 0xd4a017, label: 0xd4a017, shape: "big" } },
];

export const BOTTLE_BY_ID = new Map(BOTTLES.map((b) => [b.id, b]));

/** At most this many bottles in one order (one line of hostesses). */
export const BOTTLES_MAX = 6;

/** How much dearer bottles are at this club, by its price at the door (naira): the ₦10m clubs 1.5×, VIP clubs 1.2×. */
export function bottleLevel(doorNaira: number) {
  return doorNaira >= 10_000_000 ? 1.5 : doorNaira >= 1_000_000 ? 1.2 : 1;
}

/** The bill in naira for these bottles at a club with this door price (null if an id is unknown or there are too many). */
export function bottlesNaira(ids: string[], doorNaira: number): number | null {
  if (!Array.isArray(ids) || !ids.length || ids.length > BOTTLES_MAX) return null;
  let total = 0;
  for (const id of ids) {
    const b = BOTTLE_BY_ID.get(id);
    if (!b) return null;
    total += b.naira;
  }
  return Math.round(total * bottleLevel(doorNaira));
}

/** "2 × Moët & Chandon Impérial and Hennessy XO", for the club's news. */
export function bottleWords(ids: string[]) {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const parts = [...counts].map(([id, k]) => `${k > 1 ? `${k} × ` : ""}${BOTTLE_BY_ID.get(id)?.name ?? "a bottle"}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "bottles");
}
