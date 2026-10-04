import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteWithConfirm, PauseCustomerButton } from "@/components/admin/controls";
import { Fact } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { allowed, requireAdmin, ROLE_LABELS, type AdminRole } from "@/lib/admin/session";
import { formatDate, formatMoney, formatPhone, memberNo, MONTHS, plural } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Person" };

export default async function AdminCustomer({ params }: PageProps<"/admin/customers/[id]">) {
  const [{ id }, admin] = await Promise.all([params, requireAdmin()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createAdminClient();
  const [{ data: p }, { data: memberships }, { data: owned }, { count: requestCount }, { data: team }, { data: interests }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("memberships").select("id, member_no, joined_at, business:businesses(id, name)").eq("customer_id", id).order("joined_at", { ascending: false }),
    supabase.from("businesses").select("id, name, suspended_at").eq("owner_id", id),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("customer_id", id),
    supabase.from("admin_members").select("role").eq("user_id", id).maybeSingle(),
    supabase.from("customer_interests").select("*").eq("customer_id", id).maybeSingle(),
  ]);
  if (!p) notFound();
  const name = (p.full_name as string | null) ?? (p.email as string | null) ?? formatPhone(p.phone);
  const canSupport = allowed(admin, "support");
  const canManage = allowed(admin, "manager");
  const self = admin.userId === id;
  const birthday = p.birth_month ? `${p.birth_day ? `${p.birth_day} ` : ""}${MONTHS[p.birth_month - 1]}${p.birth_year ? ` ${p.birth_year}` : ""}` : "Not added";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/admin/customers", label: "People" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {name} {p.suspended_at && <Badge tone="red">Paused</Badge>}
            {team && <Badge tone="violet">Admin · {ROLE_LABELS[team.role as AdminRole].label}</Badge>}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-display text-lg font-bold">Details</h2>
          <dl className="divide-y divide-line">
            <Fact label="Phone">{p.phone ? formatPhone(p.phone) : "Not added"}</Fact>
            <Fact label="Name">{p.full_name ?? "Not added"}</Fact>
            <Fact label="Email">
              {p.email ? (
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  {p.email} {p.email_verified_at ? <Badge tone="green">Confirmed</Badge> : <Badge tone="amber">Not confirmed</Badge>}
                </span>
              ) : (
                "Not added"
              )}
            </Fact>
            <Fact label="Birthday">{birthday}</Fact>
            <Fact label="Requests posted">{requestCount ?? 0}</Fact>
            <Fact label="Joined Spendbox">{formatDate(p.created_at, { withYear: true })}</Fact>
          </dl>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="font-display text-lg font-bold">Member of</h2>
            {(memberships ?? []).length === 0 ? (
              <p className="text-sm text-muted">Hasn&apos;t joined any business.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {(memberships ?? []).map((m) => {
                  const biz = m.business as unknown as { id: string; name: string } | null;
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                      {biz ? (
                        <Link href={`/admin/businesses/${biz.id}`} className="font-semibold text-brand-700 underline underline-offset-2">
                          {biz.name}
                        </Link>
                      ) : (
                        <span>Deleted business</span>
                      )}
                      <span className="text-sm text-muted">
                        {memberNo(m.member_no)} · {formatDate(m.joined_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {(owned ?? []).length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold">Owns</h2>
              <ul className="mt-1 divide-y divide-line">
                {(owned ?? []).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/admin/businesses/${b.id}`} className="font-semibold text-brand-700 underline underline-offset-2">
                      {b.name}
                    </Link>
                    {b.suspended_at && <Badge tone="red">Paused</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {interests && <InterestsCard interests={interests as CustomerInterests} />}

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Pause or delete</h2>
          <p className="text-sm text-muted">
            Pausing stops them logging in (anyone already logged in is signed out within the hour). Deleting removes their account,
            memberships and perks for good{(owned ?? []).length ? `, and the ${plural((owned ?? []).length, "business", "businesses")} they own` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <PauseCustomerButton id={id} paused={Boolean(p.suspended_at)} disabled={!canSupport || self} />
          <DeleteWithConfirm
            kind="customer"
            id={id}
            word="DELETE"
            title="Delete account"
            warning={`This deletes ${name}'s account${(owned ?? []).length ? " and every business they own" : ""}. It can't be undone.`}
            disabled={!canManage || self}
          />
        </div>
        {self && <p className="text-sm text-muted">This is you, so these are switched off.</p>}
      </Card>
    </div>
  );
}

interface CustomerInterests {
  requests_count: number;
  reposts_count: number;
  found_count: number;
  reach_outs_count: number;
  categories: Record<string, number>;
  keywords: Record<string, number>;
  areas: Record<string, number>;
  budget_avg: number | null;
  budget_low: number | null;
  budget_high: number | null;
  prefers_whatsapp: number;
  prefers_call: number;
  prefers_email: number;
  first_request_at: string | null;
  last_request_at: string | null;
}

/** The most common keys of a {"key": count} object, most first. */
function top(counts: Record<string, number>, n: number) {
  return Object.entries(counts ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}

/** What this person asks for, built up from every request they've posted (even deleted ones). */
function InterestsCard({ interests: i }: { interests: CustomerInterests }) {
  const chips = (rows: [string, number][]) =>
    rows.length ? (
      <span className="flex flex-wrap justify-end gap-1.5">
        {rows.map(([k, n]) => (
          <Badge key={k}>
            {k} · {n}
          </Badge>
        ))}
      </span>
    ) : (
      "None yet"
    );
  const contact = [
    i.prefers_whatsapp && `WhatsApp ${i.prefers_whatsapp}`,
    i.prefers_call && `Call ${i.prefers_call}`,
    i.prefers_email && `Email ${i.prefers_email}`,
  ].filter(Boolean);
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-bold">Interests</h2>
      <p className="text-sm text-muted">Built from every request they&apos;ve posted. Only Spendbox sees this; businesses never do.</p>
      <dl className="mt-2 divide-y divide-line">
        <Fact label="Requests">
          {plural(i.requests_count, "request")} · {i.reposts_count} reposted · {i.found_count} found a plug
        </Fact>
        <Fact label="Reach-outs received">{i.reach_outs_count}</Fact>
        <Fact label="Asks for">{chips(top(i.categories, 6))}</Fact>
        <Fact label="Words they use">{chips(top(i.keywords, 10))}</Fact>
        <Fact label="Areas">{chips(top(i.areas, 4))}</Fact>
        <Fact label="Budget">
          {i.budget_avg ? `About ${formatMoney(i.budget_avg)} (from ${formatMoney(i.budget_low ?? 0)} to ${formatMoney(i.budget_high ?? 0)})` : "None yet"}
        </Fact>
        <Fact label="Likes to be reached by">{contact.length ? contact.join(" · ") : "None yet"}</Fact>
        <Fact label="Posting since">
          {i.first_request_at ? `${formatDate(i.first_request_at, { withYear: true })} · last ${formatDate(i.last_request_at ?? i.first_request_at)}` : "None yet"}
        </Fact>
      </dl>
    </Card>
  );
}
