"use client";

import { FlaskConical } from "lucide-react";
import { useState, useTransition } from "react";
import { sendTestPayment } from "@/app/dashboard/[bizId]/bank-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

/** Try the whole flow before the bank connection is live: pretend a transfer just came in. */
export function TestPayment({ bizId }: { bizId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-col gap-3 border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <FlaskConical className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Testing mode</p>
        <p className="text-sm text-muted">Pretend a customer just sent you a transfer, and see what Spendbox does with it. No real money moves.</p>
      </div>
      <Button variant="soft" onClick={() => { setResult(null); setOpen(true); }}>
        Send a test payment
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send a test payment"
        description="Type the name exactly as the customer's bank shows it. You'll find it on their Profile, under Name."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await sendTestPayment(bizId, { name, account, amount });
              setResult(r.error ? { tone: "error", text: r.error } : { tone: "success", text: r.message ?? "Sent." });
              if (!r.error) setAmount("");
            });
          }}
        >
          <Field label="Name on the paying account" htmlFor="test-name">
            <Input id="test-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Adebayo Tolulope" autoComplete="off" />
          </Field>
          <Field label="Their account number" htmlFor="test-account" optional>
            <Input id="test-account" value={account} onChange={(e) => setAccount(e.target.value)} inputMode="numeric" maxLength={10} placeholder="10 digits" />
          </Field>
          <Field label="Amount sent" htmlFor="test-amount">
            <Input id="test-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 5000" />
          </Field>
          {result && <FormMessage tone={result.tone}>{result.text}</FormMessage>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
            <Button type="submit" loading={pending}>
              Send test payment
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
