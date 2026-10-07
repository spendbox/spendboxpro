"use client";

import { useEffect } from "react";

// If something in the game screen fails (a dropped connection, the app being updated while
// you play), quietly try again instead of showing a dead "couldn't load" page.
export default function PlayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Game screen error", error);
    // A new version of the app was released while this tab was open: load it fresh.
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(`${error.name} ${error.message}`)) {
      window.location.reload();
      return;
    }
    const id = setTimeout(() => reset(), 2500);
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
