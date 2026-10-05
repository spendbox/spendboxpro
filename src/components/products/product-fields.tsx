"use client";

import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { CustomCategory } from "@/lib/product-categories";
import type { ProductKind } from "@/lib/types";
import { CategoryField, type CategoryOptions } from "./category-picker";

export interface ProductFieldValues {
  kind: ProductKind;
  title: string;
  description: string;
  price: string;
  /** The picked category, or null to follow the suggestion from the name. */
  category: string | null;
}

const withCommas = (digits: string) => (digits ? Number(digits).toLocaleString("en-US") : "");

/** Name, category, description, price and product/service: shared by "add" and "edit". */
export function ProductFields({
  values,
  onChange,
  categories,
}: {
  values: ProductFieldValues;
  onChange: (next: ProductFieldValues) => void;
  categories: { options: CategoryOptions; added: (c: CustomCategory) => void };
}) {
  const set = (patch: Partial<ProductFieldValues>) => onChange({ ...values, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Is it a product or a service?" className="flex w-fit rounded-full bg-canvas p-1 ring-1 ring-line">
        {(["product", "service"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={values.kind === k}
            onClick={() => set({ kind: k })}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition", values.kind === k ? "bg-white text-ink shadow-card" : "text-muted")}
          >
            {k === "product" ? "Product" : "Service"}
          </button>
        ))}
      </div>
      <Field label="Name" htmlFor="product-title">
        <Input
          id="product-title"
          maxLength={80}
          placeholder={values.kind === "service" ? "e.g. Knotless braids" : "e.g. Red velvet cake, 8 inch"}
          value={values.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <CategoryField
        category={values.category}
        product={{ title: values.title, description: values.description, kind: values.kind }}
        options={categories.options}
        onChange={(category) => set({ category })}
        onAdded={categories.added}
      />
      <Field label="Description" htmlFor="product-description" hint="Optional. Sizes, colours, how long it takes, what's included…">
        <Textarea
          id="product-description"
          rows={3}
          maxLength={500}
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      <Field label="Price" htmlFor="product-price" hint="Optional. Leave it empty and customers will ask.">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted">₦</span>
          <Input
            id="product-price"
            inputMode="numeric"
            className="pl-8"
            placeholder="e.g. 25,000"
            value={withCommas(values.price)}
            onChange={(e) => set({ price: e.target.value.replace(/\D/g, "").slice(0, 10) })}
          />
        </div>
      </Field>
    </div>
  );
}
