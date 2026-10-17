"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Police & Thieves between phones: one live channel per match ("cr:<start>:<match>"), over the
// game's own realtime connection. Presence says who's in (playing or watching). Everything else
// is broadcast: each player's state 5 times a second (only when something changed, else once a
// second), with the shots they fired; the host's bots in one message; damage and takedowns; the
// loot; explosions; team chat and map pings; and every 3 seconds the host's score and numbers
// (so every phone, and anyone who comes in late, shows the same). Each phone moves its own player
// and says what its own shots hit; the host (the first player still here) does the same for the
// bots, and for anyone who signed up but isn't here.

/** A state: x, y, z, yaw, pitch, alive, hp, armour, flags (1 crouch, 2 tank, 4 bag, 8 aiming), gun, tank hp. */
export type State = number[];
export type Msg =
  | { t: "s"; i: string; p: State; sh?: number[][] }
  | { t: "b"; bots: { i: string; p: State; sh?: number[][] }[] }
  | { t: "dmg"; by: string; tg: string; d: number; h: string; k: number }
  | { t: "ko"; tg: string; by: string; k: number; h: string }
  | { t: "loot"; e: "pick" | "drop" | "bank" | "return"; i: string; b: string; x?: number; z?: number }
  | { t: "boom"; x: number; y: number; z: number; k: number }
  | { t: "chat"; from: string; n: string; tm: number; text: string }
  | { t: "ping"; by: string; n: string; tm: number; x: number; z: number }
  | { t: "sync"; sc: [number, number]; st: Record<string, number[]>; bags: { id: string; x: number; z: number }[] }
  // A sample game with friends: the room's host starts it (who's on which side, its city, its times).
  | { t: "start"; seed: number; at: number; ends: number; tod: "day" | "dusk" | "night"; roster: { i: string; n: string; tm: number; a?: unknown }[] };
export type Member = { id: string; name: string; at: number; st: "play" | "watch"; av?: unknown };

export class CopsNet {
  private channel: RealtimeChannel | null = null;
  private live = false;
  private outbox: Msg[] = [];
  members: Member[] = [];
  private msgFns = new Set<(m: Msg) => void>();
  private memberFns = new Set<() => void>();
  private remove: (() => void) | null = null;

  constructor(
    private readonly code: string,
    readonly me: { id: string; name: string; avatar?: unknown },
    private readonly st: "play" | "watch",
  ) {}

  open() {
    if (this.channel) return;
    const supabase = createClient();
    const channel = supabase.channel(`cr:${this.code}`, { config: { broadcast: { self: false }, presence: { key: this.me.id } } });
    this.channel = channel;
    this.remove = () => void supabase.removeChannel(channel);
    channel
      .on("broadcast", { event: "m" }, ({ payload }) => {
        if (payload && typeof payload === "object" && typeof (payload as Msg).t === "string") for (const fn of this.msgFns) fn(payload as Msg);
      })
      .on("presence", { event: "sync" }, () => this.readPresence())
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || this.channel !== channel) return;
        this.live = true;
        void channel.track({ name: this.me.name, at: Date.now(), st: this.st, av: this.me.avatar ?? null });
        for (const m of this.outbox.splice(0)) void channel.send({ type: "broadcast", event: "m", payload: m });
      });
  }

  close() {
    this.live = false;
    this.channel = null;
    this.remove?.();
    this.remove = null;
  }

  listen(fn: (m: Msg) => void) {
    this.msgFns.add(fn);
    return () => void this.msgFns.delete(fn);
  }

  subscribe = (fn: () => void) => {
    this.memberFns.add(fn);
    return () => void this.memberFns.delete(fn);
  };
  getMembers = () => this.members;

  private readPresence() {
    if (!this.channel) return;
    const state = this.channel.presenceState() as Record<string, { name?: unknown; at?: unknown; st?: unknown; av?: unknown }[]>;
    const out: Member[] = [];
    for (const [id, metas] of Object.entries(state)) {
      const m = metas[metas.length - 1];
      if (!m) continue;
      out.push({ id, name: typeof m.name === "string" ? m.name.slice(0, 24) : "Player", at: Number(m.at) || 0, st: m.st === "watch" ? "watch" : "play", av: m.av && typeof m.av === "object" ? m.av : undefined });
    }
    out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    this.members = out;
    for (const fn of this.memberFns) fn();
  }

  send(m: Msg) {
    if (this.st === "watch") return;
    if (this.live) void this.channel?.send({ type: "broadcast", event: "m", payload: m });
    else if (m.t !== "s" && m.t !== "b") this.outbox.push(m);
  }
}
