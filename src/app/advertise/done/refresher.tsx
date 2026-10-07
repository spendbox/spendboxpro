"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Checks again every few seconds (for up to about 5 minutes). */
export function Refresher({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (tries > Math.ceil(300 / seconds)) clearInterval(id);
      else router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return <p className="text-xs text-muted">Checking again automatically…</p>;
}
