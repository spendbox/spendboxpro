"use client";

import { useEffect, useRef } from "react";
import { onQuestEvent, type QuestEvent } from "../activities/quest-store";
import { COUNTERS, type CounterKey, type Counters } from "@/lib/play-style";
import { checkInToGame } from "./style-actions";

// The play diary: what you did this game, kept on this phone (buildings, rides, food, time in
// the club…). It's sent once when the game's results open (savePlayDiary), where the server adds
// what it knows for sure and works out your play style. Tiny and cheap: a few numbers per game in
// localStorage, written at most once a second.

type Diary = { c: Counters; seen: Record<string, string[]> };

const KEY = "nt-diary:";
let current: { round: number; d: Diary } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function read(round: number): Diary {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY + round) ?? "null") as Diary | null;
    if (raw && typeof raw === "object" && raw.c && raw.seen) return raw;
  } catch {}
  return { c: {}, seen: {} };
}

function writeSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!current) return;
    try {
      localStorage.setItem(KEY + current.round, JSON.stringify(current.d));
    } catch {}
  }, 1000);
}

/** Count something in this game's diary (`distinct`: count each one once, e.g. a building id). */
export function diaryAdd(key: CounterKey, n = 1, distinct?: string) {
  if (!current || n <= 0) return;
  const d = current.d;
  if (distinct) {
    const list = d.seen[key] ?? [];
    if (list.includes(distinct)) return;
    d.seen[key] = list.length < 200 ? [...list, distinct] : list;
  }
  d.c[key] = Math.min((d.c[key] ?? 0) + n, COUNTERS[key].max);
  writeSoon();
}

/** A game's diary (for its results). */
export function diaryOf(round: number): Counters {
  if (current?.round === round) return { ...current.d.c };
  if (typeof window === "undefined") return {};
  return read(round).c;
}

const RIDES: Record<string, CounterKey> = {
  balloon: "ride_balloon",
  train: "ride_train",
  bus: "ride_bus",
  car: "ride_car",
  boat: "ride_boat",
  ferris: "ride_ferris",
  slide: "ride_slide",
};

function fromEvent(e: QuestEvent) {
  switch (e.type) {
    case "play":
      if (e.game === "photo") diaryAdd("photos");
      else if (e.game === "slots") diaryAdd("slots");
      else if (e.game === "dance" || e.game === "karaoke" || e.game === "jukebox") diaryAdd("party_games");
      else {
        diaryAdd("arcade_games");
        if (e.won) diaryAdd("games_won");
      }
      break;
    case "order":
      diaryAdd(e.where === "bar" ? "orders_drink" : "orders_food");
      break;
    case "talk_npc":
      diaryAdd("npc_chats", 1, e.npc ?? undefined);
      break;
    case "sit":
      diaryAdd("seats");
      break;
  }
}

/**
 * Keeps the diary for this game: where you go (room ids like "b:12:r" or "v:train:0", with the
 * kind of level you're on), how long you stay in clubs, stands and seats, and what the mini games
 * and menus report. Also checks you in once per game, so just walking round counts.
 */
export function useDiary({
  round,
  room,
  levelKind,
  seated,
  signedIn,
}: {
  round: number | null;
  room: string | null;
  /** The kind of level you're on: "club", "restaurant", "arena", "roof"… */
  levelKind: string | null;
  seated: boolean;
  signedIn: boolean;
}) {
  // Switch to this game's diary (and forget ones from long ago).
  useEffect(() => {
    if (!round) return;
    if (current?.round !== round) {
      // Write the last game's diary before moving on (its results may still need it).
      if (current) {
        try {
          localStorage.setItem(KEY + current.round, JSON.stringify(current.d));
        } catch {}
      }
      current = { round, d: read(round) };
    }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY) && Number(k.slice(KEY.length)) < round - 3) localStorage.removeItem(k);
      }
    } catch {}
  }, [round]);

  useEffect(() => onQuestEvent(fromEvent), []);

  // Where you are.
  useEffect(() => {
    if (!round || !room) return;
    const b = /^b:(\d+)(?::(\w+))?$/.exec(room);
    if (b) {
      diaryAdd("buildings", 1, b[1]);
      diaryAdd("rooms", 1, room);
      if (b[2] === "r" || levelKind === "roof") diaryAdd("roofs", 1, room);
      if (levelKind === "club") diaryAdd("clubs", 1, room);
      if (levelKind === "restaurant") diaryAdd("restaurants", 1, room);
      if (levelKind === "arena") diaryAdd("arenas", 1, room);
      return;
    }
    const kind = room.startsWith("balloon:") ? "balloon" : /^v:([a-z]+):/.exec(room)?.[1];
    const key = kind ? RIDES[kind] : undefined;
    if (key) diaryAdd(key);
  }, [round, room, levelKind]);

  // Minutes in the club, in the stands and on a seat.
  const now = useRef({ levelKind, seated });
  useEffect(() => {
    now.current = { levelKind, seated };
  });
  useEffect(() => {
    if (!round) return;
    const id = window.setInterval(() => {
      const { levelKind: kind, seated: sitting } = now.current;
      if (kind === "club") diaryAdd("club_minutes");
      if (kind === "arena") diaryAdd("arena_minutes");
      if (sitting) diaryAdd("seat_minutes");
    }, 60_000);
    return () => window.clearInterval(id);
  }, [round]);

  // Check in once per game.
  useEffect(() => {
    if (!round || !signedIn) return;
    const flag = `nt-checkin:${round}`;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
    } catch {}
    void checkInToGame();
  }, [round, signedIn]);
}
