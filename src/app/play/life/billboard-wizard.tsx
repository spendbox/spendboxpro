"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus } from "@/components/icons";
import type { AdPricing } from "@/lib/ads";
import { billboardPricing } from "../../advertise/actions";
import { sendAdCheckout } from "../../advertise/send-with-progress";
import { PreparingOverlay, UploadBar } from "../../advertise/upload-progress";
import { Billboard } from "../../advertise/billboard";
import { usePicture } from "../../advertise/use-picture";
import type { AdPreview } from "./advertise-panel";

// Billboard ads on their own (docs/ADS.md), in three steps over the live map: your ad (it goes up on
// the billboards round you as you make it), how much and for how long (a weekly budget, 1 to 8
// weeks; it shows everywhere, to everyone online), then your details and pay. The money buys time on the city's billboards; nothing else.

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const WEEKLY = [5_000, 10_000, 25_000, 50_000];
const field = "h-11 w-full rounded-xl bg-ink/[0.05] px-4 text-base outline-none ring-gold focus:ring-2";

export const BILLBOARD_STEPS = ["Your ad", "Where & how long", "Details & pay"];

export function BillboardWizard({ step, go, onPreview }: { step: number; go: (n: number) => void; onPreview: (p: AdPreview | null) => void }) {
  const pic = usePicture();
  const [brand, setBrand] = useState("");
  const [headline, setHeadline] = useState("");
  const [link, setLink] = useState("");
  const [weekly, setWeekly] = useState(10_000);
  const [typed, setTyped] = useState("");
  const [weeks, setWeeks] = useState(2);
  const [pricing, setPricing] = useState<AdPricing | null>(null);
  const [busy, setBusy] = useState(false);
  /** How much of the upload has gone up (0..1), while paying. */
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A problem shows where you'll see it.
  const said = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (error) said.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  useEffect(() => {
    let alive = true;
    void billboardPricing()
      .then((p) => alive && setPricing(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // Your ad on the billboards round you while you make it (no building lights up).
  useEffect(() => {
    onPreview({ building: "", name: brand.trim() || "YOUR BRAND", line: headline.trim(), logo: null, billboard: pic.url });
  }, [brand, headline, pic.url, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const min = pricing?.minWeeklyNgn ?? 5_000;
  const maxWeeks = pricing?.maxWeeks ?? 8;
  const total = weekly * weeks;
  const tooBig = !!pricing && total > pricing.maxNgn;

  const next0 = () => {
    if (pic.preparing !== null) return setError("Your picture is still being prepared. One moment…");
    if (!pic.file) return setError("Add a picture for your billboard first.");
    if (brand.trim().length < 2) return setError("Add your brand name.");
    if (headline.trim().length < 2) return setError("Add a short line for your ad.");
    setError(null);
    go(1);
  };
  const next1 = () => {
    if (weekly < min) return setError(`The smallest weekly budget is ${naira(min)}.`);
    if (tooBig) return setError(`For more than ${naira(pricing!.maxNgn)}, please contact us.`);
    setError(null);
    go(2);
  };

  return (
    <div className="space-y-3">
      {error && step < 2 && <p ref={said} className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}

      {step === 0 && (
        <>
          <p className="text-sm text-muted">Make your billboard. It&apos;s already up on the billboards round you on the map behind: tap the arrow at the top to look.</p>
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl bg-ink/[0.04] p-2 text-center ring-1 ring-line">
            <span className="relative grid aspect-[2/1] w-full place-items-center overflow-hidden rounded-xl bg-panel">
              {pic.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview
                <img src={pic.url} alt="" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-7 text-muted" />
              )}
              <PreparingOverlay value={pic.preparing} />
            </span>
            <span className="text-sm font-semibold">{pic.preparing !== null ? "Preparing your picture…" : pic.url ? "Change the picture" : "Upload your billboard picture"}</span>
            <span className="text-[11px] text-muted">{pic.error ?? "Wide (2:1) works best. JPG, PNG or WebP."}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pic.pick(e.target.files?.[0])} />
          </label>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} placeholder="Brand name" className={field} />
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={60} placeholder="A short line (e.g. 20% off this week)" className={field} />
          <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="Your website or WhatsApp link (optional)" className={field} />
          <Billboard image={pic.url} brand={brand} headline={headline} />
          {(pic.url || brand.trim()) && (
            <p className="rounded-2xl bg-[#e7f5ff] px-3 py-2 text-xs text-[#1864ab]">
              <b>Only you can see this.</b> The billboards around you show your ad as a preview while you make it. Everyone else sees it once it&apos;s paid for and live.
            </p>
          )}
          <button onClick={next0} className="h-11 w-full rounded-full bg-ink font-semibold text-white">
            Next: how much and how long
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <p className="text-[11px] text-muted">Your billboards show to everyone online.</p>
          <div>
            <p className="text-xs font-semibold text-muted">How much a week?</p>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {WEEKLY.filter((w) => w >= min).map((w) => (
                <button
                  key={w}
                  onClick={() => {
                    setWeekly(w);
                    setTyped("");
                  }}
                  className={`h-10 rounded-xl text-sm font-bold tabular-nums ${weekly === w && !typed ? "bg-gold text-ink" : "bg-ink/[0.05]"}`}
                >
                  {naira(w)}
                </button>
              ))}
            </div>
            <input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                const n = Number(e.target.value.replace(/[^\d]/g, ""));
                if (n > 0) setWeekly(n);
              }}
              inputMode="numeric"
              placeholder={`Or your own amount (at least ${naira(min)})`}
              className={`${field} mt-1.5`}
            />
            <p className="mt-1 text-[11px] text-muted">More a week means your ad comes round the billboards more often.</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">For how many weeks?</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {Array.from({ length: maxWeeks }, (_, k) => k + 1).map((w) => (
                <button key={w} onClick={() => setWeeks(w)} className={`h-10 min-w-10 rounded-xl px-2 text-sm font-bold ${weeks === w ? "bg-ink text-white" : "bg-ink/[0.05]"}`}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-gold/15 px-3 py-2.5 text-sm">
            <b>
              {naira(weekly)} a week × {weeks} week{weeks === 1 ? "" : "s"} = {naira(total)}
            </b>
            <span className="block text-xs text-muted">On billboards for everyone online, from when it&apos;s checked (usually within a day).</span>
          </div>
          <button onClick={next1} className="h-11 w-full rounded-full bg-ink font-semibold text-white">
            Next: your details
          </button>
        </>
      )}

      {step === 2 && (
        <form
          className="space-y-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pic.file) return go(0);
            const form = new FormData(e.currentTarget);
            form.set("kind", "billboard");
            form.set("image", pic.file);
            form.set("brand", brand);
            form.set("headline", headline);
            form.set("link", link);
            // No state to pick: billboards show everywhere, to everyone online.
            form.set("region", "");
            form.set("weekly", String(weekly));
            form.set("weeks", String(weeks));
            setBusy(true);
            setError(null);
            // The picture goes up with the form: show it going, live (src/app/advertise/send-with-progress.ts).
            setSent(0);
            const res = await sendAdCheckout(form, setSent);
            if (res.ok) return window.location.assign(res.url);
            setSent(null);
            setError(res.error);
            setBusy(false);
          }}
        >
          <div className="flex items-center gap-3 rounded-2xl bg-ink/[0.04] p-3">
            <div className="aspect-[2/1] w-20 shrink-0 overflow-hidden rounded-lg bg-panel">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
              {pic.url && <img src={pic.url} alt="" className="size-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{brand}</p>
              <p className="text-xs text-muted">
                {weeks} week{weeks === 1 ? "" : "s"} · everyone online
              </p>
            </div>
            <b className="shrink-0">{naira(total)}</b>
          </div>
          <p className="text-xs font-semibold text-muted">For your receipt and reports</p>
          <input name="contact_name" required maxLength={80} placeholder="Your name" className={field} />
          <input name="contact_email" type="email" required maxLength={120} placeholder="Email (you sign in with it to see your numbers)" className={field} />
          <input name="contact_phone" inputMode="tel" maxLength={30} placeholder="Phone (optional)" className={field} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="policy" value="yes" required className="mt-1" />
            <span>
              My ad is true and legal, and I agree to the{" "}
              <Link href="/advertise/policy" className="underline" target="_blank">
                policy
              </Link>
              .
            </span>
          </label>
          <p className="flex items-start gap-2 rounded-xl bg-gold/15 px-3 py-2 text-xs">
            <Check className="mt-0.5 size-3.5 shrink-0 text-gold-dark" />
            Pay by card or transfer (Paystack). Afterwards you can see how many people saw it, pause it, or add weeks from your ad page.
          </p>
          {error && <p ref={said} className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}
          <UploadBar share={sent} bytes={pic.file?.size ?? 0} />
          <button disabled={busy} className="h-12 w-full rounded-full bg-gold font-semibold text-ink disabled:opacity-50">
            {busy ? "Sending…" : `Pay ${naira(total)}`}
          </button>
        </form>
      )}
    </div>
  );
}
