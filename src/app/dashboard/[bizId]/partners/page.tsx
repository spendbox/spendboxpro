import type { Metadata } from "next";
import { PartnersBoard } from "@/components/business/partners-board";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PartnerListing } from "@/lib/types";

export const metadata: Metadata = { title: "Partners" };

const STEPS = [
  { title: "Switch it on", body: "Turn on cross-promotion so other businesses can find you." },
  { title: "Pick up to 2 partners", body: "Search by name or category, and switch on the ones that suit your customers." },
  { title: "Share perks", body: "Once they agree, your perks show to their customers as “from our partners”, and theirs to yours." },
];

export default async function PartnersPage({ params }: PageProps<"/dashboard/[bizId]/partners">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { data } = await supabase.rpc("partner_directory", { p_business_id: bizId, p_query: null, p_category: null });
  const directory = (data ?? []) as PartnerListing[];

  // Categories of businesses taking partners, most common first.
  const counts = new Map<string, number>();
  for (const b of directory) for (const c of b.categories ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
  const categories = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c).slice(0, 14);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/perks`, label: "Perks" }}
        title="Partners"
        description="Team up with businesses that complement yours, and reach each other's customers."
      />
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold text-ink">{s.title}</p>
              <p className="text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <PartnersBoard
        bizId={bizId}
        enabled={business.partners_enabled}
        autoApprove={business.partners_auto_approve}
        initial={directory}
        categories={categories}
      />
    </div>
  );
}
