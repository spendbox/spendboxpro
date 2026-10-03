"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { resetPassword } from "@/lib/actions/email-auth";
import { MIN_PASSWORD } from "@/lib/password";

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="success">Saved. Log in with your new password.</FormMessage>
        <ButtonLink href="/login" size="lg" block>
          Log in
        </ButtonLink>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await resetPassword(token, password);
          if (r.ok) setDone(true);
          else setError(r.error);
        });
      }}
    >
      <Field label="New password" htmlFor="new-password" hint={`At least ${MIN_PASSWORD} characters.`}>
        <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <FormMessage>{error}</FormMessage>
      <Button type="submit" size="lg" block loading={pending} disabled={password.length < MIN_PASSWORD}>
        Save new password
      </Button>
      {error && (
        <Link href="/auth/forgot" className="text-sm font-semibold text-brand-700 underline underline-offset-2">
          Send me a new link
        </Link>
      )}
    </form>
  );
}
