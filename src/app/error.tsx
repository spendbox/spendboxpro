"use client";

import { Recovering } from "@/components/recovering";

// Something on the page broke (usually a dropped connection on mobile data): a calm
// "reconnecting" screen that gets the player back in by itself (src/components/recovering.tsx).
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <Recovering error={error} retry={retry} where="Page" />;
}
