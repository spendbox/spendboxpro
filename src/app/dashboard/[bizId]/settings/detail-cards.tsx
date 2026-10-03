"use client";

import { AtSign, Check, FileText, MapPin, Palette, Store, Tags } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MultiCombobox } from "@/components/ui/combobox";
import { EditCard } from "@/components/ui/edit-card";
import { FormMessage, Input, Textarea } from "@/components/ui/field";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { PhoneInput } from "@/components/ui/phone-input";
import { BRAND_COLORS, CATEGORIES } from "@/lib/constants";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { formatPhone } from "@/lib/format";
import { COUNTRIES } from "@/lib/phone";
import type { Business } from "@/lib/types";
import { updateBusinessField, type BusinessField } from "../actions";

/** A one-field form inside a settings card's pop-up. */
function FieldForm({
  bizId,
  field,
  initial,
  close,
  render,
  transform,
}: {
  bizId: string;
  field: BusinessField;
  initial: string | string[];
  close: () => void;
  render: (value: string | string[], set: (v: string | string[]) => void) => ReactNode;
  /** Turns what was typed into what gets saved. */
  transform?: (value: string | string[]) => string | string[];
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateBusinessField(bizId, field, transform ? transform(value) : value);
          if (r.error) setError(r.error);
          else close();
        });
      }}
    >
      {render(value, setValue)}
      <FormMessage>{error}</FormMessage>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** WhatsApp number with its country code. */
function WhatsAppEditor({ bizId, current, close }: { bizId: string; current: string | null; close: () => void }) {
  const match = COUNTRIES.map((c) => c.code).sort((a, b) => b.length - a.length).find((c) => current?.startsWith(c));
  const [country, setCountry] = useState(match ?? DEFAULT_COUNTRY_CODE);
  return (
    <FieldForm
      bizId={bizId}
      field="whatsapp"
      initial={current && match ? current.slice(match.length) : (current ?? "")}
      close={close}
      transform={(v) => {
        const local = String(v).replace(/\D/g, "").replace(/^0+/, "");
        return local ? `+${country}${local}` : "";
      }}
      render={(v, set) => (
        <PhoneInput label="WhatsApp number" country={country} onCountry={setCountry} value={v as string} onChange={set} placeholder="803 000 0000" />
      )}
    />
  );
}

/** Each business detail as a card; tap to edit it on its own. */
export function BusinessDetailCards({ business }: { business: Business }) {
  const id = business.id;
  const categories = business.categories?.length ? business.categories : business.category ? [business.category] : [];
  const text = (field: BusinessField, initial: string, placeholder: string, extra: Partial<Parameters<typeof Input>[0]> = {}) =>
    function Editor(close: () => void) {
      return (
        <FieldForm
          bizId={id}
          field={field}
          initial={initial}
          close={close}
          render={(v, set) => (
            <Input autoFocus value={v as string} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="h-14 text-lg" {...extra} />
          )}
        />
      );
    };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <EditCard icon={<Store className="size-5" aria-hidden />} label="Business name" value={business.name} description="Customers see this on your join page and their member card.">
        {text("name", business.name, "e.g. Mama Tee's Kitchen", { maxLength: 80, "aria-label": "Business name" })}
      </EditCard>
      <EditCard icon={<Tags className="size-5" aria-hidden />} label="What you sell" value={categories.join(", ") || "Not set"} description="Pick up to 3. Helps customers and partner businesses find you.">
        {(close) => (
          <FieldForm
            bizId={id}
            field="categories"
            initial={categories}
            close={close}
            render={(v, set) => <MultiCombobox id="edit-categories" options={CATEGORIES} value={v as string[]} onChange={set} max={3} placeholder="e.g. Restaurant, Barber" />}
          />
        )}
      </EditCard>
      <EditCard icon={<MapPin className="size-5" aria-hidden />} label="Area" value={business.location || "Not added"}>
        {text("location", business.location ?? "", "e.g. Yaba, Lagos", { maxLength: 80, "aria-label": "Area" })}
      </EditCard>
      <EditCard
        icon={<WhatsAppIcon className="size-5" />}
        label="WhatsApp for orders"
        value={business.whatsapp ? formatPhone(business.whatsapp) : "Not added"}
        note="Members get an “Order on WhatsApp” button"
      >
        {(close) => <WhatsAppEditor bizId={id} current={business.whatsapp} close={close} />}
      </EditCard>
      <EditCard
        icon={<AtSign className="size-5" aria-hidden />}
        label="Email"
        value={business.email || "Not added"}
        note="For new members, partner requests and bank connection"
      >
        {text("email", business.email ?? "", "you@example.com", { type: "email", autoComplete: "email", "aria-label": "Email" })}
      </EditCard>
      <EditCard icon={<FileText className="size-5" aria-hidden />} label="About" value={business.about || "Not added"} note="Shown on your join page">
        {(close) => (
          <FieldForm
            bizId={id}
            field="about"
            initial={business.about ?? ""}
            close={close}
            render={(v, set) => (
              <Textarea aria-label="About" maxLength={280} value={v as string} onChange={(e) => set(e.target.value)} placeholder="e.g. Home-style jollof, delivered hot across Yaba." />
            )}
          />
        )}
      </EditCard>
      <EditCard
        icon={<Palette className="size-5" aria-hidden />}
        label="Card colour"
        value={
          <span className="flex items-center gap-2">
            <span className="size-4 rounded-md" style={{ background: business.brand_color }} aria-hidden /> Your colour
          </span>
        }
        note="Your join page and member cards"
      >
        {(close) => (
          <FieldForm
            bizId={id}
            field="brand_color"
            initial={business.brand_color}
            close={close}
            render={(v, set) => (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Card colour">
                {BRAND_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={(v as string).toLowerCase() === color.toLowerCase()}
                    aria-label={color}
                    onClick={() => set(color)}
                    className="flex size-12 items-center justify-center rounded-2xl text-white ring-offset-2 aria-checked:ring-2 aria-checked:ring-ink"
                    style={{ background: color }}
                  >
                    {(v as string).toLowerCase() === color.toLowerCase() && <Check className="size-5" aria-hidden />}
                  </button>
                ))}
              </div>
            )}
          />
        )}
      </EditCard>
    </div>
  );
}
