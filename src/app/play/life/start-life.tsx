"use client";

import { House, Search } from "@/components/icons";
import type { Prices } from "@/lib/world/region";
import { mintLocal } from "@/lib/world/value";
import { Sheet } from "../sheet";

/** The first thing on a real map: your starting budget, and why a home comes first. */
export function StartLife({ place, budget, prices, started, busy, onStart, onClose }: { place: string; budget: number; prices: Prices; started: boolean; busy: boolean; onStart: () => void; onClose: () => void }) {
  const local = `about ${mintLocal(budget, prices)}`;
  return (
    <Sheet onClose={onClose}>
      <div className="grid size-12 place-items-center rounded-2xl bg-gold/15 text-gold-dark">
        <House className="size-6" />
      </div>
      <h2 className="mt-3 font-display text-xl font-extrabold">{started ? "Find your first home" : `Start your life in ${place}`}</h2>
      {started ? (
        <p className="mt-2 text-sm text-muted">
          You have <b className="text-ink">₥{budget.toLocaleString("en-GB")}</b> ({local}). Every life here starts with a home: a room, a flat or a house you own.
          Search for an area, or tap any building to see what it costs.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          You get <b className="text-ink">₥{budget.toLocaleString("en-GB")}</b> ({local}) to start with. First, buy somewhere to live: a room in a rooming house, a flat, or a house if
          you can find one. Then let property out, get a job, and grow from there.
        </p>
      )}
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <Search className="mt-0.5 size-4 shrink-0 text-muted" />
          Prices follow real Lagos: a room in Ajegunle is far cheaper than a flat in Ikoyi.
        </li>
        <li className="flex items-start gap-2">
          <House className="mt-0.5 size-4 shrink-0 text-muted" />
          Your home earns no rent, but you live free and it grows in value.
        </li>
      </ul>
      <button
        onClick={started ? onClose : onStart}
        disabled={busy}
        className="mt-5 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-50"
      >
        {busy ? "One moment…" : started ? "Look for a home" : `Take my ₥${budget.toLocaleString("en-GB")} · ${mintLocal(budget, prices)}`}
      </button>
    </Sheet>
  );
}
