import { appTimeZone, DEFAULT_COUNTRY_CODE } from "@/lib/env";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatMoney(amount: number | string | null | undefined, currency = "NGN") {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-NG")}`;
  }
}

function dateParts(date: Date) {
  const tz = appTimeZone();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return day.format(date); // YYYY-MM-DD in the app's time zone
}

/** "2:14 pm" */
export function formatTime(iso: string | Date) {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: appTimeZone(),
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .toLowerCase();
}

/** "3 Oct 2026" (year omitted when it is this year) */
export function formatDate(iso: string | Date, opts: { withYear?: boolean } = {}) {
  const d = new Date(iso);
  const sameYear = dateParts(d).slice(0, 4) === dateParts(new Date()).slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: appTimeZone(),
    day: "numeric",
    month: "short",
    year: opts.withYear || !sameYear ? "numeric" : undefined,
  }).format(d);
}

/** "Today, 2:14 pm", "Yesterday, 9:00 am" or "3 Oct, 2:14 pm" */
export function formatWhen(iso: string | Date) {
  const d = new Date(iso);
  const today = dateParts(new Date());
  const yesterday = dateParts(new Date(Date.now() - 86_400_000));
  const day = dateParts(d);
  const label = day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(d);
  return `${label}, ${formatTime(d)}`;
}

/** "Aug 2026" */
export function formatMonthYear(iso: string | Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: appTimeZone(), month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

/** Stored phones are digits only ("2348031234567"). Shown as "+234 803 123 4567". */
export function formatPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function memberNo(no: number) {
  return `#${String(no).padStart(4, "0")}`;
}

export function memberLabel(no: number, name: string | null | undefined) {
  return name?.trim() || `Member ${memberNo(no)}`;
}

export function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] ?? null;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-NG")} ${n === 1 ? one : many}`;
}

/** Link that opens a WhatsApp chat (optionally with a message). */
export function whatsappLink(phone: string | null | undefined, text?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}` : digits;
  const base = normalized ? `https://wa.me/${normalized}` : "https://wa.me/";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** "Restaurant, Small chops · Yaba, Lagos" */
export function businessTagline(b: { categories?: string[] | null; category?: string | null; location?: string | null }) {
  const kinds = b.categories?.length ? b.categories.join(", ") : b.category;
  return [kinds, b.location].filter(Boolean).join(" · ");
}

/** "2026-09" → "September 2026" */
export function monthName(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
