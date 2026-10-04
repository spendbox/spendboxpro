import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { cache } from "react";
import { trialDays } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// App-wide switches, changed in the admin area (/admin → Settings). Until a
// switch is changed there, its default comes from the environment variables.

export interface AppSettings {
  /** Businesses get a free-trial period (and see the trial note). */
  trialEnabled: boolean;
  /** Length of the free trial for businesses without their own end date. */
  trialDays: number;
  /** New businesses can sign up. */
  signupsOpen: boolean;
  /** Customers can join businesses. */
  joinsOpen: boolean;
  /** Spendbox sends emails (perks, purchases, new members…). */
  emailsEnabled: boolean;
  /** Monthly price of the Starter plan, in naira. */
  priceStarter: number;
  /** Monthly price of the Plus plan, in naira. */
  pricePlus: number;
}

/** The on/off switches (the rest are numbers). */
export type SwitchName = "trialEnabled" | "signupsOpen" | "joinsOpen" | "emailsEnabled";
export type NumberName = Exclude<keyof AppSettings, SwitchName>;

const KEYS: Record<keyof AppSettings, string> = {
  trialEnabled: "trial_enabled",
  trialDays: "trial_days",
  signupsOpen: "signups_open",
  joinsOpen: "joins_open",
  emailsEnabled: "emails_enabled",
  priceStarter: "price_starter",
  pricePlus: "price_plus",
};

const NUMBERS: Partial<Record<keyof AppSettings, [number, number]>> = {
  trialDays: [1, 3650],
  priceStarter: [0, 10_000_000],
  pricePlus: [0, 10_000_000],
};

function defaults(): AppSettings {
  return {
    trialEnabled: true,
    trialDays: trialDays(),
    signupsOpen: true,
    joinsOpen: true,
    emailsEnabled: true,
    priceStarter: 2500,
    pricePlus: 5000,
  };
}

// Settings change rarely, so they're kept for a minute across requests (saving one clears it).
const SETTINGS_TAG = "app-settings";
const readSettingRows = unstable_cache(
  async () => {
    const { data, error } = await createAdminClient().from("app_settings").select("key, value");
    if (error) throw new Error(error.message);
    return (data ?? []) as { key: string; value: unknown }[];
  },
  ["app-settings"],
  { tags: [SETTINGS_TAG], revalidate: 60 },
);

/** The current switches. Falls back to defaults if the database isn't updated yet. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const settings = defaults();
  try {
    const byKey = new Map((await readSettingRows()).map((row) => [row.key, row.value]));
    for (const [name, key] of Object.entries(KEYS) as [keyof AppSettings, string][]) {
      const value = byKey.get(key);
      if (value === undefined || value === null) continue;
      const range = NUMBERS[name];
      if (range) {
        const n = Number(value);
        if (Number.isFinite(n) && n >= range[0] && n <= range[1]) (settings[name] as number) = Math.round(n);
      } else if (typeof value === "boolean") {
        (settings[name] as boolean) = value;
      }
    }
  } catch {
    // Database not reachable or not updated: use the defaults.
  }
  return settings;
});

export async function saveSetting<K extends keyof AppSettings>(name: K, value: AppSettings[K], actor: string) {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: KEYS[name], value, updated_at: new Date().toISOString(), updated_by: actor });
  if (error) throw new Error(error.message);
  updateTag(SETTINGS_TAG);
}
