"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutNow } from "../login/actions";

/** Test versions (previews, the test site) say why the city didn't load; the live game never does. */
const SHOW_WHY = process.env.NEXT_PUBLIC_APP_ENV === "test" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
const TRIES = 4;

/**
 * Shown for a moment if we couldn't confirm the login or load the game (e.g. a network blip).
 * Retries itself a few times; then it stops and says so, with a way to try again or sign in again
 * (and, on a test version, the reason).
 */
export function Reconnecting({ why }: { why?: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const stuck = tries >= TRIES;
  useEffect(() => {
    if (stuck) return;
    const id = setTimeout(() => {
      setTries((t) => t + 1);
      router.refresh();
    }, 2500);
    return () => clearTimeout(id);
  }, [router, tries, stuck]);
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div className="max-w-sm">
        {!stuck && <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-line border-t-gold" />}
        <p className="font-semibold">{stuck ? "We can't reach the city right now." : "Reconnecting to the city…"}</p>
        <p className="mt-1 text-sm text-muted">{stuck ? "Try again in a moment, or sign in again." : "Hang on, you're still signed in."}</p>
        {stuck && (
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => setTries(0)} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
              Try again
            </button>
            <button
              onClick={async () => {
                // Out first (an old login that can't be checked any more), then the sign-in box.
                await signOutNow().catch(() => {});
                window.location.href = "/?signin=1";
              }}
              className="rounded-full bg-panel-2 px-4 py-2 text-sm font-semibold"
            >
              Sign in again
            </button>
          </div>
        )}
        {SHOW_WHY && why && <p className="mt-4 break-words rounded-xl bg-hit/10 px-3 py-2 text-left font-mono text-[11px] text-hit">Why (test versions only): {why}</p>}
      </div>
    </main>
  );
}
