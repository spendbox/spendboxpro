"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { loginWithPhone, registerEmail } from "@/lib/actions/email-auth";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { MIN_PASSWORD } from "@/lib/password";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";

export function friendlyError(message: string, status?: number) {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "We couldn't connect. Check your internet connection and try again.";
  }
  if (status === 429 || /rate limit|too many/i.test(message)) {
    return "Too many tries. Please wait a few minutes, then try again.";
  }
  return message || "Something went wrong. Please try again.";
}

// The sign-in library is big, so it loads only once someone starts filling in the form.
let supabaseModule: Promise<typeof import("@/lib/supabase/client")> | null = null;
export function loadSupabase() {
  supabaseModule ??= import("@/lib/supabase/client");
  return supabaseModule;
}

/**
 * Log in with an email and password, or (where allowed) sign up: a new email
 * creates the account, and we send a link to confirm it. The phone number is
 * optional when signing up.
 */
export function EmailSignIn({
  allowSignup,
  onSignedIn,
  submitLabel = "Continue",
  note,
}: {
  /** Create an account if this email is new (sign-up page, join links and business sign-up). */
  allowSignup: boolean;
  /** Runs once the person is signed in. Return a string to show it as an error. */
  onSignedIn: () => Promise<string | void>;
  submitLabel?: string;
  note?: ReactNode;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish() {
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

  async function submit() {
    const id = email.trim();
    setError(null);
    setBusy(true);

    // Accounts from before email sign-up: a phone number instead of an email.
    if (!allowSignup && !id.includes("@") && /\d{7,}/.test(id.replace(/\D/g, ""))) {
      const r = await loginWithPhone(DEFAULT_COUNTRY_CODE, id, password);
      if (!r.ok) {
        setBusy(false);
        return setError(r.error);
      }
      return finish();
    }

    const supabase = (await loadSupabase()).createClient();
    const credentials = { email: id.toLowerCase(), password };
    let { error: signInError } = await supabase.auth.signInWithPassword(credentials);
    if (signInError && /invalid login credentials/i.test(signInError.message)) {
      const registered = await registerEmail({ email: id, password, phone, country, allowSignup, fullName });
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
    // From here the server keeps the session fresh. A copy refreshing itself
    // in this tab could put it back after logging out, so stop it.
    await supabase.auth.stopAutoRefresh();
    return finish();
  }

  return (
    <form
      className="flex flex-col gap-4"
      onFocus={() => void loadSupabase()}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {allowSignup && (
        <Field label="Your name" htmlFor="full-name" hint="Already on Spendbox? You can skip this.">
          <Input id="full-name" autoComplete="name" placeholder="e.g. Ada Obi" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
        </Field>
      )}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type={allowSignup ? "email" : "text"}
          inputMode="email"
          autoComplete={allowSignup ? "email" : "username"}
          autoCapitalize="none"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint={allowSignup ? `New here? Choose a password with at least ${MIN_PASSWORD} characters. Already on Spendbox? Use your usual one.` : undefined}
      >
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete={allowSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-black/5"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </Field>

      {allowSignup && (
        <Field label="Phone number" htmlFor="signup-phone" optional hint="So businesses you share your details with can call or WhatsApp you.">
          <PhoneInput id="signup-phone" label="Phone number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} placeholder="803 000 0000" />
        </Field>
      )}

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
      <Button type="submit" size="lg" block disabled={busy || email.trim().length < 5 || password.length < 6}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
      <Link href="/auth/forgot" className="self-center text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">
        Forgot password?
      </Link>
    </form>
  );
}
