import { createHash, randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { notifyReceiptToReview, notifyRewardsReady } from "@/lib/notify";
import { appTimeZone } from "@/lib/env";
import { extractReceipt, ReceiptReadError } from "@/lib/receipts/extract";
import { matchReceipt, type Candidate, type Match } from "@/lib/receipts/match";
import { saveReceiptPurchase, type ReceiptResult, type ScannedReceipt } from "@/lib/receipts/save";
import { receiptMoment } from "@/lib/receipts/time";
import { createToken } from "@/lib/receipts/token";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const MAX_BYTES = 4_400_000; // Vercel accepts request bodies up to 4.5 MB.
const MAX_AGE_DAYS = 30;

function reply(result: ReceiptResult, status = 200) {
  return NextResponse.json(result, { status });
}

function decide(match: Match, paidAt: Date | null, currency: string | null, businessCurrency: string) {
  const name = match.candidate.businessName;
  if (match.method !== "account") {
    return { status: "pending" as const, reason: `The bank account wasn't clear on this receipt, so ${name} will confirm it.` };
  }
  if (match.ambiguous) {
    return { status: "pending" as const, reason: `More than one of your businesses could match, so ${name} will confirm it.` };
  }
  if (!paidAt) return { status: "pending" as const, reason: `We couldn't read the date, so ${name} will confirm it.` };
  if (paidAt.getTime() < Date.now() - MAX_AGE_DAYS * 86_400_000) {
    return { status: "pending" as const, reason: `This receipt is over ${MAX_AGE_DAYS} days old, so ${name} will confirm it.` };
  }
  if (paidAt.getTime() > Date.now() + 86_400_000) {
    return { status: "pending" as const, reason: `The date on this receipt is in the future, so ${name} will confirm it.` };
  }
  if (currency && currency !== businessCurrency) {
    return { status: "pending" as const, reason: `This receipt is in ${currency}, so ${name} will confirm it.` };
  }
  return { status: "verified" as const, reason: null };
}

// Upload a receipt: Claude reads it, we match it to one of the customer's
// businesses using their bank accounts, and save it as a purchase.
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return reply({ kind: "error", message: "Please log in again." }, 401);
  if (!process.env.ANTHROPIC_API_KEY) {
    return reply({ kind: "error", message: "Receipt reading isn't switched on yet. (Owner: add ANTHROPIC_API_KEY.)" }, 503);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return reply({ kind: "error", message: "Please choose a receipt to upload." }, 400);
  const ext = TYPES[file.type];
  if (!ext) return reply({ kind: "error", message: "Please upload a photo, screenshot (JPG or PNG) or PDF." }, 415);
  if (file.size > MAX_BYTES) return reply({ kind: "error", message: "That file is too big. Please upload a smaller one." }, 413);

  const admin = createAdminClient();

  // Fair use: limits how often one person can use the receipt reader.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("receipt_scans")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", user.id)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= 20) {
    return reply({ kind: "error", message: "You've uploaded a lot of receipts. Please try again in an hour." }, 429);
  }

  const { data: memberships } = await admin
    .from("memberships")
    .select("id, business:businesses(id, name, currency, bank_accounts(id, bank_name, account_number, account_name))")
    .eq("customer_id", user.id);
  if (!memberships?.length) {
    return reply({ kind: "error", message: "Join a business first — receipts are counted for businesses in your Spendbox." }, 400);
  }
  await admin.from("receipt_scans").insert({ customer_id: user.id });

  const candidates: (Candidate & { currency: string })[] = memberships.map((m) => {
    const b = m.business as unknown as { id: string; name: string; currency: string; bank_accounts: Candidate["accounts"] };
    return { membershipId: m.id, businessId: b.id, businessName: b.name, accounts: b.bank_accounts ?? [], currency: b.currency };
  });

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");

  let extracted;
  try {
    extracted = await extractReceipt(bytes, file.type);
  } catch (error) {
    if (error instanceof ReceiptReadError) return reply({ kind: "error", message: error.message }, 422);
    throw error;
  }

  if (!extracted.is_payment_receipt) {
    return reply({ kind: "error", message: "That doesn't look like a payment receipt. Try a screenshot of your transfer receipt." }, 422);
  }
  if (extracted.payment_successful === false) {
    return reply({ kind: "error", message: "This receipt shows a payment that didn't go through, so it can't be counted." }, 422);
  }
  if (!extracted.amount || extracted.amount <= 0) {
    return reply({ kind: "error", message: "We couldn't read the amount. Please try a clearer photo or screenshot." }, 422);
  }

  const path = `${user.id}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage.from("receipts").upload(path, bytes, { contentType: file.type });
  if (uploadError) {
    console.error("Receipt upload failed", uploadError);
    return reply({ kind: "error", message: "We couldn't store your receipt. Please try again." }, 500);
  }

  const paidAt = receiptMoment(extracted.paid_date, extracted.paid_time, appTimeZone());
  const scan: ScannedReceipt = { uid: user.id, path, hash, paidAt: paidAt?.toISOString() ?? null, extracted };
  const match = matchReceipt(candidates, extracted);

  if (!match) {
    // Let the customer say which business it was for; that business then confirms it.
    return reply({
      kind: "unmatched",
      token: createToken(scan),
      summary: {
        amount: extracted.amount,
        currency: extracted.currency ?? candidates[0].currency,
        paidAt: scan.paidAt,
        recipient:
          [extracted.recipient_name ?? extracted.merchant_name, extracted.recipient_account_number]
            .filter(Boolean)
            .join(" · ") || null,
      },
      options: candidates.map((c) => ({ membershipId: c.membershipId, name: c.businessName })),
    });
  }

  const businessCurrency = candidates.find((c) => c.membershipId === match.candidate.membershipId)!.currency;
  const { status, reason } = decide(match, paidAt, extracted.currency, businessCurrency);
  const result = await saveReceiptPurchase(admin, {
    scan,
    membershipId: match.candidate.membershipId,
    method: match.method,
    account: match.account,
    status,
    reason,
  });
  if (result.kind === "saved") {
    const { purchaseId, status: saved } = result;
    after(async () => {
      await notifyRewardsReady();
      if (saved === "pending") await notifyReceiptToReview(purchaseId);
    });
  }
  return reply(result, result.kind === "error" ? 409 : 200);
}
