"use client";

import { useSyncExternalStore } from "react";
import type { QuestState } from "@/lib/quests";

// The player's side quest, shared by every part of the screen (the banner, the quest card,
// the mini games). useQuestTracker keeps it up to date with the server; mini games report what
// happens with questEvent().

/** Things that can move a quest along. */
export type QuestEvent =
  | { type: "visit"; room: string; kind?: string }
  | { type: "sit" }
  | { type: "stand" }
  | { type: "talk_npc"; npc?: string }
  | { type: "ride"; kind: string; room?: string }
  | { type: "play"; game: string; won?: boolean; score?: number }
  | { type: "order"; where?: "restaurant" | "bar"; room?: string }
  | { type: "spray"; amount?: number }
  | { type: "gift"; amount?: number }
  | { type: "greet" }
  | { type: "search" }
  | { type: "sweep" }
  | { type: "event" };

type Snapshot = {
  quest: QuestState | null;
  /** A quest that just arrived (show it big once). */
  fresh: QuestState | null;
  /** A quest that was just finished (celebrate it once). */
  finished: QuestState | null;
};

let snap: Snapshot = { quest: null, fresh: null, finished: null };
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: QuestEvent) => void>();
const refreshers = new Set<() => void>();

function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  for (const l of listeners) l();
}

/** Replace the quest (from the server). */
export function setQuest(quest: QuestState | null, how: { fresh?: boolean; finished?: boolean } = {}) {
  emit({
    quest,
    fresh: how.fresh && quest ? quest : snap.fresh && quest && snap.fresh.id === quest.id ? snap.fresh : null,
    finished: how.finished && quest ? quest : snap.finished,
  });
}

/** The "new quest" or "quest done" pop-up was seen. */
export function clearQuestFlash() {
  emit({ fresh: null, finished: null });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The side quest right now (updates live). */
export function useQuestSnapshot() {
  return useSyncExternalStore(
    subscribe,
    () => snap,
    () => snap,
  );
}

/** Tell the quest tracker something happened (mini games call this themselves). */
export function questEvent(e: QuestEvent) {
  for (const l of eventListeners) l(e);
}

export function onQuestEvent(l: (e: QuestEvent) => void) {
  eventListeners.add(l);
  return () => {
    eventListeners.delete(l);
  };
}

/** Ask the tracker to reload the quest from the server (e.g. a new one was offered). */
export function refreshQuest() {
  for (const r of refreshers) r();
}

export function onRefreshQuest(r: () => void) {
  refreshers.add(r);
  return () => {
    refreshers.delete(r);
  };
}
