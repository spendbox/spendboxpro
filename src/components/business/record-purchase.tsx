"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { recordPurchase, type FormState } from "@/app/dashboard/[bizId]/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

/** Add a purchase paid in cash or by card, so it counts toward the customer's perks. */
export function RecordPurchase({
  bizId,
  members,
  fixedMember,
  currency,
  variant = "primary",
}: {
  bizId: string;
  members: { id: string; label: string }[];
  fixedMember?: { id: string; label: string };
  currency: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await recordPurchase(bizId, prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, {});

  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} disabled={!fixedMember && members.length === 0}>
        <Plus className="size-4" aria-hidden /> Record a purchase
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a purchase"
        description="For customers who paid cash or by card. It counts toward their perks straight away."
      >
        <form action={action} className="flex flex-col gap-4">
          {fixedMember ? (
            <input type="hidden" name="membership_id" value={fixedMember.id} />
          ) : (
            <Field label="Customer" htmlFor="membership_id">
              <Select id="membership_id" name="membership_id" required defaultValue="">
                <option value="" disabled>
                  Choose a customer
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {fixedMember && <p className="font-semibold">{fixedMember.label}</p>}
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
          <SubmitButton size="lg" block pendingText="Saving…">
            Add purchase
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
