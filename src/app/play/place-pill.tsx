"use client";

import { MapPin } from "@/components/icons";

/**
 * Top left on a real place (src/lib/world): the area being pointed at, or in the middle of the
 * view, and the state it's in ("Yaba · Lagos State").
 */
export function PlacePill({ area, state }: { area: string | null; state: string }) {
  return (
    <div className="glass pointer-events-auto flex h-8 min-w-0 max-w-[min(16rem,60vw)] items-center gap-1.5 rounded-full px-2.5 text-xs sm:h-9 sm:gap-2 sm:px-3 sm:text-sm" aria-live="polite">
      <MapPin className="size-3.5 shrink-0 text-muted sm:size-4" />
      <span className="min-w-0 truncate font-display font-bold" title={area ?? state}>
        {area ?? state}
      </span>
      {area && <span className="shrink-0 text-muted max-[359px]:hidden">{state}</span>}
    </div>
  );
}
