"use client";

import { useRouter } from "next/navigation";
import { EmailSignIn } from "@/components/auth/email-sign-in";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  return (
    <EmailSignIn
      allowSignup={false}
      submitLabel="Log in"
      onSignedIn={async () => {
        router.replace(next ?? "/go");
        router.refresh();
      }}
    />
  );
}
