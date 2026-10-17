"use client";

import { cn } from "@/lib/cn";

// Tapping a player's name or face anywhere opens their card (the game listens for this and
// opens it over whatever is open).

/** Open someone's card. */
export function openPerson(id: string) {
  if (!id || id.startsWith("bot:") || id.startsWith("guest")) return;
  window.dispatchEvent(new CustomEvent("nt-person", { detail: id }));
}

/** A name (or a face) you can tap to open that player's card. */
export function PersonLink({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={() => openPerson(id)} className={cn("min-w-0 text-left hover:underline", className)}>
      {children}
    </button>
  );
}
