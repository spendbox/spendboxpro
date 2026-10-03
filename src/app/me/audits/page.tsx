import type { Metadata } from "next";
import { AuditList } from "@/components/audit-list";
import { PageHeader } from "@/components/ui/page-header";
import { auditTone, customerSentence, type AuditRow } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audits" };

/** Everything businesses did with this customer's purchases and perks. */
export default async function AuditsPage() {
  await requireUser("/me/audits");
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_events")
    .select("id, kind, title, amount, currency, created_at, business:businesses(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const items = (data ?? []).map((row) => {
    const business = (row.business as unknown as { name: string } | null)?.name ?? "A business";
    return { id: row.id, sentence: customerSentence(row as AuditRow, business), created_at: row.created_at, tone: auditTone(row.kind as AuditRow["kind"]) };
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        back={{ href: "/me/profile", label: "Profile" }}
        title="Audits"
        description="Every time a business records, confirms or removes a purchase, or gives or removes a perk, it shows here. Nobody can edit this list."
      />
      <AuditList items={items} empty="Nothing yet. When a business records a purchase or gives you a perk, you'll see it here." />
    </div>
  );
}
