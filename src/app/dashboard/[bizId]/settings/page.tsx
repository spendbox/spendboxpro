import { Download, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { QrCode } from "@/components/qr-code";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CopyButton } from "@/components/ui/share-actions";
import { signOut } from "@/lib/actions/auth";
import { requireOwnedBusiness } from "@/lib/auth";
import { getBankAccounts } from "@/lib/business";
import { siteUrl } from "@/lib/env";
import { BankAccounts } from "./bank-accounts";
import { BusinessForm } from "./business-form";
import { DeleteBusiness } from "./delete-business";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/dashboard/[bizId]/settings">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  const accounts = await getBankAccounts(bizId);
  const joinUrl = `${siteUrl()}/j/${business.slug}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title="Settings" />

      <section className="flex flex-col gap-3">
        <SectionTitle title="Business details" />
        <Card className="p-5 sm:p-7">
          <BusinessForm business={business} />
        </Card>
      </section>

      <section id="bank" className="flex scroll-mt-24 flex-col gap-3">
        <SectionTitle
          title="Accounts you get paid into"
          description="Add every account customers pay into. When a customer uploads a receipt, we check it was paid into one of these. We never touch your money."
        />
        <Card className="p-5 sm:p-7">
          <BankAccounts bizId={bizId} accounts={accounts} />
        </Card>
      </section>

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
