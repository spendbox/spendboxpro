"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Paintball between phones: one live channel per match room ("pb:<code>": the open Quick match
// room, or a private code), over the game's own realtime connection. Who's in the room comes from
// presence (with when they came in and whether they're playing); everything else is broadcast:
// the start (the roster and the seed, from the room's host: whoever's waited longest), each
// player's position about 8 times a second (with the shots they fired since), the host's bots in
// one message, splats, and the end. Each phone moves its own player and says who its own shots
// hit; the host does the same for the bots.

export type Seat = { i: string; n: string; tm: number; b: boolean };
export type Msg =
  | { t: "start"; m: string; seed: number; at: number; roster: Seat[] }
  | { t: "s"; m: string; i: string; p: number[]; sh?: number[][] }
  | { t: "b"; m: string; bots: { i: string; p: number[]; sh?: number[][] }[] }
  | { t: "hit"; m: string; by: string; tg: string; h: string }
  | { t: "end"; m: string };
export type Member = { id: string; name: string; at: number; st: "wait" | "play" };

export class PaintballNet {
  private channel: RealtimeChannel;
  private live = false;
  private outbox: Msg[] = [];
  members: Member[] = [];
  onMsg: (m: Msg) => void = () => {};
  onMembers: (m: Member[]) => void = () => {};
  readonly joinedAt = Date.now();
  private meta: { name: string; at: number; st: "wait" | "play" };
  private remove: () => void;

  constructor(code: string, readonly me: { id: string; name: string }) {
    const supabase = createClient();
    this.meta = { name: me.name, at: this.joinedAt, st: "wait" };
    this.channel = supabase.channel(`pb:${code}`, { config: { broadcast: { self: false }, presence: { key: me.id } } });
    this.remove = () => void supabase.removeChannel(this.channel);
    this.channel
      .on("broadcast", { event: "p" }, ({ payload }) => {
        if (payload && typeof payload === "object" && typeof (payload as Msg).t === "string") this.onMsg(payload as Msg);
      })
      .on("presence", { event: "sync" }, () => this.readPresence())
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        this.live = true;
        void this.channel.track(this.meta);
        for (const m of this.outbox.splice(0)) void this.channel.send({ type: "broadcast", event: "p", payload: m });
      });
  }

  private readPresence() {
    const state = this.channel.presenceState() as Record<string, { name?: unknown; at?: unknown; st?: unknown }[]>;
    const out: Member[] = [];
    for (const [id, metas] of Object.entries(state)) {
      const m = metas[metas.length - 1];
      if (!m) continue;
      out.push({ id, name: typeof m.name === "string" ? m.name.slice(0, 24) : "Player", at: Number(m.at) || 0, st: m.st === "play" ? "play" : "wait" });
    }
    out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    this.members = out;
    this.onMembers(out);
  }

  /** Playing or waiting (others see a match is on). */
  status(st: "wait" | "play") {
    if (this.meta.st === st) return;
    this.meta = { ...this.meta, st, at: st === "wait" ? Date.now() : this.meta.at };
    if (this.live) void this.channel.track(this.meta);
  }

  send(m: Msg) {
    if (this.live) void this.channel.send({ type: "broadcast", event: "p", payload: m });
    else if (m.t !== "s" && m.t !== "b") this.outbox.push(m);
  }

  close() {
    this.live = false;
    this.remove();
  }
}

/** A short code for a private match (letters that can't be mixed up). */
export function newCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => A[x % A.length]).join("");
}
