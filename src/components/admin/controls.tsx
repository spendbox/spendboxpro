"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  addTeamMember,
  deleteBusinessAsAdmin,
  deleteCustomerAsAdmin,
  removeTeamMember,
  setBusinessPaused,
  recordManualPayment,
  setBusinessTrial,
  setCustomerPaused,
  setSwitch,
  setTeamRole,
  setNumberSetting,
  type AdminResult,
} from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { PLANS, type PlanKey } from "@/lib/billing";
import { formatMoney } from "@/lib/format";
import type { NumberName, SwitchName } from "@/lib/settings";

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

const FREE_TIME = [
  { days: 7, label: "7 days" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

/** Give one business free time with a tap, or set exactly when it ends. */
export function FreeTimeEditor({ id, currentEnd, disabled }: { id: string; currentEnd: string; disabled?: boolean }) {
  const { pending, error, run } = useAction();
  const [date, setDate] = useState(currentEnd.slice(0, 10));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">Give free time</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {FREE_TIME.map((f) => (
          <button
            key={f.days}
            type="button"
            disabled={disabled || pending}
            onClick={() => run(() => setBusinessTrial(id, { kind: "give", days: f.days, label: f.label }))}
            className="flex h-16 flex-col items-center justify-center rounded-2xl bg-brand-50 text-brand-800 ring-1 ring-brand-100 transition hover:bg-brand-100 disabled:opacity-50"
          >
            <span className="text-base font-bold">+{f.label}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Added on top of any time they have left. A business paused for not paying is switched back on.</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setBusinessTrial(id, { kind: "date", date }));
        }}
      >
        <Input type="date" aria-label="Free time ends on" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} className="h-11 min-w-0 flex-1" />
        <Button type="submit" variant="secondary" disabled={disabled} loading={pending}>
          Set end date
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || pending}
          onClick={() => confirm("End this business's free time now? If it hasn't paid, payment becomes due.") && run(() => setBusinessTrial(id, { kind: "end" }))}
        >
          End free time
        </Button>
      </form>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}

/** Record a payment made outside Paystack. */
export function ManualPayment({ id, prices, disabled }: { id: string; prices: Record<PlanKey, number>; disabled?: boolean }) {
  const [plan, setPlan] = useState<PlanKey>("starter");
  const [months, setMonths] = useState("1");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const { pending, error, run } = useAction();
  const n = Math.max(1, Math.min(24, Number(months) || 1));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(false);
        run(() => recordManualPayment(id, plan, n, note), () => {
          setDone(true);
          setNote("");
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Plan paid for">
        {(Object.keys(PLANS) as PlanKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={plan === key}
            onClick={() => setPlan(key)}
            className="h-11 rounded-xl text-sm font-semibold ring-1 ring-line-strong aria-checked:bg-brand-600 aria-checked:text-white aria-checked:ring-brand-600"
          >
            {PLANS[key].name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="manual-months" className="text-sm font-semibold">
          Months
        </label>
        <Input id="manual-months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} className="h-11 w-20" disabled={disabled} />
        <span className="text-sm text-muted">= {formatMoney(prices[plan] * n)}</span>
      </div>
      <Input aria-label="Note" placeholder="Note, e.g. bank transfer on 3 Oct" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} disabled={disabled} />
      {done && <FormMessage tone="success">Recorded. Their plan has been extended.</FormMessage>}
      <FormMessage>{error}</FormMessage>
      <Button type="submit" variant="secondary" loading={pending} disabled={disabled} className="self-start">
        Record payment
      </Button>
    </form>
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

/** One number setting (trial length, a price) with a Save button. */
export function NumberSettingForm({
  name,
  initial,
  label,
  help,
  prefix,
  disabled,
}: {
  name: NumberName;
  initial: number;
  label: string;
  help?: ReactNode;
  prefix?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(String(initial));
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  const id = `setting-${name}`;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(() => setNumberSetting(name, Number(value)), () => setSaved(true));
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {prefix && <span className="font-semibold text-muted">{prefix}</span>}
        <Input id={id} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} disabled={disabled} className="h-11 w-32" />
        <Button type="submit" disabled={disabled} loading={pending}>
          Save
        </Button>
      </div>
      {help && <p className="text-xs text-muted">{help}</p>}
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

export function AddTeamMember() {
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]["value"]>("viewer");
  const [added, setAdded] = useState(false);
  const { pending, error, run } = useAction();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setAdded(false);
        run(() => addTeamMember(contact, role), () => {
          setContact("");
          setAdded(true);
        });
      }}
    >
      <label className="flex flex-col gap-2 text-sm font-semibold">
        Their Spendbox email (or phone number)
        <Input id="team-contact" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" placeholder="name@example.com" />
      </label>
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
      <Button type="submit" loading={pending} className="self-start" disabled={!contact.trim()}>
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
