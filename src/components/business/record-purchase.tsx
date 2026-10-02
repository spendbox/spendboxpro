"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { memberOptions, recordPurchase, type FormState } from "@/app/dashboard/[bizId]/actions";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

/** The form itself, in a pop-up. Used by the button below and the floating action button. */
export function RecordPurchaseModal({
  bizId,
  currency,
  fixedMember,
  open,
  onClose,
}: {
  bizId: string;
  currency: string;
  fixedMember?: { id: string; label: string };
  open: boolean;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<ComboOption[] | null>(null);
  const [member, setMember] = useState<string | null>(fixedMember?.id ?? null);
  const [state, action] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await recordPurchase(bizId, prev, formData);
    if (result.ok) {
      onClose();
      if (!fixedMember) setMember(null);
    }
    return result;
  }, {});

  // Load the customer list each time the form opens, so new members show up.
  useEffect(() => {
    if (!open || fixedMember) return;
    let live = true;
    void memberOptions(bizId).then((options) => live && setMembers(options));
    return () => {
      live = false;
    };
  }, [open, fixedMember, bizId]);

  const today = new Date().toISOString().slice(0, 10);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a purchase"
      description="For cash and card payments. It counts toward their perks straight away. If they paid by transfer, it's linked when it shows up in your bank, so it isn't counted twice."
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="membership_id" value={member ?? ""} />
        {fixedMember ? (
          <p className="font-semibold">{fixedMember.label}</p>
        ) : (
          <Field label="Customer" htmlFor="purchase-member">
            {members === null ? (
              <div className="flex h-12 items-center gap-2 rounded-xl border border-line-strong px-3.5 text-sm text-muted">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading customers…
              </div>
            ) : (
              <Combobox
                id="purchase-member"
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
        )}
        <Field label={`Amount (${currency})`} htmlFor="amount">
          <Input id="amount" name="amount" inputMode="decimal" required placeholder="5000" />
        </Field>
        <Field label="What did they buy?" htmlFor="description" optional>
          <Input id="description" name="description" maxLength={200} placeholder="e.g. Jollof rice and chicken" />
        </Field>
        <Field label="Date" htmlFor="paid_on">
          <Input id="paid_on" name="paid_on" type="date" defaultValue={today} max={today} />
        </Field>
        <FormMessage>{state.error}</FormMessage>
        <SubmitButton size="lg" block pendingText="Saving…" disabled={!member}>
          Add purchase
        </SubmitButton>
      </form>
    </Modal>
  );
}

/** "Record a purchase" button that opens the form. */
export function RecordPurchase({
  bizId,
  fixedMember,
  currency,
  variant = "primary",
}: {
  bizId: string;
  fixedMember?: { id: string; label: string };
  currency: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Record a purchase
      </Button>
      <RecordPurchaseModal bizId={bizId} currency={currency} fixedMember={fixedMember} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
