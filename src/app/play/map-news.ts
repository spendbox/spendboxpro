"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// A nudge to everyone in the city that its map lights changed: a game opened, started or was
// called off, or an event was hosted, called off or ended. One small live channel per city
// ("map:<region>"); a nudge carries nothing but what changed, and each phone asks the server again
// itself (a little later, spread out, at most every few seconds), so a nudge can't be faked into
// anything: the worst a fake one does is one more look.

export type MapNews = "games" | "events";

type Hub = { channel: RealtimeChannel; refs: number; fns: Set<(what: MapNews) => void>; live: boolean; outbox: MapNews[] };
const hubs = new Map<string, Hub>();

function hubFor(region: string) {
  let hub = hubs.get(region);
  if (hub) return hub;
  const supabase = createClient();
  const channel = supabase.channel(`map:${region}`, { config: { broadcast: { self: false } } });
  const made: Hub = { channel, refs: 0, fns: new Set(), live: false, outbox: [] };
  hub = made;
  channel
    .on("broadcast", { event: "changed" }, ({ payload }) => {
      const what = (payload as { w?: unknown } | null)?.w;
      if (what !== "games" && what !== "events") return;
      for (const fn of made.fns) fn(what);
    })
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      made.live = true;
      for (const w of made.outbox.splice(0)) void channel.send({ type: "broadcast", event: "changed", payload: { w } });
    });
  hubs.set(region, made);
  return made;
}

/** Hear the city's nudges (each listener is called at most every 4 s, a little after the nudge). */
export function onMapNews(region: string, what: MapNews, fn: () => void) {
  const hub = hubFor(region);
  hub.refs += 1;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listener = (w: MapNews) => {
    if (w !== what || timer) return;
    // Spread out (everyone in the city hears the same nudge), and not more than every 4 s.
    const wait = Math.max(300 + Math.random() * 1700, last + 4000 - Date.now());
    timer = setTimeout(() => {
      timer = null;
      last = Date.now();
      fn();
    }, wait);
  };
  hub.fns.add(listener);
  return () => {
    if (timer) clearTimeout(timer);
    hub.fns.delete(listener);
    hub.refs -= 1;
    if (hub.refs <= 0) {
      hubs.delete(region);
      void createClient().removeChannel(hub.channel);
    }
  };
}

/** Tell the city its map changed (after a game or event you made, started or called off). */
export function tellMap(region: string, what: MapNews) {
  const hub = hubs.get(region);
  if (!hub) return;
  if (hub.live) void hub.channel.send({ type: "broadcast", event: "changed", payload: { w: what } });
  else hub.outbox.push(what);
}
