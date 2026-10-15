"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { MOMENT_BY_ID, choiceCost, fillMoment, momentText, spotOfTheme, type MomentSpot } from "@/lib/world/moments";
import { cash } from "@/lib/world/value";
import { momentAnswer, momentNext, type MomentShown } from "../moment-actions";
import { anySheetOpen } from "../sheet";
import { playSfx } from "../sound";

// Moments (docs/MOMENTS.md): every few minutes of play, if nothing else is open, a little story
// slides up over the map: someone asks for money, a wallet lies on the ground, the waiter spills
// a drink on you. Pick what you do and see what comes of it. Going into a place makes one a bit
// more likely soon after (one that fits there).

/** The first one a minute or two in, then every few minutes (the server keeps them apart too). */
const FIRST_MS: [number, number] = [75_000, 150_000];
const NEXT_MS: [number, number] = [240_000, 540_000];
const AFTER_ENTERING_MS: [number, number] = [25_000, 50_000];
const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);

/** Something else is up: the phone's in a pocket, a card or a full-screen tool is open. */
const busy = () => document.hidden || anySheetOpen() || !!document.querySelector('[role="dialog"], [role="alertdialog"]');

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
};
const TONE: Record<string, string> = {
  kind: "bg-[#12b886] text-white",
  bold: "bg-gold text-ink",
  mean: "bg-hit/10 text-hit ring-1 ring-hit/25",
  calm: "bg-ink/[0.06] text-ink",
};

type Answered = { text: string; cash: number; rep: number };

/**
 * inside: the theme of the place you're in (null on the street), home: it's a home. place: its
 * name (or the area's), for the stories.
 */
export function MomentsLayer({ inside, home, place, enabled }: { inside: string | null; home: boolean; place: string; enabled: boolean }) {
  const spot = inside == null && !home ? "street" : spotOfTheme(inside, home);
  const [shown, setShown] = useState<MomentShown | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [busyAnswer, setBusyAnswer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef({ spot, place, enabled, open: false });
  useEffect(() => {
    live.current = { ...live.current, spot, place, enabled };
  }, [spot, place, enabled]);
  useEffect(() => {
    live.current.open = !!shown;
  }, [shown]);

  // The clock: try now and then; if it's not a good moment, try again a little later.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void attempt(), ms);
  };
  const attempt = async () => {
    const l = live.current;
    if (!l.enabled || l.open) return schedule(between(NEXT_MS));
    if (busy()) return schedule(30_000);
    const m = await momentNext({ spot: l.spot, place: l.place }).catch(() => null);
    if (!m || !MOMENT_BY_ID.has(m.moment) || busy() || live.current.open) return schedule(between(NEXT_MS));
    setAnswered(null);
    setError(null);
    setShown(m);
    playSfx("pop");
    schedule(between(NEXT_MS));
  };
  useEffect(() => {
    if (!enabled) return;
    schedule(between(FIRST_MS));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Started once when moments are on; the clock reads the rest from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  // Going into somewhere new: one that fits there, a little sooner.
  const lastSpot = useRef(spot);
  useEffect(() => {
    if (!enabled || spot === lastSpot.current) return;
    lastSpot.current = spot;
    if (spot !== "street") schedule(between(AFTER_ENTERING_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, enabled]);

  if (!shown) return null;
  const def = MOMENT_BY_ID.get(shown.moment);
  if (!def) return null;
  const naira = (v: number) => cash(v / shown.perMint);
  const fill = (t: string) => fillMoment(t, shown.vars, naira);
  const close = () => {
    setShown(null);
    setAnswered(null);
  };

  async function choose(i: number) {
    if (!shown || busyAnswer) return;
    setBusyAnswer(true);
    setError(null);
    const r = await momentAnswer(shown.id, i).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusyAnswer(false);
    if (!r.ok) return setError(r.error);
    const o = def!.choices[i].outcomes[r.outcome] ?? def!.choices[i].outcomes[0];
    setAnswered({ text: fill(o.text), cash: r.cash, rep: r.rep });
    if (r.cash || r.rep) window.dispatchEvent(new Event("nt-money-changed"));
    playSfx(r.cash > 0 || r.rep > 0 ? "found" : r.cash < 0 || r.rep < 0 ? "miss" : "pop");
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] z-[55] flex justify-center px-3">
      <section key={shown.id} className="moment-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl bg-panel shadow-2xl ring-1 ring-ink/10" role="status" aria-live="polite">
        <div className="flex items-start gap-3 p-4 pb-3">
          <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-3xl shadow-inner", SPOT_TINT[(def.spots === "any" ? "street" : def.spots[0]) as MomentSpot])}>{def.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-extrabold leading-tight">{def.title}</p>
            {!answered && <p className="mt-1 text-sm leading-snug text-ink/80">{fill(momentText(def, shown.vars.seed))}</p>}
          </div>
          <button onClick={close} className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label="Walk away">
            <X className="size-4" />
          </button>
        </div>
        {!answered ? (
          <div className="flex flex-col gap-1.5 px-4 pb-4">
            {def.choices.map((c, i) => {
              const cost = choiceCost(c, shown.vars.ask) / shown.perMint;
              const short = cost > shown.canSpend + 0.005;
              return (
                <button
                  key={i}
                  onClick={() => void choose(i)}
                  disabled={busyAnswer || short}
                  className={cn("min-h-11 rounded-2xl px-4 py-2 text-left text-sm font-semibold transition active:scale-[0.98] disabled:opacity-45", TONE[c.tone ?? "calm"])}
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
            {(answered.cash !== 0 || answered.rep !== 0) && (
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
              </div>
            )}
            <button onClick={close} className="mt-3 h-10 w-full rounded-full bg-ink text-sm font-semibold text-white">
              Carry on
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
