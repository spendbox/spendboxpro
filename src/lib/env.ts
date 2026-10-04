// Settings read from environment variables (set them in Vercel → Settings →
// Environment Variables, or in .env.local when running on your computer).

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. See README → Setup.");
  return url;
}

export function supabasePublicKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See README → Setup.");
  return key;
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

/** Server only. Never expose this key to the browser. */
export function supabaseSecretKey() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY. See README → Setup.");
  return key;
}

/** The public address of the app, used in share links and QR codes. */
export function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Time zone used to read receipt times and show dates. */
export function appTimeZone() {
  return process.env.NEXT_PUBLIC_TIME_ZONE ?? "Africa/Lagos";
}

/** Country calling code pre-selected on phone number fields. */
export const DEFAULT_COUNTRY_CODE = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "234";

/** Starting length of the free trial for new businesses, in days (default 14). Changed later in /admin. */
export function trialDays() {
  const days = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS ?? 14);
  return Number.isFinite(days) && days > 0 ? Math.round(days) : 14;
}
