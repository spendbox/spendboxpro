// Is the player actually here: the game in front of them (not a hidden tab) and touched in the last
// two minutes. Everything the map asks the server for on a timer checks this first, so a phone left
// open on the table costs nothing (docs/COSTS.md). onBack runs when they come back, so what they see
// is fresh straight away.

/** No touch for this long and the game counts as left alone. */
export const IDLE_MS = 120_000;

let touched = Date.now();
let hooked = false;
const backs = new Set<() => void>();

function hook() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  const touch = () => {
    const was = here();
    touched = Date.now();
    if (!was) back();
  };
  const opts = { passive: true, capture: true } as const;
  for (const kind of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(kind, touch, opts);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    touched = Date.now();
    back();
  });
}

const here = () => document.visibilityState === "visible" && Date.now() - touched < IDLE_MS;

function back() {
  for (const fn of backs) fn();
}

/** The game is in front of the player and they've touched it lately. */
export function isHere() {
  if (typeof window === "undefined") return false;
  hook();
  return here();
}

/** Run fn whenever the player comes back (to the tab, or after leaving it alone). Returns a stop. */
export function onBack(fn: () => void) {
  hook();
  backs.add(fn);
  return () => {
    backs.delete(fn);
  };
}

/** setInterval that only runs while the player is here (and runs at once when they come back). */
export function whileHere(fn: () => void, ms: number) {
  const t = setInterval(() => isHere() && fn(), ms);
  const stop = onBack(fn);
  return () => {
    clearInterval(t);
    stop();
  };
}
