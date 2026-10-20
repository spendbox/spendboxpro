// Lite mode (docs/LITE.md): the game without the 3D city, built round chat. Which one a phone
// opens in is remembered on it; ?lite=1 or ?lite=0 in the address picks one (and is remembered).
// Read with useSyncExternalStore(subscribeLite, liteSnapshot, liteServer): null on the server, so
// the city never starts loading before the phone has said it isn't in Lite.

const KEY = "nt-lite";
const OFFERED = "nt-lite-offered";

let current: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get("lite");
    if (asked === "1" || asked === "0") {
      localStorage.setItem(KEY, asked);
      return asked === "1";
    }
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function liteSnapshot(): boolean {
  if (current === null) current = read();
  return current;
}
export const liteServer = (): boolean | null => null;
export function subscribeLite(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Switch Lite on or off (and remember it on this phone). */
export function setLite(on: boolean) {
  current = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
    localStorage.setItem(OFFERED, "1");
  } catch {}
  for (const l of listeners) l();
}

/** The "Try Lite" note in the world: shown until Lite is tried or the note put away. */
export function liteOffered(): boolean {
  try {
    return !!localStorage.getItem(OFFERED) || localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function markLiteOffered() {
  try {
    localStorage.setItem(OFFERED, "1");
  } catch {}
}

export type LiteTab = "chats" | "events" | "people" | "wallet";
