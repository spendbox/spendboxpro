"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useEscape } from "./escape";

/**
 * The card the menu's Badges, Leaderboard and Level open in: slides up from the bottom on
 * phones, centred on bigger screens, with a title bar that stays put while the inside
 * scrolls. Drawn on top of the whole page (the menu is frosted glass, which would otherwise
 * trap it). Only a tap that STARTS on the dark backdrop closes it; Escape does too.
 */
export function MenuSheet({
  title,
  icon: Icon,
  tint,
  tall,
  onClose,
  children,
}: {
  title: string;
  icon: LucideIcon;
  /** Classes for the little icon square in the title bar (background and colour). */
  tint: string;
  /** A fixed, tall card, so a long list loading in doesn't make it jump. */
  tall?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const downOnBackdrop = useRef(false);
  const box = useRef<HTMLElement>(null);
  const titleId = useId();
  useEscape(onClose);

  // Keyboard focus moves into the card, and back to the button that opened it afterwards.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus({ preventScroll: true });
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-2 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none sm:place-items-center sm:p-4"
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <section
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "flex max-h-[calc(100dvh-1rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-panel shadow-2xl outline-none",
          "transition-[translate,opacity] duration-200 ease-out starting:translate-y-6 starting:opacity-0 motion-reduce:transition-none",
          tall && "h-[min(44rem,calc(100dvh-1rem))]",
        )}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tint)}>
            <Icon className="size-[18px]" strokeWidth={2.25} />
          </span>
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-display text-lg font-bold">
            {title}
          </h2>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
