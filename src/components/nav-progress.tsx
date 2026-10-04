"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "loading" | "done";

/**
 * A bar across the top of the screen that starts the moment someone taps a
 * link and finishes when the new page is showing. The tapped link fades a
 * little meanwhile, so it's clear the tap worked.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [route, setRoute] = useState(`${pathname}?${search}`);
  const tapped = useRef<HTMLElement | null>(null);

  // A new page has arrived: finish the bar. (Adjusting state during render on a
  // change is React's recommended alternative to an effect here.)
  const current = `${pathname}?${search}`;
  if (current !== route) {
    setRoute(current);
    if (phase === "loading") setPhase("done");
  }

  useEffect(() => {
    tapped.current?.removeAttribute("data-pending");
    tapped.current = null;
  }, [current]);

  useEffect(() => {
    if (phase === "idle") return;
    // "done" fades out; "loading" gives up after a while (a failed or cancelled page).
    const t = setTimeout(
      () => {
        setPhase("idle");
        tapped.current?.removeAttribute("data-pending");
      },
      phase === "done" ? 350 : 15000,
    );
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    // Listens before the page does (capture), because Next's links cancel the
    // click's default to load the page themselves.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element).closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      tapped.current?.removeAttribute("data-pending");
      link.setAttribute("data-pending", "");
      tapped.current = link;
      setPhase("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div
        className={
          phase === "loading"
            ? "nav-progress-crawl h-full bg-brand-500 shadow-[0_0_8px_var(--color-brand-500)]"
            : phase === "done"
              ? "h-full w-full bg-brand-500 opacity-0 transition-[opacity] delay-150 duration-200"
              : "h-full w-0 opacity-0"
        }
      />
    </div>
  );
}
