"use client";

import { Landmark, Plus, Trash } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BankAccount } from "@/lib/types";
import { addBankAccount, removeBankAccount, type FormState } from "../actions";

const BANKS = [
  "Access Bank", "Carbon", "Ecobank", "FairMoney", "FCMB", "Fidelity Bank", "First Bank", "Globus Bank",
  "GTBank", "Heritage Bank", "Jaiz Bank", "Keystone Bank", "Kuda", "Moniepoint", "OPay", "PalmPay",
  "Polaris Bank", "Providus Bank", "Stanbic IBTC", "Standard Chartered", "Sterling Bank", "Titan Trust Bank",
  "UBA", "Union Bank", "Unity Bank", "VFD Microfinance Bank", "Wema Bank", "Zenith Bank",
];

export function BankAccounts({ bizId, accounts }: { bizId: string; accounts: BankAccount[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [adding, setAdding] = useState(accounts.length === 0);
  const [state, action] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addBankAccount(bizId, prev, formData);
    if (result.ok) {
      formRef.current?.reset();
      setAdding(false);
    }
    return result;
  }, {});
  const [pending, startTransition] = useTransition();

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
                disabled={pending}
                className="text-red-700"
                aria-label={`Remove ${a.bank_name} ${a.account_number}`}
                onClick={() => startTransition(() => removeBankAccount(bizId, a.id))}
              >
                <Trash className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {state.ok && state.message && <FormMessage tone="success">{state.message}</FormMessage>}

      {adding ? (
        <form ref={formRef} action={action} className="flex flex-col gap-4 rounded-2xl bg-canvas p-4">
          <Field label="Bank" htmlFor="bank_name">
            <Input id="bank_name" name="bank_name" list="banks" required maxLength={60} placeholder="e.g. Moniepoint" />
            <datalist id="banks">
              {BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Account number" htmlFor="account_number">
              <Input id="account_number" name="account_number" inputMode="numeric" required maxLength={20} placeholder="0123456789" />
            </Field>
            <Field label="Account name" htmlFor="account_name" hint="As it appears on receipts.">
              <Input id="account_name" name="account_name" required maxLength={100} placeholder="MAMA TEE KITCHEN" />
            </Field>
          </div>
          <FormMessage>{state.error}</FormMessage>
          <div className="flex gap-2">
            <SubmitButton pendingText="Adding…">Add account</SubmitButton>
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
