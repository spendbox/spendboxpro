"use client";

import { useEffect, useRef } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";

/** The cards open right now, oldest first: Escape closes only the top one. */
const openSheets: { current: () => void }[] = [];
let escapeHooked = false;
function onEscape(e: KeyboardEvent) {
  if (e.key !== "Escape" || !openSheets.length) return;
  e.preventDefault();
  openSheets[openSheets.length - 1].current();
}

/**
 * A pop-up card: slides up from the bottom on phones, centred on bigger screens.
 * Only a tap that STARTS on the dark backdrop closes it (a tap on the city that opened it
 * must not also close it).
 */
export function Sheet({
  onClose,
  children,
  wide,
  title,
  clear,
  above,
  centred,
}: {
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  title?: React.ReactNode;
  /**
   * A card about a spot in the city (a building, a place): the city stays in full view round it
   * (no dimming), and on phones it takes at most the bottom part of the screen.
   */
  clear?: boolean;
  /** Over other full-screen cards (a character's chat). */
  above?: boolean;
  /** In the middle of the screen on phones too (higher up, not at the bottom). */
  centred?: boolean;
}) {
  const downOnBackdrop = useRef(false);
  // Escape closes it too, but only the top card (one listener for them all).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const me = close;
    openSheets.push(me);
    if (!escapeHooked) {
      escapeHooked = true;
      window.addEventListener("keydown", onEscape);
    }
    return () => {
      const at = openSheets.indexOf(me);
      if (at >= 0) openSheets.splice(at, 1);
    };
  }, []);
  return (
    <div
      // Never blurred: the city behind stays sharp (just a little dimmer, or not at all).
      className={cn("fixed inset-0 grid p-2 sm:place-items-center sm:p-4", centred ? "place-items-center pb-16" : "place-items-end", above ? "z-[70]" : "z-[60]", clear ? "bg-transparent" : "bg-ink/20")}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
        // Taps and typing in a card are the card's alone: the map's own listeners (dragging,
        // the sounds' wake-up, bubbles) never see them, so nothing takes the focus off a text box.
        e.stopPropagation();
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <section
        className={cn(
          "relative w-full overflow-y-auto rounded-3xl bg-panel p-5 shadow-2xl",
          clear ? "max-h-[min(60dvh,calc(100dvh-1rem))] ring-1 ring-ink/10 sm:max-h-[calc(100dvh-2rem)]" : "max-h-[calc(100dvh-1rem)]",
          wide ? "max-w-lg" : "max-w-sm",
        )}
      >
        {title !== undefined && (
          // A title bar that stays put while a long card scrolls, so closing is always one tap away.
          <div className="sticky -top-5 z-10 -mx-5 -mt-5 mb-1 flex items-center justify-between gap-3 bg-panel/95 px-5 pb-2 pt-5 backdrop-blur">
            <h2 className="min-w-0 font-display text-xl font-extrabold">{title}</h2>
            <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
        )}
        {children}
      </section>
    </div>
  );
}
