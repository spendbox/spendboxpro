"use client";

import { useRouter } from "next/navigation";
import { PhoneOtpForm } from "@/components/auth/phone-otp-form";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  return (
    <PhoneOtpForm
      allowSignup={false}
      verifyLabel="Log in"
      onVerified={async () => {
        router.replace(next ?? "/go");
        router.refresh();
      }}
    />
  );
}
