import type { Metadata } from "next";
import { PartnersBoard } from "@/components/business/partners-board";
import { PageHeader } from "@/components/ui/page-header";
import { loadPartners } from "../data";

export const metadata: Metadata = { title: "Find partners" };

export default async function FindPartnersPage({ params }: PageProps<"/dashboard/[bizId]/partners/find">) {
  const { bizId } = await params;
  const { business, directory, categories, invite } = await loadPartners(bizId);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/partners`, label: "Partners" }}
        title="Find partners"
        description="Businesses on Spendbox taking partners. Switch one on to partner with them."
      />
      <PartnersBoard
        view="find"
        bizId={bizId}
        enabled={business.partners_enabled}
        autoApprove={business.partners_auto_approve}
        initial={directory}
        categories={categories}
        invite={invite}
      />
    </div>
  );
}
