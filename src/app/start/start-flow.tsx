"use client";

import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { PhoneSignIn } from "@/components/auth/phone-sign-in";
import { Button } from "@/components/ui/button";
import { MultiCombobox } from "@/components/ui/combobox";
import { FormMessage, Input } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { CATEGORIES } from "@/lib/constants";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { createBusiness, type NewBusiness } from "./actions";

type StepKey = "name" | "categories" | "location" | "whatsapp" | "account";

const STEPS: { key: StepKey; optional?: boolean }[] = [
  { key: "name" },
  { key: "categories" },
  { key: "location", optional: true },
  { key: "whatsapp", optional: true },
  { key: "account" },
];

/** Business sign-up, one question per screen. */
export function StartFlow({ signedIn }: { signedIn: boolean }) {
  // Someone already logged in doesn't need the phone & PIN step.
  const steps = signedIn ? STEPS.filter((s) => s.key !== "account") : STEPS;
  const [index, setIndex] = useState(0);
  const [details, setDetails] = useState<NewBusiness>({ name: "", categories: [], location: "", whatsapp: "" });
  const [error, setError] = useState<string | null>(null);
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY_CODE);
  // What gets saved: the WhatsApp number with its country code (the server tidies "0803…" / "803…").
  const payload = () => ({ ...details, whatsapp: details.whatsapp.trim() ? `+${waCountry}${details.whatsapp.replace(/\D/g, "").replace(/^0+/, "")}` : "" });
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const name = details.name.trim();

  // Put the cursor in each new question, so typing can start straight away.
  useEffect(() => {
    inputRef.current?.focus();
  }, [index]);

  const set = (key: "name" | "location" | "whatsapp") => (e: { target: { value: string } }) => {
    setError(null);
    setDetails((d) => ({ ...d, [key]: e.target.value }));
  };

  const finish = () =>
    startTransition(async () => {
      const message = await createBusiness(payload());
      if (message) setError(message);
    });

  const next = () => {
    if (step.key === "name" && name.length < 2) return setError("Please enter your business name.");
    if (step.key === "categories" && details.categories.length === 0) return setError("Pick at least one, or type your own.");
    setError(null);
    if (isLast) finish();
    else setIndex((i) => i + 1);
  };

  const skip = () => {
    setDetails((d) => ({ ...d, [step.key]: "" }));
    setError(null);
    if (isLast) finish();
    else setIndex((i) => i + 1);
  };

  const questions: Record<StepKey, { title: string; hint: string; body: ReactNode }> = {
    name: {
      title: "What's your business called?",
      hint: "Customers see this on your join page and their pass.",
      body: (
        <Input
          ref={inputRef}
          id="name"
          aria-label="Business name"
          maxLength={80}
          autoComplete="organization"
          placeholder="e.g. Mama Tee's Kitchen"
          value={details.name}
          onChange={set("name")}
          className="h-14 text-lg"
        />
      ),
    },
    categories: {
      title: `What does ${name || "your business"} sell?`,
      hint: "Pick up to 3, or type your own. It helps customers and partner businesses find you.",
      body: (
        <MultiCombobox
          id="categories"
          options={CATEGORIES}
          value={details.categories}
          onChange={(categories) => {
            setError(null);
            setDetails((d) => ({ ...d, categories }));
          }}
          placeholder="e.g. Restaurant, Barber"
          max={3}
        />
      ),
    },
    location: {
      title: "Where are you?",
      hint: "Your area or street, so customers know where to find you.",
      body: (
        <Input
          ref={inputRef}
          id="location"
          aria-label="Area"
          maxLength={80}
          placeholder="e.g. Yaba, Lagos"
          value={details.location}
          onChange={set("location")}
          className="h-14 text-lg"
        />
      ),
    },
    whatsapp: {
      title: "Which WhatsApp number takes orders?",
      hint: "Customers get an “Order on WhatsApp” button.",
      body: (
        <PhoneInput
          id="whatsapp"
          label="WhatsApp number"
          large
          country={waCountry}
          onCountry={setWaCountry}
          value={details.whatsapp}
          onChange={(v) => set("whatsapp")({ target: { value: v } })}
        />
      ),
    },
    account: {
      title: "Last step: your phone number and a PIN",
      hint: `You'll use them to log in to ${name || "your business"}'s dashboard.`,
      body: null,
    },
  };
  const q = questions[step.key];

  return (
    <div className="flex flex-col gap-6">
      {/* Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          {step.optional && <span>Optional</span>}
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Sign-up progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <div key={step.key} className="flex animate-fade-up flex-col gap-5">
        <div>
          <h2 className="font-display text-2xl leading-tight font-bold">{q.title}</h2>
          <p className="mt-1.5 text-muted">{q.hint}</p>
        </div>

        {step.key === "account" ? (
          <PhoneSignIn allowSignup submitLabel="Create my link" onSignedIn={() => createBusiness(payload())} />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            {q.body}
            <FormMessage>{error}</FormMessage>
            <Button type="submit" size="lg" block disabled={pending}>
              {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {isLast ? "Create my link" : "Continue"}
              {!pending && !isLast && <ArrowRight className="size-4" aria-hidden />}
            </Button>
            {step.optional && (
              <button type="button" onClick={skip} className="self-center text-sm font-semibold text-muted hover:text-ink">
                Skip for now
              </button>
            )}
          </form>
        )}
      </div>

      {index > 0 && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setIndex((i) => i - 1);
          }}
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      )}
    </div>
  );
}
