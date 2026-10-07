"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error", error);
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(`${error.name} ${error.message}`)) {
      window.location.reload();
      return;
    }
    const id = setTimeout(() => reset(), 3000);
    return () => clearTimeout(id);
  }, [error, reset]);
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="font-display text-xl font-bold">One moment…</p>
        <p className="mt-1 text-sm text-muted">Something hiccuped. Trying again.</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-gold px-4 py-2 text-sm font-semibold">
          Reload
        </button>
      </div>
    </main>
  );
}
