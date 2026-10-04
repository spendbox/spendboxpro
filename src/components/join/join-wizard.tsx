"use client";

import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { joinBusiness } from "@/app/j/[slug]/actions";
import { friendlyError, loadSupabase } from "@/components/auth/email-sign-in";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PhoneInput } from "@/components/ui/phone-input";
import { registerEmail } from "@/lib/actions/email-auth";
import { cn } from "@/lib/cn";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { MIN_PASSWORD } from "@/lib/password";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";

type Step = "email" | "password" | "name" | "phone" | "share";

/**
 * Joining a business, one question at a time, in a pop-up. Someone already
 * signed in only answers the last question. Someone new gives their email,
 * a password, their name and (if they like) a phone number. People who
 * already have a Spendbox skip the name and phone questions.
 */
export function JoinWizard({
  open,
  onClose,
  signedIn,
  slug,
  refCode,
  business,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  slug: string;
  refCode?: string | null;
  business: { name: string; brand_color: string; logo_url: string | null };
}) {
  const [step, setStep] = useState<Step>(signedIn ? "share" : "email");
  const [isNew, setIsNew] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const steps: Step[] = signedIn ? ["share"] : isNew ? ["email", "password", "name", "phone", "share"] : ["email", "password", "share"];
  const index = steps.indexOf(step);
  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const back = () => index > 0 && go(steps[index - 1]!);

  const signIn = async () => {
    const supabase = (await loadSupabase()).createClient();
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    // A fresh login brings back reminders that were closed last time.
    if (!e) document.cookie = `${TRIAL_HIDDEN_COOKIE}=; Max-Age=0; path=/`;
    return e;
  };

  const next = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (step === "email") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Please check your email address.");
      return go("password");
    }
    setBusy(true);
    try {
      if (step === "password") {
        const failed = await signIn();
        if (!failed) return go("share");
        if (!/invalid login credentials/i.test(failed.message)) return setError(friendlyError(failed.message, failed.status));
        // Wrong password, or a new email? Asking without a name tells them apart.
        const r = await registerEmail({ email, password, allowSignup: true, fullName: "" });
        if (!r.ok && r.reason === "need-name") {
          setIsNew(true);
          return go("name");
        }
        return setError(r.ok ? "Something went wrong. Please try again." : r.error);
      }
      if (step === "name") {
        if (name.trim().length < 2) return setError("Please add your name, so they know who they're talking to.");
        return go("phone");
      }
      if (step === "phone") {
        const r = await registerEmail({ email, password, phone, country, allowSignup: true, fullName: name });
        if (!r.ok) {
          if (r.reason === "wrong-password") {
            setStep("password");
            return setError(r.error);
          }
          return setError(r.error);
        }
        const failed = await signIn();
        if (failed) return setError(friendlyError(failed.message, failed.status));
        return go("share");
      }
    } finally {
      setBusy(false);
    }
  };

  const join = async (share: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const message = await joinBusiness(slug, refCode ?? null, share);
      if (message) {
        setError(message);
        setBusy(false);
      }
    } catch (e) {
      // Joining ends by going to the business: that arrives as a navigation, so let it through.
      if (e && typeof e === "object" && "digest" in e) throw e;
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <BusinessAvatar name={business.name} color={business.brand_color} logoUrl={business.logo_url} size="sm" className="rounded-full" />
          Join {business.name}
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Progress */}
        {steps.length > 1 && (
          <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`} role="img">
            {steps.map((s, i) => (
              <span key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= index ? "bg-brand-600" : "bg-black/10")} />
            ))}
          </div>
        )}

        <form onSubmit={next} className="flex flex-col gap-4" key={step}>
          {step === "email" && (
            <Question title="What's your email?" hint="Already on Spendbox? Use the email you signed up with.">
              <input
                id="join-email"
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
            <Question title="Your password" hint={`New here? Choose one with at least ${MIN_PASSWORD} characters. Already on Spendbox? Use your usual one.`}>
              <div className="relative">
                <input
                  id="join-password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
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
              <Link href="/auth/forgot" className="w-fit text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">
                Forgot password?
              </Link>
            </Question>
          )}
          {step === "name" && (
            <Question title="What's your name?" hint={`So ${business.name} knows who they're talking to.`}>
              <input id="join-name" autoComplete="name" autoFocus placeholder="e.g. Ada Obi" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" className={inputClass} />
            </Question>
          )}
          {step === "phone" && (
            <Question title="Your phone number" hint="Optional. So businesses you share your details with can call or WhatsApp you.">
              <PhoneInput id="join-phone" label="Phone number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} placeholder="803 000 0000" />
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
          {step === "share" && (
            <Question title={`Share your details with ${business.name}?`} hint="Your name, phone, email and birthday, so they can reach you. You can change this any time.">
              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" block disabled={busy} onClick={() => join(true)}>
                  {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                  Yes, share and join
                </Button>
                <Button type="button" size="lg" block variant="secondary" disabled={busy} onClick={() => join(false)}>
                  Join without sharing
                </Button>
              </div>
            </Question>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          {step !== "share" && (
            <Button type="submit" size="lg" block disabled={busy || (step === "email" && email.trim().length < 5) || (step === "password" && password.length < 6)}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {step === "phone" && !phone.trim() ? "Skip" : "Continue"}
            </Button>
          )}
        </form>

        {index > 0 && step !== "share" && (
          <button type="button" onClick={back} className="-mt-2 flex items-center gap-1.5 self-center text-sm font-semibold text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
        )}
      </div>
    </Modal>
  );
}

export const inputClass =
  "h-13 w-full rounded-2xl border border-line-strong bg-white px-4 text-[16px] outline-none transition placeholder:text-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10";

export function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col gap-3">
      <div>
        <h3 className="font-display text-xl leading-tight font-bold">{title}</h3>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
