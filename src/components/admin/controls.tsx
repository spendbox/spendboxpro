"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  addTeamMember,
  deleteBusinessAsAdmin,
  deleteCustomerAsAdmin,
  removeTeamMember,
  setBusinessPaused,
  setBusinessTrial,
  setCustomerPaused,
  setSwitch,
  setTeamRole,
  setTrialDays,
  type AdminResult,
} from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PhoneInput } from "@/components/ui/phone-input";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/lib/settings";

type Variant = Parameters<typeof Button>[0]["variant"];

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<AdminResult | void>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r?.error) setError(r.error);
      else after?.();
    });
  return { pending, error, run };
}

/** A button that runs one admin action, with an optional "are you sure?". */
export function AdminButton({
  children,
  action,
  confirmText,
  variant = "secondary",
  disabled,
}: {
  children: ReactNode;
  action: () => Promise<AdminResult | void>;
  confirmText?: string;
  variant?: Variant;
  disabled?: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={variant}
        loading={pending}
        disabled={disabled}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          run(action);
        }}
      >
        {children}
      </Button>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}

export function PauseBusinessButton({ id, paused, disabled }: { id: string; paused: boolean; disabled?: boolean }) {
  return (
    <AdminButton
      variant={paused ? "primary" : "secondary"}
      disabled={disabled}
      confirmText={paused ? undefined : "Pause this business? New customers won't be able to join, and the owner sees a paused notice."}
      action={() => setBusinessPaused(id, !paused)}
    >
      {paused ? "Unpause business" : "Pause business"}
    </AdminButton>
  );
}

export function PauseCustomerButton({ id, paused, disabled }: { id: string; paused: boolean; disabled?: boolean }) {
  return (
    <AdminButton
      variant={paused ? "primary" : "secondary"}
      disabled={disabled}
      confirmText={paused ? undefined : "Pause this account? They won't be able to log in until you unpause them."}
      action={() => setCustomerPaused(id, !paused)}
    >
      {paused ? "Unpause account" : "Pause account"}
    </AdminButton>
  );
}

/** Change one business's free-trial end. */
export function TrialEditor({ id, currentEnd, custom, disabled }: { id: string; currentEnd: string; custom: boolean; disabled?: boolean }) {
  const { pending, error, run } = useAction();
  const [date, setDate] = useState(currentEnd.slice(0, 10));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="soft" disabled={disabled || pending} onClick={() => run(() => setBusinessTrial(id, { kind: "extend", days: 30, currentEnd }))}>
          +30 days
        </Button>
        <Button variant="soft" disabled={disabled || pending} onClick={() => run(() => setBusinessTrial(id, { kind: "extend", days: 90, currentEnd }))}>
          +90 days
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || pending}
          onClick={() => confirm("End this business's free trial now?") && run(() => setBusinessTrial(id, { kind: "end" }))}
        >
          End now
        </Button>
        <Button variant="secondary" disabled={disabled || pending || !custom} onClick={() => run(() => setBusinessTrial(id, { kind: "default" }))}>
          Usual length
        </Button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setBusinessTrial(id, { kind: "date", date }));
        }}
      >
        <Input type="date" aria-label="Trial end date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} className="h-11 flex-1" />
        <Button type="submit" disabled={disabled} loading={pending}>
          Set date
        </Button>
      </form>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}

/** "Type the name to delete" in a pop-up. */
export function DeleteWithConfirm({
  kind,
  id,
  word,
  title,
  warning,
  disabled,
}: {
  kind: "business" | "customer";
  id: string;
  word: string;
  title: string;
  warning: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { pending, error, run } = useAction();
  return (
    <>
      <Button variant="danger" disabled={disabled} onClick={() => setOpen(true)}>
        {title}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={warning}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (kind === "business" ? deleteBusinessAsAdmin(id, typed) : deleteCustomerAsAdmin(id, typed)));
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            <span>
              Type <b>{word}</b> to confirm
            </span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label={`Type ${word} to confirm`} />
          </label>
          <FormMessage>{error}</FormMessage>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Delete for good
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

type SwitchName = Exclude<keyof AppSettings, "trialDays">;

/** One app-wide switch with its label and explanation. */
export function SettingSwitch({ name, initial, label, help, disabled }: { name: SwitchName; initial: boolean; label: string; help: ReactNode; disabled?: boolean }) {
  const [on, setOn] = useState(initial);
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-muted">{help}</p>
        </div>
        <Switch
          checked={on}
          label={label}
          disabled={disabled || pending}
          onChange={(next) => {
            setOn(next);
            run(
              async () => {
                const r = await setSwitch(name, next);
                if (r.error) setOn(!next);
                return r;
              },
            );
          }}
        />
      </div>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}

export function TrialDaysForm({ initial, disabled }: { initial: number; disabled?: boolean }) {
  const [days, setDays] = useState(String(initial));
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(() => setTrialDays(Number(days)), () => setSaved(true));
      }}
    >
      <label htmlFor="trial-days" className="text-sm font-semibold">
        Trial length (days)
      </label>
      <div className="flex gap-2">
        <Input id="trial-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} disabled={disabled} className="h-11 w-28" />
        <Button type="submit" disabled={disabled} loading={pending}>
          Save
        </Button>
      </div>
      <p className="text-xs text-muted">Applies to every business without its own trial date, including ones already signed up.</p>
      {saved && <FormMessage tone="success">Saved.</FormMessage>}
      <FormMessage>{error}</FormMessage>
    </form>
  );
}

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "support", label: "Support" },
  { value: "manager", label: "Manager" },
] as const;

export function AddTeamMember({ defaultCountry }: { defaultCountry: string }) {
  const [country, setCountry] = useState(defaultCountry);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]["value"]>("viewer");
  const [added, setAdded] = useState(false);
  const { pending, error, run } = useAction();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setAdded(false);
        run(() => addTeamMember(country, phone, role), () => {
          setPhone("");
          setAdded(true);
        });
      }}
    >
      <PhoneInput id="team-phone" label="Their Spendbox phone number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} placeholder="803 000 0000" />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Access level">
        {ROLE_OPTIONS.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={role === r.value}
            onClick={() => setRole(r.value)}
            className="h-11 rounded-xl text-sm font-semibold ring-1 ring-line-strong aria-checked:bg-brand-600 aria-checked:text-white aria-checked:ring-brand-600"
          >
            {r.label}
          </button>
        ))}
      </div>
      {added && <FormMessage tone="success">Added. They can open /admin after logging in to Spendbox.</FormMessage>}
      <FormMessage>{error}</FormMessage>
      <Button type="submit" loading={pending} className="self-start">
        Add to team
      </Button>
    </form>
  );
}

export function TeamRow({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Access level"
          defaultValue={role}
          disabled={disabled || pending}
          onChange={(e) => run(() => setTeamRole(userId, e.target.value as "viewer"))}
          className="h-10 rounded-xl border border-line-strong bg-white px-3 text-sm font-semibold"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || pending}
          onClick={() => confirm("Remove their admin access?") && run(() => removeTeamMember(userId))}
        >
          Remove
        </Button>
      </div>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}
