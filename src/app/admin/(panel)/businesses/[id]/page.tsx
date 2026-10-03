import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteWithConfirm, FreeTimeEditor, ManualPayment, PauseBusinessButton } from "@/components/admin/controls";
import { Fact } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { allowed, requireAdmin } from "@/lib/admin/session";
import { billingState, PLANS, type PlanKey } from "@/lib/billing";
import { daysAgoIso, formatDate, formatMoney, formatPhone, plural } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business } from "@/lib/types";

export const metadata: Metadata = { title: "Business" };

export default async function AdminBusiness({ params }: PageProps<"/admin/businesses/[id]">) {
  const [{ id }, admin, settings] = await Promise.all([params, requireAdmin(), getSettings()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createAdminClient();
  const { data } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as Business;

  const since30 = daysAgoIso(30);
  const [owner, members, perks, banks, sales, sales30, payments] = await Promise.all([
    supabase.from("profiles").select("id, phone, email, full_name").eq("id", b.owner_id).maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("business_id", id),
    supabase.from("perks").select("id", { count: "exact", head: true }).eq("business_id", id).eq("is_active", true),
    supabase.from("bank_connections").select("institution, account_number, status").eq("business_id", id),
    supabase.from("purchases").select("amount").eq("business_id", id).eq("status", "verified"),
    supabase.from("purchases").select("amount").eq("business_id", id).eq("status", "verified").gte("paid_at", since30),
    supabase.from("business_payments").select("id, plan, months, amount, method, note, recorded_by, paid_at").eq("business_id", id).eq("status", "paid").order("paid_at", { ascending: false }).limit(12),
  ]);
  const sum = (rows: { amount: number | string }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const billing = billingState(b);
  const trialEnd = b.trial_ends_at ?? b.created_at;
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
                  {owner.data.full_name ?? owner.data.email ?? formatPhone(owner.data.phone)}
                </Link>
              ) : (
                "Unknown"
              )}
            </Fact>
            <Fact label="Owner's email">{owner.data?.email ?? "Not added"}</Fact>
            <Fact label="Owner's phone">{owner.data?.phone ? formatPhone(owner.data.phone) : "Not added"}</Fact>
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
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-bold">Plan &amp; billing</h2>
          <Badge tone={billing.status === "active" ? "green" : billing.status === "trial" ? "amber" : "red"}>
            {billing.status === "active" ? `${PLANS[billing.plan].name} · paid` : billing.status === "trial" ? "Free time" : billing.status === "due" ? "Payment due" : "Paused for non-payment"}
          </Badge>
        </div>
        <dl className="divide-y divide-line">
          <Fact label="Free time ends">{formatDate(trialEnd, { withYear: true })}</Fact>
          <Fact label="Paid until">{b.paid_until ? `${formatDate(b.paid_until, { withYear: true })} (${PLANS[billing.plan].name})` : "Never paid"}</Fact>
          {billing.status === "due" && <Fact label="Will be paused on">{formatDate(billing.suspendOn, { withYear: true })}</Fact>}
        </dl>
        <FreeTimeEditor id={b.id} currentEnd={trialEnd} disabled={!canSupport} />
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm font-semibold">Record a payment made outside Paystack</p>
          <ManualPayment id={b.id} prices={{ starter: settings.priceStarter, plus: settings.pricePlus }} disabled={!canManage} />
        </div>
        {(payments.data ?? []).length > 0 && (
          <div className="flex flex-col gap-1 border-t border-line pt-4">
            <p className="text-sm font-semibold">Payments</p>
            <ul className="divide-y divide-line">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    {PLANS[p.plan as PlanKey].name} · {plural(p.months, "month")} · {formatDate(p.paid_at, { withYear: true })}
                    <span className="block text-muted">{p.method === "manual" ? `Recorded by ${p.recorded_by ?? "an admin"}${p.note ? ` · ${p.note}` : ""}` : "Paystack"}</span>
                  </span>
                  <span className="font-semibold tabular">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Pause or delete</h2>
          <p className="text-sm text-muted">
            Pausing stops new customers joining and shows the owner a paused notice (for problems, not unpaid plans: those pause themselves). Members keep their perks. Deleting removes the
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
