"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { slowNetwork } from "@/components/recovering";
import { signOutNow } from "../login/actions";

/** Test versions (previews, the test site) say why the city didn't load; the live game never does. */
const SHOW_WHY = process.env.NEXT_PUBLIC_APP_ENV === "test" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
const TRIES = 4;

/**
 * Shown for a moment if we couldn't confirm the login or load the game (e.g. a network blip).
 * It keeps trying by itself, waiting longer each time (2.5 s, 5 s, 10 s, then every 30 s; twice as
 * long on a slow connection, where each try takes a while), and as soon as you're back online or
 * come back to the tab. After a few tries it also offers to try now or sign in again (and, on a test
 * version, says why).
 */
export function Reconnecting({ why }: { why?: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const stuck = tries >= TRIES;
  useEffect(() => {
    const again = () => {
      setTries((t) => t + 1);
      router.refresh();
    };
    const wait = Math.min(30_000, 2500 * 2 ** Math.min(tries, 4)) * (slowNetwork() ? 2 : 1);
    const id = setTimeout(again, wait);
    const back = () => document.visibilityState === "visible" && again();
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(id);
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", back);
    };
  }, [router, tries]);
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-line border-t-gold" />
        <p className="font-semibold">Reconnecting to the city…</p>
        <p className="mt-1 text-sm text-muted">{stuck ? "Your connection seems slow. We'll keep trying, or you can try now or sign in again." : "Hang on, you're still signed in."}</p>
        {stuck && (
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => {
                setTries(0);
                router.refresh();
              }}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
            >
              Try now
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
