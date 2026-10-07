"use client";

import type { BirthInput } from "../login/actions";

const select = "w-full rounded-xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-gold";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Partly filled date of birth: 0 means "not chosen yet". */
export type BirthDraft = { day: number; month: number; year: number };
export const emptyBirth: BirthDraft = { day: 0, month: 0, year: 0 };
export const birthComplete = (b: BirthDraft): b is BirthInput => b.day > 0 && b.month > 0 && b.year > 0;

/** Day / month / year drop-downs (easy on phones), with the 18+ note. */
export function BirthDateInput({ value, onChange }: { value: BirthDraft; onChange: (v: BirthDraft) => void }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => thisYear - i);
  // Only offer days that exist in the chosen month (29 Feb only in leap years).
  const daysInMonth = value.month ? new Date(value.year || 2000, value.month, 0).getDate() : 31;
  const set = (part: Partial<BirthDraft>) => {
    const next = { ...value, ...part };
    const max = next.month ? new Date(next.year || 2000, next.month, 0).getDate() : 31;
    if (next.day > max) next.day = 0;
    onChange(next);
  };

  return (
    <fieldset>
      <legend className="text-sm font-medium">Date of birth</legend>
      <div className="mt-1 grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <select className={select} aria-label="Day" value={value.day} onChange={(e) => set({ day: Number(e.target.value) })} required>
          <option value={0} disabled>Day</option>
          {Array.from({ length: daysInMonth }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        <select className={select} aria-label="Month" value={value.month} onChange={(e) => set({ month: Number(e.target.value) })} required>
          <option value={0} disabled>Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select className={select} aria-label="Year" value={value.year} onChange={(e) => set({ year: Number(e.target.value) })} required>
          <option value={0} disabled>Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-xs text-muted">Hide &amp; Seek is for adults 18+. Your date of birth is private.</p>
    </fieldset>
  );
}
