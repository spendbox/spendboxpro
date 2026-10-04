"use client";

import { useRouter } from "next/navigation";
import { EmailSignIn } from "@/components/auth/email-sign-in";

export function SignupForm({ next }: { next: string | null }) {
  const router = useRouter();
  return (
    <EmailSignIn
      allowSignup
      submitLabel="Create my Spendbox"
      onSignedIn={async () => {
        router.replace(next ?? "/go");
        router.refresh();
      }}
    />
  );
}
