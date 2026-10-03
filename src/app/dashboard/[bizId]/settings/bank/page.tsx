import type { Metadata } from "next";
import { BankConnect, type BankConnectionView } from "@/components/business/bank-connect";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getBankAccounts } from "@/lib/business";
import { receiptsEnabled } from "@/lib/env";
import { monoPublicKey } from "@/lib/mono";
import { listBanks } from "@/lib/paystack";
import { createClient } from "@/lib/supabase/server";
import { BankAccounts } from "../bank-accounts";

export const metadata: Metadata = { title: "Your bank" };

export default async function BankSettingsPage({ params }: PageProps<"/dashboard/[bizId]/settings/bank">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  const receipts = receiptsEnabled();
  const supabase = await createClient();
  const [accounts, banks, { data: connections }] = await Promise.all([
    receipts ? getBankAccounts(bizId) : [],
    receipts ? listBanks() : [],
    supabase
      .from("bank_connections")
      .select("id, institution, account_name, account_number, status, last_error, last_synced_at, last_fetch_count, data_status")
      .eq("business_id", bizId)
      .order("created_at"),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/settings`, label: "Settings" }}
        title="Your bank"
        description="Connect every account customers pay into. When a customer pays by transfer, Spendbox sees it and counts it for them — no receipts needed."
      />
      <Card className="p-5 sm:p-7">
        <BankConnect
          bizId={bizId}
          publicKey={monoPublicKey()}
          businessName={business.name}
          businessEmail={business.email}
          connections={(connections ?? []) as BankConnectionView[]}
        />
      </Card>
      {receipts && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Accounts for receipts" description="When a customer uploads a receipt, we check it was paid into one of these." />
          <Card className="p-5 sm:p-7">
            <BankAccounts bizId={bizId} accounts={accounts} banks={banks} />
          </Card>
        </section>
      )}
    </div>
  );
}
