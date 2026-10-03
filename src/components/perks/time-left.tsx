import { CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/** When a perk must be used by, as a plain date ("Use by 17 Oct"), or "No time limit". */
export function TimeLeft({
  expiresAt,
  tone = "light",
  className,
}: {
  /** Kept for callers that pass it; only the use-by date is shown. */
  issuedAt?: string;
  expiresAt: string | null;
  /** "light" sits on a coloured card, "dark" on white. */
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs font-semibold",
        tone === "light" ? "text-white/90" : "text-muted",
        className,
      )}
    >
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      {expiresAt ? `Use by ${formatDate(expiresAt, { withYear: true })}` : "No time limit"}
    </p>
  );
}
