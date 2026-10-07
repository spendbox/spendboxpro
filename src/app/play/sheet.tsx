"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * A pop-up card: slides up from the bottom on phones, centred on bigger screens.
 * Only a tap that STARTS on the dark backdrop closes it (a tap on the city that opened it
 * must not also close it).
 */
export function Sheet({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const downOnBackdrop = useRef(false);
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
        {children}
      </section>
    </div>
  );
}
