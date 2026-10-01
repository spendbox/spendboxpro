"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar across the top of the screen that starts the moment someone taps
 * a link and finishes when the new page is showing.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const [route, setRoute] = useState(`${pathname}?${search}`);

  // A new page has arrived: finish the bar. (Adjusting state during render on a
  // change is React's recommended alternative to an effect here.)
  const current = `${pathname}?${search}`;
  if (current !== route) {
    setRoute(current);
    setActive(false);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element).closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div
        className={
          active
            ? "h-full w-[85%] bg-brand-500 transition-[width] duration-[2500ms] ease-out"
            : "h-full w-0 bg-brand-500 opacity-0 transition-[opacity] duration-300"
        }
      />
    </div>
  );
}
