import { after, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { notifyReceiptToReview, notifyRewardsReady } from "@/lib/notify";
import { saveReceiptPurchase, type ReceiptResult, type ScannedReceipt } from "@/lib/receipts/save";
import { readToken } from "@/lib/receipts/token";
import { createAdminClient } from "@/lib/supabase/admin";

function reply(result: ReceiptResult, status = 200) {
  return NextResponse.json(result, { status });
}

// The customer tells us which business an unmatched receipt was for.
// It is saved as "needs review" until that business confirms it.
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return reply({ kind: "error", message: "Please log in again." }, 401);

  const body = (await request.json().catch(() => null)) as { token?: string; membershipId?: string } | null;
  const scan = body?.token ? readToken<ScannedReceipt>(body.token) : null;
  if (!scan || scan.uid !== user.id || !body?.membershipId) {
    return reply({ kind: "error", message: "This upload has expired. Please upload the receipt again." }, 400);
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, business:businesses(name)")
    .eq("id", body.membershipId)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!membership) return reply({ kind: "error", message: "Please pick one of your businesses." }, 400);
  const name = (membership.business as unknown as { name: string }).name;

  const result = await saveReceiptPurchase(admin, {
    scan,
    membershipId: membership.id,
    method: "manual",
    account: null,
    status: "pending",
    reason: `${name} will check the payment reached them, then it counts.`,
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
