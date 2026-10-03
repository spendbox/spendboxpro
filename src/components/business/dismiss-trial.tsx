"use client";

import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";

/** The free-trial note with an X. Closing it hides it until the next login. */
export function DismissTrial({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-accent-50 py-3 pr-2 pl-4 text-sm ring-1 ring-accent-100 sm:items-center lg:mb-8">
      {children}
      <button
        type="button"
        aria-label="Close the plan note"
        onClick={() => {
          document.cookie = `${TRIAL_HIDDEN_COOKIE}=1; path=/; SameSite=Lax`;
          setHidden(true);
        }}
        className="-my-1 flex size-9 shrink-0 items-center justify-center rounded-xl text-accent-700 transition hover:bg-accent-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
