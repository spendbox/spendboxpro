"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { DEFAULT_COUNTRY_CODE, OTP_CHANNEL } from "@/lib/env";
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

/** "0803 123 4567" + "234" → "+2348031234567" */
export function toE164(countryCode: string, local: string) {
  let digits = local.replace(/\D/g, "");
  if (digits.startsWith(countryCode) && digits.length > 10) digits = digits.slice(countryCode.length);
  digits = digits.replace(/^0+/, "");
  return { e164: `+${countryCode}${digits}`, valid: digits.length >= 7 && digits.length <= 12 };
}

function friendlyError(error: { message?: string; code?: string; status?: number }) {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "We couldn't connect. Check your internet connection and try again.";
  }
  if (code === "otp_disabled" || /signups? not allowed/i.test(message)) {
    return "We couldn't find a Spendbox account for this number. Customers join from a business's link, and businesses can sign up from the home page.";
  }
  if (code.includes("rate_limit") || error.status === 429) {
    return "Too many tries. Please wait a minute, then try again.";
  }
  if (code === "otp_expired" || /expired|invalid/i.test(message)) {
    return "That code is wrong or has expired. Check it, or ask for a new one.";
  }
  if (code === "phone_provider_disabled" || /provider/i.test(message)) {
    return "Phone sign-in isn't switched on yet. (Owner: Supabase → Authentication → Sign In / Providers → Phone.)";
  }
  return message || "Something went wrong. Please try again.";
}

export function PhoneOtpForm({
  allowSignup,
  onVerified,
  sendLabel = "Send me a code",
  verifyLabel = "Verify",
  note,
}: {
  /** Create a new account if this number is new (join links and business sign-up only). */
  allowSignup: boolean;
  /** Runs after the code is accepted and the person is signed in. */
  onVerified: () => Promise<string | void>;
  sendLabel?: string;
  verifyLabel?: string;
  note?: ReactNode;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [local, setLocal] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const { e164, valid } = toE164(country, local);
  const via = OTP_CHANNEL === "whatsapp" ? "WhatsApp" : "SMS";

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode() {
    if (!valid) {
      setError("Please enter a valid phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: allowSignup, channel: OTP_CHANNEL },
    });
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setStep("code");
    setCode("");
    setResendIn(30);
  }

  async function verify(token: string) {
    if (token.length < 6) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ phone: e164, token, type: "sms" });
    if (error) {
      setBusy(false);
      setError(friendlyError(error));
      return;
    }
    try {
      const result = await onVerified();
      if (typeof result === "string") {
        setError(result);
        setBusy(false);
      }
    } catch (e) {
      // A redirect from a Server Action is delivered as a thrown navigation; let it through.
      if (e && typeof e === "object" && "digest" in e) throw e;
      setError("Signed in, but something went wrong. Please refresh the page.");
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(code);
        }}
      >
        <Field
          label={`Enter the 6-digit code`}
          htmlFor="otp"
          hint={
            <>
              Sent by {via} to <span className="font-semibold text-ink">{e164}</span>.{" "}
              <button
                type="button"
                className="font-semibold text-brand-700 underline underline-offset-2"
                onClick={() => {
                  setStep("phone");
                  setError(null);
                }}
              >
                Change number
              </button>
            </>
          }
        >
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(next);
              if (next.length === 6) void verify(next);
            }}
            className="h-14 text-center text-2xl font-bold tracking-[0.5em]"
            aria-invalid={Boolean(error)}
          />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button type="submit" size="lg" block disabled={busy || code.length < 6}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {verifyLabel}
        </Button>
        <button
          type="button"
          disabled={resendIn > 0 || busy}
          onClick={() => void sendCode()}
          className="text-sm font-semibold text-brand-700 disabled:font-normal disabled:text-muted"
        >
          {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
        </button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void sendCode();
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
            autoComplete="tel-national"
            placeholder="803 000 0000"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1"
          />
        </div>
      </Field>
      {note}
      <FormMessage>{error}</FormMessage>
      <Button type="submit" size="lg" block disabled={busy || local.trim().length < 7}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {sendLabel}
      </Button>
    </form>
  );
}
