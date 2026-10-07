/** Names the bot goes by, one per round (same list as the bot_names table in the database). */
export const BOT_NAMES = [
  "Shadow", "Whisper", "Ghost", "Mango", "Pixel", "Biscuit", "Nimbus", "Echo",
  "Pepper", "Rascal", "Cinder", "Juno", "Ziggy", "Pebble", "Comet", "Blink",
  "Rusty", "Velvet", "Sprout", "Domino", "Chili", "Marble", "Noodle", "Orbit",
  "Tango", "Kiwi", "Fable", "Gizmo", "Hazel", "Indigo", "Jinx", "Lotus",
  "Maverick", "Nova", "Oreo", "Puzzle", "Quill", "Ripple", "Sable", "Tofu",
  "Umber", "Vesper", "Wren", "Yoyo", "Zephyr", "Bramble", "Cobalt", "Dusk",
  "Ember", "Fizz", "Glimmer", "Hush", "Ivy", "Jasper", "Koko", "Lumen",
  "Mischief", "Nutmeg", "Onyx", "Pippin", "Quasar", "Riddle", "Sly", "Tinker",
];

/** The bot's name for a round: the one the database gave it, or one picked from the list. */
export function botNameFor(roundId: number, stored: string | null | undefined) {
  if (stored && stored !== "Seed Bot") return stored;
  return BOT_NAMES[Math.abs(roundId) % BOT_NAMES.length];
}
