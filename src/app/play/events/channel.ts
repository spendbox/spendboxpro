"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { StageState } from "@/lib/world/events";

// One live channel per event ("event:<id>"): who's in the room (presence), and everything said and
// done there (broadcast): chat, reactions, shout-outs, toasts, the hot seat, meeting someone new,
// spraying, the party's music and the stage. Nothing here moves money (spraying goes through the
// server) and nothing is kept: it's a room, not a record.

export type RoomPerson = { id: string; name: string; avatar: unknown; host: boolean; looking: boolean; vibe: string | null };

export type RoomMsg =
  | { t: "chat"; from: string; name: string; text: string; at: number }
  | { t: "react"; from: string; e: string }
  | { t: "shout"; from: string; name: string; to: string | null; toName: string | null; text: string; at: number }
  | { t: "toast"; id: string; from: string; name: string; text: string }
  | { t: "clink"; id: string; from: string }
  | { t: "hot"; id: string; q: number; by: string }
  | { t: "ans"; id: string; from: string; name: string; text: string }
  | { t: "love"; id: string; to: string; from: string }
  | { t: "pair"; a: string; b: string; prompt: number }
  | { t: "spray"; from: string; name: string; amount: number }
  | { t: "stage"; s: StageState }
  | { t: "ask"; id: string; from: string; name: string; text: string }
  | { t: "up"; id: string; from: string }
  | { t: "answered"; id: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

/** A message from the channel, checked and trimmed (anyone can send anything to a broadcast). */
function clean(p: unknown): RoomMsg | null {
  if (!isObj(p) || typeof p.t !== "string") return null;
  const from = str(p.from, 64);
  switch (p.t) {
    case "chat":
    case "shout": {
      const text = str(p.text, 200).trim();
      if (!text) return null;
      if (p.t === "chat") return { t: "chat", from, name: str(p.name, 40), text, at: Number(p.at) || Date.now() };
      return { t: "shout", from, name: str(p.name, 40), to: p.to ? str(p.to, 64) : null, toName: p.toName ? str(p.toName, 40) : null, text, at: Number(p.at) || Date.now() };
    }
    case "react":
      return { t: "react", from, e: str(p.e, 8) };
    case "toast":
      return { t: "toast", id: str(p.id, 40), from, name: str(p.name, 40), text: str(p.text, 80) };
    case "clink":
      return { t: "clink", id: str(p.id, 40), from };
    case "hot":
      return { t: "hot", id: str(p.id, 40), q: Math.floor(Number(p.q) || 0), by: str(p.by, 40) };
    case "ans": {
      const text = str(p.text, 140).trim();
      return text ? { t: "ans", id: str(p.id, 40), from, name: str(p.name, 40), text } : null;
    }
    case "love":
      return { t: "love", id: str(p.id, 40), to: str(p.to, 64), from };
    case "pair":
      return { t: "pair", a: str(p.a, 64), b: str(p.b, 64), prompt: Math.floor(Number(p.prompt) || 0) };
    case "spray":
      return { t: "spray", from, name: str(p.name, 40), amount: Math.max(0, Math.min(10_000, Number(p.amount) || 0)) };
    case "stage":
      return isObj(p.s) ? { t: "stage", s: p.s as StageState } : null;
    case "ask": {
      const text = str(p.text, 200).trim();
      return text ? { t: "ask", id: str(p.id, 40), from, name: str(p.name, 40), text } : null;
    }
    case "up":
      return { t: "up", id: str(p.id, 40), from };
    case "answered":
      return { t: "answered", id: str(p.id, 40) };
  }
  return null;
}

export const randomKey = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/**
 * The event's room. me: who you are (with host: you're the host; vibe: the party's music, shared by
 * the host's phone). Returns who's here, send(), on() to hear messages, and setLooking() for meeting
 * someone new.
 */
export function useEventRoom(id: number | null, me: { id: string; name: string; avatar: unknown; host: boolean } | null, vibe: string | null) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listeners = useRef(new Set<(m: RoomMsg) => void>());
  const outbox = useRef<RoomMsg[]>([]);
  const joined = useRef(false);
  const meta = useRef({ looking: false, vibe });
  const [here, setHere] = useState<RoomPerson[]>([]);
  const meId = me?.id ?? null;
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  });

  const track = useCallback(() => {
    const ch = channelRef.current;
    const m = meRef.current;
    if (!ch || !joined.current || !m) return;
    void ch.track({ name: m.name, avatar: m.avatar, host: m.host, looking: meta.current.looking, vibe: m.host ? meta.current.vibe : null, at: Date.now() });
  }, []);

  useEffect(() => {
    if (id === null || !meId) return;
    const supabase = createClient();
    const channel = supabase.channel(`event:${id}`, { config: { broadcast: { self: false }, presence: { key: meId } } });
    channelRef.current = channel;
    joined.current = false;
    channel
      .on("broadcast", { event: "m" }, ({ payload }) => {
        const m = clean(payload);
        if (m) for (const l of listeners.current) l(m);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as unknown as Record<string, Record<string, unknown>[]>;
        setHere(
          Object.entries(state).map(([pid, metas]) => {
            const x = metas[metas.length - 1] ?? {};
            return { id: pid, name: str(x.name, 40) || "Player", avatar: x.avatar, host: x.host === true, looking: x.looking === true, vibe: typeof x.vibe === "string" ? x.vibe : null };
          }),
        );
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        joined.current = true;
        track();
        for (const m of outbox.current.splice(0)) void channel.send({ type: "broadcast", event: "m", payload: m });
      });
    return () => {
      joined.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setHere([]);
    };
  }, [id, meId, track]);

  // The host's music choice travels with their presence (so people who come in later hear it too).
  useEffect(() => {
    meta.current.vibe = vibe;
    track();
  }, [vibe, track]);

  const send = useCallback((m: RoomMsg) => {
    const ch = channelRef.current;
    if (ch && joined.current) void ch.send({ type: "broadcast", event: "m", payload: m });
    else outbox.current.push(m);
    // Your own messages reach you too (the channel doesn't echo them).
    for (const l of listeners.current) l(m);
  }, []);

  const on = useCallback((fn: (m: RoomMsg) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const setLooking = useCallback(
    (looking: boolean) => {
      meta.current.looking = looking;
      track();
    },
    [track],
  );

  return { here, send, on, setLooking };
}

/** Messages of one kind, kept as a list (newest last, at most `keep`). */
export function useRoomList<K extends RoomMsg["t"]>(on: (fn: (m: RoomMsg) => void) => () => void, kind: K, keep = 40) {
  const [list, setList] = useState<Extract<RoomMsg, { t: K }>[]>([]);
  useEffect(
    () =>
      on((m) => {
        if (m.t === kind) setList((l) => [...l.slice(-(keep - 1)), m as Extract<RoomMsg, { t: K }>]);
      }),
    [on, kind, keep],
  );
  return list;
}
