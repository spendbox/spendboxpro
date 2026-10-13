"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

// On your home card, when home is your free room (docs/STARTER_ROOMS.md): it's free, and you can
// move to a free room in another neighbourhood once.

type Info = { room: { unit: string; label: string } | null; canMove: boolean; areas: string[] } | null;

export function StarterRoomBox({ onMoved }: { onMoved: (r: { area: string; x: number; z: number }) => void }) {
  const [info, setInfo] = useState<Info | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const move = async (area: string) => {
    setBusy(true);
    setError(null);
    const r = (await fetch("/api/starter-room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ area }) })
      .then((x) => x.json())
      .catch(() => ({ error: "The connection blinked." }))) as { error?: string; area?: string; x?: number; z?: number };
    setBusy(false);
    if (r.error || r.x === undefined || r.z === undefined) return setError(r.error ?? "That didn't work.");
    setInfo({ ...info, canMove: false });
    setPicking(false);
    onMoved({ area: r.area ?? area, x: r.x, z: r.z });
  };
  return (
    <div className="mt-3 rounded-2xl bg-ink/5 p-3 text-sm">
      <p>
        <b>Your free room.</b> It&apos;s yours to live in for free. When you buy a home of your own, it goes to the next new player.
      </p>
      {info.canMove && !picking && (
        <button onClick={() => setPicking(true)} className="mt-2 flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white">
          <MapPin className="size-3.5" /> Move to another free room (once)
        </button>
      )}
      {info.canMove && picking && (
        <div className="mt-2">
          <p className="mb-1.5 text-xs text-muted">Pick a neighbourhood. You can only move once.</p>
          <div className="flex flex-wrap gap-1.5">
            {info.areas.map((a) => (
              <button key={a} disabled={busy} onClick={() => void move(a)} className="h-8 rounded-full bg-white px-3 text-xs font-semibold shadow-sm disabled:opacity-40">
                {a}
              </button>
            ))}
          </div>
        </div>
      )}
      {!info.canMove && <p className="mt-1 text-xs text-muted">You&apos;ve used your free move.</p>}
      {error && <p className="mt-1 text-xs text-hit">{error}</p>}
    </div>
  );
}
