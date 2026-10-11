"use client";

import { House, Search, Sparkles } from "@/components/icons";
import { PACKS } from "@/lib/world/packs";
import type { Prices } from "@/lib/world/region";
import { mintLocal } from "@/lib/world/value";
import { Sheet } from "../sheet";

/** The first thing on a real map: your starting budget, and why a home comes first. */
export function StartLife({
  place,
  budget,
  prices,
  started,
  busy,
  granted,
  pretend,
  onStart,
  onPack,
  onClose,
}: {
  place: string;
  budget: number;
  prices: Prices;
  started: boolean;
  busy: boolean;
  /** What your life started with so far (packs only top up to more). */
  granted: number;
  /** The world lab: packs are pretend, nothing is paid. */
  pretend?: boolean;
  onStart: () => void;
  onPack: (id: string) => void;
  onClose: () => void;
}) {
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
      {/* One pack per account: once you've started bigger than free, they're gone. */}
      {granted <= PACKS[0].mint && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-gold-dark" /> Or start bigger, once
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {PACKS.filter((p) => p.naira > 0).map((p) => (
              <button
                key={p.id}
                disabled={busy || p.mint <= granted}
                onClick={() => onPack(p.id)}
                className="rounded-2xl bg-ink/[0.04] px-2 py-3 text-center ring-1 ring-ink/5 hover:bg-gold/15 disabled:opacity-40"
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-gold-dark">{p.label}</span>
                <span className="block font-display text-base font-extrabold tabular-nums">₥{(p.mint / 1000).toLocaleString("en-GB")}k</span>
                <span className="block text-xs font-semibold">₦{p.naira.toLocaleString("en-GB")}</span>
                <span className="mt-1 block text-[10px] leading-tight text-muted">{p.what}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {pretend ? "In this test page packs are pretend: nothing is paid." : "Paid once through Paystack. Mint can't be turned back into cash."}
          </p>
        </div>
      )}
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
