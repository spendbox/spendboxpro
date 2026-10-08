"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  QUEST_BY_KEY,
  placeKindOf,
  rideKindOf,
  type QuestPlace,
  type QuestState,
  type QuestStep,
} from "@/lib/quests";
import { myQuest, offerQuest, reportQuest } from "../quest-actions";
import { buildingOf } from "../rooms";
import { clearQuestFlash, onQuestEvent, onRefreshQuest, setQuest, useQuestSnapshot, type QuestEvent } from "./quest-store";

// Keeps the player's side quest up to date: loads it, asks for new ones now and then (sitting
// down makes one much more likely), turns what the player does into quest progress and
// reports it to the server (bundled up, a few seconds apart; the server has the final say).

const PLACES: QuestPlace[] = ["lobby", "floor", "roof", "balloon", "vehicle"];
/** Seconds of sitting before we ask for a seat quest. */
const SEAT_OFFER_AFTER = 6;
/** How often a surprise quest is rolled for (the server decides; 3% a roll). */
const RANDOM_OFFER_MS = 3 * 60_000;

type Seen = Record<number, string[]>;

function loadSeen(questId: number): Seen {
  try {
    const raw = sessionStorage.getItem(`quest-seen:${questId}`);
    return raw ? (JSON.parse(raw) as Seen) : {};
  } catch {
    return {};
  }
}

function saveSeen(questId: number, seen: Seen) {
  try {
    sessionStorage.setItem(`quest-seen:${questId}`, JSON.stringify(seen));
  } catch {
    // Private mode: progress still counts, only the "already visited" memory is lost.
  }
}

const asPlace = (kind: string | undefined, room: string | undefined): QuestPlace | null =>
  kind && (PLACES as string[]).includes(kind) ? (kind as QuestPlace) : placeKindOf(room);

/** How a single event moves each step of the quest: [step index, amount, distinct key?]. */
function matches(steps: QuestStep[], e: QuestEvent): [number, number, string | null][] {
  const out: [number, number, string | null][] = [];
  steps.forEach((s, i) => {
    switch (e.type) {
      case "visit": {
        const kind = asPlace(e.kind, e.room);
        if (s.type === "visit_kind" && kind === s.kind) out.push([i, 1, e.room]);
        if (s.type === "visit_rooms") out.push([i, 1, e.room]);
        if (s.type === "visit_buildings" && e.room.startsWith("b:")) out.push([i, 1, buildingOf(e.room)]);
        break;
      }
      case "talk_npc":
        if (s.type === "talk_npcs") out.push([i, 1, e.npc ?? null]);
        break;
      case "ride": {
        const kind = rideKindOf(e.room ?? null, e.kind);
        if (s.type === "ride_kind" && kind && (s.kind === "any" || s.kind === kind)) out.push([i, 1, e.room ?? null]);
        break;
      }
      case "play":
        if (s.type === "play_game" && (!s.game || s.game === e.game) && (!s.minScore || (e.score ?? 0) >= s.minScore)) out.push([i, 1, null]);
        if (s.type === "win_duel" && e.won && (!s.game || s.game === e.game)) out.push([i, 1, null]);
        break;
      case "order":
        if (s.type === "order_food" && (!s.where || !e.where || s.where === e.where)) out.push([i, 1, e.room ?? null]);
        break;
      default:
        break;
    }
  });
  return out;
}

/**
 * The side quest tracker. Call it once (in the game screen) and pass what it can't see:
 *   room:    the place you're in (rooms.myRoom), so visits and rides count by themselves;
 *   seated:  whether you're sitting (!!rooms.mySeat): sitting counts time and makes a quest
 *            much more likely;
 *   hiding:  true for a ghost still hidden in a running hunt (counts "stay hidden" time);
 *   signedIn: false for watchers (nothing happens).
 * Then call track(...) for things that happen elsewhere: talking to a regular
 * ({ type: "talk_npc", npc }), searching ({ type: "search" }), sending the drone
 * ({ type: "sweep" }), grabbing an event reward ({ type: "event" }). Mini games, ordering,
 * spraying and gifts report themselves.
 */
export function useQuestTracker(opts: { room?: string | null; seated?: boolean; hiding?: boolean; signedIn?: boolean } = {}) {
  const { quest, fresh, finished } = useQuestSnapshot();
  const signedIn = opts.signedIn ?? true;
  const questRef = useRef<QuestState | null>(quest);
  const pending = useRef<Record<number, number>>({});
  const seen = useRef<{ id: number; seen: Seen } | null>(null);
  const seatedManual = useRef(false);
  const ctx = useRef({ room: opts.room ?? null, seated: !!opts.seated, hiding: !!opts.hiding, signedIn });
  const busy = useRef(false);
  const refreshTimer = useRef<number | null>(null);
  useEffect(() => {
    questRef.current = quest;
    ctx.current = { room: opts.room ?? null, seated: opts.seated ?? seatedManual.current, hiding: !!opts.hiding, signedIn };
  });

  const load = useCallback(async (how: { fresh?: boolean } = {}) => {
    if (!ctx.current.signedIn) return;
    const res = await myQuest();
    if (!res.ok) return;
    const before = questRef.current;
    const q = res.quest;
    const justFinished = !!q && q.status === "done" && before?.id === q.id && before.status === "active";
    questRef.current = q;
    setQuest(q, { fresh: how.fresh && !!q && q.status === "active", finished: justFinished });
  }, []);

  /** Reload soon (several calls in a row make one). */
  const loadSoon = useCallback(
    (ms = 1500) => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void load(), ms);
    },
    [load],
  );

  const offer = useCallback(
    async (source: "seat" | "random") => {
      if (!ctx.current.signedIn || questRef.current?.status === "active") return;
      const res = await offerQuest(source);
      if (res.ok && res.quest) await load({ fresh: true });
    },
    [load],
  );

  // First load, then every 30 s while a quest is on (to catch steps the server counts).
  const active = quest?.status === "active";
  useEffect(() => {
    if (!signedIn) return;
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), active ? 30_000 : 120_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [signedIn, active, load]);

  // Other parts of the screen can ask for a reload (a quest offered by a regular or a waiter).
  useEffect(() => onRefreshQuest(() => void load({ fresh: true })), [load]);

  // A surprise quest now and then.
  useEffect(() => {
    if (!signedIn || active) return;
    const id = window.setInterval(() => void offer("random"), RANDOM_OFFER_MS);
    return () => window.clearInterval(id);
  }, [signedIn, active, offer]);

  /** Add progress to a step (counts wait for the next report; distinct things count once). */
  const add = useCallback((step: number, amount: number, key: string | null) => {
    const q = questRef.current;
    if (!q || q.status !== "active") return;
    if ((q.progress[step] ?? 0) + (pending.current[step] ?? 0) >= (q.targets[step] ?? 0)) return;
    if (key) {
      if (seen.current?.id !== q.id) seen.current = { id: q.id, seen: loadSeen(q.id) };
      const list = seen.current.seen[step] ?? [];
      if (list.includes(key)) return;
      seen.current.seen[step] = [...list, key];
      saveSeen(q.id, seen.current.seen);
    }
    pending.current[step] = (pending.current[step] ?? 0) + amount;
  }, []);

  const track = useCallback(
    (e: QuestEvent) => {
      if (e.type === "sit" || e.type === "stand") {
        seatedManual.current = e.type === "sit";
        if (opts.seated === undefined) ctx.current.seated = seatedManual.current;
        return;
      }
      if (e.type === "spray" || e.type === "gift" || e.type === "search" || e.type === "sweep" || e.type === "event") {
        if (questRef.current?.status === "active") loadSoon();
        return;
      }
      const q = questRef.current;
      const def = q ? QUEST_BY_KEY[q.key] : null;
      if (!q || !def || q.status !== "active") return;
      for (const [step, amount, key] of matches(def.steps, e)) add(step, amount, key);
    },
    [add, loadSoon, opts.seated],
  );

  // Mini games and other screens report through questEvent().
  useEffect(() => onQuestEvent(track), [track]);

  // Visits and rides count by themselves when you pass `room`.
  const room = opts.room ?? null;
  const questId = quest?.status === "active" ? quest.id : null;
  useEffect(() => {
    if (!room || !questId) return;
    track({ type: "visit", room });
    const ride = rideKindOf(room);
    if (ride) track({ type: "ride", kind: ride, room });
  }, [room, questId, track]);

  // Sitting down: ask for a quest after a few seconds in the seat (the server rolls 35%).
  const seated = opts.seated ?? false;
  useEffect(() => {
    if (!seated || !signedIn) return;
    const id = window.setTimeout(() => void offer("seat"), SEAT_OFFER_AFTER * 1000);
    return () => window.clearTimeout(id);
  }, [seated, signedIn, offer]);

  // Time-based steps tick every second; everything is sent to the server every few seconds.
  useEffect(() => {
    if (!questId) return;
    pending.current = {};
    let ticks = 0;
    const id = window.setInterval(() => {
      const q = questRef.current;
      const def = q ? QUEST_BY_KEY[q.key] : null;
      if (!q || !def || q.status !== "active") return;
      const { room: here, seated: sitting, hiding } = ctx.current;
      const kind = placeKindOf(here);
      def.steps.forEach((s, i) => {
        if (s.type === "sit_seconds" && sitting && (!s.kind || s.kind === kind)) add(i, 1, null);
        if (s.type === "stay_seconds" && kind === s.kind) add(i, 1, null);
        if (s.type === "survive_minutes" && hiding) add(i, 1, null);
      });
      ticks += 1;
      if (ticks % 3 === 0) void flush();
    }, 1000);

    async function flush() {
      if (busy.current) return;
      const q = questRef.current;
      const def = q ? QUEST_BY_KEY[q.key] : null;
      if (!q || !def || q.status !== "active") return;
      busy.current = true;
      try {
        for (const [k, amount] of Object.entries(pending.current)) {
          const step = Number(k);
          if (amount <= 0) continue;
          const s = def.steps[step];
          const timed = s.type === "sit_seconds" || s.type === "stay_seconds" || s.type === "survive_minutes";
          const left = (q.targets[step] ?? 0) - (q.progress[step] ?? 0);
          // Timed steps go in batches of ~9 seconds (or as soon as they'd finish the step).
          if (timed && amount < 9 && amount < left) continue;
          const send = timed ? amount : Math.min(amount, 2);
          const res = await reportQuest(q.id, step, send);
          if (!res.ok) {
            pending.current[step] = 0;
            continue;
          }
          pending.current[step] = timed ? 0 : Math.max(0, (pending.current[step] ?? 0) - res.applied);
          if (res.quest) {
            const justFinished = res.completed && questRef.current?.status === "active";
            questRef.current = res.quest;
            setQuest(res.quest, { finished: justFinished });
            if (res.quest.status !== "active") break;
          }
        }
      } finally {
        busy.current = false;
      }
    }
    return () => window.clearInterval(id);
  }, [questId, add]);

  return {
    /** The side quest (active, or done with a special move waiting), or null. */
    quest,
    /** A quest that just arrived (show a big "Today you are a thief" card once). */
    fresh,
    /** A quest that was just completed (celebrate it once). */
    finished,
    /** Clear fresh / finished after showing them. */
    clearFlash: clearQuestFlash,
    /** Report something that happened (see above). */
    track,
    /** Reload the quest from the server now. */
    refresh: load,
    /** Ask for a quest from a source (the NPC card can also call offerQuest("npc", npcId) itself). */
    offer,
  };
}
