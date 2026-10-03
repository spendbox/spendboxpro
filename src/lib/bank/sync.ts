import "server-only";
import { decideMatch, parseNarration, senderKey, type MemberCandidate, type RecordedPurchase } from "@/lib/bank/match";
import { accountDetails, listCredits, MonoError } from "@/lib/mono";
import { notifyPurchase, notifyRewardsReady } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

// Brings in money that arrived in a business's connected bank accounts and
// counts it for the right members. Safe to run as often as you like: payments
// are saved once, and each one is counted once.

const DAY = 86_400_000;
/** Payments up to this long before connecting can still be matched to members; older ones are sales history only. */
const FIRST_SYNC_DAYS = 7;
/** The first fetch reads the account's whole history (for sales), up to this many pages. */
const HISTORY_PAGES = 50;
/** Later syncs re-read a few days, in case the bank posts payments late. */
const OVERLAP_DAYS = 3;
/** Payments older than this stay in "who paid this?" but aren't re-matched. */
const MATCH_WINDOW_DAYS = 45;

type Admin = ReturnType<typeof createAdminClient>;

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Fetches new payments for one connected account, then matches them. */
export async function syncConnection(connectionId: string) {
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("bank_connections")
    .select(
      "id, business_id, mono_account_id, account_name, account_number, currency, last_synced_at, history_synced_at, created_at, business:businesses(ignored_senders)",
    )
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn) return { added: 0, matched: 0 };

  const now = new Date();
  // Until Mono has shared some history, keep asking for all of it (Mono can
  // take a while to prepare an account after it's connected).
  const fullHistory = !conn.history_synced_at || !conn.last_synced_at;

  let credits;
  let details: Awaited<ReturnType<typeof accountDetails>> | null = null;
  try {
    details = await accountDetails(conn.mono_account_id).catch(() => null);
    credits = fullHistory
      ? await listCredits(conn.mono_account_id, null, null, HISTORY_PAGES)
      : await listCredits(conn.mono_account_id, new Date(new Date(conn.last_synced_at).getTime() - OVERLAP_DAYS * DAY), now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't reach the bank";
    const reauth = error instanceof MonoError && (/re-?auth/i.test(message) || error.status === 401 || error.status === 403);
    await admin
      .from("bank_connections")
      .update({ status: reauth ? "reauth" : "error", last_error: message.slice(0, 300) })
      .eq("id", conn.id);
    return { added: 0, matched: 0, error: message };
  }

  const ignored = new Set(((conn.business as unknown as { ignored_senders: string[] } | null)?.ignored_senders ?? []) as string[]);
  const ownKey = senderKey(conn.account_name);
  const historyBefore = new Date(conn.created_at).getTime() - FIRST_SYNC_DAYS * DAY;
  const rows = credits.map((c) => {
    const sender = parseNarration(c.narration, conn.account_number);
    const key = senderKey(sender.name);
    const skip = key !== null && (key === ownKey || ignored.has(key));
    const old = new Date(c.date).getTime() < historyBefore;
    return {
      business_id: conn.business_id,
      connection_id: conn.id,
      external_id: c.id,
      amount: c.amount,
      currency: c.currency || conn.currency,
      paid_at: new Date(c.date).toISOString(),
      narration: c.narration?.slice(0, 500) ?? null,
      sender_name: sender.name,
      sender_key: key,
      sender_account: sender.account,
      status: skip ? "ignored" : old ? "history" : "unmatched",
    };
  });

  let added = 0;
  for (const batch of chunks(rows, 200)) {
    const { data, error } = await admin
      .from("bank_transactions")
      .upsert(batch, { onConflict: "business_id,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    added += data?.length ?? 0;
  }

  await admin
    .from("bank_connections")
    .update({
      status: "active",
      last_error: null,
      last_synced_at: now.toISOString(),
      last_fetch_count: credits.length,
      ...(fullHistory && credits.length > 0 ? { history_synced_at: now.toISOString() } : {}),
      ...(details?.balance !== null && details?.balance !== undefined ? { balance: details.balance, balance_at: now.toISOString() } : {}),
      ...(details?.dataStatus ? { data_status: details.dataStatus } : {}),
      // Fill in account details Mono didn't have ready when the bank was connected.
      ...(details?.institution ? { institution: details.institution.slice(0, 80) } : {}),
      ...(details?.name ? { account_name: details.name.slice(0, 120) } : {}),
      ...(details?.accountNumber ? { account_number: details.accountNumber.slice(0, 20) } : {}),
    })
    .eq("id", conn.id);

  const matched = await matchOpenPayments(conn.business_id, admin);
  return { added, matched };
}

/** Syncs every connected account of a business. */
export async function syncBusiness(businessId: string) {
  const { data } = await createAdminClient().from("bank_connections").select("id").eq("business_id", businessId);
  let added = 0;
  let matched = 0;
  let error: string | undefined;
  for (const c of data ?? []) {
    const r = await syncConnection(c.id);
    added += r.added;
    matched += r.matched;
    error ??= r.error;
  }
  return { added, matched, error, connections: data?.length ?? 0 };
}

/** Syncs a business if nothing has been fetched for a while (used when the owner opens the dashboard). */
export async function syncBusinessIfStale(businessId: string, maxAgeMinutes = 30) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();
  const { data } = await createAdminClient()
    .from("bank_connections")
    .select("id")
    .eq("business_id", businessId)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`);
  for (const c of data ?? []) await syncConnection(c.id);
}

/** Tries to match every payment still waiting for a member. Returns how many were counted. */
export async function matchOpenPayments(businessId: string, admin: Admin = createAdminClient()) {
  const since = new Date(Date.now() - MATCH_WINDOW_DAYS * DAY).toISOString();
  const { data: open } = await admin
    .from("bank_transactions")
    .select("id, amount, paid_at, sender_name, sender_key, sender_account")
    .eq("business_id", businessId)
    .eq("status", "unmatched")
    .gte("paid_at", since)
    .order("paid_at", { ascending: true })
    .limit(500);
  if (!open?.length) return 0;

  // Members, their profile names, and senders already recognised as them.
  const { data: memberships } = await admin
    .from("memberships")
    .select("id, customer_id, joined_at")
    .eq("business_id", businessId);
  if (!memberships?.length) return 0;

  const byCustomer = new Map<string, MemberCandidate>();
  for (const m of memberships) {
    byCustomer.set(m.customer_id, { membershipId: m.id, joinedAt: m.joined_at, fullName: null, payers: [] });
  }
  for (const ids of chunks([...byCustomer.keys()], 200)) {
    const [{ data: profiles }, { data: payers }] = await Promise.all([
      admin.from("profiles").select("id, full_name").in("id", ids),
      admin.from("payers").select("customer_id, sender_key, sender_account, sender_name").in("customer_id", ids),
    ]);
    const membershipIds = ids.map((id) => byCustomer.get(id)!.membershipId);
    const { data: rejections } = await admin.from("bank_sender_rejections").select("membership_id, sender").in("membership_id", membershipIds);
    const byMembership = new Map([...byCustomer.values()].map((m) => [m.membershipId, m]));
    for (const r of rejections ?? []) {
      const m = byMembership.get(r.membership_id);
      if (m) m.notSenders = [...(m.notSenders ?? []), r.sender];
    }
    for (const p of profiles ?? []) byCustomer.get(p.id)!.fullName = p.full_name;
    for (const p of payers ?? []) {
      byCustomer.get(p.customer_id)!.payers.push({ senderKey: p.sender_key, senderAccount: p.sender_account, senderName: p.sender_name });
    }
  }
  const members = [...byCustomer.values()];
  const memberById = new Map(members.map((m) => [m.membershipId, m]));

  // Purchases the business typed in that aren't linked to a bank payment yet.
  const [{ data: typed }, { data: linked }] = await Promise.all([
    admin
      .from("purchases")
      .select("id, membership_id, amount, paid_at")
      .eq("business_id", businessId)
      .eq("source", "business")
      .eq("status", "verified")
      .gte("paid_at", new Date(Date.now() - (MATCH_WINDOW_DAYS + 1) * DAY).toISOString()),
    admin.from("bank_transactions").select("purchase_id").eq("business_id", businessId).not("purchase_id", "is", null).gte("paid_at", since),
  ]);
  const taken = new Set((linked ?? []).map((l) => l.purchase_id));
  let recorded: RecordedPurchase[] = (typed ?? [])
    .filter((p) => !taken.has(p.id))
    .map((p) => ({ id: p.id, membershipId: p.membership_id, amount: Number(p.amount), paidAt: p.paid_at }));

  const counted: string[] = [];
  for (const tx of open) {
    const payment = {
      amount: Number(tx.amount),
      paidAt: tx.paid_at,
      senderName: tx.sender_name,
      senderKey: tx.sender_key,
      senderAccount: tx.sender_account,
    };
    const decision = decideMatch(payment, members, recorded);
    if (decision.kind === "none") continue;

    const method = decision.kind === "recorded" ? "recorded" : decision.method;
    const { data: purchaseId, error } = await admin.rpc("settle_bank_transaction", {
      p_tx_id: tx.id,
      p_membership_id: decision.membershipId,
      p_method: method,
      p_purchase_id: decision.purchaseId ?? null,
    });
    if (error) {
      console.error("settle_bank_transaction failed", error.message);
      continue;
    }
    if (decision.purchaseId) recorded = recorded.filter((r) => r.id !== decision.purchaseId);
    else counted.push(purchaseId as string);
    // Later payments in this batch from the same sender now count straight away.
    memberById.get(decision.membershipId)?.payers.push({
      senderKey: tx.sender_key,
      senderAccount: tx.sender_account,
      senderName: tx.sender_name,
    });
  }

  for (const id of counted) await notifyPurchase(id, "bank");
  if (counted.length) await notifyRewardsReady();
  return counted.length;
}
