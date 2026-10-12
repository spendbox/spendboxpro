"use client";

import { House, Users, X } from "@/components/icons";
import { PencilRuler } from "lucide-react";
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
export function HomeCard({ label, area, neighbours, onClose, onPlan }: { label: string; area: string; neighbours: Neighbour[] | null; onClose: () => void; onPlan?: () => void }) {
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
            <p className="truncate font-semibold">{label}</p>
            <p className="truncate text-sm text-muted">{area}</p>
          </div>
          <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {onPlan && (
          <button onClick={onPlan} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white">
            <PencilRuler className="size-4" /> Plan my home: rooms, floors, furniture
          </button>
        )}

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
