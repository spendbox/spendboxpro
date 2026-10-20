"use client";

import { useSyncExternalStore } from "react";
import { MASQ_AGE_MIN, type MasqMode, type MasqSpice, type MasqWant } from "@/lib/masquerade";

// Masquerade's choices and the Open to Masquerade switch (docs/MASQUERADE.md), remembered on this
// phone. Kept apart from the Masquerade page so the game can listen for invitations without
// loading it.

/** What you'd like from a masquerade: when you mask up, and when you're asked. */
export type MasqPrefs = { mode: MasqMode; want: MasqWant; ageMin: number; ageMax: number; spice: MasqSpice };
const PREFS_KEY = "nt-masq";
const DEFAULT_PREFS: MasqPrefs = { mode: "friends", want: "anyone", ageMin: MASQ_AGE_MIN, ageMax: 40, spice: 1 };
export function loadMasqPrefs(): MasqPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<MasqPrefs> | null;
    return { ...DEFAULT_PREFS, ...(p ?? {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function saveMasqPrefs(p: MasqPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {}
  tell();
}

/** Open to Masquerade: playing or chatting as usual, and a pop-up when someone masked is looking. */
const OPEN_KEY = "nt-masq-open";
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const openNow = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};
export function useMasqOpen() {
  return useSyncExternalStore(subscribe, openNow, () => false);
}
export function setMasqOpenSwitch(on: boolean) {
  try {
    if (on) localStorage.setItem(OPEN_KEY, "1");
    else localStorage.removeItem(OPEN_KEY);
  } catch {}
  tell();
}
/** Something changed (the switch or the choices): whoever's listening looks again. */
export const onMasqPrefs = subscribe;
