"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// One live channel per place for everything people do together inside it
// ("activity:<roundId>:<roomId>"): leaderboards, duels, trivia, karaoke hype, spraying, the
// jukebox. Several parts of the screen can listen at once (the room layer and an open game);
// they share one channel. Messages come straight from other players' phones, so every reader
// checks them and nothing here moves coins (the server does that).

export type ActivityPlayer = { id: string; name: string; avatar: unknown };
export type DuelGame = "rps" | "dice";
export type ToastIcon = "trophy" | "food" | "drink" | "music" | "target" | "party" | "coins" | "mic" | "dice" | "camera" | "star";

export type ActivityMsg =
  /** Someone finished a score game. */
  | { t: "score"; game: string; p: ActivityPlayer; score: number }
  /** Someone opened a game: everyone replies with their best score for it. */
  | { t: "hello"; game: string; from: string }
  /** Duels: challenge, answer, commit (hidden pick), reveal, walk away. */
  | { t: "challenge"; cid: string; game: DuelGame; from: ActivityPlayer; to: string }
  | { t: "answer"; cid: string; from: string; ok: boolean }
  | { t: "commit"; cid: string; from: string; round: number; hash: string }
  | { t: "reveal"; cid: string; from: string; round: number; salt: string; pick: string }
  | { t: "leave"; cid: string; from: string }
  /** Coins showered on dancers (already paid by the server). */
  | { t: "spray"; from: ActivityPlayer; amount: number; shares: { id: string; name: string; coins: number }[] }
  /** Someone picked a tune. */
  | { t: "jukebox"; vibe: string; by: ActivityPlayer }
  /** A little news line for the room. */
  | { t: "toast"; text: string; icon?: ToastIcon; from?: string }
  /** Room trivia: a question, someone's answer, the end. */
  | { t: "quiz_q"; qz: string; host: ActivityPlayer; n: number; total: number; qi: number; secs: number }
  | { t: "quiz_a"; qz: string; n: number; p: ActivityPlayer; correct: boolean }
  | { t: "quiz_end"; qz: string }
  /** Karaoke: someone took the mic, the crowd's hype, the final score. */
  | { t: "mic"; sid: string; p: ActivityPlayer; song: string; secs: number }
  | { t: "hype"; sid: string; from: string; kind: number }
  | { t: "mic_end"; sid: string; p: ActivityPlayer; score: number };

/** Someone on the channel and what they're doing (e.g. "dance"). */
export type PresentPlayer = ActivityPlayer & { doing: string[] };

type Hub = {
  topic: string;
  channel: RealtimeChannel;
  listeners: Set<(m: ActivityMsg) => void>;
  presenceListeners: Set<(p: PresentPlayer[]) => void>;
  refs: number;
  joined: boolean;
  outbox: ActivityMsg[];
  present: PresentPlayer[];
  doing: Map<number, string>;
  me: ActivityPlayer | null;
  remove: () => void;
};

const hubs = new Map<string, Hub>();
let nextToken = 1;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A short random id (duels, quizzes, karaoke sessions). */
export function randomId(n = 10) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/** A player as other phones describe them (checked, trimmed). */
export function cleanPlayer(v: unknown): ActivityPlayer | null {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.name !== "string") return null;
  return { id: v.id.slice(0, 64), name: v.name.slice(0, 40) || "Player", avatar: v.avatar };
}

function track(hub: Hub) {
  if (!hub.joined || !hub.me) return;
  void hub.channel.track({ name: hub.me.name, avatar: hub.me.avatar, doing: [...new Set(hub.doing.values())] });
}

function readPresence(hub: Hub) {
  const state = hub.channel.presenceState() as Record<string, { name?: unknown; avatar?: unknown; doing?: unknown }[]>;
  const out: PresentPlayer[] = [];
  for (const [id, metas] of Object.entries(state)) {
    if (id.startsWith("guest-")) continue;
    const doing = new Set<string>();
    let name = "Player";
    let avatar: unknown = null;
    for (const m of metas) {
      if (typeof m.name === "string") name = m.name.slice(0, 40);
      if (m.avatar) avatar = m.avatar;
      if (Array.isArray(m.doing)) for (const d of m.doing) if (typeof d === "string") doing.add(d);
    }
    out.push({ id, name, avatar, doing: [...doing] });
  }
  hub.present = out;
  for (const l of hub.presenceListeners) l(out);
}

function openHub(topic: string, me: ActivityPlayer | null): Hub {
  const existing = hubs.get(topic);
  if (existing) {
    if (me && !existing.me) {
      existing.me = me;
      track(existing);
    }
    return existing;
  }
  const supabase = createClient();
  const key = me?.id ?? `guest-${randomId(8)}`;
  const channel = supabase.channel(topic, { config: { broadcast: { self: false }, presence: { key } } });
  const hub: Hub = {
    topic,
    channel,
    listeners: new Set(),
    presenceListeners: new Set(),
    refs: 0,
    joined: false,
    outbox: [],
    present: [],
    doing: new Map(),
    me,
    remove: () => void supabase.removeChannel(channel),
  };
  channel
    .on("broadcast", { event: "a" }, ({ payload }) => {
      if (!isObj(payload) || typeof payload.t !== "string") return;
      for (const l of hub.listeners) l(payload as ActivityMsg);
    })
    .on("presence", { event: "sync" }, () => readPresence(hub))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        hub.joined = true;
        track(hub);
        for (const m of hub.outbox.splice(0)) void channel.send({ type: "broadcast", event: "a", payload: m });
      }
    });
  hubs.set(topic, hub);
  return hub;
}

function closeHub(hub: Hub) {
  hub.refs -= 1;
  if (hub.refs > 0) return;
  hubs.delete(hub.topic);
  hub.joined = false;
  hub.remove();
}

/** Send a message to everyone in the place (and to this screen's own listeners straight away). */
function sendOn(hub: Hub, m: ActivityMsg) {
  for (const l of hub.listeners) l(m);
  if (hub.joined) void hub.channel.send({ type: "broadcast", event: "a", payload: m });
  else hub.outbox.push(m);
}

/**
 * Join the place's activity channel. `onMessage` hears every message (yours too, straight
 * away). `doing` tells others what you're up to (e.g. "dance" puts you on the dance floor).
 * Returns send() and who else is here (with what they're doing).
 */
export function useActivityRoom(
  roundId: number | null | undefined,
  roomId: string | null | undefined,
  me: ActivityPlayer | null,
  opts: { doing?: string | readonly string[] | null; onMessage?: (m: ActivityMsg) => void } = {},
) {
  const topic = roundId != null && roomId ? `activity:${roundId}:${roomId}` : null;
  const [present, setPresent] = useState<PresentPlayer[]>([]);
  const hubRef = useRef<Hub | null>(null);
  const onMessage = useRef(opts.onMessage);
  const meRef = useRef(me);
  useEffect(() => {
    onMessage.current = opts.onMessage;
    meRef.current = me;
  });

  const meId = me?.id ?? null;
  useEffect(() => {
    if (!topic) return;
    const hub = openHub(topic, meRef.current);
    hub.refs += 1;
    hubRef.current = hub;
    const listener = (m: ActivityMsg) => onMessage.current?.(m);
    const presence = (p: PresentPlayer[]) => setPresent(p);
    hub.listeners.add(listener);
    hub.presenceListeners.add(presence);
    const first = setTimeout(() => setPresent(hub.present), 0);
    return () => {
      clearTimeout(first);
      hub.listeners.delete(listener);
      hub.presenceListeners.delete(presence);
      hubRef.current = null;
      closeHub(hub);
    };
  }, [topic, meId]);

  // What you're doing (one thing or several), shared with the place while this part of the screen is open.
  const doing = opts.doing == null ? "" : typeof opts.doing === "string" ? opts.doing : opts.doing.join("\n");
  useEffect(() => {
    const hub = hubRef.current;
    if (!hub || !doing) return;
    const tokens = doing.split("\n").map((d) => {
      const token = nextToken++;
      hub.doing.set(token, d);
      return token;
    });
    track(hub);
    return () => {
      for (const t of tokens) hub.doing.delete(t);
      track(hub);
    };
  }, [doing, topic, meId]);

  return {
    /** Send a message to the place. */
    send: (m: ActivityMsg) => {
      if (hubRef.current) sendOn(hubRef.current, m);
    },
    /** Everyone with the place open (not watchers), and what they're doing. */
    present,
    /** False until the channel is ready (messages sent before then wait). */
    live: topic !== null,
  };
}
