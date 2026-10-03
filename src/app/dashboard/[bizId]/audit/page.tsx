import { Eye } from "lucide-react";
import type { Metadata } from "next";
import { AuditList } from "@/components/audit-list";
import { PageHeader } from "@/components/ui/page-header";
import { auditTone, businessSentence, type AuditRow } from "@/lib/audit";
import { requireOwnedBusiness } from "@/lib/auth";
import { getMembers } from "@/lib/business";
import { memberLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

/** Everything recorded, changed or given at this business. Customers see their own part. */
export default async function AuditPage({ params }: PageProps<"/dashboard/[bizId]/audit">) {
  const { bizId } = await params;
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const [{ data }, members] = await Promise.all([
    supabase
      .from("audit_events")
      .select("id, kind, title, amount, currency, created_at, membership_id")
      .eq("business_id", bizId)
      .order("created_at", { ascending: false })
      .limit(300),
    getMembers(bizId),
  ]);
  const byId = new Map(members.map((m) => [m.membership_id, memberLabel(m.member_no, m.full_name)]));
  const items = (data ?? []).map((row) => ({
    id: row.id,
    sentence: businessSentence(row as AuditRow, (row.membership_id && byId.get(row.membership_id)) || "a former member"),
    created_at: row.created_at,
    tone: auditTone(row.kind as AuditRow["kind"]),
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/settings`, label: "Settings" }}
        title="Audit log"
        description="Every purchase recorded, confirmed or deleted, and every perk earned or given. It's written automatically and can't be edited."
      />
      <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
        <Eye className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Customers can see their part of this log</span> in their Audits. It keeps
          things fair and builds trust: they know exactly what was counted and given.
        </p>
      </div>
      <AuditList items={items} empty="Nothing yet. When you record purchases or give perks, they'll show here." />
    </div>
  );
}
