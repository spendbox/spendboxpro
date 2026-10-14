"use client";

import { LoaderCircle } from "lucide-react";

// Showing pictures on their way (the ad wizard): being got ready on the phone, then going up with
// the form, so it's clear something is happening the whole time.

/** Over a picture being got ready: a spinner and how far along. */
export function PreparingOverlay({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className="absolute inset-0 grid place-items-center bg-black/45 text-white" aria-live="polite">
      <span className="flex flex-col items-center gap-1.5">
        <LoaderCircle className="size-6 animate-spin" aria-hidden />
        <span className="text-xs font-semibold">Preparing your picture… {Math.round(value)}%</span>
        <span className="h-1 w-24 overflow-hidden rounded-full bg-white/30">
          <span className="block h-full rounded-full bg-gold transition-[width] duration-200" style={{ width: `${value}%` }} />
        </span>
      </span>
    </span>
  );
}

/**
 * The upload going up, live: a bar with the percentage and how much, then "Opening the payment
 * page…" once it's all there (Paystack takes a moment more).
 */
export function UploadBar({ share, bytes }: { share: number | null; bytes: number }) {
  if (share === null) return null;
  const pct = Math.round(share * 100);
  const done = share >= 1;
  return (
    <div className="rounded-2xl bg-ink/[0.05] p-3" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LoaderCircle className="size-4 shrink-0 animate-spin text-gold-dark" aria-hidden />
        {done ? "Pictures sent. Opening the payment page…" : `Uploading your pictures… ${pct}%`}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
        <div className={`h-full rounded-full bg-gold transition-[width] duration-200 ${done ? "animate-pulse" : ""}`} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">{done ? "Almost there: please keep this page open." : `${Math.round((share * bytes) / 1024)} KB of ${Math.max(1, Math.round(bytes / 1024))} KB · please keep this page open`}</p>
    </div>
  );
}
