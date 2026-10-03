"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireOwnedBusiness } from "@/lib/auth";
import { senderKey } from "@/lib/bank/match";
import { billingState, PLANS } from "@/lib/billing";
import { matchOpenPayments, syncBusiness, syncConnection } from "@/lib/bank/sync";
import { testPaymentsEnabled } from "@/lib/settings";
import { accountDetails, exchangeToken, monoConfigured, unlinkAccount } from "@/lib/mono";
import { notifyPurchase, notifyRewardsReady } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Connecting bank accounts through Mono, and sorting out payments that
// Spendbox couldn't match by itself. Every action re-checks ownership.

export interface BankResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

function refresh(bizId: string) {
  revalidatePath(`/dashboard/${bizId}`, "layout");
}

/** Finishes connecting a bank: swaps Mono's one-time code for the account and starts fetching payments. */
export async function connectBank(bizId: string, code: string, email?: string): Promise<BankResult> {
  const { business } = await requireOwnedBusiness(bizId);
  if (!monoConfigured()) return { error: "Bank connections aren't set up yet." };
  if (!code || code.length > 200) return { error: "Mono didn't send a code. Please try again." };

  let accountId: string;
  try {
    accountId = await exchangeToken(code);
  } catch (error) {
    console.error("Mono exchangeToken failed", error);
    return { error: `Mono couldn't finish connecting: ${error instanceof Error ? error.message : "please try again."}` };
  }
  // Mono can take a moment to prepare a new account; if its details aren't ready
  // yet, save the connection anyway and fill them in on the next check.
  const details: Awaited<ReturnType<typeof accountDetails>> = await accountDetails(accountId).catch((error) => {
    console.error("Mono accountDetails failed", error);
    return { name: null, accountNumber: null, institution: null, currency: "NGN", balance: null, dataStatus: null };
  });

  const admin = createAdminClient();
  const cleanEmail = email?.trim().slice(0, 200);
  if (!business.email && cleanEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    await admin.from("businesses").update({ email: cleanEmail }).eq("id", bizId);
  }
  const fields = {
    business_id: bizId,
    mono_account_id: accountId,
    institution: details.institution?.slice(0, 80) ?? null,
    account_name: details.name?.slice(0, 120) ?? null,
    account_number: details.accountNumber?.slice(0, 20) ?? null,
    currency: details.currency,
    status: "active",
    last_error: null,
  };

  // Reconnecting the same account replaces the old link and keeps its history.
  let existing: { id: string; mono_account_id: string } | null = null;
  if (details.accountNumber) {
    const { data } = await admin
      .from("bank_connections")
      .select("id, mono_account_id")
      .eq("business_id", bizId)
      .eq("account_number", details.accountNumber)
      .maybeSingle();
    existing = data;
  }
  // Each plan covers a number of connected accounts (Mono charges us per account).
  if (!existing) {
    const { count } = await admin.from("bank_connections").select("id", { count: "exact", head: true }).eq("business_id", bizId);
    const { bankLimit, status } = billingState(business);
    if ((count ?? 0) >= bankLimit) {
      await unlinkAccount(accountId).catch((e) => console.error("Mono unlink failed", e));
      return {
        error:
          status === "active" && business.plan !== "plus"
            ? `Your Starter plan covers ${PLANS.starter.banks} bank account. Switch to Plus in Settings → Plan & billing to connect up to ${PLANS.plus.banks}.`
            : `You can connect up to ${bankLimit} bank accounts.`,
      };
    }
  }
  let connectionId: string;
  if (existing) {
    const { error } = await admin.from("bank_connections").update(fields).eq("id", existing.id);
    if (error) return { error: error.message };
    connectionId = existing.id;
  } else {
    const { data, error } = await admin
      .from("bank_connections")
      .upsert(fields, { onConflict: "mono_account_id" })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? "This account is already connected." : error.message };
    connectionId = data.id;
  }

  after(() => syncConnection(connectionId).catch((e) => console.error("First bank sync failed", e)));
  refresh(bizId);
  return {
    ok: true,
    message: `${details.institution ?? "Your bank"} is connected. Payments will start showing up in a few minutes.`,
  };
}

export async function disconnectBank(bizId: string, connectionId: string): Promise<BankResult> {
  await requireOwnedBusiness(bizId);
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("bank_connections")
    .select("id, mono_account_id")
    .eq("id", connectionId)
    .eq("business_id", bizId)
    .maybeSingle();
  if (!conn) return { error: "That account isn't connected." };
  await unlinkAccount(conn.mono_account_id).catch((e) => console.error("Mono unlink failed", e));
  await admin.from("bank_connections").delete().eq("id", conn.id);
  refresh(bizId);
  return { ok: true };
}

/** "Check for new payments" button. */
export async function syncNow(bizId: string): Promise<BankResult> {
  await requireOwnedBusiness(bizId);
  const result = await syncBusiness(bizId);
  refresh(bizId);
  if (result.error) return { error: `Couldn't reach your bank: ${result.error}` };
  if (!result.connections) return { error: "Connect a bank account first." };
  return {
    ok: true,
    message:
      result.added === 0
        ? "You're up to date."
        : `${result.added} new payment${result.added === 1 ? "" : "s"}, ${result.matched} counted for customers.`,
  };
}

/** "This was Member #0012." Also re-checks other waiting payments, since Spendbox now knows this sender. */
export async function assignPayment(bizId: string, txId: string, membershipId: string): Promise<BankResult> {
  await requireOwnedBusiness(bizId);
  if (!membershipId) return { error: "Please choose a customer." };
  const supabase = await createClient();
  const { data: purchaseId, error } = await supabase.rpc("assign_bank_payment", { p_tx_id: txId, p_membership_id: membershipId });
  if (error) return { error: error.message };
  after(async () => {
    await notifyPurchase(purchaseId as string, "bank");
    await notifyRewardsReady();
    await matchOpenPayments(bizId);
  });
  refresh(bizId);
  return { ok: true };
}

/** "Not a customer." */
export async function ignorePayment(bizId: string, txId: string, always: boolean): Promise<BankResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("ignore_bank_payment", { p_tx_id: txId, p_always: always });
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}

/** "Wrong customer" on a payment Spendbox matched. */
export async function unmatchPayment(bizId: string, purchaseId: string): Promise<BankResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("unmatch_bank_payment", { p_purchase_id: purchaseId });
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}

/**
 * Pretends a transfer just arrived in the business's bank, then runs the same
 * matching a real Mono payment goes through. Only when TEST_PAYMENTS=on.
 */
export async function sendTestPayment(bizId: string, input: { name: string; account: string; amount: string }): Promise<BankResult> {
  const { business } = await requireOwnedBusiness(bizId);
  if (!(await testPaymentsEnabled())) return { error: "Test payments are switched off." };
  const name = input.name.replace(/\s+/g, " ").trim().toUpperCase().slice(0, 100);
  const account = input.account.replace(/\D/g, "");
  const amount = Number(input.amount.replace(/[^0-9.]/g, ""));
  if (!senderKey(name)) return { error: "Type at least two names, the way the bank shows them." };
  if (account && account.length !== 10) return { error: "Account numbers have 10 digits. Or leave it empty." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return { error: "Type how much they sent." };

  const admin = createAdminClient();
  const { data: tx, error } = await admin
    .from("bank_transactions")
    .insert({
      business_id: bizId,
      external_id: `test-${crypto.randomUUID()}`,
      amount: Math.round(amount * 100) / 100,
      currency: business.currency,
      paid_at: new Date().toISOString(),
      narration: `TEST TRANSFER FROM ${name}${account ? ` ${account}` : ""}`,
      sender_name: name,
      sender_key: senderKey(name),
      sender_account: account || null,
      status: "unmatched",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await matchOpenPayments(bizId, admin);
  const { data: after_ } = await admin.from("bank_transactions").select("status").eq("id", tx.id).single();
  refresh(bizId);
  return after_?.status === "matched"
    ? { ok: true, message: "It worked: Spendbox found the customer and counted it for them." }
    : { ok: true, message: "It arrived, but Spendbox couldn't tell who sent it. You'll find it under “Who paid this?” below." };
}
