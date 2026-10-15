"use client";

import { useEffect, useRef, useState } from "react";

// What the error pages show (src/app/error.tsx, src/app/play/error.tsx): something broke while
// the page was drawing, most often a dropped or switching connection on mobile data (a refresh
// that didn't arrive), sometimes a bug. It tells the server what happened (so it shows in the
// logs), then gets the player back in by itself:
// - offline: waits for the connection to come back, then tries again;
// - otherwise: fetches the page again (retry), a few times, waiting a little longer each time
//   (much longer on a slow connection, where a try can take a while to arrive);
// - a piece of the app that didn't download: tries to fetch it again first, then loads the page
//   afresh (a new version may have come out);
// - still broken: loads the page afresh (at most twice in two minutes, so it never loops; on a
//   slow connection only after many tries, as it means downloading everything again);
// - coming back to the tab: tries again straight away.

const RELOADS_KEY = "nt-error-reloads";

/**
 * A slow connection (2G/3G, or data saver on): everything waits longer, and reloading the page (which
 * downloads it all again from the start) is the very last resort.
 */
export function slowNetwork() {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  return !!c && (c.saveData === true || ["slow-2g", "2g", "3g"].includes(c.effectiveType ?? ""));
}

/** Tell the server once per error (it shows in the Vercel logs). */
function report(error: Error & { digest?: string }, where: string) {
  try {
    const body = JSON.stringify({ where, message: String(error?.message ?? "").slice(0, 500), name: error?.name, digest: error?.digest, url: location.pathname + location.search, online: navigator.onLine });
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Nothing to do.
  }
}

/** Reloads in the last two minutes (kept for this tab). */
function recentReloads(): number[] {
  try {
    return (JSON.parse(sessionStorage.getItem(RELOADS_KEY) ?? "[]") as number[]).filter((t) => Date.now() - t < 120_000);
  } catch {
    return [];
  }
}
function reloadOnce(): boolean {
  const list = recentReloads();
  if (list.length >= 2) return false;
  try {
    sessionStorage.setItem(RELOADS_KEY, JSON.stringify([...list, Date.now()]));
  } catch {
    // Not kept: reload anyway.
  }
  window.location.reload();
  return true;
}

export function Recovering({ error, retry, where }: { error: Error & { digest?: string }; retry: () => void; where: string }) {
  const [tries, setTries] = useState(0);
  const [stuck, setStuck] = useState(false);
  const [offline, setOffline] = useState(false);
  const reported = useRef<unknown>(null);

  // A piece of the app that didn't download (a dropped connection, or a new version released while
  // this tab was open).
  const stale = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error?.name} ${error?.message}`);

  useEffect(() => {
    if (reported.current === error) return;
    reported.current = error;
    console.error(`${where} error`, error);
    report(error, where);
  }, [error, where]);

  useEffect(() => {
    // A piece of the app didn't download: fetch it again twice (a dropped connection), then load
    // the page afresh (a new version came out and the old piece is gone).
    if (stale && tries >= 2) {
      if (!reloadOnce()) setTimeout(() => setStuck(true), 0);
      return;
    }
    if (stuck) return;
    // No connection: wait for it, then try again.
    if (!navigator.onLine) {
      const t0 = setTimeout(() => setOffline(true), 0);
      const back = () => {
        setOffline(false);
        setTries((n) => n + 1);
        retry();
      };
      window.addEventListener("online", back, { once: true });
      return () => {
        clearTimeout(t0);
        window.removeEventListener("online", back);
      };
    }
    const slow = slowNetwork();
    const most = slow ? 8 : 3;
    // Fast: 1.2 s, 2.4 s, 3.6 s. Slow: 4 s, then doubling up to 30 s, so a try has time to arrive.
    const wait = slow ? Math.min(30_000, 4000 * 2 ** tries) : 1200 * (tries + 1);
    const t = setTimeout(() => {
      if (tries < most) {
        setTries((n) => n + 1);
        retry();
      } else if (!reloadOnce()) setStuck(true);
    }, wait);
    return () => clearTimeout(t);
  }, [tries, stuck, stale, retry]);

  // Back to the tab (it may have been asleep): try again at once.
  useEffect(() => {
    const on = () => {
      if (document.visibilityState !== "visible") return;
      setStuck(false);
      setTries(0);
      retry();
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [retry]);

  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div className="max-w-sm">
        {!stuck && <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-line border-t-gold" />}
        <p className="font-semibold">{stuck ? "We can't reach the city right now." : offline ? "You're offline." : "Reconnecting to the city…"}</p>
        <p className="mt-1 text-sm text-muted">
          {stuck ? "Check your connection and try again." : offline ? "We'll carry on as soon as your connection is back." : "The connection blinked. We're getting you back in."}
        </p>
        <button
          onClick={() => {
            try {
              sessionStorage.removeItem(RELOADS_KEY);
            } catch {
              // Fine.
            }
            window.location.reload();
          }}
          className="mt-4 rounded-xl bg-panel-2 px-4 py-2 text-sm font-semibold"
        >
          {stuck ? "Try again" : "Reload now"}
        </button>
        {error?.digest && <p className="mt-3 text-[10px] text-muted/70">Code {error.digest}</p>}
      </div>
    </main>
  );
}
