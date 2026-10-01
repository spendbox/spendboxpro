import { formatDate } from "@/lib/format";
import { timeLeft } from "@/lib/perks";
import { cn } from "@/lib/cn";

/** How long a customer has left to use a perk, as a shrinking bar. */
export function TimeLeft({
  issuedAt,
  expiresAt,
  tone = "light",
  className,
}: {
  issuedAt: string;
  expiresAt: string | null;
  /** "light" sits on a coloured card, "dark" on white. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const left = timeLeft(issuedAt, expiresAt);
  if (!left || !expiresAt) {
    return <p className={cn("text-xs font-semibold", tone === "light" ? "text-white/90" : "text-muted", className)}>No time limit</p>;
  }
  const label = left.daysLeft === 0 ? "Last day to use it" : left.daysLeft === 1 ? "1 day left" : `${left.daysLeft} days left`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className={cn("flex items-center justify-between gap-2 text-xs font-semibold", tone === "light" ? "text-white" : "text-ink-2")}>
        <span>{label}</span>
        <span className={tone === "light" ? "text-white/90" : "text-muted"}>Use by {formatDate(expiresAt)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} to use this perk`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(left.fraction * 100)}
        className={cn("h-1.5 overflow-hidden rounded-full", tone === "light" ? "bg-white/25" : "bg-line")}
      >
        <div
          className={cn(
            "h-full rounded-full",
            tone === "light" ? (left.urgent ? "bg-[#FFD8C2]" : "bg-white") : left.urgent ? "bg-accent-600" : "bg-brand-600",
          )}
          style={{ width: `${Math.max(4, left.fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}
