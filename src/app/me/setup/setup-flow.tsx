"use client";

import { ArrowLeft, ArrowRight, BadgeCheck, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBirthday, saveEmail } from "@/app/me/account-actions";
import { BankAccountForm } from "@/components/account/bank-account-form";
import { BirthdayFields, type BirthdayValue } from "@/components/account/birthday-fields";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";

type Step = "bank" | "birthday" | "email";

/** New customer setup, one question per screen. */
export function SetupFlow({ next, hasBank }: { next: string; hasBank: boolean }) {
  // Fixed when the page opens: adding the account refreshes the page, which mustn't shift the steps.
  const [steps] = useState<Step[]>(() => (hasBank ? ["birthday", "email"] : ["bank", "birthday", "email"]));
  const [index, setIndex] = useState(0);
  // Accounts added during this setup, and whether the form is showing.
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(true);
  const [birthday, setBirthday] = useState<BirthdayValue>({ day: null, month: null, year: null });
  const [email, setEmail] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const step = steps[index];
  const last = index === steps.length - 1;

  const advance = () => {
    setError(null);
    if (last) router.replace(next);
    else setIndex((i) => i + 1);
  };

  const save = (work: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const r = await work();
      if (r.error) setError(r.error);
      else advance();
    });

  const copy: Record<Step, { title: string; hint: string }> = {
    bank: {
      title: "Which bank account do you usually pay from?",
      hint: "When you pay a business by transfer from it, your purchase counts by itself. Your name comes from your bank. You can add more accounts later.",
    },
    birthday: {
      title: "When's your birthday?",
      hint: "For birthday treats. Businesses only see it if you choose to share your details.",
    },
    email: {
      title: "Want emails when a perk is ready?",
      hint: "Optional. We'll only email you about your perks and purchases. Businesses never see your email.",
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          {step !== "bank" && <span>Optional</span>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
          <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <div key={step} className="flex animate-fade-up flex-col gap-5">

        <div>
          <h1 className="font-display text-2xl leading-tight font-bold">{copy[step].title}</h1>
          <p className="mt-1.5 text-muted">{copy[step].hint}</p>
        </div>

        {step === "bank" && (
          <div className="flex flex-col gap-4">
            {added.length > 0 && (
              <ul className="flex flex-col gap-2">
                {added.map((n, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-900 ring-1 ring-brand-100">
                    <BadgeCheck className="size-5 shrink-0 text-brand-700" aria-hidden /> Account added for {n}
                  </li>
                ))}
              </ul>
            )}
            {adding ? (
              <BankAccountForm
                submitLabel={added.length ? "Add this account" : "Yes, this is me"}
                onAdded={(n) => {
                  setAdded((list) => [...list, n]);
                  setAdding(false);
                }}
              />
            ) : (
              <>
                <Button size="lg" block onClick={advance}>
                  Continue <ArrowRight className="size-4" aria-hidden />
                </Button>
                <Button size="lg" block variant="secondary" onClick={() => setAdding(true)}>
                  <Plus className="size-4" aria-hidden /> Add another account
                </Button>
                <p className="text-center text-sm text-muted">Pay from more than one account? Add them all so every transfer counts.</p>
              </>
            )}
          </div>
        )}

        {step === "birthday" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(() => saveBirthday(birthday.day ?? "", birthday.month ?? "", birthday.year ?? ""));
            }}
          >
            <BirthdayFields value={birthday} onChange={setBirthday} />
            <FormMessage>{error}</FormMessage>
            <Button type="submit" size="lg" block loading={pending} disabled={!birthday.day || !birthday.month}>
              Continue <ArrowRight className="size-4" aria-hidden />
            </Button>
            <button type="button" onClick={advance} className="self-center text-sm font-semibold text-muted hover:text-ink">
              Skip for now
            </button>
          </form>
        )}

        {step === "email" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(() => saveEmail(email, notify));
            }}
          >
            <Input
              id="setup-email"
              aria-label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-lg"
            />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-5 accent-brand-600" />
              <span className="text-ink-2">Email me when a perk is ready</span>
            </label>
            <FormMessage>{error}</FormMessage>
            <Button type="submit" size="lg" block loading={pending} disabled={!email.trim()}>
              Finish
            </Button>
            <button type="button" onClick={advance} className="self-center text-sm font-semibold text-muted hover:text-ink">
              Skip for now
            </button>
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
