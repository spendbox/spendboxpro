import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { PlanPicker } from "@/components/business/plan-picker";
import { Badge } from "@/components/ui/badge";
import { Card, SectionTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { billingState, GRACE_DAYS, PLANS, type PlanKey } from "@/lib/billing";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plan & billing" };

export default async function BillingPage({ params, searchParams }: PageProps<"/dashboard/[bizId]/settings/billing">) {
  const [{ bizId }, sp] = await Promise.all([params, searchParams]);
  const { business } = await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const [settings, { data: payments }, { count: banks }] = await Promise.all([
    getSettings(),
    supabase.from("business_payments").select("id, plan, months, amount, status, method, paid_at, created_at").eq("business_id", bizId).eq("status", "paid").order("paid_at", { ascending: false }).limit(24),
    supabase.from("bank_connections").select("id", { count: "exact", head: true }).eq("business_id", bizId),
  ]);
  const s = billingState(business);
  const until = formatDate(s.accessUntil, { withYear: true });
  const headline = {
    trial: { title: `Free trial · ${plural(Math.max(s.daysLeft, 0), "day")} left`, text: `Your free trial ends on ${until}. Pick a plan any time; your paid months start when the trial ends.`, tone: "amber" as const },
    active: { title: `${PLANS[s.plan].name} plan`, text: `Paid until ${until}.`, tone: "green" as const },
    due: { title: "Payment due", text: `Your ${business.paid_until ? "plan" : "free trial"} ended on ${until}. Pay by ${formatDate(s.suspendOn, { withYear: true })} to keep ${business.name} running.`, tone: "red" as const },
    suspended: { title: "Paused for non-payment", text: "Pay to switch everything back on. You'll need to reconnect your bank afterwards.", tone: "red" as const },
  }[s.status];
  const overLimit = (banks ?? 0) > PLANS.starter.banks;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader back={{ href: `/dashboard/${bizId}/settings`, label: "Settings" }} title="Plan & billing" />
      {sp.paid && <FormMessage tone="success">Thanks! Your payment went through. We&apos;ve emailed you a receipt.</FormMessage>}
      {sp.failed && <FormMessage>That payment didn&apos;t go through. You haven&apos;t been charged. Please try again.</FormMessage>}

      <Card className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl font-bold">{headline.title}</h2>
          <Badge tone={headline.tone}>{s.status === "active" ? "Active" : s.status === "trial" ? "Trial" : s.status === "due" ? "Due" : "Paused"}</Badge>
        </div>
        <p className="text-muted">{headline.text}</p>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionTitle title={s.status === "active" ? "Renew or change plan" : "Choose a plan"} />
        <Card className="p-5">
          <PlanPicker bizId={bizId} prices={{ starter: settings.priceStarter, plus: settings.pricePlus }} current={(overLimit ? "plus" : s.plan) as PlanKey} />
          {overLimit && (
            <p className="mt-3 text-sm text-muted">
              You have {plural(banks ?? 0, "bank account")} connected, so you&apos;ll need Plus (Starter covers {PLANS.starter.banks}).
            </p>
          )}
        </Card>
      </section>

      <Card className="flex items-start gap-3 p-5 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
        <p>
          <span className="font-semibold text-ink">Fair use.</span> We pay our bank partner for every connected account. If a plan isn&apos;t
          paid within {GRACE_DAYS} days after it ends, we pause the business and disconnect its bank accounts. Your money and bank
          aren&apos;t affected, and your customers keep their perks. Pay any time to switch back on.
        </p>
      </Card>

      {(payments ?? []).length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Payments" />
          <Card className="divide-y divide-line">
            {(payments ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">
                    {PLANS[p.plan as PlanKey].name} · {p.months === 1 ? "1 month" : `${p.months} months`}
                  </p>
                  <p className="text-sm text-muted">
                    {formatDate(p.paid_at ?? p.created_at, { withYear: true })}
                    {p.method === "manual" ? " · added by Spendbox" : ""}
                  </p>
                </div>
                <p className="font-semibold tabular">{formatMoney(p.amount)}</p>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
