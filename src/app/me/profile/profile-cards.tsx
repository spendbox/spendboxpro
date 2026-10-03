"use client";

import { Cake, Landmark, Mail, Plus, Trash, UserRound, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { removeMyBankAccount, saveBirthday, saveEmail, saveGender } from "@/app/me/account-actions";
import { forgetPayer } from "@/app/me/actions";
import { BankAccountForm } from "@/components/account/bank-account-form";
import { BirthdayFields, type BirthdayValue } from "@/components/account/birthday-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EditCard } from "@/components/ui/edit-card";
import { FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { MONTHS } from "@/lib/format";
import type { Profile } from "@/lib/types";

function SaveRow({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" loading={pending}>
        Save
      </Button>
    </div>
  );
}

function BirthdayEditor({ profile, close }: { profile: Profile | null; close: () => void }) {
  const [value, setValue] = useState<BirthdayValue>({
    day: profile?.birth_day ? String(profile.birth_day) : null,
    month: profile?.birth_month ? String(profile.birth_month) : null,
    year: profile?.birth_year ? String(profile.birth_year) : null,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBirthday(value.day ?? "", value.month ?? "", value.year ?? "");
          if (r.error) setError(r.error);
          else close();
        });
      }}
    >
      <BirthdayFields value={value} onChange={setValue} />
      <FormMessage>{error}</FormMessage>
      <SaveRow pending={pending} onCancel={close} />
    </form>
  );
}

function EmailEditor({ profile, close }: { profile: Profile | null; close: () => void }) {
  const [email, setEmail] = useState(profile?.email ?? "");
  const [notify, setNotify] = useState(profile?.email_notifications ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveEmail(email, notify);
          if (r.error) setError(r.error);
          else close();
        });
      }}
    >
      <Input aria-label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-5 accent-brand-600" />
        <span className="text-ink-2">Email me about my perks and purchases</span>
      </label>
      <FormMessage>{error}</FormMessage>
      <SaveRow pending={pending} onCancel={close} />
    </form>
  );
}

const GENDERS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "", label: "Prefer not to say" },
];

function GenderEditor({ profile, close }: { profile: Profile | null; close: () => void }) {
  const [value, setValue] = useState(profile?.gender ?? "");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await saveGender(value);
          close();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Gender">
        {GENDERS.map((g) => (
          <button
            key={g.label}
            type="button"
            role="radio"
            aria-checked={value === g.value}
            onClick={() => setValue(g.value)}
            className={cn(
              "h-12 rounded-xl text-sm font-semibold ring-1 transition",
              value === g.value ? "bg-brand-600 text-white ring-brand-600" : "ring-line-strong hover:bg-canvas",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <SaveRow pending={pending} onCancel={close} />
    </form>
  );
}

/** Name, birthday, email and gender as tap-to-edit cards. */
export function DetailCards({ profile, hasBank }: { profile: Profile | null; hasBank: boolean }) {
  const birthday = profile?.birth_month
    ? `${profile.birth_day ? `${profile.birth_day} ` : ""}${MONTHS[profile.birth_month - 1]}${profile.birth_year ? ` ${profile.birth_year}` : ""}`
    : "Not added";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <EditCard
        readOnly
        icon={<UserRound className="size-5" aria-hidden />}
        label="Name"
        value={profile?.full_name ?? "Comes from your bank"}
        note={profile?.full_name ? "Confirmed by your bank, so it can't be edited" : hasBank ? "We'll fill this in soon" : "Add a bank account below and we'll fill this in"}
      />
      <EditCard icon={<Cake className="size-5" aria-hidden />} label="Birthday" value={birthday} note="For birthday treats" description="Businesses only see it if you share your details with them.">
        {(close) => <BirthdayEditor profile={profile} close={close} />}
      </EditCard>
      <EditCard
        icon={<Mail className="size-5" aria-hidden />}
        label="Email"
        value={profile?.email ?? "Not added"}
        note={
          profile?.email
            ? !profile.email_verified_at
              ? "Not confirmed yet: tap the link we emailed you"
              : profile.email_notifications
                ? "Confirmed · perk emails on"
                : "Confirmed · perk emails off"
            : "Add one to log in with it and get perk alerts"
        }
        description="You log in with this email. Businesses only see it if you share your details with them."
      >
        {(close) => <EmailEditor profile={profile} close={close} />}
      </EditCard>
      <EditCard icon={<UserRound className="size-5" aria-hidden />} label="Gender" value={GENDERS.find((g) => g.value === (profile?.gender ?? ""))?.label ?? "Prefer not to say"}>
        {(close) => <GenderEditor profile={profile} close={close} />}
      </EditCard>
    </div>
  );
}

export interface MyAccountRow {
  id: string;
  sender_name: string | null;
  sender_account: string | null;
  institution: string | null;
  verified: boolean;
  /** Added by the customer (vs recognised from a payment). */
  mine: boolean;
}

function titleCase(name: string) {
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The bank accounts the customer pays from, plus ones recognised from payments. */
export function BankAccountsCard({ accounts }: { accounts: MyAccountRow[] }) {
  const [shown, remove] = useOptimistic(accounts, (list, id: string) => list.filter((a) => a.id !== id));
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MyAccountRow | null>(null);
  const confirmName = confirming?.sender_name ? titleCase(confirming.sender_name) : "this account";

  return (
    <Card className="flex flex-col gap-1 p-4 sm:p-5">
      {shown.length === 0 && (
        <p className="py-2 text-sm text-muted">No accounts yet. Add the one you usually pay from, and your transfers count by themselves.</p>
      )}
      <ul className="divide-y divide-line">
        {shown.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <Landmark className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold break-words">{a.sender_name ? titleCase(a.sender_name) : "Bank account"}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                {[a.institution, a.sender_account ? `•••${a.sender_account.slice(-4)}` : null].filter(Boolean).join(" ")}
                {a.mine ? (
                  a.verified && <Badge tone="green">Confirmed by bank</Badge>
                ) : (
                  <Badge>Recognised from a payment</Badge>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted"
              aria-label={a.mine ? `Remove ${a.sender_name ?? "this account"}` : `This isn't me: stop counting payments from ${a.sender_name ?? "this account"}`}
              onClick={() => setConfirming(a)}
            >
              {a.mine ? <Trash className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
              {a.mine ? "Remove" : "Not me"}
            </Button>
          </li>
        ))}
      </ul>
      {added && <FormMessage tone="success">Added. Transfers from {added}&apos;s account now count by themselves.</FormMessage>}
      <Button variant="soft" className="mt-2 self-start" onClick={() => setAdding(true)}>
        <Plus className="size-4" aria-hidden /> Add {shown.some((a) => a.mine) ? "another" : "an"} account
      </Button>
      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming?.mine ? "Remove this account?" : "Not your account?"}
        description={
          confirming?.mine
            ? `Transfers from ${confirmName} won't count for you by themselves any more. You can add it again later.`
            : `We'll stop counting payments from ${confirmName} for you, and remove it from your list.`
        }
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const a = confirming;
              setConfirming(null);
              if (!a) return;
              start(async () => {
                remove(a.id);
                await (a.mine ? removeMyBankAccount(a.id) : forgetPayer(a.id));
              });
            }}
          >
            {confirming?.mine ? "Remove account" : "Yes, remove it"}
          </Button>
        </div>
      </Modal>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an account you pay from"
        description="We check the name with your bank. Transfers from it count for you at every business you've joined."
      >
        {adding && (
          <BankAccountForm
            submitLabel="Add this account"
            onAdded={(name) => {
              setAdded(name);
              setAdding(false);
            }}
          />
        )}
      </Modal>
    </Card>
  );
}
