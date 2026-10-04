import { formatMoney } from "@/lib/format";

// Small helpers for showing requests. No database calls.

/** Requests stay up this long. */
export const REQUEST_HOURS = 24;
export const MAX_REQUEST_IMAGES = 4;
/** After shrinking in the browser; originals can be much bigger. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

/** "Up to ₦30,000" or "₦20,000 – ₦30,000". */
export function budgetLabel(min: number | null, max: number, currency = "NGN") {
  return min && min > 0 && min < max ? `${formatMoney(min, currency)} – ${formatMoney(max, currency)}` : `Up to ${formatMoney(max, currency)}`;
}

/** Whether a request is still live. */
export function isLive(r: { status: string; expires_at: string }, now = Date.now()) {
  return r.status === "open" && new Date(r.expires_at).getTime() > now;
}

/** "18h left", "45m left", "Ended". */
export function timeLeftLabel(expiresAt: string, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "Ended";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.max(1, Math.floor((ms % 3_600_000) / 60_000));
  return h >= 1 ? `${h}h left` : `${m}m left`;
}

/** Share of the 24 hours still left, 0–1. */
export function lifeLeft(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.min(1, (new Date(expiresAt).getTime() - now) / (REQUEST_HOURS * 3_600_000)));
}

/** "2h ago", "just now". */
export function timeAgo(iso: string, now = Date.now()) {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Ideas shown in the composer, to get people started. */
export const REQUEST_IDEAS = [
  { label: "A cake", text: "A cake for a birthday on Saturday, about 8 inches, red velvet if possible.", category: "Bakery & cakes" },
  { label: "Hair", text: "Knotless braids, mid-back length, this week.", category: "Hair salon" },
  { label: "Tailor", text: "A tailor to sew an agbada from my fabric before next Friday.", category: "Tailoring" },
  { label: "Food tray", text: "Small chops for 30 people, delivered Saturday afternoon.", category: "Small chops & snacks" },
  { label: "Phone fix", text: "My phone screen is cracked. Need it replaced today.", category: "Phone repairs" },
  { label: "Makeup", text: "Makeup for a wedding guest on Sunday morning.", category: "Makeup" },
];
