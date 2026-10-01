"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteAccount, type FormState } from "../actions";

export function DeleteAccount({ ownsBusiness }: { ownsBusiness: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(deleteAccount, {});
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete my Spendbox
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your Spendbox?"
        description="This permanently removes your phone number, details, receipts, perks and every membership. It can't be undone."
      >
        <form action={action} className="flex flex-col gap-4">
          {ownsBusiness && (
            <FormMessage>Your business, its customers and its perks will be deleted too.</FormMessage>
          )}
          <Field label="Type DELETE to confirm" htmlFor="confirm">
            <Input id="confirm" name="confirm" autoComplete="off" autoCapitalize="characters" />
          </Field>
          <FormMessage>{state.error}</FormMessage>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <SubmitButton variant="danger" pendingText="Deleting…">
              Delete permanently
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
