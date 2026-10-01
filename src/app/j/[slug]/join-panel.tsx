"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { PhoneOtpForm } from "@/components/auth/phone-otp-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { joinBusiness } from "./actions";

export function JoinPanel({
  state,
  slug,
  refCode,
  businessName,
  businessId,
}: {
  state: "signed-out" | "signed-in" | "member" | "owner";
  slug: string;
  refCode: string | null;
  businessName: string;
  businessId: string;
}) {
  const [share, setShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (state === "member") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">You&apos;re a member</h2>
          <p className="mt-1 text-sm text-muted">{businessName} is already in your Spendbox.</p>
        </div>
        <ButtonLink href={`/me/b/${slug}`} size="lg" block>
          Open {businessName}
        </ButtonLink>
      </div>
    );
  }

  if (state === "owner") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">This is your business</h2>
          <p className="mt-1 text-sm text-muted">
            This is the page your customers see. Share the link so they can join.
          </p>
        </div>
        <ButtonLink href={`/dashboard/${businessId}`} size="lg" block>
          Go to your dashboard
        </ButtonLink>
      </div>
    );
  }

  const shareChoice = (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-canvas p-3.5 text-sm">
      <input
        type="checkbox"
        checked={share}
        onChange={(e) => setShare(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-brand-600"
      />
      <span>
        <span className="font-semibold text-ink">Share my details with {businessName}</span>
        <span className="block text-muted">Your name, phone and birthday. You can change this any time.</span>
      </span>
    </label>
  );

  if (state === "signed-in") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">Join {businessName}</h2>
          <p className="mt-1 text-sm text-muted">One tap — it&apos;s added to your Spendbox.</p>
        </div>
        {shareChoice}
        <FormMessage>{error}</FormMessage>
        <Button
          size="lg"
          block
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const message = await joinBusiness(slug, refCode, share);
              if (message) setError(message);
            })
          }
        >
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Join {businessName}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-bold">Join with your phone number</h2>
        <p className="mt-1 text-sm text-muted">We&apos;ll send you a code to confirm it&apos;s you.</p>
      </div>
      <PhoneOtpForm
        allowSignup
        sendLabel="Send me a code"
        verifyLabel={`Join ${businessName}`}
        note={shareChoice}
        onVerified={() => joinBusiness(slug, refCode, share)}
      />
    </div>
  );
}
