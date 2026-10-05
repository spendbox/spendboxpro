"use client";

import { useEffect } from "react";

/**
 * Private pages: when the browser brings one back from its back/forward
 * memory (say, pressing Back after logging out), load it again, so it's the
 * login screen rather than an old copy of the page.
 */
export function FreshOnBack() {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return null;
}
