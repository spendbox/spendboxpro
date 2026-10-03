"use client";

import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { registerPhone } from "@/lib/actions/phone-auth";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { COUNTRIES, isValidPin, normalizePhone, phoneLoginEmail, PIN_LENGTH } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";


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
    // A fresh login brings back reminders that were closed last time (like the free-trial note).
    document.cookie = `${TRIAL_HIDDEN_COOKIE}=; Max-Age=0; path=/`;

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
          <Combobox
            aria-label="Country code"
            options={COUNTRIES.map((c) => ({ value: c.code, label: c.label, keywords: c.name }))}
            value={country}
            onChange={setCountry}
            searchable={false}
            className="w-[7.5rem] shrink-0"
            triggerClassName="px-3 font-medium"
          />
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
      {allowSignup && (
        <p className="text-xs text-muted">
          By continuing you agree to our{" "}
          <a href="/terms" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2">
            Privacy policy
          </a>
          .
        </p>
      )}
      <Button type="submit" size="lg" block disabled={busy || local.trim().length < 7 || pin.length < PIN_LENGTH}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </form>
  );
}
