"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { adminLogin, type LoginState } from "./actions";

export function AdminLoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(adminLogin, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="admin-email">
        <Input id="admin-email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className="h-12" />
      </Field>
      <Field label="Password" htmlFor="admin-password">
        <Input id="admin-password" name="password" type="password" autoComplete="current-password" required autoFocus={Boolean(state.email)} className="h-12" />
      </Field>
      <FormMessage>{state.error}</FormMessage>
      <SubmitButton size="lg" block>
        Log in
      </SubmitButton>
    </form>
  );
}
