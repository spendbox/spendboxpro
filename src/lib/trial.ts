import { trialDays } from "@/lib/env";

/** Free-trial status for a business, worked out at request time. */
export function getTrial(createdAt: string) {
  const endsAt = new Date(new Date(createdAt).getTime() + trialDays() * 86_400_000);
  const daysLeft = Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000);
  return { endsAt, daysLeft, ended: daysLeft <= 0 };
}

/** Set (for the browser session) when the owner closes the free-trial note; cleared at the next login. */
export const TRIAL_HIDDEN_COOKIE = "sb_trial_hidden";
