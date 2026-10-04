"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendVerification } from "@/lib/actions/email-auth";

export function ResendVerification() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (message) return <p className="max-w-40 text-xs font-semibold sm:max-w-56">{message}</p>;
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await resendVerification();
          setMessage(r.ok ? (r.message ?? "Sent.") : r.error);
        })
      }
    >
      Resend
    </Button>
  );
}
