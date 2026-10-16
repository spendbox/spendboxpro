// The Spirit Realm (docs/REALM.md): the fighters you can buy for a battle, the weapon and armour
// upgrades, and what an army costs. Money is in mint, like everywhere in the game (₥1 is ₦1,500
// in Lagos). Shared by the server (prices, the result) and the phones (the shop, the battle).

/** Kinds of being. Each is strong or weak against the others (see COUNTER). */
export type Nature = "body" | "spirit" | "holy" | "dark";

export type FighterId = "soldier" | "archer" | "wolf" | "ghost" | "angel" | "devil" | "giant" | "dragon";

export type Fighter = {
  id: FighterId;
  name: string;
  /** One line for the shop. */
  blurb: string;
  nature: Nature;
  /** Price of one, in mint. */
  cost: number;
  /** Health of one. */
  hp: number;
  /** Damage one does each second. */
  atk: number;
  /** How far it hits from (the arena is 200 across). */
  range: number;
  /** How fast it moves (arena units a second). */
  speed: number;
  /** Its colour in the shop and the battle. */
  colour: string;
};

/** In the order the shop shows them (cheapest first). This order is also the battle's order: never reorder, only add at the end. */
export const FIGHTERS: readonly Fighter[] = [
  { id: "soldier", name: "Soldier", blurb: "Cheap and steady. Weak against ghosts.", nature: "body", cost: 2, hp: 40, atk: 6, range: 2, speed: 6, colour: "#6b8f3a" },
  { id: "archer", name: "Archer", blurb: "Hits from far away, but falls fast.", nature: "body", cost: 3, hp: 35, atk: 10, range: 16, speed: 5, colour: "#a0703c" },
  { id: "wolf", name: "Spirit wolf", blurb: "The fastest. First into every fight.", nature: "body", cost: 4, hp: 60, atk: 12, range: 2, speed: 12, colour: "#8aa4c8" },
  { id: "ghost", name: "Ghost", blurb: "Swords pass through it. Fears angels.", nature: "spirit", cost: 6, hp: 60, atk: 14, range: 3, speed: 8, colour: "#c9d6ff" },
  { id: "angel", name: "Angel", blurb: "Flies in with holy light. Devils' doom.", nature: "holy", cost: 12, hp: 180, atk: 40, range: 10, speed: 10, colour: "#ffd65a" },
  { id: "devil", name: "Devil", blurb: "Burns through soldiers and angels alike.", nature: "dark", cost: 12, hp: 200, atk: 40, range: 3, speed: 7, colour: "#e5484d" },
  { id: "giant", name: "Giant", blurb: "Slow, huge, takes a beating.", nature: "body", cost: 25, hp: 1000, atk: 35, range: 4, speed: 3.5, colour: "#9a7b5f" },
  { id: "dragon", name: "Dragon", blurb: "Breathes fire on whole crowds.", nature: "dark", cost: 40, hp: 1200, atk: 75, range: 12, speed: 11, colour: "#7c3aed" },
];

export const fighterById = (id: string) => FIGHTERS.find((f) => f.id === id) ?? null;

/** How hard each nature hits each other nature (1 is normal). */
export const COUNTER: Record<Nature, Record<Nature, number>> = {
  body: { body: 1, spirit: 0.5, holy: 1, dark: 1 },
  spirit: { body: 1.5, spirit: 1, holy: 0.5, dark: 1 },
  holy: { body: 1, spirit: 2, holy: 1, dark: 1.75 },
  dark: { body: 1.25, spirit: 1, holy: 1.5, dark: 1 },
};

/** Weapon and armour levels: what each level costs (in all, from none) and what it adds. */
export const UPGRADE_MAX = 3;
export const UPGRADE_COST = [0, 25, 75, 160] as const;
export const UPGRADE_NAMES = { weapons: ["Bare hands", "Iron", "Silver", "Holy fire"], armour: ["None", "Leather", "Chain", "Blessed plate"] } as const;
/** Each weapon level: +20% damage. Each armour level: +20% health. */
export const upgradeBoost = (level: number) => 1 + 0.2 * Math.max(0, Math.min(UPGRADE_MAX, Math.floor(level)));

/** Most of one kind of fighter in an army, most fighters in all, and most an army can cost. */
export const MAX_OF_KIND = 100;
export const MAX_FIGHTERS = 300;
export const MAX_SPEND = 3000;

export type Army = {
  /** How many of each fighter (kinds left out: none). */
  fighters: Partial<Record<FighterId, number>>;
  weapons: number;
  armour: number;
};

/** An army as typed in (from a phone): whole numbers, known fighters, in bounds. Null if it's empty or too big. */
export function cleanArmy(raw: unknown): Army | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { fighters?: unknown; weapons?: unknown; armour?: unknown };
  const fighters: Partial<Record<FighterId, number>> = {};
  let total = 0;
  const given = r.fighters && typeof r.fighters === "object" ? (r.fighters as Record<string, unknown>) : {};
  for (const f of FIGHTERS) {
    const n = Math.floor(Number(given[f.id] ?? 0));
    if (!Number.isFinite(n) || n < 0 || n > MAX_OF_KIND) return null;
    if (n > 0) fighters[f.id] = n;
    total += n;
  }
  if (total < 1 || total > MAX_FIGHTERS) return null;
  const level = (v: unknown) => {
    const n = Math.floor(Number(v ?? 0));
    return Number.isFinite(n) ? Math.max(0, Math.min(UPGRADE_MAX, n)) : 0;
  };
  const army = { fighters, weapons: level(r.weapons), armour: level(r.armour) };
  return armyCost(army) <= MAX_SPEND ? army : null;
}

/** What an army costs in mint: its fighters and its upgrades. */
export function armyCost(a: Army) {
  let sum = 0;
  for (const f of FIGHTERS) sum += (a.fighters[f.id] ?? 0) * f.cost;
  return sum + UPGRADE_COST[a.weapons] + UPGRADE_COST[a.armour];
}

/** How many fighters in an army. */
export const armySize = (a: Army) => FIGHTERS.reduce((s, f) => s + (a.fighters[f.id] ?? 0), 0);
