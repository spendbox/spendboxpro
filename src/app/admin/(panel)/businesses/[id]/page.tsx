import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteWithConfirm, PauseBusinessButton, TrialEditor } from "@/components/admin/controls";
import { Fact } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { allowed, requireAdmin } from "@/lib/admin/session";
import { daysAgoIso, formatDate, formatMoney, formatPhone, isPast, plural } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business } from "@/lib/types";

export const metadata: Metadata = { title: "Business" };

const DAY = 86_400_000;

export default async function AdminBusiness({ params }: PageProps<"/admin/businesses/[id]">) {
  const [{ id }, admin, settings] = await Promise.all([params, requireAdmin(), getSettings()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createAdminClient();
  const { data } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as Business;

  const since30 = daysAgoIso(30);
  const [owner, members, perks, banks, sales, sales30] = await Promise.all([
    supabase.from("profiles").select("id, phone, full_name").eq("id", b.owner_id).maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("business_id", id),
    supabase.from("perks").select("id", { count: "exact", head: true }).eq("business_id", id).eq("is_active", true),
    supabase.from("bank_connections").select("institution, account_number, status").eq("business_id", id),
    supabase.from("purchases").select("amount").eq("business_id", id).eq("status", "verified"),
    supabase.from("purchases").select("amount").eq("business_id", id).eq("status", "verified").gte("paid_at", since30),
  ]);
  const sum = (rows: { amount: number | string }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const trialEnd = b.trial_ends_at ?? new Date(new Date(b.created_at).getTime() + settings.trialDays * DAY).toISOString();
  const canSupport = allowed(admin, "support");
  const canManage = allowed(admin, "manager");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/admin/businesses", label: "Businesses" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {b.name} {b.suspended_at && <Badge tone="red">Paused</Badge>}
          </span>
        }
        description={
          <Link href={`/j/${b.slug}`} className="inline-flex items-center gap-1 font-semibold text-brand-700" target="_blank">
            /j/{b.slug} <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-display text-lg font-bold">Details</h2>
          <dl className="divide-y divide-line">
            <Fact label="Owner">
              {owner.data ? (
                <Link href={`/admin/customers/${b.owner_id}`} className="text-brand-700 underline underline-offset-2">
                  {owner.data.full_name ?? formatPhone(owner.data.phone)}
                </Link>
              ) : (
                "Unknown"
              )}
            </Fact>
            <Fact label="Owner's phone">{formatPhone(owner.data?.phone)}</Fact>
            <Fact label="Signed up">{formatDate(b.created_at, { withYear: true })}</Fact>
            <Fact label="What they sell">{(b.categories?.length ? b.categories : [b.category]).filter(Boolean).join(", ") || "Not set"}</Fact>
            <Fact label="Area">{b.location || "Not set"}</Fact>
            <Fact label="Email">{b.email || "Not set"}</Fact>
            <Fact label="WhatsApp">{b.whatsapp ? formatPhone(b.whatsapp) : "Not set"}</Fact>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-display text-lg font-bold">Activity</h2>
          <dl className="divide-y divide-line">
            <Fact label="Members">{members.count ?? 0}</Fact>
            <Fact label="Active perks">{perks.count ?? 0}</Fact>
            <Fact label="Sales, last 30 days">{formatMoney(sum(sales30.data), b.currency)}</Fact>
            <Fact label="Sales, all time">{formatMoney(sum(sales.data), b.currency)}</Fact>
            <Fact label="Bank">
              {(banks.data ?? []).length
                ? (banks.data ?? []).map((c) => `${c.institution ?? "Bank"} •••${(c.account_number ?? "").slice(-4)}${c.status !== "active" ? ` (${c.status})` : ""}`).join(", ")
                : "Not connected"}
            </Fact>
          </dl>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Free trial</h2>
          <p className="text-sm text-muted">
            {!settings.trialEnabled
              ? "Free trials are switched off in Settings, so this business doesn't see a trial note."
              : isPast(trialEnd)
                ? `Ended on ${formatDate(trialEnd, { withYear: true })}.`
                : `Ends on ${formatDate(trialEnd, { withYear: true })}.`}{" "}
            {b.trial_ends_at ? "This date was set by an admin." : `That's the usual ${plural(settings.trialDays, "day")} from sign-up.`}
          </p>
        </div>
        <TrialEditor id={b.id} currentEnd={trialEnd} custom={Boolean(b.trial_ends_at)} disabled={!canSupport} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Pause or delete</h2>
          <p className="text-sm text-muted">
            Pausing stops new customers joining and shows the owner a paused notice. Members keep their perks. Deleting removes the
            business, its members, perks and payments for good.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <PauseBusinessButton id={b.id} paused={Boolean(b.suspended_at)} disabled={!canSupport} />
          <DeleteWithConfirm
            kind="business"
            id={b.id}
            word={b.name}
            title="Delete business"
            warning={`This deletes ${b.name}, its ${plural(members.count ?? 0, "member")}, perks and payment history. It can't be undone.`}
            disabled={!canManage}
          />
        </div>
        {!canSupport && <p className="text-sm text-muted">You have view-only access.</p>}
      </Card>
    </div>
  );
}
