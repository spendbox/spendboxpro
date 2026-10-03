import "server-only";
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
  /** "Send a test payment" on the Payments page (never with live Mono keys). */
  testPayments: boolean;
  /** Monthly price of the Starter plan (1 bank account), in naira. */
  priceStarter: number;
  /** Monthly price of the Plus plan (up to 5 bank accounts), in naira. */
  pricePlus: number;
}

/** The on/off switches (the rest are numbers). */
export type SwitchName = "trialEnabled" | "signupsOpen" | "joinsOpen" | "emailsEnabled" | "testPayments";
export type NumberName = Exclude<keyof AppSettings, SwitchName>;

const KEYS: Record<keyof AppSettings, string> = {
  trialEnabled: "trial_enabled",
  trialDays: "trial_days",
  signupsOpen: "signups_open",
  joinsOpen: "joins_open",
  emailsEnabled: "emails_enabled",
  testPayments: "test_payments",
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
    testPayments: process.env.TEST_PAYMENTS === "on",
    priceStarter: 2500,
    pricePlus: 5000,
  };
}

/** The current switches. One quick read per request; falls back to defaults if the database isn't updated yet. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const settings = defaults();
  try {
    const { data, error } = await createAdminClient().from("app_settings").select("key, value");
    if (error) return settings;
    const byKey = new Map((data ?? []).map((row) => [row.key as string, row.value as unknown]));
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
}

/** True when live (real-money) Mono keys are in use. */
export function monoLive() {
  return Boolean(process.env.MONO_SECRET_KEY?.startsWith("live_"));
}

/** Test payments: switched on, and never with live Mono keys. */
export async function testPaymentsEnabled() {
  return !monoLive() && (await getSettings()).testPayments;
}
