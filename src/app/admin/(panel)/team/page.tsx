import type { Metadata } from "next";
import Link from "next/link";
import { AddTeamMember, TeamRow } from "@/components/admin/controls";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { allowed, requireAdmin, ROLE_LABELS, type AdminRole } from "@/lib/admin/session";
import { formatDate, formatPhone } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Team" };

export default async function AdminTeam() {
  const admin = await requireAdmin();
  const owner = allowed(admin, "owner");
  const supabase = createAdminClient();
  const { data: members } = await supabase.from("admin_members").select("user_id, role, created_at, added_by").order("created_at");
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, phone, email, full_name").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={{ href: "/admin/settings", label: "Settings" }} title="Admin team" description="People who can open /admin with their usual Spendbox login." />

      <Card className="p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Access levels</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(ROLE_LABELS) as AdminRole[]).map((r) => (
            <div key={r} className="rounded-2xl bg-canvas p-3 ring-1 ring-line">
              <dt className="font-semibold">{ROLE_LABELS[r].label}</dt>
              <dd className="text-sm text-muted">{ROLE_LABELS[r].can}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="flex flex-col p-5">
        <h2 className="mb-2 font-display text-lg font-bold">Team</h2>
        {(members ?? []).length === 0 && <p className="text-sm text-muted">Just you for now.</p>}
        <ul className="divide-y divide-line">
          {(members ?? []).map((m) => {
            const p = byId.get(m.user_id);
            return (
              <li key={m.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/admin/customers/${m.user_id}`} className="font-semibold underline-offset-2 hover:underline">
                    {p?.full_name ?? p?.email ?? formatPhone(p?.phone)}
                  </Link>
                  <p className="text-sm text-muted">
                    {p?.full_name ? `${p.email ?? formatPhone(p.phone)} · ` : ""}added {formatDate(m.created_at)}
                  </p>
                </div>
                {owner ? <TeamRow userId={m.user_id} role={m.role} /> : <p className="text-sm font-semibold">{ROLE_LABELS[m.role as AdminRole].label}</p>}
              </li>
            );
          })}
        </ul>
      </Card>

      {owner ? (
        <Card className="p-5">
          <h2 className="mb-1 font-display text-lg font-bold">Add someone</h2>
          <p className="mb-4 text-sm text-muted">They need a Spendbox account first. Use the email they log in with. After you add them, they log in to Spendbox as usual and open /admin.</p>
          <AddTeamMember />
        </Card>
      ) : (
        <p className="text-sm text-muted">Only the main admin can change the team.</p>
      )}
    </div>
  );
}
