"use client";

import { useEffect } from "react";

/** A tiny buzz when a button is pressed (phones that support it), so taps feel answered. */
export function TapFeedback() {
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const el = (e.target as Element | null)?.closest?.('button:not(:disabled), a[href], [role="button"]');
      if (!el) return;
      try {
        navigator.vibrate(8);
      } catch {}
    };
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, []);
  return null;
}
