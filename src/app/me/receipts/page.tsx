import type { Metadata } from "next";
import { PurchaseList } from "@/components/purchases/purchase-list";
import { ReceiptUploader } from "@/components/receipts/receipt-uploader";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyPurchases } from "@/lib/customer";

export const metadata: Metadata = { title: "Add a receipt" };

export default async function ReceiptsPage() {
  const user = await requireUser("/me/receipts");
  const [memberships, purchases] = await Promise.all([getMyMemberships(user.id), getMyPurchases(user.id)]);
  const names = Object.fromEntries(memberships.map((m) => [m.business_id, m.business.name]));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeader title="Add a receipt" description="Paid by transfer or POS? Upload the receipt and it counts toward your perks." />
      <ReceiptUploader hasBusinesses={memberships.length > 0} />
      <section className="flex flex-col gap-3">
        <SectionTitle title="Your receipts" />
        <Card className="p-5">
          {purchases.length === 0 ? (
            <p className="text-muted">Receipts you upload will show here.</p>
          ) : (
            <PurchaseList purchases={purchases} businessNames={names} />
          )}
        </Card>
      </section>
      <p className="text-sm text-muted">
        Only you and the business you paid can see a receipt. A receipt can only be used once.
      </p>
    </div>
  );
}
