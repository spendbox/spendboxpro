// Reputation levels (docs/REPUTATION.md): the higher your reputation, the bigger your level, and
// each level takes something off every property you buy from the city. (Each level takes twice
// the reputation it first did: 40, 100, 200, 360, 600.)

export type RepLevel = { at: number; name: string; emoji: string; discount: number };

export const REP_LEVELS: RepLevel[] = [
  { at: 0, name: "New in town", emoji: "🌱", discount: 0 },
  { at: 40, name: "Familiar face", emoji: "👋", discount: 0.02 },
  { at: 100, name: "Rising star", emoji: "⭐", discount: 0.04 },
  { at: 200, name: "Big deal", emoji: "😎", discount: 0.07 },
  { at: 360, name: "Local legend", emoji: "🏅", discount: 0.1 },
  { at: 600, name: "City icon", emoji: "👑", discount: 0.15 },
];

/** Your level for a reputation score, the next one up, and how far along you are to it (0..1). */
export function repLevel(score: number) {
  const s = Math.max(0, Math.floor(score || 0));
  let i = 0;
  while (i + 1 < REP_LEVELS.length && s >= REP_LEVELS[i + 1].at) i++;
  const level = REP_LEVELS[i];
  const next = REP_LEVELS[i + 1] ?? null;
  const progress = next ? (s - level.at) / (next.at - level.at) : 1;
  return { level, next, index: i, progress: Math.max(0, Math.min(1, progress)) };
}

/** What a property from the city costs you (mint), with your level's discount. */
export function discounted(mint: number, score: number) {
  const d = repLevel(score).level.discount;
  return Math.max(0.01, Math.round(mint * (1 - d) * 100) / 100);
}
