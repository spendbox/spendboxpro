import { ChevronRight, Download, Gift, Handshake, History, Landmark, LogOut, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { QrCode } from "@/components/qr-code";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CopyButton } from "@/components/ui/share-actions";
import { signOut } from "@/lib/actions/auth";
import { requireOwnedBusiness } from "@/lib/auth";
import { getPerks } from "@/lib/business";
import { siteUrl } from "@/lib/env";
import { formatWhen, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DeleteBusiness } from "./delete-business";
import { BusinessDetailCards } from "./detail-cards";
import { LogoUpload } from "./logo-upload";

export const metadata: Metadata = { title: "Settings" };

function LinkCard({ href, icon: Icon, title, note, badge }: { href: string; icon: LucideIcon; title: string; note: string; badge?: number }) {
  return (
    <Link href={href} className="flex items-center gap-3.5 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line transition hover:ring-brand-300 sm:p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold text-ink">
          {title}
          {badge ? <span className="rounded-full bg-accent-600 px-2 text-xs leading-5 font-bold text-white">{badge}</span> : null}
        </span>
        <span className="block text-sm text-muted">{note}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

export default async function SettingsPage({ params }: PageProps<"/dashboard/[bizId]/settings">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const [perks, { data: connections }, { data: requests }] = await Promise.all([
    getPerks(bizId),
    supabase.from("bank_connections").select("institution, status, last_synced_at").eq("business_id", bizId),
    supabase.rpc("partner_requests_waiting", { p_business_id: bizId }),
  ]);
  const joinUrl = `${siteUrl()}/j/${business.slug}`;
  const base = `/dashboard/${bizId}`;
  const banks = connections ?? [];
  const bankNote = banks.length
    ? banks.some((c) => c.status !== "active")
      ? "Needs your attention"
      : `${banks.map((c) => c.institution ?? "Bank").join(", ")} · checked ${formatWhen(banks[0].last_synced_at ?? new Date().toISOString())}`
    : "Not connected — connect it so transfers count by themselves";
  const activePerks = perks.filter((p) => p.is_active).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title="Settings" description="Tap a card to change it." />

      <section className="flex flex-col gap-3">
        <SectionTitle title="Your business" />
        <Card className="p-5">
          <LogoUpload bizId={bizId} name={business.name} color={business.brand_color} logoUrl={business.logo_url} />
        </Card>
        <BusinessDetailCards business={business} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Manage" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LinkCard href={`${base}/settings/bank`} icon={Landmark} title="Your bank" note={bankNote} />
          <LinkCard href={`${base}/perks`} icon={Gift} title="Perks" note={perks.length ? `${plural(activePerks, "perk")} on` : "Add your first perk"} />
          <LinkCard
            href={`${base}/partners`}
            icon={Handshake}
            title="Partners"
            note={business.partners_enabled ? "Cross-promotion is on" : "Show your perks to other businesses' customers"}
            badge={Number(requests ?? 0)}
          />
          <LinkCard href={`${base}/audit`} icon={History} title="Audit log" note="Everything recorded, changed or given. Customers can see their part." />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Join link" />
        <Card className="flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
          <QrCode value={joinUrl} label={`QR code for ${joinUrl}`} className="w-36 shrink-0" />
          <div className="flex min-w-0 flex-col gap-3">
            <p className="font-semibold break-all">{joinUrl.replace(/^https?:\/\//, "")}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={joinUrl} />
              <a href={`${base}/qr`} className={buttonClass({ variant: "secondary" })}>
                <Download className="size-4" aria-hidden /> Download QR
              </a>
            </div>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Account" />
        <Card className="p-5">
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              <LogOut className="size-4" aria-hidden /> Log out
            </Button>
          </form>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="danger-zone">
        <h2 id="danger-zone" className="flex items-center gap-2 font-display text-lg font-bold text-red-800">
          <TriangleAlert className="size-5" aria-hidden /> Danger zone
        </h2>
        <div className="flex flex-col gap-3 rounded-3xl border-2 border-red-200 bg-red-50/50 p-5">
          <div>
            <p className="font-semibold text-ink">Delete this business</p>
            <p className="text-sm text-muted">Removes the business, its perks, customers and payments, for good.</p>
          </div>
          <DeleteBusiness bizId={bizId} name={business.name} />
        </div>
      </section>
    </div>
  );
}
