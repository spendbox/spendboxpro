"use client";

import { useState } from "react";
import { House, Pencil, TrendingUp, Users, X } from "@/components/icons";
import { DoorOpen } from "lucide-react";
import type { Neighbour } from "@/lib/world/property-api";

/** Two letters for someone's round badge. */
const initials = (name: string) =>
  name
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** A soft colour per name, the same every time. */
function tint(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 85%)`;
}

const far = (tiles: number) => (tiles < 1 ? "next door" : `${Math.round(tiles * 100)} m away`);

/** Your home, at the bottom of the map: where it is and who lives around you. */
export function HomeCard({
  label,
  name,
  area,
  neighbours,
  onClose,
  onEnter,
  onRename,
  naming: startNaming = false,
  children,
}: {
  label: string;
  /** What the home is called now (the part you can change). */
  name?: string;
  area: string;
  neighbours: Neighbour[] | null;
  onClose: () => void;
  onEnter?: () => void;
  /** Give the home a name; resolves to an error to show, or null when done. */
  onRename?: (name: string) => Promise<string | null>;
  /** Open with the name box ready (a home just given). */
  naming?: boolean;
  children?: React.ReactNode;
}) {
  const [naming, setNaming] = useState(startNaming && !!onRename);
  const [draft, setDraft] = useState(name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!onRename) return;
    setBusy(true);
    setError(null);
    const e = await onRename(draft);
    setBusy(false);
    if (e) return setError(e);
    setNaming(false);
  };
  const inside = (neighbours ?? []).filter((n) => n.sameBuilding);
  const around = (neighbours ?? []).filter((n) => !n.sameBuilding);
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-20 z-30 flex justify-center px-3">
      <section className="glass w-full max-w-sm rounded-3xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-me/15 text-me">
            <House className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Home</p>
            {naming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
                className="mt-0.5 flex gap-1.5"
              >
                <input
                  autoFocus
                  value={draft}
                  maxLength={40}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Name your home"
                  className="h-9 min-w-0 flex-1 rounded-full bg-white px-3 text-sm outline-none ring-1 ring-ink/15 focus:ring-me"
                />
                <button disabled={busy} className="h-9 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50">
                  {busy ? "…" : "Save"}
                </button>
              </form>
            ) : (
              <p className="flex items-center gap-1.5 font-semibold">
                <span className="truncate">{label}</span>
                {onRename && (
                  <button onClick={() => setNaming(true)} className="grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label="Rename your home" title="Rename">
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </p>
            )}
            {naming && <p className="mt-1 text-[11px] text-muted">Give it a name, like &quot;Tolu&apos;s Pad&quot;.</p>}
            {error && <p className="mt-1 text-xs text-hit">{error}</p>}
            <p className="truncate text-sm text-muted">{area}</p>
          </div>
          <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          {onEnter && (
            <button onClick={onEnter} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-gold text-sm font-semibold text-ink">
              <DoorOpen className="size-4" /> Enter home
            </button>
          )}
          <button disabled className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink/5 text-sm font-semibold text-muted" title="Coming soon">
            <TrendingUp className="size-4" /> Upgrade <span className="rounded-full bg-gold/30 px-1.5 text-[10px] text-ink">Soon</span>
          </button>
        </div>

        {children}

        <div className="mt-3 border-t border-ink/5 pt-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Users className="size-4 text-muted" />
            {neighbours === null ? "Neighbours" : neighbours.length === 0 ? "No neighbours yet" : `${neighbours.length} ${neighbours.length === 1 ? "neighbour" : "neighbours"}`}
          </p>
          {neighbours === null ? (
            <p className="mt-1 text-xs text-muted">Looking…</p>
          ) : neighbours.length === 0 ? (
            <p className="mt-1 text-xs text-muted">When other players move in near you, they&apos;ll show here.</p>
          ) : (
            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {inside.length > 0 && <Group title="In your building" people={inside} />}
              {around.length > 0 && <Group title="Around you" people={around} />}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Group({ title, people }: { title: string; people: Neighbour[] }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {people.map((n, k) => (
          <li key={`${n.name}-${k}`} className="flex items-center gap-1.5 rounded-full bg-ink/[0.04] py-0.5 pl-0.5 pr-2.5 text-xs">
            <span className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-ink" style={{ background: tint(n.name) }}>
              {initials(n.name)}
            </span>
            <span className="font-medium">{n.name}</span>
            <span className="text-muted">{n.sameBuilding ? (n.unit ?? "") : far(n.tiles)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
