"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { PhoneOtpForm } from "@/components/auth/phone-otp-form";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { CATEGORIES } from "@/lib/constants";
import { createBusiness, type NewBusiness } from "./actions";

export function StartFlow({ signedIn }: { signedIn: boolean }) {
  const [step, setStep] = useState<"details" | "verify">("details");
  const [details, setDetails] = useState<NewBusiness>({ name: "", category: CATEGORIES[0], location: "", whatsapp: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: keyof NewBusiness) => (e: { target: { value: string } }) =>
    setDetails((d) => ({ ...d, [key]: e.target.value }));

  if (step === "verify") {
    return (
      <div className="flex flex-col gap-5">
        <Steps current={2} />
        <div>
          <h2 className="font-display text-xl font-bold">Verify your phone number</h2>
          <p className="mt-1 text-sm text-muted">You&apos;ll use it to log in to {details.name}&apos;s dashboard.</p>
        </div>
        <PhoneOtpForm
          allowSignup
          verifyLabel="Create my link"
          onVerified={() => createBusiness(details)}
        />
        <button
          type="button"
          onClick={() => setStep("details")}
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to details
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (details.name.trim().length < 2) {
          setError("Please enter your business name.");
          return;
        }
        setError(null);
        if (!signedIn) {
          setStep("verify");
          return;
        }
        startTransition(async () => {
          const message = await createBusiness(details);
          if (message) setError(message);
        });
      }}
    >
      {!signedIn && <Steps current={1} />}
      <Field label="Business name" htmlFor="name">
        <Input id="name" required maxLength={80} placeholder="e.g. Mama Tee's Kitchen" value={details.name} onChange={update("name")} />
      </Field>
      <Field label="What do you sell?" htmlFor="category">
        <Select id="category" value={details.category} onChange={update("category")}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Area" htmlFor="location" optional>
        <Input id="location" maxLength={80} placeholder="e.g. Yaba, Lagos" value={details.location} onChange={update("location")} />
      </Field>
      <Field
        label="WhatsApp number for orders"
        htmlFor="whatsapp"
        optional
        hint="Customers get an “Order on WhatsApp” button."
      >
        <Input id="whatsapp" type="tel" inputMode="tel" placeholder="0803 000 0000" value={details.whatsapp} onChange={update("whatsapp")} />
      </Field>
      <FormMessage>{error}</FormMessage>
      <Button type="submit" size="lg" block disabled={pending}>
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {signedIn ? "Create my link" : "Continue"}
      </Button>
    </form>
  );
}

function Steps({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-muted" aria-label={`Step ${current} of 2`}>
      <span className={current === 1 ? "text-brand-700" : ""}>1 · Your business</span>
      <span aria-hidden className="h-px w-6 bg-line-strong" />
      <span className={current === 2 ? "text-brand-700" : ""}>2 · Verify phone</span>
    </div>
  );
}
