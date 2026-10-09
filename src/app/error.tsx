"use client";

import { useEffect } from "react";

// Something on the page broke (usually a dropped connection or a slow moment on the server):
// show a calm "reconnecting" screen and try again by itself, waiting a little longer each
// time. After a few failed tries it loads the page fresh.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error", error);
    // A new version of the app was released while this tab was open: load it fresh.
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(`${error.name} ${error.message}`)) {
      window.location.reload();
      return;
    }
    let tries = 0;
    try {
      const last = JSON.parse(sessionStorage.getItem("hs-retry") ?? "{}") as { n?: number; at?: number };
      tries = last.at && Date.now() - last.at < 60_000 ? (last.n ?? 0) : 0;
      sessionStorage.setItem("hs-retry", JSON.stringify({ n: tries + 1, at: Date.now() }));
    } catch {}
    const id = setTimeout(() => (tries >= 3 ? window.location.reload() : reset()), 1500 * (tries + 1));
    return () => clearTimeout(id);
  }, [error, reset]);
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-line border-t-gold" />
        <p className="font-semibold">Reconnecting to the city…</p>
        <p className="mt-1 text-sm text-muted">The connection blinked. We&apos;re getting you back in.</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-panel-2 px-4 py-2 text-sm font-semibold">
          Reload now
        </button>
      </div>
    </main>
  );
}
