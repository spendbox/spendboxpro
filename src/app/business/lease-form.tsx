"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORIES } from "@/lib/world/business";
import type { LeaseOffer } from "@/lib/business";
import { checkoutLease } from "./actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const label = "flex flex-col gap-1 text-sm font-medium";
const hint = "text-xs font-normal text-muted";

/**
 * The lease form: who you are and what you do (as everyone on the map will see it), then pay. The
 * pictures (logo, billboard design) are chosen in the step before and uploaded with this form.
 */
export function LeaseForm({
  offer,
  logo,
  billboard,
  name: startName = "",
  onName,
}: {
  offer: LeaseOffer;
  logo: { file: File | null; url: string | null };
  billboard?: { file: File | null; url: string | null };
  name?: string;
  /** The name as it's typed (the map's preview shows it on the building). */
  onName?: (name: string) => void;
}) {
  const [name, setNameNow] = useState(startName);
  const setName = (v: string) => {
    setNameNow(v);
    onName?.(v);
  };
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        form.set("building", offer.building);
        if (logo.file) form.set("logo", logo.file);
        if (billboard?.file) form.set("billboard", billboard.file);
        setBusy(true);
        setError(null);
        try {
          const res = await checkoutLease(form);
          if (res.ok) return window.location.assign(res.url);
          setError(res.error);
        } catch {
          setError("Something went wrong. Please check your connection and try again.");
        }
        setBusy(false);
      }}
    >
      <h2 className="font-display text-xl font-bold">Your business</h2>

      <div className="flex items-center gap-3 rounded-2xl bg-ink/[0.04] p-3">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-panel ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo.url ? <img src={logo.url} alt="" className="size-full object-contain" /> : <span className="text-xs text-muted">Logo</span>}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{name || "Your business name"}</p>
          <p className="line-clamp-2 text-xs text-muted">{about || "What you do, as people on the map will see it."}</p>
        </div>
      </div>

      <label className={label}>
        Business name
        <input name="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className={label}>
        What kind of business
        <select name="category" required className={input} defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        What you do
        <span className={hint}>10 to 300 characters. Plain and true: people will visit you.</span>
        <textarea name="about" required minLength={10} maxLength={300} rows={3} value={about} onChange={(e) => setAbout(e.target.value)} className={input} />
      </label>
      <label className={label}>
        Your real address
        <span className={hint}>Where customers can find you (shown with a Directions button).</span>
        <input name="address" required maxLength={200} className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Phone <span className={hint}>Optional</span>
          <input name="phone" inputMode="tel" maxLength={30} className={input} />
        </label>
        <label className={label}>
          WhatsApp <span className={hint}>Optional</span>
          <input name="whatsapp" inputMode="tel" maxLength={30} className={input} />
        </label>
      </div>
      <label className={label}>
        Website <span className={hint}>Optional, https://</span>
        <input name="website" maxLength={300} className={input} />
      </label>

      <fieldset className="flex flex-col gap-4 border-t border-line pt-4">
        <legend className="pb-2 text-sm font-semibold">For your receipt and reports</legend>
        <label className={label}>
          Your name
          <input name="contact_name" required maxLength={80} className={input} />
        </label>
        <label className={label}>
          Email <span className={hint}>Sign in with it later to see your numbers and upgrade.</span>
          <input name="contact_email" type="email" required maxLength={120} className={input} />
        </label>
        <label className={label}>
          Phone <span className={hint}>Optional</span>
          <input name="contact_phone" inputMode="tel" maxLength={30} className={input} />
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="policy" value="yes" required className="mt-1" />
        <span>
          My details are true, my business is legal, and I agree to the{" "}
          <Link href="/advertise/policy" className="underline">
            policy
          </Link>
          . We can take down a business that breaks it.
        </span>
      </label>

      {error && <p className="rounded-xl bg-hit/10 px-4 py-3 text-sm text-hit">{error}</p>}
      <button disabled={busy} className="h-12 rounded-xl bg-gold font-semibold text-ink disabled:opacity-50">
        {busy ? "Opening the payment page…" : `Pay ₦${offer.priceNaira.toLocaleString("en-NG")} for a year`}
      </button>
    </form>
  );
}
