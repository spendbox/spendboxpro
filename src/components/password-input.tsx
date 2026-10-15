"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { passwordProblem, passwordScore, STRENGTH } from "@/lib/password";

const field = "w-full rounded-xl border border-line bg-panel py-3 pl-4 pr-12 text-ink outline-none focus:border-gold";

/** Cheers for a strong password, the next one each time it gets there. */
const HYPE = [
  "Hackers hate this one.",
  "That's a vault door, not a password.",
  "Fort Knox called. They want tips.",
  "Even the area boys can't guess that.",
  "Strong like jollof at a wedding.",
  "Nobody's getting in there.",
];

/**
 * A password box with an eye to show or hide what you typed. `meter`: a strength bar as you type
 * (red to purple), with a little hype and a burst of emoji when it gets strong.
 */
export function PasswordInput({
  value,
  onChange,
  label,
  autoFocus,
  autoComplete = "current-password",
  meter,
  about,
  onPaste,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  autoComplete?: "current-password" | "new-password";
  meter?: boolean;
  /** Their email and name: a password with them in it scores nothing. */
  about?: { email?: string; name?: string };
  onPaste?: React.ClipboardEventHandler<HTMLInputElement>;
}) {
  const [show, setShow] = useState(false);
  const score = meter && value ? passwordScore(value, about) : -1;
  const s = score >= 0 ? STRENGTH[score as 0 | 1 | 2 | 3 | 4] : null;
  // Each time it climbs to strong: the next cheer and a fresh burst (n counts the climbs).
  const [peak, setPeak] = useState({ score: -1, n: 0 });
  if (score !== peak.score) setPeak({ score, n: score >= 3 && score > peak.score ? peak.n + 1 : peak.n });
  const hype = HYPE[(peak.n + HYPE.length - 1) % HYPE.length];
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={`pw-${label}`}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={`pw-${label}`}
          className={field}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={100}
          onPaste={onPaste}
          required
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-panel-2"
          aria-label={show ? "Hide password" : "Show password"}
          title={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      {meter && (
        <div className="relative mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((k) => (
              <span
                key={k}
                className="h-1.5 flex-1 rounded-full bg-ink/10 transition-colors duration-300"
                style={s && score >= k ? { background: s.color } : undefined}
              />
            ))}
          </div>
          <p className="mt-1 flex items-center justify-between text-xs">
            <span className={cn("font-semibold", !s && "text-muted")} style={s ? { color: s.color } : undefined}>
              {s ? (
                <span key={score} className="start-pop inline-block">
                  {s.label} {s.emoji}
                </span>
              ) : (
                "At least 8 characters. Longer is stronger."
              )}
            </span>
            {score >= 3 && <span className="text-right text-muted">{hype}</span>}
          </p>
          {score >= 0 && score < 2 && <p className="mt-0.5 text-xs text-muted">{passwordProblem(value, about)}</p>}
          {score >= 3 && (
            <span key={peak.n} className="pointer-events-none absolute -top-2 right-16" aria-hidden>
              {["🔥", "💪", "✨", "🎉", "🔒"].map((e, i) => (
                <span key={i} className="pw-burst absolute text-lg" style={{ "--dx": `${(i - 2) * 16}px`, animationDelay: `${i * 70}ms` } as React.CSSProperties}>
                  {e}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
