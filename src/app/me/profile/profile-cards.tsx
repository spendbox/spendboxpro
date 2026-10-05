"use client";

import { Cake, Mail, Phone, UserRound } from "lucide-react";
import { useState, useTransition } from "react";
import { saveBirthday, saveEmail, saveGender, saveName, savePhone } from "@/app/me/account-actions";
import { BirthdayFields, type BirthdayValue } from "@/components/account/birthday-fields";
import { Button } from "@/components/ui/button";
import { EditCard } from "@/components/ui/edit-card";
import { FormMessage, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatPhone, MONTHS } from "@/lib/format";
import { PhoneInput } from "@/components/ui/phone-input";
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

export function BirthdayEditor({ profile, close }: { profile: Profile | null; close: () => void }) {
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

export function EmailEditor({ profile, close, notifyLabel = "Email me about my requests and perks" }: { profile: Profile | null; close: () => void; notifyLabel?: string }) {
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
        <span className="text-ink-2">{notifyLabel}</span>
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

function NameEditor({ profile, close }: { profile: Profile | null; close: () => void }) {
  const [name, setName] = useState(profile?.full_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveName(name);
          if (r.error) setError(r.error);
          else close();
        });
      }}
    >
      <Input aria-label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Ada Obi" />
      <FormMessage>{error}</FormMessage>
      <SaveRow pending={pending} onCancel={close} />
    </form>
  );
}

function PhoneEditor({ profile, close }: { profile: Profile | null; close: () => void }) {
  const known = profile?.phone ?? "";
  const [country, setCountry] = useState(known.startsWith("234") || !known ? "234" : known.slice(0, 3));
  const [phone, setPhone] = useState(known.startsWith("234") ? known.slice(3) : known);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await savePhone(country, phone);
          if (r.error) setError(r.error);
          else close();
        });
      }}
    >
      <PhoneInput id="profile-phone" label="Phone number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} />
      <p className="text-sm text-muted">Leave it empty to remove it. Businesses only get it when you choose WhatsApp or call on a request, or share your details.</p>
      <FormMessage>{error}</FormMessage>
      <SaveRow pending={pending} onCancel={close} />
    </form>
  );
}

/** Name, phone, birthday, email and gender as tap-to-edit cards. */
export function DetailCards({ profile }: { profile: Profile | null }) {
  const birthday = profile?.birth_month
    ? `${profile.birth_day ? `${profile.birth_day} ` : ""}${MONTHS[profile.birth_month - 1]}${profile.birth_year ? ` ${profile.birth_year}` : ""}`
    : "Not added";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <EditCard icon={<UserRound className="size-5" aria-hidden />} label="Name" value={profile?.full_name ?? "Not added"} note="Businesses see your first name on requests">
        {(close) => <NameEditor profile={profile} close={close} />}
      </EditCard>
      <EditCard icon={<Phone className="size-5" aria-hidden />} label="Phone" value={profile?.phone ? formatPhone(profile.phone) : "Not added"} note="For WhatsApp and calls about your requests">
        {(close) => <PhoneEditor profile={profile} close={close} />}
      </EditCard>
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
