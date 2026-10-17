"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { ActivityMsg } from "../activities/hub";

// One live channel per challenge ("challenge:<id>"): the game's moves (in the same shape as the
// minigames' moves, so the turn table plays them) and the players' chat. Who's still here comes
// from presence. Nothing here moves money: the server does that.

export type ChatLine = { from: string; name: string; text: string; at: number };
type ChallengeMsg = ActivityMsg | { t: "chat"; from: string; name: string; text: string; at: number };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function useChallengeChannel(id: number | null, me: { id: string; name: string } | null) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listeners = useRef(new Set<(m: ActivityMsg) => void>());
  const outbox = useRef<ChallengeMsg[]>([]);
  const joined = useRef(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [here, setHere] = useState<string[]>([]);
  const meId = me?.id ?? null;
  const meName = me?.name ?? "Player";

  useEffect(() => {
    if (id === null || !meId) return;
    const supabase = createClient();
    const channel = supabase.channel(`challenge:${id}`, { config: { broadcast: { self: false }, presence: { key: meId } } });
    channelRef.current = channel;
    joined.current = false;
    channel
      .on("broadcast", { event: "c" }, ({ payload }) => {
        if (!isObj(payload) || typeof payload.t !== "string") return;
        if (payload.t === "chat") {
          const text = String(payload.text ?? "").slice(0, 200);
          if (!text) return;
          setChat((c) => [...c.slice(-40), { from: String(payload.from ?? ""), name: String(payload.name ?? "Player").slice(0, 40), text, at: Number(payload.at) || Date.now() }]);
          return;
        }
        for (const l of listeners.current) l(payload as ActivityMsg);
      })
      .on("presence", { event: "sync" }, () => setHere(Object.keys(channel.presenceState())))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        joined.current = true;
        void channel.track({ at: Date.now() });
        for (const m of outbox.current.splice(0)) void channel.send({ type: "broadcast", event: "c", payload: m });
      });
    return () => {
      joined.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setChat([]);
      setHere([]);
    };
  }, [id, meId]);

  const send = (m: ChallengeMsg) => {
    const ch = channelRef.current;
    if (ch && joined.current) void ch.send({ type: "broadcast", event: "c", payload: m });
    else outbox.current.push(m);
  };

  return {
    /** For the turn table: my moves out, theirs in. */
    online: {
      send: (mv: { k: number; m: unknown }) => send({ t: "mg_move", cid: String(id), from: meId ?? "", k: mv.k, m: mv.m }),
      listen: (fn: (msg: ActivityMsg) => void) => {
        listeners.current.add(fn);
        return () => {
          listeners.current.delete(fn);
        };
      },
      /** Anything else for the board (catching up on the moves so far). */
      post: (m: Record<string, unknown>) => send(m as unknown as ChallengeMsg),
    },
    chat,
    say: (text: string) => {
      const t = text.replace(/\s+/g, " ").trim().slice(0, 200);
      if (!t || !meId) return;
      const line: ChatLine = { from: meId, name: meName, text: t, at: Date.now() };
      setChat((c) => [...c.slice(-40), line]);
      send({ t: "chat", ...line });
    },
    /** Who has the challenge open right now (players and watchers). */
    here,
    /** Anything else for the table (catching up on the moves so far); it arrives through online.listen. */
    post: (m: Record<string, unknown>) => send(m as unknown as ChallengeMsg),
  };
}
