"use client";

import { ArrowLeft, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { friendlyError, loadSupabase } from "@/components/auth/email-sign-in";
import { inputClass, Question } from "@/components/join/join-wizard";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { registerEmail } from "@/lib/actions/email-auth";
import { cn } from "@/lib/cn";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { MIN_PASSWORD } from "@/lib/password";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";

const STEPS = ["name", "email", "password", "phone"] as const;
type Step = (typeof STEPS)[number];

/** Creating a customer Spendbox, one question at a time. */
export function SignupForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const index = STEPS.indexOf(step);

  const go = (to: Step) => {
    setError(null);
    setTaken(false);
    setStep(to);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (step === "name") {
      if (name.trim().length < 2) return setError("Please add your name, so businesses know who they're talking to.");
      return go("email");
    }
    if (step === "email") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Please check your email address.");
      return go("password");
    }
    if (step === "password") {
      if (password.length < MIN_PASSWORD) return setError(`Choose a password with at least ${MIN_PASSWORD} characters.`);
      return go("phone");
    }
    setBusy(true);
    let done = false;
    try {
      const r = await registerEmail({ email, password, phone, country, allowSignup: true, fullName: name });
      if (!r.ok) {
        if (r.reason === "wrong-password") {
          // This email already has a Spendbox: offer to log in instead.
          setStep("email");
          setTaken(true);
          return setError("This email already has a Spendbox.");
        }
        return setError(r.error);
      }
      const supabase = (await loadSupabase()).createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) return setError(friendlyError(signInError.message, signInError.status));
      document.cookie = `${TRIAL_HIDDEN_COOKIE}=; Max-Age=0; path=/`;
      router.replace(next ?? "/go");
      router.refresh();
      // Keep the spinner until the new page shows.
      done = true;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      if (!done) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`} role="img">
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= index ? "bg-brand-600" : "bg-black/10")} />
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" key={step}>
        {step === "name" && (
          <Question title="What's your name?" hint="So businesses know who they're talking to.">
            <input id="signup-name" autoComplete="name" autoFocus placeholder="e.g. Ada Obi" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" className={inputClass} />
          </Question>
        )}
        {step === "email" && (
          <Question title="What's your email?" hint="We'll send a link to confirm it.">
            <input
              id="signup-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
              className={inputClass}
            />
          </Question>
        )}
        {step === "password" && (
          <Question title="Choose a password" hint={`At least ${MIN_PASSWORD} characters.`}>
            <div className="relative">
              <input
                id="signup-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Password"
                className={cn(inputClass, "pr-12")}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-1.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-black/5"
              >
                {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </Question>
        )}
        {step === "phone" && (
          <Question title="Your phone number" hint="Optional. So businesses you share your details with can call or WhatsApp you.">
            <PhoneInput id="signup-phone" label="Phone number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} placeholder="803 000 0000" />
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
          </Question>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}{" "}
            {taken && (
              <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold underline underline-offset-2">
                Log in instead
              </Link>
            )}
          </p>
        )}

        <Button type="submit" size="lg" block disabled={busy || (step === "name" && name.trim().length < 2) || (step === "email" && email.trim().length < 5)}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {step === "phone" ? (phone.trim() ? "Create my Spendbox" : "Skip and create my Spendbox") : "Continue"}
        </Button>
      </form>

      {index > 0 && (
        <button type="button" onClick={() => go(STEPS[index - 1]!)} className="-mt-2 flex items-center gap-1.5 self-center text-sm font-semibold text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      )}
    </div>
  );
}
