"use client";

import Link from "next/link";
import { useState } from "react";
import { Coins, Eye } from "@/components/icons";
import type { AdPricing } from "@/lib/ads";
import { checkoutAd } from "./actions";
import { Billboard } from "./billboard";
import { fileInputClass, usePicture } from "./use-picture";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const label = "flex flex-col gap-1 text-sm font-medium";
const hint = "text-xs font-normal text-muted";
const fmt = (n: number) => Math.round(n).toLocaleString("en-NG");

const PRESETS = [5000, 10000, 25000, 50000];

/** The ad booking form: picture + words, budget calculator, contact, policy, pay. */
export function AdForm({ pricing }: { pricing: AdPricing }) {
  const pic = usePicture();
  const [brand, setBrand] = useState("");
  const [headline, setHeadline] = useState("");
  const [weeklyText, setWeeklyText] = useState(String(Math.max(pricing.minWeeklyNgn, 10000)));
  const [weeks, setWeeks] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekly = Math.floor(Number(weeklyText.replace(/[,\s₦]/g, "")) || 0);
  const tooSmall = weekly < pricing.minWeeklyNgn;
  const total = weekly * weeks;
  const tooBig = total > pricing.maxNgn;
  const coins = Math.floor(total * pricing.coinsPerNgn);
  const taps = Math.floor(coins / pricing.viewReward);

  return (
    <form
      className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pic.file) return setError("Please add a picture for your billboard.");
        if (tooSmall) return setError(`The smallest weekly budget is ₦${fmt(pricing.minWeeklyNgn)}.`);
        const form = new FormData(e.currentTarget);
        form.set("image", pic.file);
        form.set("weekly", String(weekly));
        form.set("weeks", String(weeks));
        setBusy(true);
        setError(null);
        try {
          const res = await checkoutAd(form);
          if (res.ok) return window.location.assign(res.url); // stay "busy" while the payment page opens
          setError(res.error);
        } catch {
          setError("Something went wrong. Please check your connection and try again.");
        }
        setBusy(false);
      }}
    >
      <h2 className="font-display text-2xl font-bold">Create your ad</h2>

      <Billboard image={pic.url} brand={brand} headline={headline} />

      <label className={label}>
        Picture
        <span className={hint}>JPG, PNG or WebP, up to 2 MB. Best size: 1200 × 600 (twice as wide as it is tall).</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" className={fileInputClass} onChange={(e) => pic.pick(e.target.files?.[0])} />
        {pic.error && <span className="text-sm text-hit">{pic.error}</span>}
      </label>
      <label className={label}>
        Brand name
        <input name="brand" className={input} required maxLength={60} value={brand} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label className={label}>
        Headline <span className={hint}>{headline.length}/60</span>
        <input
          name="headline"
          className={input}
          required
          maxLength={60}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Fresh suya, delivered in 30 minutes"
        />
      </label>
      <label className={label}>
        Link (optional)
        <span className={hint}>Where people go if they tap &ldquo;Visit&rdquo;. Must be a secure (https) website.</span>
        <input name="link" className={input} inputMode="url" maxLength={500} placeholder="https://yourwebsite.com" />
      </label>

      <div className="flex flex-col gap-3 rounded-2xl bg-panel-2 p-4">
        <div className={label}>
          Weekly budget (₦)
          <div className="flex flex-wrap gap-2">
            {PRESETS.filter((v) => v >= pricing.minWeeklyNgn).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setWeeklyText(String(v))}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${weekly === v ? "bg-ink text-white" : "bg-panel"}`}
              >
                ₦{fmt(v)}
              </button>
            ))}
          </div>
          <input
            inputMode="numeric"
            className={input}
            value={weeklyText}
            onChange={(e) => setWeeklyText(e.target.value.replace(/[^\d,]/g, ""))}
            aria-label="Weekly budget in naira"
            required
          />
          <span className={hint}>From ₦{fmt(pricing.minWeeklyNgn)} a week.</span>
        </div>
        <label className={label}>
          <span className="flex justify-between">
            How many weeks? <b>{weeks}</b>
          </span>
          <input type="range" min={1} max={pricing.maxWeeks} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="accent-gold" />
        </label>

        <div className="rounded-xl bg-panel p-4">
          {tooSmall ? (
            <p className="text-sm text-muted">Enter a weekly budget of at least ₦{fmt(pricing.minWeeklyNgn)}.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-muted">
                  ₦{fmt(weekly)} × {weeks} week{weeks === 1 ? "" : "s"}
                </span>
                <span className="font-display text-2xl font-bold">₦{fmt(total)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-panel-2 p-2">
                  <div className="flex items-center justify-center gap-1.5 font-display text-xl font-bold">
                    <Coins className="size-5 text-gold-dark" />
                    {fmt(coins)}
                  </div>
                  <div className="text-xs text-muted">mint in your ad&apos;s pool</div>
                </div>
                <div className="rounded-lg bg-panel-2 p-2">
                  <div className="flex items-center justify-center gap-1.5 font-display text-xl font-bold">
                    <Eye className="size-5 text-gold-dark" />
                    {fmt(taps)}
                  </div>
                  <div className="text-xs text-muted">players will tap your ad</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Each tap gives a player {fmt(pricing.viewReward)} mint (mint ÷ {fmt(pricing.viewReward)} = taps). Plus free taps from
                watchers and link clicks. Unused mint at the end of your run expires.
              </p>
              {tooBig && <p className="mt-2 text-sm text-hit">For budgets over ₦{fmt(pricing.maxNgn)}, please contact us.</p>}
            </>
          )}
        </div>
      </div>

      <label className={label}>
        Your name
        <input name="contact_name" className={input} autoComplete="name" required minLength={2} maxLength={80} />
      </label>
      <label className={label}>
        Email
        <span className={hint}>Your receipt, daily reports and &ldquo;Manage your ad&rdquo; link go here. No game account needed.</span>
        <input name="contact_email" type="email" className={input} autoComplete="email" required maxLength={120} />
      </label>
      <label className={label}>
        Phone (optional)
        <input name="contact_phone" type="tel" className={input} autoComplete="tel" maxLength={30} />
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input name="policy" type="checkbox" value="yes" required className="mt-1 h-4 w-4 accent-gold" />
        <span>
          I&apos;ve read the{" "}
          <Link href="/advertise/policy" target="_blank" className="font-medium underline">
            advertising policy
          </Link>{" "}
          and my ad follows it.
        </span>
      </label>

      <button className="w-full rounded-xl bg-gold px-4 py-3.5 text-lg font-semibold text-ink disabled:opacity-50" disabled={busy || tooSmall || tooBig}>
        {busy ? "Opening secure payment…" : `Pay ₦${fmt(total)} and go live`}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
