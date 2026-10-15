// What's new, in one small answer (docs/COSTS.md): the once-a-minute online ping (/api/active) also
// says the newest notice, Town Hall message and the state of the events in your city. Notices,
// the Town Hall's dot and the events list are fetched only when that changes (and at once on a
// push, or when you come back), instead of every 15 to 60 seconds each.

export type Latest = {
  /** Your newest notice's id (0: none). */
  notice: number;
  /** The newest Town Hall message's id in your city (0: none). */
  town: number;
  /** The events in your city, as a short fingerprint: it changes when one is added or called off. */
  events: string;
};

let latest: Latest | null = null;
const subs = new Set<(now: Latest, before: Latest | null) => void>();

/** A new answer from the server. */
export function setLatest(next: Latest) {
  const before = latest;
  latest = next;
  for (const fn of subs) fn(next, before);
}

/** Hear every new answer (with the one before it). Returns a stop. */
export function onLatest(fn: (now: Latest, before: Latest | null) => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
