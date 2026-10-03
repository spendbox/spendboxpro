"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { requestPasswordReset } from "@/lib/actions/email-auth";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await requestPasswordReset(email);
          setResult(r.ok ? { tone: "success", text: r.message ?? "Sent." } : { tone: "error", text: r.error });
        });
      }}
    >
      <Field label="Email" htmlFor="forgot-email">
        <Input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {result && <FormMessage tone={result.tone}>{result.text}</FormMessage>}
      <Button type="submit" size="lg" block loading={pending} disabled={!email.trim()}>
        Send me a link
      </Button>
    </form>
  );
}
