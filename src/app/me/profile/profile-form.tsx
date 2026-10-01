"use client";

import { useActionState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { MONTHS } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { updateProfile, type FormState } from "../actions";

const GENDERS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "", label: "Prefer not to say" },
];

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfile, {});
  const thisYear = new Date().getFullYear();

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Name" htmlFor="full_name" optional>
        <Input id="full_name" name="full_name" maxLength={80} autoComplete="name" defaultValue={profile?.full_name ?? ""} placeholder="e.g. Tunde Adebayo" />
      </Field>

      <Field
        label="Email"
        htmlFor="email"
        optional
        hint="Only used to tell you when a perk is ready or a business records your purchase. Businesses never see it."
      >
        <Input id="email" name="email" type="email" autoComplete="email" maxLength={200} defaultValue={profile?.email ?? ""} placeholder="you@example.com" />
      </Field>
      <label className="-mt-2 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="email_notifications"
          defaultChecked={profile?.email_notifications ?? true}
          className="size-5 shrink-0 accent-brand-600"
        />
        <span className="text-ink-2">Email me about my perks and purchases</span>
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold text-ink">
          Gender <span className="font-normal text-muted">· optional</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GENDERS.map((g) => (
            <label key={g.label} className="relative">
              <input
                type="radio"
                name="gender"
                value={g.value}
                defaultChecked={(profile?.gender ?? "") === g.value}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center rounded-xl px-2 text-center text-sm font-semibold ring-1 ring-line-strong transition",
                  "peer-checked:bg-brand-600 peer-checked:text-white peer-checked:ring-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600",
                )}
              >
                {g.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold text-ink">
          Birthday <span className="font-normal text-muted">· year optional</span>
        </legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.3fr)] gap-2">
          <Combobox
            name="birth_day"
            aria-label="Birth day"
            defaultValue={profile?.birth_day ? String(profile.birth_day) : null}
            placeholder="Day"
            options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            searchable={false}
          />
          <Combobox
            name="birth_month"
            aria-label="Birth month"
            defaultValue={profile?.birth_month ? String(profile.birth_month) : null}
            placeholder="Month"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            searchable={false}
          />
          <Combobox
            name="birth_year"
            aria-label="Birth year (optional)"
            defaultValue={profile?.birth_year ? String(profile.birth_year) : null}
            placeholder="Year"
            options={Array.from({ length: 90 }, (_, i) => String(thisYear - 10 - i)).map((y) => ({ value: y, label: y }))}
            searchable={false}
          />
        </div>
        <p className="text-sm text-muted">Used for birthday treats, even if you keep it private.</p>
      </fieldset>

      <FormMessage tone={state.ok ? "success" : "error"}>{state.error ?? state.message}</FormMessage>
      <SubmitButton size="lg" pendingText="Saving…" className="sm:self-start">
        Save details
      </SubmitButton>
    </form>
  );
}
