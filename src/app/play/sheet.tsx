"use client";

import { useEffect, useRef } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";

/**
 * A pop-up card: slides up from the bottom on phones, centred on bigger screens.
 * Only a tap that STARTS on the dark backdrop closes it (a tap on the city that opened it
 * must not also close it).
 */
export function Sheet({ onClose, children, wide, title }: { onClose: () => void; children: React.ReactNode; wide?: boolean; title?: React.ReactNode }) {
  const downOnBackdrop = useRef(false);
  // Escape closes it too.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-2 backdrop-blur-[2px] sm:place-items-center sm:p-4"
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <section
        className={cn(
          "max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-3xl bg-panel p-5 shadow-2xl",
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
