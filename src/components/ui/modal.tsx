"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Gap kept between the pop-up and the keyboard / top of the screen on phones. */
const GAP = 16;

/**
 * On phones, keep the pop-up above the on-screen keyboard and inside the part
 * of the screen you can actually see (iOS doesn't shrink the page for the
 * keyboard, so we follow the "visual viewport" instead).
 */
function usePhoneFit(open: boolean) {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const update = () => {
      if (window.innerWidth >= 640) {
        setStyle(undefined);
        return;
      }
      const visible = vv ? vv.height : window.innerHeight;
      const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      setStyle({ bottom: keyboard ? keyboard + GAP : 0, maxHeight: visible - (keyboard ? GAP * 2 : GAP * 2) });
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  return style;
}

/**
 * A dialog that slides up from the bottom on phones and sits in the middle on
 * larger screens. Uses the native <dialog> element, so Esc, focus and screen
 * readers work out of the box. The title stays put; the content scrolls.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fit = usePhoneFit(open);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // When a field gets focus (and the keyboard slides up), bring it into view inside the pop-up.
  useEffect(() => {
    const body = bodyRef.current;
    if (!open || !body) return;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches("input, textarea, select")) return;
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 320);
    };
    body.addEventListener("focusin", onFocus);
    return () => body.removeEventListener("focusin", onFocus);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      style={fit}
      className={cn(
        // Phones: a sheet pinned to the bottom (or just above the keyboard).
        "fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none flex-col overflow-hidden rounded-t-4xl bg-white p-0 text-ink shadow-lift open:flex",
        "max-h-[calc(100dvh-2rem)]",
        // Larger screens: centred card.
        "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[calc(100dvh-4rem)] sm:max-w-lg sm:rounded-4xl",
        "open:animate-fade-up",
        className,
      )}
    >
      {open && (
        <>
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-7 sm:pt-7">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-xl font-bold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-black/5"
            >
              <X className="size-5" />
            </button>
          </div>
          <div
            ref={bodyRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] sm:px-7 sm:pb-7"
          >
            {children}
          </div>
        </>
      )}
    </dialog>
  );
}
