"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Shown for a moment if we couldn't confirm the login (e.g. a network blip). Retries itself. */
export function Reconnecting() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [router]);
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-line border-t-gold" />
        <p className="font-semibold">Reconnecting to the city…</p>
        <p className="mt-1 text-sm text-muted">Hang on, you&apos;re still signed in.</p>
      </div>
    </main>
  );
}
