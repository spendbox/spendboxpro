"use client";

import { useEffect } from "react";
import { cleanInviteCode, INVITED_BY_COOKIE } from "@/lib/invite";

/** Remembers who sent a business here (?by=CODE) for 30 days, until it signs up. */
export function RememberInviter() {
  useEffect(() => {
    const code = cleanInviteCode(new URLSearchParams(window.location.search).get("by"));
    if (code) document.cookie = `${INVITED_BY_COOKIE}=${code}; Max-Age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`;
  }, []);
  return null;
}
