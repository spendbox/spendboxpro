import { Download, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { BankConnect, type BankConnectionView } from "@/components/business/bank-connect";
import { QrCode } from "@/components/qr-code";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CopyButton } from "@/components/ui/share-actions";
import { signOut } from "@/lib/actions/auth";
import { requireOwnedBusiness } from "@/lib/auth";
import { getBankAccounts } from "@/lib/business";
import { listBanks } from "@/lib/paystack";
import { receiptsEnabled, siteUrl } from "@/lib/env";
import { monoPublicKey } from "@/lib/mono";
import { createClient } from "@/lib/supabase/server";
import { BankAccounts } from "./bank-accounts";
import { BusinessForm } from "./business-form";
import { DeleteBusiness } from "./delete-business";
import { LogoUpload } from "./logo-upload";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/dashboard/[bizId]/settings">) {
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
  const joinUrl = `${siteUrl()}/j/${business.slug}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title="Settings" />

      <section className="flex flex-col gap-3">
        <SectionTitle title="Business details" />
        <Card className="flex flex-col gap-6 p-5 sm:p-7">
          <LogoUpload bizId={bizId} name={business.name} color={business.brand_color} logoUrl={business.logo_url} />
          <div className="border-t border-line pt-6">
            <BusinessForm business={business} />
          </div>
        </Card>
      </section>

      <section id="bank" className="flex scroll-mt-24 flex-col gap-3">
        <SectionTitle
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
      </section>

      {receipts && (
        <section id="receipt-accounts" className="flex scroll-mt-24 flex-col gap-3">
          <SectionTitle
            title="Accounts for receipts"
            description="When a customer uploads a receipt, we check it was paid into one of these. We never touch your money."
          />
          <Card className="p-5 sm:p-7">
            <BankAccounts bizId={bizId} accounts={accounts} banks={banks} />
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle title="Join link" />
        <Card className="flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
          <QrCode value={joinUrl} label={`QR code for ${joinUrl}`} className="w-36 shrink-0" />
          <div className="flex min-w-0 flex-col gap-3">
            <p className="font-semibold break-all">{joinUrl.replace(/^https?:\/\//, "")}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={joinUrl} />
              <a href={`/dashboard/${bizId}/qr`} className={buttonClass({ variant: "secondary" })}>
                <Download className="size-4" aria-hidden /> Download QR
              </a>
            </div>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Account" />
        <Card className="flex flex-col gap-5 p-5 sm:p-7">
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              <LogOut className="size-4" aria-hidden /> Log out
            </Button>
          </form>
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <div>
              <p className="font-semibold">Delete this business</p>
              <p className="text-sm text-muted">Removes the business, its perks, customers and payments permanently.</p>
            </div>
            <DeleteBusiness bizId={bizId} name={business.name} />
          </div>
        </Card>
      </section>
    </div>
  );
}
