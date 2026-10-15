"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

// On your home card, when home is your free room (docs/STARTER_ROOMS.md). It's free to live in.
// Moving isn't: to live anywhere else (Banana Island, Ikoyi, anywhere) you buy or rent a home there
// at its price, from Find a home.

type Info = { room: { unit: string; label: string } | null } | null;

export function StarterRoomBox({ onFindHome }: { onFindHome: () => void }) {
  const [info, setInfo] = useState<Info | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetch("/api/starter-room", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Info>) : null))
      .then((v) => alive && setInfo(v))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, []);
  if (!info?.room) return null;
  return (
    <div className="mt-3 rounded-2xl bg-ink/5 p-3 text-sm">
      <p>
        <b>Your free room.</b> It&apos;s yours to live in for free. When you buy a home of your own, it goes to the next new player.
      </p>
      <p className="mt-1 text-xs text-muted">Want to live somewhere else, like Ikoyi or Banana Island? Buy or rent a home there at its price.</p>
      <button onClick={onFindHome} className="mt-2 flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white">
        <Search className="size-3.5" /> Find a home
      </button>
    </div>
  );
}
