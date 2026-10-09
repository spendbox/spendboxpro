import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedResponse, Frame, MatchInfo, MatchResult } from "@/lib/sports/types";

// Polls the match feed while the match view is open: every ~3 s while it's live and the tab
// is visible (less often before kick-off or without a ticket), appending the new frames.
// Stops once the match is done.

export type MatchFeedData = {
  match: MatchInfo;
  ticket: boolean;
  done: boolean;
  result: MatchResult | null;
  scoreline: string | null;
  pool: Record<string, number>;
};

type State = {
  id: string | null;
  data: MatchFeedData | null;
  frames: Frame[];
  error: string | null;
  serverOffset: number;
};

const EMPTY: State = { id: null, data: null, frames: [], error: null, serverOffset: 0 };
const LIVE_MS = 3000;
const IDLE_MS = 6000;

/**
 * `data` is the latest feed response (match, ticket, done, result, scoreline, pool), `frames`
 * every frame received so far, `serverOffset` the server clock minus this device's clock (ms),
 * and `refresh()` polls straight away (after buying a ticket, say).
 */
export function useMatchFeed(matchId: string | null, enabled = true, endpoint = "/api/sports/feed") {
  const [state, setState] = useState<State>(EMPTY);
  const [kick, setKick] = useState(0);
  // Frames already fetched for a match, kept across re-runs of the polling effect.
  const store = useRef<{ id: string | null; frames: Frame[]; ticket: boolean }>({ id: null, frames: [], ticket: false });

  useEffect(() => {
    if (!matchId || !enabled) return;
    if (store.current.id !== matchId) store.current = { id: matchId, frames: [], ticket: false };
    let stopped = false;
    let paused = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = 0;
    let bestRtt = Infinity;
    let offset = 0;
    let busy = false;

    const schedule = (ms: number) => {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(poll, ms);
    };

    async function poll() {
      if (stopped || busy) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        paused = true;
        return;
      }
      busy = true;
      const s = store.current;
      const last = s.frames.length ? s.frames[s.frames.length - 1].t : -1;
      const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}match=${encodeURIComponent(matchId!)}&from=${last + 1}`;
      const sent = Date.now();
      const t0 = performance.now();
      try {
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as FeedResponse;
        const rtt = performance.now() - t0;
        if (stopped) return;
        if (!json || !json.ok) {
          fails++;
          setState((p) => ({ ...(p.id === matchId ? p : EMPTY), id: matchId, error: (json && !json.ok && json.error) || "Couldn't load the match." }));
          schedule(Math.min(20_000, LIVE_MS * 2 ** fails));
          return;
        }
        fails = 0;
        // Clock offset from the quickest round trip so far (least network noise).
        if (rtt <= bestRtt + 40) {
          bestRtt = Math.min(bestRtt, rtt);
          offset = Math.round(json.now - (sent + rtt / 2));
        }
        if (!json.ticket) s.frames = [];
        else if (json.frames.length) {
          const lastT = s.frames.length ? s.frames[s.frames.length - 1].t : -1;
          const fresh = json.frames.filter((f) => f.t > lastT);
          if (fresh.length) s.frames = s.frames.concat(fresh);
        }
        s.ticket = json.ticket;
        const frames = s.frames;
        setState({
          id: matchId,
          data: { match: json.match, ticket: json.ticket, done: json.done, result: json.result, scoreline: json.scoreline, pool: json.pool ?? {} },
          frames,
          error: null,
          serverOffset: offset,
        });
        if (json.done) return; // over: everything has arrived
        const untilKickoff = json.match.kickoffAt - json.now;
        if (untilKickoff > 0) schedule(Math.max(500, Math.min(IDLE_MS, untilKickoff + 250)));
        else schedule(json.ticket ? LIVE_MS : IDLE_MS);
      } catch {
        if (stopped) return;
        fails++;
        setState((p) => ({ ...(p.id === matchId ? p : EMPTY), id: matchId, error: "Can't reach the stadium. Trying again..." }));
        schedule(Math.min(20_000, LIVE_MS * 2 ** fails));
      } finally {
        busy = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && paused) {
        paused = false;
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule(0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [matchId, enabled, endpoint, kick]);

  const refresh = useCallback(() => setKick((k) => k + 1), []);
  const mine = state.id === matchId && !!matchId;
  return {
    data: mine ? state.data : null,
    frames: mine ? state.frames : NO_FRAMES,
    error: mine ? state.error : null,
    loading: !!matchId && enabled && !(mine && (state.data || state.error)),
    serverOffset: mine ? state.serverOffset : 0,
    refresh,
  };
}

const NO_FRAMES: Frame[] = [];
