"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * How many people have the map open right now: everyone joins one live channel for the city
 * (signed in or not, any browser), and the count is who's in it. Live, not checked every so often,
 * so someone who has just opened the game counts at once and someone who closed it drops off.
 */
export function useOnlineCount(region: string | null, meId: string | null) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!region) return;
    const supabase = createClient();
    const key = meId ?? `guest-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`online:${region}`, { config: { presence: { key } } });
    const recount = () => setCount(Object.keys(channel.presenceState()).length);
    channel
      .on("presence", { event: "sync" }, recount)
      .on("presence", { event: "join" }, recount)
      .on("presence", { event: "leave" }, recount)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });
    // Phones put tabs to sleep: say hello again when the game comes back to the front.
    const back = () => {
      if (document.visibilityState === "visible") void channel.track({ at: Date.now() });
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      supabase.removeChannel(channel);
    };
  }, [region, meId]);
  return count;
}
