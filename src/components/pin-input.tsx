"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A 6-digit PIN field: six boxes that fill as you type (so it's obvious it wants six),
 * with an eye button to show or hide the digits. One real input underneath does the work.
 */
export function PinInput({
  value,
  onChange,
  label,
  autoFocus,
  autoComplete = "current-password",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-panel-2"
          aria-label={show ? "Hide PIN" : "Show PIN"}
        >
          {show ? <EyeOff /> : <Eye />}
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <label className="relative block">
        <span className="sr-only">{label}</span>
        <input
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          type={show ? "text" : "password"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <span className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => {
            const filled = i < value.length;
            const current = focused && i === Math.min(value.length, 5);
            return (
              <span
                key={i}
                className={cn(
                  "grid h-12 place-items-center rounded-xl border bg-panel font-display text-xl font-bold",
                  current ? "border-gold ring-2 ring-gold/30" : filled ? "border-ink/30" : "border-line",
                )}
              >
                {filled ? (show ? value[i] : "•") : ""}
              </span>
            );
          })}
        </span>
      </label>
      <p className="mt-1 text-xs text-muted">
        6 digits · {value.length}/6
      </p>
    </div>
  );
}

function Eye() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.1 6.1C3.6 7.8 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1" />
    </svg>
  );
}
