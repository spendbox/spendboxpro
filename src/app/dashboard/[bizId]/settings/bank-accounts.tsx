"use client";

import { BadgeCheck, Landmark, LoaderCircle, Plus, Trash } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BankAccount } from "@/lib/types";
import { addBankAccount, lookupAccountName, removeBankAccount, type FormState } from "../actions";

/** Used when Paystack isn't connected: pick a bank and type the name yourself. */
const FALLBACK_BANKS = [
  "Access Bank", "Carbon", "Ecobank", "FairMoney", "FCMB", "Fidelity Bank", "First Bank", "Globus Bank",
  "GTBank", "Heritage Bank", "Jaiz Bank", "Keystone Bank", "Kuda", "Moniepoint", "OPay", "PalmPay",
  "Polaris Bank", "Providus Bank", "Stanbic IBTC", "Standard Chartered", "Sterling Bank", "Titan Trust Bank",
  "UBA", "Union Bank", "Unity Bank", "VFD Microfinance Bank", "Wema Bank", "Zenith Bank",
];

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; name: string }
  | { state: "error"; message: string };

export function BankAccounts({
  bizId,
  accounts,
  banks,
}: {
  bizId: string;
  accounts: BankAccount[];
  /** Banks from Paystack (with codes). Empty when Paystack isn't set up. */
  banks: { name: string; code: string }[];
}) {
  const withLookup = banks.length > 0;
  const formRef = useRef<HTMLFormElement>(null);
  const [adding, setAdding] = useState(accounts.length === 0);
  const [bankCode, setBankCode] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [removing, startRemove] = useTransition();
  const lookupId = useRef(0);

  const [state, action] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addBankAccount(bizId, prev, formData);
    if (result.ok) {
      formRef.current?.reset();
      setBankCode(null);
      setBankName(null);
      setNumber("");
      setLookup({ state: "idle" });
      setAdding(false);
    }
    return result;
  }, {});

  // Look up the account name as soon as a bank and a 10-digit number are in.
  useEffect(() => {
    if (!withLookup || !bankCode || number.length !== 10) return;
    const id = ++lookupId.current;
    const timer = setTimeout(async () => {
      setLookup({ state: "loading" });
      const result = await lookupAccountName(bizId, bankCode, number);
      if (id !== lookupId.current) return;
      setLookup(result.ok ? { state: "found", name: result.accountName } : { state: "error", message: result.error });
    }, 250);
    return () => clearTimeout(timer);
  }, [withLookup, bankCode, number, bizId]);

  const bankOptions = withLookup
    ? banks.map((b) => ({ value: b.code, label: b.name }))
    : FALLBACK_BANKS.map((name) => ({ value: name, label: name }));

  return (
    <div className="flex flex-col gap-4">
      {accounts.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Landmark className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.account_name}</p>
                <p className="text-sm text-muted">
                  {a.bank_name} · {a.account_number}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={removing}
                className="text-red-700"
                aria-label={`Remove ${a.bank_name} ${a.account_number}`}
                onClick={() => startRemove(() => removeBankAccount(bizId, a.id))}
              >
                {removing ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash className="size-4" aria-hidden />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}

      {adding ? (
        <form ref={formRef} action={action} className="flex flex-col gap-4 rounded-2xl bg-canvas p-4">
          <input type="hidden" name="bank_name" value={bankName ?? ""} />
          {withLookup && <input type="hidden" name="bank_code" value={bankCode ?? ""} />}
          <Field label="Bank" htmlFor="bank-name">
            <Combobox
              id="bank-name"
              options={bankOptions}
              value={withLookup ? bankCode : bankName}
              onChange={(value) => {
                const option = bankOptions.find((o) => o.value === value)!;
                setBankName(option.label);
                setBankCode(withLookup ? value : null);
                setLookup({ state: "idle" });
              }}
              placeholder="Choose your bank"
              searchPlaceholder="Search banks, e.g. Moniepoint"
              searchable
            />
          </Field>
          <Field label="Account number" htmlFor="account_number">
            <Input
              id="account_number"
              name="account_number"
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={withLookup ? 10 : 20}
              placeholder="0123456789"
              value={number}
              onChange={(e) => {
                setNumber(e.target.value.replace(/\D/g, "").slice(0, withLookup ? 10 : 20));
                setLookup({ state: "idle" });
              }}
            />
          </Field>

          {withLookup ? (
            <div aria-live="polite">
              {lookup.state === "loading" && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden /> Finding the account name…
                </p>
              )}
              {lookup.state === "found" && (
                <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-brand-200">
                  <BadgeCheck className="size-5 shrink-0 text-brand-600" aria-hidden />
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase">Account name</p>
                    <p className="font-bold text-ink">{lookup.name}</p>
                  </div>
                </div>
              )}
              {lookup.state === "error" && <FormMessage>{lookup.message}</FormMessage>}
              {lookup.state === "idle" && (
                <p className="text-sm text-muted">We&apos;ll fill in the account name from your bank.</p>
              )}
            </div>
          ) : (
            <Field label="Account name" htmlFor="account_name" hint="As it appears on receipts.">
              <Input id="account_name" name="account_name" required maxLength={100} placeholder="MAMA TEE KITCHEN" />
            </Field>
          )}

          <FormMessage>{state.error}</FormMessage>
          <div className="flex gap-2">
            <SubmitButton pendingText="Adding…" disabled={!bankName || (withLookup && lookup.state !== "found")}>
              Add account
            </SubmitButton>
            {accounts.length > 0 && (
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)} className="self-start">
          <Plus className="size-4" aria-hidden /> Add another account
        </Button>
      )}
    </div>
  );
}
