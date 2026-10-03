"use client";

import { BadgeCheck, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { addMyBankAccount, bankOptions, lookupMyAccount } from "@/app/me/account-actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormMessage, Input } from "@/components/ui/field";

type Lookup = { state: "idle" } | { state: "loading" } | { state: "found"; name: string } | { state: "error"; message: string };

/**
 * Pick a bank, type the account number, and the bank's name for it appears
 * ("Is this you?"). Saving adds it as an account you pay from.
 */
export function BankAccountForm({
  submitLabel = "Yes, this is me",
  onAdded,
}: {
  submitLabel?: string;
  onAdded: (name: string) => void;
}) {
  const [options, setOptions] = useState<{ verified: boolean; banks: { name: string; code: string }[] } | null>(null);
  const [bank, setBank] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [typedName, setTypedName] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lookupId = useRef(0);

  useEffect(() => {
    let live = true;
    void bankOptions().then((o) => live && setOptions(o));
    return () => {
      live = false;
    };
  }, []);

  const verified = options?.verified ?? false;
  const picked = options?.banks.find((b) => (verified ? b.code : b.name) === bank) ?? null;

  // Look the name up as soon as there's a bank and 10 digits.
  const check = (nextBank: string | null, nextNumber: string) => {
    const id = ++lookupId.current;
    if (!verified || !nextBank || !/^\d{10}$/.test(nextNumber)) {
      setLookup({ state: "idle" });
      return;
    }
    setLookup({ state: "loading" });
    void lookupMyAccount(nextBank, nextNumber).then((r) => {
      if (id !== lookupId.current) return;
      setLookup(r.ok && r.name ? { state: "found", name: r.name } : { state: "error", message: r.error ?? "We couldn't find that account." });
    });
  };

  const save = () => {
    setError(null);
    if (!picked) return setError("Which bank is it?");
    startTransition(async () => {
      const result = await addMyBankAccount({
        bankCode: verified ? picked.code : "",
        bankName: picked.name,
        accountNumber: number,
        typedName,
      });
      if (result.error) setError(result.error);
      else onAdded(result.name ?? "");
    });
  };

  if (!options) {
    return (
      <div className="flex h-12 items-center gap-2 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading banks…
      </div>
    );
  }

  const ready = verified ? lookup.state === "found" : Boolean(picked && /^\d{10}$/.test(number) && typedName.trim().includes(" "));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save();
      }}
    >
      <Field label="Bank" htmlFor="my-bank">
        <Combobox
          id="my-bank"
          options={options.banks.map((b) => ({ value: verified ? b.code : b.name, label: b.name }))}
          value={bank}
          onChange={(v) => {
            setBank(v);
            check(v, number);
          }}
          searchable
          placeholder="Choose your bank"
          searchPlaceholder="Search banks, e.g. OPay"
        />
      </Field>
      <Field label="Account number" htmlFor="my-account-number">
        <Input
          id="my-account-number"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="10 digits"
          value={number}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 10);
            setNumber(v);
            check(bank, v);
          }}
          className="h-14 text-lg tracking-wider"
        />
      </Field>

      {verified ? (
        <div aria-live="polite">
          {lookup.state === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Checking with your bank…
            </p>
          )}
          {lookup.state === "found" && (
            <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
              <BadgeCheck className="size-6 shrink-0 text-brand-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-brand-900/80">Your bank says this account belongs to</p>
                <p className="font-display text-lg font-bold break-words text-brand-900">{lookup.name}</p>
              </div>
            </div>
          )}
          {lookup.state === "error" && <FormMessage>{lookup.message}</FormMessage>}
        </div>
      ) : (
        <Field label="Name on the account" htmlFor="my-account-name" hint="Exactly as your bank shows it.">
          <Input id="my-account-name" autoComplete="name" maxLength={100} value={typedName} onChange={(e) => setTypedName(e.target.value)} />
        </Field>
      )}

      <FormMessage>{error}</FormMessage>
      <Button type="submit" size="lg" block disabled={!ready || pending} loading={pending}>
        {verified ? submitLabel : "Add this account"}
      </Button>
    </form>
  );
}
