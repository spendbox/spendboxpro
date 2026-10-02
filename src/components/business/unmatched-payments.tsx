"use client";

import { CircleHelp, LoaderCircle, UserRoundCheck } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { memberOptions } from "@/app/dashboard/[bizId]/actions";
import { assignPayment, ignorePayment, type BankResult } from "@/app/dashboard/[bizId]/bank-actions";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Field, FormMessage } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { formatMoney, formatWhen } from "@/lib/format";

export interface UnmatchedPayment {
  id: string;
  amount: number;
  currency: string;
  paid_at: string;
  narration: string | null;
  sender_name: string | null;
  bank_label: string | null;
}

function titleCase(name: string) {
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function WhoPaid({ bizId, payment, onClose }: { bizId: string; payment: UnmatchedPayment | null; onClose: () => void }) {
  const [members, setMembers] = useState<ComboOption[] | null>(null);
  const [member, setMember] = useState<string | null>(null);
  const [always, setAlways] = useState(false);
  const [result, setResult] = useState<BankResult | null>(null);
  const [busy, setBusy] = useState<"assign" | "ignore" | null>(null);
  const [pending, startTransition] = useTransition();
  const open = payment !== null;

  useEffect(() => {
    if (!open) return;
    let live = true;
    void memberOptions(bizId).then((options) => live && setMembers(options));
    return () => {
      live = false;
    };
  }, [open, bizId]);

  const close = () => {
    setMember(null);
    setAlways(false);
    setResult(null);
    onClose();
  };

  const run = (kind: "assign" | "ignore", work: () => Promise<BankResult>) => {
    setBusy(kind);
    startTransition(async () => {
      const r = await work();
      setBusy(null);
      if (r.ok) close();
      else setResult(r);
    });
  };

  const sender = payment?.sender_name ? titleCase(payment.sender_name) : null;
  return (
    <Modal
      open={open}
      onClose={close}
      title="Who paid this?"
      description={
        payment
          ? `${formatMoney(payment.amount, payment.currency)} from ${sender ?? "an unknown sender"}, ${formatWhen(payment.paid_at)}.`
          : undefined
      }
    >
      {payment && (
        <div className="flex flex-col gap-4">
          {payment.narration && (
            <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm break-words text-ink-2">
              <span className="font-semibold text-ink">Bank note: </span>
              {payment.narration}
            </p>
          )}
          <Field
            label="Customer"
            htmlFor="who-paid-member"
            hint={sender ? `Next time ${sender} pays, it counts for this customer by itself.` : undefined}
          >
            {members === null ? (
              <div className="flex h-12 items-center gap-2 rounded-xl border border-line-strong px-3.5 text-sm text-muted">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading customers…
              </div>
            ) : (
              <Combobox
                id="who-paid-member"
                options={members}
                value={member}
                onChange={setMember}
                searchable
                placeholder={members.length ? "Find a customer" : "No customers yet"}
                searchPlaceholder="Name, member number or phone"
                emptyText="No customer matches. Check the member number on their pass."
                disabled={members.length === 0}
              />
            )}
          </Field>
          <FormMessage>{result?.error}</FormMessage>
          <Button
            size="lg"
            block
            disabled={!member || pending}
            loading={busy === "assign"}
            onClick={() => member && run("assign", () => assignPayment(bizId, payment.id, member))}
          >
            {busy !== "assign" && <UserRoundCheck className="size-4" aria-hidden />} Count it for this customer
          </Button>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted">Not from a customer, like money you moved yourself?</p>
            {sender && (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-600"
                  checked={always}
                  onChange={(e) => setAlways(e.target.checked)}
                />
                Always skip payments from {sender}
              </label>
            )}
            <Button
              variant="secondary"
              disabled={pending}
              loading={busy === "ignore"}
              onClick={() => run("ignore", () => ignorePayment(bizId, payment.id, always))}
            >
              Not a customer
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Money that came into the bank that Spendbox couldn't match to a member. */
export function UnmatchedPayments({ bizId, payments }: { bizId: string; payments: UnmatchedPayment[] }) {
  const [picked, setPicked] = useState<UnmatchedPayment | null>(null);
  if (payments.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="who-paid-title">
      <SectionTitle
        title={<span id="who-paid-title">Who paid this?</span>}
        description="We couldn't tell who sent these. Pick the customer once — after that, their payments count by themselves."
      />
      <Card className="px-5">
        <ul className="divide-y divide-line">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
                  <CircleHelp className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{p.sender_name ? titleCase(p.sender_name) : "Sender not shown"}</p>
                  <p className="truncate text-sm text-muted">
                    {formatWhen(p.paid_at)}
                    {p.bank_label ? ` · Into ${p.bank_label}` : ""}
                  </p>
                  {p.narration && <p className="truncate text-xs text-subtle">{p.narration}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="text-lg font-semibold text-ink">{formatMoney(p.amount, p.currency)}</span>
                <Button size="sm" onClick={() => setPicked(p)}>
                  Choose customer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <WhoPaid bizId={bizId} payment={picked} onClose={() => setPicked(null)} />
    </section>
  );
}
