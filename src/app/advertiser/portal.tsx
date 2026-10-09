"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pause, Pencil, Play, Plus } from "@/components/icons";
import type { AdPricing, PortalAd } from "@/lib/ads";
import { Billboard } from "../advertise/billboard";
import { fileInputClass, usePicture } from "../advertise/use-picture";
import { editAd, setAdPaused, signOutAdvertiser, topUpAd } from "./actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const label = "flex flex-col gap-1 text-sm font-medium";
const hint = "text-xs font-normal text-muted";
const fmt = (n: number) => Math.round(n).toLocaleString("en-NG");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export function SignOutButton() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted"
      disabled={busy}
      onClick={() =>
        start(async () => {
          await signOutAdvertiser();
          router.refresh();
        })
      }
    >
      Sign out
    </button>
  );
}

const STATUS: Record<PortalAd["status"], { text: string; tone: string }> = {
  live: { text: "Live", tone: "bg-me/15 text-me" },
  paused: { text: "Paused", tone: "bg-gold/25 text-gold-dark" },
  finished: { text: "Finished: mint used up", tone: "bg-panel-2 text-muted" },
  ended: { text: "Finished: time's up", tone: "bg-panel-2 text-muted" },
  stopped: { text: "Stopped by us", tone: "bg-hit/10 text-hit" },
};

type Panel = null | "edit" | "topup";

export function AdCard({ ad, pricing, payments }: { ad: PortalAd; pricing: AdPricing; payments: boolean }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const st = STATUS[ad.status];
  const used = ad.coinsTotal > 0 ? Math.min(1, (ad.coinsTotal - ad.coinsLeft) / ad.coinsTotal) : 1;
  const tapsLeft = Math.floor(ad.coinsLeft / pricing.viewReward);
  const canPause = ad.status === "live" || ad.status === "paused";
  const canTopUp = payments && (ad.status === "live" || ad.status === "paused" || ad.status === "finished" || ad.status === "ended");

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- the advertiser's own picture */}
        <img src={ad.image} alt="" className="aspect-[2/1] w-32 shrink-0 rounded-lg border border-line object-cover sm:w-40" />
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.text}</span>
          <h2 className="mt-1 truncate font-display text-lg font-bold">{ad.brand}</h2>
          <p className="truncate text-sm text-muted">{ad.headline}</p>
          {ad.link && <p className="truncate text-xs text-muted">{ad.link}</p>}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">
            {fmt(ad.coinsLeft)} <span className="font-normal text-muted">of {fmt(ad.coinsTotal)} mint left</span>
          </span>
          <span className="text-muted">≈ {fmt(tapsLeft)} more paid taps</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-panel-2">
          <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round((1 - used) * 100)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Paid views" value={fmt(ad.rewardedViews)} hint="Players who tapped and earned mint" />
        <Stat label="Free views" value={fmt(ad.freeViews)} hint="Watchers & players over their limit" />
        <Stat label="Link clicks" value={fmt(ad.clicks)} />
        <Stat
          label={ad.status === "live" || ad.status === "paused" ? "Days left" : "Ended"}
          value={ad.status === "live" || ad.status === "paused" ? fmt(ad.daysLeft) : ad.endsAt ? shortDate(ad.endsAt) : "—"}
        />
      </div>
      <p className="-mt-2 text-xs text-muted">
        Seen on billboards (never charged): {fmt(ad.sightings)}
        {ad.endsAt && (ad.status === "live" || ad.status === "paused") ? ` · Runs until ${shortDate(ad.endsAt)}` : ""}
      </p>

      {ad.week.length > 0 && (
        <details className="rounded-xl bg-panel-2 px-4 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Last 7 days</summary>
          <table className="mt-2 w-full text-left">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Paid</th>
                <th className="py-1 text-right font-medium">Free</th>
                <th className="py-1 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {ad.week.map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1">{shortDate(`${d.day}T12:00:00Z`)}</td>
                  <td className="py-1 text-right">{fmt(d.views)}</td>
                  <td className="py-1 text-right">{fmt(d.freeViews)}</td>
                  <td className="py-1 text-right">{fmt(d.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {ad.status !== "stopped" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPanel(panel === "edit" ? null : "edit")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-semibold ${panel === "edit" ? "bg-ink text-white" : "bg-panel-2"}`}
          >
            <Pencil className="size-4" />
            Edit
          </button>
          {canPause && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await setAdPaused(ad.id, ad.status !== "paused");
                  if (!res.ok) setError(res.error);
                  router.refresh();
                })
              }
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-panel-2 px-3 py-2.5 font-semibold disabled:opacity-50"
            >
              {ad.status === "paused" ? (
                <>
                  <Play className="size-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="size-4" />
                  Pause
                </>
              )}
            </button>
          )}
          {canTopUp && (
            <button
              type="button"
              onClick={() => setPanel(panel === "topup" ? null : "topup")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-semibold ${panel === "topup" ? "bg-ink text-white" : "bg-gold text-ink"}`}
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Top up
            </button>
          )}
        </div>
      )}
      {ad.status === "paused" && <p className="-mt-2 text-xs text-muted">While paused, your ad isn&apos;t shown and no mint is used. The days keep counting.</p>}
      {error && <p className="text-sm text-hit">{error}</p>}

      {panel === "edit" && <EditPanel ad={ad} onDone={() => setPanel(null)} />}
      {panel === "topup" && <TopUpPanel ad={ad} pricing={pricing} />}
    </section>
  );
}

function Stat({ label, value, hint: h }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-3 py-2.5" title={h}>
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function EditPanel({ ad, onDone }: { ad: PortalAd; onDone: () => void }) {
  const router = useRouter();
  const pic = usePicture();
  const [headline, setHeadline] = useState(ad.headline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4 border-t border-line pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const form = new FormData(e.currentTarget);
        form.delete("image");
        if (pic.file) form.set("image", pic.file);
        try {
          const res = await editAd(form);
          if (res.ok) {
            onDone();
            router.refresh();
          } else setError(res.error);
        } catch {
          setError("Something went wrong. Please check your connection and try again.");
        }
        setBusy(false);
      }}
    >
      <input type="hidden" name="ad_id" value={ad.id} />
      <Billboard image={pic.url ?? ad.image} brand={ad.brand} headline={headline} />
      <label className={label}>
        New picture (optional)
        <span className={hint}>JPG, PNG or WebP, up to 2 MB. Best size: 1200 × 600.</span>
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className={fileInputClass} onChange={(e) => pic.pick(e.target.files?.[0])} />
        {pic.error && <span className="text-sm text-hit">{pic.error}</span>}
      </label>
      <label className={label}>
        Headline <span className={hint}>{headline.length}/60</span>
        <input name="headline" className={input} required maxLength={60} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </label>
      <label className={label}>
        Link <span className={hint}>Leave empty for no link. Must be a secure (https) website.</span>
        <input name="link" className={input} inputMode="url" maxLength={500} defaultValue={ad.link ?? ""} placeholder="https://yourwebsite.com" />
      </label>
      <button className="w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      <p className="-mt-2 text-xs text-muted">Changes show on billboards within a few minutes. Please keep to our advertising policy.</p>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}

function TopUpPanel({ ad, pricing }: { ad: PortalAd; pricing: AdPricing }) {
  const [amount, setAmount] = useState(String(pricing.minWeeklyNgn));
  const timeOver = ad.needsWeek;
  const maxExtra = Math.max(pricing.maxWeeks - ad.weeksLeft, 0);
  const [weeks, setWeeks] = useState(timeOver ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ngn = Math.floor(Number(amount.replace(/[,\s₦]/g, "")) || 0);
  const coins = Math.floor(ngn * pricing.coinsPerNgn);
  const taps = Math.floor(coins / pricing.viewReward);
  const tooSmall = ngn < pricing.minWeeklyNgn;
  return (
    <form
      className="flex flex-col gap-4 border-t border-line pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (tooSmall) return setError(`The smallest top-up is ₦${fmt(pricing.minWeeklyNgn)}.`);
        setBusy(true);
        setError(null);
        try {
          const res = await topUpAd(new FormData(e.currentTarget));
          if (res.ok) return window.location.assign(res.url);
          setError(res.error);
        } catch {
          setError("Something went wrong. Please check your connection and try again.");
        }
        setBusy(false);
      }}
    >
      <input type="hidden" name="ad_id" value={ad.id} />
      <label className={label}>
        Add budget (₦)
        <span className={hint}>From ₦{fmt(pricing.minWeeklyNgn)}.</span>
        <input name="amount" inputMode="numeric" className={input} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))} required />
      </label>
      {maxExtra > 0 && (
        <label className={label}>
          Extra weeks: {weeks}
          <span className={hint}>{timeOver ? "Your ad's time is up, so it needs at least 1 more week." : "Optional: run for longer."}</span>
          <input
            name="weeks"
            type="range"
            min={timeOver ? 1 : 0}
            max={maxExtra}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="accent-gold"
          />
        </label>
      )}
      {maxExtra === 0 && <input type="hidden" name="weeks" value={0} />}
      <div className="rounded-xl bg-panel-2 p-4 text-sm">
        {tooSmall ? (
          <span className="text-muted">Enter at least ₦{fmt(pricing.minWeeklyNgn)}.</span>
        ) : (
          <>
            Adds <b>{fmt(coins)} mint</b> to your pool: about <b>{fmt(taps)} more players</b> tapping your ad.
          </>
        )}
      </div>
      <button className="w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50" disabled={busy || tooSmall}>
        {busy ? "Opening secure payment…" : `Pay ₦${fmt(ngn)} with Paystack`}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
