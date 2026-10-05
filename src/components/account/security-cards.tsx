"use client";

import { Eye, EyeOff, KeyRound, LogOut, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { EmailEditor } from "@/app/me/profile/profile-cards";
import { Button } from "@/components/ui/button";
import { EditCard } from "@/components/ui/edit-card";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { changePassword, signOutEverywhere } from "@/lib/actions/security";
import { MIN_PASSWORD } from "@/lib/password";
import type { Profile } from "@/lib/types";

function PasswordBox({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

function PasswordEditor({ close, onSaved }: { close: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await changePassword(current, next);
          if (r.error) return setError(r.error);
          onSaved();
          close();
        });
      }}
    >
      <Field label="Current password" htmlFor="current-password">
        <PasswordBox id="current-password" value={current} onChange={setCurrent} autoComplete="current-password" />
      </Field>
      <Field label="New password" htmlFor="new-password" hint={`At least ${MIN_PASSWORD} characters.`}>
        <PasswordBox id="new-password" value={next} onChange={setNext} autoComplete="new-password" />
      </Field>
      <FormMessage>{error}</FormMessage>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={!current || next.length < MIN_PASSWORD}>
          Change password
        </Button>
      </div>
    </form>
  );
}

/**
 * Login & security: the login email (optional here, as Profile shows it with
 * the other details), the password, and logging out on every device.
 */
export function SecurityCards({ profile, showEmail = true, notifyLabel }: { profile: Profile | null; showEmail?: boolean; notifyLabel?: string }) {
  const [changed, setChanged] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showEmail && (
          <EditCard
            icon={<Mail className="size-5" aria-hidden />}
            label="Login email"
            value={profile?.email ?? "Not added"}
            note={profile?.email ? (profile.email_verified_at ? (profile.email_notifications ? "Confirmed · emails on" : "Confirmed · emails off") : "Not confirmed yet: tap the link we emailed you") : "Add one to log in with it"}
            description="You log in with this email, and we send your Spendbox emails to it."
          >
            {(close) => <EmailEditor profile={profile} close={close} notifyLabel={notifyLabel} />}
          </EditCard>
        )}
        <EditCard
          icon={<KeyRound className="size-5" aria-hidden />}
          label="Password"
          value="••••••••"
          note={changed ? "Changed. Other devices were logged out." : "Tap to change it"}
          title="Change your password"
          description="Type your current password, then the new one. Other phones and computers will be logged out."
        >
          {(close) => <PasswordEditor close={close} onSaved={() => setChanged(true)} />}
        </EditCard>
      </div>
      <form action={signOutEverywhere} className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-ink">Log out on all devices</p>
          <p className="text-sm text-muted">If you used Spendbox on someone else&apos;s phone or a shared computer.</p>
        </div>
        <SubmitButton variant="secondary">
          <LogOut className="size-4" aria-hidden /> Log out everywhere
        </SubmitButton>
      </form>
    </div>
  );
}
