"use client";

import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/field";
import { COUNTRIES } from "@/lib/phone";

/** Country code picker + number. Pair with normalizeWhatsapp / normalizePhone to store it. */
export function PhoneInput({
  id,
  country,
  onCountry,
  value,
  onChange,
  placeholder = "803 000 0000",
  label = "Phone number",
  large,
}: {
  id?: string;
  country: string;
  onCountry: (code: string) => void;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  large?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Combobox
        aria-label="Country code"
        options={COUNTRIES.map((c) => ({ value: c.code, label: c.label, keywords: c.name }))}
        value={country}
        onChange={onCountry}
        searchable={false}
        className="w-[7.5rem] shrink-0"
        triggerClassName={large ? "h-14 px-3 font-medium" : "px-3 font-medium"}
      />
      <Input
        id={id}
        aria-label={label}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={large ? "h-14 min-w-0 flex-1 text-lg" : "min-w-0 flex-1"}
      />
    </div>
  );
}
