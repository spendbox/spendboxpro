"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { claimSessionFromPayment } from "./actions";

/** Signs the advertiser in on this device (once), and links to their ad page. */
export function ManageButton({ reference }: { reference: string }) {
  const router = useRouter();
  const claim = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (!claim.current) claim.current = claimSessionFromPayment(reference).catch(() => false);
  }, [reference]);
  return (
    <Link
      href="/advertiser"
      onClick={async (e) => {
        if (!claim.current) return;
        e.preventDefault();
        await claim.current;
        router.push("/advertiser");
      }}
      className="block rounded-xl bg-gold px-4 py-3 text-center font-semibold text-ink"
    >
      Manage your ad
    </Link>
  );
}
