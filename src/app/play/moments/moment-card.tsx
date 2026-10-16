"use client";

import { useState } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { EFFECTS, MOMENT_BY_ID, choiceCost, choiceOrder, fillMoment, momentText, type EffectId, type MomentOutcome, type MomentSpot } from "@/lib/world/moments";
import { CAST_BY_ID, feelingWord } from "@/lib/world/cast";
import { cash } from "@/lib/world/value";
import { momentAnswer, type MomentShown } from "../moment-actions";
import { playSfx } from "../sound";

// One moment's card (docs/MOMENTS.md): the story, the choices (greyed out when you can't afford
// one), then what came of it. Over the map (./moments-layer.tsx) and in the trip film
// (../trip/trip-layer.tsx).

const SPOT_TINT: Record<MomentSpot, string> = {
  street: "from-[#ffd8a8] to-[#ff922b]",
  home: "from-[#d3f9d8] to-[#51cf66]",
  food: "from-[#ffe3e3] to-[#ff8787]",
  night: "from-[#e5dbff] to-[#845ef7]",
  sport: "from-[#d0ebff] to-[#4dabf7]",
  shop: "from-[#fff3bf] to-[#fcc419]",
  worship: "from-[#f3f0ff] to-[#b197fc]",
  outdoors: "from-[#c3fae8] to-[#20c997]",
  work: "from-[#e9ecef] to-[#868e96]",
  road: "from-[#fff3bf] to-[#f59f00]",
};
type Answered = {
  text: string;
  cash: number;
  rep: number;
  effect: EffectId | null;
  cast: { who: string; feeling: number; bond: number } | null;
  player: { name: string; gave: number; note: string | null } | null;
  opens?: "career";
};

/** How it went, for the film: well (reputation or money in), badly, or neither. */
export type MomentMood = "happy" | "angry" | "calm";
const moodOf = (o: MomentOutcome, tone: string | undefined): MomentMood => ((o.rep ?? 0) > 0 || (o.get ?? 0) > 0 ? "happy" : (o.rep ?? 0) < 0 || tone === "mean" ? "angry" : "calm");

/**
 * onAnswered: the choice is settled (with how it went); onClose: closed (the cross before choosing,
 * which changes nothing, or Carry on after). closeLabel: the cross's name.
 */
export function MomentCard({ shown, onClose, onAnswered, closeLabel = "Walk away", className }: { shown: MomentShown; onClose: () => void; onAnswered?: (mood: MomentMood) => void; closeLabel?: string; className?: string }) {
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const def = shown.def ?? MOMENT_BY_ID.get(shown.moment);
  if (!def) return null;
  const naira = (v: number) => cash(v / shown.perMint);
  const fill = (t: string) => fillMoment(t, shown.vars, naira);

  async function choose(i: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await momentAnswer(shown.id, i).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const c = def!.choices[i];
    const o = c.outcomes[r.outcome] ?? c.outcomes[0];
    setAnswered({ text: fill(o.text), cash: r.cash, rep: r.rep, effect: r.effect, cast: r.cast, player: r.player, opens: o.opens });
    if (r.player?.gave) window.dispatchEvent(new Event("nt-money-changed"));
    if (r.cash || r.rep) window.dispatchEvent(new Event("nt-money-changed"));
    playSfx(r.cash > 0 || r.rep > 0 ? "found" : r.cash < 0 || r.rep < 0 ? "miss" : "pop");
    onAnswered?.(moodOf(o, c.tone));
  }

  return (
    <section className={cn("moment-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl bg-panel shadow-2xl ring-1 ring-ink/10", className)} role="status" aria-live="polite">
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-3xl shadow-inner", SPOT_TINT[(def.spots === "any" ? "street" : def.spots[0]) as MomentSpot])}>{def.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">{fill(def.title)}</p>
          {!answered && <p className="mt-1 text-sm leading-snug text-ink/80">{fill(momentText(def, shown.vars.seed))}</p>}
          {def.by && <p className="mt-1 text-[11px] font-semibold text-muted">Written by {def.by}</p>}
        </div>
        {!answered && (
          <button onClick={onClose} className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label={closeLabel}>
            <X className="size-4" />
          </button>
        )}
      </div>
      {!answered ? (
        <div className="flex flex-col gap-1.5 px-4 pb-4">
          {/* Every answer looks the same, in a shuffled order: nothing gives the "right" one away (docs/LIFE_WHEEL.md). */}
          {choiceOrder(def, shown.vars.seed).map((i) => {
            const c = def.choices[i];
            const cost = choiceCost(c, shown.vars.ask) / shown.perMint;
            const short = cost > shown.canSpend + 0.005;
            return (
              <button
                key={i}
                onClick={() => void choose(i)}
                disabled={busy || short}
                className="min-h-11 rounded-2xl bg-ink/[0.06] px-4 py-2 text-left text-sm font-semibold text-ink transition hover:bg-ink/[0.09] active:scale-[0.98] disabled:opacity-45"
              >
                {fill(c.label)}
                {short && <span className="ml-1.5 text-xs font-normal">(not enough on you)</span>}
              </button>
            );
          })}
          {error && <p className="text-sm text-hit">{error}</p>}
        </div>
      ) : (
        <div className="moment-in px-4 pb-4">
          <p className="text-sm leading-snug">{answered.text}</p>
          {answered.player?.gave ? (
            <p className="mt-1.5 text-xs font-semibold text-[#0b7a5a]">
              You gave {answered.player.name} {cash(answered.player.gave)}.
            </p>
          ) : null}
          {answered.player?.note && <p className="mt-1.5 text-xs font-semibold text-hit">{answered.player.note}</p>}
          {(answered.cash !== 0 || answered.rep !== 0 || answered.effect || answered.cast) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {answered.cash !== 0 && (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", answered.cash > 0 ? "bg-[#12b886]/15 text-[#0b7a5a]" : "bg-hit/10 text-hit")}>
                  {answered.cash > 0 ? "+" : "−"}
                  {cash(Math.abs(answered.cash))}
                </span>
              )}
              {answered.rep !== 0 && (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", answered.rep > 0 ? "bg-gold/25 text-ink" : "bg-hit/10 text-hit")}>
                  {answered.rep > 0 ? "+" : "−"}
                  {Math.abs(Math.round(answered.rep * 10) / 10)} reputation
                </span>
              )}
              {answered.cast && CAST_BY_ID.get(answered.cast.who) && (
                <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-bold">
                  {CAST_BY_ID.get(answered.cast.who)!.emoji} {CAST_BY_ID.get(answered.cast.who)!.name}: {feelingWord(answered.cast.feeling).toLowerCase()}
                  {answered.cast.bond > 0 ? " ↑" : answered.cast.bond < 0 ? " ↓" : ""}
                </span>
              )}
              {answered.effect && (
                <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-bold" title={EFFECTS[answered.effect].about}>
                  {EFFECTS[answered.effect].emoji} {EFFECTS[answered.effect].name}
                </span>
              )}
            </div>
          )}
          {answered.opens === "career" && (
            <button
              onClick={() => {
                window.dispatchEvent(new Event("nt-open-career"));
                onClose();
              }}
              className="mt-3 h-10 w-full rounded-full bg-gold text-sm font-semibold text-ink"
            >
              Choose what to start
            </button>
          )}
          <button onClick={onClose} className={cn("h-10 w-full rounded-full text-sm font-semibold", answered.opens ? "mt-1.5 bg-ink/10 text-ink" : "mt-3 bg-ink text-white")}>
            Carry on
          </button>
        </div>
      )}
    </section>
  );
}
