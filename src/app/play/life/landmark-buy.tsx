"use client";

import { useEffect, useState, useTransition } from "react";
import { Crown, Landmark } from "@/components/icons";
import { INCOME_DAY } from "@/lib/world/property-api";
import { discounted } from "@/lib/world/rep-levels";
import { cash } from "@/lib/world/value";
import { buyLandmark, landmarkOwner, type LandmarkInfo } from "../landmark-actions";

/**
 * "Own this landmark": a landmark's (crazy) price, what it would earn you a day, who owns it, and
 * a Buy button that asks first (docs/LANDMARKS.md). Shows nothing for a place that isn't a landmark.
 */
export function LandmarkBuy({
  placeId,
  coins,
  repScore,
  signedIn = true,
  onBought,
}: {
  /** The place card's id ("lagos:12,-40") or the landmark's own ("lagos:national-stadium"). */
  placeId: string;
  /** Your money now (mint). */
  coins: number;
  /** Your reputation score (for the discount). */
  repScore: number | null;
  signedIn?: boolean;
  /** After buying: your coins now, and what you bought. */
  onBought?: (coins: number | undefined, name: string) => void;
}) {
  const [info, setInfo] = useState<LandmarkInfo | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let live = true;
    setInfo(null);
    setAsking(false);
    setError(null);
    landmarkOwner(placeId)
      .then((i) => live && setInfo(i))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [placeId]);

  if (!info) return null;
  const price = discounted(info.price, repScore ?? 0);
  const off = info.price - price;
  const shownPrice = info.owner ? (info.paid ?? info.price) : price;
  const perDay = Math.round(shownPrice * INCOME_DAY * 100) / 100;
  const afford = coins >= price;

  const buy = () =>
    start(async () => {
      setError(null);
      const r = await buyLandmark(info.id);
      if (!r.ok) {
        setError(r.error);
        setAsking(false);
        return;
      }
      setAsking(false);
      setInfo(await landmarkOwner(placeId));
      onBought?.(r.coins, info.name);
    });

  return (
    <section className="rounded-2xl bg-ink/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Landmark className="size-4 shrink-0 text-gold-dark" /> Own this landmark
        </h3>
        {info.owner && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${info.mine ? "bg-me/15 text-me" : "bg-ink/5 text-muted"}`}>
            {info.mine ? (
              <>
                <Crown className="size-3.5" /> Yours!
              </>
            ) : (
              <>Owned by {info.owner}</>
            )}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-display text-2xl font-extrabold ${info.owner ? "text-ink" : afford ? "text-[#2b8a3e]" : "text-[#c92a2a]"}`}>{cash(shownPrice)}</span>
        <span className="rounded-full bg-[#ebfbee] px-2.5 py-1 text-xs font-semibold text-[#2b8a3e]">+{cash(perDay)} a day</span>
      </div>

      {info.mine ? (
        <p className="mt-1.5 text-xs text-muted">The whole thing is yours, boss. It pays you every day, by itself.</p>
      ) : info.owner ? (
        <p className="mt-1.5 text-xs text-muted">Already taken. {info.owner} paid {cash(shownPrice)} for it, big money moves.</p>
      ) : (
        <>
          <p className="mt-1.5 text-xs text-muted">
            One owner only, for good. It earns about {Math.round(INCOME_DAY * 100)}% of the price every day.
            {off > 0 && <> Your reputation takes {cash(off)} off.</>}
            {!afford && <> You need {cash(price - coins)} more. Keep stacking!</>}
          </p>
          {!signedIn ? (
            <p className="mt-2 text-xs font-semibold text-muted">Sign in to buy it.</p>
          ) : asking ? (
            <div className="mt-2 rounded-xl bg-panel p-3 ring-1 ring-ink/10">
              <p className="text-sm font-semibold leading-snug">
                Buy {info.name} for {cash(price)}? It earns you {cash(perDay)} a day.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => setAsking(false)} disabled={busy} className="min-h-11 rounded-full bg-ink/5 px-3 text-sm font-semibold disabled:opacity-50">
                  Not yet
                </button>
                <button onClick={buy} disabled={busy} className="min-h-11 rounded-full bg-[#2b8a3e] px-3 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Buying…" : "Yes, buy it!"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAsking(true)}
              disabled={!afford}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:bg-ink/10 disabled:text-muted"
            >
              {afford ? `Buy it for ${cash(price)}` : "Too expensive for you (for now)"}
            </button>
          )}
        </>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-[#c92a2a]">{error}</p>}
    </section>
  );
}
