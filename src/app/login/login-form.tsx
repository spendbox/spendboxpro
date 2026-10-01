"use client";

import { useRouter } from "next/navigation";
import { PhoneSignIn } from "@/components/auth/phone-sign-in";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  return (
    <PhoneSignIn
      allowSignup={false}
      submitLabel="Log in"
      onSignedIn={async () => {
        router.replace(next ?? "/go");
        router.refresh();
      }}
    />
  );
}
