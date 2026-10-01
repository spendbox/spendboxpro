"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteBusiness, type FormState } from "../actions";

export function DeleteBusiness({ bizId, name }: { bizId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(deleteBusiness.bind(null, bizId), {});
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} className="self-start">
        Delete business
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${name}?`}
        description="This removes the business, its perks, customer list and payments for good. Your link stops working."
      >
        <form action={action} className="flex flex-col gap-4">
          <Field label={`Type “${name}” to confirm`} htmlFor="confirm-name">
            <Input id="confirm-name" name="confirm" autoComplete="off" />
          </Field>
          <FormMessage>{state.error}</FormMessage>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="danger" pendingText="Deleting…">
              Delete for good
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
