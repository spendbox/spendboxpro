"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { MultiCombobox } from "@/components/ui/combobox";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { BRAND_COLORS, CATEGORIES } from "@/lib/constants";
import type { Business } from "@/lib/types";
import { updateBusiness, type FormState } from "../actions";

export function BusinessForm({ business }: { business: Business }) {
  const [state, action] = useActionState<FormState, FormData>(updateBusiness.bind(null, business.id), {});
  const current = business.categories?.length ? business.categories : business.category ? [business.category] : [];
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Business name" htmlFor="name">
        <Input id="name" name="name" required maxLength={80} defaultValue={business.name} />
      </Field>
      <Field label="What you sell" htmlFor="categories">
        <MultiCombobox
          id="categories"
          name="categories"
          options={CATEGORIES}
          defaultValue={current}
          placeholder="e.g. Restaurant, Barber"
          max={3}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Area" htmlFor="location" optional>
          <Input id="location" name="location" maxLength={80} defaultValue={business.location ?? ""} placeholder="e.g. Yaba, Lagos" />
        </Field>
        <Field label="WhatsApp number for orders" htmlFor="whatsapp" optional hint="Members get an “Order on WhatsApp” button.">
          <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" defaultValue={business.whatsapp ?? ""} placeholder="0803 000 0000" />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" optional hint="We'll email you when a receipt needs checking and when new customers join.">
        <Input id="email" name="email" type="email" autoComplete="email" maxLength={200} defaultValue={business.email ?? ""} placeholder="you@example.com" />
      </Field>
      <Field label="About" htmlFor="about" optional hint="Shown on your join page.">
        <Textarea id="about" name="about" maxLength={280} defaultValue={business.about ?? ""} placeholder="e.g. Home-style jollof, delivered hot across Yaba." />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Card colour</legend>
        <div className="flex flex-wrap gap-2">
          {BRAND_COLORS.map((color) => (
            <label key={color} className="relative cursor-pointer">
              <input type="radio" name="brand_color" value={color} defaultChecked={business.brand_color.toLowerCase() === color.toLowerCase()} className="peer sr-only" />
              <span
                className="flex size-11 items-center justify-center rounded-2xl text-white ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-brand-600 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
                style={{ background: color }}
              >
                <Check className="size-5" aria-hidden />
              </span>
              <span className="sr-only">{color}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage tone={state.ok ? "success" : "error"}>{state.error ?? state.message}</FormMessage>
      <SubmitButton pendingText="Saving…" className="sm:self-start">
        Save details
      </SubmitButton>
    </form>
  );
}
