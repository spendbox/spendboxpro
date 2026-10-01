"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A dialog that slides up from the bottom on phones and sits in the middle on
 * larger screens. Uses the native <dialog> element, so Esc, focus and screen
 * readers work out of the box.
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-4xl bg-white p-0 text-ink shadow-lift",
        "sm:m-auto sm:max-w-lg sm:rounded-4xl",
        "open:animate-fade-up",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-5 p-5 pb-safe sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold">{title}</h2>
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
          <div className="pb-2">{children}</div>
        </div>
      )}
    </dialog>
  );
}
