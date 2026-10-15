// Kept apart from the advertising panel, so opening it from anywhere doesn't load the panel itself.

/** Opens the advertising panel from anywhere in the game (a billboard, a building, a menu). */
export function openAdvertise(building?: string) {
  window.dispatchEvent(new CustomEvent("nt-advertise", { detail: { building: building ?? null } }));
}
