"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { registerPhone } from "@/lib/actions/phone-auth";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { isValidPin, normalizePhone, phoneLoginEmail, PIN_LENGTH } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

const COUNTRIES = [
  { code: "234", label: "NG +234" },
  { code: "233", label: "GH +233" },
  { code: "254", label: "KE +254" },
  { code: "27", label: "ZA +27" },
  { code: "256", label: "UG +256" },
  { code: "250", label: "RW +250" },
  { code: "237", label: "CM +237" },
  { code: "225", label: "CI +225" },
  { code: "44", label: "UK +44" },
  { code: "1", label: "US +1" },
];

function friendlyError(message: string, status?: number) {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "We couldn't connect. Check your internet connection and try again.";
  }
  if (status === 429 || /rate limit|too many/i.test(message)) {
    return "Too many tries. Please wait a few minutes, then try again.";
  }
  return message || "Something went wrong. Please try again.";
}

/** Sign in (or, where allowed, sign up) with a phone number and a 6-digit PIN. */
export function PhoneSignIn({
  allowSignup,
  onSignedIn,
  submitLabel = "Continue",
  note,
}: {
  /** Create an account if this number is new (join links and business sign-up only). */
  allowSignup: boolean;
  /** Runs once the person is signed in. Return a string to show it as an error. */
  onSignedIn: () => Promise<string | void>;
  submitLabel?: string;
  note?: ReactNode;
}) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [local, setLocal] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const phone = normalizePhone(country, local);
    if (!phone) return setError("Please enter a valid phone number.");
    if (!isValidPin(pin)) return setError(`Please enter a ${PIN_LENGTH}-digit PIN.`);
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const credentials = { email: phoneLoginEmail(phone), password: pin };
    let { error: signInError } = await supabase.auth.signInWithPassword(credentials);

    if (signInError && /invalid login credentials/i.test(signInError.message)) {
      const registered = await registerPhone(phone, pin, allowSignup);
      if (!registered.ok) {
        setBusy(false);
        return setError(registered.error);
      }
      ({ error: signInError } = await supabase.auth.signInWithPassword(credentials));
    }
    if (signInError) {
      setBusy(false);
      return setError(friendlyError(signInError.message, signInError.status));
    }

    try {
      const result = await onSignedIn();
      if (typeof result === "string") {
        setError(result);
        setBusy(false);
      }
    } catch (e) {
      // A redirect from a Server Action arrives as a thrown navigation; let it through.
      if (e && typeof e === "object" && "digest" in e) throw e;
      setError("Signed in, but something went wrong. Please refresh the page.");
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Phone number" htmlFor="phone">
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="country">
            Country code
          </label>
          <select
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-12 shrink-0 rounded-xl border border-line-strong bg-white px-2.5 text-[15px] font-medium text-ink outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="803 000 0000"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className="min-w-0 flex-1"
          />
        </div>
      </Field>

      <Field
        label={`${PIN_LENGTH}-digit PIN`}
        htmlFor="pin"
        hint={allowSignup ? "New here? Choose a PIN you'll remember. You'll use it to log in." : undefined}
      >
        <div className="relative">
          <Input
            id="pin"
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete={allowSignup ? "new-password" : "current-password"}
            pattern="[0-9]*"
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
            className="pr-12 text-lg tracking-[0.4em]"
          />
          <button
            type="button"
            onClick={() => setShowPin((s) => !s)}
            aria-label={showPin ? "Hide PIN" : "Show PIN"}
            className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-black/5"
          >
            {showPin ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </Field>

      {note}
      <FormMessage>{error}</FormMessage>
      <Button type="submit" size="lg" block disabled={busy || local.trim().length < 7 || pin.length < PIN_LENGTH}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </form>
  );
}
