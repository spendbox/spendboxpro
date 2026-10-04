import { ChevronRight, History, KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NumberSettingForm, SettingSwitch } from "@/components/admin/controls";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { adminLoginConfigured, allowed, requireAdmin } from "@/lib/admin/session";
import { emailConfigured } from "@/lib/email";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettings() {
  const [admin, s] = await Promise.all([requireAdmin(), getSettings()]);
  const canEdit = allowed(admin, "manager");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description={canEdit ? "Changes apply straight away, everywhere." : "You can see these, but only managers can change them."} />

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-display text-lg font-bold">Prices</h2>
        <p className="-mt-2 text-sm text-muted">What businesses pay each month after their free trial.</p>
        <NumberSettingForm name="priceStarter" initial={s.priceStarter} prefix="₦" label="Starter (requests from own customers)" disabled={!canEdit} />
        <NumberSettingForm name="pricePlus" initial={s.pricePlus} prefix="₦" label="Plus (also partners' customers' requests)" disabled={!canEdit} help="New prices apply to the next payment. Months already paid for don't change." />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-display text-lg font-bold">Free trial</h2>
        <SettingSwitch
          name="trialEnabled"
          initial={s.trialEnabled}
          label="Give new businesses a free trial"
          help="When off, new businesses pay from the start. Businesses already on a trial keep it."
          disabled={!canEdit}
        />
        {s.trialEnabled && (
          <NumberSettingForm name="trialDays" initial={s.trialDays} label="Trial length (days)" help="For businesses that sign up from now on. To give one business more time, open it from Businesses." disabled={!canEdit} />
        )}
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
            help={emailConfigured() ? "Perk alerts, new-member and partner emails, and plan reminders." : "Emails also need RESEND_API_KEY in Vercel, which isn't set yet."}
            disabled={!canEdit}
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
