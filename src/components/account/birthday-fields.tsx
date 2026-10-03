"use client";

import { Combobox } from "@/components/ui/combobox";
import { MONTHS } from "@/lib/format";

export interface BirthdayValue {
  day: string | null;
  month: string | null;
  year: string | null;
}

/** Day / month / (optional) year pickers. */
export function BirthdayFields({ value, onChange }: { value: BirthdayValue; onChange: (v: BirthdayValue) => void }) {
  const thisYear = new Date().getFullYear();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.3fr)] gap-2">
      <Combobox
        aria-label="Day"
        value={value.day}
        onChange={(day) => onChange({ ...value, day })}
        placeholder="Day"
        searchPlaceholder="Type a day"
        options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
        searchable
      />
      <Combobox
        aria-label="Month"
        value={value.month}
        onChange={(month) => onChange({ ...value, month })}
        placeholder="Month"
        searchPlaceholder="Type a month"
        options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
        searchable
      />
      <Combobox
        aria-label="Year (optional)"
        value={value.year}
        onChange={(year) => onChange({ ...value, year })}
        placeholder="Year"
        searchPlaceholder="Type a year, e.g. 1995"
        options={Array.from({ length: 90 }, (_, i) => String(thisYear - 10 - i)).map((y) => ({ value: y, label: y }))}
        searchable
      />
    </div>
  );
}
