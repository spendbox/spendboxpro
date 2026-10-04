"use client";

import { useState } from "react";
import { JoinWizard } from "@/components/join/join-wizard";
import { Button, ButtonLink } from "@/components/ui/button";

export function JoinPanel({
  state,
  slug,
  refCode,
  businessName,
  businessId,
  brandColor,
  logoUrl,
}: {
  state: "signed-out" | "signed-in" | "member" | "owner";
  slug: string;
  refCode: string | null;
  businessName: string;
  businessId: string;
  brandColor: string;
  logoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-bold">Join {businessName}</h2>
        <p className="mt-1 text-sm text-muted">{state === "signed-in" ? "One question, and it's added to your Spendbox." : "A few quick questions, one at a time."}</p>
      </div>
      <Button size="lg" block onClick={() => setOpen(true)}>
        Join {businessName}
      </Button>
      <JoinWizard
        open={open}
        onClose={() => setOpen(false)}
        signedIn={state === "signed-in"}
        slug={slug}
        refCode={refCode}
        business={{ name: businessName, brand_color: brandColor, logo_url: logoUrl }}
      />
    </div>
  );
}
