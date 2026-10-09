"use client";

import { useSyncExternalStore } from "react";
import { loadLevel, type LevelInfo } from "../profile-actions";
import { loadLeaderboard, loadMyRecord, type Leaderboard, type MyRecord } from "./actions";

// Small in-memory caches for the menu. Nothing is fetched until something asks; the last
// answer is kept so reopening a sheet is instant, and it's only asked again once it's a
// minute old. Each answer is tagged with whose it is, so a different player signing in on
// the same tab never sees someone else's numbers.

/** What a screen sees: the last answer (if any), and whether a fresh one is coming or failed. */
export type Snap<T> = { owner: string | null; value: T | null; loading: boolean; failed: boolean };

export type Store<T> = {
  get: () => Snap<T>;
  subscribe: (onChange: () => void) => () => void;
  /** Puts an answer in directly (e.g. after levelling up, or a preview page). */
  set: (owner: string, value: T) => void;
  /** Asks the server, unless the answer we have is fresh enough. `force` always asks. */
  refresh: (owner: string, force?: boolean) => Promise<T | null>;
};

const EMPTY: Snap<never> = { owner: null, value: null, loading: false, failed: false };
const serverSnap = () => EMPTY;

function cached<T>(load: () => Promise<T | null>, maxAgeMs: number): Store<T> {
  let snap: Snap<T> = EMPTY;
  let fetchedAt = 0;
  let pending: Promise<T | null> | null = null;
  const listeners = new Set<() => void>();
  const put = (next: Snap<T>) => {
    snap = next;
    for (const l of listeners) l();
  };
  return {
    get: () => snap,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
    set(owner, value) {
      fetchedAt = Date.now();
      pending = null;
      put({ owner, value, loading: false, failed: false });
    },
    refresh(owner, force = false) {
      if (snap.owner !== owner) {
        fetchedAt = 0;
        pending = null;
        put({ ...EMPTY, owner });
      }
      if (pending && !force) return pending;
      if (!force && snap.value !== null && Date.now() - fetchedAt < maxAgeMs) return Promise.resolve(snap.value);
      put({ ...snap, loading: true, failed: false });
      const job: Promise<T | null> = load()
        .catch(() => null)
        .then((value) => {
          // A newer request (or another player) took over while this one was out.
          if (pending !== job) return value;
          pending = null;
          if (value === null) put({ ...snap, loading: false, failed: true });
          else {
            fetchedAt = Date.now();
            put({ owner, value, loading: false, failed: false });
          }
          return value;
        });
      pending = job;
      return job;
    },
  };
}

/** Reads a store for this player (empty until their own answer arrives). */
export function useStore<T>(store: Store<T>, owner: string): Snap<T> {
  const snap = useSyncExternalStore(store.subscribe, store.get, serverSnap);
  return snap.owner === owner ? snap : EMPTY;
}

/** Your level and what the next one takes: one tiny database call. */
export const levelStore = cached<LevelInfo>(() => loadLevel().then((r) => (r.ok ? r.info : null)), 60_000);
/** Your record and badges: only when the Badges sheet opens. */
export const recordStore = cached<MyRecord>(() => loadMyRecord().then((r) => (r.ok ? r : null)), 60_000);
/** The week's leaderboard: only when the Leaderboard sheet opens. */
export const leadersStore = cached<Leaderboard>(() => loadLeaderboard().then((r) => (r.ok ? r : null)), 60_000);
