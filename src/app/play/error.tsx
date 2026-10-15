"use client";

import { Recovering } from "@/components/recovering";

// If something in the game screen fails (a dropped connection, the app being updated while you
// play), it gets the player back in by itself (src/components/recovering.tsx).
export default function PlayError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <Recovering error={error} retry={retry} where="Game screen" />;
}
