import { ChevronRight, History, KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SettingSwitch, TrialDaysForm } from "@/components/admin/controls";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { adminLoginConfigured, allowed, requireAdmin } from "@/lib/admin/session";
import { emailConfigured } from "@/lib/email";
import { getSettings, monoLive } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettings() {
  const [admin, s] = await Promise.all([requireAdmin(), getSettings()]);
  const canEdit = allowed(admin, "manager");
  const live = monoLive();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description={canEdit ? "Changes apply straight away, everywhere." : "You can see these, but only managers can change them."} />

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-display text-lg font-bold">Free trial</h2>
        <SettingSwitch
          name="trialEnabled"
          initial={s.trialEnabled}
          label="Give businesses a free trial"
          help="When off, businesses don't see a trial note and sign-up doesn't mention a trial."
          disabled={!canEdit}
        />
        {s.trialEnabled && <TrialDaysForm initial={s.trialDays} disabled={!canEdit} />}
        <p className="text-xs text-muted">To change one business&apos;s trial, open it from Businesses.</p>
      </Card>

      <Card className="flex flex-col p-5">
        <h2 className="mb-4 font-display text-lg font-bold">Switches</h2>
        <div className="flex flex-col divide-y divide-line">
          <SettingSwitch
            name="signupsOpen"
            initial={s.signupsOpen}
            label="New businesses can sign up"
            help="Turn off to pause new business sign-ups. Existing businesses keep working."
            disabled={!canEdit}
          />
          <SettingSwitch
            name="joinsOpen"
            initial={s.joinsOpen}
            label="Customers can join businesses"
            help="Turn off to pause new memberships everywhere. Existing members keep their perks."
            disabled={!canEdit}
          />
          <SettingSwitch
            name="emailsEnabled"
            initial={s.emailsEnabled}
            label="Send emails"
            help={emailConfigured() ? "Perk alerts, purchase receipts and new-member emails." : "Emails also need RESEND_API_KEY in Vercel, which isn't set yet."}
            disabled={!canEdit}
          />
          <SettingSwitch
            name="testPayments"
            initial={s.testPayments && !live}
            label="Test payments"
            help={live ? "Not available with live Mono keys, so nobody can fake a payment." : "Shows “Send a test payment” on every business's Payments page. Turn off before real businesses sign up."}
            disabled={!canEdit || live}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <KeyRound className="size-5 text-brand-700" aria-hidden /> Admin login
        </h2>
        <p className="text-sm text-muted">
          {adminLoginConfigured() ? (
            <>
              The main admin logs in with the email and password saved in Vercel. To change them, open your project in Vercel →{" "}
              <b>Settings → Environment Variables</b>, edit <b>ADMIN_EMAIL</b> or <b>ADMIN_PASSWORD</b>, then redeploy. Everyone using the
              main login is signed out when either changes.
            </>
          ) : (
            <>
              No main login is set. Add <b>ADMIN_EMAIL</b> and <b>ADMIN_PASSWORD</b> in Vercel → Settings → Environment Variables, then
              redeploy.
            </>
          )}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        <Link href="/admin/team" className="block rounded-3xl">
          <Card className="flex items-center gap-3 p-4">
            <ShieldCheck className="size-5 text-brand-700" aria-hidden />
            <span className="flex-1 font-semibold">Admin team and access</span>
            <ChevronRight className="size-5 text-muted" aria-hidden />
          </Card>
        </Link>
        <Link href="/admin/activity" className="block rounded-3xl">
          <Card className="flex items-center gap-3 p-4">
            <History className="size-5 text-brand-700" aria-hidden />
            <span className="flex-1 font-semibold">Activity log</span>
            <ChevronRight className="size-5 text-muted" aria-hidden />
          </Card>
        </Link>
      </div>
    </div>
  );
}
