import type { AppSettings } from "@/lib/settings";

const DAY = 86_400_000;

/**
 * Free-trial status for a business, worked out at request time. Null when free
 * trials are switched off in the admin area.
 */
export function getTrial(
  business: { created_at: string; trial_ends_at?: string | null },
  settings: Pick<AppSettings, "trialEnabled" | "trialDays">,
) {
  if (!settings.trialEnabled) return null;
  const endsAt = business.trial_ends_at
    ? new Date(business.trial_ends_at)
    : new Date(new Date(business.created_at).getTime() + settings.trialDays * DAY);
  const daysLeft = Math.ceil((endsAt.getTime() - Date.now()) / DAY);
  return { endsAt, daysLeft, ended: daysLeft <= 0 };
}

/** Set (for the browser session) when the owner closes the free-trial note; cleared at the next login. */
export const TRIAL_HIDDEN_COOKIE = "sb_trial_hidden";
