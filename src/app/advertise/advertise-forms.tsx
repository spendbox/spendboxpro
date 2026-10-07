"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdPricing } from "@/lib/ads";
import { checkoutAd, checkoutSponsor } from "./actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const label = "flex flex-col gap-1 text-sm font-medium";
const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";
const hint = "text-xs font-normal text-muted";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const fmt = (n: number) => n.toLocaleString("en-NG");

type Tab = "ad" | "sponsor";

export function AdvertiseForms({ pricing }: { pricing: AdPricing }) {
  const [tab, setTab] = useState<Tab>("ad");
  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-panel-2 p-1">
        {(
          [
            ["ad", "Billboard ad"],
            ["sponsor", "Sponsor a prize pool"],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-3 py-2 font-semibold ${tab === id ? "bg-panel shadow-sm" : "text-muted"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "ad" ? <AdForm pricing={pricing} /> : <SponsorForm pricing={pricing} />}
    </section>
  );
}

/** Picks a picture, checks it, and shows a preview. */
function usePicture() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function pick(f: File | null | undefined) {
    setError(null);
    if (url) URL.revokeObjectURL(url);
    setFile(null);
    setUrl(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Please choose a JPG, PNG or WebP picture.");
    if (f.size > MAX_BYTES) return setError("That picture is over 2 MB. Please use a smaller one.");
    setFile(f);
    setUrl(URL.createObjectURL(f));
  }
  return { file, url, error, pick };
}

function Contact() {
  return (
    <>
      <label className={label}>
        Your name
        <input name="contact_name" className={input} autoComplete="name" required minLength={2} maxLength={80} />
      </label>
      <label className={label}>
        Email
        <span className={hint}>Your receipt and reports go here.</span>
        <input name="contact_email" type="email" className={input} autoComplete="email" required maxLength={120} />
      </label>
      <label className={label}>
        Phone (optional)
        <input name="contact_phone" type="tel" className={input} autoComplete="tel" maxLength={30} />
      </label>
    </>
  );
}

function PolicyBox() {
  return (
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
  );
}

function useSubmit(action: (form: FormData) => Promise<{ ok: true; url: string } | { ok: false; error: string }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await action(form);
      if (res.ok) {
        window.location.assign(res.url);
        return; // stay "busy" while the payment page opens
      }
      setError(res.error);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    }
    setBusy(false);
  }
  return { busy, error, setError, submit };
}

function AdForm({ pricing }: { pricing: AdPricing }) {
  const pic = usePicture();
  const [brand, setBrand] = useState("");
  const [headline, setHeadline] = useState("");
  const [slots, setSlots] = useState(1);
  const { busy, error, setError, submit } = useSubmit(checkoutAd);
  const total = slots * pricing.slotPriceNgn;

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pic.file) return setError("Please add a picture for your billboard.");
        const form = new FormData(e.currentTarget);
        form.set("image", pic.file);
        submit(form);
      }}
    >
      <div>
        <h2 className="font-display text-xl font-bold">Billboard ad</h2>
        <p className="text-sm text-muted">Shown on billboards in every city. Checked before it goes live.</p>
      </div>

      <Billboard image={pic.url} brand={brand} headline={headline} />

      <label className={label}>
        Picture
        <span className={hint}>JPG, PNG or WebP, up to 2 MB. Best size: 1200 × 600 (twice as wide as it is tall).</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:font-semibold"
          onChange={(e) => pic.pick(e.target.files?.[0])}
        />
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
        <span className={hint}>Where players go if they tap “Visit”. Must be a secure (https) website.</span>
        <input name="link" className={input} inputMode="url" maxLength={500} placeholder="https://yourwebsite.com" />
      </label>

      <div className={label}>
        How many slots?
        <span className={hint}>
          1 slot = {fmt(pricing.viewsPerSlot)} views within {pricing.days} days.
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="h-11 w-11 rounded-xl border border-line text-xl font-bold disabled:opacity-40"
            onClick={() => setSlots((s) => Math.max(1, s - 1))}
            disabled={slots <= 1}
            aria-label="One slot fewer"
          >
            −
          </button>
          <input
            name="slots"
            type="number"
            min={1}
            max={pricing.maxSlots}
            value={slots}
            onChange={(e) => setSlots(Math.max(1, Math.min(pricing.maxSlots, Math.floor(Number(e.target.value) || 1))))}
            className={`${input} w-24 text-center`}
          />
          <button
            type="button"
            className="h-11 w-11 rounded-xl border border-line text-xl font-bold disabled:opacity-40"
            onClick={() => setSlots((s) => Math.min(pricing.maxSlots, s + 1))}
            disabled={slots >= pricing.maxSlots}
            aria-label="One slot more"
          >
            +
          </button>
        </div>
        <input
          type="range"
          min={1}
          max={pricing.maxSlots}
          value={slots}
          onChange={(e) => setSlots(Number(e.target.value))}
          className="accent-gold"
          aria-label="Slots"
        />
      </div>

      <div className="rounded-xl bg-panel-2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">
            {slots} slot{slots === 1 ? "" : "s"} · {fmt(slots * pricing.viewsPerSlot)} views
          </span>
          <span className="font-display text-2xl font-bold">₦{fmt(total)}</span>
        </div>
      </div>

      <Contact />
      <PolicyBox />
      <button className={button} disabled={busy}>
        {busy ? "Opening secure payment…" : `Pay ₦${fmt(total)} with Paystack`}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
      <p className="text-xs text-muted">
        After paying, your ad is checked against our policy (usually in under a minute). If we can&apos;t approve it, we
        refund you in full.
      </p>
    </form>
  );
}

/** A preview of the ad as a billboard on a city street. */
function Billboard({ image, brand, headline }: { image: string | null; brand: string; headline: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-sky-200 to-sky-50 px-4 pt-4">
      <div className="mx-auto max-w-md">
        <div className="rounded-lg border-4 border-slate-700 bg-slate-800 p-1 shadow-lg">
          <div className="relative aspect-[2/1] overflow-hidden rounded bg-slate-600">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
              <img src={image} alt="Your billboard" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-300">Your picture shows here</div>
            )}
            {(brand || headline) && (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-white">
                <div className="truncate text-sm font-bold">{headline || " "}</div>
                {brand && <div className="truncate text-[11px] opacity-80">{brand}</div>}
              </div>
            )}
          </div>
        </div>
        <div className="mx-auto flex w-2/3 justify-between">
          <div className="h-10 w-2 bg-slate-700" />
          <div className="h-10 w-2 bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

function SponsorForm({ pricing }: { pricing: AdPricing }) {
  const logo = usePicture();
  const [amount, setAmount] = useState(String(pricing.sponsorMinNgn));
  const { busy, error, setError, submit } = useSubmit(checkoutSponsor);
  const ngn = Math.floor(Number(amount.replace(/[,\s₦]/g, "")) || 0);
  const coins = Math.floor(ngn * pricing.sponsorCoinsPerNgn);
  const tooSmall = ngn < pricing.sponsorMinNgn;

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (tooSmall) return setError(`The smallest sponsorship is ₦${fmt(pricing.sponsorMinNgn)}.`);
        const form = new FormData(e.currentTarget);
        form.delete("logo");
        if (logo.file) form.set("logo", logo.file);
        submit(form);
      }}
    >
      <div>
        <h2 className="font-display text-xl font-bold">Sponsor a prize pool</h2>
        <p className="text-sm text-muted">
          Your coins go into one round&apos;s prize pool, and every player in that round sees “Prize pool by your brand”. If
          the next round already has a sponsor, yours goes into the one after.
        </p>
      </div>

      <label className={label}>
        Brand name
        <input name="brand" className={input} required maxLength={60} />
      </label>
      <label className={label}>
        Logo (optional)
        <span className={hint}>JPG, PNG or WebP, up to 2 MB. A square picture works best.</span>
        <input
          type="file"
          name="logo"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:font-semibold"
          onChange={(e) => logo.pick(e.target.files?.[0])}
        />
        {logo.error && <span className="text-sm text-hit">{logo.error}</span>}
        {logo.url && (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
          <img src={logo.url} alt="Your logo" className="h-16 w-16 rounded-xl border border-line object-contain" />
        )}
      </label>
      <label className={label}>
        Amount (₦)
        <span className={hint}>
          From ₦{fmt(pricing.sponsorMinNgn)}. Every ₦{fmt(Math.round(1 / pricing.sponsorCoinsPerNgn))} adds 1 coin.
        </span>
        <input
          name="amount"
          inputMode="numeric"
          className={input}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
          required
        />
      </label>
      <div className="rounded-xl bg-panel-2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Adds to the prize pool</span>
          <span className="font-display text-2xl font-bold">{tooSmall ? "—" : `${fmt(coins)} coins`}</span>
        </div>
      </div>

      <Contact />
      <PolicyBox />
      <button className={button} disabled={busy || tooSmall}>
        {busy ? "Opening secure payment…" : `Pay ₦${fmt(ngn)} with Paystack`}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}
